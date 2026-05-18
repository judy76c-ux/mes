/**
 * 라우터 모듈
 * 사이드바 네비게이션과 페이지 전환 관리
 */

const Router = (function() {
    let currentPage = 'dashboard';
    const modules = {};

    // 페이지 타이틀 매핑
    const PAGE_TITLES = {
        'dashboard': '대시보드',
        'production-plan': '생산 계획 지시서',
        'injection-incoming': '사출 입고',
        'paint-incoming-inspection': '도료 입고 (수입검사)',
        'injection-work': '사출 작업일지',
        'raw-material-inventory': '원재료 자재관리 (입출고/재고현황)',
        'paint-inventory': '도료창고(입출고/재고현황)',
        'injection-warehouse': '사출창고 (입출고/재고현황)',
        'painting-work': '도장 작업일지',
        'painting-inspection': '도장 검사 일지',
        'laser-standby': '레이져 대기품',
        'laser-work': '레이져 작업일지',
        'laser-inspection': '레이져 검사일지',
        'shipping-standby': '출하검사 대기',
        'shipping-inspection': '출하검사 (검사일지)',
        'product-warehouse': '제품 창고 (재고관리)',
        'product-outgoing': '제품 출고',
        'sales-delivery': '납품관리',
        'sales-delivery-plan': '납품 계획',
        'prod-standards': '제조 관리 표준',
        'prod-conditions': '작업조건 관리',
        'paint-mix': '도료 배합 관리',
        'prod-quality': '초중종물 관리',
        'prod-equipment': '설비관리',
        'settings': '관리 / 설정',
        'incoming-overview': '수입검사',
        'warehouse-overview': '자재 창고'
    };

    const PAGE_TITLE_HTML = {
        'injection-incoming': '<button class="topbar-back-link" onclick="Router.navigate(\'incoming-overview\')"><span class="material-symbols-outlined">arrow_back</span> 수입검사로 돌아가기</button>',
        'paint-incoming-inspection': '<button class="topbar-back-link" onclick="Router.navigate(\'incoming-overview\')"><span class="material-symbols-outlined">arrow_back</span> 수입검사로 돌아가기</button>',
        'injection-warehouse': '<button class="topbar-back-link" onclick="Router.navigate(\'warehouse-overview\')"><span class="material-symbols-outlined">arrow_back</span> 자재 창고로 돌아가기</button>',
        'paint-inventory': '<button class="topbar-back-link" onclick="Router.navigate(\'warehouse-overview\')"><span class="material-symbols-outlined">arrow_back</span> 자재 창고로 돌아가기</button>'
    };

    function init() {
        setupNavigation();
        setupMobileMenu();
        setupSidebarToggle();
        updateDateTime();
        setInterval(updateDateTime, 60000);

        // 기본 페이지 또는 마지막 방문 페이지 로드
        const lastPage = localStorage.getItem('last_page') || 'dashboard';
        navigate(lastPage);
    }

    // 모듈 등록
    function registerModule(name, moduleObj) {
        modules[name] = moduleObj;
    }

    // 네비게이션 설정
    function setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                navigate(page);
            });
        });
    }

    // 페이지 전환
    function navigate(pageName) {
        if (!modules[pageName]) pageName = 'dashboard';

        /* 관리/설정 페이지는 관리자 인증 필요 */
        if (pageName === 'settings') {
            AuthModule.checkSettingsAuth(function() { _doNavigate('settings'); });
            return;
        }

        _doNavigate(pageName);
    }

    function _doNavigate(pageName) {
        currentPage = pageName;
        localStorage.setItem('last_page', pageName);

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        document.getElementById('pageTitle').innerHTML = PAGE_TITLE_HTML[pageName] || PAGE_TITLES[pageName] || pageName;
        document.getElementById('sidebar').classList.remove('mobile-open');

        renderModule(pageName);
    }

    // 모듈 렌더링을 별도 함수로 분리
    function renderModule(pageName) {
        const contentArea = document.getElementById('contentArea');
        if (modules[pageName] && typeof modules[pageName].render === 'function') {
            contentArea.innerHTML = '';
            try {
                modules[pageName].render(contentArea);
            } catch (err) {
                console.error(`[${pageName}] 렌더링 오류:`, err);
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

    // 모바일 메뉴
    function setupMobileMenu() {
        const btn = document.getElementById('mobileMenuBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('mobile-open');
            });
        }
    }

    // 사이드바 접기/펼치기
    function setupSidebarToggle() {
        const btn = document.getElementById('sidebarToggle');
        if (btn) {
            btn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('collapsed');
            });
        }
    }

    // 날짜/시간 업데이트
    function updateDateTime() {
        const el = document.getElementById('currentDate');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short'
            });
        }
    }

    // 현재 페이지 조회
    function getCurrentPage() {
        return currentPage;
    }

    return {
        init,
        registerModule,
        navigate,
        getCurrentPage,
    };
})();

