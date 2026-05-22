/**
 * 레이져 공정 허브 (통합 뷰)
 * page: laser-process
 * 탭: 현황(대기품) / 작업일지 / 검사일지
 */
var LaserHubModule = (function () {

    const TABS = [
        { id: 'standby',     label: '레이져 대기품',    icon: 'hourglass_top' },
        { id: 'work',        label: '레이져 작업일지',  icon: 'history'       },
        { id: 'inspection',  label: '레이져 검사일지',  icon: 'fact_check'    },
    ];

    let _activeTab = 'standby';
    let _container = null;

    /* ── 탭 헤더 렌더 ─────────────────────────────────────── */
    function _renderTabBar() {
        return `
        <div style="display:flex;align-items:center;gap:0;background:var(--bg-card);
                    border-bottom:2px solid var(--border);padding:0 20px;flex-shrink:0;">
            ${TABS.map(t => `
            <button onclick="LaserHubModule.switchTab('${t.id}')"
                data-lhtab="${t.id}"
                style="display:flex;align-items:center;gap:6px;padding:12px 20px;border:none;
                       background:none;cursor:pointer;font-size:0.9rem;font-weight:600;
                       border-bottom:3px solid ${_activeTab === t.id ? 'var(--accent-blue)' : 'transparent'};
                       color:${_activeTab === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)'};
                       margin-bottom:-2px;transition:all 0.15s;white-space:nowrap;">
                <span class="material-symbols-outlined" style="font-size:18px;">${t.icon}</span>
                ${t.label}
            </button>`).join('')}
        </div>`;
    }

    /* ── 탭 콘텐츠 컨테이너 ───────────────────────────────── */
    function _renderTabContent() {
        return `<div id="laserHubContent" style="flex:1;overflow:auto;min-height:0;"></div>`;
    }

    /* ── 서브 모듈 렌더 ────────────────────────────────────── */
    function _renderSubModule() {
        const el = document.getElementById('laserHubContent');
        if (!el) return;
        if (_activeTab === 'standby')    LaserStandbyModule.render(el);
        else if (_activeTab === 'work')       LaserWorkModule.render(el);
        else if (_activeTab === 'inspection') LaserInspectionModule.render(el);
    }

    /* ── 탭 전환 ───────────────────────────────────────────── */
    function switchTab(id) {
        _activeTab = id;
        // 탭 버튼 스타일 갱신
        document.querySelectorAll('[data-lhtab]').forEach(btn => {
            const active = btn.getAttribute('data-lhtab') === id;
            btn.style.borderBottomColor  = active ? 'var(--accent-blue)' : 'transparent';
            btn.style.color              = active ? 'var(--accent-blue)' : 'var(--text-secondary)';
        });
        _renderSubModule();
    }

    /* ── 메인 렌더 ─────────────────────────────────────────── */
    function render(container) {
        _container = container;
        _activeTab = _activeTab || 'standby';

        container.innerHTML = `
        <div class="fade-in-up" style="display:flex;flex-direction:column;height:100%;min-height:0;">
            ${_renderTabBar()}
            ${_renderTabContent()}
        </div>`;

        _renderSubModule();
    }

    return {
        init: render,
        render,
        switchTab,
    };
})();
