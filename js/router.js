/**
 * 라우터 모듈
 * 사이드바 내비게이션과 SPA 페이지 전환 관리
 */

const Router = (function() {
    let currentPage = 'dashboard';
    const modules = {};

    const PAGE_TITLES = {
        'dashboard': '대시보드',
        'production-plan': '생산 계획 지시서',
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
        'injection-layout': '사출 레이아웃',
        'injection-wip': '사출 재공품 현황',
        'injection-room-layout': '사출실 레이아웃',
        'painting-work': '도장 작업일지',
        'painting-inspection': '도장 검사 일지',
        'painting-quality-performance': '도장품 실적',
        'laser-process': '레이져 공정',
        'laser-standby': '레이져대기품현황',
        'laser-work': '레이져 작업일지',
        'laser-inspection': '외관 검사 일지',
        'laser-layout': '레이져 레이아웃',
        'laser-jig-master': '레이져 지그대장',
        'laser-jig-disposal': '폐기 대장',
        'laser-jig-cleaning': '지그 세척일지',
        'laser-equipment-history': '레이져 장비 점검/수리 내역',
        'shipping-standby': '출하검사',
        'shipping-inspection': '출하검사 일지',
        'product-warehouse': '제품창고',
        'product-outgoing': '제품 출고',
        'sales-delivery': '출고 등록',
        'sales-delivery-plan': '납품 계획',
        'sales-analytics': '영업관리',
        'painting-jig': '도장지그',
        'jig-management': '도장 JIG 수명 현황',
        'jig-master': '도장 지그 대장',
        'jig-disposal': '지그 폐기 대장',
        'jig-cleaning': '세척 이력',
        'jig-change-history': '교체 이력',
        'jig-repair-history': '지그수리/개선 이력',
        'jig-layout': '지그창고 레이아웃',
        'prod-standards': '제조 관리 표준',
        'work-standard': '관리계획서',
        'inject-color-std': '도막두께 기준서',
        'paji-std': '색차/광택 기준서',
        'wash-consumable': '세척 소모품 기준서',
        'agit-std': '여과망 기준서',
        'remain-paint': '배합 기준서',
        'viscosity-std': '사용량 기준표',
        'robot-pg-std': '로봇 프로그램 기준서',
        'drying-std':   '건조 및 셋팅룸 온도 기준서',
        'prod-conditions': '작업조건 관리',
        'paint-mix': '배합/사용 이력',
        'prod-sub-materials': '부자재 관리',
        'prod-equipment': '설비관리',
        'five-s': '3정5S 관리',
        'prod-quality': '초중종물 관리',
        'quality-performance': '품질 실적',
        'improvement-activity': '개선활동',
        'limit-samples': '한도 견본',
        'prod-spc': 'SPC 관리',
        'certifications-mgmt': '자격인증 관리',
        'safety-hub': '안전관리',
        'safety-standard': '안전관리 표준서',
        'safety-msds': 'MSDS 등록대장',
        'safety-checklist': '안전관리 점검표',
        'safety-ppe': '보호구 적용기준',
        'safety-rules': '안전수칙 기준서',
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

        'injection-work': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'raw-material-inventory': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'injection-layout': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'injection-wip': { target: 'injection-process', label: '사출 공정으로 돌아가기' },
        'injection-room-layout': { target: 'injection-process', label: '사출 공정으로 돌아가기' },

        'laser-standby': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-work': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-inspection': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-layout': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-jig-master': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-jig-disposal': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-jig-cleaning': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },
        'laser-equipment-history': { target: 'laser-process', label: '레이져 공정으로 돌아가기' },

        'shipping-inspection': { target: 'shipping-standby', label: '출하검사로 돌아가기' },
        'product-outgoing': { target: 'product-warehouse', label: '제품창고로 돌아가기' },
        'painting-quality-performance': { target: 'quality-performance', label: '품질 실적으로 돌아가기' },
        'jig-management': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-master': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-disposal': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-cleaning': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-change-history': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-repair-history': { target: 'painting-jig', label: '도장지그로 돌아가기' },
        'jig-layout': { target: 'painting-jig', label: '도장지그로 돌아가기' },

        'work-standard': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'inject-color-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'paji-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'wash-consumable': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'agit-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'remain-paint': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'viscosity-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'robot-pg-std': { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },
        'drying-std':   { target: 'prod-standards', label: '제조 관리 표준 돌아가기' },

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
        'safety-rules': { target: 'safety-hub', label: '안전관리로 돌아가기' }
    };

    const PAGE_TITLE_HTML = Object.fromEntries(
        Object.entries(PAGE_PARENT_LINKS).map(function(entry) {
            return [entry[0], buildBackLink(entry[1].target, entry[1].label)];
        })
    );

    function init() {
        setupNavigation();
        setupMobileMenu();
        setupSidebarToggle();
        updateDateTime();
        setInterval(updateDateTime, 60000);

        const lastPage = localStorage.getItem('last_page') || 'dashboard';
        navigate(lastPage);
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

    function navigate(pageName) {
        if (!modules[pageName]) pageName = 'dashboard';

        if (pageName === 'settings') {
            AuthModule.checkSettingsAuth(function() {
                _doNavigate('settings');
            });
            return;
        }

        _doNavigate(pageName);
    }

    function _doNavigate(pageName) {
        currentPage = pageName;
        localStorage.setItem('last_page', pageName);

        document.querySelectorAll('.nav-item').forEach(function(item) {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        const pageTitleEl = document.getElementById('pageTitle');
        if (pageTitleEl) {
            pageTitleEl.innerHTML = PAGE_TITLE_HTML[pageName] || PAGE_TITLES[pageName] || pageName;
        }

        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');

        renderModule(pageName);
    }

    function renderModule(pageName) {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

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

    function setupSidebarToggle() {
        const hideBtn = document.getElementById('sidebarToggle');
        const showBtn = document.getElementById('sidebarShowBtn');
        const storageKey = 'mes_sidebar_hidden';
        const setHidden = (hidden) => {
            document.body.classList.toggle('sidebar-hidden', hidden);
            try { localStorage.setItem(storageKey, hidden ? '1' : '0'); } catch(e) {}
        };
        try {
            setHidden(localStorage.getItem(storageKey) === '1');
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

    return {
        init: init,
        registerModule: registerModule,
        navigate: navigate,
        renderModule: renderModule,
        getCurrentPage: getCurrentPage
    };
})();