/* ===================================================================
   공용 UI 유틸리티 함수
   =================================================================== */
const UIUtils = (function() {

    // 모달 스택 — 겹쳐 열린 모달 상태를 순서대로 보존
    const _modalStack = [];

    // ── 페이지네이션 콜백 레지스트리 ─────────────────────────────────
    // renderPagination() 이 등록하고 _paginate() 가 호출하는 콜백 저장소
    const _paginationCallbacks = {};

    // Enter키 + 닫기버튼 + 오버레이 클릭 핸들러 공통 설정
    function _setupModalHandlers() {
        const modal = document.getElementById('modal');
        if (modal._enterCleanup) { modal._enterCleanup(); modal._enterCleanup = null; }

        const onKeydown = (e) => {
            if (e.key !== 'Enter') return;
            const tag = (document.activeElement || {}).tagName || '';
            if (tag === 'TEXTAREA' || tag === 'SELECT') return;
            const primaryBtn = document.querySelector('#modalFooter .btn-primary');
            if (primaryBtn) { e.preventDefault(); primaryBtn.click(); }
        };
        document.addEventListener('keydown', onKeydown);
        modal._enterCleanup = () => document.removeEventListener('keydown', onKeydown);

        document.getElementById('modalCloseBtn').onclick = () => closeModal();
        // 외부 클릭으로 닫힘 방지 — X 버튼 또는 취소 버튼으로만 닫을 수 있음
        modal.onclick = null;
    }

    // 모달 body 내 폼 요소의 현재 값을 캡처 (innerHTML은 기본값만 저장해 선택/입력 상태가 소실됨)
    function _captureFormValues(bodyEl) {
        const vals = [];
        bodyEl.querySelectorAll('input, select, textarea').forEach(el => {
            if (!el.id) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                vals.push({ id: el.id, type: el.type, value: el.value, checked: el.checked });
            } else {
                vals.push({ id: el.id, type: el.type || 'text', value: el.value });
            }
        });
        return vals;
    }

    // 복원된 DOM 에 캡처했던 폼 값을 다시 적용
    function _restoreFormValues(vals) {
        if (!vals || vals.length === 0) return;
        vals.forEach(({ id, type, value, checked }) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (type === 'checkbox' || type === 'radio') {
                el.checked = !!checked;
            } else {
                el.value = value;
            }
        });
    }

    // 모달 표시 (size: '' | 'lg' | 'xl' | 'xxl')
    // 이미 모달이 열려 있으면 현재 상태를 스택에 저장 후 새 내용으로 교체
    function showModal(title, bodyHtml, footerHtml = '', size = '') {
        const modal = document.getElementById('modal');
        const container = modal.querySelector('.modal-container');

        // 현재 모달이 활성 상태면 스택에 저장
        if (modal.classList.contains('active')) {
            if (modal._enterCleanup) { modal._enterCleanup(); modal._enterCleanup = null; }
            const bodyEl = document.getElementById('modalBody');
            _modalStack.push({
                title:       document.getElementById('modalTitle').innerHTML,
                body:        bodyEl.innerHTML,
                footer:      document.getElementById('modalFooter').innerHTML,
                size:        container.classList.contains('modal-xxl') ? 'xxl'
                           : container.classList.contains('modal-xl')  ? 'xl'
                           : container.classList.contains('modal-lg')  ? 'lg' : '',
                formValues:  _captureFormValues(bodyEl)   // ← 폼 현재값 별도 보존
            });
        }

        container.classList.remove('modal-lg', 'modal-xl', 'modal-xxl');
        if (size === 'lg')  container.classList.add('modal-lg');
        if (size === 'xl')  container.classList.add('modal-xl');
        if (size === 'xxl') container.classList.add('modal-xxl');

        document.getElementById('modalTitle').innerHTML  = title;
        document.getElementById('modalBody').innerHTML   = bodyHtml;
        document.getElementById('modalFooter').innerHTML = footerHtml;
        modal.classList.add('active');

        _setupModalHandlers();
    }

    // 모달 닫기 — 스택이 있으면 이전 모달 복원, 없으면 완전히 닫기
    function closeModal() {
        const modal = document.getElementById('modal');
        if (modal._enterCleanup) { modal._enterCleanup(); modal._enterCleanup = null; }

        if (_modalStack.length > 0) {
            const prev = _modalStack.pop();
            const container = modal.querySelector('.modal-container');
            container.classList.remove('modal-lg', 'modal-xl', 'modal-xxl');
            if (prev.size === 'lg')  container.classList.add('modal-lg');
            if (prev.size === 'xl')  container.classList.add('modal-xl');
            if (prev.size === 'xxl') container.classList.add('modal-xxl');
            document.getElementById('modalTitle').innerHTML  = prev.title;
            document.getElementById('modalBody').innerHTML   = prev.body;
            document.getElementById('modalFooter').innerHTML = prev.footer;
            _restoreFormValues(prev.formValues);   // ← 폼 값 복원
            _setupModalHandlers();
        } else {
            modal.classList.remove('active');
        }
    }

    // 토스트 알림
    function toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        const toastEl = document.createElement('div');
        toastEl.className = `toast ${type}`;
        toastEl.innerHTML = `
            <span class="material-symbols-outlined">${icons[type] || 'info'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toastEl);

        // 3초 후 자동 제거
        setTimeout(() => {
            toastEl.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => toastEl.remove(), 300);
        }, 3000);
    }

    // 확인 다이얼로그
    function confirm(message, onConfirm) {
        showModal('확인', `<p>${message}</p>`, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="confirmActionBtn">확인</button>
        `);

        // 약간의 딜레이 후 이벤트 바인딩 (DOM 적용 대기)
        setTimeout(() => {
            const btn = document.getElementById('confirmActionBtn');
            if (btn) {
                btn.onclick = () => {
                    closeModal();
                    onConfirm();
                };
            }
        }, 50);
    }

    // 날짜 포맷 (YYYY-MM-DD)
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ko-KR');
    }

    // 숫자 포맷 (천 단위 콤마)
    function formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return Number(num).toLocaleString('ko-KR');
    }

    // 오늘 날짜 (YYYY-MM-DD)
    function today() {
        return new Date().toISOString().split('T')[0];
    }

    // 현재 날짜시간 (ISO 8601)
    function now() {
        return new Date().toISOString();
    }

    // 한 달 전 날짜
    function monthAgo() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    }

    // n일 전 날짜 (YYYY-MM-DD)
    function daysAgo(days) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
    }

    // 뱃지 HTML 생성
    function badge(text, type = 'info') {
        return `<span class="badge badge-${type}">${text}</span>`;
    }

    // 품목구분 배지 (carModel, partName, color로 제품 마스터 조회)
    function itemTypeBadge(carModel, partName, color) {
        const products = (typeof Storage !== 'undefined' && Storage.getAll)
            ? (Storage.getAll(DB.STORES.PRODUCTS) || []) : [];
        const p = products.find(function(pr) {
            return pr.carModel === carModel && pr.partName === partName &&
                   (!color || pr.color === color);
        });
        const t = p ? (p.itemType || '') : '';
        if (!t) return '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>';
        const styles = {
            '양산품': 'background:rgba(52,211,153,0.15);color:var(--accent-green);border:1px solid var(--accent-green);',
            '개발품': 'background:rgba(59,130,246,0.15);color:var(--accent-blue);border:1px solid var(--accent-blue);',
            'A/S품':  'background:rgba(245,158,11,0.15);color:#d97706;border:1px solid #d97706;'
        };
        const s = styles[t] || 'background:var(--bg-secondary);color:var(--text-secondary);border:1px solid var(--border);';
        return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;${s}">${t}</span>`;
    }

    /**
     * 페이지네이션 UI 렌더링
     *
     * 콜백(onChange)은 내부 레지스트리에 등록되어 onclick 속성에서 안전하게 호출됩니다.
     *
     * @param {HTMLElement} containerEl  페이지네이션을 삽입할 컨테이너 요소
     * @param {object}      options
     * @param {number}   options.total        전체 데이터 건수
     * @param {number}   options.page         현재 페이지 (1-based)
     * @param {number}   options.pageSize     현재 페이지 크기
     * @param {string}   [options.id]         콜백 식별자 (모듈별 고유값 권장, 없으면 자동 생성)
     * @param {number[]} [options.pageSizes]  선택 가능한 페이지 크기 목록 (기본: [20,50,100,200])
     * @param {Function} options.onChange     (newPage:number, newPageSize:number) => void
     *
     * @example
     *   UIUtils.renderPagination(document.getElementById('myPagination'), {
     *     total, page, pageSize,
     *     id: 'myTable',
     *     onChange: (newPage, newSize) => { _page = newPage; _pageSize = newSize; loadData(); }
     *   });
     */
    function renderPagination(containerEl, {
        total,
        page,
        pageSize,
        id         = '',
        pageSizes  = [20, 50, 100, 200],
        onChange
    }) {
        if (!containerEl) return;

        // 콜백 등록 (페이지 전환 시마다 덮어씀 → 메모리 누수 없음)
        const cbId = id ? `pg_${id}` : `pg_${Date.now().toString(36)}`;
        _paginationCallbacks[cbId] = onChange;

        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const dispStart  = total > 0 ? (page - 1) * pageSize + 1 : 0;
        const dispEnd    = Math.min(page * pageSize, total);

        // ── 페이지 번호 배열 계산 (최대 7개, 말줄임표 포함) ────────────
        function _pageNums() {
            if (totalPages <= 1) return [];
            if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
            const delta = 2;
            let lo = Math.max(2,           page - delta);
            let hi = Math.min(totalPages - 1, page + delta);
            // 앞쪽에 붙어 있으면 오른쪽 확장
            if (page - delta <= 2)         { lo = 2; hi = Math.min(totalPages - 1, 5); }
            // 뒤쪽에 붙어 있으면 왼쪽 확장
            if (page + delta >= totalPages){ hi = totalPages - 1; lo = Math.max(2, totalPages - 4); }
            const middle = [];
            for (let i = lo; i <= hi; i++) middle.push(i);
            return [
                1,
                ...(lo > 2 ? ['…'] : []),
                ...middle,
                ...(hi < totalPages - 1 ? ['…'] : []),
                totalPages
            ];
        }

        // ── 버튼 스타일 헬퍼 ─────────────────────────────────────────
        const btnBase = [
            'display:inline-flex;align-items:center;justify-content:center;',
            'min-width:30px;height:30px;padding:0 7px;',
            'border-radius:6px;font-size:0.8rem;',
            'transition:background 0.15s,border-color 0.15s,color 0.15s;',
            'cursor:pointer;'
        ].join('');

        function _btn({ label, page: p, size: s, active = false, disabled = false }) {
            const border = active
                ? 'border:1px solid var(--accent-blue);'
                : 'border:1px solid var(--border-color);';
            const bg    = active ? 'background:var(--accent-blue);' : 'background:transparent;';
            const color = active ? 'color:#fff;' : 'color:var(--text-primary);';
            const op    = disabled ? 'opacity:0.35;cursor:default;' : '';
            return `<button
                        style="${btnBase}${border}${bg}${color}${op}"
                        onclick="UIUtils._paginate('${cbId}',${p},${s})"
                        ${active || disabled ? 'disabled' : ''}
                    >${label}</button>`;
        }

        // 페이지 번호 버튼들
        const numBtns = _pageNums().map(p =>
            p === '…'
                ? `<span style="color:var(--text-muted);line-height:30px;padding:0 4px;font-size:0.82rem;">…</span>`
                : _btn({ label: p, page: p, size: pageSize, active: p === page })
        ).join('');

        // 페이지 크기 옵션
        const sizeOpts = pageSizes.map(s =>
            `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}건</option>`
        ).join('');

        containerEl.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        flex-wrap:wrap;gap:8px;padding:10px 16px;
                        border-top:1px solid var(--border-color);
                        background:var(--bg-secondary);border-radius:0 0 8px 8px;
                        font-size:0.82rem;color:var(--text-muted);">
                <!-- 좌: 건수 표시 -->
                <span>
                    총 <strong style="color:var(--text-primary);">${total.toLocaleString()}</strong>건
                    ${total > 0 ? `<span style="color:var(--text-muted);">&nbsp;(${dispStart.toLocaleString()}–${dispEnd.toLocaleString()})</span>` : ''}
                </span>
                <!-- 중: 페이지 버튼 -->
                <div style="display:flex;align-items:center;gap:3px;">
                    ${_btn({ label: '◀', page: Math.max(1, page - 1), size: pageSize, disabled: page <= 1 })}
                    ${numBtns}
                    ${_btn({ label: '▶', page: Math.min(totalPages, page + 1), size: pageSize, disabled: page >= totalPages })}
                </div>
                <!-- 우: 페이지 크기 선택 -->
                <label style="display:flex;align-items:center;gap:6px;">
                    <span>페이지당</span>
                    <select
                        onchange="UIUtils._paginate('${cbId}', 1, Number(this.value))"
                        style="height:30px;padding:0 8px;border-radius:6px;
                               border:1px solid var(--border-color);
                               background:var(--bg-primary);color:var(--text-primary);
                               font-size:0.82rem;cursor:pointer;"
                    >${sizeOpts}</select>
                </label>
            </div>`;
    }

    /**
     * 페이지네이션 버튼 onclick 핸들러 (전역 노출 필요)
     * @param {string} cbId       renderPagination 등록 시의 키
     * @param {number} page
     * @param {number} pageSize
     */
    function _paginate(cbId, page, pageSize) {
        const cb = _paginationCallbacks[cbId];
        if (typeof cb === 'function') cb(page, pageSize);
    }

    // 빈 상태 HTML
    function emptyState(icon, title, desc) {
        return `
            <div class="empty-state">
                <span class="material-symbols-outlined">${icon}</span>
                <h4>${title}</h4>
                <p>${desc}</p>
            </div>
        `;
    }

    return {
        showModal,
        closeModal,
        toast,
        confirm,
        formatDate,
        formatNumber,
        today,
        now,
        monthAgo,
        daysAgo,
        badge,
        itemTypeBadge,
        emptyState,
        renderPagination,   // 페이지네이션 UI 렌더링
        _paginate           // 페이지네이션 버튼 onclick 핸들러 (전역 노출)
    };
})();
