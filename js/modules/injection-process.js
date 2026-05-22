/**
 * 사출 공정 메인
 * - 사출 작업일지 / 금형 교체 이력 / 원재료 변경이력 / 월간 스케쥴 / 원재료입출고
 */
var InjectionProcessModule = (function () {
    const WORK_LOG_STORE = DB.STORES.INJECTION_WORK_LOG;
    const MOLD_STORE = DB.STORES.MOLD_CHANGE_LOG;
    const RAW_CHANGE_STORE = DB.STORES.RAW_MAT_CHANGE_LOG;
    const RAW_INV_STORE = DB.STORES.RAW_MATERIAL_INVENTORY;

    function _count(store) {
        try { return (Storage.getAll(store) || []).length; } catch { return 0; }
    }

    function _goWorkTab(tab) {
        try { sessionStorage.setItem('injectionWorkTab', tab); } catch {}
        Router.navigate('injection-work');
    }

    function _card(title, desc, icon, count, action, tone) {
        return `
            <button type="button" onclick="${action}" class="submodule-card submodule-card-${tone || 'blue'}"
                style="text-align:left;border:1px solid var(--border);background:var(--bg-card);border-radius:12px;
                       padding:22px;box-shadow:var(--shadow-sm);cursor:pointer;min-height:132px;
                       display:flex;flex-direction:column;gap:12px;transition:all .15s;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <span class="material-symbols-outlined"
                        style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;
                               background:rgba(59,130,246,.12);color:var(--accent-blue);font-size:24px;">${icon}</span>
                    <span style="font-size:.82rem;color:var(--text-muted);font-weight:700;">${count}</span>
                </div>
                <div>
                    <div style="font-size:1.02rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${title}</div>
                    <div style="font-size:.86rem;color:var(--text-muted);line-height:1.45;">${desc}</div>
                </div>
            </button>
        `;
    }

    function render(container) {
        const workCount = _count(WORK_LOG_STORE);
        const moldCount = _count(MOLD_STORE);
        const rawChangeCount = _count(RAW_CHANGE_STORE);
        const rawInvCount = _count(RAW_INV_STORE);

        container.innerHTML = `
            <div class="fade-in-up">
                <div class="section-card" style="padding:0;overflow:hidden;">
                    <div style="padding:22px 24px;border-bottom:1px solid var(--border);">
                        <h3 style="margin:0 0 6px;font-size:1.15rem;">사출 공정</h3>
                        <p style="margin:0;color:var(--text-muted);font-size:.9rem;">
                            작업일지, 금형 교체, 원재료 변경, 월간 스케쥴과 원재료 입출고를 한 화면에서 선택합니다.
                        </p>
                    </div>
                    <div style="padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;">
                        ${_card('사출 작업일지', '사출 생산 실적과 작업 조건을 기록합니다.', 'settings_suggest', `${workCount}건`, "InjectionProcessModule.goWorkTab('worklog')", 'blue')}
                        ${_card('금형 교체 이력', '금형 교체 실적과 예정 이력을 관리합니다.', 'construction', `${moldCount}건`, "InjectionProcessModule.goWorkTab('mold')", 'orange')}
                        ${_card('원재료 변경이력', '원재료 변경 전후 정보와 변경 사유를 기록합니다.', 'inventory_2', `${rawChangeCount}건`, "InjectionProcessModule.goWorkTab('rawmat')", 'green')}
                        ${_card('월간 스케쥴', '금형 교체와 원재료 변경 계획을 월간으로 확인합니다.', 'calendar_month', '월간', "InjectionProcessModule.goWorkTab('schedule')", 'purple')}
                        ${_card('원재료입출고', '원재료 입고, 출고, 재고 현황을 관리합니다.', 'warehouse', `${rawInvCount}건`, "Router.navigate('raw-material-inventory')", 'teal')}
                    </div>
                </div>
            </div>
        `;
    }

    return {
        render,
        init: render,
        goWorkTab: _goWorkTab
    };
})();
