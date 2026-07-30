/**
 * 라우터 모듈
 * 사이드바 내비게이션과 SPA 페이지 전환 관리
 */

const Router = (function() {
    let currentPage = 'dashboard';
    const modules = {};
    const PAGE_STATE_KEY = 'mes_last_page';
    const SIDEBAR_STATE_KEY = 'mes_sidebar_hidden';
    const SIDEBAR_EXPANDED_KEY = 'mes_sidebar_user_expanded';
    const SIDEBAR_WIDTH_KEY = 'mes_sidebar_live_width';

    // ── Lazy 번들 ─────────────────────────────────────────────────────────
    // _lazyBundles: src → { src, loaded, loading, onLoad, pending }
    // _lazyPageMap: pageId → bundle
    const _lazyBundles = {};
    const _lazyPageMap = {};

    function registerLazy(pageIds, src, onLoadFn) {
        if (!_lazyBundles[src]) {
            _lazyBundles[src] = { src: src, loaded: false, loading: false, onLoad: onLoadFn, pending: null };
        }
        var bundle = _lazyBundles[src];
        pageIds.forEach(function(id) { _lazyPageMap[id] = bundle; });
    }

    function _loadScriptOnce(src) {
        return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = function() { reject(new Error('모듈 로드 실패: ' + src)); };
            document.head.appendChild(s);
        });
    }

    function _showLazySpinner(pageName) {
        var ca = document.getElementById('contentArea');
        if (!ca) return;
        ca.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;gap:16px;color:var(--text-muted);">'
            + '<span class="material-symbols-outlined" style="font-size:40px;animation:spin 1s linear infinite;">refresh</span>'
            + '<span style="font-size:0.95rem;">' + (PAGE_TITLES[pageName] || pageName) + ' 모듈 로딩 중...</span>'
            + '</div>';
    }

    const PAGE_TITLES = {
        'dashboard': '대시보드',
        'production-plan': '생산 계획 지시서',
        'overtime-plan': '연장근무계획',
        'injection-incoming': '사출 입고',
        'paint-incoming-inspection': '도료 입고',
        'incoming-overview': '수입검사',
        'inj-incoming-std': '사출 수입검사 기준서',
        'paint-incoming-std': '도료 수입검사 기준서',
        'inj-insp-std-photo': '수입검사 표준서',
        'warehouse-overview': '자재 창고',
        'injection-process': '사출 공정',
        'injection-work': '사출 작업일지',
        'raw-material-inventory': '원재료입출고',
        'injection-warehouse': '사출창고 (입출고/재고현황)',
        'paint-inventory': '도료창고 (입출고/재고현황)',
        'injection-layout': '보관창고 레이아웃',
        'injection-wip': '사출 재공품 현황',
        'injection-room-layout': '사출실 레이아웃',
        'painting-process': '도장 작업',
        'painting-input': '도장 투입 자재',
        'painting-input-a': '도장-A 자재',
        'painting-input-b': '도장-B 자재',
        'painting-work': '도장-A 작업',
        'painting-work-a': '도장-A 작업',
        'painting-work-b': '도장-B 작업',
        'painting-inspection': '도장작업',
        'painting-quality-performance': '도장품 실적',
        'laser-process': '레이저 작업',
        'laser-wip': '재공품 현황',
        'laser-standby': '레이져대기품현황',
        'laser-work': '레이져 작업일지',
        'laser-inspection': '외관 검사 일지',
        'laser-layout': '레이져 레이아웃',
        'laser-jig-master': '레이져 지그대장',
        'laser-jig-disposal': '폐기 대장',
        'laser-jig-cleaning': '지그 세척일지',
        'laser-equipment-history': '레이져 장비 점검/수리 내역',
        'shipping-overview': '출하검사',
        'shipping-standby': '출하검사(외관)',
        'shipping-inspection': '출하검사 일지',
        'shipping-reliability': '출하검사(신뢰성)',
        'shipping-periodic-reli': '신뢰성정기검사',
        'shipping-certificate': '출하성적서 발행',
        'shipping-standard': '출하검사 기준서',
        'shipping-std-photo': '출하검사 표준서',
        'product-warehouse': '제품창고',
        'product-outgoing': '제품 출고',
        'sales-delivery': '출고 등록',
        'sales-delivery-plan': '영업 계획',
        'sales-today-shipment': '납품 출하(금일)',
        'sales-analytics': '영업관리',
        'painting-jig': '도장지그',
        'jig-management': '도장 JIG 수명 현황',
        'jig-life-standard': '도장 지그 수명 관리 기준서',
        'jig-master': '도장 지그 대장',
        'jig-disposal': '지그 폐기 대장',
        'jig-cleaning': '세척 이력',
        'jig-change-history': '교체 이력',
        'jig-repair-history': '지그수리/개선 이력',
        'jig-layout': '지그창고 레이아웃',
        'prod-standards': '제조 관리 표준',
        'work-standard': '작업표준서',
        'robot-pg-std': '레이져 프로그램 기준서',
        'drying-std':   '건조 및 셋팅룸 온도 기준서',
        'customer-return-nc-std': '고객 반송품 부적합품 처리 기준서',
        'prod-conditions': '작업조건 관리',
        'paint-mix': '배합작업',
        'prod-sub-materials': '부자재 관리',
        'prod-equipment': '설비관리',
        'five-s': '3정5S 관리',
        'prod-quality': '초중종물 관리',
        'quality-performance': '품질 실적',
        'improvement-activity': '개선활동',
        'limit-samples': '한도 견본',
        'prod-spc': 'SPC 관리',
        'spc-color': '색차 SPC',
        'spc-film': '도막두께 SPC',
        'spc-gloss': '광택 SPC',
        'certifications-mgmt': '자격인증 관리',
        'safety-hub': '안전관리',
        'safety-standard': '안전관리 표준서',
        'safety-msds': 'MSDS 등록대장',
        'safety-checklist': '안전관리 점검표',
        'safety-ppe': '보호구 적용기준',
        'safety-rules': '안전수칙 기준서',
        'fire-facility-check': '소방시설 점검',
        'fire-ext-check': '소화기 점검',
        'fire-edu': '소방 안전 교육',
        'cert-standard': '자격인증 및 다기능 평가 기준서',
        'cert-eval': '자격인증 평가서',
        'cert-ledger': '자격인증 평가 관리대장',
        'cert-multiskill-eval': '작업자 다기능 평가서',
        'cert-multiskill-analysis': '작업자 다기능 분석표',
        'gauge-rr-variable': '계량형 게이지 R&R 관리대장',
        'gauge-rr-attribute': '계수형 GAUGE R&R 평가서',
        'cert-status': '자격인증 현황',
        'inspectors-mgmt': '검사자 관리',
        'operators-mgmt': '작업자 관리',
        'settings': '관리 / 설정'
    };

    function buildBackLink(targetPage, label) {
        return `<button class="topbar-back-link" onclick="Router.navigate('${targetPage}')"><span class="material-symbols-outlined">arrow_back</span> ${label}</button>`;
    }

    const PAGE_PARENT_LINKS = {
        'injection-incoming':        { target: 'incoming-overview', label: '수입검사로 돌아가기' },
        'paint-incoming-inspection': { target: 'incoming-overview', label: '수입검사로 돌아가기' },
        'inj-incoming-std':          { target: 'incoming-overview', label: '수입검사로 돌아가기' },
        'paint-incoming-std':        { target: 'incoming-overview', label: '수입검사로 돌아가기' },
        'inj-insp-std-photo':        { target: 'incoming-overview', label: '수입검사로 돌아가기' },

        'injection-warehouse': { target: 'warehouse-overview', label: '자재 창고로 돌아가기' },
        'paint-inventory': { target: 'warehouse-overview', label: '자재 창고로 돌아가기' },
        'injection-layout': { target: 'warehouse-overview', label: '자재 창고로 돌아가기' },
        'painting-input': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-input-a': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-input-b': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-work-a': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-work-b': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-inspection': { target: 'painting-process', label: '도장 작업으로 돌아가기' },
        'painting-rework-wip': { target: 'painting-process', label: '도장 작업으로 돌아가기' },

        'injection-work': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'raw-material-inventory': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'injection-wip': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'injection-room-layout': { target: 'injection-process', label: '사출 공정으로 돌아가기' },

        'laser-standby': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-wip': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-work': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-inspection': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-layout': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-jig-master': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-jig-disposal': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-jig-cleaning': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },
        'laser-equipment-history': { target: 'laser-process', label: '레이저 작업으로 돌아가기' },

        'shipping-standby': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'shipping-inspection': { target: 'shipping-standby', label: '출하검사(외관)으로 돌아가기' },
        'shipping-reliability': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'shipping-periodic-reli': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'shipping-certificate': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'shipping-standard': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'shipping-std-photo': { target: 'shipping-overview', label: '출하검사 현황으로 돌아가기' },
        'product-outgoing': { target: 'product-warehouse', label: '제품창고로 돌아가기' },
        'painting-quality-performance': { target: 'quality-performance', label: '품질 실적으로 돌아가기' },
        'jig-management': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-life-standard': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-master': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-disposal': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-cleaning': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-change-history': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-repair-history': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-layout': { target: 'painting-jig', label: '도장지그로 돌아가기' },

        'spc-color': { target: 'prod-spc', label: 'SPC 관리로 돌아가기' },
        'spc-film': { target: 'prod-spc', label: 'SPC 관리로 돌아가기' },
        'spc-gloss': { target: 'prod-spc', label: 'SPC 관리로 돌아가기' },

        'prod-standards': { target: 'dashboard', label: '메인 페이지' },
        'work-standard': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'robot-pg-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'drying-std':   { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'customer-return-nc-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },

        'cert-standard': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'cert-eval': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'cert-ledger': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'cert-multiskill-eval': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'cert-multiskill-analysis': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'gauge-rr-variable': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'gauge-rr-attribute': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'cert-status': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'inspectors-mgmt': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'operators-mgmt': { target: 'certifications-mgmt', label: '자격인증 관리로 돌아가기' },
        'safety-standard': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'safety-msds': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'safety-checklist': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'safety-ppe': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'safety-rules': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'fire-facility-check': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'fire-ext-check': { target: 'safety-hub', label: '안전관리로 돌아가기' },
        'fire-edu': { target: 'safety-hub', label: '안전관리로 돌아가기' }
    };

    const PAGE_TITLE_HTML = Object.fromEntries(
        Object.entries(PAGE_PARENT_LINKS).map(function(entry) {
            return [entry[0], buildBackLink(entry[1].target, entry[1].label)];
        })
    );

    function init() {
        setupNavigation();
        setupTopbarPermissionInspector();
        setupSidebarTooltips();
        setupMobileMenu();
        setupSidebarToggle();
        setupSidebarExpandControls();
        updateDateTime();
        setInterval(updateDateTime, 60000);

        const user = (typeof AuthModule !== 'undefined') ? AuthModule.getCurrentUser() : null;
        const lastPage = (() => {
            try { return sessionStorage.getItem(PAGE_STATE_KEY) || 'dashboard'; } catch (e) { return 'dashboard'; }
        })();
        navigate(user ? lastPage : 'dashboard');
    }

    function registerModule(name, moduleObj) {
        modules[name] = moduleObj;
    }

    function setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(function(item) {
            item.addEventListener('click', function() {
                const page = item.dataset.page;
                navigate(page);
            });
        });
    }

    function injectTopbarPermissionInspector() {
        const badge = document.getElementById('topbarUserBadge');
        if (!badge) return;
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser || !AuthModule.getCurrentUser()) return;
        if (typeof AuthModule.openPageRolePermissionWindow !== 'function') return;

        let tools = badge.querySelector('.topbar-permission-tools');
        if (!tools) {
            tools = document.createElement('div');
            tools.className = 'topbar-permission-tools';
            const mailButton = badge.querySelector('button[onclick="AuthModule.openInboxModal()"]');
            if (mailButton) mailButton.insertAdjacentElement('beforebegin', tools);
            else badge.appendChild(tools);
        }

        const pageId = (typeof Router !== 'undefined' && Router.getCurrentPage) ? Router.getCurrentPage() : '';
        const roleKeys = (typeof AuthModule.getCurrentUser === 'function' && AuthModule.getCurrentUser())
            ? (function() {
                const u = AuthModule.getCurrentUser();
                const rows = Array.isArray(u.roles) ? u.roles.slice() : [];
                if (u.role) rows.push(u.role);
                return [...new Set(rows.map(String).filter(Boolean))];
            })()
            : [];
        const canAccess = !pageId || (typeof AuthModule.isPageAccessGranted === 'function'
            && AuthModule.isPageAccessGranted(roleKeys, pageId));
        const canWrite = !pageId || (typeof AuthModule.canWritePage === 'function'
            && AuthModule.canWritePage(pageId));
        const canAdjust = !pageId || (typeof AuthModule.canAdjustPage === 'function'
            && AuthModule.canAdjustPage(pageId));

        const accessBadge = `<span class="topbar-perm-status ${canAccess ? 'is-ok' : 'is-deny'}" title="현재 페이지 내 접근 권한">접근 ${canAccess ? '✓' : '✗'}</span>`;
        const writeBadge = `<span class="topbar-perm-status ${canWrite ? 'is-ok' : 'is-deny'}" title="현재 페이지 내 입력·등록 권한">입력 ${canWrite ? '✓' : '✗'}</span>`;
        const adjustBadge = `<span class="topbar-perm-status ${canAdjust ? 'is-ok' : 'is-deny'}" title="현재 페이지 내 수정/보정 권한">수정/보정 ${canAdjust ? '✓' : '✗'}</span>`;

        const html = accessBadge + writeBadge + adjustBadge
            + '<button type="button" class="topbar-permission-link" onclick="AuthModule.openPageRolePermissionWindow(\'access\')" title="이 페이지 접근 가능 역할 보기">역할별 접근</button>'
            + '<button type="button" class="topbar-permission-link" onclick="AuthModule.openPageRolePermissionWindow(\'write\')" title="이 페이지 입력 가능 역할 보기">역할별 입력</button>'
            + '<button type="button" class="topbar-permission-link" onclick="AuthModule.openPageRolePermissionWindow(\'adjust\')" title="이 페이지 수정/보정 가능 역할 보기">역할별 수정/보정</button>';

        if (tools.getAttribute('data-perm-html') === html) return;
        tools.setAttribute('data-perm-html', html);
        tools.innerHTML = html;
    }

    function setupTopbarPermissionInspector() {
        const badge = document.getElementById('topbarUserBadge');
        if (!badge || badge.dataset.permissionInspectorBound === '1') return;
        badge.dataset.permissionInspectorBound = '1';
        injectTopbarPermissionInspector();
    }

    function setupSidebarTooltips() {
        const navItems = document.querySelectorAll('.nav-item');
        if (!navItems.length) return;

        let tooltip = document.getElementById('sidebarNavTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'sidebarNavTooltip';
            tooltip.className = 'sidebar-nav-tooltip';
            document.body.appendChild(tooltip);
        }

        const getLabel = (item) => {
            const labelEl = item.querySelector('.nav-label');
            return labelEl ? labelEl.textContent.trim() : '';
        };

        const shouldShow = () => {
            const sidebar = document.getElementById('sidebar');
            return sidebar && !sidebar.classList.contains('user-expanded') && (sidebar.classList.contains('collapsed') || window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches);
        };

        const showTooltip = (item) => {
            const label = item.dataset.tooltip || getLabel(item);
            if (!label || !shouldShow()) return;
            const rect = item.getBoundingClientRect();
            tooltip.textContent = label;
            tooltip.classList.add('visible');
            tooltip.style.left = (rect.right + 10) + 'px';
            tooltip.style.top = (rect.top + rect.height / 2) + 'px';
        };

        const hideTooltip = () => {
            tooltip.classList.remove('visible');
        };

        navItems.forEach(function(item) {
            const label = getLabel(item);
            if (!label) return;
            item.dataset.tooltip = label;
            item.title = label;
            item.setAttribute('aria-label', label);
            item.addEventListener('mouseenter', function() { showTooltip(item); });
            item.addEventListener('focus', function() { showTooltip(item); });
            item.addEventListener('mouseleave', hideTooltip);
            item.addEventListener('blur', hideTooltip);
        });

        window.addEventListener('scroll', hideTooltip, true);
        window.addEventListener('resize', hideTooltip);
    }

    function navigate(pageName) {
        // ── Lazy 번들: 아직 로드 안 된 모듈 ─────────────────────────────
        if (!modules[pageName] && _lazyPageMap[pageName]) {
            var bundle = _lazyPageMap[pageName];
            if (bundle.loading) {
                bundle.pending = pageName;  // 마지막 요청 페이지로 업데이트
                return;
            }
            bundle.loading = true;
            bundle.pending = pageName;
            _showLazySpinner(pageName);
            _loadScriptOnce(bundle.src).then(function() {
                bundle.loaded = true;
                bundle.loading = false;
                bundle.onLoad();
                var target = bundle.pending;
                bundle.pending = null;
                navigate(target);
            }).catch(function(err) {
                bundle.loading = false;
                console.error('[Router] lazy load 실패:', err);
                var ca = document.getElementById('contentArea');
                if (ca) ca.innerHTML = '<div class="empty-state">'
                    + '<span class="material-symbols-outlined" style="color:var(--accent-red);">error</span>'
                    + '<h4>모듈 로드 오류</h4><p>' + err.message + '</p>'
                    + '<button class="btn btn-primary" onclick="Router.navigate(\'' + pageName + '\')">다시 시도</button>'
                    + '</div>';
            });
            return;
        }

        if (!modules[pageName]) pageName = 'dashboard';

        if (pageName === 'settings') {
            AuthModule.checkSettingsAuth(function() {
                _doNavigate('settings');
            });
            return;
        }

        _doNavigate(pageName);
    }

    const LAYOUT_BACK_KEY = 'mes_layout_back';
    const LAYOUT_BACK_TARGETS = {
        'product-warehouse': { target: 'product-warehouse', label: '완제품 창고로 돌아가기' },
        'injection-warehouse': { target: 'injection-warehouse', label: '사출 자재로 돌아가기' },
        'warehouse-overview': { target: 'warehouse-overview', label: '자재 창고로 돌아가기' }
    };

    function _getLayoutBackConfig() {
        try {
            const key = sessionStorage.getItem(LAYOUT_BACK_KEY);
            if (key && LAYOUT_BACK_TARGETS[key]) return LAYOUT_BACK_TARGETS[key];
        } catch (e) {}
        return LAYOUT_BACK_TARGETS['warehouse-overview'];
    }

    function _sidebarHighlightPage(pageName) {
        if (pageName === 'painting-work' || pageName === 'painting-work-a' || pageName === 'painting-work-b'
            || pageName === 'painting-input' || pageName === 'painting-input-a' || pageName === 'painting-input-b'
            || pageName === 'painting-inspection' || pageName === 'painting-rework-wip'
            || pageName === 'painting-quality-performance' || pageName === 'painting-process') {
            if (document.querySelector('.nav-item[data-page="painting-process"]')) return 'painting-process';
        }
        if (pageName === 'painting-work') return 'painting-work-a';
        if (pageName === 'injection-layout') {
            const cfg = _getLayoutBackConfig();
            if (document.querySelector('.nav-item[data-page="' + cfg.target + '"]')) {
                return cfg.target;
            }
        }
        let current = pageName;
        const visited = new Set();
        while (PAGE_PARENT_LINKS[current] && !visited.has(current)) {
            visited.add(current);
            const target = PAGE_PARENT_LINKS[current].target;
            if (document.querySelector('.nav-item[data-page="' + target + '"]')) {
                return target;
            }
            current = target;
        }
        return pageName;
    }

    function _doNavigate(pageName) {
        currentPage = pageName;
        try { sessionStorage.setItem(PAGE_STATE_KEY, pageName); } catch (e) {}

        const navHighlight = _sidebarHighlightPage(pageName);
        document.querySelectorAll('.nav-item').forEach(function(item) {
            item.classList.toggle('active', item.dataset.page === navHighlight);
        });

        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) {
            let titleHtml = PAGE_TITLE_HTML[pageName] || PAGE_TITLES[pageName] || pageName;
            if (pageName === 'injection-layout') {
                const cfg = _getLayoutBackConfig();
                titleHtml = buildBackLink(cfg.target, cfg.label);
            }
            pageTitleEl.innerHTML = titleHtml;
        }

        clearTopbarCenter();

        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');

        renderModule(pageName);

        // 페이지 변경 시 topbar 권한 배지 갱신
        if (typeof AuthModule !== 'undefined' && AuthModule.updateTopbar) {
            AuthModule.updateTopbar();
        } else {
            injectTopbarPermissionInspector();
        }
    }

    // 접근(access) 권한 정의: 로그인한 사용자의 역할이 이 페이지에 접근 권한이 없으면
    // 페이지를 아예 렌더링하지 않는다. 비로그인 사용자는 기존 설계대로 전 페이지 조회 가능
    // (매트릭스는 "로그인한 특정 역할을 제한"하는 용도이지 익명 조회를 막는 용도가 아니다).
    function _isPageAccessBlocked(pageName) {
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser || !AuthModule.canAccessPage) return false;
        const user = AuthModule.getCurrentUser();
        if (!user) return false;
        return !AuthModule.canAccessPage(pageName);
    }

    function renderModule(pageName) {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        if (_isPageAccessBlocked(pageName)) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined" style="color:var(--accent-red);">lock</span>
                    <h4>접근 권한이 없습니다</h4>
                    <p>현재 계정의 역할에는 이 페이지에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.</p>
                </div>
            `;
            return;
        }

        if (modules[pageName] && typeof modules[pageName].render === 'function') {
            contentArea.innerHTML = '';
            try {
                modules[pageName].render(contentArea);
            } catch (err) {
                console.error(`[${pageName}] render error:`, err);
                contentArea.innerHTML = `
                    <div class="empty-state">
                        <span class="material-symbols-outlined" style="color:var(--accent-red);">error</span>
                        <h4>페이지 로드 오류</h4>
                        <p style="color:var(--accent-red);">${err.message}</p>
                        <button class="btn btn-primary" onclick="Router.navigate('${pageName}')">다시 시도</button>
                    </div>
                `;
            }
        } else {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">construction</span>
                    <h4>${PAGE_TITLES[pageName] || pageName}</h4>
                    <p>준비 중입니다.</p>
                </div>
            `;
        }
    }

    function setupMobileMenu() {
        const btn = document.getElementById('mobileMenuBtn');
        if (!btn) return;
        btn.addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
        });
    }

    function setupSidebarExpandControls() {
        const sidebar = document.getElementById('sidebar');
        const expandBtn = document.getElementById('sidebarExpandBtn');
        const resizer = document.getElementById('sidebarResizer');
        if (!sidebar) return;

        const isTabletLayout = () => window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches;
        const clampWidth = (width) => {
            const numeric = Number(width) || 250;
            return Math.max(190, Math.min(360, numeric));
        };

        let expanded = false;
        let dragging = false;

        try {
            expanded = sessionStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1';
        } catch (e) {
            expanded = false;
        }

        const applyWidth = (width) => {
            const resolved = clampWidth(width);
            document.documentElement.style.setProperty('--sidebar-live-width', resolved + 'px');
            try {
                sessionStorage.setItem(SIDEBAR_WIDTH_KEY, String(resolved));
            } catch (e) {}
        };

        const updateExpandButton = () => {
            if (!expandBtn) return;
            const icon = expandBtn.querySelector('.material-symbols-outlined');
            expandBtn.classList.toggle('active', expanded);
            expandBtn.title = expanded ? '메뉴 폭 줄이기' : '메뉴 확장';
            expandBtn.setAttribute('aria-label', expanded ? '메뉴 폭 줄이기' : '메뉴 확장');
            if (icon) icon.textContent = expanded ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right';
        };

        const applyExpandedState = () => {
            const allowExpanded = isTabletLayout() && !document.body.classList.contains('sidebar-hidden');
            sidebar.classList.toggle('user-expanded', allowExpanded && expanded);
            if (!isTabletLayout()) {
                sidebar.classList.remove('user-expanded');
            }
            updateExpandButton();
        };

        try {
            applyWidth(sessionStorage.getItem(SIDEBAR_WIDTH_KEY));
        } catch (e) {
            applyWidth(250);
        }
        applyExpandedState();

        if (expandBtn) {
            expandBtn.addEventListener('click', function() {
                expanded = !expanded;
                try {
                    sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, expanded ? '1' : '0');
                } catch (e) {}
                applyExpandedState();
            });
        }

        if (resizer) {
            resizer.addEventListener('mousedown', function(event) {
                if (!isTabletLayout()) return;
                dragging = true;
                expanded = true;
                try {
                    sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, '1');
                } catch (e) {}
                applyExpandedState();
                event.preventDefault();
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'ew-resize';
            });
        }

        const onDragMove = (event) => {
            if (!dragging) return;
            applyWidth(event.clientX);
            applyExpandedState();
        };

        const stopDragging = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', stopDragging);
        window.addEventListener('resize', applyExpandedState);
    }

    function setupSidebarToggle() {
        const hideBtn = document.getElementById('sidebarToggle');
        const showBtn = document.getElementById('sidebarShowBtn');
        const setHidden = (hidden) => {
            document.body.classList.toggle('sidebar-hidden', hidden);
            try { sessionStorage.setItem(SIDEBAR_STATE_KEY, hidden ? '1' : '0'); } catch(e) {}
            const sidebar = document.getElementById('sidebar');
            if (sidebar && hidden) {
                sidebar.classList.remove('user-expanded');
            }
            window.dispatchEvent(new Event('resize'));
        };
        try {
            setHidden(sessionStorage.getItem(SIDEBAR_STATE_KEY) === '1');
        } catch(e) {
            setHidden(false);
        }
        if (hideBtn) {
            hideBtn.title = '메뉴 숨기기';
            hideBtn.setAttribute('aria-label', '메뉴 숨기기');
            hideBtn.addEventListener('click', function() {
                setHidden(true);
            });
        }
        if (showBtn) {
            showBtn.addEventListener('click', function() {
                setHidden(false);
            });
        }
    }

    function updateDateTime() {
        const currentDate = document.getElementById('currentDate');
        if (!currentDate) return;

        const now = new Date();
        const week = ['일', '월', '화', '수', '목', '금', '토'];
        currentDate.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${week[now.getDay()]}`;
    }

    function getCurrentPage() {
        return currentPage;
    }

    function hasModule(pageName) {
        return !!modules[pageName];
    }

    function setPageTitle(html) {
        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) pageTitleEl.innerHTML = html || '';
    }

    function clearTopbarCenter() {
        const el = document.getElementById('topbarCenter');
        if (!el) return;
        el.innerHTML = '';
        el.style.display = 'none';
    }

    function setTopbarCenter(html) {
        const el = document.getElementById('topbarCenter');
        if (!el) return;
        el.innerHTML = html || '';
        el.style.display = html ? 'flex' : 'none';
    }

    return {
        init: init,
        registerModule: registerModule,
        registerLazy: registerLazy,
        navigate: navigate,
        renderModule: renderModule,
        getCurrentPage: getCurrentPage,
        hasModule: hasModule,
        setPageTitle: setPageTitle,
        setTopbarCenter: setTopbarCenter,
        clearTopbarCenter: clearTopbarCenter,
        refreshTopbarPermissions: injectTopbarPermissionInspector
    };
})();

if (typeof window !== 'undefined') {
    window.Router = Router;
}
