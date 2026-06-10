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
    const MESSAGES_KEY = 'mes_internal_messages_v1';
    const POPUP_STATE_PREFIX = 'mes_inbox_popup_seen_';
    const AUTH_USERS_CONFIG_KEY = 'auth_users';
    const AUTH_PERMS_CONFIG_KEY = 'auth_role_permissions';
    const AUTH_MESSAGES_CONFIG_KEY = 'auth_internal_messages';
    let _usersCache = null;
    let _permissionsCache = null;
    let _messagesCache = null;

    /* ── 역할 정의 ─────────────────────────────────────────── */
    const ROLES = [
        { key: 'admin',           label: '관리자',         color: '#dc2626', bg: '#fee2e2', canWrite: true },
        { key: 'prod_worker',     label: '생산 작업자',    color: '#2563eb', bg: '#dbeafe', canWrite: true },
        { key: 'prod_manager',    label: '생산관리자',     color: '#d97706', bg: '#fef3c7', canWrite: true },
        { key: 'quality_manager', label: '품질 관리자',    color: '#16a34a', bg: '#dcfce7', canWrite: true },
        { key: 'sales_manager',   label: '영업관리자',     color: '#7c3aed', bg: '#ede9fe', canWrite: true },
        { key: 'paint_line_op',   label: '도장라인운영자', color: '#0369a1', bg: '#e0f2fe', canWrite: true },
        { key: 'self_inspector',  label: '자주검사자',     color: '#059669', bg: '#d1fae5', canWrite: true },
        { key: 'laser_op',        label: '레이져운영자',   color: '#6d28d9', bg: '#ddd6fe', canWrite: true },
        { key: 'laser_inspector', label: '레이져검사자',   color: '#9333ea', bg: '#fae8ff', canWrite: true },
        { key: 'injection_op',    label: '사출운영자',     color: '#c2410c', bg: '#ffedd5', canWrite: true },
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
        { id:'raw-material-inventory',    label:'원재료입출고',       group:'사출공정' },
        { id:'injection-process',         label:'사출 공정',          group:'사출공정' },
        { id:'injection-work',            label:'사출 작업일지',      group:'사출공정' },
        { id:'production-plan',           label:'생산 계획 지시서',   group:'도장공정' },
        { id:'painting-work',             label:'도장 작업일지',      group:'도장공정' },
        { id:'painting-inspection',       label:'도장 검사일지',      group:'도장공정' },
        { id:'paint-mix',                 label:'도료 배합 관리',     group:'도장공정' },
        { id:'laser-standby',             label:'레이져 대기품',      group:'레이져공정' },
        { id:'laser-work',                label:'레이져 작업일지',    group:'레이져공정' },
        { id:'laser-inspection',          label:'레이져 검사일지',    group:'레이져공정' },
        { id:'laser-jig-master',          label:'레이져 지그대장',    group:'레이져공정' },
        { id:'laser-jig-disposal',        label:'폐기 대장',          group:'레이져공정' },
        { id:'laser-jig-cleaning',        label:'지그 세척일지',      group:'레이져공정' },
        { id:'shipping-standby',          label:'출하검사',           group:'출하/제품' },
        { id:'product-warehouse',         label:'제품 창고',          group:'출하/제품' },
        { id:'sales-delivery-plan',       label:'납품 계획',          group:'영업' },
        { id:'sales-delivery',            label:'출고 등록',          group:'영업' },
        { id:'sales-analytics',           label:'영업관리(매출분석)', group:'영업' },
        { id:'sales-outsourcing',         label:'외주처관리',         group:'영업' },
        { id:'painting-jig',              label:'도장지그',           group:'생산관리' },
        { id:'jig-management',            label:'JIG 수명 관리',      group:'생산관리' },
        { id:'jig-master',                label:'도장 지그 대장',     group:'생산관리' },
        { id:'jig-disposal',              label:'지그 폐기 대장',     group:'생산관리' },
        { id:'jig-cleaning',              label:'세척 이력',          group:'생산관리' },
        { id:'jig-change-history',        label:'교체 이력',          group:'생산관리' },
        { id:'jig-repair-history',        label:'지그수리/개선 이력', group:'생산관리' },
        { id:'prod-standards',            label:'제조 관리 표준',     group:'생산관리' },
        { id:'prod-conditions',           label:'작업조건 관리',      group:'생산관리' },
        { id:'prod-sub-materials',        label:'부자재 관리',        group:'생산관리' },
        { id:'prod-equipment',            label:'설비관리',           group:'생산관리' },
        { id:'five-s',                    label:'3정5S 관리',         group:'생산관리' },
        { id:'prod-quality',              label:'초중종물 관리',      group:'공정품질' },
        { id:'quality-performance',       label:'품질 실적',          group:'공정품질' },
        { id:'improvement-activity',      label:'개선활동',           group:'공정품질' },
        { id:'limit-samples',             label:'한도 견본',          group:'공정품질' },
        { id:'prod-spc',                  label:'SPC 관리',           group:'공정품질' },
        { id:'certifications-mgmt',       label:'자격인증 관리',      group:'공정품질' },
        { id:'settings',                  label:'관리 / 설정',        group:'시스템' },
    ];

    /* ── 내부 스토리지 ───────────────────────────────────────── */
    function _readLocalJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }
    function _writeLocalJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
    async function _loadAuthStateFromServer() {
        if (typeof Storage === 'undefined' || !Storage.getConfigValue) return false;
        try {
            const localUsers = _readLocalJson(USERS_KEY, []);
            const localPerms = _migratePerms(_readLocalJson(PERMS_KEY, _defaultPerms()));
            const localMessages = _readLocalJson(MESSAGES_KEY, []);
            const [users, perms, messages] = await Promise.all([
                Storage.getConfigValue(AUTH_USERS_CONFIG_KEY).catch(() => null),
                Storage.getConfigValue(AUTH_PERMS_CONFIG_KEY).catch(() => null),
                Storage.getConfigValue(AUTH_MESSAGES_CONFIG_KEY).catch(() => null),
            ]);
            _usersCache = Array.isArray(users) && users.length ? users : localUsers;
            _permissionsCache = perms && typeof perms === 'object' ? _migratePerms(perms) : localPerms;
            _messagesCache = Array.isArray(messages) && messages.length ? messages : localMessages;
            _writeLocalJson(USERS_KEY, _usersCache);
            _writeLocalJson(PERMS_KEY, _permissionsCache);
            _writeLocalJson(MESSAGES_KEY, _messagesCache);
            if ((!Array.isArray(users) || users.length === 0) && localUsers.length) {
                await Storage.setConfigValue(AUTH_USERS_CONFIG_KEY, _usersCache);
            }
            if ((!perms || typeof perms !== 'object') && localPerms) {
                await Storage.setConfigValue(AUTH_PERMS_CONFIG_KEY, _permissionsCache);
            }
            if ((!Array.isArray(messages) || messages.length === 0) && localMessages.length) {
                await Storage.setConfigValue(AUTH_MESSAGES_CONFIG_KEY, _messagesCache);
            }
            return true;
        } catch (e) {
            console.warn('[AuthModule] server auth state load failed:', e);
            return false;
        }
    }
    function _primeLocalAuthCache() {
        if (_usersCache === null) _usersCache = _readLocalJson(USERS_KEY, []);
        if (_permissionsCache === null) _permissionsCache = _migratePerms(_readLocalJson(PERMS_KEY, _defaultPerms()));
        if (_messagesCache === null) _messagesCache = _readLocalJson(MESSAGES_KEY, []);
    }
    async function _persistAuthState(configKey, value, localKey) {
        _writeLocalJson(localKey, value);
        if (typeof Storage === 'undefined' || !Storage.setConfigValue) return;
        try {
            await Storage.setConfigValue(configKey, value);
        } catch (e) {
            console.warn('[AuthModule] auth state persist failed:', configKey, e);
        }
    }
    function _getUsers() {
        _primeLocalAuthCache();
        return Array.isArray(_usersCache) ? _usersCache : [];
    }
    function _saveUsers(u) {
        _usersCache = Array.isArray(u) ? u : [];
        return _persistAuthState(AUTH_USERS_CONFIG_KEY, _usersCache, USERS_KEY);
    }

    /* 권한 구조: { access:[pageIds], write:[pageIds] }
       - access: 페이지 접근 허용
       - write:  작성·등록·수정·삭제 허용
       admin은 null (전체 접근+쓰기) */
    function _defaultPerms() {
        const all = ALL_PAGES.map(p => p.id);
        const noSettings = all.filter(id => id !== 'settings');
        const rw = pages => ({ access: pages, write: pages });  // 접근+입력 동일

        return {
            admin: null,  /* null = 전체 접근 + 전체 쓰기 */

            /* 생산 작업자 — 작업일지·입고·창고 중심 */
            prod_worker: rw([
                'dashboard',
                'incoming-overview','injection-incoming','paint-incoming-inspection',
                'warehouse-overview','injection-warehouse','paint-inventory','raw-material-inventory',
                'injection-process','injection-work',
                'production-plan','painting-work','painting-inspection','paint-mix',
                'laser-standby','laser-work','laser-inspection',
                'shipping-standby','product-warehouse',
            ]),

            /* 생산관리자 — 생산 전반 + 관리 표준 (설정 제외) */
            prod_manager: rw(noSettings),

            /* 품질 관리자 — 검사·품질 관련 전체 + 입고·출하 */
            quality_manager: rw([
                'dashboard',
                'incoming-overview','injection-incoming','paint-incoming-inspection',
                'warehouse-overview',
                'painting-inspection','laser-inspection',
                'shipping-standby','product-warehouse',
                'prod-standards','prod-conditions','prod-quality',
                'quality-performance','improvement-activity','limit-samples','prod-spc',
            ]),

            /* 영업관리자 — 영업·납품·제품창고 + 생산계획 조회 */
            sales_manager: rw([
                'dashboard',
                'production-plan',
                'shipping-standby','product-warehouse',
                'sales-delivery','sales-outsourcing',
                'incoming-overview','warehouse-overview',
            ]),

            /* 도장라인운영자 — 도장 공정 전담 */
            paint_line_op: rw([
                'dashboard',
                'incoming-overview','paint-incoming-inspection',
                'warehouse-overview','paint-inventory',
                'production-plan','painting-work','painting-inspection','paint-mix',
            ]),

            /* 자주검사자 — 공정 자주 검사 담당 */
            self_inspector: rw([
                'dashboard',
                'production-plan',
                'painting-work','painting-inspection',
                'prod-quality','quality-performance',
                'laser-inspection',
            ]),

            /* 레이져운영자 — 레이져 공정 전담 */
            laser_op: rw([
                'dashboard',
                'laser-standby','laser-work','laser-inspection',
                'laser-jig-master','laser-jig-cleaning',
            ]),

            /* 레이져검사자 — 레이져 검사 담당 */
            laser_inspector: rw([
                'dashboard',
                'laser-standby','laser-inspection',
                'quality-performance',
            ]),

            /* 사출운영자 — 사출 공정 전담 */
            injection_op: rw([
                'dashboard',
                'incoming-overview','injection-incoming',
                'warehouse-overview','injection-warehouse','raw-material-inventory',
                'injection-process','injection-work',
            ]),
        };
    }

    /* 구버전(array) → 신버전({access,write}) 자동 변환 */
    function _migratePerms(raw) {
        if (!raw || typeof raw !== 'object') return _defaultPerms();
        const defaults = _defaultPerms();
        const result = { admin: (raw.admin !== undefined ? raw.admin : null) };
        ROLES.forEach(r => {
            if (r.key === 'admin') return;
            const existing = raw[r.key];
            if (existing === undefined || existing === null) {
                result[r.key] = defaults[r.key] || { access: [], write: [] };
            } else if (Array.isArray(existing)) {
                /* 구버전 array → access/write 동일하게 변환 */
                result[r.key] = { access: existing, write: existing };
            } else if (existing && typeof existing === 'object' && Array.isArray(existing.access)) {
                result[r.key] = existing;
            } else {
                result[r.key] = defaults[r.key] || { access: [], write: [] };
            }
        });
        return result;
    }

    function _getPermissions() {
        _primeLocalAuthCache();
        return _permissionsCache || _defaultPerms();
    }

    /* 역할 × 페이지 접근 허용 여부 */
    function isPageAccessGranted(roleKey, pageId) {
        if (roleKey === 'admin') return true;
        const perms = _getPermissions();
        const rp = perms[roleKey];
        if (rp === null) return true;
        if (!rp) return false;
        if (Array.isArray(rp)) return rp.includes(pageId);
        return Array.isArray(rp.access) && rp.access.includes(pageId);
    }

    /* 역할 × 페이지 입력/등록 허용 여부 */
    function isPageWriteGranted(roleKey, pageId) {
        if (roleKey === 'admin') return true;
        const perms = _getPermissions();
        const rp = perms[roleKey];
        if (rp === null) return true;
        if (!rp) return false;
        if (Array.isArray(rp)) return rp.includes(pageId);
        return Array.isArray(rp.write) && rp.write.includes(pageId);
    }

    function _savePermissions(p) {
        _permissionsCache = _migratePerms(p);
        return _persistAuthState(AUTH_PERMS_CONFIG_KEY, _permissionsCache, PERMS_KEY);
    }

    function _getMessages() {
        _primeLocalAuthCache();
        return Array.isArray(_messagesCache) ? _messagesCache : [];
    }
    function _saveMessages(rows) {
        _messagesCache = Array.isArray(rows) ? rows : [];
        return _persistAuthState(AUTH_MESSAGES_CONFIG_KEY, _messagesCache, MESSAGES_KEY);
    }
    function _roleLabel(roleKey) {
        const role = ROLES.find(r => r.key === roleKey);
        return role ? role.label : roleKey;
    }
    function _esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function _newMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    function _cloneRecipients(targetType, targetId) {
        if (targetType === 'all') return [{ type: 'all', id: 'all', label: '전체 사용자' }];
        if (targetType === 'role') return [{ type: 'role', id: targetId, label: _roleLabel(targetId) }];
        const user = _getUsers().find(u => String(u.id) === String(targetId) || String(u.username) === String(targetId));
        return [{ type: 'user', id: String(targetId || ''), label: user ? user.displayName : String(targetId || '') }];
    }
    function _messageTargetsUser(message, user) {
        if (!message || !user) return false;
        return (message.recipients || []).some(rec => {
            if (!rec) return false;
            if (rec.type === 'all') return true;
            if (rec.type === 'role') return rec.id === user.role;
            return String(rec.id) === String(user.id) || String(rec.id) === String(user.username);
        });
    }
    function _messageReadByUser(message, user) {
        if (!message || !user) return false;
        return Array.isArray(message.readBy) && message.readBy.some(row => String(row.userId) === String(user.id));
    }
    function _inboxMessagesForUser(user, options) {
        const opts = options || {};
        return _getMessages()
            .filter(msg => _messageTargetsUser(msg, user))
            .filter(msg => !opts.unreadOnly || !_messageReadByUser(msg, user))
            .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
    }
    function _sentMessagesForUser(user) {
        if (!user) return [];
        return _getMessages()
            .filter(msg => String(msg.senderId || '') === String(user.id))
            .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
    }
    function getUnreadInboxCount(user) {
        const targetUser = user || getCurrentUser();
        if (!targetUser) return 0;
        return _inboxMessagesForUser(targetUser, { unreadOnly: true }).length;
    }
    function markMessageRead(messageId, user) {
        const targetUser = user || getCurrentUser();
        if (!targetUser || !messageId) return;
        const rows = _getMessages();
        let changed = false;
        const next = rows.map(msg => {
            if (msg.id !== messageId) return msg;
            const readBy = Array.isArray(msg.readBy) ? [...msg.readBy] : [];
            if (!readBy.some(row => String(row.userId) === String(targetUser.id))) {
                readBy.push({ userId: String(targetUser.id), readAt: new Date().toISOString() });
                changed = true;
            }
            return { ...msg, readBy };
        });
        if (changed) {
            _saveMessages(next);
            _updateTopbar();
        }
    }
    function sendInternalMessage(payload) {
        const current = getCurrentUser();
        if (!current) {
            UIUtils.toast('로그인 후 쪽지를 보낼 수 있습니다.', 'warning');
            return false;
        }
        const targetType = String(payload?.targetType || 'user');
        const targetId = String(payload?.targetId || '');
        const title = String(payload?.title || '').trim();
        const body = String(payload?.body || '').trim();
        if (!title || !body) {
            UIUtils.toast('제목과 내용을 입력하세요.', 'warning');
            return false;
        }
        if (targetType !== 'all' && !targetId) {
            UIUtils.toast('수신 대상을 선택하세요.', 'warning');
            return false;
        }
        const rows = _getMessages();
        rows.push({
            id: _newMessageId(),
            title,
            body,
            category: String(payload?.category || 'general'),
            priority: String(payload?.priority || 'normal'),
            senderId: String(current.id || ''),
            senderName: String(current.displayName || current.username || ''),
            recipients: _cloneRecipients(targetType, targetId),
            sentAt: new Date().toISOString(),
            readBy: []
        });
        _saveMessages(rows);
        _updateTopbar();
        return true;
    }
    function _popupStateKey(user) {
        return `${POPUP_STATE_PREFIX}${user?.id || 'guest'}`;
    }
    function _shouldShowUnreadPopup(user) {
        if (!user) return false;
        const unreadIds = _inboxMessagesForUser(user, { unreadOnly: true }).map(msg => msg.id).join('|');
        if (!unreadIds) return false;
        try {
            const saved = sessionStorage.getItem(_popupStateKey(user)) || '';
            return saved !== unreadIds;
        } catch {
            return true;
        }
    }
    function _rememberUnreadPopup(user) {
        if (!user) return;
        const unreadIds = _inboxMessagesForUser(user, { unreadOnly: true }).map(msg => msg.id).join('|');
        try { sessionStorage.setItem(_popupStateKey(user), unreadIds); } catch {}
    }
    function _messageRecipientText(message) {
        return (message?.recipients || []).map(rec => rec.label || rec.id || '').filter(Boolean).join(', ');
    }
    function _renderInboxList(messages, user, selectedId, emptyText) {
        if (!messages.length) {
            return `<div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:.9rem;">${emptyText}</div>`;
        }
        return messages.map(msg => {
            const unread = !_messageReadByUser(msg, user);
            return `<button type="button" onclick="AuthModule.openInboxModal('${msg.id}')" style="width:100%;text-align:left;border:1px solid ${selectedId === msg.id ? 'var(--accent-blue)' : 'var(--border-color)'};background:${selectedId === msg.id ? 'rgba(37,99,235,.06)' : '#fff'};border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;cursor:pointer;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <strong style="font-size:.88rem;color:var(--text-primary);">${_esc(msg.title)}</strong>
                            ${unread ? `<span style="font-size:.7rem;background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:999px;font-weight:700;">NEW</span>` : ''}
                        </div>
                        <div style="font-size:.76rem;color:var(--text-muted);">${_esc(msg.senderName || '시스템')} · ${new Date(msg.sentAt).toLocaleString('ko-KR')}</div>
                        <div style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(msg.body || '')}</div>
                    </button>`;
        }).join('');
    }
    function openComposeMessageModal() {
        const current = getCurrentUser();
        if (!current) {
            showLoginModal(() => openComposeMessageModal());
            return;
        }
        const users = _getUsers().filter(u => u.active !== false);
        const roleOptions = ROLES.map(role => `<option value="${role.key}">${role.label}</option>`).join('');
        const userOptions = users.map(user => `<option value="${user.id}">${user.displayName}</option>`).join('');
        UIUtils.showModal(
            '쪽지 보내기',
            `<div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:grid;grid-template-columns:140px 1fr;gap:10px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">수신 방식</label>
                        <select class="form-select" id="mesMsgTargetType" onchange="AuthModule._toggleComposeTarget()">
                            <option value="user">담당자 지정</option>
                            <option value="role">역할 통보</option>
                            <option value="all">전체 공지</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;" id="mesMsgTargetWrap">
                        <label class="form-label">수신 대상</label>
                        <select class="form-select" id="mesMsgTargetId">${userOptions}</select>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">제목</label>
                    <input class="form-input" id="mesMsgTitle" placeholder="예: 결재 확인 요청">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">내용</label>
                    <textarea class="form-textarea" id="mesMsgBody" rows="8" placeholder="전달할 내용을 입력하세요."></textarea>
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="AuthModule._submitComposeMessage()">보내기</button>`
        );
        setTimeout(() => {
            const roleSelect = document.getElementById('mesMsgRoleOptions');
            if (!roleSelect) {
                const wrap = document.getElementById('mesMsgTargetWrap');
                if (wrap) wrap.dataset.roleOptions = roleOptions;
            }
            document.getElementById('mesMsgTitle')?.focus();
        }, 30);
    }
    function _toggleComposeTarget() {
        const type = document.getElementById('mesMsgTargetType')?.value || 'user';
        const wrap = document.getElementById('mesMsgTargetWrap');
        if (!wrap) return;
        if (type === 'all') {
            wrap.innerHTML = `<label class="form-label">수신 대상</label><div class="form-input" style="display:flex;align-items:center;background:#f8fafc;">전체 사용자</div>`;
            return;
        }
        const users = _getUsers().filter(u => u.active !== false);
        const userOptions = users.map(user => `<option value="${user.id}">${user.displayName}</option>`).join('');
        const roleOptions = ROLES.map(role => `<option value="${role.key}">${role.label}</option>`).join('');
        wrap.innerHTML = `<label class="form-label">수신 대상</label><select class="form-select" id="mesMsgTargetId">${type === 'role' ? roleOptions : userOptions}</select>`;
    }
    function _submitComposeMessage() {
        const type = document.getElementById('mesMsgTargetType')?.value || 'user';
        const targetId = type === 'all' ? 'all' : (document.getElementById('mesMsgTargetId')?.value || '');
        const title = document.getElementById('mesMsgTitle')?.value || '';
        const body = document.getElementById('mesMsgBody')?.value || '';
        const ok = sendInternalMessage({ targetType: type, targetId, title, body });
        if (!ok) return;
        UIUtils.closeModal();
        UIUtils.toast('쪽지를 보냈습니다.', 'success');
        openInboxModal();
    }
    function openInboxModal(selectedId) {
        const current = getCurrentUser();
        if (!current) {
            showLoginModal(() => openInboxModal(selectedId));
            return;
        }
        const inbox = _inboxMessagesForUser(current);
        const sent = _sentMessagesForUser(current);
        const selected = inbox.find(msg => msg.id === selectedId) || inbox[0] || null;
        if (selected) markMessageRead(selected.id, current);
        _rememberUnreadPopup(current);
        const freshInbox = _inboxMessagesForUser(current);
        const active = freshInbox.find(msg => msg.id === (selected?.id || selectedId)) || freshInbox[0] || null;
        const unreadCount = getUnreadInboxCount(current);
        UIUtils.showModal(
            `수신함${unreadCount ? ` (${unreadCount})` : ''}`,
            `<div style="display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;min-height:460px;">
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <strong style="font-size:.9rem;">받은 메시지</strong>
                        <button class="btn btn-outline btn-sm" onclick="AuthModule.openComposeMessageModal()">새 쪽지</button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto;">${_renderInboxList(freshInbox, current, active?.id, '받은 메시지가 없습니다.')}</div>
                    <div style="margin-top:8px;">
                        <strong style="font-size:.85rem;">보낸 메시지</strong>
                        <div style="display:flex;flex-direction:column;gap:8px;max-height:180px;overflow:auto;margin-top:8px;">${_renderInboxList(sent, current, '', '보낸 메시지가 없습니다.')}</div>
                    </div>
                </div>
                <div style="border:1px solid var(--border-color);border-radius:12px;padding:14px;background:#fff;">
                    ${active ? `
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
                            <div>
                                <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${_esc(active.title)}</div>
                                <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">${_esc(active.senderName || '시스템')} · ${new Date(active.sentAt).toLocaleString('ko-KR')}</div>
                                <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">수신: ${_esc(_messageRecipientText(active))}</div>
                            </div>
                        </div>
                        <div style="min-height:280px;white-space:pre-wrap;line-height:1.6;font-size:.92rem;color:var(--text-primary);background:#f8fafc;border:1px solid var(--border-color);border-radius:10px;padding:12px;">${_esc(active.body)}</div>
                    ` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:320px;color:var(--text-muted);">확인할 메시지가 없습니다.</div>`}
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`
        );
    }
    function showUnreadInboxPopup() {
        const current = getCurrentUser();
        if (!current || !_shouldShowUnreadPopup(current)) return;
        setTimeout(() => openInboxModal(), 120);
    }

    /* ── 세션 ────────────────────────────────────────────────── */
    function getCurrentUser() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    }

    /* ── 쓰기 권한 ───────────────────────────────────────────── */
    /* 전역 쓰기 허용 (기존 호환성 유지) */
    function canWrite() {
        return true;
    }

    /* 현재 사용자가 특정 페이지에 입력/등록 권한이 있는지 확인 */
    function canWritePage(pageId) {
        const user = getCurrentUser();
        if (!user) return false;
        return isPageWriteGranted(user.role, pageId);
    }

    /* ── 기본 관리자 계정 보장 ───────────────────────────────── */
    async function ensureAdminUser() {
        if (_getUsers().length === 0) {
            await _saveUsers([{
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
            showUnreadInboxPopup();
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
    /* 관리/설정 페이지만 관리자 로그인 필요 (나머지 전체 허용) */
    function checkSettingsAuth(onPass) {
        const user = getCurrentUser();
        if (user && user.role === 'admin') { onPass(); return; }
        showLoginModal(function() {
            const u = getCurrentUser();
            if (u && u.role === 'admin') { onPass(); }
            else { UIUtils.toast('관리자 계정으로 로그인해야 합니다.', 'warning'); }
        });
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
            const fullUser2 = _getUsers().find(u => u.id === user.id);
            const photo2 = fullUser2 && fullUser2.photo ? fullUser2.photo : null;
            const avatarHtml2 = photo2
                ? `<img src="${photo2}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border-color);">`
                : `<div class="topbar-user-icon"><span class="material-symbols-outlined" style="font-size:20px;">person</span></div>`;
            badge.innerHTML = `
                ${avatarHtml2}
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

    function _updateTopbar() {
        const badge = document.getElementById('topbarUserBadge');
        if (!badge) return;
        const user = getCurrentUser();
        const role = ROLES.find(r => r.key === (user ? user.role : ''));
        if (user) {
            const unreadCount = getUnreadInboxCount(user);
            // 사용자 사진: localStorage users에서 photo 필드 조회
            const fullUser = _getUsers().find(u => u.id === user.id);
            const photo = fullUser && fullUser.photo ? fullUser.photo : null;
            const avatarHtml = photo
                ? `<img src="${photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border-color);">`
                : `<div class="topbar-user-icon"><span class="material-symbols-outlined" style="font-size:20px;">person</span></div>`;
            badge.innerHTML = `
                ${avatarHtml}
                <div style="line-height:1.3;margin:0 6px;white-space:nowrap;">
                    <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${user.displayName}</div>
                    <div style="font-size:10px;color:${role ? role.color : 'var(--text-muted)'};">${role ? role.label : ''}</div>
                </div>
                <button onclick="AuthModule.openInboxModal()" title="수신함"
                    style="position:relative;background:none;border:none;cursor:pointer;padding:3px;color:var(--text-muted);display:flex;align-items:center;flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:18px;">mail</span>
                    ${unreadCount ? `<span style="position:absolute;right:-2px;top:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#2563eb;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
                </button>
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

    async function init() {
        await _loadAuthStateFromServer();
        await ensureAdminUser();
        _setupInterceptor();
        _applyWriteMode();
        _updateTopbar();
        showUnreadInboxPopup();
    }

    function _normalizeMessageTargetIds(payload) {
        const raw = Array.isArray(payload?.targetIds)
            ? payload.targetIds
            : (payload?.targetId ? [payload.targetId] : []);
        return [...new Set(raw.map(value => String(value || '').trim()).filter(Boolean))];
    }

    function _cloneRecipients(targetType, targetIds) {
        if (targetType === 'all') {
            return [{ type: 'all', id: 'all', label: '전체 사용자' }];
        }
        const users = _getUsers().filter(user => user.active !== false);
        const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
        const recipients = ids.map(targetId => {
            const user = users.find(row =>
                String(row.id) === String(targetId) ||
                String(row.username) === String(targetId)
            );
            if (!user) return null;
            return {
                type: 'user',
                id: String(user.id),
                label: String(user.displayName || user.username || user.id || ''),
                role: String(user.role || '')
            };
        }).filter(Boolean);
        return recipients;
    }

    function sendInternalMessage(payload) {
        const current = getCurrentUser();
        if (!current) {
            UIUtils.toast('로그인 후 메시지를 보낼 수 있습니다.', 'warning');
            return false;
        }
        const targetType = String(payload?.targetType || 'user');
        const targetIds = _normalizeMessageTargetIds(payload);
        const title = String(payload?.title || '').trim();
        const body = String(payload?.body || '').trim();
        if (!title || !body) {
            UIUtils.toast('제목과 내용을 입력해 주세요.', 'warning');
            return false;
        }
        if (targetType !== 'all' && !targetIds.length) {
            UIUtils.toast('수신 대상을 선택해 주세요.', 'warning');
            return false;
        }
        const recipients = _cloneRecipients(targetType, targetIds);
        if (targetType !== 'all' && !recipients.length) {
            UIUtils.toast('선택한 수신자를 찾을 수 없습니다.', 'warning');
            return false;
        }
        const rows = _getMessages();
        rows.push({
            id: _newMessageId(),
            title,
            body,
            category: String(payload?.category || 'general'),
            priority: String(payload?.priority || 'normal'),
            senderId: String(current.id || ''),
            senderName: String(current.displayName || current.username || ''),
            recipients,
            sentAt: new Date().toISOString(),
            readBy: []
        });
        _saveMessages(rows);
        _updateTopbar();
        return true;
    }

    function _renderComposeTargetChecklist(type) {
        const users = _getUsers().filter(user => user.active !== false);
        if (type === 'all') {
            return `
                <label class="form-label">수신 대상</label>
                <div class="form-input" style="display:flex;align-items:center;background:#f8fafc;">전체 사용자</div>
            `;
        }
        if (!users.length) {
            return `
                <label class="form-label">수신 대상</label>
                <div class="form-input" style="display:flex;align-items:center;background:#f8fafc;color:var(--text-muted);">선택 가능한 사용자가 없습니다.</div>
            `;
        }
        const renderOption = (user) => `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:#fff;cursor:pointer;">
                <input type="checkbox" class="mes-msg-target-check" value="${_esc(user.id)}" style="width:16px;height:16px;">
                <span style="font-size:.9rem;color:var(--text-primary);">${_esc(user.displayName || user.username || user.id)}</span>
                <span style="margin-left:auto;font-size:.72rem;color:var(--text-muted);">${_esc(_roleLabel(user.role))}</span>
            </label>
        `;
        if (type === 'role') {
            const roleGroups = ROLES.map(role => {
                const members = users.filter(user => String(user.role || '') === String(role.key));
                if (!members.length) return '';
                return `
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:.78rem;font-weight:700;color:${role.color || 'var(--text-secondary)'};">${_esc(role.label)}</div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
                            ${members.map(renderOption).join('')}
                        </div>
                    </div>
                `;
            }).filter(Boolean).join('');
            return `
                <label class="form-label">통보 대상</label>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:.75rem;color:var(--text-muted);">역할별로 필요한 담당자를 여러 명 선택하세요.</span>
                    <button type="button" class="btn btn-outline btn-sm" id="mesMsgToggleChecks" onclick="AuthModule._toggleComposeChecks(true)">전체 선택</button>
                </div>
                <div id="mesMsgTargetChecks" style="display:flex;flex-direction:column;gap:12px;max-height:220px;overflow:auto;padding:2px;">
                    ${roleGroups}
                </div>
            `;
        }
        return `
            <label class="form-label">수신 대상</label>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:.75rem;color:var(--text-muted);">메시지를 받을 사용자를 여러 명 선택하세요.</span>
                <button type="button" class="btn btn-outline btn-sm" id="mesMsgToggleChecks" onclick="AuthModule._toggleComposeChecks(true)">전체 선택</button>
            </div>
            <div id="mesMsgTargetChecks" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;max-height:220px;overflow:auto;padding:2px;">
                ${users.map(renderOption).join('')}
            </div>
        `;
    }

    function _toggleComposeChecks(forceCheck) {
        const checks = Array.from(document.querySelectorAll('.mes-msg-target-check'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(check => !check.checked);
        checks.forEach(check => { check.checked = shouldCheck; });
        const actionButton = document.getElementById('mesMsgToggleChecks');
        if (actionButton) {
            actionButton.textContent = shouldCheck ? '전체 해제' : '전체 선택';
            actionButton.setAttribute('onclick', `AuthModule._toggleComposeChecks(${shouldCheck ? 'false' : 'true'})`);
        }
    }

    function _getComposeTargetIds() {
        return Array.from(document.querySelectorAll('.mes-msg-target-check:checked'))
            .map(check => String(check.value || '').trim())
            .filter(Boolean);
    }

    function openComposeMessageModal() {
        const current = getCurrentUser();
        if (!current) {
            showLoginModal(() => openComposeMessageModal());
            return;
        }
        UIUtils.showModal(
            '쪽지 보내기',
            `<div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:grid;grid-template-columns:140px 1fr;gap:10px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">수신 방식</label>
                        <select class="form-select" id="mesMsgTargetType" onchange="AuthModule._toggleComposeTarget()">
                            <option value="user">이름 선택</option>
                            <option value="role">역할별 통보</option>
                            <option value="all">전체 공지</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;" id="mesMsgTargetWrap"></div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">제목</label>
                    <input class="form-input" id="mesMsgTitle" placeholder="예: 결재 확인 요청">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">내용</label>
                    <textarea class="form-textarea" id="mesMsgBody" rows="8" placeholder="전달할 내용을 입력해 주세요."></textarea>
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="AuthModule._submitComposeMessage()">보내기</button>`
        );
        setTimeout(() => {
            _toggleComposeTarget();
            document.getElementById('mesMsgTitle')?.focus();
        }, 30);
    }

    function _toggleComposeTarget() {
        const type = document.getElementById('mesMsgTargetType')?.value || 'user';
        const wrap = document.getElementById('mesMsgTargetWrap');
        if (!wrap) return;
        wrap.innerHTML = _renderComposeTargetChecklist(type);
        const actionButton = document.getElementById('mesMsgToggleChecks');
        if (actionButton) {
            actionButton.textContent = '전체 선택';
            actionButton.setAttribute('onclick', 'AuthModule._toggleComposeChecks(true)');
        }
    }

    function _submitComposeMessage() {
        const type = document.getElementById('mesMsgTargetType')?.value || 'user';
        const targetIds = type === 'all' ? ['all'] : _getComposeTargetIds();
        const title = document.getElementById('mesMsgTitle')?.value || '';
        const body = document.getElementById('mesMsgBody')?.value || '';
        const ok = sendInternalMessage({ targetType: type, targetIds, title, body });
        if (!ok) return;
        UIUtils.closeModal();
        UIUtils.toast('쪽지를 보냈습니다.', 'success');
        openInboxModal();
    }

    return {
        ROLES,
        ALL_PAGES,
        getUsers:             _getUsers,
        saveUsers:            _saveUsers,
        getPermissions:       _getPermissions,
        savePermissions:      _savePermissions,
        isPageAccessGranted,
        isPageWriteGranted,
        getCurrentUser,
        canWrite,
        canWritePage,
        ensureAdminUser,
        doLogin,
        logout,
        showLoginModal,
        checkSettingsAuth,
        getUnreadInboxCount,
        sendInternalMessage,
        openInboxModal,
        openComposeMessageModal,
        markMessageRead,
        showUnreadInboxPopup,
        _toggleComposeChecks,
        _toggleComposeTarget,
        _submitComposeMessage,
        _doLoginModal,
        _updateTopbar,
        _applyWriteMode,
        init,
    };
})();
