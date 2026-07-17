/**
 * Common document approval helper.
 * Stores assigned users and login-based signatures for writer/reviewer/approver.
 */
const ApprovalUtils = (function () {
    const ROLES = [
        { key: 'writer', label: '작성' },
        { key: 'reviewer', label: '검토' },
        { key: 'approver', label: '승인' },
    ];

    function _esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function _userId(user) {
        return user ? String(user.id || user.username || '') : '';
    }

    function _userName(user) {
        return user ? String(user.displayName || user.name || user.username || '') : '';
    }

    function getUsers() {
        const auth = (typeof AuthModule !== 'undefined') ? AuthModule
            : (typeof window !== 'undefined' ? window.AuthModule : null);
        if (!auth || typeof auth.getUsers !== 'function') return [];
        return (auth.getUsers() || []).filter(u => u && u.active !== false);
    }

    /** 이름(표시명) 또는 username으로 사용자 검색. 정확 일치 우선, 유일 접두사 허용. */
    function findUserByName(name) {
        const q = String(name || '').trim().replace(/\s+/g, '');
        if (!q) return null;
        const users = getUsers();
        const norm = u => String(u.displayName || u.name || '').replace(/\s+/g, '');
        // 1) 표시명 정확 일치
        let hit = users.find(u => norm(u) === q);
        if (hit) return hit;
        // 2) username 정확 일치
        hit = users.find(u => String(u.username || '').replace(/\s+/g, '') === q);
        if (hit) return hit;
        // 3) 표시명 includes (양방향) — 공백 무시
        const contains = users.filter(u => {
            const n = norm(u);
            return n && (n.includes(q) || q.includes(n));
        });
        if (contains.length === 1) return contains[0];
        // 4) 접두사 유일
        if (q.length >= 2) {
            const prefix = users.filter(u => norm(u).startsWith(q) || String(u.username || '').startsWith(q));
            if (prefix.length === 1) return prefix[0];
        }
        return null;
    }

    function getCurrentUserFull() {
        const auth = (typeof AuthModule !== 'undefined') ? AuthModule
            : (typeof window !== 'undefined' ? window.AuthModule : null);
        if (!auth || typeof auth.getCurrentUser !== 'function') return null;
        const session = auth.getCurrentUser();
        if (!session) return null;
        const users = getUsers();
        return users.find(u => _userId(u) === _userId(session) || u.username === session.username) || session;
    }

    function normalize(approvals) {
        const source = approvals || {};
        const next = {};
        ROLES.forEach(role => {
            const value = source[role.key] || {};
            next[role.key] = {
                assignedUserId: value.assignedUserId || '',
                assignedUserName: value.assignedUserName || '',
                signedUserId: value.signedUserId || '',
                signedUserName: value.signedUserName || '',
                signedAt: value.signedAt || '',
                seal: value.seal || ''
            };
        });
        return next;
    }

    function _dateText(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        return date.toISOString().slice(0, 10);
    }

    function _canSign(entry, currentUser) {
        if (!currentUser || !entry || entry.signedAt) return false;
        const currentId = _userId(currentUser);
        return !!entry.assignedUserId && entry.assignedUserId === currentId;
    }

    function _selectHtml(prefix, role, entry, users, editable) {
        if (!editable || entry.signedAt) {
            return `<div class="approval-assigned">${_esc(entry.assignedUserName || '-')}</div>`;
        }
        return `<select class="approval-select" id="${_esc(prefix)}_${role.key}" data-approval-role="${_esc(role.key)}">
            <option value="">담당자 선택</option>
            ${users.map(u => {
                const id = _userId(u);
                return `<option value="${_esc(id)}" ${id === entry.assignedUserId ? 'selected' : ''}>${_esc(_userName(u))}</option>`;
            }).join('')}
        </select>`;
    }

    function render(approvals, options = {}) {
        const prefix = options.prefix || 'docApproval';
        const editable = options.editable !== false;
        const data = normalize(approvals);
        const users = getUsers();
        const current = getCurrentUserFull();
        const signHandler = options.signHandler || 'ApprovalUtils.signFromDom';
        const clearHandler = options.clearHandler || 'ApprovalUtils.clearFromDom';
        const isAdmin = current && current.role === 'admin';

        return `<div class="approval-widget" id="${_esc(prefix)}" data-approval-prefix="${_esc(prefix)}">
            <style>
                .approval-widget { margin:8px 0 10px;border:1px solid #111827;background:#fff;font-size:12px; }
                .approval-table { width:100%;border-collapse:collapse;table-layout:fixed;text-align:center; }
                .approval-table th,.approval-table td { border:1px solid #111827;padding:4px 5px;vertical-align:middle; }
                .approval-table th { background:#f3f4f6;font-weight:800; }
                .approval-select { width:100%;height:28px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;padding:0 6px;background:#fff; }
                .approval-seal { height:42px;display:flex;align-items:center;justify-content:center; }
                .approval-seal img { max-width:74px;max-height:38px;object-fit:contain; }
                .approval-name { font-weight:800;line-height:1.15; }
                .approval-date { margin-top:2px;color:#475569;font-size:10px; }
                .approval-actions { display:flex;gap:4px;justify-content:center;margin-top:4px; }
                .approval-actions button { height:22px;padding:0 8px;border-radius:4px;border:1px solid #2563eb;background:#fff;color:#2563eb;font-size:11px;font-weight:800;cursor:pointer; }
                .approval-actions button.approval-clear { border-color:#ef4444;color:#ef4444; }
                @media print { .approval-actions,.approval-select { display:none !important; } .approval-widget { break-inside:avoid; } }
            </style>
            <table class="approval-table">
                <colgroup><col style="width:72px"><col><col><col></colgroup>
                <thead><tr><th>결재</th>${ROLES.map(r => `<th>${_esc(r.label)}</th>`).join('')}</tr></thead>
                <tbody>
                    <tr><th>담당</th>${ROLES.map(r => `<td>${_selectHtml(prefix, r, data[r.key], users, editable)}</td>`).join('')}</tr>
                    <tr><th>서명/날인</th>${ROLES.map(r => {
                        const entry = data[r.key];
                        const canSign = _canSign(entry, current);
                        const sealHtml = entry.seal
                            ? `<img src="${_esc(entry.seal)}" alt="${_esc(entry.signedUserName || r.label)}">`
                            : `<div class="approval-name">${_esc(entry.signedUserName || '-')}</div>`;
                        return `<td>
                            <div class="approval-seal">${entry.signedAt ? sealHtml : '-'}</div>
                            ${entry.signedAt ? `<div class="approval-date">${_esc(_dateText(entry.signedAt))}</div>` : ''}
                            <div class="approval-actions">
                                ${canSign ? `<button type="button" onclick="${_esc(signHandler)}('${_esc(prefix)}','${_esc(r.key)}')">서명</button>` : ''}
                                ${isAdmin && entry.signedAt ? `<button type="button" class="approval-clear" onclick="${_esc(clearHandler)}('${_esc(prefix)}','${_esc(r.key)}')">취소</button>` : ''}
                            </div>
                        </td>`;
                    }).join('')}</tr>
                </tbody>
            </table>
        </div>`;
    }

    function collect(prefix, approvals) {
        const data = normalize(approvals);
        const users = getUsers();
        ROLES.forEach(role => {
            const select = document.getElementById(`${prefix}_${role.key}`);
            if (!select) return;
            const user = users.find(u => _userId(u) === select.value);
            data[role.key].assignedUserId = user ? _userId(user) : '';
            data[role.key].assignedUserName = user ? _userName(user) : '';
        });
        return data;
    }

    function sign(approvals, roleKey) {
        const data = normalize(approvals);
        const current = getCurrentUserFull();
        if (!current) {
            UIUtils.toast('로그인 후 서명할 수 있습니다.', 'warning');
            return data;
        }
        const entry = data[roleKey];
        if (!entry) return data;
        if (entry.signedAt) {
            UIUtils.toast('이미 서명된 결재입니다.', 'info');
            return data;
        }
        if (entry.assignedUserId !== _userId(current)) {
            UIUtils.toast('지정된 담당자만 서명할 수 있습니다.', 'warning');
            return data;
        }
        entry.signedUserId = _userId(current);
        entry.signedUserName = _userName(current);
        entry.signedAt = new Date().toISOString();
        entry.seal = current.seal || '';
        UIUtils.toast(`${entry.signedUserName} ${roleKey === 'writer' ? '작성' : roleKey === 'reviewer' ? '검토' : '승인'} 서명이 완료되었습니다.`, 'success');
        return data;
    }

    function clear(approvals, roleKey) {
        const current = getCurrentUserFull();
        if (!current || current.role !== 'admin') {
            UIUtils.toast('관리자만 서명을 취소할 수 있습니다.', 'warning');
            return normalize(approvals);
        }
        const data = normalize(approvals);
        if (data[roleKey]) {
            data[roleKey].signedUserId = '';
            data[roleKey].signedUserName = '';
            data[roleKey].signedAt = '';
            data[roleKey].seal = '';
        }
        return data;
    }

    /** 이름 입력용 datalist */
    function userDatalistHtml(listId) {
        const id = listId || 'approvalUserDatalist';
        return `<datalist id="${_esc(id)}">${getUsers().map(u =>
            `<option value="${_esc(u.displayName || u.name || u.username || '')}"></option>`
        ).join('')}</datalist>`;
    }

    /** 저장된 날인 없으면 사용자 마스터에서 보강 */
    function resolveSeal(name, existingSeal) {
        if (existingSeal) return existingSeal;
        if (!name) return '';
        const u = findUserByName(name);
        return (u && u.seal) || '';
    }

    /**
     * 문서 결재칸 편집 HTML
     * @param {object} opts { inputId, name, seal, handler } handler 예: 'InjIncomingStdModule._onSignNameInput'
     */
    function signCellEditHtml(opts) {
        const inputId = opts.inputId || 'signName';
        const name = opts.name || '';
        const seal = opts.seal || '';
        const listId = opts.listId || 'approvalUserDatalist';
        const handler = opts.handler || 'ApprovalUtils.onSignNameInput';
        const hasSeal = !!(seal && String(seal).trim());
        return `<td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;min-width:80px;">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:64px;">
                <input class="doc-input" id="${_esc(inputId)}" list="${_esc(listId)}"
                    value="${_esc(name)}" placeholder="이름 입력"
                    style="text-align:center;font-size:10px;font-weight:700;width:100%;"
                    oninput="${_esc(handler)}(this,false)"
                    onchange="${_esc(handler)}(this,true)"
                    onblur="${_esc(handler)}(this,true)">
                <div id="${_esc(inputId)}SealBox" style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;${hasSeal ? '' : 'border:1px dashed #fca5a5;'}">
                    ${hasSeal
                        ? `<img src="${_esc(seal)}" alt="날인" style="max-width:56px;max-height:56px;object-fit:contain;">`
                        : `<span style="font-size:9px;color:#bbb;">날인</span>`}
                </div>
                <input type="hidden" id="${_esc(inputId)}Seal" value="${_esc(seal)}">
            </div>
        </td>`;
    }

    function signCellViewHtml(name, seal) {
        const resolved = resolveSeal(name, seal);
        if (resolved) {
            const src = String(resolved).replace(/"/g, '&quot;');
            return `<div style="display:flex;align-items:center;justify-content:center;min-height:56px;">
                <img src="${src}" alt="${_esc(name || '날인')}" style="max-width:56px;max-height:56px;object-fit:contain;" title="${_esc(name || '')}">
            </div>`;
        }
        return _esc(name || '');
    }

    /** input id 규칙: {id} / {id}Seal / {id}SealBox */
    function onSignNameInput(inp, commit) {
        if (!inp) return;
        const raw = String(inp.value || '').trim();
        const sealHidden = document.getElementById(inp.id + 'Seal');
        const sealBox = document.getElementById(inp.id + 'SealBox');
        const clearSeal = function (placeholder) {
            if (sealHidden) sealHidden.value = '';
            if (sealBox) {
                sealBox.style.border = '1px dashed #fca5a5';
                sealBox.innerHTML = `<span style="font-size:9px;color:#bbb;">${placeholder || '날인'}</span>`;
            }
        };
        if (!raw) { clearSeal('날인'); return; }

        const users = getUsers();
        const norm = u => String(u.displayName || u.name || '').replace(/\s+/g, '');
        const q = raw.replace(/\s+/g, '');
        let user = users.find(u => norm(u) === q || String(u.username || '') === q);
        if (!user && commit) user = findUserByName(raw);
        if (!user) { clearSeal('날인'); return; }

        const exactName = String(user.displayName || user.name || user.username || '').trim();
        if (commit || norm(user) === q) inp.value = exactName;

        const seal = user.seal || '';
        if (seal) {
            if (sealHidden) sealHidden.value = seal;
            if (sealBox) {
                sealBox.style.border = 'none';
                sealBox.innerHTML = `<img src="${_esc(seal)}" alt="날인" style="max-width:56px;max-height:56px;object-fit:contain;">`;
            }
        } else {
            clearSeal('미등록');
            if (sealBox) sealBox.innerHTML = `<span style="font-size:9px;color:#f59e0b;">미등록</span>`;
            if (commit && typeof UIUtils !== 'undefined') {
                UIUtils.toast(`'${exactName}' 사용자의 날인이 없습니다. 설정에서 등록하세요.`, 'info');
            }
        }
    }

    return {
        ROLES,
        normalize,
        render,
        collect,
        sign,
        clear,
        getUsers,
        findUserByName,
        getCurrentUserFull,
        userDatalistHtml,
        resolveSeal,
        signCellEditHtml,
        signCellViewHtml,
        onSignNameInput
    };
})();

window.ApprovalUtils = ApprovalUtils;
