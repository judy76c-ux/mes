/**
 * 도장 공정 모듈
 * - 도장 입고
 * - 도장 작업일지 (생산 투입)
 * - 도장 검사 (불량 집계) - 생산계획 연동
 * - 도장품 출고
 */

// ===================================================================
// 도장 입고
// ===================================================================
const PaintingIncomingModule = (function() {
    const STORE = DB.STORES.PAINTING_INCOMING;

    function _getNotifyUsersByRole() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce(function(map, role) {
            map[role.key] = role;
            return map;
        }, {});
        return users
            .filter(function(user) { return user && user.active !== false; })
            .map(function(user) {
                const role = roleMap[user.role] || null;
                return {
                    id: String(user.id || ''),
                    name: String(user.displayName || user.username || user.id || ''),
                    role: String(user.role || ''),
                    roleLabel: role ? role.label : String(user.role || '미지정'),
                    roleColor: role ? role.color : 'var(--text-muted)'
                };
            });
    }

    function _buildNotifySelectorHtml(prefix, helpText) {
        const isPlanNotify = (prefix === 'plan' || prefix === 'editPlan');
        let users = _getNotifyUsersByRole();
        if (isPlanNotify) users = users.filter(function(u) { return u.role === 'prod_manager'; });
        if (!users.length) {
            return '<div style="margin-top:10px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 통보 대상 사용자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(function(user) {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(function(key) {
            const group = groups[key];
            return '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<div style="font-size:0.78rem;font-weight:700;color:' + group.color + ';">' + group.label + '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">' +
                group.items.map(function(user) {
                    return '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.18);border-radius:8px;background:#fff;cursor:pointer;">' +
                        '<input type="checkbox" class="' + prefix + '-notify-user" value="' + user.id + '" style="width:16px;height:16px;accent-color:#dc2626;">' +
                        '<span style="font-size:0.82rem;color:var(--text-primary);font-weight:600;">' + user.name + '</span>' +
                        '</label>';
                }).join('') +
                '</div>' +
                '</div>';
        }).join('');
        return '<div style="margin-top:10px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:10px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
            '<div style="font-size:0.8rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.toggleNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">' + helpText + '</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:12px;max-height:210px;overflow:auto;">' + roleBlocks + '</div>' +
            '</div>';
    }

    function _getSelectedNotifyUsers(prefix) {
        return Array.from(document.querySelectorAll('.' + prefix + '-notify-user:checked'))
            .map(function(el) { return String(el.value || '').trim(); })
            .filter(Boolean);
    }

    function toggleNotifyUsers(prefix, forceCheck) {
        const checks = Array.from(document.querySelectorAll('.' + prefix + '-notify-user'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(function(check) { return !check.checked; });
        checks.forEach(function(check) { check.checked = shouldCheck; });
    }

    function _sendManagerNotification(title, body, recipientIds) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return;
        AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: title,
            body: body,
            category: 'manager_notice',
            priority: 'high'
        });
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingIncomingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 입고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="piStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="piEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingIncomingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>입고일</th>
                                        <th>품명</th>
                                        <th>LOT번호</th>
                                        <th>수량</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="piTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('piStart').value;
        const end = document.getElementById('piEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('piTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.lotNo || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.note || '-'}</td>
                <td></td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장 입고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고일</label>
                    <input type="date" class="form-input" id="addPiDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">LOT번호</label>
                    <input type="text" class="form-input" id="addPiLot" placeholder="LOT번호">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPiPart" placeholder="품명">
                </div>
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPiQty" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPiNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingIncomingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPiDate').value,
            lotNo: document.getElementById('addPiLot').value.trim(),
            partName: document.getElementById('addPiPart').value.trim(),
            quantity: Number(document.getElementById('addPiQty').value) || 0,
            note: document.getElementById('addPiNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 사출 창고에서 출고 처리
        await Storage.add(DB.STORES.INJECTION_INVENTORY, {
            date: data.date,
            lotNo: data.lotNo,
            partName: data.partName,
            quantity: data.quantity,
            type: '출고',
            source: '도장 입고'
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장 입고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function renderWorkList() {
        let data = Storage.getByDateRange(
            STORE,
            (document.getElementById('pwStart') || {}).value || _currentDate,
            (document.getElementById('pwEnd') || {}).value || _currentDate
        ).sort((a, b) => {
            const aReg = a.registeredAt || '', bReg = b.registeredAt || '';
            if (bReg && aReg) return bReg.localeCompare(aReg);
            const dc = b.date.localeCompare(a.date);
            return dc !== 0 ? dc : (b.startTime || '').localeCompare(a.startTime || '');
        });

        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');
        const filterCarModel = carModelSel ? carModelSel.value : '';
        const filterPartName = partNameSel ? partNameSel.value : '';
        if (filterCarModel) data = data.filter(d => d.carModel === filterCarModel);
        if (filterPartName) data = data.filter(d => d.partName === filterPartName);

        const totalInput = data.reduce((s, d) => s + (Number(d.inputQty) || 0), 0);
        const totalProd = data.reduce((s, d) => s + (Number(d.productionQty) || 0), 0);
        const totalLoss = data.reduce((s, d) => s + ((Number(d.inputQty) || 0) - (Number(d.productionQty) || 0)), 0);
        const totalReports = data.reduce((s, d) => s + ((d.planReason || d.qtyDiffReason) ? 1 : 0), 0);

        const statsEl = document.getElementById('pwStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalInput)}</div>
                    <div class="stat-card-label">투입 수량</div>
                </div>
                <div class="stat-card cyan">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalProd)}</div>
                    <div class="stat-card-label">산출 수량</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalLoss)}</div>
                    <div class="stat-card-label">공정 LOSS 수량</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalReports)}</div>
                    <div class="stat-card-label">이상보고 건수</div>
                </div>`;
        }

        const tbody = document.getElementById('pwTableBody');
        if (!tbody) return;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:36px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        const users = (typeof AuthModule !== 'undefined' && typeof AuthModule.getUsers === 'function')
            ? (AuthModule.getUsers() || [])
            : [];

        tbody.innerHTML = data.map(d => {
            const lotDisplay = (() => {
                if (d.lots && d.lots.length > 0) {
                    return d.lots.map(l =>
                        '<span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;display:inline-block;margin:1px 2px 1px 0;">' +
                        l.lotNo +
                        (l.qty ? '<span style="color:var(--text-muted);margin-left:3px;">(' + UIUtils.formatNumber(l.qty) + ')</span>' : '') +
                        '</span>'
                    ).join('');
                }
                return d.lotNo
                    ? '<span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;">' + d.lotNo + '</span>'
                    : '-';
            })();

            const timeStr = d.startTime ? d.startTime + (d.endTime ? '~' + d.endTime : '') : '-';
            const ctStr = d.avgCT > 0
                ? '<span style="color:var(--accent-blue);font-size:0.82rem;">' + d.avgCT.toFixed(1) + '초</span>'
                : '-';

            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p => p.carModel === d.carModel && p.partName === d.partName);
            let _cvt = 0;
            if (_prod) {
                for (let i = 1; i <= 4; i++) {
                    const proc = (_prod['process' + i] || '').toLowerCase();
                    if (proc.includes('?꾩옣')) {
                        _cvt = Number(_prod['cvt' + i]) || 0;
                        break;
                    }
                }
                if (!_cvt) _cvt = Number(_prod.cvt1) || 0;
            }

            const inputQty = Number(d.inputQty) || 0;
            const productionQty = Number(d.productionQty) || 0;
            const processLoss = inputQty - productionQty;
            const _spindle = (_cvt > 0 && inputQty > 0) ? Math.ceil(inputQty / _cvt) : 0;
            const cvtStr = _cvt > 0
                ? '<span style="font-weight:700;color:var(--accent-blue);">' + _cvt + '</span>'
                : '<span style="color:var(--text-muted);">-</span>';
            const spindleStr = _spindle > 0
                ? '<span style="font-weight:700;color:var(--accent-green);">' + UIUtils.formatNumber(_spindle) + '</span>' +
                  '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' + UIUtils.formatNumber(inputQty) + '첨' + _cvt + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            const recipientNames = function(ids) {
                return (ids || []).map(function(id) {
                    const user = users.find(function(row) { return String(row.id) === String(id); });
                    return user ? (user.displayName || user.username || user.id) : String(id || '');
                }).filter(Boolean).join(', ');
            };
            const reportItems = [];
            if (d.planReason || d.planReasonDetail) {
                reportItems.push(
                    '<div style="display:flex;flex-direction:column;gap:2px;">' +
                    '<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;width:max-content;">계획 미달</span>' +
                    '<div style="font-size:0.76rem;color:var(--text-primary);">' + (d.planReason || '-') + (d.planReasonDetail ? ' / ' + d.planReasonDetail : '') + '</div>' +
                    (d.planManagerRecipients && d.planManagerRecipients.length ? '<div style="font-size:0.68rem;color:var(--text-muted);">통보: ' + recipientNames(d.planManagerRecipients) + '</div>' : '') +
                    '</div>'
                );
            }
            if (d.qtyDiffReason || d.qtyDiffDetail) {
                reportItems.push(
                    '<div style="display:flex;flex-direction:column;gap:2px;">' +
                    '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;width:max-content;">투입/산출 차이</span>' +
                    '<div style="font-size:0.76rem;color:var(--text-primary);">' + (d.qtyDiffReason || '-') + (d.qtyDiffDetail ? ' / ' + d.qtyDiffDetail : '') + '</div>' +
                    (d.qtyDiffManagerRecipients && d.qtyDiffManagerRecipients.length ? '<div style="font-size:0.68rem;color:var(--text-muted);">통보: ' + recipientNames(d.qtyDiffManagerRecipients) + '</div>' : '') +
                    '</div>'
                );
            }
            const reportHistory = reportItems.length
                ? '<div style="display:flex;flex-direction:column;gap:6px;min-width:180px;">' + reportItems.join('') + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            const isInspectionCompleted = d.inspectionStatus === 'completed';
            const statusBadge = isInspectionCompleted
                ? '<span style="display:inline-block;background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;margin-right:4px;">검사완료</span>'
                : '';
            const overPlanBadge = d.overPlanQty
                ? '<span style="display:inline-block;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="계획수량 초과 등록">초과</span>'
                : '';
            const timeChangeBadge = d.timeReason
                ? '<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="시간변경 ' + (d.timeReason || '') + (d.timeReasonDetail ? ' / ' + d.timeReasonDetail : '') + '">시간변경</span>'
                : '';
            const actionButtons = '<button class="btn btn-sm btn-outline" onclick="PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">보기</button>';

            const regDate = d.registeredAt ? d.registeredAt.slice(0, 10) : '-';
            const wdParts = (d.date || '').split('-');
            const lotShortInc = d.lots && d.lots.length > 0
                ? d.lots.map(l => l.lotNo).join(' / ')
                : (d.lotNo || '');
            const workDateHtml = wdParts.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + wdParts[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + wdParts[1] + '-' + wdParts[2] + '</span>' +
                  (lotShortInc ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;font-family:monospace;">' + lotShortInc + '</div>' : '')
                : (d.date || '-');

            return '<tr style="' + (isInspectionCompleted ? 'background:rgba(22,163,74,0.05);' : '') + '">' +
                '<td style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">' + regDate + '</td>' +
                '<td style="line-height:1.3;">' + workDateHtml + '</td>' +
                '<td>' + (d.line || '-') + '</td>' +
                '<td>' + (d.carModel || '-') + '</td>' +
                '<td>' + (d.partName || '-') + '</td>' +
                '<td>' + (d.color || '-') + '</td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(inputQty) + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + UIUtils.formatNumber(productionQty) + '</td>' +
                '<td style="text-align:right;color:' + (processLoss > 0 ? 'var(--accent-red)' : (processLoss < 0 ? 'var(--accent-blue)' : 'var(--text-primary)')) + ';font-weight:700;">' + UIUtils.formatNumber(processLoss) + '</td>' +
                '<td>' + reportHistory + '</td>' +
                '<td style="font-size:0.82rem;white-space:nowrap;">' + timeStr + '</td>' +
                '<td style="text-align:right;">' + ctStr + '</td>' +
                '<td style="text-align:center;">' + cvtStr + '</td>' +
                '<td style="text-align:right;">' + spindleStr + '</td>' +
                '<td style="white-space:nowrap;">' + overPlanBadge + timeChangeBadge + statusBadge + actionButtons + '</td></tr>';
        }).join('');
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('?곗씠?곌? ?놁뒿?덈떎.', 'warning');
            return;
        }
        const headers = ['작업일', '라인', '차종', '품명', '컬러', '사출LOT', '투입수량', '산출 수량', '공정 LOSS 수량', '이상보고 이력', '투입인원', '시작시간', '완료시간', '평균CT(초)', '비고'];
        const rows = data.map(d => {
            const lotStr = (d.lots && d.lots.length > 0)
                ? d.lots.map(l => l.lotNo + (l.qty ? '(' + l.qty + ')' : '')).join(' / ')
                : (d.lotNo || '');
            const reportHistory = [
                d.planReason ? ('계획 미달: ' + d.planReason + (d.planReasonDetail ? ' / ' + d.planReasonDetail : '')) : '',
                d.qtyDiffReason ? ('투입/산출 차이: ' + d.qtyDiffReason + (d.qtyDiffDetail ? ' / ' + d.qtyDiffDetail : '')) : ''
            ].filter(Boolean).join(' | ');
            return [d.date, d.line, d.carModel, d.partName, d.color, lotStr, d.inputQty, d.productionQty, (Number(d.inputQty) || 0) - (Number(d.productionQty) || 0), reportHistory, d.workers || 0, d.startTime || '', d.endTime || '', d.avgCT || 0, d.note || ''];
        });
        Storage.exportToCSV(headers, rows, '?꾩옣?묒뾽?쇱?');
        UIUtils.toast('?대낫?닿린 ?꾨즺', 'success');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();


// ===================================================================
// 도장 작업일지
// ===================================================================
const PaintingWorkModule = (function() {
    const STORE = DB.STORES.PAINTING_WORK;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const INJ_INV_STORE = DB.STORES.INJECTION_INVENTORY;
    const INJECTMAT_STORE = DB.STORES.INJECTION_MATERIALS;

    // 현재 선택된 날짜/라인 (모듈 내 상태)
    let _currentDate = '';
    let _currentLine = '도장-A';


    function _getNotifyUsersByRole() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce(function(map, role) {
            map[role.key] = role;
            return map;
        }, {});
        return users
            .filter(function(user) { return user && user.active !== false; })
            .map(function(user) {
                const role = roleMap[user.role] || null;
                return {
                    id: String(user.id || ''),
                    name: String(user.displayName || user.username || user.id || ''),
                    role: String(user.role || ''),
                    roleLabel: role ? role.label : String(user.role || ''),
                    roleColor: role ? role.color : 'var(--text-muted)'
                };
            });
    }

    function _buildNotifySelectorHtml(prefix, helpText) {
        const isPlanNotify = (prefix === 'plan' || prefix === 'editPlan');
        let users = _getNotifyUsersByRole();
        if (isPlanNotify) users = users.filter(function(u) { return u.role === 'prod_manager'; });
        if (!users.length) {
            return '<div style="margin-top:10px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 통보 대상 사용자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(function(user) {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(function(key) {
            const group = groups[key];
            return '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<div style="font-size:0.78rem;font-weight:700;color:' + group.color + ';">' + group.label + '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">' +
                group.items.map(function(user) {
                    return '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.18);border-radius:8px;background:#fff;cursor:pointer;">' +
                        '<input type="checkbox" class="' + prefix + '-notify-user" value="' + user.id + '" style="width:16px;height:16px;accent-color:#dc2626;">' +
                        '<span style="font-size:0.82rem;color:var(--text-primary);font-weight:600;">' + user.name + '</span>' +
                        '</label>';
                }).join('') +
                '</div>' +
                '</div>';
        }).join('');
        return '<div style="margin-top:10px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:10px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
            '<div style="font-size:0.8rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.toggleNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">' + helpText + '</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:12px;max-height:210px;overflow:auto;">' + roleBlocks + '</div>' +
            '</div>';
    }

    function _getSelectedNotifyUsers(prefix) {
        return Array.from(document.querySelectorAll('.' + prefix + '-notify-user:checked'))
            .map(function(el) { return String(el.value || '').trim(); })
            .filter(Boolean);
    }

    function toggleNotifyUsers(prefix, forceCheck) {
        const checks = Array.from(document.querySelectorAll('.' + prefix + '-notify-user'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(function(check) { return !check.checked; });
        checks.forEach(function(check) { check.checked = shouldCheck; });
    }

    function _sendManagerNotification(title, body, recipientIds) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return;
        AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: title,
            body: body,
            category: 'manager_notice',
            priority: 'high'
        });
    }

    function render(container) {
        _currentDate = UIUtils.today();
        _currentLine = '도장-A';

        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 페이지 목적 안내 -->
                <div style="margin-bottom:0.75rem;padding:8px 14px;background:rgba(37,99,235,0.05);border-left:3px solid var(--accent-blue);border-radius:0 6px 6px 0;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:var(--accent-blue);margin-right:4px;">info</span>
                    <span style="font-size:0.82rem;color:var(--text-secondary);">
                        도장 완료 작업의 실적을 계획 대비 기록하고 공정 효율을 추적합니다.
                    </span>
                </div>
                <!-- 섹션 1: 생산계획 현황 (A/B 라인 동시 표시) -->
                <div class="card" style="margin-bottom:1rem;">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">assignment</span>
                            생산계획 현황
                            <span id="pwPlanDateLabel" style="color:var(--text-muted);font-size:0.88rem;margin-left:8px;font-weight:400;"></span>
                        </h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">계획 행의 [실적입력]을 클릭하면 해당 계획이 자동 반영됩니다.</span>
                    </div>
                    <div class="card-body" style="padding:12px; display:flex; flex-direction:column; gap:16px;">
                        <!-- 도장-A 계획 -->
                        <div style="width:100%;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-blue); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-blue);">도장-A</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px;">
                                <table class="data-table compact">
                                    <thead>
                                        <tr>
                                            <th style="width:100px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:70px;">계획</th>
                                            <th style="text-align:right;width:70px;">실적</th>
                                            <th style="width:90px;">달성률</th>
                                            <th style="width:85px;">입력</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwPlanBodyA"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- 도장-B 계획 -->
                        <div style="width:100%;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-orange); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-orange);">도장-B</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px;">
                                <table class="data-table compact">
                                    <thead>
                                        <tr>
                                            <th style="width:100px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:70px;">계획</th>
                                            <th style="text-align:right;width:70px;">실적</th>
                                            <th style="width:90px;">달성률</th>
                                            <th style="width:85px;">입력</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwPlanBodyB"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 섹션 2: 실적 미입력 계획 (2열 분리) -->
                <div id="pwUnenteredSection" class="card" style="margin-bottom:1rem; border-top:3px solid var(--accent-orange); display:none;">
                    <div class="card-header" style="padding:8px 16px; background:rgba(255,152,0,0.05);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0; color:#e65100;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">warning</span>
                            실적 미입력 계획 (전일 이전)
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">계획은 있으나 실적이 등록되지 않은 항목입니다.</span>
                    </div>
                    <div class="card-body" style="padding:12px; display:flex; gap:0; flex-wrap:wrap;">
                        <!-- 도장-A -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-blue); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-blue);">도장-A</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow-y:auto;">
                                <table class="data-table compact">
                                    <thead style="position:sticky; top:0; z-index:1;">
                                        <tr>
                                            <th style="width:90px;">도장 작업일</th>
                                            <th style="width:95px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:65px;">계획</th>
                                            <th style="width:150px;">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwUnenteredBodyA"></tbody>
                                </table>
                            </div>
                        </div>
                        <!-- 구분선 -->
                        <div style="width:1px; background:var(--border-color); margin:0 12px; align-self:stretch;"></div>
                        <!-- 도장-B -->
                        <div style="flex:1; min-width:480px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span style="width:12px; height:12px; background:var(--accent-orange); border-radius:3px;"></span>
                                <h5 style="margin:0; color:var(--accent-orange);">도장-B</h5>
                            </div>
                            <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow-y:auto;">
                                <table class="data-table compact">
                                    <thead style="position:sticky; top:0; z-index:1;">
                                        <tr>
                                            <th style="width:90px;">도장 작업일</th>
                                            <th style="width:95px;">시간대</th>
                                            <th>차종/품명</th>
                                            <th style="text-align:right;width:65px;">계획</th>
                                            <th style="width:150px;">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pwUnenteredBodyB"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 섹션 3: 작업 실적 통계 + 목록 -->
                <div class="card">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">format_paint</span>
                            작업 실적 목록
                        </h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                            <label class="form-label" style="margin:0; font-size:0.82rem; white-space:nowrap;">기간</label>
                            <input type="date" class="form-input" id="pwStart" value="${_currentDate}" style="width:130px;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="pwEnd" value="${_currentDate}" style="width:130px;">
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">차종</label>
                            <select class="form-select" id="pwFilterCarModel" style="width:120px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">품명</label>
                            <select class="form-select" id="pwFilterPartName" style="width:150px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.renderWorkList()">
                                <span class="material-symbols-outlined" style="font-size:15px;">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="width:60px;">등록일</th>
                                        <th style="width:60px;">도장작업일</th>
                                        <th style="width:100px;">라인</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>사출 LOT</th>
                                        <th style="text-align:right;">투입수량</th>
                                        <th style="text-align:right;">완료수량</th>
                                        <th style="text-align:right;">불량</th>
                                        <th>작업시간</th>
                                        <th style="text-align:right;">작업C.T</th>
                                        <th style="text-align:right;">효율</th>
                                        <th style="text-align:center;">CVT</th>
                                        <th style="text-align:right;">SPINDLE 수</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        loadAll();
    }

    // 라인 탭 전환
    function setLine(line) {
        _currentLine = line;
        loadAll();
    }

    function onDateChange() {
        const el = document.getElementById('pwDate');
        if (el) _currentDate = el.value;
        loadAll();
    }

    function loadAll() {
        renderPlanSummary();
        renderUnenteredPlans();
        renderWorkList();
    }

    // ──────────────────────────────────────────────
    // 실적 미입력 계획 렌더링
    // ──────────────────────────────────────────────
    function renderUnenteredPlans() {
        const section = document.getElementById('pwUnenteredSection');
        const bodyA = document.getElementById('pwUnenteredBodyA');
        const bodyB = document.getElementById('pwUnenteredBodyB');
        if (!section || !bodyA || !bodyB) return;

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];

        // 전일 이전 실적 누락 항목 필터링 (입력될 때까지 계속 표시)
        const today = UIUtils.today();

        const unentered = allPlans.filter(p => {
            if (!p.date || p.date >= today) return false;  // 오늘 이후 제외
            if (!(p.carModel || p.partName)) return false;
            return !allWorks.some(w => w.planId === p.id);
        }).sort((a, b) => b.date.localeCompare(a.date) || (a.startTime || '').localeCompare(b.startTime || ''));

        if (unentered.length === 0) {
            section.style.display = 'none';
            return;
        }

        // A라인 / B라인 분리 (line 값에 'b' 또는 'B' 포함이면 B라인)
        const isLineB = p => /b/i.test(p.line || '');
        const listA = unentered.filter(p => !isLineB(p));
        const listB = unentered.filter(p =>  isLineB(p));

        const makeRow = p => {
            const timeStr = p.startTime ? `${p.startTime}~${p.endTime || ''}` : (p.slot || '-');
            const infoStr = `<strong>${p.carModel || ''}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${p.partName || ''}</span>`;
            return `
                <tr>
                    <td style="font-size:0.82rem;">${p.date}</td>
                    <td style="font-size:0.82rem;">${timeStr}</td>
                    <td style="line-height:1.2;">${infoStr}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(p.planQty)}</td>
                    <td style="display:flex; gap:4px; align-items:center;">
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.82rem; background:var(--accent-blue); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px rgba(66,133,244,0.15); white-space:nowrap; height:32px; min-width:90px; justify-content:center; line-height:1;"
                            onclick="PaintingWorkModule.openAddModalFromPlan('${p.id}')"
                            onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';"
                            onmouseout="this.style.filter='none';this.style.transform='none';">
                            <span class="material-symbols-outlined" style="font-size:16px;">edit_note</span>
                            <span>입력</span>
                        </button>
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.82rem; background:var(--accent-red); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px rgba(244,67,54,0.15); white-space:nowrap; height:32px; min-width:90px; justify-content:center; line-height:1;"
                            onclick="PaintingWorkModule.deletePlan('${p.id}', '${p.date}', '${p.line}', '${p.startTime || p.slot}')"
                            onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';"
                            onmouseout="this.style.filter='none';this.style.transform='none';">
                            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                            <span>삭제</span>
                        </button>
                    </td>
                </tr>`;
        };

        const emptyRow = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.82rem;">미입력 계획 없음</td></tr>';

        section.style.display = 'block';
        bodyA.innerHTML = listA.length ? listA.map(makeRow).join('') : emptyRow;
        bodyB.innerHTML = listB.length ? listB.map(makeRow).join('') : emptyRow;
    }

    // ──────────────────────────────────────────────
    // 생산계획 현황 렌더링
    // ──────────────────────────────────────────────
    function renderPlanSummary() {
        const bodyA = document.getElementById('pwPlanBodyA');
        const bodyB = document.getElementById('pwPlanBodyB');
        const label = document.getElementById('pwPlanDateLabel');
        if (!bodyA || !bodyB) return;

        const todayDate = UIUtils.today();  // 생산계획 현황은 항상 당일 고정
        if (label) label.textContent = `(${todayDate})`;

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];

        // 라인별 렌더링 수행 (당일 고정)
        bodyA.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-A', todayDate);
        bodyB.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-B', todayDate);
    }

    // 라인별 계획 데이터 HTML 생성 헬퍼
    function _renderLinePlanData(allPlans, allWorks, line, targetDate) {
        if (!targetDate) targetDate = UIUtils.today();
        const plans = allPlans.filter(p =>
            p.date === targetDate &&
            p.line === line &&
            (p.carModel || p.partName)
        ).sort((a, b) =>
            (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || '')
        );

        const dayWorks = allWorks.filter(w =>
            w.date === targetDate && w.line === line
        );

        if (plans.length === 0) {
            return `
                <tr>
                    <td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">
                        등록된 계획 없음
                    </td>
                </tr>`;
        }

        return plans.map(plan => {
            const planQty = Number(plan.planQty) || 0;
            const achieved = dayWorks.filter(w =>
                w.carModel === plan.carModel &&
                w.partName === plan.partName &&
                w.color === plan.color
            ).reduce((s, w) => s + (Number(w.productionQty) || 0), 0);

            const rate = planQty > 0 ? Math.min(100, Math.round(achieved / planQty * 100)) : 0;
            const rateColor = rate >= 100 ? 'var(--accent-green)' : (rate >= 70 ? 'var(--accent-blue)' : (rate > 0 ? 'var(--accent-orange)' : 'var(--text-muted)'));

            const timeStr = plan.startTime ? `${plan.startTime}~${plan.endTime || ''}` : (plan.slot || '-');
            const infoStr = `<strong>${plan.carModel || ''}</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">${plan.partName || ''} (${plan.color || '-'})</span>`;

            const isCompleted = dayWorks.some(w => w.planId === plan.id);

            // 오늘 계획이고 시작시간이 현재보다 미래면 → 대기 상태 (실적 없는 경우에만)
            const _nowD = new Date();
            const _nowTimeStr = _nowD.getHours().toString().padStart(2,'0') + ':' + _nowD.getMinutes().toString().padStart(2,'0');
            const _planStart = plan.startTime || plan.slot || '';
            const isFuture = !isCompleted && (targetDate === UIUtils.today()) && !!_planStart && _planStart > _nowTimeStr;

            const btnText   = isCompleted ? '입력 완료' : (isFuture ? '대기' : '실적입력');
            const btnIcon   = isCompleted ? 'check_circle' : (isFuture ? 'schedule' : 'edit_note');
            const btnBg     = isCompleted ? 'var(--accent-green)' : (isFuture ? '#94a3b8' : 'var(--accent-blue)');
            const btnShadow = isCompleted ? 'rgba(76,175,80,0.2)' : (isFuture ? 'rgba(0,0,0,0.06)' : 'rgba(66,133,244,0.2)');
            const btnOpacity = isCompleted ? '0.85' : (isFuture ? '0.65' : '1');
            const btnDisabled = isCompleted || isFuture;
            const btnOnclick = isCompleted
                ? `UIUtils.toast('이미 실적이 등록된 계획입니다.', 'info')`
                : isFuture
                    ? `UIUtils.toast('아직 시작되지 않은 계획입니다.', 'info')`
                    : `PaintingWorkModule.openAddModalFromPlan('${plan.id}')`;

            return `
                <tr>
                    <td style="font-size:0.82rem; white-space:nowrap;">${timeStr}</td>
                    <td style="line-height:1.2;">${infoStr}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(planQty)}</td>
                    <td style="text-align:right; font-weight:600; color:${rateColor};">${UIUtils.formatNumber(achieved)}</td>
                    <td>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                                <div style="width:${rate}%;height:100%;background:${rateColor};"></div>
                            </div>
                            <span style="font-size:0.75rem;min-width:28px;text-align:right;">${rate}%</span>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.8rem; background:${btnBg}; color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px ${btnShadow}; white-space:nowrap; width:max-content; opacity:${btnOpacity}; cursor:${btnDisabled ? 'default' : 'pointer'};"
                            onclick="${btnOnclick}"
                            ${!btnDisabled ? `onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';" onmouseout="this.style.filter='none';this.style.transform='none';"` : ''}>
                            <span class="material-symbols-outlined" style="font-size:16px;">${btnIcon}</span>
                            ${btnText}
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 작업 실적 목록 렌더링
    // ──────────────────────────────────────────────
    function renderWorkList() {
        const startEl = document.getElementById('pwStart');
        const endEl = document.getElementById('pwEnd');
        const start = startEl ? startEl.value : _currentDate;
        const end = endEl ? endEl.value : _currentDate;

        // 등록일(registeredAt) 기준 필터 — 없는 구 데이터는 작업일로 대체
        let data = Storage.getAll(STORE)
            .filter(d => {
                const regDate = d.registeredAt ? d.registeredAt.slice(0, 10) : (d.date || '');
                return regDate >= start && regDate <= end;
            })
            .sort((a, b) => {
                const aReg = a.registeredAt || '';
                const bReg = b.registeredAt || '';
                if (aReg && bReg) return bReg.localeCompare(aReg);
                if (bReg) return 1;   // b만 등록일 있음 → b 위로
                if (aReg) return -1;  // a만 등록일 있음 → a 위로
                // 둘 다 없으면 작업일 내림차순
                const dc = b.date.localeCompare(a.date);
                return dc !== 0 ? dc : (b.startTime || '').localeCompare(a.startTime || '');
            });

        // 차종·품명 드롭다운 초기화 (unique 값 수집)
        const uniqueCarModels = UIUtils.sortCarModels(data.map(d => d.carModel));
        const uniquePartNames = [...new Set(data.map(d => d.partName).filter(Boolean))].sort();

        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');

        if (carModelSel) {
            const currentCarModel = carModelSel.value;
            carModelSel.innerHTML = '<option value="">전체</option>' +
                uniqueCarModels.map(m => `<option value="${m}" ${currentCarModel === m ? 'selected' : ''}>${m}</option>`).join('');
        }

        if (partNameSel) {
            const currentPartName = partNameSel.value;
            partNameSel.innerHTML = '<option value="">전체</option>' +
                uniquePartNames.map(p => `<option value="${p}" ${currentPartName === p ? 'selected' : ''}>${p}</option>`).join('');
        }

        // 필터 값 읽기
        const filterCarModel = carModelSel ? carModelSel.value : '';
        const filterPartName = partNameSel ? partNameSel.value : '';

        // 필터 적용
        if (filterCarModel) {
            data = data.filter(d => d.carModel === filterCarModel);
        }
        if (filterPartName) {
            data = data.filter(d => d.partName === filterPartName);
        }

        const tbody = document.getElementById('pwTableBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:36px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            // LOT 표시: lots 배열 우선, 없으면 단일 lotNo
            const lotDisplay = (() => {
                if (d.lots && d.lots.length > 0) {
                    return d.lots.map(l =>
                        '<span style="background:var(--bg-secondary);border:1px solid var(--border);' +
                        'border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;' +
                        'display:inline-block;margin:1px 2px 1px 0;">' + l.lotNo +
                        (l.qty ? '<span style="color:var(--text-muted);margin-left:3px;">(' + UIUtils.formatNumber(l.qty) + ')</span>' : '') +
                        '</span>'
                    ).join('');
                }
                return d.lotNo ?
                    '<span style="background:var(--bg-secondary);border:1px solid var(--border);' +
                    'border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;">' + d.lotNo + '</span>' :
                    '-';
            })();

            const timeStr = d.startTime ?
                d.startTime + (d.endTime ? '~' + d.endTime : '') :
                '-';
            // 기본C.T: 생산계획의 시간/수량으로 계산
            const _plan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
            let _baseCT = 0;
            if (_plan && _plan.startTime && _plan.endTime && Number(_plan.planQty) > 0) {
                const _bsh = parseInt(_plan.startTime.split(':')[0]);
                const _bsm = parseInt(_plan.startTime.split(':')[1]);
                const _beh = parseInt(_plan.endTime.split(':')[0]);
                const _bem = parseInt(_plan.endTime.split(':')[1]);
                const _pm = (_beh * 60 + _bem) - (_bsh * 60 + _bsm);
                if (_pm > 0) _baseCT = (_pm * 60) / Number(_plan.planQty);
            }

            const ctStr = d.avgCT > 0
                ? '<span style="color:var(--accent-blue);font-size:0.84rem;font-weight:600;">' + d.avgCT.toFixed(1) + '초</span>' +
                  (_baseCT > 0 ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:1px;">기본 ' + _baseCT.toFixed(1) + '초</div>' : '')
                : '-';

            const effStr = (() => {
                if (!d.avgCT || !_baseCT) return '<span style="color:var(--text-muted);">-</span>';
                const eff = Math.round(_baseCT / d.avgCT * 100);
                const color = eff >= 100 ? '#16a34a' : eff >= 85 ? '#d97706' : '#dc2626';
                return '<span style="font-weight:700;color:' + color + ';">' + eff + '%</span>';
            })();

            // CVT: 제품 마스터에서 도장 공정 슬롯의 cvt 값 조회
            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p => p.carModel === d.carModel && p.partName === d.partName);
            let _cvt = 0;
            if (_prod) {
                for (let i = 1; i <= 4; i++) {
                    const proc = (_prod['process' + i] || '').toLowerCase();
                    if (proc.includes('도장')) {
                        _cvt = Number(_prod['cvt' + i]) || 0;
                        break;
                    }
                }
                if (!_cvt) _cvt = Number(_prod.cvt1) || 0; // 폴백: 첫번째 슬롯
            }
            const _inputQty  = Number(d.inputQty) || 0;
            const _spindle   = (_cvt > 0 && _inputQty > 0) ? Math.ceil(_inputQty / _cvt) : 0;
            const cvtStr     = _cvt > 0
                ? '<span style="font-weight:700;color:var(--accent-blue);">' + _cvt + '</span>'
                : '<span style="color:var(--text-muted);">-</span>';
            const spindleStr = _spindle > 0
                ? '<span style="font-weight:700;color:var(--accent-green);">' + UIUtils.formatNumber(_spindle) + '</span>' +
                  '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' +
                  UIUtils.formatNumber(_inputQty) + '÷' + _cvt + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            // 검사 완료 여부 확인
            const isInspectionCompleted = d.inspectionStatus === 'completed';
            const statusBadge = isInspectionCompleted ?
                '<span style="display:inline-block; background:var(--accent-green); color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; margin-right:4px;">✓ 검사완료</span>' :
                '';

            // 계획수량 초과 배지
            const overPlanBadge = d.overPlanQty
                ? '<span style="display:inline-block;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="계획수량 초과 등록됨">⚠ 초과</span>'
                : '';

            // 시간 변동 / 관리자 통보 배지
            const timeChangeBadge = d.timeReason
                ? '<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="시간변동: ' + (d.timeReason || '') + (d.timeReasonDetail ? ' / ' + d.timeReasonDetail : '') + '">⏱ 시간변동</span>'
                : '';

            const _cu = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
            const _isAdmin = _cu && _cu.role === 'admin';
            const deleteBtn = _isAdmin
                ? '<button class="btn btn-sm btn-danger" onclick="PaintingWorkModule.removeWork(\'' + d.id + '\')" style="margin-left:4px;">삭제</button>'
                : '';
            const actionButtons = '<button class="btn btn-sm btn-outline" onclick="PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">보기</button>' + deleteBtn;

            const regDateRaw = d.registeredAt ? d.registeredAt.slice(0, 10) : '';
            const regParts = regDateRaw.split('-');
            const regTimeRaw = d.registeredAt && d.registeredAt.length >= 16 ? d.registeredAt.slice(11, 16) : '';
            const regDate = regParts.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + regParts[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + regParts[1] + '-' + regParts[2] + '</span>' +
                  (regTimeRaw ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + regTimeRaw + '</span>' : '')
                : '<span style="color:var(--text-muted);">-</span>';
            const workDateParts = (d.date || '').split('-');
            const workStartTime = (d.startTime || '').slice(0, 5);
            const lotShort = d.lots && d.lots.length > 0
                ? d.lots.map(l => l.lotNo).join(' / ')
                : (d.lotNo || '');
            const workDateHtml = workDateParts.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + workDateParts[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + workDateParts[1] + '-' + workDateParts[2] + '</span>' +
                  (workStartTime ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + workStartTime + '</span>' : '')
                : (d.date || '-');
            return '<tr style="' + (isInspectionCompleted ? 'background:rgba(22,163,74,0.05);' : '') + '">' +
                '<td style="line-height:1.3;">' + regDate + '</td>' +
                '<td style="line-height:1.3;">' + workDateHtml + '</td>' +
                '<td>' + (d.line || '-') + '</td>' +
                '<td>' + (d.carModel || '-') + '</td>' +
                '<td>' + (d.partName || '-') + '</td>' +
                '<td>' + (d.color || '-') + '</td>' +
                '<td>' + lotDisplay + '</td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(d.inputQty) + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + UIUtils.formatNumber(d.productionQty) + '</td>' +
                '<td style="text-align:right;color:var(--accent-red);">' + UIUtils.formatNumber(d.defectQty) + '</td>' +
                '<td style="font-size:0.82rem;white-space:nowrap;">' + timeStr + '</td>' +
                '<td style="text-align:right;line-height:1.4;">' + ctStr + '</td>' +
                '<td style="text-align:right;">' + effStr + '</td>' +
                '<td style="text-align:center;">' + cvtStr + '</td>' +
                '<td style="text-align:right;">' + spindleStr + '</td>' +
                '<td style="white-space:nowrap;">' + overPlanBadge + timeChangeBadge + statusBadge + actionButtons + '</td></tr>';
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 사출 LOT 목록 (잔량 계산)
    // ──────────────────────────────────────────────
    function getInjectionLots(carModel, partName) {
        const all = Storage.getAll(INJ_INV_STORE) || [];
        const lotMap = {};
        all.forEach(item => {
            if (!item.lotNo) return;
            const matchModel = !carModel || item.carModel === carModel;
            const matchPart = !partName || item.partName === partName;
            // ★ AND 조건: carModel과 partName 모두 일치해야 함 (OR 조건으로 인한 다른 제품 로트 혼입 방지)
            if (!matchModel || !matchPart) return;
            const key = item.lotNo;
            if (!lotMap[key]) {
                lotMap[key] = {
                    lotNo: item.lotNo,
                    carModel: item.carModel || '',
                    partName: item.partName || '',
                    supplier: item.supplier || '',
                    balance: 0
                };
            }
            if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
            else lotMap[key].balance += Number(item.quantity) || 0;
        });
        return Object.values(lotMap).filter(l => l.balance > 0)
            .sort((a, b) => a.lotNo.localeCompare(b.lotNo)); // 선입선출: 오래된 LOT 먼저
    }

    function buildLotOptionsHtml(carModel, partName) {
        const lots = getInjectionLots(carModel, partName);
        if (lots.length === 0) return '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>';
        return lots.map((l, i) =>
            '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') + ' data-balance="' + l.balance + '">' +
            l.lotNo + ' │ ' + (l.partName || l.carModel) +
            ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>'
        ).join('');
    }

    // ──────────────────────────────────────────────
    // 사출 컬러 매칭 헬퍼 (대소문자 무시, 복합색 지원)
    // matColor: 자재의 injColor ("BLACK" / "BLACK,GRAY" 등)
    // planColor: 생산계획의 color ("BLACK" / "6PS" 등)
    // ──────────────────────────────────────────────
    function _injColorMatches(matColor, planColor) {
        if (!matColor || !planColor) return true; // 한쪽이라도 없으면 허용
        var mc = matColor.trim().toLowerCase().replace(/\s+/g, '');
        var pc = planColor.trim().toLowerCase().replace(/\s+/g, '');
        if (mc === pc) return true;
        return mc.split(/[,，\/]/).map(function(c) { return c.trim(); })
            .some(function(c) { return c === pc; });
    }

    // ──────────────────────────────────────────────
    // 사출자재 마스터 기반 사출명 조회 헬퍼
    // ──────────────────────────────────────────────
    // 생산계획 품명(planPartName) + 차종 + 컬러 → 사출자재 제작품명1/2 매칭 → injPartName 목록 반환
    function getInjPartNamesForProduct(planPartName, carModel, planColor) {
        if (!planPartName) return [];
        var materials = Storage.getAll(INJECTMAT_STORE) || [];
        var seen = {};
        return materials.filter(function(m) {
            var nameMatch  = m.mfgProductName === planPartName || m.mfgProductName2 === planPartName;
            var modelMatch = !carModel   || m.carModel === carModel;
            var colorMatch = _injColorMatches(m.injColor, planColor || '');
            return nameMatch && modelMatch && colorMatch && m.injPartName
                && !seen[m.injPartName] && (seen[m.injPartName] = true);
        });
    }

    // 사출자재 마스터 미등록 시 사출 창고 partName에서 직접 후보 탐색
    // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 필터 없이 품명 포함만 검색
    function getInjPartNamesFromInventory(planPartName) {
        if (!planPartName) return [];
        var lower = planPartName.toLowerCase();
        var all = Storage.getAll(INJ_INV_STORE) || [];
        var seen = {};
        return all.filter(function(item) {
            if (!item.partName) return false;
            var nameMatch = item.partName.toLowerCase().indexOf(lower) !== -1
                         || item.partName.toLowerCase() === lower;
            return nameMatch && !seen[item.partName] && (seen[item.partName] = true);
        }).map(function(item) {
            return { injPartName: item.partName };
        });
    }

    // 사출명 <option> HTML 빌드 (단일 매칭 시 자동 selected)
    function buildInjPartOptionsHtml(planPartName, carModel, planColor) {
        // ① 컬러 + 차종 일치 우선
        var parts = getInjPartNamesForProduct(planPartName, carModel, planColor);
        // ② 차종 무관 (컬러 유지)
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', planColor);
        }
        // ③ 도장 컬러 ≠ 사출 소재 컬러인 경우를 위한 폴백 — 컬러 필터 없이 품명+차종만 매칭
        //    예: 도장 DYS → 사출 소재 GRAY (컬러가 달라도 품명 연결로 매칭)
        if (parts.length === 0) {
            parts = getInjPartNamesForProduct(planPartName, carModel, '');
        }
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', '');
        }
        // ④ 사출자재 마스터 미등록 시 사출 창고에서 직접 탐색
        if (parts.length === 0) {
            parts = getInjPartNamesFromInventory(planPartName);
        }
        if (parts.length === 0) {
            return '<option value="">-- 사출자재 미등록 (전체 LOT 표시) --</option>';
        }
        var autoSelect = parts.length === 1;
        var opts = parts.map(function(m) {
            return '<option value="' + m.injPartName + '"' + (autoSelect ? ' selected' : '') + '>' +
                m.injPartName + '</option>';
        }).join('');
        return (parts.length > 1 ? '<option value="">-- 사출명 선택 --</option>' : '') + opts;
    }

    // injPartName으로 사출 창고 LOT를 조회
    // planColor: 사출 소재 컬러와 일치하는 LOT 우선 — 불일치 시 전체 반환 (폴백)
    // 도장 컬러(DYS 등)와 사출 소재 컬러(GRAY 등)가 다를 수 있으므로
    // 컬러 필터 후 결과가 없으면 해당 injPartName의 전체 LOT를 반환
    function getInjectionLotsByInjPart(injPartName, planColor) {
        var all = Storage.getAll(INJ_INV_STORE) || [];
        var lotMap = {};
        all.forEach(function(item) {
            if (!item.lotNo) return;
            if (injPartName && item.partName !== injPartName) return;
            var key = item.lotNo;
            if (!lotMap[key]) {
                lotMap[key] = {
                    lotNo:     item.lotNo,
                    partName:  item.partName  || '',
                    carModel:  item.carModel  || '',
                    color:     item.color     || '',
                    balance:   0
                };
            }
            if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
            else                      lotMap[key].balance += Number(item.quantity) || 0;
        });
        var allLots = Object.values(lotMap).filter(function(l) {
            return l.balance > 0;
        }).sort(function(a, b) {
            return a.lotNo.localeCompare(b.lotNo); // 선입선출
        });
        // 컬러 필터: 도장 컬러와 사출 소재 컬러가 일치하면 해당 LOT만 반환
        // 불일치(DYS vs GRAY 등)이면 전체 반환 — 소재 컬러는 도장 컬러와 다를 수 있음
        if (planColor) {
            var filtered = allLots.filter(function(l) {
                if (!l.color) return true;
                return _injColorMatches(l.color, planColor);
            });
            if (filtered.length > 0) return filtered;
        }
        return allLots;
    }

    // injPartName 기반 LOT <option> HTML 빌드 (컬러 필터 + 컬러 표시)
    function buildLotOptionsHtmlByInjPart(injPartName, planColor) {
        var lots = getInjectionLotsByInjPart(injPartName, planColor);
        if (lots.length === 0) return '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>';
        return lots.map(function(l, i) {
            var colorTag = l.color ? ' │ ' + l.color : '';
            return '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') + ' data-balance="' + l.balance + '">' +
                l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
        }).join('');
    }

    // 사출명 드롭다운 변경 → 모든 LOT 행 드롭다운 갱신 + LOT 추가 버튼 활성화 제어
    function onInjPartSelect(sel) {
        var injPartName = sel ? sel.value : '';
        var planColor   = (document.getElementById('addPwColorHidden') || {}).value || '';
        var lotsHtml;
        var lotCount;
        if (injPartName) {
            var lots = getInjectionLotsByInjPart(injPartName, planColor);
            lotCount = lots.length;
            lotsHtml = lotCount === 0 ?
                '<option value="" data-balance="">-- 해당 LOT 없음 (직접입력 가능) --</option>' :
                '<option value="" data-balance="">-- LOT 선택 --</option>' + lots.map(function(l) {
                    var colorTag = l.color ? ' │ ' + l.color : '';
                    return '<option value="' + l.lotNo + '" data-balance="' + l.balance + '">' +
                        l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                        ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
                }).join('');
        } else {
            var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
            // pn은 제품명(생산계획)이므로 사출 창고 partName과 다름 → carModel 전체 조회
            lotCount = getInjectionLots(cm, '').length;
            lotsHtml = buildLotOptionsHtml(cm, '');
        }
        document.querySelectorAll('#pwLotRows .pw-lot-sel').forEach(function(s) {
            s.innerHTML = lotsHtml;
            // 선입선출: 드롭다운 변경 시 텍스트 입력도 선택된 LOT로 동기화
            if (s.value) {
                var row = s.closest('.pw-lot-row');
                if (row) {
                    var inp = row.querySelector('.pw-lot-no');
                    if (inp) inp.value = s.value;
                }
            }
        });
        // LOT 추가 버튼 활성화 여부 갱신
        var btn = document.getElementById('pwAddLotBtn');
        if (btn) {
            btn.disabled = lotCount <= 1;
            btn.title = lotCount <= 1 ? '사출 창고 LOT가 1개 이하여서 추가할 수 없습니다' : '';
        }
    }

    // ──────────────────────────────────────────────
    // LOT 다중 행 헬퍼
    // ──────────────────────────────────────────────

    // 현재 선택된 LOT 번호 목록 (excludeRow 제외)
    function _getSelectedLotNos(excludeRow) {
        var selected = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (excludeRow && row === excludeRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (sel && sel.value) selected.push(sel.value);
        });
        return selected;
    }

    // 선택 제외 목록을 반영한 LOT 옵션 HTML 생성 (데이터-balance 포함, 컬러 필터)
    // ★ 사출명 지정 시: 해당 사출명 LOT만 표시 (다른 부품 LOT 혼입 방지)
    // ★ 사출명 미지정 시: carModel 전체 창고 재고 표시
    function _buildFilteredLotOptions(injPartName, carModel, partName, excludeLotNos) {
        var planColor = (document.getElementById('addPwColorHidden') || {}).value || '';

        var primaryLots, otherLots;

        if (injPartName) {
            // 사출명 지정: 해당 사출명 LOT만 표시, 다른 사출명(1SPOT↔3SPOT 등) 혼입 없음
            primaryLots = getInjectionLotsByInjPart(injPartName, planColor);
            otherLots   = []; // 물리적으로 다른 부품이므로 표시 안 함
        } else {
            // 사출명 미지정(사출자재 마스터 미등록): carModel 전체를 창고 전체 재고로 표시
            primaryLots = [];
            otherLots   = getInjectionLots(carModel || '', '');
        }

        // excludeLotNos 제거
        function applyExclude(arr) {
            if (!excludeLotNos || excludeLotNos.length === 0) return arr;
            return arr.filter(function(l) { return excludeLotNos.indexOf(l.lotNo) < 0; });
        }
        var filteredPrimary = applyExclude(primaryLots);
        var filteredOther   = applyExclude(otherLots);

        if (filteredPrimary.length === 0 && filteredOther.length === 0)
            return '<option value="">-- 사출 창고 재고 없음 --</option>';

        function lotOptionHtml(l) {
            var colorTag = l.color ? ' │ ' + l.color : '';
            return '<option value="' + l.lotNo + '" data-balance="' + l.balance + '">' +
                l.lotNo + ' │ ' + (l.partName || l.carModel) + colorTag +
                ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA</option>';
        }

        var html = '<option value="" data-balance="">-- LOT 선택 --</option>';

        if (filteredPrimary.length > 0) {
            html += '<optgroup label="▶ 사출명 일치 LOT">';
            html += filteredPrimary.map(lotOptionHtml).join('');
            html += '</optgroup>';
        }
        if (filteredOther.length > 0) {
            html += '<optgroup label="▶ 창고 전체 재고">';
            html += filteredOther.map(lotOptionHtml).join('');
            html += '</optgroup>';
        }
        return html;
    }

    // 선택된 LOT의 재고 잔량을 qty 입력의 max로 설정
    function _updateLotQtyMax(row, lotNo) {
        if (!row) return;
        var qtyInp = row.querySelector('.pw-lot-qty');
        if (!qtyInp) return;
        if (!lotNo) { qtyInp.removeAttribute('max'); return; }
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        // 창고 전체 LOT에서 잔량 조회 (사출명 필터 없이)
        var allLots = getInjectionLots(cm, '');
        var lot = allLots.find(function(l) { return l.lotNo === lotNo; });
        if (lot) {
            qtyInp.max = lot.balance;
            qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(lot.balance);
        }
    }

    // 다른 LOT 행 드롭다운 갱신 (currentRow 제외)
    function _refreshOtherLotDropdowns(currentRow) {
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (row === currentRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (!sel) return;
            var curVal = sel.value;
            var excludeLots = _getSelectedLotNos(row);
            sel.innerHTML = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
            if (curVal && sel.querySelector('option[value="' + curVal + '"]'))
                sel.value = curVal;
        });
    }

    // LOT 수량 재고 초과 방지 — 입력 즉시 차단
    function _validateLotQty(input) {
        var max = parseInt(input.max);
        if (isNaN(max) || max < 0) {
            _updateLotSummary();
            return;
        }
        var val = Number(input.value);
        if (val > max) {
            input.value = max;
            // 입력 커서가 끝으로 가게 강제
            input.dispatchEvent(new Event('input', { bubbles: false }));
            // 인라인 경고 표시 (토스트 대신 필드 옆에 표시)
            var row = input.closest('.pw-lot-row');
            if (row) {
                var warn = row.querySelector('.pw-qty-warn');
                if (!warn) {
                    warn = document.createElement('div');
                    warn.className = 'pw-qty-warn';
                    warn.style.cssText = 'font-size:0.72rem;color:#dc2626;margin-top:2px;';
                    input.parentNode.appendChild(warn);
                }
                warn.textContent = '최대 ' + UIUtils.formatNumber(max) + ' EA (재고 초과)';
                clearTimeout(input._warnTimer);
                input._warnTimer = setTimeout(function() { warn.textContent = ''; }, 2500);
            }
        }
        _updateLotSummary();
    }

    // ── 실시간 LOT 합계 vs 산출수량 표시 ──
    function _updateLotSummary() {
        var container = document.getElementById('pwLotRows');
        if (!container) return;

        var lots = _collectLots();
        var totalLotQty = lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);

        // ★ 투입수량 기준 비교 (LOT = 사출부품 투입량 = IN PUT)
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var inputQty = inputQtyEl ? (Number(inputQtyEl.value) || 0) : 0;

        // 요약 요소 찾기 또는 생성 (LOT 행 컨테이너 바로 뒤에 삽입)
        var summaryEl = document.getElementById('pwLotQtySummary');
        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.id = 'pwLotQtySummary';
            summaryEl.style.cssText = 'margin-top:7px;padding:6px 10px;border-radius:6px;font-size:0.81rem;font-weight:600;display:flex;align-items:center;gap:6px;transition:all 0.2s;';
            container.parentNode.insertBefore(summaryEl, container.nextSibling);
        }

        if (inputQty === 0) {
            summaryEl.style.display = 'none';
            return;
        }
        summaryEl.style.display = 'flex';

        var isMatch = totalLotQty === inputQty;
        summaryEl.style.background   = isMatch ? 'rgba(76,175,80,0.1)'  : 'rgba(239,68,68,0.08)';
        summaryEl.style.border       = isMatch ? '1px solid rgba(76,175,80,0.35)' : '1px solid rgba(239,68,68,0.35)';
        summaryEl.style.color        = isMatch ? '#16a34a' : '#dc2626';

        var icon    = isMatch ? '✅' : '⚠️';
        var diffMsg = isMatch ? ' (투입수량 일치)' : (' — 차이: ' + (totalLotQty > inputQty ? '+' : '') + UIUtils.formatNumber(totalLotQty - inputQty) + ' EA');
        summaryEl.innerHTML =
            icon + ' LOT 수량 합계: <strong>' + UIUtils.formatNumber(totalLotQty) + ' EA</strong>' +
            ' / 투입수량: <strong>' + UIUtils.formatNumber(inputQty) + ' EA</strong>' +
            '<span style="font-size:0.76rem;font-weight:400;">' + diffMsg + '</span>';
    }

    function _buildLotRow(lotsHtml, lotNo, qty) {
        // 선입선출: lotNo 미지정 시 selected 옵션 값(가장 오래된 LOT)을 자동 사용
        var autoLotNo = lotNo;
        if (!autoLotNo) {
            // optgroup 내부 option도 포함해 첫 번째 비어있지 않은 value 탐색
            var m = lotsHtml.match(/<option value="([^"]+)"[^>]*selected/);
            if (!m) {
                // value="..." 에 추가 속성이 있어도 매칭되도록 개선
                var all = lotsHtml.match(/<option[^>]+value="([^"]+)"/g) || [];
                for (var _i = 0; _i < all.length; _i++) {
                    var _vm = all[_i].match(/value="([^"]+)"/);
                    if (_vm && _vm[1]) { m = _vm; break; }
                }
            }
            if (m && m[1]) autoLotNo = m[1];
        }
        // 자동 선택 LOT의 잔량을 max로 설정
        var autoBalance = NaN;
        if (autoLotNo) {
            var bm = lotsHtml.match(new RegExp('value="' + autoLotNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*data-balance="(\\d+)"'));
            if (bm) autoBalance = parseInt(bm[1]);
        }
        const noVal = autoLotNo ? ' value="' + autoLotNo + '"' : '';
        const qtyVal = qty ? ' value="' + qty + '"' : '';
        const maxAttr = (!isNaN(autoBalance) && autoBalance >= 0) ? ' max="' + autoBalance + '" placeholder="최대 ' + UIUtils.formatNumber(autoBalance) + '"' : ' placeholder="수량"';
        return '<div class="pw-lot-row" style="margin-bottom:6px;">' +
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;align-items:center;">' +
            '<select class="form-select pw-lot-sel" style="font-size:0.84rem;"' +
            ' onchange="PaintingWorkModule.onLotRowSelect(this)">' +
            lotsHtml + '</select>' +
            '<input type="text" class="form-input pw-lot-no"' + noVal +
            ' placeholder="LOT번호 직접입력 (YYMMDD)" style="font-size:0.84rem;" maxlength="6"' +
            ' oninput="PaintingWorkModule._validateLotFormat(this)" onblur="PaintingWorkModule._checkLotFormat(this)">' +
            '<input type="number" class="form-input pw-lot-qty"' + qtyVal + maxAttr +
            ' min="0" style="font-size:0.84rem;text-align:right;"' +
            ' oninput="PaintingWorkModule._validateLotQty(this)">' +
            '<button class="btn btn-sm" title="삭제" onclick="PaintingWorkModule.removeLotRow(this)"' +
            ' style="background:transparent;color:var(--text-muted);border:1px solid var(--border);' +
            'border-radius:6px;padding:4px 6px;min-width:34px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;display:block;">remove</span>' +
            '</button></div>' +
            '<div class="pw-fifo-warn" style="display:none;margin-top:5px;padding:8px 12px;' +
            'background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.55);border-radius:6px;">' +
            '<div style="display:flex;align-items:center;gap:5px;color:#b45309;font-weight:700;margin-bottom:7px;font-size:0.78rem;">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">priority_high</span>' +
            '<span class="pw-fifo-warn-msg"></span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<label style="font-size:0.76rem;color:#b45309;white-space:nowrap;font-weight:700;">' +
            '미준수 사유&nbsp;<span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select pw-fifo-reason" style="font-size:0.8rem;flex:1;border-color:rgba(245,158,11,0.7);background:#fffbeb;">' +
            '<option value="">-- 사유 선택 필수 --</option>' +
            '<option value="자재 불량">자재 불량 (이전 LOT 사용 불가)</option>' +
            '<option value="자재수량 부족">자재수량 부족 (이전 LOT 잔량 부족)</option>' +
            '<option value="색상 불일치">색상 불일치</option>' +
            '<option value="긴급 생산">긴급 생산 지시</option>' +
            '<option value="기타">기타 (비고 입력)</option>' +
            '</select></div>' +
            '</div>' +
            '</div>';
    }

    // LOT 행 추가 버튼
    function addLotRow() {
        var container = document.getElementById('pwLotRows');
        if (!container) return;
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var excludeLots = _getSelectedLotNos(null);
        var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
        container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, '', ''));
        setTimeout(_updateLotSummary, 60);
    }

    // ── 투입수량 입력 시 LOT 행 자동 채우기 (디바운스 600ms) ──
    // oninput 즉시 실행 → 600ms 이내 추가 입력이 없으면 실제 채우기 실행
    // 타이핑 중 한 글자마다 채워지는 문제 방지
    var _autoFillTimer = null;
    function _autoFillLotQtys() {
        _updateLotSummary();           // 타이핑 중에도 요약은 즉시 갱신
        clearTimeout(_autoFillTimer);
        _autoFillTimer = setTimeout(_execAutoFill, 600);
    }

    function _execAutoFill() {
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var needed = Number(inputQtyEl ? inputQtyEl.value : 0) || 0;
        if (needed <= 0) { _updateLotSummary(); return; }

        var container = document.getElementById('pwLotRows');
        if (!container) return;

        // ① 이전 자동추가 행 제거 (첫 번째 행만 남김)
        var allRows = Array.from(container.querySelectorAll('.pw-lot-row'));
        for (var _ri = allRows.length - 1; _ri >= 1; _ri--) {
            allRows[_ri].remove();
        }

        // ② 첫 번째 행 qty 초기화 → FIFO로 채우기
        var currentTotal = 0;
        var firstRow = container.querySelector('.pw-lot-row');
        if (firstRow) {
            var fQty = firstRow.querySelector('.pw-lot-qty');
            if (fQty) {
                fQty.value = '';
                var fMax = parseInt(fQty.max);
                if (!isNaN(fMax) && fMax > 0) {
                    var fFill = Math.min(fMax, needed);
                    fQty.value = fFill;
                    currentTotal += fFill;
                }
            }
        }

        if (currentTotal >= needed) { _updateLotSummary(); return; }

        // ③ 잔량 부족 → 다음 LOT 행 자동 추가
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';

        var MAX_AUTO = 10;
        var added = 0;
        while (currentTotal < needed && added < MAX_AUTO) {
            var excludeLots = _getSelectedLotNos(null);
            var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);

            var tmpDiv = document.createElement('div');
            tmpDiv.innerHTML = lotsHtml;
            var nextOpt = tmpDiv.querySelector('optgroup option[value]:not([value=""]), option[value]:not([value=""])');
            if (!nextOpt || !nextOpt.value) break;
            var nextBalance = parseInt(nextOpt.getAttribute('data-balance')) || 0;
            if (nextBalance <= 0) break;

            container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, '', ''));
            added++;

            var newRows = container.querySelectorAll('.pw-lot-row');
            var newRow = newRows[newRows.length - 1];
            if (!newRow) break;

            // 드롭다운 & 직접입력 동기화
            var lotSel = newRow.querySelector('.pw-lot-sel');
            if (lotSel && nextOpt.value) {
                for (var _k = 0; _k < lotSel.options.length; _k++) {
                    if (lotSel.options[_k].value === nextOpt.value) { lotSel.selectedIndex = _k; break; }
                }
            }
            var lotNoInp = newRow.querySelector('.pw-lot-no');
            if (lotNoInp) lotNoInp.value = nextOpt.value;

            var nQty = newRow.querySelector('.pw-lot-qty');
            if (!nQty) break;
            nQty.max = nextBalance;
            nQty.placeholder = '최대 ' + UIUtils.formatNumber(nextBalance);
            var nFill = Math.min(nextBalance, needed - currentTotal);
            nQty.value = nFill;
            currentTotal += nFill;
        }

        // LOT 추가 버튼 활성화 갱신
        _refreshAddLotBtn(injPartName, cm, pn);

        _updateLotSummary();
    }

    // LOT 추가 버튼 활성화 상태 갱신 (행 추가/삭제/선택 변경 후 공통 호출)
    function _refreshAddLotBtn(injPartName, cm, pn) {
        if (injPartName === undefined) {
            var injPartSel = document.getElementById('pwInjPartSelect');
            injPartName = injPartSel ? injPartSel.value : '';
        }
        if (cm === undefined) {
            cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        }
        if (pn === undefined) {
            pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        }
        var excludeAll = _getSelectedLotNos(null);
        var moreHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeAll);
        var tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = moreHtml;
        var hasMore = !!(tmpDiv.querySelector('optgroup option[value]:not([value=""]), option[value]:not([value=""])'));
        var btn = document.getElementById('pwAddLotBtn');
        if (btn) {
            btn.disabled = !hasMore;
            btn.title = !hasMore ? '사출 창고 LOT가 더 이상 없습니다' : '';
        }
    }

    // LOT 행 제거
    function removeLotRow(btn) {
        const row = btn.closest('.pw-lot-row');
        const container = document.getElementById('pwLotRows');
        if (!row || !container) return;
        if (container.querySelectorAll('.pw-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
        _updateLotSummary();
        _refreshAddLotBtn(); // 삭제 후 버튼 활성화 재확인
    }

    // LOT 드롭다운 → 직접입력 자동 채우기 + 선입선출 경고 체크
    function onLotRowSelect(sel) {
        if (!sel) return;
        const row = sel.closest('.pw-lot-row');
        if (!row) return;
        const inp = row.querySelector('.pw-lot-no');
        if (inp && sel.value) inp.value = sel.value;
        checkFifoWarning(row, sel);

        // data-balance에서 직접 max 설정 (DB 조회 불필요)
        const qtyInp = row.querySelector('.pw-lot-qty');
        if (qtyInp) {
            const selectedOpt = sel.options[sel.selectedIndex];
            const balance = selectedOpt ? parseInt(selectedOpt.getAttribute('data-balance')) : NaN;
            if (!isNaN(balance) && balance >= 0) {
                qtyInp.max = balance;
                qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(balance);
                // 현재 입력값이 max 초과면 즉시 차단
                if (Number(qtyInp.value) > balance) {
                    qtyInp.value = balance;
                }
            } else {
                qtyInp.removeAttribute('max');
                qtyInp.placeholder = '수량';
            }
        }

        _refreshOtherLotDropdowns(row);      // 다른 행 드롭다운 갱신
        _refreshAddLotBtn();                 // 버튼 활성화 재확인
    }

    // ── 선입선출(FIFO) 경고 표시/숨김 ──────────────────────────────────
    // 규칙:
    //  1) 같은 사출명(injPartName) 내 → 더 오래된 LOT(숫자 작음)가 잔량 있으면 위반
    //  2) "창고 전체 재고" 그룹에서 선택 + "사출명 일치" 그룹에 잔량 있음 → 위반
    function checkFifoWarning(row, sel) {
        var warnEl = row.querySelector('.pw-fifo-warn');
        var msgEl  = row.querySelector('.pw-fifo-warn-msg');
        if (!warnEl || !msgEl) return;

        var selectedLotNo = sel.value;
        if (!selectedLotNo) {
            warnEl.style.display = 'none';
            return;
        }

        // optgroup 구조에서 각 그룹 옵션 추출
        var primaryOpts = [];   // 사출명 일치 LOT
        var otherOpts   = [];   // 창고 전체 재고
        var optgroups = sel.getElementsByTagName('optgroup');

        if (optgroups.length >= 1) {
            primaryOpts = Array.from(optgroups[0].getElementsByTagName('option'))
                              .filter(function(o) { return o.value; });
        }
        if (optgroups.length >= 2) {
            otherOpts = Array.from(optgroups[1].getElementsByTagName('option'))
                            .filter(function(o) { return o.value; });
        }
        // optgroup 없는 경우(이전 버전 호환)
        if (optgroups.length === 0) {
            primaryOpts = Array.from(sel.options).filter(function(o) { return o.value; });
        }

        // 현재 선택이 어느 그룹인지 판별
        var isInPrimary = primaryOpts.some(function(o) { return o.value === selectedLotNo; });
        var isInOther   = otherOpts.some(function(o)   { return o.value === selectedLotNo; });

        // Case 1: "창고 전체 재고"에서 선택했는데 "사출명 일치" 그룹에 잔량 있음
        if (isInOther && primaryOpts.length > 0) {
            var oldestPrimary = primaryOpts.reduce(function(min, o) {
                return o.value < min ? o.value : min;
            }, primaryOpts[0].value);
            msgEl.textContent = '선입선출 위반 — LOT ' + oldestPrimary +
                ' (사출명 일치 재고)를 먼저 소진해야 합니다.';
            warnEl.style.display = 'flex';
            return;
        }

        // Case 2: 같은 사출명 그룹 내 — 더 오래된 LOT가 존재
        var searchPool = isInPrimary ? primaryOpts : Array.from(sel.options).filter(function(o) { return o.value; });
        var olderLots  = searchPool.filter(function(o) { return o.value < selectedLotNo; });

        if (olderLots.length === 0) {
            warnEl.style.display = 'none';
            return;
        }

        var oldestLotNo = olderLots.reduce(function(min, o) {
            return o.value < min ? o.value : min;
        }, olderLots[0].value);
        msgEl.textContent = '선입선출 위반 — LOT ' + oldestLotNo + ' 재고가 먼저 소진되어야 합니다.';
        warnEl.style.display = 'flex';
    }

    // LOT 행 데이터 수집
    function _collectLots() {
        const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
        const lots = [];
        rows.forEach(function(row) {
            const lotNo = (row.querySelector('.pw-lot-no') ? row.querySelector('.pw-lot-no').value : '').trim();
            const qty = Number(row.querySelector('.pw-lot-qty') ? row.querySelector('.pw-lot-qty').value : 0) || 0;
            const warnEl = row.querySelector('.pw-fifo-warn');
            const isFifoViolated = warnEl && warnEl.style.display !== 'none';
            const fifoReason = isFifoViolated
                ? ((row.querySelector('.pw-fifo-reason') || {}).value || '')
                : '';
            if (lotNo) lots.push({ lotNo, qty, fifoReason });
        });
        return lots;
    }

    // 평균 CT 계산·표시
    function calcCT() {
        const startEl = document.getElementById('addPwStartTime');
        const endEl = document.getElementById('addPwEndTime');
        const prodEl = document.getElementById('addPwProdQty');
        const ctEl = document.getElementById('pwCtInfo');
        if (!ctEl) return;
        const start = startEl ? startEl.value : '';
        const end = endEl ? endEl.value : '';
        const qty = Number(prodEl ? prodEl.value : 0) || 0;
        if (start && end && qty > 0) {
            const sh = parseInt(start.split(':')[0]),
                sm = parseInt(start.split(':')[1]);
            const eh = parseInt(end.split(':')[0]),
                em = parseInt(end.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin <= 0) {
                ctEl.innerHTML = '<span style="color:var(--accent-red);font-size:0.82rem;">시간 오류 확인</span>';
                return;
            }
            const ctSec = (totalMin * 60 / qty).toFixed(1);
            ctEl.innerHTML =
                '<span style="color:var(--accent-blue);font-weight:700;font-size:1.05rem;">' + ctSec + '초/EA</span>' +
                '<span style="color:var(--text-muted);font-size:0.76rem;margin-left:6px;">' +
                '(총 ' + totalMin + '분 / ' + UIUtils.formatNumber(qty) + ' EA)</span>';
        } else {
            ctEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">완료수량·시간 입력 시 자동계산</span>';
        }
    }

    // 계획 시간 변경 감지 → 사유 섹션 표시/숨김 (10분 이내 차이는 무시)
    function _timeToMin(t) {
        if (!t) return NaN;
        var parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    function onTimeChange() {
        var section = document.getElementById('pwTimeReasonSection');
        if (!section) return;
        var planStart = section.getAttribute('data-plan-start') || '';
        var planEnd = section.getAttribute('data-plan-end') || '';
        if (!planStart && !planEnd) return;
        var actualStart = (document.getElementById('addPwStartTime') || {}).value || '';
        var actualEnd = (document.getElementById('addPwEndTime') || {}).value || '';
        var diffStart = (planStart && actualStart) ? Math.abs(_timeToMin(actualStart) - _timeToMin(planStart)) : 0;
        var diffEnd   = (planEnd   && actualEnd)   ? Math.abs(_timeToMin(actualEnd)   - _timeToMin(planEnd))   : 0;
        var differs = diffStart > 10 || diffEnd > 10;
        section.style.display = differs ? 'block' : 'none';
    }

    // IN/OUT 수량 1% 초과 차이 감지 → 경고 표시 / 비고 필수 표시
    function checkQtyDiff() {
        var inQtyEl  = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var outQtyEl = document.getElementById('addPwProdQty')  || document.getElementById('editPwProdQty');
        var inQty  = Number((inQtyEl || {}).value) || 0;
        var outQty = Number((outQtyEl || {}).value) || 0;
        var warn   = document.getElementById('qtyDiffWarning');
        var req    = document.getElementById('addPwNoteRequired');
        if (!warn) return;
        var exceed = inQty > 0 && outQty > 0 && Math.abs(inQty - outQty) / inQty > 0.01;
        warn.style.display = exceed ? 'block' : 'none';
        if (req) req.style.display = exceed ? 'inline' : 'none';
        // 실제 수량 레이블 업데이트
        var inLabel  = document.getElementById('pwDiffInQty');
        var outLabel = document.getElementById('pwDiffOutQty');
        if (inLabel)  inLabel.textContent  = exceed ? UIUtils.formatNumber(inQty)  : '-';
        if (outLabel) outLabel.textContent = exceed ? UIUtils.formatNumber(outQty) : '-';
    }

    // 투입수량이 계획수량 대비 -5% 초과 미달일 때만 사유 섹션 표시
    function checkPlanQtyDiff() {
        var section = document.getElementById('pwPlanQtyReasonSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var inputQty = Number((inputQtyEl || {}).value) || 0;
        // 투입수량이 계획수량의 95% 미만일 때만 사유 섹션 표시 (5% 초과 미달)
        var threshold = planQty * 0.95;
        var show = inputQty > 0 && inputQty < threshold;
        section.style.display = show ? 'block' : 'none';
        var label = document.getElementById('pwPlanInputQtyLabel');
        if (label) label.textContent = show ? UIUtils.formatNumber(inputQty) : '-';

        // 계획 미달 시: 자동 재계산 안 함 — 실제 완료시간 직접 입력 유도
        var hint = document.getElementById('pwEndTimeHint');
        var endEl = document.getElementById('addPwEndTime') || document.getElementById('editPwEndTime');
        if (hint && endEl) {
            if (show) {
                hint.innerHTML =
                    '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;color:#b45309;">warning</span>' +
                    ' 투입 미달 — 설비고장·품질문제 등 정지 시간 포함 가능.' +
                    ' <strong>실제 완료시간을 직접 확인·수정하세요.</strong>';
                hint.style.display = 'block';
                hint.style.color = '#b45309';
                endEl.style.outline = '2px solid rgba(245,158,11,0.7)';
            } else {
                hint.style.display = 'none';
                endEl.style.outline = '';
            }
        }
    }

    // 초과 수량 비례로 작업 완료시간 재계산 (계획 CT 기준)
    function _recalcEndTimeForOverQty(actualQty, planQty) {
        var planStart = ((document.getElementById('addPwPlanStartHidden') || {}).value) || '';
        var planEnd   = ((document.getElementById('addPwPlanEndHidden')   || {}).value) || '';
        if (!planStart || !planEnd) return;

        var planStartMin = _timeToMin(planStart);
        var planEndMin   = _timeToMin(planEnd);
        var planDuration = planEndMin - planStartMin;  // 계획 총 작업시간(분)
        if (planDuration <= 0 || planQty <= 0) return;

        // 계획 CT(초) = 총시간(초) / 계획수량
        var planCT = (planDuration * 60) / planQty;
        // 예상 소요시간(분) = CT × 실제수량 / 60
        var newDuration = Math.round(planCT * actualQty / 60);

        // 실제 시작 시간 (사용자가 변경했을 수 있으므로 폼에서 읽음)
        var startEl  = document.getElementById('addPwStartTime');
        var startMin = startEl && startEl.value ? _timeToMin(startEl.value) : planStartMin;
        if (isNaN(startMin)) return;

        var newEndMin    = startMin + newDuration;
        var newEndHour   = Math.floor(newEndMin / 60) % 24;
        var newEndMinute = newEndMin % 60;
        var newEndTime   = String(newEndHour).padStart(2, '0') + ':' + String(newEndMinute).padStart(2, '0');

        var endEl = document.getElementById('addPwEndTime');
        if (endEl && endEl.value !== newEndTime) {
            endEl.value = newEndTime;
            calcCT();
        }
    }

    // 투입/산출 수량이 계획수량 초과 시 경고 섹션 표시 + 완료시간 자동 재계산
    function checkOverPlanQty() {
        var section = document.getElementById('pwOverPlanSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var outQtyEl   = document.getElementById('addPwProdQty')  || document.getElementById('editPwProdQty');
        var inputQty = Number((inputQtyEl || {}).value) || 0;
        var outQty   = Number((outQtyEl  || {}).value) || 0;
        var maxQty   = Math.max(inputQty, outQty);
        var overAmt  = maxQty - planQty;
        var show     = maxQty > planQty;
        section.style.display = show ? 'block' : 'none';
        if (show) {
            var msgEl = document.getElementById('pwOverPlanMsg');
            if (msgEl) {
                var which = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                            (inputQty > planQty ? '투입수량' : '산출수량');

                // 재계산된 완료시간 표시용
                var endEl = document.getElementById('addPwEndTime') || document.getElementById('editPwEndTime');
                var recalcNote = '';
                if (endEl) {
                    var planEndVal = ((document.getElementById('addPwPlanEndHidden') || {}).value) || '';
                    if (planEndVal && endEl.value && endEl.value !== planEndVal) {
                        recalcNote = '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                            '<strong>' + endEl.value + '</strong>으로 자동 재계산되었습니다.' +
                            ' (계획 CT 기준, 계획 완료: ' + planEndVal + ')</span>';
                    }
                }
                msgEl.innerHTML =
                    which + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote;
            }
            // 완료시간 자동 재계산
            _recalcEndTimeForOverQty(maxQty, planQty);
            // 재계산 후 msg 업데이트 (endEl.value가 바뀐 뒤)
            if (msgEl) {
                var endEl2 = document.getElementById('addPwEndTime');
                var planEnd2 = ((document.getElementById('addPwPlanEndHidden') || {}).value) || '';
                var which2 = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                             (inputQty > planQty ? '투입수량' : '산출수량');
                var recalcNote2 = (endEl2 && planEnd2 && endEl2.value !== planEnd2)
                    ? '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                      '<strong>' + endEl2.value + '</strong>으로 자동 재계산되었습니다.' +
                      ' (계획 CT 기준, 계획 완료: ' + planEnd2 + ')</span>'
                    : '';
                msgEl.innerHTML =
                    which2 + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote2;
            }
            // 체크 초기화
            var ck = document.getElementById('addPwOverPlanConfirm');
            if (ck) ck.checked = false;
        }
    }

    // ──────────────────────────────────────────────
    // 작업 등록 모달 (lg 크기, 계획 연동)
    // ──────────────────────────────────────────────
    // 실적 입력 가능 역할
    var WORK_INPUT_ROLES = ['admin', 'prod_manager', 'line_manager'];

    function _checkWorkAuth() {
        var user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        if (!user) {
            UIUtils.toast('로그인 후 실적을 입력할 수 있습니다.', 'warning');
            return false;
        }
        if (!WORK_INPUT_ROLES.includes(String(user.role || ''))) {
            UIUtils.toast('실적 입력 권한이 없습니다. (도장라인운영자·생산관리자만 가능)', 'warning');
            return false;
        }
        return user;
    }

    function openAddModal(prefill) {
        var _modalAuthUser = _checkWorkAuth();
        if (!_modalAuthUser) return;
        var p = prefill || {};
        var carModel = p.carModel || '';
        var partName = p.partName || '';
        var color = p.color || '';
        var planQty = Number(p.planQty) || 0;
        var planId = p.planId || '';
        var planStartTime = p.planStartTime || '';
        var planEndTime = p.planEndTime || '';
        var achievedQty = Number(p.achievedQty) || 0;

        // 사출자재 마스터에서 제작품명1/2 + 컬러 매칭 → 사출명 자동 결정
        // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 무관 폴백 포함
        var injParts = partName ? getInjPartNamesForProduct(partName, carModel, color) : [];
        if (injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', color);
        if (injParts.length === 0 && partName) injParts = getInjPartNamesForProduct(partName, carModel, '');
        if (injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', '');
        var autoInjPartName = injParts.length === 1 ? injParts[0].injPartName : '';
        var injPartOptsHtml = buildInjPartOptionsHtml(partName, carModel, color);
        // autoInjPartName 없을 때: partName은 제품명이므로 사출 창고 조회 불가 → carModel 전체 조회
        var lotsHtml = autoInjPartName ?
            buildLotOptionsHtmlByInjPart(autoInjPartName, color) :
            buildLotOptionsHtml(carModel, '');
        var initialLotRow = _buildLotRow(lotsHtml, '', '');
        // LOT 추가 버튼 활성화 여부: 사출 창고에 LOT가 2개 이상일 때만 가능
        var initialLotCount = autoInjPartName ?
            getInjectionLotsByInjPart(autoInjPartName, color).length :
            getInjectionLots(carModel, '').length;

        var planQtyFmt = UIUtils.formatNumber(planQty);
        var achFmt = UIUtils.formatNumber(achievedQty);
        var achRate = planQty > 0 ? Math.min(100, Math.round(achievedQty / planQty * 100)) : 0;
        var achColor = achRate >= 100 ? 'var(--accent-green)' :
            achRate >= 70 ? 'var(--accent-blue)' :
            achRate > 0 ? 'var(--accent-orange)' :
            'var(--text-muted)';
        var planTimeLabel = planStartTime ?
            planStartTime + (planEndTime ? ' ~ ' + planEndTime : '') :
            '';

        var effectiveLine = p.line || _currentLine;

        // ① 배너: 차종/품명(2.2fr) | 컬러(0.7fr) | 계획·달성(1.1fr)
        var bannerHtml =
            '<div style="background:linear-gradient(135deg,rgba(66,133,244,0.09) 0%,rgba(66,133,244,0.03) 100%);' +
            'border:1px solid rgba(66,133,244,0.22);border-radius:10px;padding:14px 18px;margin-bottom:16px;">' +
            '<div style="display:grid;grid-template-columns:2.2fr 0.7fr 1.1fr;gap:16px;margin-bottom:9px;align-items:start;">' +

            // 차종/품명 (넓게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">차종 / 품명</div>' +
            '<div style="font-weight:700;font-size:1.02rem;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (carModel || '-') + ' <span style="color:var(--text-muted);font-weight:400;">/</span> ' + (partName || '-') + '</div></div>' +

            // 컬러 (좁게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">컬러</div>' +
            '<div style="font-weight:600;font-size:0.92rem;">' + (color || '-') + '</div></div>' +

            // 계획수량 + 달성현황
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">계획수량 / 달성현황</div>' +
            '<div style="font-weight:700;font-size:1.15rem;color:var(--accent-blue);line-height:1.2;">' + planQtyFmt + ' <span style="font-size:0.75rem;font-weight:400;">EA</span></div>' +
            (planId ?
                '<div style="margin-top:5px;">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + achRate + '%;height:100%;background:' + achColor + ';border-radius:3px;"></div></div>' +
                '<span style="color:' + achColor + ';font-weight:700;font-size:0.82rem;min-width:36px;text-align:right;">' + achRate + '%</span></div>' +
                '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">달성: ' + achFmt + ' EA</div>' +
                '</div>' :
                '') +
            '</div>' +

            '</div>' +
            '<div style="font-size:0.79rem;color:var(--text-secondary);border-top:1px solid rgba(66,133,244,0.15);padding-top:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">event</span>' +
            (p.planDate || _currentDate) + ' &nbsp;·&nbsp; ' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">factory</span>' +
            effectiveLine +
            (planTimeLabel ? ' &nbsp;·&nbsp; <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">schedule</span>계획: ' + planTimeLabel : '') +
            (planId ? ' &nbsp;<span style="background:rgba(66,133,244,0.12);color:var(--accent-blue);border-radius:4px;padding:1px 7px;font-size:0.73rem;margin-left:4px;">계획 연동</span>' : '') +
            '</div></div>';

        // ② 수량 행
        var qtyRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입수량 (IN PUT) <span style="color:var(--accent-red)">*</span>' +
            '<span style="color:var(--text-muted);font-size:0.75rem;"> 계획: ' + planQtyFmt + '</span></label>' +
            '<input type="number" class="form-input" id="addPwInputQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkPlanQtyDiff(); PaintingWorkModule.checkOverPlanQty(); PaintingWorkModule._autoFillLotQtys();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">산출 수량 (OUT PUT) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwProdQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.calcCT(); PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkOverPlanQty(); PaintingWorkModule._updateLotSummary();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입인원 (명) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwWorkers" min="0" placeholder="0"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '</div>';

        // ③-0 기본 CT 계산 (계획 시간·수량 기준)
        var baseCTSec = 0;
        if (planStartTime && planEndTime && planQty > 0) {
            var _bsh = parseInt(planStartTime.split(':')[0]);
            var _bsm = parseInt(planStartTime.split(':')[1]);
            var _beh = parseInt(planEndTime.split(':')[0]);
            var _bem = parseInt(planEndTime.split(':')[1]);
            var _planMin = (_beh * 60 + _bem) - (_bsh * 60 + _bsm);
            if (_planMin > 0) baseCTSec = (_planMin * 60) / planQty;
        }
        var baseCTLabel = baseCTSec > 0
            ? '<span style="color:var(--accent-blue);font-weight:700;">' + baseCTSec.toFixed(1) + '초/EA</span>'
            : '<span style="color:var(--text-muted);">-</span>';

        // ③-1 CVT 조회 (제품 마스터 → 도장 공정 슬롯)
        var _planCvt = 0;
        var _masterProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
        var _masterProd = _masterProds.find(function(mp) {
            return mp.carModel === carModel && mp.partName === partName;
        });
        if (_masterProd) {
            for (var _ci = 1; _ci <= 4; _ci++) {
                var _proc = (_masterProd['process' + _ci] || '').toLowerCase();
                if (_proc.includes('도장')) {
                    _planCvt = Number(_masterProd['cvt' + _ci]) || 0;
                    break;
                }
            }
            if (!_planCvt) _planCvt = Number(_masterProd.cvt1) || 0;
        }
        var cvtInfoLabel = _planCvt > 0
            ? '<span style="color:var(--accent-green);font-weight:700;">' + _planCvt + ' EA</span>'
            : '<span style="color:var(--text-muted);">-</span>';

        // ③ 시간 행 — 계획시간 자동 반영, 힌트 표시
        var timeRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:12px;margin-bottom:10px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">play_arrow</span> ' +
            '작업 시작시간</label>' +
            '<input type="time" class="form-input" id="addPwStartTime"' +
            ' value="' + planStartTime + '"' +
            ' oninput="PaintingWorkModule.calcCT();">' +
            (planStartTime ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planStartTime + '</div>' : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">stop</span> ' +
            '작업 완료시간</label>' +
            '<input type="time" class="form-input" id="addPwEndTime"' +
            ' value="' + planEndTime + '"' +
            ' oninput="PaintingWorkModule.calcCT();">' +
            (planEndTime
                ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planEndTime + '</div>'
                : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '<div id="pwEndTimeHint" style="display:none;font-size:0.71rem;margin-top:4px;' +
            'color:#b45309;background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.4);' +
            'border-radius:5px;padding:3px 8px;line-height:1.4;"></div>' +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">timer</span> ' +
            '작업 C.T (자동계산)</label>' +
            '<div id="pwCtInfo" style="height:36px;display:flex;align-items:center;">' +
            '<span style="color:var(--text-muted);font-size:0.8rem;">완료수량·시간 입력 시 자동계산</span></div>' +
            '<div style="display:flex;gap:14px;margin-top:5px;flex-wrap:wrap;">' +
            '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">' +
            '<span style="font-weight:600;color:var(--text-secondary);">기본 CT</span>&nbsp;' + baseCTLabel +
            '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">' +
            '<span style="font-weight:600;color:var(--text-secondary);">CVT</span>&nbsp;' + cvtInfoLabel +
            '</div>' +
            '</div>' +
            '</div>' +

            '</div>';

        // ④ 계획 시간 변경 사유 섹션 (초기 hidden, 시간 변경 시 표시)
        // ④ 계획 시간 변경 사유 섹션 — 삭제 (투입수량 미달/차이 섹션으로 통합)
        var reasonHtml = '';

        // ⑤ LOT 섹션
        var lotSectionHtml =
            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label" style="font-size:0.84rem;display:flex;align-items:center;gap:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">inventory_2</span>' +
            '사출 LOT' +
            '<span style="background:var(--accent-blue);color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:10px;font-weight:600;">선입선출</span>' +
            '<span style="color:var(--text-muted);font-size:0.74rem;">(사출 창고 잔량 기준 조회 · 복수 LOT 입력 가능)</span></label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            // 사출명 선택 행
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:9px;' +
            'border-bottom:1px solid var(--border);">' +
            '<label style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;font-weight:600;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">conveyor_belt</span>' +
            '사출명</label>' +
            '<select id="pwInjPartSelect" class="form-select" style="font-size:0.84rem;flex:1;"' +
            ' onchange="PaintingWorkModule.onInjPartSelect(this)">' +
            injPartOptsHtml + '</select>' +
            '</div>' +
            // LOT 행 헤더
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div>사출 창고 LOT 선택</div><div>LOT번호 (직접입력 가능)</div>' +
            '<div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRow + '</div>' +
            '<button id="pwAddLotBtn" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;"' +
            (initialLotCount <= 1 ? ' disabled title="사출 창고 LOT가 1개 이하여서 추가할 수 없습니다"' : '') + '>' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>';

        // ⑥-A 계획수량 초과 경고 섹션 (투입/산출 > 계획수량 시 표시)
        var overPlanHtml = planQty > 0
            ? '<div id="pwOverPlanSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.55);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.84rem;color:#b45309;font-weight:700;margin-bottom:8px;">' +
              '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">warning</span>' +
              '⚠ 계획수량 초과 경고' +
              '</div>' +
              '<div id="pwOverPlanMsg" style="font-size:0.83rem;color:#92400e;margin-bottom:12px;line-height:1.55;"></div>' +
              '<div style="background:rgba(245,158,11,0.13);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<input type="checkbox" id="addPwOverPlanConfirm" style="width:18px;height:18px;accent-color:#d97706;flex-shrink:0;">' +
              '<label for="addPwOverPlanConfirm" style="font-size:0.83rem;color:#92400e;cursor:pointer;font-weight:600;line-height:1.4;">' +
              '계획수량 초과 내용을 확인하였으며, 담당 관리자에게 보고하였습니다' +
              '</label>' +
              '</div>' +
              '</div>'
            : '';

        // ⑥ 계획 미달 사유 섹션 (산출수량 < 계획수량일 때 표시)
        var planQtyReasonHtml = planQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">trending_down</span>' +
              '투입수량 (<strong id="pwPlanInputQtyLabel">-</strong> EA) 이 계획수량(<strong>' + planQtyFmt + ' EA</strong>) 대비 5% 이상 미달 — 사유를 입력해 주세요' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
              '<select class="form-select" id="addPwPlanReason" style="font-size:0.85rem;">' +
              '<option value="">-- 선택 --</option>' +
              '<option value="계획변경">계획변경</option>' +
              '<option value="순간정지(공정문제)">순간정지(공정문제)</option>' +
              '<option value="설비 속도저하">설비 속도저하</option>' +
              '<option value="설비고장">설비고장</option>' +
              '<option value="품질문제">품질문제</option>' +
              '<option value="자재결품">자재결품</option>' +
              '</select></div>' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
              '<input type="text" class="form-input" id="addPwPlanReasonDetail"' +
              ' placeholder="구체적인 내용을 입력하세요"' +
              ' style="font-size:0.85rem;"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
              '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
              '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 계획 미달 내용을 작업 관리자에게 즉시 보고해 주세요.' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
              '<input type="checkbox" id="addPwPlanManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;">' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
              '</label>' +
              '</div>' +
              _buildNotifySelectorHtml('plan', '메시지를 받을 담당자를 여러 명 선택하세요. 역할별로 묶어서 표시합니다.') +
              '</div>'
            : '';

        // ⑦ 비고
        var noteHtml =
            // 투입/산출 차이 사유 섹션 (1% 이상 차이 시 표시)
            '<div id="qtyDiffWarning" style="display:none;margin-bottom:12px;' +
            'background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">warning</span>' +
            '투입수량(<strong id="pwDiffInQty">-</strong> EA) ≠ 산출수량(<strong id="pwDiffOutQty">-</strong> EA) — 차이 사유를 입력해 주세요.' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select" id="addPwQtyDiffReason" style="font-size:0.85rem;">' +
            '<option value="">-- 선택 --</option>' +
            '<option value="자재 불량">자재 불량</option>' +
            '<option value="설비 고장">설비 고장</option>' +
            '<option value="생산조건 NG">생산조건 NG</option>' +
            '<option value="작업 불량">작업 불량</option>' +
            '<option value="기타">기타</option>' +
            '</select></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="addPwQtyDiffDetail"' +
            ' placeholder="구체적인 내용을 입력하세요" style="font-size:0.85rem;"></div>' +
            '</div>' +
            '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
            '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
            '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 투입/산출 수량 차이 내용을 작업 관리자에게 즉시 보고해 주세요.' +
            '</div>' +
             '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
             '<input type="checkbox" id="addPwQtyDiffManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;">' +
             '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
             '</label>' +
             '</div>' +
             _buildNotifySelectorHtml('qtyDiff', '투입/산출 차이 통보를 받을 담당자를 여러 명 선택하세요.') +
             '</div>' +
             // 비고
            '<div class="form-group" style="margin-bottom:8px;">' +
            '<label class="form-label" style="font-size:0.84rem;">비고 <span id="addPwNoteRequired" style="display:none;color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="addPwNote" placeholder="특이사항 / 변동 사항"></div>' +
            // 작성자
            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">작성자</label>' +
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">person</span>' +
            '<span style="font-weight:600;color:var(--text-primary);">' + (function() { var roleMap = (AuthModule.ROLES || []).reduce(function(m,r){m[r.key]=r;return m;},{}); var r = roleMap[_modalAuthUser.role]; return r ? r.label : (_modalAuthUser.role || _modalAuthUser.name || ''); })() + '</span>' +
            '</div>' +
            '</div>';

        // ⑦ 숨김 필드
        var hiddenHtml =
            '<input type="hidden" id="addPwCarModelHidden"   value="' + carModel + '">' +
            '<input type="hidden" id="addPwPartNameHidden"   value="' + partName + '">' +
            '<input type="hidden" id="addPwColorHidden"      value="' + color + '">' +
            '<input type="hidden" id="addPwDateHidden"       value="' + (p.planDate || _currentDate) + '">' +
            '<input type="hidden" id="addPwLineHidden"       value="' + effectiveLine + '">' +
            '<input type="hidden" id="addPwPlanId"           value="' + planId + '">' +
            '<input type="hidden" id="addPwPlanStartHidden"  value="' + planStartTime + '">' +
            '<input type="hidden" id="addPwPlanEndHidden"    value="' + planEndTime + '">';

        UIUtils.showModal('도장 작업 실적 등록',
            bannerHtml + hiddenHtml + qtyRowHtml + timeRowHtml + reasonHtml + lotSectionHtml + overPlanHtml + planQtyReasonHtml + noteHtml,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveNew()">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 등록</button>',
            'lg');

        // 계획 CT 자동계산 (계획 시간이 이미 채워진 경우)
        if (planStartTime && planEndTime) {
            setTimeout(function() {
                PaintingWorkModule.calcCT();
            }, 60);
        }
    }

    // 계획에서 실적 등록 모달 열기
    function openAddModalFromPlan(planId) {
        var plan = Storage.getById(PLAN_STORE, planId);
        if (!plan) {
            UIUtils.toast('계획 정보를 찾을 수 없습니다.', 'warning');
            return;
        }

        // ⚠️ 이미 이 계획에 실적이 있는지 확인 (중복 등록 방지)
        var existingWorks = (Storage.getAll(STORE) || []).filter(function(w) {
            return w.planId === planId;
        });
        if (existingWorks.length > 0) {
            UIUtils.toast('이 계획에는 이미 실적이 등록되어 있습니다.', 'warning');
            return;
        }

        // 이미 달성된 수량 계산 (같은 날짜·라인·품목)
        var allWorks = Storage.getAll(STORE) || [];
        var achievedQty = allWorks.filter(function(w) {
            return w.date === plan.date && w.line === plan.line &&
                w.carModel === plan.carModel && w.partName === plan.partName &&
                w.color === plan.color;
        }).reduce(function(s, w) {
            return s + (Number(w.productionQty) || 0);
        }, 0);

        openAddModal({
            line: plan.line || '',
            carModel: plan.carModel || '',
            partName: plan.partName || '',
            color: plan.color || '',
            planQty: plan.planQty || 0,
            planId: plan.id,
            planDate: plan.date || '',
            planStartTime: plan.startTime || '',
            planEndTime: plan.endTime || '',
            achievedQty: achievedQty
        });
    }

    // 신규 저장
    async function saveNew() {
        var _authUser = _checkWorkAuth();
        if (!_authUser) return;

        // 투입수량 / 산출수량 / 투입인원 필수 검증
        var _inputQtyEl  = document.getElementById('addPwInputQty');
        var _prodQtyEl   = document.getElementById('addPwProdQty');
        var _workersEl   = document.getElementById('addPwWorkers');
        var _inputQtyV   = Number((_inputQtyEl  || {}).value) || 0;
        var _prodQtyV    = Number((_prodQtyEl   || {}).value) || 0;
        var _workersV    = Number((_workersEl   || {}).value) || 0;
        if (!_inputQtyV) {
            UIUtils.toast('투입수량(IN PUT)을 입력해 주세요.', 'warning');
            if (_inputQtyEl) _inputQtyEl.focus();
            return;
        }
        if (!_prodQtyV) {
            UIUtils.toast('산출수량(OUT PUT)을 입력해 주세요.', 'warning');
            if (_prodQtyEl) _prodQtyEl.focus();
            return;
        }
        if (!_workersV) {
            UIUtils.toast('투입인원(명)을 입력해 주세요.', 'warning');
            if (_workersEl) _workersEl.focus();
            return;
        }

        var lots = _collectLots();

        // 사출 LOT 필수 검증
        if (lots.length === 0) {
            UIUtils.toast('사출 LOT를 선택하거나 직접 입력해 주세요.', 'warning');
            var firstLotNo = document.querySelector('#pwLotRows .pw-lot-no');
            if (firstLotNo) firstLotNo.focus();
            return;
        }
        var hasInvalidLot = lots.some(function(l) { return !l.qty || l.qty <= 0; });
        if (hasInvalidLot) {
            UIUtils.toast('사출 LOT 수량을 입력해 주세요.', 'warning');
            var firstLotQty = document.querySelector('#pwLotRows .pw-lot-qty');
            if (firstLotQty) firstLotQty.focus();
            return;
        }

        // 선입선출 위반 시 사유 필수 검증
        var fifoViolatedRows = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            var warnEl = row.querySelector('.pw-fifo-warn');
            if (warnEl && warnEl.style.display !== 'none') {
                var reasonSel = row.querySelector('.pw-fifo-reason');
                if (!reasonSel || !reasonSel.value) fifoViolatedRows.push(reasonSel);
            }
        });
        if (fifoViolatedRows.length > 0) {
            UIUtils.toast('선입선출 미준수 사유를 선택해 주세요.', 'warning');
            if (fifoViolatedRows[0]) fifoViolatedRows[0].focus();
            return;
        }

        var lotNo = lots[0].lotNo;
        var startTime = (document.getElementById('addPwStartTime') || {}).value || '';
        var endTime = (document.getElementById('addPwEndTime') || {}).value || '';
        var prodQty = Number((document.getElementById('addPwProdQty') || {}).value) || 0;
        // ★ LOT 합계는 투입수량(IN PUT)과 일치해야 함
        var _saveInputQty = Number((document.getElementById('addPwInputQty') || {}).value) || 0;

        // ── 사출 LOT 합계 ≠ 투입수량 → 저장 차단 ──
        var _lotTotalForSave = lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (_lotTotalForSave !== _saveInputQty) {
            UIUtils.toast(
                '사출 LOT 수량 합계(' + UIUtils.formatNumber(_lotTotalForSave) + ' EA)와 투입수량(' + UIUtils.formatNumber(_saveInputQty) + ' EA)이 일치하지 않습니다.',
                'warning'
            );
            var lotSection = document.getElementById('pwLotRows');
            if (lotSection) lotSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // ── 완료시간 확인 팝업 ──
        var _planEndVal   = (document.getElementById('addPwPlanEndHidden')   || {}).value || '';
        var _planStartVal = (document.getElementById('addPwPlanStartHidden') || {}).value || '';
        if (_planEndVal && endTime && _planStartVal && startTime) {
            var _planEndMin   = _timeToMin(_planEndVal);
            var _actualEndMin = _timeToMin(endTime);
            var _timeDiffMin  = _actualEndMin - _planEndMin;   // + 초과 / - 미달

            // 계획 미달 여부 확인
            var _planQtySection = document.getElementById('pwPlanQtyReasonSection');
            var _planQtyBase = _planQtySection ? (Number(_planQtySection.getAttribute('data-plan-qty')) || 0) : 0;
            var _isPlanShortfall = _planQtyBase > 0 && _saveInputQty > 0 && _saveInputQty < _planQtyBase;

            if (_isPlanShortfall && Math.abs(_timeDiffMin) <= 5) {
                // 계획 미달인데 완료시간이 계획 그대로 — 직접 입력 유도 팝업
                var _shortMsg =
                    '⚠  완료시간을 직접 확인해 주세요.\n\n' +
                    '  투입수량이 계획보다 부족합니다.\n' +
                    '  설비 고장 · 품질 문제 등으로 라인이 정지된 경우\n' +
                    '  완료시간이 계획(' + _planEndVal + ')과 달라집니다.\n\n' +
                    '  현재 입력된 완료시간 : ' + endTime + '\n\n' +
                    '[확인] 이 시간으로 저장   [취소] 시간 수정';
                if (!window.confirm(_shortMsg)) {
                    var _etEl = document.getElementById('addPwEndTime');
                    if (_etEl) { _etEl.focus(); _etEl.select(); }
                    return;
                }
            } else if (Math.abs(_timeDiffMin) > 5) {
                // 계획 완료시간과 5분 이상 차이 나면 일반 확인 팝업
                var _sign = _timeDiffMin > 0 ? '+' : '';
                var _msg =
                    '⏱  작업 완료시간을 확인해 주세요.\n\n' +
                    '  계획 완료시간 :  ' + _planEndVal + '\n' +
                    '  실제 완료시간 :  ' + endTime + '\n' +
                    '  차       이 :  ' + _sign + _timeDiffMin + '분\n\n' +
                    '이 시간으로 저장하시겠습니까?\n' +
                    '(수정하려면 [취소] 후 완료시간을 변경해 주세요.)';
                if (!window.confirm(_msg)) {
                    var _endTimeEl = document.getElementById('addPwEndTime');
                    if (_endTimeEl) { _endTimeEl.focus(); _endTimeEl.select(); }
                    return;
                }
            }
        }

        var avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            var sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            var eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            var totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        // 계획수량 초과 → 확인 체크 필수
        var overPlanSection = document.getElementById('pwOverPlanSection');
        var overPlanVisible = overPlanSection && overPlanSection.style.display !== 'none';
        if (overPlanVisible) {
            var overPlanConfirm = document.getElementById('addPwOverPlanConfirm');
            if (!overPlanConfirm || !overPlanConfirm.checked) {
                UIUtils.toast('계획수량 초과 내용을 확인하고 관리자 보고 체크박스를 선택해 주세요.', 'warning');
                if (overPlanConfirm) overPlanConfirm.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // IN/OUT 1% 초과 차이 → 사유구분 + 세부사유 필수
        var inputQtyVal  = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        var hasQtyDiff = inputQtyVal > 0 && prodQty > 0 && Math.abs(inputQtyVal - prodQty) / inputQtyVal > 0.01;
        var qtyDiffReason = ((document.getElementById('addPwQtyDiffReason') || {}).value || '').trim();
        var qtyDiffDetail = ((document.getElementById('addPwQtyDiffDetail') || {}).value || '').trim();
        if (hasQtyDiff && !qtyDiffReason) {
            UIUtils.toast('투입/산출 수량 차이 사유구분을 선택해 주세요.', 'warning');
            var qdrEl = document.getElementById('addPwQtyDiffReason');
            if (qdrEl) qdrEl.focus();
            return;
        }
        if (hasQtyDiff && !qtyDiffDetail) {
            UIUtils.toast('투입/산출 수량 차이 세부 사유를 입력해 주세요.', 'warning');
            var qddEl = document.getElementById('addPwQtyDiffDetail');
            if (qddEl) qddEl.focus();
            return;
        }
        // 투입/산출 차이 → 관리자 통보 완료 체크 필수
        if (hasQtyDiff) {
            var qtyDiffMgrChk = document.getElementById('addPwQtyDiffManagerNotified');
            if (!qtyDiffMgrChk || !qtyDiffMgrChk.checked) {
                UIUtils.toast('투입/산출 수량 차이 내용을 관리자에게 통보 후 "통보 완료"를 체크해 주세요.', 'warning');
                if (qtyDiffMgrChk) qtyDiffMgrChk.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            var qtyDiffNotifyUsersCheck = _getSelectedNotifyUsers('qtyDiff');
            if (!qtyDiffNotifyUsersCheck.length) {
                UIUtils.toast('투입/산출 차이 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                var qtyDiffNotifyWrap = document.getElementById('qtyDiffNotifyUserWrap');
                if (qtyDiffNotifyWrap) qtyDiffNotifyWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // 계획 미달 사유 필수 검증
        var planReasonSection = document.getElementById('pwPlanQtyReasonSection');
        var planReasonVisible = planReasonSection && planReasonSection.style.display !== 'none';
        var planReason = ((document.getElementById('addPwPlanReason') || {}).value || '').trim();
        var planReasonDetail = ((document.getElementById('addPwPlanReasonDetail') || {}).value || '').trim();
        if (planReasonVisible && !planReason) {
            UIUtils.toast('계획 미달 사유구분을 선택해 주세요.', 'warning');
            var prEl = document.getElementById('addPwPlanReason');
            if (prEl) prEl.focus();
            return;
        }
        if (planReasonVisible && !planReasonDetail) {
            UIUtils.toast('계획 미달 세부 사유를 입력해 주세요.', 'warning');
            var prdEl = document.getElementById('addPwPlanReasonDetail');
            if (prdEl) prdEl.focus();
            return;
        }
        // 계획 미달 → 관리자 통보 완료 체크 필수
        if (planReasonVisible) {
            var planMgrChk = document.getElementById('addPwPlanManagerNotified');
            if (!planMgrChk || !planMgrChk.checked) {
                UIUtils.toast('계획 미달 내용을 관리자에게 통보 후 "통보 완료"를 체크해 주세요.', 'warning');
                if (planMgrChk) planMgrChk.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            var planNotifyUsersCheck = _getSelectedNotifyUsers('plan');
            if (!planNotifyUsersCheck.length) {
                UIUtils.toast('계획 미달 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                var planNotifyWrap = document.getElementById('planNotifyUserWrap');
                if (planNotifyWrap) planNotifyWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        var qtyDiffNotifyUsers = hasQtyDiff ? _getSelectedNotifyUsers('qtyDiff') : [];
        var planNotifyUsers = planReasonVisible ? _getSelectedNotifyUsers('plan') : [];

        var data = {
            date: (document.getElementById('addPwDateHidden') || {}).value || _currentDate,
            line: (document.getElementById('addPwLineHidden') || {}).value || _currentLine,
            carModel: (document.getElementById('addPwCarModelHidden') || {}).value || '',
            partName: (document.getElementById('addPwPartNameHidden') || {}).value || '',
            color: (document.getElementById('addPwColorHidden') || {}).value || '',
            planId: (document.getElementById('addPwPlanId') || {}).value || '',
            lotNo: lotNo,
            lots: lots,
            inputQty: Number((document.getElementById('addPwInputQty') || {}).value) || 0,
            productionQty: prodQty,
            goodQty: 0,
            defectQty: 0,
            workers: Number((document.getElementById('addPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            overPlanQty: overPlanVisible ? true : false,
            planReason: planReasonVisible ? planReason : '',
            planReasonDetail: planReasonVisible ? planReasonDetail : '',
            planManagerNotified: planReasonVisible ? true : false,
            planManagerRecipients: planNotifyUsers,
            qtyDiffReason: hasQtyDiff ? qtyDiffReason : '',
            qtyDiffDetail: hasQtyDiff ? qtyDiffDetail : '',
            qtyDiffManagerNotified: hasQtyDiff ? true : false,
            qtyDiffManagerRecipients: qtyDiffNotifyUsers,
            note: ((document.getElementById('addPwNote') || {}).value || '').trim(),
            registeredAt: new Date().toISOString(),
            createdBy: _authUser ? { id: _authUser.id, name: _authUser.name, role: _authUser.role } : null
        };

        if (!data.date) {
            UIUtils.toast('날짜 정보가 없습니다.', 'warning');
            return;
        }

        // 사출 재고 초과 여부 최종 검증
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = data.carModel, pn = data.partName;

        // injPartName 미선택 시 사출자재 마스터에서 자동 탐색
        // 컬러 일치 우선, 없으면 컬러 무관 폴백 (도장 컬러 ≠ 사출 소재 컬러 대응)
        var _saveColor = data.color || '';
        if (!injPartName) {
            var _mats = Storage.getAll(INJECTMAT_STORE) || [];
            var _found = _mats.find(function(m) {
                var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                var modelMatch = !cm || m.carModel === cm;
                var colorMatch = _injColorMatches(m.injColor, _saveColor);
                return nameMatch && modelMatch && colorMatch && m.injPartName;
            });
            // 폴백: 컬러 불일치 시 품명+차종만으로 매칭 (DYS→GRAY 등)
            if (!_found) {
                _found = _mats.find(function(m) {
                    var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                    var modelMatch = !cm || m.carModel === cm;
                    return nameMatch && modelMatch && m.injPartName;
                });
            }
            if (_found) {
                injPartName = _found.injPartName;
            }
        }

        var allLots = injPartName ? getInjectionLotsByInjPart(injPartName, _saveColor) : getInjectionLots(cm, pn);

        for (var vi = 0; vi < data.lots.length; vi++) {
            var vl = data.lots[vi];
            if (!vl.lotNo || !vl.qty) continue;
            var vLotInfo = allLots.find(function(l) { return l.lotNo === vl.lotNo; });
            if (vLotInfo && vl.qty > vLotInfo.balance) {
                vl.qty = vLotInfo.balance; // 초과분 조용히 잔량으로 대체
            }
        }

        var savedWork = await Storage.add(STORE, data);
        var workId = savedWork ? savedWork.id : null;

        // 사출 창고 재고 차감 (LOT별 출고 처리, workId 연결)
        // ★ Fix: 출고 기록에 color 저장 — 입고 기록의 color와 동일한 LOT 키로 합산되도록
        //   LOT의 원래 입고 기록에서 color 조회 (없으면 작업의 product color 사용)
        var _injInvAll = Storage.getAll(INJ_INV_STORE) || [];
        for (var di = 0; di < data.lots.length; di++) {
            var dl = data.lots[di];
            if (!dl.lotNo || !dl.qty) continue;
            var dlInfo = allLots.find(function(l) { return l.lotNo === dl.lotNo; });
            var effectivePartName = (dlInfo && dlInfo.partName) || injPartName || data.partName;

            // LOT 원래 입고 기록에서 color 조회
            var _origRec = _injInvAll.find(function(r) {
                return r.lotNo === dl.lotNo
                    && r.partName === effectivePartName
                    && r.type !== '출고';
            });
            var dlColor = (_origRec && _origRec.color) ? _origRec.color : (data.color || '');

            await Storage.add(INJ_INV_STORE, {
                date: data.date,
                lotNo: dl.lotNo,
                partName: effectivePartName,
                color: dlColor,
                carModel: data.carModel,
                quantity: dl.qty,
                type: '출고',
                source: '도장 작업 출고',
                refWorkId: workId
            });
        }

        UIUtils.closeModal();

        // ⚠️ 계획 상태를 '완료'로 변경 (중복 실적 입력 방지)
        if (data.planId) {
            var plan = Storage.getById(PLAN_STORE, data.planId);
            if (plan) {
                plan.status = '완료';
                await Storage.update(PLAN_STORE, data.planId, plan);
            }
        }

        // JIG 사용 자동 기록
        if (typeof JigModule !== 'undefined' && JigModule.addUsageFromWork) {
            JigModule.addUsageFromWork(savedWork);
        }
        if (planReasonVisible && planNotifyUsers.length) {
            var planQtyBase = Number((planReasonSection && planReasonSection.dataset && planReasonSection.dataset.planQty) || 0) || 0;
            _sendManagerNotification(
                '도장 작업 계획 미달 통보',
                '[' + (data.line || '-') + '] ' + (data.carModel || '-') + ' / ' + (data.partName || '-') + '\n' +
                '계획수량: ' + UIUtils.formatNumber(planQtyBase) + ' EA\n' +
                '투입수량: ' + UIUtils.formatNumber(data.inputQty) + ' EA\n' +
                '사유구분: ' + data.planReason + '\n' +
                '세부사유: ' + data.planReasonDetail,
                planNotifyUsers
            );
        }
        if (hasQtyDiff && qtyDiffNotifyUsers.length) {
            _sendManagerNotification(
                '도장 작업 투입/산출 차이 통보',
                '[' + (data.line || '-') + '] ' + (data.carModel || '-') + ' / ' + (data.partName || '-') + '\n' +
                '투입수량: ' + UIUtils.formatNumber(data.inputQty) + ' EA\n' +
                '산출수량: ' + UIUtils.formatNumber(data.productionQty) + ' EA\n' +
                '사유구분: ' + data.qtyDiffReason + '\n' +
                '세부사유: ' + data.qtyDiffDetail,
                qtyDiffNotifyUsers
            );
        }

        UIUtils.toast('작업 실적이 등록되었습니다.', 'success');
        loadAll();
    }

    // ──────────────────────────────────────────────
    // 보기 페이지 (읽기 전용) + 수정 페이지
    // ──────────────────────────────────────────────
    var _workViewId = null;

    function _buildWorkAlerts(d) {
        var alerts = [];
        if (d.overPlanQty) {
            var _overPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
            var _planQty = _overPlan ? Number(_overPlan.planQty || 0) : Number(d.planQty || 0);
            var _inputQty = Number(d.inputQty || 0);
            var _overAmt = _planQty > 0 ? _inputQty - _planQty : 0;
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(245,158,11,.08);' +
                'border:1px solid rgba(245,158,11,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#f59e0b;font-size:22px;flex-shrink:0;margin-top:1px;">warning</span>' +
                '<div style="flex:1;"><div style="font-weight:700;color:#b45309;margin-bottom:6px;">⚠ 계획수량 초과 등록</div>' +
                '<div style="display:flex;gap:20px;font-size:0.84rem;margin-bottom:4px;">' +
                '<span>계획수량: <strong>' + UIUtils.formatNumber(_planQty) + ' EA</strong></span>' +
                '<span>투입수량: <strong style="color:#b45309;">' + UIUtils.formatNumber(_inputQty) + ' EA</strong></span>' +
                (_overAmt > 0 ? '<span style="color:#dc2626;font-weight:700;">+' + UIUtils.formatNumber(_overAmt) + ' EA 초과</span>' : '') +
                '</div></div></div>'
            );
        }
        if (d.planReason || d.planManagerNotified !== undefined && (d.planReason)) {
            // 계획수량 미달 사유
        }
        if (d.timeReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,.07);' +
                'border:1px solid rgba(239,68,68,.35);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ef4444;font-size:22px;flex-shrink:0;margin-top:1px;">schedule</span>' +
                '<div><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">⏱ 시간 변동</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + (d.timeReason || '') + '</strong>' + (d.timeReasonDetail ? ' — ' + d.timeReasonDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.timeManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.qtyDiffReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(234,179,8,.08);' +
                'border:1px solid rgba(234,179,8,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ca8a04;font-size:22px;flex-shrink:0;margin-top:1px;">swap_vert</span>' +
                '<div><div style="font-weight:700;color:#a16207;margin-bottom:4px;">↕ 투입/산출 수량 차이</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + (d.qtyDiffReason || '') + '</strong>' + (d.qtyDiffDetail ? ' — ' + d.qtyDiffDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.qtyDiffManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.planReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,.06);' +
                'border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ef4444;font-size:22px;flex-shrink:0;margin-top:1px;">trending_down</span>' +
                '<div><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">↓ 계획수량 미달</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + d.planReason + '</strong>' + (d.planReasonDetail ? ' — ' + d.planReasonDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.planManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.inspectionStatus === 'completed') {
            alerts.push(
                '<div style="display:flex;align-items:center;gap:10px;background:rgba(22,163,74,.07);' +
                'border:1px solid rgba(22,163,74,.35);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#16a34a;font-size:22px;flex-shrink:0;">verified</span>' +
                '<div style="font-weight:600;color:#15803d;">✓ 도장 검사 완료</div></div>'
            );
        }
        if (!alerts.length) {
            alerts.push(
                '<div style="display:flex;align-items:center;gap:10px;background:var(--bg-secondary);' +
                'border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:var(--accent-green);font-size:20px;">check_circle</span>' +
                '<span style="font-size:0.88rem;color:var(--text-muted);">특이사항 없음</span></div>'
            );
        }
        return alerts.join('');
    }

    function removeWork(id) {
        UIUtils.confirm('이 도장 작업 실적을 삭제하시겠습니까?', async () => {
            await Storage.remove(PAINTING_WORK_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderWorkList();
        });
    }

    // 보기 페이지 진입점: 부모창이면 팝업 열기, 팝업창이면 contentArea에 바로 렌더링
    function openWorkViewPage(id) {
        _renderWorkView(id);
    }


    function _renderWorkView(id) {
        var d = Storage.getById(STORE, id);
        if (!d) return;
        _workViewId = id;

        var alertsHtml = _buildWorkAlerts(d);

        var lotItems = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{lotNo: d.lotNo, qty: 0}] : []);
        var lotDisplayHtml = lotItems.length
            ? lotItems.map(function(l) {
                return '<div style="display:inline-flex;align-items:center;gap:6px;' +
                    'background:var(--bg-secondary);border:1px solid var(--border);' +
                    'border-radius:4px;padding:4px 12px;font-family:monospace;font-size:0.9rem;margin:3px 6px 3px 0;">' +
                    '<span>' + l.lotNo + '</span>' +
                    (l.qty ? '<span style="color:var(--text-muted);">—</span><span>' + UIUtils.formatNumber(l.qty) + ' 개</span>' : '') +
                    '</div>';
            }).join('')
            : '<span style="color:var(--text-muted);">-</span>';

        function _fmtDate(dateStr, timeStr) {
            var p = (dateStr || '').split('-');
            if (p.length !== 3) return dateStr || '-';
            var t = (timeStr || '').slice(0, 5);
            return '<span style="font-size:0.72rem;color:var(--text-muted);display:block;line-height:1.2;">' + p[0] + '</span>' +
                   '<span style="font-size:0.95rem;font-weight:600;">' + p[1] + '-' + p[2] + '</span>' +
                   (t ? '<span style="font-size:0.72rem;color:var(--text-muted);display:block;line-height:1.4;">' + t + '</span>' : '');
        }

        var workDateDisplay = _fmtDate(d.date, d.startTime);
        var regDateDisplay  = _fmtDate(
            d.registeredAt ? d.registeredAt.slice(0, 10) : '',
            d.registeredAt && d.registeredAt.length >= 16 ? d.registeredAt.slice(11, 16) : ''
        );

        function vf(label, value, color) {
            return '<div style="min-width:110px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">' + label + '</div>' +
                '<div style="font-size:0.95rem;font-weight:600;color:' + (color || 'var(--text-primary)') + ';">' + value + '</div>' +
                '</div>';
        }

        var processLoss = (Number(d.inputQty) || 0) - (Number(d.productionQty) || 0);

        var bodyHtml =
            '<div class="fade-in-up">' +
            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>상태 / 알림</h4></div>' +
            '<div class="card-body" style="padding:12px 14px;">' + alertsHtml + '</div></div>' +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">기본 정보</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 40px;">' +
            vf('등록일', regDateDisplay) +
            vf('도장 작업일', workDateDisplay) +
            vf('라인', d.line || '-') +
            vf('차종', d.carModel || '-') +
            vf('품명', d.partName || '-') +
            vf('컬러', d.color || '-') +
            '</div></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">작업 수량</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 36px;">' +
            vf('투입수량', UIUtils.formatNumber(d.inputQty || 0), 'var(--accent-blue)') +
            vf('완료수량', UIUtils.formatNumber(d.productionQty || 0), 'var(--accent-green)') +
            vf('공정 LOSS', UIUtils.formatNumber(processLoss), processLoss > 0 ? 'var(--accent-red)' : 'var(--text-muted)') +
            vf('불량수량', UIUtils.formatNumber(Number(d.defectQty) || 0), (Number(d.defectQty) || 0) > 0 ? 'var(--accent-red)' : 'var(--text-muted)') +
            vf('투입인원', (d.workers || 0) + '명') +
            '</div></div></div>' +
            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">작업 시간</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 36px;">' +
            vf('시작시간', d.startTime || '-') +
            vf('완료시간', d.endTime || '-') +
            vf('작업C.T', d.avgCT > 0 ? d.avgCT.toFixed(1) + '초' : '-', 'var(--accent-blue)') +
            '</div></div></div>' +
            '</div>' +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">사출 LOT</h4></div>' +
            '<div class="card-body" style="padding:14px 20px;">' + lotDisplayHtml + '</div></div>' +

            (d.note ? '<div class="card" style="margin-bottom:0;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">비고</h4></div>' +
            '<div class="card-body" style="padding:14px 20px;font-size:0.9rem;">' + d.note + '</div></div>' : '') +
            '</div>';

        var footerHtml =
            '<button class="btn btn-secondary" onclick="PaintingWorkModule._closeWorkViewPage()">닫기</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.openWorkEditPage(\'' + id + '\')">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">edit</span> 수정</button>';

        UIUtils.openModal({ title: '도장 작업 실적 보기', body: bodyHtml, footer: footerHtml, size: 'lg' });
    }

    // 수정 페이지 (입력 폼)
    function openWorkEditPage(id) {
        var d = Storage.getById(STORE, id);
        if (!d) return;
        _workViewId = id;

        var alertsHtml = _buildWorkAlerts(d);
        var editPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        var editPlanQty = Number((editPlan && editPlan.planQty) || d.planQty || 0);
        var editPlanQtyFmt = UIUtils.formatNumber(editPlanQty || 0);
        var editPlanReasonVisible = !!(d.planReason || d.planReasonDetail || d.planManagerNotified);
        var editQtyDiffVisible = !!(d.qtyDiffReason || d.qtyDiffDetail || d.qtyDiffManagerNotified);
        var lotsHtml = buildLotOptionsHtml(d.carModel, d.partName);
        var existLots = (d.lots && d.lots.length > 0) ? d.lots
            : (d.lotNo ? [{ lotNo: d.lotNo, qty: 0 }] : [{ lotNo: '', qty: 0 }]);
        var initialLotRows = existLots.map(function(l) { return _buildLotRow(lotsHtml, l.lotNo, l.qty); }).join('');

        var editPlanReasonHtml = editPlanQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + editPlanQty + '"' +
              ' style="display:' + (editPlanReasonVisible ? 'block' : 'none') + ';margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '투입수량 대비 계획수량(<strong>' + editPlanQtyFmt + ' EA</strong>) 미달 — 사유를 입력해 주세요.</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">사유구분</label>' +
              '<select class="form-select" id="editPwPlanReason">' +
              '<option value="">-- 선택 --</option>' +
              ['계획변경','시간정지(공정문제)','설비 이상정지','설비고장','원자재문제','자재결품'].map(function(v) {
                  return '<option value="' + v + '"' + (d.planReason === v ? ' selected' : '') + '>' + v + '</option>';
              }).join('') +
              '</select></div>' +
              '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">세부 사유</label>' +
              '<input type="text" class="form-input" id="editPwPlanReasonDetail" value="' + (d.planReasonDetail || '') + '"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
              '<input type="checkbox" id="editPwPlanManagerNotified" style="width:16px;height:16px;"' + (d.planManagerNotified ? ' checked' : '') + '>' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">관리자 통보 완료</span></label></div>' +
              _buildNotifySelectorHtml('editPlan', '계획 미달 통보를 받을 담당자') +
              '</div>' : '';

        var editQtyDiffHtml =
            '<div id="qtyDiffWarning" style="display:' + (editQtyDiffVisible ? 'block' : 'none') + ';margin-bottom:12px;' +
            'background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">투입/산출 수량 차이 사유</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">사유구분</label>' +
            '<select class="form-select" id="editPwQtyDiffReason">' +
            '<option value="">-- 선택 --</option>' +
            ['자재 불량','설비 고장','생산조건 NG','작업 불량','기타'].map(function(v) {
                return '<option value="' + v + '"' + (d.qtyDiffReason === v ? ' selected' : '') + '>' + v + '</option>';
            }).join('') +
            '</select></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">세부 사유</label>' +
            '<input type="text" class="form-input" id="editPwQtyDiffDetail" value="' + (d.qtyDiffDetail || '') + '"></div>' +
            '</div>' +
            '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;">' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
            '<input type="checkbox" id="editPwQtyDiffManagerNotified" style="width:16px;height:16px;"' + (d.qtyDiffManagerNotified ? ' checked' : '') + '>' +
            '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">관리자 통보 완료</span></label></div>' +
            _buildNotifySelectorHtml('editQtyDiff', '투입/산출 차이 통보 담당자') +
            '</div>';

        var wp = (d.date || '').split('-');
        var workDateDisplay = wp.length === 3
            ? wp[1] + '-' + wp[2] + ' <small style="color:var(--text-muted);">(' + wp[0] + ')</small>'
            : (d.date || '-');

        var bodyHtml2 =
            '<div class="fade-in-up">' +
            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>상태 / 알림</h4></div>' +
            '<div class="card-body" style="padding:12px 14px;">' + alertsHtml + '</div></div>' +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-body" style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:0.9rem;">' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">도장 작업일</span><div style="font-weight:700;">' + workDateDisplay + '</div></div>' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">라인</span><div style="font-weight:600;">' + (d.line || '-') + '</div></div>' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">차종/품명</span><div style="font-weight:600;">' + (d.carModel || '') + ' / ' + (d.partName || '') + '</div></div>' +
            '</div></div>' +

            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">edit</span>수정</h4></div>' +
            '<div class="card-body">' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label">차종</label>' +
            '<input type="text" class="form-input" id="editPwCarModel" value="' + (d.carModel || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">품명</label>' +
            '<input type="text" class="form-input" id="editPwPartName" value="' + (d.partName || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">컬러</label>' +
            '<input type="text" class="form-input" id="editPwColor" value="' + (d.color || '') + '"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label">투입수량</label>' +
            '<input type="number" class="form-input" id="editPwInputQty" value="' + (d.inputQty || 0) + '" style="text-align:right;font-weight:600;"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">완료수량</label>' +
            '<input type="number" class="form-input" id="editPwProdQty" value="' + (d.productionQty || 0) + '"' +
            ' oninput="PaintingWorkModule._updateLotSummary();" style="text-align:right;font-weight:600;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">투입인원 (명)</label>' +
            '<input type="number" class="form-input" id="editPwWorkers" value="' + (d.workers || 0) + '" style="text-align:right;"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label">작업 시작시간</label>' +
            '<input type="time" class="form-input" id="editPwStartTime" value="' + (d.startTime || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">작업 완료시간</label>' +
            '<input type="time" class="form-input" id="editPwEndTime" value="' + (d.endTime || '') + '"></div></div>' +

            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label">사출 LOT</label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            '<div id="pwLotRows">' + initialLotRows + '</div>' +
            '<button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>' +

            editPlanReasonHtml +
            editQtyDiffHtml +

            '<div class="form-group" style="margin-bottom:0;"><label class="form-label">비고</label>' +
            '<input type="text" class="form-input" id="editPwNote" value="' + (d.note || '') + '"></div>' +
            '</div></div>' +
            '</div>';

        var footerHtml2 =
            '<button class="btn btn-secondary" onclick="PaintingWorkModule.openWorkViewPage(\'' + id + '\')">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveEdit(\'' + id + '\')">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 저장</button>';

        UIUtils.openModal({ title: '도장 작업 실적 수정', body: bodyHtml2, footer: footerHtml2, size: 'lg' });

        setTimeout(function() {
            var rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
            existLots.forEach(function(l, i) {
                if (!l.lotNo || !rows[i]) return;
                var sel = rows[i].querySelector('.pw-lot-sel');
                if (!sel) return;
                for (var j = 0; j < sel.options.length; j++) {
                    if (sel.options[j].value === l.lotNo) { sel.value = l.lotNo; break; }
                }
            });
            _updateLotSummary();
            (d.planManagerRecipients || []).forEach(function(userId) {
                var chk = document.querySelector('.editPlan-notify-user[value="' + userId + '"]');
                if (chk) chk.checked = true;
            });
            (d.qtyDiffManagerRecipients || []).forEach(function(userId) {
                var chk = document.querySelector('.editQtyDiff-notify-user[value="' + userId + '"]');
                if (chk) chk.checked = true;
            });
            checkQtyDiff();
            checkPlanQtyDiff();
            checkOverPlanQty();
        }, 60);
    }

    function _closeWorkViewPage() {
        UIUtils.closeModal();
        _workViewId = null;
        loadAll();
    }

    // ──────────────────────────────────────────────
    // 수정 모달 (lg)
    // ──────────────────────────────────────────────
    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const editPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        const editPlanQty = Number((editPlan && editPlan.planQty) || d.planQty || 0);
        const editPlanQtyFmt = UIUtils.formatNumber(editPlanQty || 0);
        const editPlanReasonVisible = !!(d.planReason || d.planReasonDetail || d.planManagerNotified);
        const editQtyDiffVisible = !!(d.qtyDiffReason || d.qtyDiffDetail || d.qtyDiffManagerNotified);

        const lotsHtml = buildLotOptionsHtml(d.carModel, d.partName);
        const existLots = (d.lots && d.lots.length > 0) ?
            d.lots :
            (d.lotNo ? [{
                lotNo: d.lotNo,
                qty: 0
            }] : [{
                lotNo: '',
                qty: 0
            }]);
        const initialLotRows = existLots.map(function(l) {
            return _buildLotRow(lotsHtml, l.lotNo, l.qty);
        }).join('');
        const editPlanReasonHtml = editPlanQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + editPlanQty + '"' +
              ' style="display:' + (editPlanReasonVisible ? 'block' : 'none') + ';margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">trending_down</span>' +
              '투입수량 (<strong id="pwPlanInputQtyLabel">' + (editPlanReasonVisible ? UIUtils.formatNumber(d.inputQty || 0) : '-') + '</strong> EA) 이 계획수량(<strong>' + editPlanQtyFmt + ' EA</strong>) 대비 5% 이상 미달 — 사유를 입력해 주세요.' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
              '<select class="form-select" id="editPwPlanReason" style="font-size:0.85rem;">' +
              '<option value="">-- 선택 --</option>' +
              '<option value="계획변경"' + (d.planReason === '계획변경' ? ' selected' : '') + '>계획변경</option>' +
              '<option value="시간정지(공정문제)"' + (d.planReason === '시간정지(공정문제)' ? ' selected' : '') + '>시간정지(공정문제)</option>' +
              '<option value="설비 이상정지"' + (d.planReason === '설비 이상정지' ? ' selected' : '') + '>설비 이상정지</option>' +
              '<option value="설비고장"' + (d.planReason === '설비고장' ? ' selected' : '') + '>설비고장</option>' +
              '<option value="원자재문제"' + (d.planReason === '원자재문제' ? ' selected' : '') + '>원자재문제</option>' +
              '<option value="자재결품"' + (d.planReason === '자재결품' ? ' selected' : '') + '>자재결품</option>' +
              '</select></div>' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
              '<input type="text" class="form-input" id="editPwPlanReasonDetail" value="' + (d.planReasonDetail || '') + '" placeholder="구체적인 내용을 입력해 주세요." style="font-size:0.85rem;"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
              '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
              '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 계획 미달 내용을 작업 관리자에게 즉시 보고해 주세요.' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
              '<input type="checkbox" id="editPwPlanManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;"' + (d.planManagerNotified ? ' checked' : '') + '>' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
              '</label>' +
              '</div>' +
              _buildNotifySelectorHtml('editPlan', '계획 미달 통보를 받을 담당자를 여러 명 선택하세요.') +
              '</div>'
            : '';
        const editQtyDiffHtml =
            '<div id="qtyDiffWarning" style="display:' + (editQtyDiffVisible ? 'block' : 'none') + ';margin-bottom:12px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">warning</span>' +
            '투입수량(<strong id="pwDiffInQty">' + (editQtyDiffVisible ? UIUtils.formatNumber(d.inputQty || 0) : '-') + '</strong> EA) 과 산출수량(<strong id="pwDiffOutQty">' + (editQtyDiffVisible ? UIUtils.formatNumber(d.productionQty || 0) : '-') + '</strong> EA) 차이 사유를 입력해 주세요.' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select" id="editPwQtyDiffReason" style="font-size:0.85rem;">' +
            '<option value="">-- 선택 --</option>' +
            '<option value="자재 불량"' + (d.qtyDiffReason === '자재 불량' ? ' selected' : '') + '>자재 불량</option>' +
            '<option value="설비 고장"' + (d.qtyDiffReason === '설비 고장' ? ' selected' : '') + '>설비 고장</option>' +
            '<option value="생산조건 NG"' + (d.qtyDiffReason === '생산조건 NG' ? ' selected' : '') + '>생산조건 NG</option>' +
            '<option value="작업 불량"' + (d.qtyDiffReason === '작업 불량' ? ' selected' : '') + '>작업 불량</option>' +
            '<option value="기타"' + (d.qtyDiffReason === '기타' ? ' selected' : '') + '>기타</option>' +
            '</select></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="editPwQtyDiffDetail" value="' + (d.qtyDiffDetail || '') + '" placeholder="구체적인 내용을 입력해 주세요." style="font-size:0.85rem;"></div>' +
            '</div>' +
            '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
            '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
            '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 투입/산출 수량 차이 내용을 작업 관리자에게 즉시 보고해 주세요.' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
            '<input type="checkbox" id="editPwQtyDiffManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;"' + (d.qtyDiffManagerNotified ? ' checked' : '') + '>' +
            '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
            '</label>' +
            '</div>' +
            _buildNotifySelectorHtml('editQtyDiff', '투입/산출 차이 통보를 받을 담당자를 여러 명 선택하세요.') +
            '</div>';

        UIUtils.showModal('도장 작업 수정',
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">차종</label>' +
            '<input type="text" class="form-input" id="editPwCarModel" value="' + (d.carModel || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">품명</label>' +
            '<input type="text" class="form-input" id="editPwPartName" value="' + (d.partName || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">컬러</label>' +
            '<input type="text" class="form-input" id="editPwColor" value="' + (d.color || '') + '"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입수량 (IN PUT)</label>' +
            '<input type="number" class="form-input" id="editPwInputQty" value="' + (d.inputQty || 0) + '" style="text-align:right;font-weight:600;"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">산출 수량 (OUT PUT)</label>' +
            '<input type="number" class="form-input" id="editPwProdQty" value="' + (d.productionQty || 0) + '"' +
            ' oninput="PaintingWorkModule._updateLotSummary();"' +
            ' style="text-align:right;font-weight:600;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입인원 (명)</label>' +
            '<input type="number" class="form-input" id="editPwWorkers" value="' + (d.workers || 0) + '" style="text-align:right;font-weight:600;"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 시작시간</label>' +
            '<input type="time" class="form-input" id="editPwStartTime" value="' + (d.startTime || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 완료시간</label>' +
            '<input type="time" class="form-input" id="editPwEndTime" value="' + (d.endTime || '') + '"></div></div>' +

            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label" style="font-size:0.84rem;">사출 LOT</label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            '<div style="display:grid;grid-template-columns:2.5fr 1.8fr 1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div>사출 창고 LOT 선택</div><div>LOT번호</div><div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRows + '</div>' +
            '<button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>' +
            editPlanReasonHtml +
            editQtyDiffHtml +

            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.83rem;">비고</label>' +
            '<input type="text" class="form-input" id="editPwNote" value="' + (d.note || '') + '"></div>',

            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveEdit(\'' + id + '\')">저장</button>',
            'lg');

        // 기존 LOT 드롭다운 매칭
        setTimeout(function() {
            const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
            existLots.forEach(function(l, i) {
                if (!l.lotNo || !rows[i]) return;
                const sel = rows[i].querySelector('.pw-lot-sel');
                if (!sel) return;
                for (var j = 0; j < sel.options.length; j++) {
                    if (sel.options[j].value === l.lotNo) {
                        sel.value = l.lotNo;
                        break;
                    }
                }
            });
            _updateLotSummary(); // 수정 모달 열릴 때 초기 합계 표시
            (d.planManagerRecipients || []).forEach(function(userId) {
                var check = document.querySelector('.editPlan-notify-user[value="' + userId + '"]');
                if (check) check.checked = true;
            });
            (d.qtyDiffManagerRecipients || []).forEach(function(userId) {
                var check = document.querySelector('.editQtyDiff-notify-user[value="' + userId + '"]');
                if (check) check.checked = true;
            });
            checkQtyDiff();
            checkPlanQtyDiff();
            checkOverPlanQty();
        }, 60);
    }

    async function saveEdit(id) {
        const lots = _collectLots();
        const lotNo = lots.length > 0 ? lots[0].lotNo : '';
        const startTime = (document.getElementById('editPwStartTime') || {}).value || '';
        const endTime = (document.getElementById('editPwEndTime') || {}).value || '';
        const inputQty = Number((document.getElementById('editPwInputQty') || {}).value) || 0;
        const prodQty = Number((document.getElementById('editPwProdQty') || {}).value) || 0;
        const hasQtyDiff = inputQty > 0 && prodQty > 0 && Math.abs(inputQty - prodQty) / inputQty > 0.01;
        const qtyDiffReason = ((document.getElementById('editPwQtyDiffReason') || {}).value || '').trim();
        const qtyDiffDetail = ((document.getElementById('editPwQtyDiffDetail') || {}).value || '').trim();
        const planReasonSection = document.getElementById('pwPlanQtyReasonSection');
        const planReasonVisible = !!(planReasonSection && planReasonSection.style.display !== 'none');
        const planReason = ((document.getElementById('editPwPlanReason') || {}).value || '').trim();
        const planReasonDetail = ((document.getElementById('editPwPlanReasonDetail') || {}).value || '').trim();

        // ── 사출 LOT 합계 ≠ 산출수량 → 저장 차단 ──
        if (lots.length > 0) {
            const _lotTotalEdit = lots.reduce((s, l) => s + (Number(l.qty) || 0), 0);
            if (_lotTotalEdit !== prodQty) {
                UIUtils.toast(
                    '사출 LOT 수량 합계(' + UIUtils.formatNumber(_lotTotalEdit) + ' EA)와 산출수량(' + UIUtils.formatNumber(prodQty) + ' EA)이 일치하지 않습니다.',
                    'warning'
                );
                const lotSection = document.getElementById('pwLotRows');
                if (lotSection) lotSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        if (hasQtyDiff && !qtyDiffReason) {
            UIUtils.toast('투입/산출 수량 차이 사유구분을 선택해 주세요.', 'warning');
            var eqdrEl = document.getElementById('editPwQtyDiffReason');
            if (eqdrEl) eqdrEl.focus();
            return;
        }
        if (hasQtyDiff && !qtyDiffDetail) {
            UIUtils.toast('투입/산출 수량 차이 세부 사유를 입력해 주세요.', 'warning');
            var eqddEl = document.getElementById('editPwQtyDiffDetail');
            if (eqddEl) eqddEl.focus();
            return;
        }
        if (hasQtyDiff) {
            var editQtyDiffMgrChk = document.getElementById('editPwQtyDiffManagerNotified');
            if (!editQtyDiffMgrChk || !editQtyDiffMgrChk.checked) {
                UIUtils.toast('투입/산출 수량 차이 내용을 관리자에게 통보 후 "통보 완료"를 체크해 주세요.', 'warning');
                return;
            }
            if (!_getSelectedNotifyUsers('editQtyDiff').length) {
                UIUtils.toast('투입/산출 차이 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                return;
            }
        }
        if (planReasonVisible && !planReason) {
            UIUtils.toast('계획 미달 사유구분을 선택해 주세요.', 'warning');
            var eprEl = document.getElementById('editPwPlanReason');
            if (eprEl) eprEl.focus();
            return;
        }
        if (planReasonVisible && !planReasonDetail) {
            UIUtils.toast('계획 미달 세부 사유를 입력해 주세요.', 'warning');
            var eprdEl = document.getElementById('editPwPlanReasonDetail');
            if (eprdEl) eprdEl.focus();
            return;
        }
        if (planReasonVisible) {
            var editPlanMgrChk = document.getElementById('editPwPlanManagerNotified');
            if (!editPlanMgrChk || !editPlanMgrChk.checked) {
                UIUtils.toast('계획 미달 내용을 관리자에게 통보 후 "통보 완료"를 체크해 주세요.', 'warning');
                return;
            }
            if (!_getSelectedNotifyUsers('editPlan').length) {
                UIUtils.toast('계획 미달 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                return;
            }
        }

        const editPlanNotifyUsers = planReasonVisible ? _getSelectedNotifyUsers('editPlan') : [];
        const editQtyDiffNotifyUsers = hasQtyDiff ? _getSelectedNotifyUsers('editQtyDiff') : [];

        let avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            const sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            const eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        await Storage.update(STORE, id, {
            carModel: ((document.getElementById('editPwCarModel') || {}).value || '').trim(),
            partName: ((document.getElementById('editPwPartName') || {}).value || '').trim(),
            color: ((document.getElementById('editPwColor') || {}).value || '').trim(),
            lotNo: lotNo,
            lots: lots,
            inputQty: inputQty,
            productionQty: prodQty,
            workers: Number((document.getElementById('editPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            planReason: planReasonVisible ? planReason : '',
            planReasonDetail: planReasonVisible ? planReasonDetail : '',
            planManagerNotified: planReasonVisible ? true : false,
            planManagerRecipients: editPlanNotifyUsers,
            qtyDiffReason: hasQtyDiff ? qtyDiffReason : '',
            qtyDiffDetail: hasQtyDiff ? qtyDiffDetail : '',
            qtyDiffManagerNotified: hasQtyDiff ? true : false,
            qtyDiffManagerRecipients: editQtyDiffNotifyUsers,
            note: ((document.getElementById('editPwNote') || {}).value || '').trim()
        });
        UIUtils.toast('수정되었습니다.', 'success');
        if (_workViewId) {
            const savedId = _workViewId;
            _workViewId = null;
            openWorkViewPage(savedId);
        } else {
            UIUtils.closeModal();
            loadAll();
        }
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            var work = Storage.getById(STORE, id);
            await Storage.remove(STORE, id);

            // 사출 창고 재고 복원: refWorkId로 연결된 출고 기록을 찾아 입고 역처리
            if (work) {
                var invAll = Storage.getAll(INJ_INV_STORE) || [];
                var deductions = invAll.filter(function(r) {
                    return r.source === '도장 작업 출고' && r.refWorkId === id;
                });
                // refWorkId 기록이 없으면 lots 기반으로 복원 (구버전 호환)
                if (deductions.length === 0 && work.lots && work.lots.length > 0) {
                    deductions = work.lots.filter(function(l) { return l.lotNo && l.qty; })
                        .map(function(l) { return { lotNo: l.lotNo, quantity: l.qty, partName: work.partName, carModel: work.carModel }; });
                }
                for (var ri = 0; ri < deductions.length; ri++) {
                    var d = deductions[ri];
                    if (!d.lotNo || !d.quantity) continue;
                    await Storage.add(INJ_INV_STORE, {
                        date: work.date,
                        lotNo: d.lotNo,
                        partName: d.partName || work.partName,
                        carModel: d.carModel || work.carModel,
                        quantity: d.quantity,
                        type: '입고',
                        source: '도장 작업 삭제 복원',
                        refWorkId: id
                    });
                }
            }

            // ⚠️ 삭제된 실적의 계획 상태를 '대기'로 되돌림
            if (work && work.planId) {
                var plan = Storage.getById(PLAN_STORE, work.planId);
                if (plan) {
                    plan.status = '대기';
                    await Storage.update(PLAN_STORE, work.planId, plan);
                }
            }

            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function search() {
        loadAll();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['작업일', '라인', '차종', '품명', '컬러', '사출LOT', '투입수량', '완료수량', '양품수량', '불량수량', '투입인원', '시작시간', '완료시간', '평균CT(초)', '비고'];
        const rows = data.map(d => {
            const lotStr = (d.lots && d.lots.length > 0) ?
                d.lots.map(l => l.lotNo + (l.qty ? '(' + l.qty + ')' : '')).join(' / ') :
                (d.lotNo || '');
            return [d.date, d.line, d.carModel, d.partName, d.color, lotStr,
                d.inputQty, d.productionQty, d.goodQty, d.defectQty,
                d.workers || 0, d.startTime || '', d.endTime || '', d.avgCT || 0, d.note || ''
            ];
        });
        Storage.exportToCSV(headers, rows, '도장작업일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // LOT 번호 형식 검증 (입력 시)
    function _validateLotFormat(input) {
        // 숫자만 남기기
        input.value = input.value.replace(/[^0-9]/g, '');
        // 최대 6글자
        if (input.value.length > 6) {
            input.value = input.value.substring(0, 6);
        }
    }

    // LOT 번호 형식 검증 (포커스 아웃 시)
    function _checkLotFormat(input) {
        const value = input.value.trim();
        if (!value) return; // 빈 값은 허용

        if (value.length !== 6) {
            UIUtils.toast('LOT번호는 YYMMDD 형식으로 6자리여야 합니다', 'warning');
            input.focus();
            return;
        }

        const yy = parseInt(value.substring(0, 2));
        const mm = parseInt(value.substring(2, 4));
        const dd = parseInt(value.substring(4, 6));

        // 월 범위 검증 (01~12)
        if (mm < 1 || mm > 12) {
            UIUtils.toast('월(MM)은 01~12 범위여야 합니다', 'warning');
            input.focus();
            return;
        }

        // 일 범위 검증 (01~31)
        if (dd < 1 || dd > 31) {
            UIUtils.toast('일(DD)은 01~31 범위여야 합니다', 'warning');
            input.focus();
            return;
        }
    }

    // 계획 삭제 함수 (사유 입력)
    function deletePlan(planId, date, line, time) {
        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);margin-right:4px;">delete_outline</span> 계획 삭제',
            `
                <div style="margin-bottom:16px;">
                    <p style="margin:0 0 8px 0; color:var(--text-secondary);">
                        <strong>${date}</strong> ${line} <strong>${time}</strong> 의 계획을 삭제하시겠습니까?
                    </p>
                    <p style="color:var(--accent-red); font-size:0.85rem; margin:0;">
                        ⚠️ 이 작업은 되돌릴 수 없습니다.
                    </p>
                </div>
                <div class="form-group">
                    <label class="form-label">삭제 사유</label>
                    <textarea class="form-input" id="deletePlanReason" placeholder="삭제 사유를 입력하세요 (예: 중복 등록, 계획 변경, 오입력 등)" style="resize:vertical; min-height:80px;"></textarea>
                </div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-danger" onclick="PaintingWorkModule.confirmDeletePlan('${planId}', '${date}', '${line}')">
                    <span class="material-symbols-outlined" style="vertical-align:middle;">delete</span> 삭제
                </button>
            `
        );

        // 포커스 설정
        setTimeout(() => {
            const reasonInput = document.getElementById('deletePlanReason');
            if (reasonInput) reasonInput.focus();
        }, 100);
    }

    // 계획 삭제 확인
    async function confirmDeletePlan(planId, date, line) {
        const reasonInput = document.getElementById('deletePlanReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!reason) {
            UIUtils.toast('삭제 사유를 입력해주세요.', 'warning');
            if (reasonInput) reasonInput.focus();
            return;
        }

        try {
            // 계획 삭제
            await Storage.remove(PLAN_STORE, planId);

            // 삭제 이력 기록 (로그)
            const logData = {
                date: UIUtils.today(),
                time: new Date().toLocaleTimeString('ko-KR'),
                type: '계획삭제',
                planDate: date,
                line: line,
                planId: planId,
                reason: reason
            };
            console.log('계획 삭제 이력:', logData);

            UIUtils.closeModal();
            UIUtils.toast('계획이 삭제되었습니다.', 'success');
            loadAll();
        } catch (error) {
            UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            console.error('계획 삭제 오류:', error);
        }
    }

    return {
        render,
        search,
        setLine,
        onDateChange,
        loadAll,
        renderPlanSummary,
        renderUnenteredPlans,
        renderWorkList,
        openAddModal,
        openAddModalFromPlan,
        addLotRow,
        removeLotRow,
        onLotRowSelect,
        checkFifoWarning,
        onInjPartSelect,
        calcCT,
        onTimeChange,
        checkQtyDiff,
        checkPlanQtyDiff,
        checkOverPlanQty,
        toggleNotifyUsers,
        saveNew,
        edit,
        openWorkViewPage,
        openWorkEditPage,
        _closeWorkViewPage,
        saveEdit,
        removeWork,
        remove,
        exportData,
        deletePlan,
        confirmDeletePlan,
        _validateLotFormat,
        _checkLotFormat,
        _validateLotQty,
        _updateLotSummary,
        _autoFillLotQtys
    };
})();


// ===================================================================
// 도장 검사 (불량 집계) - 생산 계획 지시서 연동
// ===================================================================
const PaintingInspectionModule = (function() {
    const STORE = DB.STORES.PAINTING_INSPECTIONS;
    const DEFECT_STORE = DB.STORES.DEFECT_TYPES;
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;
    const PAINTING_WORK_STORE = DB.STORES.PAINTING_WORK;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const STANDARD_UPLOAD_ROLES = ['admin', 'prod_manager', 'quality_manager', 'paint_line_op'];
    const NONCONFORM_STANDARD_IMAGE_KEY = 'painting_nonconform_standard_image_v1';

    // 현재 카운팅 상태
    let state = {
        selectedProduct: null,
        selectedPlan: null,
        selectedWork: null, // 도장 작업 완료에서 선택한 작업
        counts: {},
        currentTab: 'inspection' // 'inspection' | 'completion' | 'nonconform-standard'
    };
    let _nonconformStandardImage = null;

    function _currentUser() {
        try {
            return (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
        } catch (e) {
            return null;
        }
    }

    function _canUploadNonconformStandard() {
        const user = _currentUser();
        return !!(user && STANDARD_UPLOAD_ROLES.includes(String(user.role || '')));
    }

    async function _loadNonconformStandardImage() {
        try {
            return await Storage.getConfigValue(NONCONFORM_STANDARD_IMAGE_KEY) || null;
        } catch (e) {
            console.warn('[PaintingInspectionModule] standard image load failed:', e);
            return null;
        }
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                    </div>
                </div>

                <!-- 탭 네비게이션 (타일 카드 스타일) -->
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:20px;">
                    ${[
                        { key: 'inspection', label: '외관 검사', desc: '도장 완료품 외관 검사 진행', icon: 'done_all', accent: 'var(--accent-blue)' },
                        { key: 'completion', label: '검사 완료 실적', desc: '외관 검사 완료 이력 조회', icon: 'task_alt', accent: '#10b981' },
                        { key: 'nonconform-standard', label: '부적합 처리 기준서', desc: '기준서 업로드 및 인쇄', icon: 'description', accent: '#8b5cf6' }
                    ].map(tab => {
                        const active = state.currentTab === tab.key;
                        return `
                        <div onclick="PaintingInspectionModule._switchTab('${tab.key}')"
                             onmouseenter="this.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)';this.style.transform='translateY(-2px)'"
                             onmouseleave="this.style.boxShadow='${active ? '0 4px 14px rgba(37,99,235,0.15)' : '0 2px 8px rgba(0,0,0,0.06)'}';this.style.transform=''"
                             style="cursor:pointer;display:flex;align-items:center;gap:14px;
                                    background:${active ? '#eff6ff' : '#ffffff'};
                                    border:1px solid ${active ? tab.accent : 'var(--border-color)'};
                                    border-left:4px solid ${active ? tab.accent : 'var(--border-color)'};
                                    border-radius:12px;padding:16px 20px;
                                    box-shadow:${active ? '0 4px 14px rgba(37,99,235,0.15)' : '0 2px 8px rgba(0,0,0,0.06)'};
                                    transition:box-shadow 0.2s,transform 0.2s;">
                            <div style="width:44px;height:44px;border-radius:10px;flex-shrink:0;
                                        display:flex;align-items:center;justify-content:center;
                                        background:${active ? tab.accent : '#f1f5f9'};">
                                <span class="material-symbols-outlined"
                                      style="font-size:24px;color:${active ? '#ffffff' : 'var(--text-muted)'};">${tab.icon}</span>
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:1rem;font-weight:700;color:${active ? tab.accent : 'var(--text-primary)'};">${tab.label}</div>
                                <div style="font-size:0.8rem;color:var(--text-muted);">${tab.desc}</div>
                            </div>
                            ${active
                                ? `<span class="material-symbols-outlined" style="color:${tab.accent};flex-shrink:0;font-size:20px;">check_circle</span>`
                                : `<span class="material-symbols-outlined" style="color:var(--text-muted);flex-shrink:0;">chevron_right</span>`}
                        </div>`;
                    }).join('')}
                </div>

                <!-- 탭 컨텐츠 -->
                <div id="tabContent"></div>
            </div>
        `;

        // 탭 컨텐츠 렌더링
        setTimeout(() => {
            _renderTabContent();
        }, 50);
    }

    // 탭 전환
    function _switchTab(tabName) {
        state.currentTab = tabName;
        const container = document.querySelector('.fade-in-up');
        if (container) {
            render(container);
        }
    }

    // 탭 컨텐츠 렌더링
    function _renderTabContent() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        if (state.currentTab === 'inspection') {
            // 검사 진행 탭
            tabContent.innerHTML = `
                <!-- 검사대기품 (도장 작업 완료 목록) -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">done_all</span> 외관 검사 대기품</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">도장 작업 완료된 제품을 외관 검사합니다.</span>
                    </div>
                    <div class="card-body" id="inspectionWaitingList"></div>
                </div>

                <!-- 선택 정보 -->
                <div id="selectedInfo"></div>

                <!-- 불량 유형 선택 -->
                <div id="defectCounter"></div>

                <!-- 현재 집계 & 저장 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">summarize</span> 현재 집계</h4>
                    </div>
                    <div class="card-body" id="currentSummary"></div>
                    <div class="card-footer" style="display:flex;gap:10px;justify-content:center;">
                        <button class="btn btn-primary" onclick="PaintingInspectionModule.save()">
                            <span class="material-symbols-outlined">save</span> 저장
                        </button>
                        <button class="btn btn-secondary" onclick="PaintingInspectionModule.reset()">
                            <span class="material-symbols-outlined">restart_alt</span> 초기화
                        </button>
                    </div>
                </div>
            `;
            renderInspectionWaitingList();
            renderDefectCounter();
            renderSummary();
        } else if (state.currentTab === 'completion') {
            // 검사 완료 실적 탭
            showCompletionResults();
        } else if (state.currentTab === 'nonconform-standard') {
            renderNonconformStandardPage();
        }
    }

    async function renderNonconformStandardPage() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;
        _nonconformStandardImage = await _loadNonconformStandardImage();
        const canUpload = _canUploadNonconformStandard();
        tabContent.innerHTML = `
            <div class="page-header" style="margin-bottom:14px;">
                <div class="page-actions" style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
                    <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule.printNonconformStandardPage()">
                        <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule.focusNonconformStandardPasteZone()" ${canUpload ? '' : 'disabled'} style="${canUpload ? '' : 'opacity:.5;cursor:not-allowed;'}">
                        <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 기준서 업로드
                    </button>
                </div>
            </div>
            <div class="card" style="display:inline-block;width:auto;max-width:100%;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);padding:18px 18px 24px;border-radius:18px;box-shadow:0 18px 42px rgba(15,23,42,0.14),0 6px 14px rgba(15,23,42,0.10);">
                <div id="paintingNonconformStandardPasteZone" tabindex="0" onpaste="PaintingInspectionModule.handleNonconformStandardPaste(event)" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" aria-hidden="true"></div>
                ${_nonconformStandardImage
                    ? `<div style="display:inline-flex;justify-content:flex-start;align-items:flex-start;width:fit-content;max-width:100%;border:1px solid #111;box-shadow:0 10px 28px rgba(15,23,42,0.18),0 3px 8px rgba(15,23,42,0.12);"><img src="${_nonconformStandardImage}" alt="부적합 처리 기준서" style="display:block;max-width:100%;height:auto;"></div>`
                    : `<div style="min-width:980px;min-height:1385px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1rem;">등록된 기준서 이미지가 없습니다.</div>`}
            </div>
        `;
    }

    function focusNonconformStandardPasteZone() {
        if (!_canUploadNonconformStandard()) {
            UIUtils.toast('기준서 업로드는 관리자 또는 관리 권한자만 가능합니다.', 'warning');
            return;
        }
        const zone = document.getElementById('paintingNonconformStandardPasteZone');
        if (!zone) return;
        zone.focus();
        UIUtils.toast('기준서 업로드 영역이 선택되었습니다. Ctrl+V로 붙여넣어 주세요.', 'info');
    }

    async function handleNonconformStandardPaste(event) {
        event.preventDefault();
        if (!_canUploadNonconformStandard()) {
            UIUtils.toast('기준서 업로드 권한이 없습니다.', 'warning');
            return;
        }
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
        if (!imageItem) {
            UIUtils.toast('클립보드 이미지가 없습니다. 기준서 화면을 복사한 뒤 다시 붙여넣어 주세요.', 'warning');
            return;
        }
        const file = imageItem.getAsFile();
        if (!file) {
            UIUtils.toast('이미지 읽기 중 오류가 발생했습니다.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                _nonconformStandardImage = String(reader.result || '');
                await Storage.setConfigValue(NONCONFORM_STANDARD_IMAGE_KEY, _nonconformStandardImage);
                await renderNonconformStandardPage();
                UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
            } catch (e) {
                console.warn('[PaintingInspectionModule] standard save failed:', e);
                UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('클립보드 이미지를 읽을 수 없습니다.', 'error');
        reader.readAsDataURL(file);
    }

    function printNonconformStandardPage() {
        const img = document.querySelector('#tabContent img');
        const imageSrc = img ? String(img.getAttribute('src') || '') : String(_nonconformStandardImage || '');
        if (!imageSrc) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드해 주세요.', 'warning');
            return;
        }
        const win = window.open('', 'painting_nonconform_standard_print', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(`
            <!doctype html><html lang="ko"><head><meta charset="utf-8"><title>부적합 처리 기준서</title>
            <style>
                @page { size: A4 landscape; margin:4mm 6mm 6mm 6mm; }
                html, body { margin:0; padding:0; background:#fff; }
                body { display:flex; align-items:flex-start; justify-content:center; overflow:hidden; }
                .print-sheet { width:285mm; height:198mm; display:flex; align-items:flex-start; justify-content:center; overflow:hidden; margin:0 auto; padding-top:1mm; }
                img { display:block; width:auto; height:auto; max-width:285mm; max-height:197mm; object-fit:contain; break-inside:avoid; page-break-inside:avoid; }
                * { box-sizing:border-box; break-inside:avoid; page-break-inside:avoid; }
            </style></head><body><div class="print-sheet"><img src="${imageSrc}" alt="부적합 처리 기준서"></div></body></html>
        `);
        win.document.close();
        win.focus();
        win.print();
    }

    // 검사대기품 목록 표시 (도장 완료되었으나 검사 실적이 없는 목록)
    function renderInspectionWaitingList() {
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const inspections = Storage.getAll(STORE) || []; // 검사 실적 저장소
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const el = document.getElementById('inspectionWaitingList');

        // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
        function findProduct(w) {
            return products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
                || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
        }

        // 검사 실적이 이미 있는 도장 작업 ID 세트 만들기
        const inspectedWorkIds = new Set(inspections.map(i => i.workId || i.id).filter(Boolean));

        // 검사 미완료 작업 (inspectionStatus !== 'completed')만 필터링
        const inspectionWorks = paintingWorks.filter(w => {
            // 검사 완료된 작업은 제외
            if (w.inspectionStatus === 'completed') return false;

            // 제품이 없으면 제외
            const product = findProduct(w);
            if (!product) return false;

            // 제품의 전체 공정 슬롯 검사
            const allProcs = [product.process1, product.process2, product.process3, product.process4]
                .map(p => (p || '').trim());

            // 레이져 공정이 포함된 제품은 외관 검사 대기 제외 (레이져 대기품으로 처리)
            const hasLaserProcess = allProcs.some(p => p === '레이져' || p === '레이저'
                || p.includes('레이져') || p.includes('레이저'));
            if (hasLaserProcess) return false;

            const p2 = (product.process2 || '').trim();
            const p4 = (product.process4 || '').trim();
            const hasInspectionProcess = p2.includes('검사') || p4.includes('검사')
                || p2 === '외관 검사' || p2 === '외관검사'
                || p4 === '외관 검사' || p4 === '외관검사';

            // process 미설정이거나 검사 공정이 있으면 표시
            return !p2 && !p4 || hasInspectionProcess;
        });

        if (inspectionWorks.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">외관 검사 공정 제품의 도장 작업 완료 데이터가 없습니다.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>도장작업일</th>
                            <th>라인</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th>사출 LOT</th>
                            <th style="text-align:right;">도장 완료(검사대기) 수량</th>
                            <th style="width:120px;">외관 검사</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inspectionWorks.map(w => {
            const lotDisplay = (w.lots && w.lots.length > 0) ?
                w.lots.map(l => l.lotNo).join(', ') : (w.lotNo || '-');

            const _wp = (w.date || '').split('-');
            const _wst = (w.startTime || '').slice(0, 5);
            const _workDateHtml = _wp.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _wp[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + _wp[1] + '-' + _wp[2] + '</span>' +
                  (_wst ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _wst + '</span>' : '')
                : (w.date || '-');

            return `
                                <tr>
                                    <td style="line-height:1.3;">${_workDateHtml}</td>
                                    <td><span class="badge badge-info">${w.line || '-'}</span></td>
                                    <td>${w.carModel || '-'}</td>
                                    <td><strong>${w.partName || '-'}</strong></td>
                                    <td>${w.color || '-'}</td>
                                    <td style="font-family:monospace;font-size:0.85rem;">${lotDisplay}</td>
                                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(w.productionQty || 0)}</td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm btn-primary" onclick="PaintingInspectionModule.openInspectionModal('${w.id}')">
                                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">edit</span>외관 검사
                                        </button>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 생산 계획 지시서 목록 표시
    function renderPlanSelector() {
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS);
        // 오늘 또는 진행 중인 계획만 표시
        const activePlans = plans.filter(p => p.status === '진행' || p.status === '대기');

        const el = document.getElementById('planSelector');

        if (activePlans.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">활성화된 생산 계획이 없습니다. 생산 계획 지시서에서 등록하세요.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>선택</th>
                            <th>지시번호</th>
                            <th>날짜</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th>계획수량</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activePlans.map(p => `
                            <tr style="cursor:pointer;${state.selectedPlan?.id === p.id ? 'background:#eff6ff;' : ''}" onclick="PaintingInspectionModule.selectPlan('${p.id}')">
                                <td><input type="radio" name="planSelect" ${state.selectedPlan?.id === p.id ? 'checked' : ''}></td>
                                <td><strong>${p.orderNo || '-'}</strong></td>
                                <td>${p.date}</td>
                                <td>${p.carModel || '-'}</td>
                                <td>${p.partName || '-'}</td>
                                <td>${p.color || '-'}</td>
                                <td>${UIUtils.formatNumber(p.planQty)}</td>
                                <td>${UIUtils.badge(p.status, p.status === '진행' ? 'info' : 'warning')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function selectPlan(id) {
        const plan = Storage.getById(DB.STORES.PRODUCTION_PLANS, id);
        state.selectedPlan = plan;
        state.selectedWork = null; // 도장 작업 선택 해제
        renderInspectionWaitingList();
        renderSelectedInfo();
    }

    // 도장 작업 완료에서 직접 검사 시작 (통합 입력 모달)
    function openInspectionModal(workId) {
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) {
            UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
            return;
        }

        const allDefects = Storage.getAll(DEFECT_STORE) || [];
        const injectionDefects = allDefects.filter(d => d && (d.type === 'injection' || !d.type));
        const paintingDefects = allDefects.filter(d => d && d.type === 'painting');
        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];

        const lotDisplay = work.lots && work.lots.length > 0 ?
            work.lots.map(l => l.lotNo).join(', ') :
            (work.lotNo || '-');

        // 모달 HTML 작성
        let modalContent = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <!-- 도장 정보 컴팩트 배너 -->
                <div style="background:var(--bg-secondary); border-radius:8px; padding:8px 14px; display:flex; flex-wrap:wrap; gap:6px 20px; align-items:center; border-left:4px solid var(--accent-blue);">
                    <span style="font-size:0.75rem; color:var(--text-muted);">작업일&nbsp;<strong style="color:var(--text-primary);">${work.date || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">시간&nbsp;<strong style="color:var(--text-primary);">${work.startTime ? (work.startTime + (work.endTime ? ' ~ ' + work.endTime : '')) : '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">차종&nbsp;<strong style="color:var(--text-primary);">${work.carModel || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">품명&nbsp;<strong style="color:var(--text-primary);">${work.partName || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">컬러&nbsp;<strong style="color:var(--text-primary);">${work.color || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">LOT&nbsp;<strong style="color:var(--text-primary); font-family:monospace;">${lotDisplay}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">작업수량&nbsp;<strong style="color:var(--accent-blue); font-size:0.95rem;">${UIUtils.formatNumber(work.productionQty || 0)} EA</strong>
                        <input type="hidden" id="inpInspectionQty" value="${work.productionQty || 0}">
                    </span>
                </div>

                <!-- 2-컬럼 메인 레이아웃 -->
                <div style="display:grid; grid-template-columns:260px 1fr; gap:10px; align-items:start;">

                    <!-- 좌측: 검사 정보 + 수량 + 검사자 -->
                    <div style="display:flex; flex-direction:column; gap:10px;">

                        <!-- 검사 시간 -->
                        <div class="card">
                            <div class="card-body" style="padding:12px;">
                                <h5 style="margin:0 0 10px 0; font-size:0.85rem; color:var(--text-primary);">검사 정보</h5>
                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">검사일자</label>
                                        <input type="date" class="form-input" id="inpInspectionDate" value="${UIUtils.today()}" style="font-weight:600; font-size:0.85rem; padding:6px 8px;">
                                    </div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                        <div class="form-group" style="margin:0;">
                                            <label class="form-label" style="font-size:0.72rem;">시작시간</label>
                                            <input type="time" class="form-input" id="inpInspectionStartTime" style="font-weight:600; font-size:0.82rem; padding:6px 4px;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                                        </div>
                                        <div class="form-group" style="margin:0;">
                                            <label class="form-label" style="font-size:0.72rem;">완료시간</label>
                                            <input type="time" class="form-input" id="inpInspectionEndTime" style="font-weight:600; font-size:0.82rem; padding:6px 4px;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                                        </div>
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">소요시간</label>
                                        <input type="text" class="form-input" id="inpInspectionDuration" placeholder="자동계산" readonly style="background:var(--bg-secondary); font-weight:600; font-size:0.85rem; padding:6px 8px;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 검사 수량 -->
                        <div class="card">
                            <div class="card-body" style="padding:12px;">
                                <h5 style="margin:0 0 10px 0; font-size:0.85rem; color:var(--text-primary);">검사 수량</h5>
                                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">양품수</label>
                                        <input type="number" class="form-input" id="inpGoodQty" value="${work.productionQty || 0}" min="0" style="text-align:right; font-weight:600; font-size:0.9rem; padding:5px 6px;" onchange="PaintingInspectionModule._updateDefectQty()">
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">불량수</label>
                                        <input type="number" class="form-input" id="inpDefectQty" value="0" min="0" style="text-align:right; font-weight:600; font-size:0.9rem; padding:5px 6px;" onchange="PaintingInspectionModule._updateGoodQty()">
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">합계 (자동)</label>
                                        <input type="text" class="form-input" id="inpTotalQty" value="${UIUtils.formatNumber(work.productionQty || 0)}" readonly style="background:var(--bg-secondary); text-align:right; font-weight:700; font-size:0.9rem; padding:5px 6px; color:var(--accent-blue);">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 검사자 -->
                        <div class="card">
                            <div class="card-body" style="padding:12px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <h5 style="margin:0; font-size:0.85rem; color:var(--text-primary);">검사자</h5>
                                    <button class="btn btn-sm btn-primary" onclick="PaintingInspectionModule._addInspectorField()" id="addInspectorBtn" style="gap:4px; padding:4px 8px; font-size:0.78rem;">
                                        <span class="material-symbols-outlined" style="font-size:14px;">add</span> 추가
                                    </button>
                                </div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;" id="inspectorContainer">
                                    <!-- 동적으로 생성됨 -->
                                </div>
                            </div>
                        </div>

                        <!-- 버튼 -->
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <button class="btn btn-primary" onclick="PaintingInspectionModule._saveInspection('${workId}')" style="width:100%; justify-content:center;">
                                <span class="material-symbols-outlined">save</span> 저장
                            </button>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-secondary" onclick="window.print()" style="flex:1; justify-content:center; font-size:0.85rem;">
                                    <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                                </button>
                                <button class="btn btn-outline" onclick="PaintingInspectionModule._closeInspectionModal()" style="flex:1; justify-content:center; font-size:0.85rem;">
                                    <span class="material-symbols-outlined" style="font-size:16px;">close</span> 취소
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 우측: 불량 유형 입력 -->
                    <div class="card" style="height:100%;">
                        <div class="card-body" style="padding:14px;">
                            <h5 style="margin:0 0 12px 0; font-size:0.85rem; color:var(--text-primary);">불량 유형 입력</h5>

                            ${injectionDefects.length > 0 ? `
                            <div style="margin-bottom:14px;">
                                <div style="font-size:0.78rem; font-weight:700; color:#ea580c; border-bottom:2px solid #ea580c; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">precision_manufacturing</span> 사출 불량
                                </div>
                                <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px;">
                                    ${injectionDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary);">${d.name}</label>
                                            <input type="text" inputmode="none" readonly id="inj-${d.id}" value="0" min="0" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem; cursor:pointer; background:white;" onclick="PaintingInspectionModule._showNumericPad(this)">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            ${paintingDefects.length > 0 ? `
                            <div>
                                <div style="font-size:0.78rem; font-weight:700; color:#16a34a; border-bottom:2px solid #16a34a; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">format_paint</span> 도장 불량
                                </div>
                                <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px;">
                                    ${paintingDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary);">${d.name}</label>
                                            <input type="text" inputmode="none" readonly id="paint-${d.id}" value="0" min="0" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem; cursor:pointer; background:white;" onclick="PaintingInspectionModule._showNumericPad(this)">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 커스텀 모달 생성
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.style.display = 'block';
        modalEl.innerHTML = `
            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; border-radius: 0 !important; }
                    .modal h2 { margin: 0 0 20px 0 !important; }
                    .modal > div > button { display: none !important; }
                    .btn { display: none !important; }
                    .card { page-break-inside: avoid; border: 1px solid #ccc !important; }
                    .form-input { border: 1px solid #ccc !important; }
                    .form-select { border: 1px solid #ccc !important; }
                }
            </style>
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; border-radius:12px; max-width:78vw; max-height:92vh; width:78vw; overflow:auto; padding:16px 20px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h2 style="margin:0; font-size:1.1rem;">도장 검사 입력</h2>
                        <button onclick="PaintingInspectionModule._closeInspectionModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // 모달에 데이터 저장 (나중에 접근하기 위해)
        modalEl.inspectionWorkId = workId;
        modalEl.injectionDefects = injectionDefects;
        modalEl.paintingDefects = paintingDefects;
        // 부모 페이지 컨테이너 저장 (닫을 때 복귀하기 위해)
        modalEl.parentPageContainer = document.querySelector('[data-page="painting-inspection"]');

        // 검사자 필드 초기화 (기본 4명)
        setTimeout(() => {
            const container = document.getElementById('inspectorContainer');
            if (container) {
                container.innerHTML = '';
                container.inspectorCount = 0;
                PaintingInspectionModule._addInspectorField(true);
                PaintingInspectionModule._addInspectorField();
                PaintingInspectionModule._addInspectorField();
                PaintingInspectionModule._addInspectorField();
            }
        }, 100);
    }

    // 검사자 필드 동적 추가
    function _addInspectorField(isFirst = false) {
        const container = document.getElementById('inspectorContainer');
        if (!container) return;

        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];

        // 현재 개수 확인
        if (!container.inspectorCount) {
            container.inspectorCount = container.querySelectorAll('[id^="inspector"]').length;
        }

        // 최대 5명까지만 추가
        if (!isFirst && container.inspectorCount >= 5) {
            UIUtils.toast('검사자는 최대 5명까지 추가할 수 있습니다.', 'warning');
            return;
        }

        container.inspectorCount++;
        const idx = container.inspectorCount;

        const fieldHTML = `
            <div class="form-group" id="inspectorGroup${idx}" style="margin:0;">
                <label class="form-label" style="font-size:0.72rem;">검사자${idx}</label>
                <select id="inspector${idx}" class="form-select" style="padding:5px 6px; border:1px solid var(--border); font-size:0.85rem;" onchange="PaintingInspectionModule._syncInspectorOptions()">
                    <option value="">선택 안함</option>
                    ${inspectors.map(insp => `<option value="${insp.id}">${insp.name || insp.id}</option>`).join('')}
                </select>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', fieldHTML);
        PaintingInspectionModule._syncInspectorOptions();

        // + 버튼 상태 업데이트
        const addBtn = document.getElementById('addInspectorBtn');
        if (addBtn) {
            addBtn.disabled = container.inspectorCount >= 5;
        }
    }

    // 검사자 드롭다운 간 중복 선택 방지
    function _syncInspectorOptions() {
        const container = document.getElementById('inspectorContainer');
        if (!container) return;
        const selects = Array.from(container.querySelectorAll('select[id^="inspector"]'));
        const selectedValues = selects.map(s => s.value).filter(v => v !== '');
        selects.forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if (opt.value === '' || opt.value === sel.value) {
                    opt.disabled = false;
                } else {
                    opt.disabled = selectedValues.includes(opt.value);
                }
            });
        });
    }

    // 검사 모달 닫기 및 도장 검사 페이지로 복귀
    function _closeInspectionModal() {
        // 모달 제거
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();

        // Router를 통해 도장 검사 페이지로 이동
        Router.navigate('painting-inspection');
    }

    // 숫자 키패드 표시
    function _showNumericPad(inputEl) {
        // 기존 키패드 정리 (이벤트 리스너 포함)
        _closeNumericPad();
        // 태블릿 소프트 키보드 억제
        inputEl.blur();

        // 현재 값 표시용
        let currentVal = inputEl.value || '0';

        const pad = document.createElement('div');
        pad.id = 'numericPad';
        pad.style.cssText = `
            position:fixed; z-index:99999;
            background:white; border-radius:16px;
            padding:16px; box-shadow:0 8px 32px rgba(0,0,0,0.25);
            width:220px;
        `;

        pad.innerHTML = `
            <div style="text-align:center; margin-bottom:10px; font-size:0.85rem; color:var(--text-muted); font-weight:600;">${inputEl.previousElementSibling ? inputEl.previousElementSibling.textContent : '입력'}</div>
            <div id="numpadDisplay" style="text-align:center; font-size:2rem; font-weight:700; color:var(--accent-blue); background:var(--bg-secondary); border-radius:8px; padding:10px; margin-bottom:12px; min-height:56px;">${currentVal}</div>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
                ${[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => `
                    <button onclick="PaintingInspectionModule._numpadInput('${n}')" style="padding:14px; font-size:1.2rem; font-weight:600; border:1px solid var(--border); border-radius:8px; background:white; cursor:pointer;">${n}</button>
                `).join('')}
                <button onclick="PaintingInspectionModule._numpadDelete()" style="padding:14px; font-size:1.2rem; border:1px solid var(--border); border-radius:8px; background:#fff3f3; cursor:pointer;">⌫</button>
                <button onclick="PaintingInspectionModule._numpadInput('0')" style="padding:14px; font-size:1.2rem; font-weight:600; border:1px solid var(--border); border-radius:8px; background:white; cursor:pointer;">0</button>
                <button onclick="PaintingInspectionModule._numpadConfirm()" style="padding:14px; font-size:1rem; font-weight:700; border:none; border-radius:8px; background:var(--accent-blue); color:white; cursor:pointer;">완료</button>
            </div>
        `;

        // 위치: 입력 필드 기준
        const rect = inputEl.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = rect.left;

        // 화면 밖으로 나가지 않도록 조정
        if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
        if (top + 340 > window.innerHeight) top = rect.top - 348;

        pad.style.top = top + 'px';
        pad.style.left = left + 'px';

        document.body.appendChild(pad);

        // 타겟 input 저장
        pad._targetInput = inputEl;

        // 키보드 입력 시: 숫자만 허용 + 키패드 디스플레이 동기화
        inputEl._numpadInputHandler = function() {
            // 숫자 외 문자 제거
            let raw = inputEl.value.replace(/[^0-9]/g, '');
            if (raw.length > 5) raw = raw.substring(0, 5);
            if (inputEl.value !== raw) inputEl.value = raw;
            const display = document.getElementById('numpadDisplay');
            if (display) display.textContent = raw || '0';
            _updateDefectTotal();
        };
        inputEl.addEventListener('input', inputEl._numpadInputHandler);

        // 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', _numpadOutsideClick);
        }, 100);
        // Enter 키로 완료
        document.addEventListener('keydown', _numpadKeyHandler);
    }

    function _numpadKeyHandler(e) {
        if (e.key === 'Enter') { e.preventDefault(); _numpadConfirm(); }
        else if (e.key === 'Backspace') { e.preventDefault(); _numpadDelete(); }
        else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); _numpadInput(e.key); }
    }

    function _numpadOutsideClick(e) {
        const pad = document.getElementById('numericPad');
        if (!pad) {
            document.removeEventListener('click', _numpadOutsideClick);
            return;
        }
        // 키패드 내부 클릭이면 무시
        if (pad.contains(e.target)) return;
        // 다른 불량 input 클릭이면: 키패드 닫고 새 키패드는 _showNumericPad가 열어줌
        _closeNumericPad();
    }

    function _closeNumericPad() {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        if (pad._targetInput && pad._targetInput._numpadInputHandler) {
            pad._targetInput.removeEventListener('input', pad._targetInput._numpadInputHandler);
            delete pad._targetInput._numpadInputHandler;
        }
        pad.remove();
        document.removeEventListener('click', _numpadOutsideClick);
        document.removeEventListener('keydown', _numpadKeyHandler);
    }

    function _numpadInput(digit) {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        const display = document.getElementById('numpadDisplay');
        let val = display.textContent === '0' ? digit : display.textContent + digit;
        if (val.length > 5) return; // 최대 5자리
        display.textContent = val;
    }

    function _numpadDelete() {
        const display = document.getElementById('numpadDisplay');
        if (!display) return;
        const val = display.textContent;
        display.textContent = val.length <= 1 ? '0' : val.slice(0, -1);
    }

    function _numpadConfirm() {
        const pad = document.getElementById('numericPad');
        if (!pad) return;
        const display = document.getElementById('numpadDisplay');
        const val = display.textContent || '0';

        if (pad._targetInput) {
            pad._targetInput.value = parseInt(val) || 0;
            _updateDefectTotal();
        }

        _closeNumericPad();
    }

    // 제품 선택 목록
    function renderProductSelector() {
        const products = Storage.getAll(PRODUCTS_STORE);
        const el = document.getElementById('productSelector');

        if (products.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">제품이 없습니다. 관리/설정에서 제품을 등록하세요.</p>`;
            return;
        }

        // 차종별 그룹핑
        const grouped = {};
        products.forEach(p => {
            const model = p.carModel || '미분류';
            if (!grouped[model]) grouped[model] = [];
            grouped[model].push(p);
        });

        let html = '';
        Object.entries(grouped).forEach(([model, items]) => {
            html += `<div class="product-group">`;
            html += `<div class="product-group-header">${model}</div>`;
            html += `<div class="product-group-items">`;
            items.forEach(p => {
                const display = p.displayName || `${p.carModel} ${p.partName} ${p.color}`.trim();
                const isSelected = state.selectedProduct && state.selectedProduct.id === p.id;
                html += `<button class="product-select-btn ${isSelected ? 'selected' : ''}" 
                            onclick="PaintingInspectionModule.selectProduct('${p.id}')">${p.color || display}</button>`;
            });
            html += `</div></div>`;
        });

        el.innerHTML = html;
    }

    function selectProduct(id) {
        const product = Storage.getById(PRODUCTS_STORE, id);
        state.selectedProduct = product;
        state.counts = {};
        renderProductSelector();
        renderDefectCounter();
        renderSelectedInfo();
        renderSummary();
    }

    function renderSelectedInfo() {
        const el = document.getElementById('selectedInfo');
        if (!state.selectedProduct && !state.selectedPlan && !state.selectedWork) {
            el.innerHTML = '';
            return;
        }

        let html = '';
        if (state.selectedPlan) {
            html += `<div class="selected-info" style="margin-bottom:10px;">
                <span class="material-symbols-outlined">assignment</span>
                <span>지시서: <strong>${state.selectedPlan.orderNo || '-'}</strong> |
                ${state.selectedPlan.carModel} ${state.selectedPlan.partName} ${state.selectedPlan.color} |
                계획: ${UIUtils.formatNumber(state.selectedPlan.planQty)}EA</span>
            </div>`;
        }
        if (state.selectedWork) {
            const lotDisplay = state.selectedWork.lots && state.selectedWork.lots.length > 0 ?
                state.selectedWork.lots.map(l => l.lotNo).join(', ') :
                (state.selectedWork.lotNo || '-');
            html += `<div class="selected-info" style="margin-bottom:10px;background:rgba(76,175,80,0.1);border-left:4px solid var(--accent-green);padding:8px;border-radius:4px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);">done_all</span>
                <span>도장 작업: <strong>${state.selectedWork.date}</strong> |
                ${state.selectedWork.carModel} ${state.selectedWork.partName} ${state.selectedWork.color} |
                LOT: ${lotDisplay} |
                완료수량: <strong>${UIUtils.formatNumber(state.selectedWork.productionQty || 0)}EA</strong></span>
            </div>`;
        }
        if (state.selectedProduct) {
            const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;
            html += `<div class="selected-info" style="margin-bottom:20px;">
                <span class="material-symbols-outlined">category</span>
                <span>제품: <strong>${display}</strong></span>
            </div>`;
        }
        el.innerHTML = html;
    }

    function renderDefectCounter() {
        const el = document.getElementById('defectCounterGrid');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어

        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id); // 유효한 항목만

        if (defects.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);padding:10px 0;">불량 유형이 없습니다. <strong>관리/설정 &gt; 불량 유형</strong>에서 사출/도장 불량을 등록하세요.</p>`;
            el.style.display = 'block';
            el.style.gridTemplateColumns = 'none';
            return;
        }

        const injDefects = defects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = defects.filter(d => d.type === 'painting');

        let html = '';

        if (injDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-blue);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">precision_manufacturing</span> 사출 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:20px;">`;
            html += injDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${state.counts[d.id] || 0}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        if (paintDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-orange);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">format_paint</span> 도장 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:10px;">`;
            html += paintDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${state.counts[d.id] || 0}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        el.innerHTML = html;
        el.style.display = 'block';
        el.style.gridTemplateColumns = 'none';
    }

    function increment(defectId, defectName) {
        if (!state.selectedProduct) {
            UIUtils.toast('먼저 제품을 선택하세요.', 'warning');
            return;
        }
        state.counts[defectId] = (state.counts[defectId] || 0) + 1;
        updateCountDisplay(defectId);
        renderSummary();
    }

    function decrement(defectId) {
        if (state.counts[defectId] && state.counts[defectId] > 0) {
            state.counts[defectId]--;
            updateCountDisplay(defectId);
            renderSummary();
        }
    }

    function updateCountDisplay(defectId) {
        const btn = document.getElementById(`defect-btn-${defectId}`);
        if (btn) {
            btn.querySelector('.defect-count').textContent = state.counts[defectId] || 0;
        }
    }

    // 현재 집계 표시
    function renderSummary() {
        const el = document.getElementById('currentSummary');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어
        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id);
        const active = defects.filter(d => (state.counts[d.id] || 0) > 0);

        let html = '';

        // 상단: 현재 카운팅 중인 불량
        if (active.length > 0) {
            const total = active.reduce((s, d) => s + state.counts[d.id], 0);

            // 사출, 도장 구분하여 표시
            const injActive = active.filter(d => d.type === 'injection' || !d.type);
            const paintActive = active.filter(d => d.type === 'painting');

            html += `<h6 style="margin:0 0 8px 0; color:var(--accent-blue); font-weight:600;">▶ 현재 카운팅</h6>`;

            if (injActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">사출 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${injActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(59, 130, 246, 0.1);border:1px solid rgba(59, 130, 246, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-blue);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            if (paintActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">도장 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${paintActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(245, 158, 11, 0.1);border:1px solid rgba(245, 158, 11, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-orange);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            html += `
                <div style="text-align:right;padding:8px 12px;background:rgba(239,68,68,0.1);border-radius:6px;font-weight:700;margin-bottom:16px;">
                    소계: <span style="color:var(--accent-red)">${UIUtils.formatNumber(total)}</span>
                </div>
            `;
        }

        // 하단: 검사 완료된 실적 목록
        const allInspections = Storage.getAll(STORE) || [];
        const todayInspections = allInspections.filter(i => i.date === UIUtils.today()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const _allWorks = Storage.getAll(PAINTING_WORK_STORE) || [];

        if (todayInspections.length > 0) {
            html += `<h6 style="margin:16px 0 8px 0; color:var(--accent-green); font-weight:600; border-top:1px dashed var(--border); padding-top:12px;">▶ 검사 완료 실적 (오늘)</h6>`;
            html += `
                <div class="data-table-wrapper" style="margin-top:8px;">
                    <table class="data-table" style="font-size:0.9rem;">
                        <thead>
                            <tr>
                                <th>검사일자</th>
                                <th>도장작업일</th>
                                <th>라인</th>
                                <th>차종</th>
                                <th>품명</th>
                                <th>컬러</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">양품</th>
                                <th style="text-align:right;">불량</th>
                                <th style="text-align:right;">불량률</th>
                                <th style="width:60px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${todayInspections.map(i => {
                                const insp = Number(i.inspectionQty) || 0;
                                const defect = Number(i.defectQty) || 0;
                                const rate = insp > 0 ? (defect / insp * 100).toFixed(1) : '0.0';
                                const _ip = (i.date || '').split('-');
                                const _ist = (i.inspectionStartTime || '').slice(0, 5);
                                const _inspDateHtml = _ip.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _ip[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _ip[1] + '-' + _ip[2] + '</span>' +
                                      (_ist ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _ist + '</span>' : '')
                                    : (i.date || '-');
                                const _wp = (i.paintingDate || '').split('-');
                                const _wst = (i.paintingTime || '').slice(0, 5);
                                const _workDateHtml = _wp.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _wp[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _wp[1] + '-' + _wp[2] + '</span>' +
                                      (_wst ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _wst + '</span>' : '')
                                    : (i.paintingDate || '-');
                                return `
                                <tr>
                                    <td style="line-height:1.3;">${_inspDateHtml}</td>
                                    <td style="line-height:1.3;">${_workDateHtml}</td>
                                    <td><span class="badge badge-info">${(_allWorks.find(w => w.id === (i.workId || i.productId)) || {}).line || '-'}</span></td>
                                    <td>${i.carModel || '-'}</td>
                                    <td><strong>${i.partName || '-'}</strong></td>
                                    <td>${i.color || '-'}</td>
                                    <td style="text-align:right;">${UIUtils.formatNumber(insp)}</td>
                                    <td style="text-align:right;color:var(--accent-green);font-weight:600;">${UIUtils.formatNumber(Number(i.goodQty) || 0)}</td>
                                    <td style="text-align:right;color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(defect)}</td>
                                    <td style="text-align:right;font-weight:600;color:${defect > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${rate}%</td>
                                    <td style="text-align:center;"><button class="btn btn-sm btn-outline" onclick="PaintingInspectionModule.showInspectionDetail('${i.id}')">보기</button></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (active.length === 0) {
            html = `<p style="color:var(--text-muted);text-align:center;padding:20px;">오늘 등록된 검사 실적이 없습니다.</p>`;
        }

        el.innerHTML = html;
    }

    // 검사 상세 보기 모달
    function showInspectionDetail(id) {
        const allInspections = Storage.getAll(STORE) || [];
        const i = allInspections.find(r => r.id === id);
        if (!i) { UIUtils.toast('검사 기록을 찾을 수 없습니다.', 'error'); return; }

        const insp = Number(i.inspectionQty) || 0;
        const good = Number(i.goodQty) || 0;
        const defect = Number(i.defectQty) || 0;
        const rate = insp > 0 ? (defect / insp * 100).toFixed(1) : '0.0';

        function fmtDate(d) {
            const p = String(d || '').split('-');
            if (p.length !== 3) return { year: '-', md: d || '-', raw: d || '-' };
            return { year: p[0], md: p[1] + '-' + p[2], raw: d };
        }
        function infoRow(label, val) {
            return '<div style="display:grid;grid-template-columns:112px minmax(0,1fr);gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.18);">' +
                   '<div style="font-size:0.77rem;color:var(--text-muted);font-weight:700;letter-spacing:0.02em;">' + label + '</div>' +
                   '<div style="font-size:0.95rem;font-weight:600;color:var(--text-primary);word-break:break-word;">' + val + '</div>' +
                   '</div>';
        }
        function statCard(label, value, tone) {
            const color = tone === 'green' ? '#059669' : tone === 'red' ? '#ef4444' : tone === 'orange' ? '#f97316' : '#1d4ed8';
            const bg = tone === 'green' ? 'rgba(16,185,129,0.10)' : tone === 'red' ? 'rgba(239,68,68,0.10)' : tone === 'orange' ? 'rgba(249,115,22,0.10)' : 'rgba(37,99,235,0.10)';
            return '<div style="padding:14px 16px;border-radius:16px;background:' + bg + ';border:1px solid rgba(148,163,184,0.14);min-height:86px;">' +
                   '<div style="font-size:0.76rem;color:var(--text-muted);font-weight:700;margin-bottom:8px;">' + label + '</div>' +
                   '<div style="font-size:1.5rem;font-weight:900;color:' + color + ';letter-spacing:0.01em;">' + value + '</div>' +
                   '</div>';
        }

        const inspectionDate = fmtDate(i.date);
        const paintingDate = fmtDate(i.paintingDate);
        const inspectionTime = i.inspectionStartTime ? String(i.inspectionStartTime).slice(0, 5) : '-';
        const inspectionRange = (i.inspectionStartTime || '-') + (i.inspectionEndTime ? ' ~ ' + i.inspectionEndTime : '');
        const inspectorText = (i.inspectors && i.inspectors.length > 0) ? i.inspectors.join(', ') : '-';
        const defectRows = (i.defects || []).map(function (d) {
            const sourceLabel = d.defectType === 'painting' ? '도장' : '사출';
            const sourceBg = d.defectType === 'painting' ? 'rgba(59,130,246,0.12)' : 'rgba(249,115,22,0.12)';
            const sourceColor = d.defectType === 'painting' ? '#2563eb' : '#ea580c';
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid rgba(148,163,184,0.14);border-radius:14px;box-shadow:0 8px 18px rgba(15,23,42,0.04);">' +
                '<div style="min-width:0;">' +
                    '<div style="font-size:0.95rem;font-weight:700;color:var(--text-primary);word-break:break-word;">' + (d.defectName || d.defectId) + '</div>' +
                    '<div style="margin-top:6px;"><span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:' + sourceBg + ';color:' + sourceColor + ';font-size:0.72rem;font-weight:800;">' + sourceLabel + '</span></div>' +
                '</div>' +
                '<div style="flex-shrink:0;text-align:right;">' +
                    '<div style="font-size:1.15rem;font-weight:900;color:var(--accent-red);">' + UIUtils.formatNumber(d.defectCount) + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">불량 수량</div>' +
                '</div>' +
            '</div>';
        }).join('');

        const html =
            '<div style="padding:6px 2px 2px;">' +
                '<div style="padding:18px;border-radius:22px;background:linear-gradient(135deg,#f8fbff 0%,#eef6ff 52%,#f8fafc 100%);border:1px solid rgba(59,130,246,0.14);box-shadow:0 18px 34px rgba(15,23,42,0.08);">' +
                    '<div style="display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;">' +
                        '<div style="padding:16px 14px;border-radius:18px;background:#fff;border:1px solid rgba(148,163,184,0.16);display:flex;flex-direction:column;justify-content:center;align-items:flex-start;box-shadow:0 10px 24px rgba(15,23,42,0.05);">' +
                            '<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">검사일자</div>' +
                            '<div style="font-size:0.78rem;color:#64748b;font-weight:700;">' + inspectionDate.year + '</div>' +
                            '<div style="font-size:1.8rem;line-height:1.1;font-weight:900;color:var(--text-primary);margin-top:2px;">' + inspectionDate.md + '</div>' +
                            '<div style="font-size:0.86rem;color:#2563eb;font-weight:800;margin-top:8px;">' + inspectionTime + '</div>' +
                        '</div>' +
                        '<div style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;flex:1 1 420px;min-width:280px;">' +
                            '<div>' +
                                '<div style="font-size:0.78rem;color:#2563eb;font-weight:800;letter-spacing:0.06em;">PAINT INSPECTION</div>' +
                                '<div style="font-size:1.45rem;font-weight:900;color:var(--text-primary);margin-top:6px;">' + (i.carModel || '-') + ' / ' + (i.partName || '-') + '</div>' +
                                '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
                                    '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(148,163,184,0.16);font-size:0.78rem;color:var(--text-secondary);font-weight:700;">컬러&nbsp;&nbsp;<strong style="color:var(--text-primary);">' + (i.color || '-') + '</strong></span>' +
                                    '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(148,163,184,0.16);font-size:0.78rem;color:var(--text-secondary);font-weight:700;">검사자&nbsp;&nbsp;<strong style="color:var(--text-primary);">' + inspectorText + '</strong></span>' +
                                '</div>' +
                            '</div>' +
                            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">' +
                                statCard('검사수량', UIUtils.formatNumber(insp), 'blue') +
                                statCard('양품', UIUtils.formatNumber(good), 'green') +
                                statCard('불량', UIUtils.formatNumber(defect), 'red') +
                                statCard('불량률', rate + '%', defect > 0 ? 'orange' : 'blue') +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px;">' +
                    '<div style="padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                        '<div style="font-size:0.86rem;font-weight:900;color:var(--text-primary);margin-bottom:6px;">기본 정보</div>' +
                        infoRow('검사 시간', inspectionRange) +
                        infoRow('도장 작업일', paintingDate.raw ? paintingDate.raw : '-') +
                        infoRow('사출 LOT', i.lotNo || '-') +
                        infoRow('검사자', inspectorText) +
                    '</div>' +
                    '<div style="padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                        '<div style="font-size:0.86rem;font-weight:900;color:var(--text-primary);margin-bottom:6px;">판정 요약</div>' +
                        infoRow('차종 / 품명', (i.carModel || '-') + ' / ' + (i.partName || '-')) +
                        infoRow('컬러', i.color || '-') +
                        infoRow('양품', '<span style="color:var(--accent-green);font-weight:800;">' + UIUtils.formatNumber(good) + '</span>') +
                        infoRow('불량', '<span style="color:var(--accent-red);font-weight:800;">' + UIUtils.formatNumber(defect) + '</span>') +
                        infoRow('불량률', '<span style="font-weight:800;color:' + (defect > 0 ? 'var(--accent-red)' : 'var(--text-muted)') + ';">' + rate + '%</span>') +
                    '</div>' +
                '</div>' +

                '<div style="margin-top:14px;padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">' +
                        '<div style="font-size:0.9rem;font-weight:900;color:var(--text-primary);">불량 상세</div>' +
                        '<div style="font-size:0.76rem;color:var(--text-muted);">총 ' + UIUtils.formatNumber(defect) + ' EA</div>' +
                    '</div>' +
                    (defectRows || '<div style="padding:24px 16px;border-radius:16px;background:var(--bg-secondary);text-align:center;color:var(--text-muted);font-size:0.9rem;">등록된 불량 상세가 없습니다.</div>') +
                '</div>' +
            '</div>';

        UIUtils.showModal('외관 검사 정보', html, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
    }

    // 저장
    async function save() {
        if (!state.selectedProduct) {
            UIUtils.toast('제품을 선택하세요.', 'warning');
            return;
        }

        const defects = Storage.getAll(DEFECT_STORE);
        const activeDefects = defects.filter(d => state.counts[d.id] > 0);

        if (activeDefects.length === 0) {
            UIUtils.toast('저장할 불량 데이터가 없습니다.', 'warning');
            return;
        }

        const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;

        // 불량별로 각각 기록
        for (const d of activeDefects) {
            await Storage.add(STORE, {
                date: UIUtils.today(),
                productId: state.selectedProduct.id,
                productName: display,
                carModel: state.selectedProduct.carModel || null, // 차종 저장
                partName: state.selectedProduct.partName || null, // 품명 저장
                color: state.selectedProduct.color || null, // 컬러 저장
                defectId: d.id,
                defectName: d.name,
                defectCount: state.counts[d.id],
                planId: state.selectedPlan ? state.selectedPlan.id : null,
                planOrderNo: state.selectedPlan ? state.selectedPlan.orderNo : null
            });
        }

        UIUtils.toast(`${activeDefects.length}건의 불량 기록이 저장되었습니다.`, 'success');
        reset();
    }

    function reset() {
        state.counts = {};
        renderDefectCounter();
        renderSummary();
    }

    // 검사 모달 내부 헬퍼 함수들
    function _incInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _incPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _updateDefectQty() {
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);
        const goodQty = parseInt(document.getElementById('inpGoodQty').value || 0);
        const defectQty = inspectionQty - goodQty;
        document.getElementById('inpDefectQty').value = Math.max(0, defectQty);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = inspectionQty;
    }

    function _updateGoodQty() {
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);
        const defectQtyEl = document.getElementById('inpDefectQty');
        let defectQty = parseInt(defectQtyEl.value || 0);
        if (defectQty > inspectionQty) {
            defectQty = inspectionQty;
            defectQtyEl.value = inspectionQty;
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(inspectionQty)} EA`, 'warning');
        }
        const goodQty = inspectionQty - defectQty;
        document.getElementById('inpGoodQty').value = Math.max(0, goodQty);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = Math.max(0, goodQty) + defectQty;
    }

    function _calculateInspectionTime() {
        // 신규 등록 or 편집 모달 — 둘 중 현재 열려 있는 것 사용
        const startTimeEl = document.getElementById('inpInspectionStartTime')
                         || document.getElementById('editInspectionStartTime');
        const endTimeEl   = document.getElementById('inpInspectionEndTime')
                         || document.getElementById('editInspectionEndTime');
        const durationEl  = document.getElementById('inpInspectionDuration')
                         || document.getElementById('editInspectionDuration');

        if (!startTimeEl || !endTimeEl || !durationEl) return;

        const startTime = startTimeEl.value;
        const endTime   = endTimeEl.value;

        if (!startTime || !endTime) {
            durationEl.value = '';
            return;
        }

        const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let duration = toMin(endTime) - toMin(startTime);
        if (duration < 0) duration += 24 * 60; // 자정 넘어가는 경우

        // 분 단위로 표시
        durationEl.value = `${duration}분`;
    }

    function _updateDefectTotal() {
        // 모든 불량 유형 입력값 합산 (inj-*, paint-*)
        let defectSum = 0;
        const defectInputs = document.querySelectorAll('[id^="inj-"], [id^="paint-"]');
        defectInputs.forEach(el => {
            defectSum += parseInt(el.value || 0);
        });
        const inspectionQtyEl = document.getElementById('inpInspectionQty');
        const maxDefectQty = parseInt(inspectionQtyEl ? inspectionQtyEl.value.replace(/,/g, '') || 0 : 0);
        if (maxDefectQty > 0 && defectSum > maxDefectQty) {
            const activeEl = document.activeElement;
            if (activeEl && Array.from(defectInputs).includes(activeEl)) {
                const overflow = defectSum - maxDefectQty;
                const current = parseInt(activeEl.value || 0);
                activeEl.value = Math.max(0, current - overflow);
                defectSum = maxDefectQty;
            } else {
                defectSum = maxDefectQty;
            }
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(maxDefectQty)} EA`, 'warning');
        }

        // 불량수 자동 입력
        const defectQtyEl = document.getElementById('inpDefectQty');
        if (defectQtyEl) defectQtyEl.value = defectSum;

        // 양품수 = 검사수량 - 불량수
        const goodQtyEl = document.getElementById('inpGoodQty');
        if (inspectionQtyEl && goodQtyEl) {
            const inspQty = parseInt(inspectionQtyEl.value.replace(/,/g, '') || 0);
            goodQtyEl.value = Math.max(0, inspQty - defectSum);
        }

        // 합계 = 양품수 + 불량수
        const goodQty = parseInt(goodQtyEl ? goodQtyEl.value || 0 : 0);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = goodQty + defectSum;
    }

    function _getPaintingWorkQty(work) {
        if (!work) return 0;
        return Number(work.productionQty || work.inputQty || work.quantity || work.goodQty || 0) || 0;
    }

    function _validateDefectQtyWithinWorkQty(defectQty, workQty) {
        const defect = Number(defectQty) || 0;
        const work = Number(workQty) || 0;
        if (work > 0 && defect > work) {
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 작업 ${UIUtils.formatNumber(work)} EA / 불량 ${UIUtils.formatNumber(defect)} EA`, 'warning');
            return false;
        }
        return true;
    }

    // 검사 데이터 저장 함수
    async function _saveInspection(workId) {
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) {
            UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty      = parseInt(document.getElementById('inpGoodQty').value || 0);
        const defectQty    = parseInt(document.getElementById('inpDefectQty').value || 0);
        const inspectionQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);

        // 검사 수량 검증 (검사수량이 0이면 양품수 기준으로 허용)
        const effectiveInspQty = inspectionQty > 0 ? inspectionQty : goodQty;
        if (effectiveInspQty === 0) {
            UIUtils.toast('검사수량이 0입니다. 양품수를 입력해주세요.', 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(defectQty, _getPaintingWorkQty(work) || effectiveInspQty)) {
            const defectQtyEl = document.getElementById('inpDefectQty');
            if (defectQtyEl) defectQtyEl.focus();
            return;
        }
        if (goodQty + defectQty !== effectiveInspQty) {
            UIUtils.toast('양품수 + 불량수가 검사수량과 맞지 않습니다.', 'warning');
            return;
        }

        // 검사자 정보 수집 (하단 검사자 섹션에서 inspector1~5)
        const inspectors = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`inspector${i}`);
            if (el && el.value) {
                // select 요소일 경우 선택된 option의 text를 가져옴
                if (el.tagName === 'SELECT') {
                    const selectedOption = el.options[el.selectedIndex];
                    if (selectedOption && selectedOption.text && selectedOption.text !== '선택 안함') {
                        inspectors.push(selectedOption.text);
                    }
                } else if (el.value) {
                    inspectors.push(el.value);
                }
            }
        }

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('inpInspectionDate');
        const inspectionStartTimeEl = document.getElementById('inpInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('inpInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : UIUtils.today();
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : '';
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : '';

        const productDisplay = `${work.carModel} ${work.partName} ${work.color}`;
        const baseData = {
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime,
            workId,
            productId: workId,
            productName: productDisplay,
            carModel: work.carModel,
            partName: work.partName,
            color: work.color,
            paintingDate: work.date,
            paintingTime: work.startTime ? (work.startTime + (work.endTime ? '~' + work.endTime : '')) : '',
            lotNo: work.lots && work.lots.length > 0 ? work.lots.map(l => l.lotNo).join(', ') : (work.lotNo || ''),
            inspectionQty: effectiveInspQty,
            goodQty,
            defectQty,
            inspectors,
            planId: null,
            planOrderNo: null
        };

        // 불량 유형별 수집
        const allDefects = Storage.getAll(DEFECT_STORE) || [];
        const defectDetails = [];

        for (const defect of allDefects) {
            let count = 0;
            const injInput   = document.getElementById(`inj-${defect.id}`);
            const paintInput = document.getElementById(`paint-${defect.id}`);
            if (injInput)   count = parseInt(injInput.value   || 0);
            if (paintInput) count = parseInt(paintInput.value || 0);

            if (count > 0) {
                defectDetails.push({
                    defectId:    defect.id,
                    defectName:  defect.name,
                    defectType:  defect.type || 'injection',
                    defectCount: count
                });
            }
        }
        const detailDefectTotal = defectDetails.reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, _getPaintingWorkQty(work) || effectiveInspQty)) {
            return;
        }

        // 검사 결과 1건만 저장
        await Storage.add(STORE, {
            ...baseData,
            defects: defectDetails,
            inspectionStatus: 'completed',
            createdAt: new Date().toISOString()
        });

        // 해당 작업의 상태를 "검사 완료"로 변경
        await Storage.update(PAINTING_WORK_STORE, workId, {
            inspectionStatus: 'completed',
            inspectionDate: inspectionDate,
            inspectionStartTime: inspectionStartTime,
            inspectionEndTime: inspectionEndTime,
            inspectors: inspectors,
            updatedAt: new Date().toISOString()
        });

        // ── 출하검사 대기 자동 등록 (레이져 공정 없는 제품만) ──────────
        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _prod = _products.find(p => p.carModel === work.carModel && p.partName === work.partName && p.color === work.color)
                   || _products.find(p => p.carModel === work.carModel && p.partName === work.partName);
        const _isLaser = _prod && ((_prod.process2 || '') + (_prod.process3 || '') + (_prod.process4 || '')).includes('레이저');
        if (!_isLaser) {
            await Storage.add(DB.STORES.SHIPPING_STANDBY, {
                date         : inspectionDate,
                source       : 'painting_inspection',
                paintingWorkId: workId,
                carModel     : work.carModel     || '',
                partName     : work.partName     || '',
                color        : work.color        || '',
                paintingDate : work.date         || '',
                lotNo        : work.lots && work.lots.length > 0
                                ? work.lots.map(l => l.lotNo).join(', ')
                                : (work.lotNo || ''),
                inspectionQty: goodQty,
                goodQty      : goodQty,
                customer     : _prod ? (_prod.customer || '') : '',
                status       : '대기'
            });
        }

        UIUtils.toast('검사 데이터가 저장되었습니다.', 'success');

        // 모달 제거 후 도장 검사 페이지로 복귀
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();
        Router.navigate('painting-inspection');
    }

    // 검사 이력 보기 (필터 기능 포함)
    function showHistory() {
        const allData = Storage.getAll(STORE) || [];
        allData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 고유 차종/품명 추출
        const uniqueCarModels = UIUtils.sortCarModels(allData.map(d => d.carModel));
        const uniquePartNames = [...new Set(allData.map(d => d.partName).filter(Boolean))].sort();

        // 초기값
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        let modalContent = `
            <div style="margin-bottom:16px;">
                <!-- 필터 바 -->
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                    <input type="date" id="histStart" value="${startDate}" style="width:130px;" class="form-input">
                    <span style="color:var(--text-muted);">~</span>
                    <input type="date" id="histEnd" value="${endDate}" style="width:130px;" class="form-input">

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                    <select id="histCarModel" style="width:120px;" class="form-select">
                        <option value="">전체</option>
                        ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                    <select id="histPartName" style="width:150px;" class="form-select">
                        <option value="">전체</option>
                        ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>

                    <button class="btn btn-outline btn-sm" onclick="(() => {
                        const start = document.getElementById('histStart').value;
                        const end = document.getElementById('histEnd').value;
                        const carModel = document.getElementById('histCarModel').value;
                        const partName = document.getElementById('histPartName').value;
                        PaintingInspectionModule._filterHistoryTable(start, end, carModel, partName);
                    })()" style="margin-left:8px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">search</span> 조회
                    </button>

                    <button class="btn btn-secondary btn-sm" onclick="window.print()" style="margin-left:12px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                    </button>
                </div>

                <!-- 결과 컨테이너 (가로 스크롤) -->
                <div style="overflow-x:auto; overflow-y:auto; max-height:600px; border:1px solid var(--border); border-radius:8px;" id="historyTableContainer"></div>
            </div>

            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; }
                    .modal h2 { display: none !important; }
                    .modal button { display: none !important; }
                    div[style*="display:flex"][style*="align-items:center"][style*="gap:8px"] { display: none !important; }
                    #histStart, #histEnd, #histCarModel, #histPartName, .form-input, .form-select { display: none !important; }
                    .data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    .data-table thead th { background: #f5f5f5 !important; border: 1px solid #ccc !important; padding: 8px !important; text-align: left; font-weight: bold; }
                    .data-table tbody td { border: 1px solid #ccc !important; padding: 6px !important; }
                    .data-table tbody tr:nth-child(odd) { background: #fafafa !important; }
                }
            </style>
        `;

        // 커스텀 모달 (크기를 2배로 확대)
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.style.display = 'block';
        modalEl.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; border-radius:12px; max-width:90vw; max-height:90vh; width:90vw; overflow:auto; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h2 style="margin:0; font-size:1.25rem;">도장 검사 이력 조회</h2>
                        <button onclick="this.closest('.modal').parentElement.remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // 초기 테이블 렌더링
        _filterHistoryTable(startDate, endDate, '', '');
    }

    // 이력 테이블 필터링 및 렌더링 (검사 단위로 그룹화, 불량 유형별 분리)
    function _filterHistoryTable(startDate, endDate, filterCarModel, filterPartName) {
        const allData = Storage.getAll(STORE) || [];
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (id -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // 공용 필터 적용
        let filtered = _applyCommonFilters(allData, startDate, endDate, filterCarModel, filterPartName);

        // 검사 기록 정규화 (새 구조: defects 배열 / 기존 구조: 개별 레코드)
        const grouped = {};
        filtered.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            // 새 구조: defects 배열이 있으면 그걸 사용
            if (d.defects && Array.isArray(d.defects)) {
                d.defects.forEach(def => {
                    grouped[key].defects.push({
                        name: def.defectName,
                        count: def.defectCount
                    });
                    grouped[key].totalDefects += (def.defectCount || 0);
                });
            } else {
                // 기존 구조: 개별 레코드
                grouped[key].defects.push({
                    name: d.defectName,
                    count: d.defectCount
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });

        // 그룹 데이터를 배열로 변환 및 정렬
        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const container = document.getElementById('historyTableContainer');
        if (!container) return;

        if (groupedArray.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-muted);">조회된 이력이 없습니다.</p>`;
            return;
        }

        // 각 검사 세션의 도장 작업 정보 조회 및 테이블 생성
        const tableRows = groupedArray.map(group => {
            // 새 데이터 구조에서는 paintingDate, lotNo, inspectionQty가 직접 저장됨
            // 기존 데이터와의 호환성을 위해 paintingWorks에서도 조회
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '-');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '-')) :
                '-');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리 (사출 불량 / 도장 불량)
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            // 사출 불량 표시
            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:8px;"><strong style="color:#ea580c;">사출 불량:</strong><br/>${injectionDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#ea580c;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            // 도장 불량 표시
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장 불량:</strong><br/>${paintingDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#16a34a;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            const defectDisplay = injectionDisplay + paintingDisplay;

            return `
                <tr>
                    <td style="white-space:nowrap;font-weight:500;">${group.date || '-'}</td>
                    <td style="white-space:nowrap;font-weight:500;">${paintingDate || '-'}</td>
                    <td>${group.carModel || '-'}</td>
                    <td><strong>${group.partName || '-'}</strong></td>
                    <td>${group.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.85rem;">${lotDisplay}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(inspectionQty)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(group.totalDefects)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:700;">${defectRate}%</td>
                    <td style="font-size:0.85rem;vertical-align:top;">${defectDisplay || '-'}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table" style="margin:0; table-layout:auto;">
                <thead>
                    <tr>
                        <th style="min-width:100px;">검사일</th>
                        <th style="min-width:100px;">도장작업일</th>
                        <th style="min-width:80px;">차종</th>
                        <th style="min-width:100px;">품명</th>
                        <th style="min-width:80px;">컬러</th>
                        <th style="min-width:120px;">사출 LOT</th>
                        <th style="text-align:right;min-width:80px;">검사수량</th>
                        <th style="text-align:right;min-width:80px;">불량수량</th>
                        <th style="text-align:right;min-width:80px;">불량률(%)</th>
                        <th style="min-width:450px;">불량 유형</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    function exportData() {
        const allData = Storage.getAll(STORE);
        if (!allData.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }

        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (name -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // productId + date로 그룹화
        const grouped = {};
        allData.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    // 새로운 필드들
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            grouped[key].defects.push({
                name: d.defectName,
                count: d.defectCount
            });
            grouped[key].totalDefects += (d.defectCount || 0);
        });

        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const headers = ['검사일', '도장작업일', '차종', '품명', '컬러', '사출 LOT', '검사수량', '양품수', '불량수량', '불량률(%)', '사출 불량', '도장 불량'];
        const rows = groupedArray.map(group => {
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '')) :
                '');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            const injectionDefectNames = injectionDefects.map(d => `${d.name}(${d.count})`).join(', ');
            const paintingDefectNames = paintingDefects.map(d => `${d.name}(${d.count})`).join(', ');

            return [
                group.date || '',
                paintingDate || '',
                group.carModel || '',
                group.partName || '',
                group.color || '',
                lotDisplay,
                inspectionQty,
                goodQty,
                defectQty,
                defectRate,
                injectionDefectNames,
                paintingDefectNames
            ];
        });

        Storage.exportToCSV(headers, rows, '도장검사_불량집계');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // ===================================================================
    // Phase 2: 검사 완료 실적 기능
    // ===================================================================

    // 검사 완료 실적 화면 렌더링
    function showCompletionResults() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="completionStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="completionEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="completionCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateCompletionPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="completionPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._filterCompletionResults()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div style="overflow-x:auto; border:1px solid var(--border); border-radius:8px;" id="completionTableContainer"></div>
        `;

        // 초기 조회
        _filterCompletionResults();
    }

    // 차종 선택 시 검사 완료 실적 품명 필터 업데이트
    function _updateCompletionPartFilter() {
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('completionPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 차종 선택 시 통계 대시보드 품명 필터 업데이트
    function _updateStatsPartFilter() {
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('statsPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 검사 완료 실적 필터링 및 테이블 렌더링
    function _filterCompletionResults() {
        const startDate = document.getElementById('completionStart')?.value || '';
        const endDate = document.getElementById('completionEnd')?.value || '';
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const partName = document.getElementById('completionPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        const container = document.getElementById('completionTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-muted);">검사 완료 실적이 없습니다.</p>`;
            return;
        }

        // 정렬 (최신순)
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const _works = Storage.getAll(PAINTING_WORK_STORE) || [];
        function _fmtCompDate(dateStr, timeStr) {
            const p = (dateStr || '').split('-');
            if (p.length !== 3) return dateStr || '-';
            const t = (timeStr || '').slice(0, 5);
            return '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + p[0] + '</span>' +
                   '<span style="font-weight:600;white-space:nowrap;">' + p[1] + '-' + p[2] + '</span>' +
                   (t ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + t + '</span>' : '');
        }

        const tableRows = filtered.map(d => {
            const _work = _works.find(w => w.id === (d.workId || d.productId));
            const _line = (_work || {}).line || '-';
            const _paintDate = d.paintingDate || (_work || {}).date || '';
            const _paintTime = d.paintingTime || ((_work || {}).startTime || '');

            const injectionDefects = [];
            const paintingDefects = [];

            (d.defects || []).forEach(def => {
                const type = defectTypeMap[def.defectName] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(def);
                } else {
                    injectionDefects.push(def);
                }
            });

            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:4px;"><strong style="color:#ea580c;">사출:</strong> ${injectionDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장:</strong> ${paintingDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';

            const defectRate = d.inspectionQty > 0 ?
                ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

            return `
                <tr>
                    <td style="line-height:1.3;">${_fmtCompDate(d.date, d.inspectionStartTime)}</td>
                    <td style="line-height:1.3;">${_fmtCompDate(_paintDate, _paintTime)}</td>
                    <td><span class="badge badge-info">${_line}</span></td>
                    <td style="white-space:nowrap;">${d.carModel || ''}</td>
                    <td><strong>${d.partName || ''}</strong></td>
                    <td>${d.color || ''}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(d.inspectionQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-green); font-weight:600;">${UIUtils.formatNumber(d.goodQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(d.defectQty || 0)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:700;">${defectRate}%</td>
                    <td style="font-size:0.85rem;">${injectionDisplay}${paintingDisplay}</td>
                    <td style="text-align:center; white-space:nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-outline" onclick="PaintingInspectionModule._showCompletionDetail('${d.id}', event)" style="padding:4px 8px; font-size:0.8rem;">보기</button>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>검사일</th>
                        <th>도장작업일</th>
                        <th>라인</th>
                        <th>차종</th>
                        <th>품명</th>
                        <th>컬러</th>
                        <th>검사수</th>
                        <th>양품</th>
                        <th>불량</th>
                        <th>불량률</th>
                        <th>불량 유형</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    // 검사 완료 실적 상세 조회 팝업
    function _showCompletionDetail(id, event) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap = {};
        defectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        const defectRate = d.inspectionQty > 0
            ? ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

        // 불량 유형 분리
        const injDefects = [];
        const paintDefects = [];
        (d.defects || []).forEach(def => {
            if (def.defectCount > 0) {
                (defectTypeMap[def.defectName] === 'painting' ? paintDefects : injDefects).push(def);
            }
        });

        const defectRowsHtml = (group, label, color) => group.length === 0 ? '' : `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.78rem; font-weight:600; color:${color}; margin-bottom:4px;">${label}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${group.map(def => `
                        <span style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; padding:3px 10px; font-size:0.82rem;">
                            <span style="color:var(--text-muted);">${def.defectName}</span>
                            <strong style="margin-left:4px; color:var(--accent-red);">${UIUtils.formatNumber(def.defectCount)}</strong>
                        </span>
                    `).join('')}
                </div>
            </div>`;

        const popupId = 'completionDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:20px 22px; min-width:320px; max-width:420px;
            font-size:0.88rem;
        `;

        // 팝업 위치: 클릭 위치 기준
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = event.clientX + 12;
        let top  = event.clientY - 10;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';

        popup.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem; color:var(--accent-blue);">info</span>
                    <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">도장 검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:1.2rem; line-height:1; padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary); border-radius:8px; padding:12px 14px; margin-bottom:12px;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 12px; font-size:0.82rem;">
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.paintingDate || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">사출 LOT</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.lotNo || '-'}</div>
                </div>
            </div>

            <!-- 검사 수량 요약 -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px; text-align:center;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600; font-size:0.78rem; margin-top:2px;">${d.date || '-'}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사수량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-blue); margin-top:2px;">${UIUtils.formatNumber(d.inspectionQty || 0)}</div>
                </div>
                <div style="background:rgba(52,211,153,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">양품</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-green); margin-top:2px;">${UIUtils.formatNumber(d.goodQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">불량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-red); margin-top:2px;">${UIUtils.formatNumber(d.defectQty || 0)}</div>
                </div>
            </div>
            <div style="text-align:right; margin-bottom:12px;">
                <span style="font-size:0.8rem; color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700; font-size:1rem; color:${parseFloat(defectRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${defectRate}%</span>
            </div>

            <!-- 불량 상세 -->
            ${(injDefects.length > 0 || paintDefects.length > 0) ? `
            <div style="border-top:1px solid var(--border); padding-top:10px;">
                ${defectRowsHtml(injDefects,  '사출 불량', '#ea580c')}
                ${defectRowsHtml(paintDefects,'도장 불량', '#16a34a')}
            </div>` : `<div style="color:var(--text-muted); font-size:0.82rem; text-align:center; padding:4px 0;">불량 내역 없음</div>`}

            ${d.inspectors && d.inspectors.length > 0 ? `
            <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:10px; font-size:0.8rem; color:var(--text-muted);">
                검사자: <strong style="color:var(--text-primary);">${d.inspectors.join(', ')}</strong>
            </div>` : ''}

            ${(() => {
                const _cu = AuthModule && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
                const _isAdmin = _cu && _cu.role === 'admin';
                if (!_isAdmin) return '';
                return `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                    <button class="btn btn-sm btn-primary" onclick="document.getElementById('${popupId}').remove();PaintingInspectionModule.openEditInspectionModal('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span> 편집
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="document.getElementById('${popupId}').remove();PaintingInspectionModule._deleteInspection('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span> 삭제
                    </button>
                </div>`;
            })()}
        `;

        document.body.appendChild(popup);

        // 화면 밖으로 넘어가지 않도록 위치 보정
        requestAnimationFrame(() => {
            const rect = popup.getBoundingClientRect();
            if (rect.right > vw - 8)  popup.style.left = (vw - rect.width - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 팝업 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', function _close(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _close);
                }
            });
        }, 50);
    }

    // 검사 실적 수정 모달 열기
    function openEditInspectionModal(inspectionId) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const injDefectTypes  = defectTypes.filter(dt => dt && (dt.type === 'injection' || !dt.type));
        const paintDefectTypes = defectTypes.filter(dt => dt && dt.type === 'painting');

        const defectMap = {};
        (inspection.defects || []).forEach(d => {
            if (d.defectId)   defectMap[d.defectId]   = d.defectCount || 0;
            if (d.defectName) defectMap[d.defectName] = d.defectCount || 0;
        });

        function defectInputs(list, color, icon) {
            if (!list.length) return `<p style="color:var(--text-muted);font-size:0.82rem;margin:0;">등록된 불량 유형 없음</p>`;
            return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">` +
                list.map(dt => {
                    const val = defectMap[dt.id] || defectMap[dt.name] || 0;
                    return `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:0.78rem;font-weight:600;color:${color};margin-bottom:6px;">${dt.name}</div>
                        <input type="text" class="form-input defect-count-input" data-defect-id="${dt.id}"
                            value="${val}" inputmode="none" readonly
                            style="text-align:right;font-weight:700;font-size:1rem;padding:4px 8px;cursor:pointer;"
                            onclick="PaintingInspectionModule._showNumericPad(this)">
                    </div>`;
                }).join('') + `</div>`;
        }

        const insp = inspection;
        const modalContent = `
        <div style="display:flex;flex-direction:column;gap:0;">

            <!-- ① 제품 정보 배너 -->
            <div style="background:linear-gradient(135deg,var(--accent-blue) 0%,#0ea5e9 100%);border-radius:10px;padding:16px 20px;margin-bottom:18px;color:#fff;">
                <div style="font-size:0.72rem;opacity:0.8;margin-bottom:4px;letter-spacing:0.05em;">도장 외관 검사 실적 수정</div>
                <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:1.15rem;font-weight:700;">${insp.carModel || ''} ${insp.partName || ''}</span>
                    <span style="font-size:0.9rem;opacity:0.85;">${insp.color || ''}</span>
                </div>
                <div style="display:flex;gap:20px;margin-top:10px;font-size:0.8rem;opacity:0.9;flex-wrap:wrap;">
                    <span><span style="opacity:0.7;">검사일</span> <strong>${insp.date || '-'}</strong></span>
                    <span><span style="opacity:0.7;">도장작업일</span> <strong>${insp.paintingDate || '-'}</strong></span>
                    <span><span style="opacity:0.7;">사출 LOT</span> <strong style="font-family:monospace;">${insp.lotNo || '-'}</strong></span>
                </div>
            </div>

            <!-- ② 검사 일시 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">schedule</span>
                        검사 일시
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">검사일자</label>
                            <input type="date" id="editInspectionDate" value="${insp.date || ''}" class="form-input">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">시작시간</label>
                            <input type="time" id="editInspectionStartTime" value="${insp.inspectionStartTime || ''}" class="form-input"
                                oninput="PaintingInspectionModule._calculateInspectionTime()"
                                onchange="PaintingInspectionModule._calculateInspectionTime()">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">완료시간</label>
                            <input type="time" id="editInspectionEndTime" value="${insp.inspectionEndTime || ''}" class="form-input"
                                oninput="PaintingInspectionModule._calculateInspectionTime()"
                                onchange="PaintingInspectionModule._calculateInspectionTime()">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">소요시간</label>
                            <input type="text" id="editInspectionDuration" value="" class="form-input" readonly
                                style="background:var(--bg-secondary);color:var(--text-muted);text-align:center;">
                        </div>
                    </div>
                </div>
            </div>

            <!-- ③ 검사 수량 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">numbers</span>
                        검사 수량
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                        <div style="background:rgba(59,130,246,0.08);border:1.5px solid rgba(59,130,246,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">검사수량</div>
                            <input type="number" id="editInspQty" value="${insp.inspectionQty || 0}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-blue);" readonly>
                        </div>
                        <div style="background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">양품수</div>
                            <input type="number" id="editGoodQty" value="${insp.goodQty || 0}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-green);"
                                onchange="this.dispatchEvent(new Event('change'))">
                        </div>
                        <div style="background:rgba(239,68,68,0.08);border:1.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">불량수</div>
                            <input type="number" id="editDefectQty" value="${insp.defectQty || 0}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-red);"
                                onchange="this.dispatchEvent(new Event('change'))">
                        </div>
                    </div>
                </div>
            </div>

            <!-- ④ 불량 유형 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:#ea580c;">report_problem</span>
                        불량 유형별 수량
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
                    ${injDefectTypes.length > 0 ? `
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:#ea580c;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">precision_manufacturing</span> 사출 불량
                        </div>
                        ${defectInputs(injDefectTypes, '#ea580c')}
                    </div>` : ''}
                    ${paintDefectTypes.length > 0 ? `
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:#16a34a;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">format_paint</span> 도장 불량
                        </div>
                        ${defectInputs(paintDefectTypes, '#16a34a')}
                    </div>` : ''}
                </div>
            </div>

            <!-- ⑤ 검사자 -->
            <div class="card" style="margin-bottom:6px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">group</span>
                        검사자
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div id="inspectorsList"></div>
                </div>
            </div>

        </div>`;

        UIUtils.showModal('검사 실적 수정', modalContent,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="PaintingInspectionModule._submitEditInspection('${inspectionId}')">
                 <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 저장
             </button>`, 'lg');

        // 검사자 목록 렌더링
        _renderInspectorsForEdit(inspection.inspectors || []);
    }

    // 검사자 목록 렌더링 (수정 모달용)
    function _renderInspectorsForEdit(inspectors) {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        container.innerHTML = inspectors.map((inspector, idx) => `
            <div style="display:flex; gap:6px; margin-bottom:6px;">
                <input type="text" value="${inspector}" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
                <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
            </div>
        `).join('') + `
            <button class="btn btn-sm btn-secondary" onclick="PaintingInspectionModule._addInspectorFieldToModal()" style="margin-top:6px;">
                + 검사자 추가
            </button>
        `;
    }

    // 검사자 추가 버튼 (수정 모달용)
    function _addInspectorFieldToModal() {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        const count = container.querySelectorAll('.inspector-input').length;
        if (count >= 5) {
            UIUtils.toast('최대 5명까지 추가 가능합니다.', 'warning');
            return;
        }

        const newField = document.createElement('div');
        newField.style.cssText = 'display:flex; gap:6px; margin-bottom:6px;';
        newField.innerHTML = `
            <input type="text" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
            <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
        `;
        container.appendChild(newField);
    }

    // 검사 실적 수정 저장 (모달에서)
    async function _submitEditInspection(inspectionId) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty = parseInt(document.getElementById('editGoodQty')?.value || 0);
        const defectQty = parseInt(document.getElementById('editDefectQty')?.value || 0);
        const inspectionQty = parseInt(document.getElementById('editInspQty')?.value || 0);

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('editInspectionDate');
        const inspectionStartTimeEl = document.getElementById('editInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('editInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : inspection.date;
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : inspection.inspectionStartTime;
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : inspection.inspectionEndTime;

        // 검사자 수집 (하단 검사자 섹션)
        const inspectorInputs = document.querySelectorAll('.inspector-input');
        const inspectors = [];
        inspectorInputs.forEach(input => {
            if (input.value.trim()) {
                inspectors.push(input.value.trim());
            }
        });

        // 불량 유형별 개수 수집
        const defects = [];
        document.querySelectorAll('.defect-count-input').forEach(input => {
            const defectId = input.getAttribute('data-defect-id');
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const defectType = Storage.getAll(DB.STORES.DEFECT_TYPES).find(dt => dt.id === defectId);
                defects.push({
                    defectId,
                    defectName: defectType?.name || '',
                    defectType: defectType?.type || 'injection',
                    defectCount: count
                });
            }
        });

        // 저장
        const success = await _saveInspectionUpdate(inspectionId, {
            goodQty,
            defectQty,
            inspectionQty,
            inspectors,
            defects,
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime
        });

        if (success) {
            // 해당 작업의 상태를 "검사 완료"로 유지
            const workId = inspection.workId || inspection.productId;
            if (workId) {
                await Storage.update(PAINTING_WORK_STORE, workId, {
                    inspectionStatus: 'completed',
                    inspectionDate: inspectionDate,
                    inspectionStartTime: inspectionStartTime,
                    inspectionEndTime: inspectionEndTime,
                    inspectors: inspectors,
                    updatedAt: new Date().toISOString()
                });
            }
            UIUtils.closeModal();
            _filterCompletionResults();
        }
    }

    // ===================================================================
    // Phase 3: 통계 대시보드
    // ===================================================================

    // 통계 대시보드 화면 렌더링
    function showStatisticsDashboard() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="statsStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="statsEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="statsCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateStatsPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="statsPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._renderStatisticsDashboard()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div id="statisticsContent"></div>
        `;

        // 초기 렌더링
        _renderStatisticsDashboard();
    }

    // 통계 대시보드 렌더링
    function _renderStatisticsDashboard() {
        const startDate = document.getElementById('statsStart')?.value || '';
        const endDate = document.getElementById('statsEnd')?.value || '';
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const partName = document.getElementById('statsPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);

        const stats = _calculateStatistics(filtered);
        const container = document.getElementById('statisticsContent');
        if (!container) return;

        // 요약 정보
        const totalInspections = filtered.length;
        const totalDefects = filtered.reduce((sum, d) => sum + (d.defectQty || 0), 0);
        const totalInspectionQty = filtered.reduce((sum, d) => sum + (d.inspectionQty || 0), 0);
        const defectRate = totalInspectionQty > 0 ? ((totalDefects / totalInspectionQty) * 100).toFixed(1) : 0;

        container.innerHTML = `
            <!-- 요약 카드 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px;">
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">검사 실적</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${totalInspections}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">건</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 검사수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(totalInspectionQty)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 불량수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${UIUtils.formatNumber(totalDefects)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">불량률</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${defectRate}%</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">평균</div>
                </div>
            </div>

            <!-- 차트 영역 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:12px; margin-bottom:16px;">
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">불량 유형별 집계</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="defectTypeChart" height="100"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">차종별 불량률</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="carModelChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- 상세 테이블 -->
            <div class="card">
                <div class="card-header">
                    <h4>불량 유형별 상세 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>불량 유형</th>
                                <th style="text-align:right;">발생 건수</th>
                                <th style="text-align:right;">발생률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byDefectType)
                                .sort((a, b) => b[1].count - a[1].count)
                                .map(([name, data]) => {
                                    const rate = totalDefects > 0 ? ((data.count / totalDefects) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right; font-weight:600;">${data.count}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>차종별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>차종</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byCarModel)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>품명별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>품명</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byPartName)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 차트 그리기
        setTimeout(() => {
            _renderStatisticsCharts(stats);
        }, 100);
    }

    // 통계 집계 (차종/품명/불량유형별)
    function _calculateStatistics(data) {
        const stats = {
            byCarModel: {},
            byPartName: {},
            byDefectType: {}
        };

        data.forEach(d => {
            // 차종별
            if (!stats.byCarModel[d.carModel]) {
                stats.byCarModel[d.carModel] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byCarModel[d.carModel].inspectionQty += d.inspectionQty || 0;
            stats.byCarModel[d.carModel].defectQty += d.defectQty || 0;

            // 부품별
            if (!stats.byPartName[d.partName]) {
                stats.byPartName[d.partName] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byPartName[d.partName].inspectionQty += d.inspectionQty || 0;
            stats.byPartName[d.partName].defectQty += d.defectQty || 0;

            // 불량유형별
            (d.defects || []).forEach(def => {
                if (!stats.byDefectType[def.defectName]) {
                    stats.byDefectType[def.defectName] = { count: 0 };
                }
                stats.byDefectType[def.defectName].count += def.defectCount || 0;
            });
        });

        return stats;
    }

    var _paintCharts = { defectType: null, carModel: null };

    // 통계 차트 그리기
    function _renderStatisticsCharts(stats) {
        if (_paintCharts.defectType) { try { _paintCharts.defectType.destroy(); } catch (e) {} _paintCharts.defectType = null; }
        if (_paintCharts.carModel)   { try { _paintCharts.carModel.destroy();   } catch (e) {} _paintCharts.carModel   = null; }
        // 불량 유형별 막대 차트
        const defectTypeCtx = document.getElementById('defectTypeChart');
        if (defectTypeCtx && window.Chart) {
            const defectLabels = Object.keys(stats.byDefectType).sort((a, b) =>
                stats.byDefectType[b].count - stats.byDefectType[a].count
            );
            const defectData = defectLabels.map(name => stats.byDefectType[name].count);

            _paintCharts.defectType = new Chart(defectTypeCtx, {
                type: 'bar',
                data: {
                    labels: defectLabels,
                    datasets: [{
                        label: '불량 발생수',
                        data: defectData,
                        backgroundColor: '#ea580c',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }

        // 차종별 원형 차트
        const carModelCtx = document.getElementById('carModelChart');
        if (carModelCtx && window.Chart) {
            const carModelLabels = Object.keys(stats.byCarModel);
            const carModelData = carModelLabels.map(name => {
                const data = stats.byCarModel[name];
                return data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
            });

            _paintCharts.carModel = new Chart(carModelCtx, {
                type: 'doughnut',
                data: {
                    labels: carModelLabels,
                    datasets: [{
                        data: carModelData,
                        backgroundColor: ['#ea580c', '#16a34a', '#0066ff', '#ffaa00', '#ee00ee', '#00dddd']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } }
                    }
                }
            });
        }
    }

    // ===================================================================
    // Phase 1: 기초 인프라 함수
    // ===================================================================

    // 공용 필터: 기간, 차종, 품명
    function _applyCommonFilters(data, startDate, endDate, carModel, partName) {
        return data.filter(d => {
            const dateMatch = (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate);
            const carModelMatch = !carModel || d.carModel === carModel;
            const partNameMatch = !partName || d.partName === partName;
            return dateMatch && carModelMatch && partNameMatch;
        });
    }

    // 고유 차종 추출
    function _getUniqueCarModels(data) {
        return UIUtils.sortCarModels(data.map(d => d.carModel));
    }

    // 고유 품명 추출
    function _getUniquePartNames(data) {
        return [...new Set(data.map(d => d.partName).filter(Boolean))].sort();
    }

    // 불량별 개별 레코드 → 검사 단위 그룹화 (호환성 유지)
    function _normalizeInspectionData(rawRecords) {
        const grouped = {};
        rawRecords.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    id: d.id || `insp-${Date.now()}-${Math.random()}`,
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || [],
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt
                };
            }
            if (d.defectName) {
                grouped[key].defects.push({
                    defectId: d.defectId,
                    defectName: d.defectName,
                    defectType: d.defectType,
                    defectCount: d.defectCount || 0
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });
        return Object.values(grouped);
    }

    // 검사 실적 수정 저장
    async function _saveInspectionUpdate(inspectionId, data) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        // 검증: 양품수 + 불량수 = 검사수량
        const goodQty = parseInt(data.goodQty || 0);
        const defectQty = parseInt(data.defectQty || 0);
        const inspectionQty = parseInt(data.inspectionQty || inspection.inspectionQty || 0);
        const workId = inspection.workId || inspection.productId;
        const work = workId ? Storage.getById(PAINTING_WORK_STORE, workId) : null;
        const workQty = _getPaintingWorkQty(work) || inspectionQty;

        if (!_validateDefectQtyWithinWorkQty(defectQty, workQty)) {
            return false;
        }
        if (goodQty + defectQty !== inspectionQty) {
            UIUtils.toast(`양품수(${goodQty}) + 불량수(${defectQty}) = 검사수량(${inspectionQty})이어야 합니다.`, 'warning');
            return false;
        }
        const detailDefectTotal = (data.defects || inspection.defects || [])
            .reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return false;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, workQty)) {
            return false;
        }

        // 업데이트
        const updated = {
            ...inspection,
            date: data.date || inspection.date,
            inspectionStartTime: data.inspectionStartTime || inspection.inspectionStartTime,
            inspectionEndTime: data.inspectionEndTime || inspection.inspectionEndTime,
            goodQty,
            defectQty,
            defects: data.defects || inspection.defects || [],
            inspectors: data.inspectors || inspection.inspectors || [],
            updatedAt: new Date().toISOString()
        };

        await Storage.update(STORE, inspectionId, updated);
        UIUtils.toast('검사 실적이 수정되었습니다.', 'success');
        return true;
    }

    // 검사 실적 삭제
    async function _deleteInspection(inspectionId) {
        if (!confirm('이 검사 실적을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) {
            return false;
        }

        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        await Storage.remove(STORE, inspectionId);

        // 해당 작업의 상태를 초기화 (검사 미완료로)
        const workId = inspection.workId || inspection.productId;
        if (workId) {
            await Storage.update(PAINTING_WORK_STORE, workId, {
                inspectionStatus: 'pending',
                inspectionDate: null,
                updatedAt: new Date().toISOString()
            });
        }

        UIUtils.toast('검사 실적이 삭제되었습니다.', 'success');

        // 검사 완료 실적 목록도 새로고침
        if (state.currentTab === 'completion') {
            _filterCompletionResults();
        }

        return true;
    }

    return {
        render,
        selectPlan,
        openInspectionModal,
        selectProduct,
        increment,
        decrement,
        save,
        reset,
        showHistory,
        _filterHistoryTable,
        exportData,
        // Phase 3: 통계 대시보드
        showStatisticsDashboard,
        _renderStatisticsDashboard,
        _calculateStatistics,
        _renderStatisticsCharts,
        // Phase 2: 검사 완료 실적
        showCompletionResults,
        _filterCompletionResults,
        _showCompletionDetail,
        _updateCompletionPartFilter,
        _updateStatsPartFilter,
        openEditInspectionModal,
        _submitEditInspection,
        _addInspectorFieldToModal,
        _switchTab,
        _renderTabContent,
        // Phase 1: 기초 인프라
        _applyCommonFilters,
        _getUniqueCarModels,
        _getUniquePartNames,
        _normalizeInspectionData,
        _saveInspectionUpdate,
        _deleteInspection,
        // 검사 모달 헬퍼 함수들
        _incInjDefect,
        _decInjDefect,
        _incPaintDefect,
        _decPaintDefect,
        _updateDefectQty,
        _updateGoodQty,
        _updateDefectTotal,
        _calculateInspectionTime,
        _saveInspection,
        _addInspectorField,
        _syncInspectorOptions,
        showInspectionDetail,
        _closeInspectionModal,
        _showNumericPad,
        _numpadInput,
        _numpadDelete,
        _numpadConfirm,
        focusNonconformStandardPasteZone,
        handleNonconformStandardPaste,
        printNonconformStandardPage
    };
})();

const PaintingQualityPerformanceModule = (function() {
    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header"></div>
                <div id="tabContent"></div>
            </div>
        `;
        setTimeout(() => {
            PaintingInspectionModule.showStatisticsDashboard();
        }, 20);
    }

    return {
        render
    };
})();


// ===================================================================
// 도장품 출고
// ===================================================================
const PaintingOutgoingModule = (function() {
    const STORE = DB.STORES.PAINTING_OUTGOING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingOutgoingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 출고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="poStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="poEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingOutgoingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>출고일</th>
                                        <th>품명</th>
                                        <th>수량</th>
                                        <th>행선지</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="poTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('poStart').value;
        const end = document.getElementById('poEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('poTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.destination || '-'}</td>
                <td>${d.note || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="PaintingOutgoingModule.remove('${d.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장품 출고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="addPoDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPoPart" placeholder="품명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPoQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">행선지</label>
                    <input type="text" class="form-input" id="addPoDest" placeholder="예: 출하검사">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPoNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingOutgoingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPoDate').value,
            partName: document.getElementById('addPoPart').value.trim(),
            quantity: Number(document.getElementById('addPoQty').value) || 0,
            destination: document.getElementById('addPoDest').value.trim(),
            note: document.getElementById('addPoNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 출하검사 대기에도 자동 등록
        await Storage.add(DB.STORES.SHIPPING_STANDBY, {
            date: data.date,
            partName: data.partName,
            quantity: data.quantity,
            status: '대기',
            source: '도장품 출고'
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장품 출고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();
