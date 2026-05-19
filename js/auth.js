/**
 * MES 사용자 인증 / 접근 권한 모듈 (AuthModule)
 *
 * 동작 방식:
 *  - 모든 메뉴는 로그인 없이 조회 가능
 *  - 쓰기(등록·수정·삭제) 동작은 로그인 필요
 *  - 역할 viewer 는 로그인 후에도 쓰기 불가
 *  - 전역 클릭 인터셉터로 모든 모듈에서 일괄 제어
 */
const AuthModule = (function () {
    const USERS_KEY   = 'mes_users';
    const PERMS_KEY   = 'mes_role_permissions';
    const SESSION_KEY = 'mes_current_user';

    /* ── 역할 정의 ─────────────────────────────────────────── */
    const ROLES = [
        { key: 'admin',           label: '관리자',      color: '#dc2626', bg: '#fee2e2', canWrite: true  },
        { key: 'prod_worker',     label: '생산 작업자',  color: '#2563eb', bg: '#dbeafe', canWrite: true  },
        { key: 'prod_manager',    label: '생산관리자',   color: '#d97706', bg: '#fef3c7', canWrite: true  },
        { key: 'quality_manager', label: '품질 관리자',  color: '#16a34a', bg: '#dcfce7', canWrite: true  },
        { key: 'sales_manager',   label: '영업관리자',   color: '#7c3aed', bg: '#ede9fe', canWrite: true  },
    ];

    /* ── 전체 페이지 목록 ────────────────────────────────────── */
    const ALL_PAGES = [
        { id:'dashboard',                label:'대시보드',          group:'공통' },
        { id:'incoming-overview',         label:'수입검사 현황',      group:'수입검사' },
        { id:'injection-incoming',        label:'사출 입고',          group:'수입검사' },
        { id:'paint-incoming-inspection', label:'도료 입고',          group:'수입검사' },
        { id:'warehouse-overview',        label:'자재 창고 현황',     group:'창고' },
        { id:'injection-warehouse',       label:'사출 창고',          group:'창고' },
        { id:'paint-inventory',           label:'도료 창고',          group:'창고' },
        { id:'raw-material-inventory',    label:'원재료 자재',        group:'창고' },
        { id:'injection-work',            label:'사출 작업일지',      group:'사출공정' },
        { id:'production-plan',           label:'생산 계획 지시서',   group:'도장공정' },
        { id:'painting-work',             label:'도장 작업일지',      group:'도장공정' },
        { id:'painting-inspection',       label:'도장 검사일지',      group:'도장공정' },
        { id:'paint-mix',                 label:'도료 배합 관리',     group:'도장공정' },
        { id:'laser-standby',             label:'레이져 대기품',      group:'레이져공정' },
        { id:'laser-work',                label:'레이져 작업일지',    group:'레이져공정' },
        { id:'laser-inspection',          label:'레이져 검사일지',    group:'레이져공정' },
        { id:'shipping-standby',          label:'출하검사',           group:'출하/제품' },
        { id:'product-warehouse',         label:'제품 창고',          group:'출하/제품' },
        { id:'sales-delivery',            label:'납품관리',           group:'영업' },
        { id:'sales-outsourcing',         label:'외주처관리',         group:'영업' },
        { id:'jig-management',            label:'JIG 수명 관리',      group:'생산관리' },
        { id:'prod-standards',            label:'제조 관리 표준',     group:'생산관리' },
        { id:'prod-conditions',           label:'작업조건 관리',      group:'생산관리' },
        { id:'prod-sub-materials',        label:'부자재 관리',        group:'생산관리' },
        { id:'prod-equipment',            label:'설비관리',           group:'생산관리' },
        { id:'five-s',                    label:'3정5S 관리',         group:'생산관리' },
        { id:'prod-quality',              label:'초중종물 관리',      group:'공정품질' },
        { id:'quality-performance',       label:'품질 실적',          group:'공정품질' },
        { id:'limit-samples',             label:'한도 견본',          group:'공정품질' },
        { id:'prod-spc',                  label:'SPC 관리',           group:'공정품질' },
        { id:'settings',                  label:'관리 / 설정',        group:'시스템' },
    ];

    /* ── 내부 스토리지 ───────────────────────────────────────── */
    function _getUsers() {
        try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
    }
    function _saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

    function _getPermissions() {
        try {
            const s = localStorage.getItem(PERMS_KEY);
            return s ? JSON.parse(s) : _defaultPerms();
        } catch { return _defaultPerms(); }
    }
    function _defaultPerms() {
        const all = ALL_PAGES.map(p => p.id);
        const noSettings = all.filter(id => id !== 'settings');
        return {
            admin: null,  /* 전체 접근 */

            /* 생산 작업자 — 작업일지·입고·창고 중심 */
            prod_worker: [
                'dashboard',
                'incoming-overview','injection-incoming','paint-incoming-inspection',
                'warehouse-overview','injection-warehouse','paint-inventory','raw-material-inventory',
                'injection-work',
                'production-plan','painting-work','painting-inspection','paint-mix',
                'laser-standby','laser-work','laser-inspection',
                'shipping-standby','product-warehouse',
            ],

            /* 생산관리자 — 생산 전반 + 관리 표준 (설정 제외) */
            prod_manager: noSettings,

            /* 품질 관리자 — 검사·품질 관련 전체 + 입고·출하 */
            quality_manager: [
                'dashboard',
                'incoming-overview','injection-incoming','paint-incoming-inspection',
                'warehouse-overview',
                'painting-inspection','laser-inspection',
                'shipping-standby','product-warehouse',
                'prod-standards','prod-conditions','prod-quality',
                'quality-performance','limit-samples','prod-spc',
            ],

            /* 영업관리자 — 영업·납품·제품창고 + 생산계획 조회 */
            sales_manager: [
                'dashboard',
                'production-plan',
                'shipping-standby','product-warehouse',
                'sales-delivery','sales-outsourcing',
                'incoming-overview','warehouse-overview',
            ],
        };
    }
    function _savePermissions(p) { localStorage.setItem(PERMS_KEY, JSON.stringify(p)); }

    /* ── 세션 ────────────────────────────────────────────────── */
    function getCurrentUser() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    }

    /* ── 쓰기 권한 ───────────────────────────────────────────── */
    function canWrite() {
        const user = getCurrentUser();
        if (!user) return false;
        const role = ROLES.find(r => r.key === user.role);
        return role ? role.canWrite : false;
    }

    /* ── 기본 관리자 계정 보장 ───────────────────────────────── */
    function ensureAdminUser() {
        if (_getUsers().length === 0) {
            _saveUsers([{
                id: 'user_admin_default',
                username: 'admin',
                displayName: '관리자',
                password: 'admin',
                role: 'admin',
                active: true,
                createdAt: new Date().toISOString(),
            }]);
        }
    }

    /* ── 로그인 ──────────────────────────────────────────────── */
    function doLogin(username, password) {
        const users = _getUsers();
        const user  = users.find(u => u.username === username && u.password === password && u.active !== false);
        if (user) {
            const session = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
            return { ok: true, user: session };
        }
        return { ok: false };
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        _applyWriteMode();
        _updateTopbar();
    }

    /* ── 로그인 모달 ─────────────────────────────────────────── */
    let _loginCallback = null;

    function showLoginModal(onSuccess) {
        _loginCallback = onSuccess || null;
        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;color:var(--accent-blue);">login</span> 로그인',
            `<div style="padding:4px 0 0;">
                <div class="form-group" style="margin-bottom:14px;">
                    <label class="form-label">사용자 ID</label>
                    <input type="text" class="form-input" id="loginUsername" placeholder="사용자 ID" autocomplete="off">
                </div>
                <div class="form-group" style="margin-bottom:4px;">
                    <label class="form-label">비밀번호</label>
                    <input type="password" class="form-input" id="loginPassword" placeholder="비밀번호">
                </div>
                <div id="loginError" style="color:var(--accent-red);font-size:0.84rem;margin-top:8px;display:none;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">error</span>
                    아이디 또는 비밀번호가 올바르지 않습니다.
                </div>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-top:14px;text-align:center;">
                    초기 계정: admin / admin
                </p>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" style="min-width:100px;" onclick="AuthModule._doLoginModal()">로그인</button>`
        );
        setTimeout(() => {
            const u = document.getElementById('loginUsername');
            if (u) {
                u.focus();
                ['loginUsername', 'loginPassword'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('keypress', e => { if (e.key === 'Enter') AuthModule._doLoginModal(); });
                });
            }
        }, 80);
    }

    function _doLoginModal() {
        const username = (document.getElementById('loginUsername') || {}).value || '';
        const password = (document.getElementById('loginPassword') || {}).value || '';
        const errEl    = document.getElementById('loginError');
        const result   = doLogin(username.trim(), password);
        if (result.ok) {
            UIUtils.closeModal();
            UIUtils.toast(`${result.user.displayName}님 로그인되었습니다.`, 'success');
            _applyWriteMode();
            _updateTopbar();
            if (typeof _loginCallback === 'function') { _loginCallback(); _loginCallback = null; }
        } else {
            if (errEl) errEl.style.display = 'block';
            const pwEl = document.getElementById('loginPassword');
            if (pwEl) { pwEl.value = ''; pwEl.focus(); }
        }
    }

    /* ── 전역 쓰기 차단 인터셉터 ─────────────────────────────── */
    /* 쓰기 동작 패턴 (onclick 속성) */
    const WRITE_PATTERNS = [
        /open\w*Modal\s*\(/i,
        /\.(save|add|remove|delete|edit|update|create|register)\s*\(/i,
        /Module\.(save|add|remove|delete|edit|update|open)\w*/i,
    ];
    /* 조회 전용 패턴 — 이 패턴 중 하나라도 해당하면 허용 */
    const READ_PATTERNS = [
        /filter|search|조회|switchTab|navigate|export|print|preview|close|cancel|toggle|expand/i,
        /Router\.navigate/i,
    ];
    /* 버튼 텍스트 기반 쓰기 판별 */
    const WRITE_TEXTS  = /^(등록|수정|삭제|저장|추가|입력|확인|기준 등록|행 추가|항목 추가|연결|업로드|import|완료|승인)$/;
    const READ_TEXTS   = /^(조회|검색|닫기|취소|인쇄|내보내기|확인|필터|새로고침|미리보기|전체보기|이동|선택|복사)$/;

    function _isWriteButton(btn) {
        const onclick = btn.getAttribute('onclick') || '';
        const text    = (btn.textContent || '').replace(/\s+/g, ' ').trim();

        if (READ_PATTERNS.some(p => p.test(onclick))) return false;
        if (READ_TEXTS.test(text)) return false;
        if (WRITE_PATTERNS.some(p => p.test(onclick))) return true;
        if (WRITE_TEXTS.test(text)) return true;
        return false;
    }

    function _setupInterceptor() {
        /* 쓰기 제한 비활성화 — 테스트 중 전체 허용 */
        /* 관리/설정 페이지 진입은 router.js에서 checkSettingsAuth()로 별도 처리 */
    }

    /* ── 설정 페이지 관리자 인증 ─────────────────────────────── */
    /* TODO: 테스트 완료 후 아래 주석 해제하고 onPass() 한 줄 제거 */
    function checkSettingsAuth(onPass) {
        onPass(); // 테스트 중 — 인증 없이 전체 허용
        /* 운영 시 아래 코드로 복구
        const user = getCurrentUser();
        if (user && user.role === 'admin') { onPass(); return; }
        showLoginModal(function() {
            const u = getCurrentUser();
            if (u && u.role === 'admin') { onPass(); }
            else { UIUtils.toast('관리자 계정으로 로그인해야 합니다.', 'warning'); }
        });
        */
    }

    /* ── body 쓰기 모드 CSS 클래스 ──────────────────────────── */
    function _applyWriteMode() {
        if (canWrite()) {
            document.body.classList.remove('mes-readonly');
        } else {
            document.body.classList.add('mes-readonly');
        }
    }

    /* ── topbar 사용자 배지 ──────────────────────────────────── */
    function _updateTopbar() {
        const badge = document.getElementById('topbarUserBadge');
        if (!badge) return;
        const user = getCurrentUser();
        const role = ROLES.find(r => r.key === (user ? user.role : ''));
        if (user) {
            badge.innerHTML = `
                <div class="topbar-user-icon">
                    <span class="material-symbols-outlined" style="font-size:20px;">person</span>
                </div>
                <div style="line-height:1.3;margin:0 6px;white-space:nowrap;">
                    <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${user.displayName}</div>
                    <div style="font-size:10px;color:${role ? role.color : 'var(--text-muted)'};">${role ? role.label : ''}</div>
                </div>
                <button onclick="AuthModule.logout()" title="로그아웃"
                    style="background:none;border:none;cursor:pointer;padding:3px;color:var(--text-muted);display:flex;align-items:center;flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:18px;">logout</span>
                </button>`;
        } else {
            badge.innerHTML = `
                <button onclick="AuthModule.showLoginModal()" title="로그인"
                    style="background:none;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;padding:4px 10px;display:flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:12px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">login</span> 로그인
                </button>`;
        }
    }

    /* ── 초기화 (DOM 준비 후 호출) ───────────────────────────── */
    function init() {
        _setupInterceptor();
        _applyWriteMode();
        _updateTopbar();
    }

    return {
        ROLES,
        ALL_PAGES,
        getUsers:        _getUsers,
        saveUsers:       _saveUsers,
        getPermissions:  _getPermissions,
        savePermissions: _savePermissions,
        getCurrentUser,
        canWrite,
        ensureAdminUser,
        doLogin,
        logout,
        showLoginModal,
        checkSettingsAuth,
        _doLoginModal,
        _updateTopbar,
        _applyWriteMode,
        init,
    };
})();
