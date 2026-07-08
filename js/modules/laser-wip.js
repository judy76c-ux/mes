/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기, 도장-B 공정 제품만)
 */

var LaserWipModule = (function() {
    const STORE_LASER = DB.STORES.LASER_WORK_LOG;
    const STORE_PAINT = DB.STORES.PAINTING_WORK;

    let _activeTab = 'standby'; // 'standby' | 'after-laser' | 'after-laser-residual'

    function _isAdmin() {
        const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
        const roles = Array.isArray(u && u.roles) ? u.roles : [u && u.role];
        return roles.some(role => String(role || '') === 'admin');
    }

    // 수량 수정(수기 입고/출고/조정) 권한: 관리자(admin) 또는 레이져운영자(laser_op).
    // 커스텀 역할일 수 있어 역할 키('laser_op')와 라벨('레이져운영자')을 함께 매칭한다. (삭제는 관리자 전용 유지)
    function _canEditWip() {
        try {
            if (_isAdmin()) return true;
            const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            if (!u) return false;
            const roleKeys = Array.isArray(u.roles) ? u.roles.slice() : [];
            if (u.role) roleKeys.push(u.role);
            const roleDefs = (typeof AuthModule !== 'undefined' && Array.isArray(AuthModule.ROLES)) ? AuthModule.ROLES : [];
            return roleKeys.some(function(rk) {
                const key = String(rk || '');
                if (key === 'laser_op') return true;
                const def = roleDefs.find(function(d) { return d.key === key; });
                const label = String((def && def.label) || key).replace(/\s/g, '');
                return /레이[져저].*운영/.test(label);
            });
        } catch (e) { /* 무시 */ }
        return false;
    }

    // 수기 입/출고 모달을 열 때 팝업에서 넘어온 품목을 드롭다운에 자동 선택한다.
    // 제품 목록(도장-B/잔량 대상)에 없는 품목이면 조용히 무시되고 수동 선택으로 진행 가능.
    function _applyPrefillSelects(prefill, carId, partId, colorId, onCarChange, onPartChange) {
        if (!prefill) return;
        setTimeout(function() {
            const carEl = document.getElementById(carId);
            if (carEl && prefill.carModel) {
                carEl.value = prefill.carModel;
                if (typeof onCarChange === 'function') { try { onCarChange(); } catch (e) {} }
            }
            setTimeout(function() {
                const partEl = document.getElementById(partId);
                if (partEl && prefill.partName) {
                    partEl.value = prefill.partName;
                    if (typeof onPartChange === 'function') { try { onPartChange(); } catch (e) {} }
                }
                setTimeout(function() {
                    const colEl = document.getElementById(colorId);
                    if (colEl && prefill.color) colEl.value = prefill.color;
                }, 0);
            }, 0);
        }, 0);
    }

    // 재공/잔량 상세 팝업의 '수량 수정'(수동입고/출고) 진입 — 관리자·레이져운영자만
    function adjustAfterLaserFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const parts = decodeURIComponent(keyEnc || '').split('||');
        const prefill = { carModel: parts[0] || '', partName: parts[1] || '', color: parts[2] || '' };
        if (mode === 'out') openAfterLaserOut(prefill); else openAfterLaserInput(prefill);
    }
    function adjustResidualFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const parts = decodeURIComponent(keyEnc || '').split('||');
        const prefill = { carModel: parts[0] || '', partName: parts[1] || '', color: parts[2] || '' };
        if (mode === 'out') openResidualOut(prefill); else openResidualInput(prefill);
    }

    const TABS = [
        { id: 'standby',     label: '레이져 대기품 현황',    icon: 'hourglass_top' },
        { id: 'after-laser', label: '레이져 후 재공품 현황', icon: 'bolt' },
        { id: 'after-laser-residual', label: '레이져 후 잔량 현황', icon: 'inventory_2' }
    ];

    function _actionBtn(label, icon, onclick, color) {
        const col = color || 'var(--text-primary)';
        return `<button type="button" onclick="${onclick}"
            style="display:flex;align-items:center;gap:5px;padding:6px 13px;border:1px solid var(--border-color);
                   border-radius:7px;background:#fff;cursor:pointer;font-size:0.84rem;color:${col};
                   font-family:inherit;white-space:nowrap;transition:background 0.15s;"
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='#fff'">
            <span class="material-symbols-outlined" style="font-size:16px;color:${col};">${icon}</span>${label}
        </button>`;
    }

    function _tabNav() {
        const standbyActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openManualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserStandbyModule.openStandbyOutModal()", 'var(--accent-red)')}
            ${_actionBtn('일괄등록', 'table_rows', "LaserStandbyModule.openBulkModal()", 'var(--accent-blue)')}` : '';
        const afterActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openAfterLaserOut()", 'var(--accent-red)')}` : '';
        const residualActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openResidualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openResidualOut()", 'var(--accent-red)')}` : '';
        const currentActions = _activeTab === 'standby' ? standbyActions
            : (_activeTab === 'after-laser' ? afterActions : residualActions);
        return `
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
            ${currentActions}
        </div>`;
    }
    function render(container) {
        const activePageId = _activeTab === 'standby' ? 'laser-wip-standby'
            : (_activeTab === 'after-laser' ? 'laser-wip-after' : 'laser-wip-residual');
        container.innerHTML = `
        <div class="fade-in-up">
            ${LaserProcessUI.renderSection(activePageId)}
            <div id="wipTabNav">${_tabNav()}</div>
            <div id="wipTabContent"></div>
        </div>`;
        _renderTabContent();
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;
        const container = document.getElementById('contentArea');
        if (container) { render(container); return; }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    function openTab(tab) {
        _activeTab = TABS.some(t => t.id === tab) ? tab : 'standby';
        if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate('laser-wip');
            return;
        }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    // ── 탭 컨텐츠 렌더 ───────────────────────────────────────────────────
    function _renderTabContent() {
        const el = document.getElementById('wipTabContent');
        if (!el) return;
        if (_activeTab === 'standby') {
            _renderStandbyTab(el);
        } else if (_activeTab === 'after-laser') {
            _renderAfterLaserTab(el);
        } else {
            _renderAfterLaserResidualTab(el);
        }
    }

    // ── 탭 1: 레이져 대기품 현황 ─────────────────────────────────────────
    function _renderStandbyTab(el) {
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;
                        background:rgba(245,158,11,0.07);border-left:3px solid var(--accent-orange);border-radius:0 8px 8px 0;">
                <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-orange);">hourglass_top</span>
                <div>
                    <div style="font-size:0.92rem;font-weight:700;color:var(--accent-orange);">레이져 대기품 현황</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);">도장 완료 후 레이져 공정 대기 재공품</div>
                </div>
            </div>
            <div id="lsbContentWrapper"></div>`;

        const wrapper = document.getElementById('lsbContentWrapper');
        if (wrapper && typeof LaserStandbyModule !== 'undefined') {
            LaserStandbyModule.renderContentOnly(wrapper);
        }
    }

    // ── 탭 2: 레이져 후 재공품 현황 ──────────────────────────────────────
    function _renderAfterLaserTab(el) {
        const rows       = _calcWip();
        const totalLaser = rows.reduce((s,r) => s + r.laserQty, 0);
        const totalPaint = rows.reduce((s,r) => s + r.paintBQty, 0);
        const totalWip   = rows.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
        const waitCount  = rows.filter(r => r.wip > 0).length;

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carWip = items.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => {
                        const wipColor   = r.wip > 0 ? 'var(--accent-green)' : (r.wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
                        const statusText = r.wip > 0 ? '도장 투입 대기' : (r.wip < 0 ? '오류' : '소진');
                        const encKey = encodeURIComponent(`${r.carModel}||${r.partName}||${r.color||''}`);
                        return `<tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                                    onclick="LaserWipModule.showWipDetail('${encKey}', event)"
                                    onmouseover="this.style.background='rgba(139,92,246,0.06)'"
                                    onmouseout="this.style.background=''">
                            <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:160px;max-width:220px;">
                                <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.color && r.color !== '-' ? _esc(r.color) : ''}</td>
                            <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                                <span style="font-size:0.9rem;font-weight:800;color:${wipColor};">${UIUtils.formatNumber(Math.abs(r.wip))}</span>
                                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:${wipColor};white-space:nowrap;">${statusText}
                                <span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;opacity:0.5;margin-left:2px;">open_in_new</span>
                            </td>
                        </tr>`;
                    }).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-purple,#7c3aed);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">재공 <strong>${UIUtils.formatNumber(carWip)}</strong> EA</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재공품</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">상태</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="4" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 레이져 후 재공품이 없습니다.
               </div>`;

        el.innerHTML = `
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card purple">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalLaser)}</div>
                    <div class="stat-card-label">검사 양품 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalPaint)}</div>
                    <div class="stat-card-label">도장 투입 (EA)</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalWip)}</div>
                    <div class="stat-card-label">현재 재공품 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${waitCount}</div>
                    <div class="stat-card-label">대기 품종 수</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 완료 − 도장 투입 = 재공품 (레이져→도장 공정 제품만)</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 분출 현황 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 완료 / 도장 투입 내역</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">레이져작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-purple);white-space:nowrap;">검사 양품</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-blue);white-space:nowrap;">도장 투입</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">재공품</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length === 0
                                ? `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">
                                    <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">inbox</span>
                                    레이져 후 도장 공정이 있는 제품의 작업 이력이 없습니다.
                                   </td></tr>`
                                : rows.map(r => _afterLaserRow(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ${_canEditWip() ? `
            <div class="card" style="margin-top:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">edit_note</span> 수기 입출고 내역 관리
                        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(관리자·레이져운영자 전용)</span>
                    </h4>
                    ${_actionBtn('신규 등록', 'add', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
                </div>
                <div class="card-body" style="padding:0;">
                    ${_manualEntriesTableHtml()}
                </div>
            </div>` : ''}`;
    }

    // ── 레이져 후 재공품 수기 입출고 내역 관리 (관리자 전용) ──────────────
    function _afterLaserManualEntries() {
        return (Storage.getAll(STORE_LASER) || [])
            .filter(w => w.isManual && !w.isResidualManualIn && !w.isResidualManualOut)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function _manualEntriesTableHtml() {
        const entries = _afterLaserManualEntries();
        if (!entries.length) {
            return `<div style="text-align:center;padding:24px;color:var(--text-muted);">등록된 수기 입출고 내역이 없습니다.</div>`;
        }
        return `
        <div class="data-table-wrapper">
            <table class="data-table" style="font-size:0.83rem;">
                <thead><tr>
                    <th>날짜</th><th>구분</th><th>차종</th><th>품명</th><th>컬러</th>
                    <th style="text-align:right;">수량(EA)</th><th>비고</th><th>관리</th>
                </tr></thead>
                <tbody>
                    ${entries.map(w => {
                        const isOut = !!w.isManualOut;
                        const badge = isOut
                            ? `<span style="color:var(--accent-red);font-weight:700;">출고</span>`
                            : `<span style="color:var(--accent-green);font-weight:700;">입고</span>`;
                        return `<tr>
                            <td style="white-space:nowrap;">${_esc(w.date || '-')}</td>
                            <td>${badge}</td>
                            <td>${_esc(w.carModel || '-')}</td>
                            <td>${_esc(w.partName || '-')}</td>
                            <td>${_esc(w.color || '-')}</td>
                            <td style="text-align:right;">${UIUtils.formatNumber(w.quantity || 0)}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${_esc(w.note || '-')}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-sm btn-outline" onclick="LaserWipModule.openEditManualEntry('${w.id}')">수정</button>
                                ${_isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="LaserWipModule.removeManualEntry('${w.id}')">삭제</button>` : ''}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function openEditManualEntry(id) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수정할 수 있습니다.', 'warning'); return; }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        if (!entry) { UIUtils.toast('내역을 찾을 수 없습니다.', 'warning'); return; }
        const isOut = !!entry.isManualOut;

        UIUtils.showModal(`레이져 후 재공품 수기 ${isOut ? '출고' : '입고'} 수정`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwEditDate" value="${_esc(entry.date || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" id="lwEditCarModel" value="${_esc(entry.carModel || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="lwEditPartName" value="${_esc(entry.partName || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" class="form-input" id="lwEditColor" value="${_esc(entry.color || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lwEditQty" min="1" value="${_esc(entry.quantity || 0)}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwEditNote" value="${_esc(entry.note || '')}">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveEditManualEntry('${id}')">저장</button>
        `, 'lg');
    }

    async function saveEditManualEntry(id) {
        if (!_canEditWip()) return;
        const date     = (document.getElementById('lwEditDate')     || {}).value || '';
        const carModel = (document.getElementById('lwEditCarModel') || {}).value.trim() || '';
        const partName = (document.getElementById('lwEditPartName') || {}).value.trim() || '';
        const color    = (document.getElementById('lwEditColor')    || {}).value.trim() || '';
        const quantity = parseInt((document.getElementById('lwEditQty') || {}).value || '0', 10);
        const note     = (document.getElementById('lwEditNote')     || {}).value.trim() || '';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.update(STORE_LASER, id, { date, carModel, partName, color, quantity, note });
        UIUtils.closeModal();
        UIUtils.toast('수기 내역이 수정되었습니다.', 'success');
        refresh();
    }

    function removeManualEntry(id) {
        if (!_isAdmin()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        UIUtils.confirm('이 수기 등록 내역을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE_LASER, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            refresh();
        });
    }

    function _summaryCard(label, value, icon, color) {
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:1.1rem;color:${color};">${icon}</span>
                <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:500;">${label}</span>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:${color};">${UIUtils.formatNumber(value)}
                <span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">EA</span>
            </div>
        </div>`;
    }

    function _renderAfterLaserResidualTab(el) {
        const rows          = _calcLaserResidualWip();
        const totalResidual = rows.reduce((s,r) => s + r.residualQty, 0);
        const totalGood     = rows.reduce((s,r) => s + r.goodQty, 0);
        const totalShip     = rows.reduce((s,r) => s + r.fullBoxQty, 0);

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carResidual = items.reduce((s,r) => s + r.residualQty, 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => {
                        const encKey = encodeURIComponent(`${r.carModel}||${r.partName}||${r.color||''}`);
                        return `
                    <tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                        onclick="LaserWipModule.showResidualDetail('${encKey}', event)"
                        onmouseover="this.style.background='rgba(245,158,11,0.07)'"
                        onmouseout="this.style.background=''">
                        <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:160px;max-width:220px;">
                            <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                        </td>
                        <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.color && r.color !== '-' ? _esc(r.color) : ''}</td>
                        <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                            <span style="font-size:0.9rem;font-weight:800;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(r.residualQty)}</span>
                            <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                        </td>
                        <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}
                            <span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;opacity:0.5;margin-left:2px;">open_in_new</span>
                        </td>
                    </tr>`;
                    }).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-orange,#f59e0b);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">잔량 <strong>${UIUtils.formatNumber(carResidual)}</strong> EA</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--accent-orange,#f59e0b);font-weight:600;border-bottom:1px solid var(--border-color);">잔량</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">포장단위</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="4" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 잔량이 없습니다.
               </div>`;

        el.innerHTML = `
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card orange">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalResidual)}</div>
                    <div class="stat-card-label">총 재고 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${rows.length}</div>
                    <div class="stat-card-label">잔량 품목 수</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalShip)}</div>
                    <div class="stat-card-label">출하가능 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalGood)}</div>
                    <div class="stat-card-label">총 양품 (EA)</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 잔량 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">포장단위 미달로 출하 제외된 잔량</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 잔량 상세 내역 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 작업 기준 잔량 발생 내역</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">레이져작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">양품</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">출하가능</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">포장단위</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-orange,#f59e0b);white-space:nowrap;">잔량</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length === 0
                                ? `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted);">
                                    <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">check_circle</span>
                                    레이져 후 잔량 입고 대상이 없습니다.
                                   </td></tr>`
                                : rows.map(r => _laserResidualRow(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ${_canEditWip() ? `
            <div class="card" style="margin-top:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">edit_note</span> 잔량 수기 입출고 내역 관리
                        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(관리자·레이져운영자 전용)</span>
                    </h4>
                    ${_actionBtn('신규 등록', 'add', "LaserWipModule.openResidualInput()", 'var(--accent-green)')}
                </div>
                <div class="card-body" style="padding:0;">
                    ${_residualManualEntriesTableHtml()}
                </div>
            </div>` : ''}`;
    }

    // ── 레이져 후 잔량 수기 입출고 내역 관리 (관리자 전용) ────────────────
    function _residualManualEntries() {
        return (Storage.getAll(STORE_LASER) || [])
            .filter(w => w.isResidualManualIn || w.isResidualManualOut)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function _residualManualEntriesTableHtml() {
        const entries = _residualManualEntries();
        if (!entries.length) {
            return `<div style="text-align:center;padding:24px;color:var(--text-muted);">등록된 수기 입출고 내역이 없습니다.</div>`;
        }
        return `
        <div class="data-table-wrapper">
            <table class="data-table" style="font-size:0.83rem;">
                <thead><tr>
                    <th>날짜</th><th>구분</th><th>차종</th><th>품명</th><th>컬러</th>
                    <th style="text-align:right;">수량(EA)</th><th>비고</th><th>관리</th>
                </tr></thead>
                <tbody>
                    ${entries.map(w => {
                        const isOut = !!w.isResidualManualOut;
                        const badge = isOut
                            ? `<span style="color:var(--accent-red);font-weight:700;">출고</span>`
                            : `<span style="color:var(--accent-green);font-weight:700;">입고</span>`;
                        return `<tr>
                            <td style="white-space:nowrap;">${_esc(w.date || '-')}</td>
                            <td>${badge}</td>
                            <td>${_esc(w.carModel || '-')}</td>
                            <td>${_esc(w.partName || '-')}</td>
                            <td>${_esc(w.color || '-')}</td>
                            <td style="text-align:right;">${UIUtils.formatNumber(w.quantity || 0)}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${_esc(w.note || '-')}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-sm btn-outline" onclick="LaserWipModule.openEditResidualManualEntry('${w.id}')">수정</button>
                                ${_isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="LaserWipModule.removeResidualManualEntry('${w.id}')">삭제</button>` : ''}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function openEditResidualManualEntry(id) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수정할 수 있습니다.', 'warning'); return; }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        if (!entry) { UIUtils.toast('내역을 찾을 수 없습니다.', 'warning'); return; }
        const isOut = !!entry.isResidualManualOut;

        UIUtils.showModal(`레이져 후 잔량 수기 ${isOut ? '출고' : '입고'} 수정`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResEditDate" value="${_esc(entry.date || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" id="lwResEditCarModel" value="${_esc(entry.carModel || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="lwResEditPartName" value="${_esc(entry.partName || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" class="form-input" id="lwResEditColor" value="${_esc(entry.color || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lwResEditQty" min="1" value="${_esc(entry.quantity || 0)}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResEditNote" value="${_esc(entry.note || '')}">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveEditResidualManualEntry('${id}')">저장</button>
        `, 'lg');
    }

    async function saveEditResidualManualEntry(id) {
        if (!_canEditWip()) return;
        const date     = (document.getElementById('lwResEditDate')     || {}).value || '';
        const carModel = (document.getElementById('lwResEditCarModel') || {}).value.trim() || '';
        const partName = (document.getElementById('lwResEditPartName') || {}).value.trim() || '';
        const color    = (document.getElementById('lwResEditColor')    || {}).value.trim() || '';
        const quantity = parseInt((document.getElementById('lwResEditQty') || {}).value || '0', 10);
        const note     = (document.getElementById('lwResEditNote')     || {}).value.trim() || '';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.update(STORE_LASER, id, { date, carModel, partName, color, quantity, note });
        UIUtils.closeModal();
        UIUtils.toast('수기 내역이 수정되었습니다.', 'success');
        refresh();
    }

    function removeResidualManualEntry(id) {
        if (!_isAdmin()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        UIUtils.confirm('이 수기 등록 내역을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE_LASER, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            refresh();
        });
    }

    function _calcLaserResidualWip() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const residualMap = {};

        laserWorks
            .filter(w => !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut)
            .forEach(w => {
                const packUnit = _num(w.packUnit);
                const goodQty = _num(w.inspectionGoodQty) || _num(w.completedQty) || _num(w.quantity);
                const fullBoxQty = _num(w.shippingEligibleQty) || (packUnit > 0 ? Math.floor(goodQty / packUnit) * packUnit : goodQty);
                const residualQty = _num(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - fullBoxQty) : 0);
                const paintLots = Array.isArray(w.paintLots) ? w.paintLots : [];
                const key = `${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`;
                if (!residualMap[key]) {
                    residualMap[key] = {
                        carModel: w.carModel || '',
                        partName: w.partName || '',
                        color: w.color || '',
                        laserDates: [],
                        paintDates: [],
                        injectionLots: [],
                        goodQty: 0,
                        fullBoxQty: 0,
                        packUnit,
                        residualQty: 0
                    };
                }
                residualMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                (paintLots.length ? paintLots.map(l => l && l.paintDate) : [w.paintDate || '']).forEach(v => residualMap[key].paintDates.push(v));
                (paintLots.length ? paintLots.map(l => l && l.lotNo) : [w.paintLot || w.lotNo || '']).forEach(v => residualMap[key].injectionLots.push(v));
                residualMap[key].goodQty += goodQty;
                residualMap[key].fullBoxQty += fullBoxQty;
                residualMap[key].packUnit = residualMap[key].packUnit || packUnit;
                residualMap[key].residualQty += residualQty;
            });

        laserWorks
            .filter(w => w.isResidualManualIn || w.isResidualManualOut)
            .forEach(w => {
                const key = `${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`;
                if (!residualMap[key]) {
                    residualMap[key] = {
                        carModel: w.carModel || '',
                        partName: w.partName || '',
                        color: w.color || '',
                        laserDates: [],
                        paintDates: [],
                        injectionLots: [],
                        goodQty: 0,
                        fullBoxQty: 0,
                        packUnit: _num(w.packUnit),
                        residualQty: 0
                    };
                }
                residualMap[key].packUnit = residualMap[key].packUnit || _num(w.packUnit);
                residualMap[key].residualQty += w.isResidualManualIn ? _num(w.quantity) : -_num(w.quantity);
                residualMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (w.paintDate) residualMap[key].paintDates.push(w.paintDate);
                if (w.lotNo) residualMap[key].injectionLots.push(w.lotNo);
            });

        return Object.values(residualMap)
            .map(r => ({
                ...r,
                residualQty: Math.max(0, _num(r.residualQty))
            }))
            .filter(r => r.residualQty > 0)
            .sort((a, b) => {
                const d = String(b.laserDates[0] || '').localeCompare(String(a.laserDates[0] || ''));
                if (d !== 0) return d;
                const cm = (a.carModel || '').localeCompare(b.carModel || '');
                return cm !== 0 ? cm : (a.partName || '').localeCompare(b.partName || '');
            });
    }

    function _getResidualProducts() {
        return _getPaintBProducts();
    }

    function openResidualInput(prefill) {
        const products = _getResidualProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 잔량 수기 등록', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text-secondary);">
                포장단위 미달 잔량을 수동으로 추가 등록합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualInDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualInCarModel" onchange="LaserWipModule.onResidualInCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualInPartName" onchange="LaserWipModule.onResidualInPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualInColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">잔량 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwResidualInQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualInNote" placeholder="수기 잔량입고">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveResidualInput()">등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwResidualInCarModel', 'lwResidualInPartName', 'lwResidualInColor', onResidualInCarChange, onResidualInPartChange);
    }

    function onResidualInCarChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const products = _getResidualProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualInPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onResidualInPartChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const products = _getResidualProducts().filter(p => (!carModel || p.carModel === carModel) && (!partName || p.partName === partName));
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function saveResidualInput() {
        const date = (document.getElementById('lwResidualInDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualInColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualInQty') || {}).value || '0', 10);
        const note = (document.getElementById('lwResidualInNote') || {}).value.trim() || '수기 잔량입고';
        const prod = _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName && (!color || p.color === color))
            || _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName);
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 잔량 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, note, packUnit, isManual: true, isResidualManualIn: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 잔량 수기 등록 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function openResidualOut(prefill) {
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 잔량 수동출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);">
                잔량 재고를 수동으로 출고 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualOutCarModel" onchange="LaserWipModule.onResidualOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualOutPartName" onchange="LaserWipModule.onResidualOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwResidualOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualOutNote" placeholder="수기 잔량출고">
                </div>
            </div>
            <div id="lwResidualOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);" onclick="LaserWipModule.saveResidualOut()">출고 등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwResidualOutCarModel', 'lwResidualOutPartName', 'lwResidualOutColor', onResidualOutCarChange, onResidualOutPartChange);
    }

    function onResidualOutCarChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualOutPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        const info = document.getElementById('lwResidualOutStockInfo');
        if (info) info.textContent = '';
    }

    function onResidualOutPartChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
        const match = rows.find(r => r.partName === partName);
        const info = document.getElementById('lwResidualOutStockInfo');
        if (info && match) info.innerHTML = `현재 잔량 재고 <strong style="color:var(--accent-orange);">${UIUtils.formatNumber(match.residualQty)} EA</strong>`;
    }

    async function saveResidualOut() {
        const date = (document.getElementById('lwResidualOutDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualOutColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualOutQty') || {}).value || '0', 10);
        const note = (document.getElementById('lwResidualOutNote') || {}).value.trim() || '수기 잔량출고';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 출고 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const residual = _calcLaserResidualWip().find(r => r.carModel === carModel && r.partName === partName && (!color || r.color === color));
        if (residual && quantity > residual.residualQty) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 잔량(${residual.residualQty})을 초과합니다.`, 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, note, packUnit: residual ? residual.packUnit : 0, isManual: true, isResidualManualOut: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 잔량 출고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    // ── 제품 클릭 팝업 공통 닫기 ────────────────────────────────────────
    function _closeDetailPopup() {
        const el = document.getElementById('lwDetailPopup');
        if (el) el.remove();
    }

    function _popupPosition(evt) {
        const rect = evt.currentTarget ? evt.currentTarget.getBoundingClientRect() : { bottom: evt.clientY, left: evt.clientX, top: evt.clientY };
        const popW = 460, popH = 380;
        let top = (rect.bottom || evt.clientY) + 6;
        let left = (rect.left || evt.clientX);
        if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
        if (top + popH > window.innerHeight - 10) top = (rect.top || evt.clientY) - popH - 6;
        return { top, left };
    }

    // ── 레이져 후 재공품 LOT별 잔량 계산 ────────────────────────────────
    function _calcWipLotDetail(carModel, partName, color) {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const drainMap   = _buildAfterLaserDrainMap();
        const drainLine  = drainMap[`${carModel}||${partName}`];

        const inspGoodMap = {};
        laserInsps.forEach(function(insp) {
            if (!insp.workLogId) return;
            const good = Math.max(0, (Number(insp.inspQty)||0) - (Number(insp.failQty)||0));
            inspGoodMap[insp.workLogId] = (inspGoodMap[insp.workLogId]||0) + good;
        });

        const usedByLot = {};
        paintWorks.forEach(function(w) {
            if ((w.carModel||'') !== carModel || (w.partName||'') !== partName) return;
            if (drainLine && (w.line||'').trim() !== drainLine) return;
            const wLots = Array.isArray(w.lots) && w.lots.length > 0
                ? w.lots : [{ lotNo: w.lotNo||'', qty: Number(w.productionQty)||0 }];
            wLots.forEach(function(l) {
                if (l.lotNo) usedByLot[l.lotNo] = (usedByLot[l.lotNo]||0) + (Number(l.qty)||0);
            });
        });

        const wipMap = {};
        laserWorks.filter(function(w) {
            if ((w.carModel||'') !== carModel || (w.partName||'') !== partName) return false;
            if (color && (w.color||'') !== color) return false;
            return !w.isManualOut;
        }).forEach(function(w) {
            const workQty = Number(w.quantity)||0;
            const goodQty = (w.id && (w.id in inspGoodMap)) ? inspGoodMap[w.id] : workQty;
            const effGood = goodQty > 0 ? goodQty : workQty;
            if (effGood <= 0) return;

            // 도장LOT: paintDate 기반 YYMMDD
            const paintLot = (function() {
                if (Array.isArray(w.paintLots) && w.paintLots.length > 0 && w.paintLots[0] && w.paintLots[0].paintDate) {
                    return String(w.paintLots[0].paintDate).replace(/-/g,'').slice(2,8);
                }
                return String(w.paintDate||w.date||'').replace(/-/g,'').slice(2,8);
            })();

            let injLots = [];
            if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
                w.paintLots.forEach(function(pl) {
                    if (!pl) return;
                    let lotNo = String(pl.lotNo||'').trim();
                    if (!lotNo && pl.paintDate) lotNo = String(pl.paintDate).replace(/-/g,'').slice(2,8);
                    if (lotNo) injLots.push({ lotNo: lotNo, qty: Number(pl.qty)||0 });
                });
            }
            if (!injLots.length) {
                const s = String(w.paintLot||w.lotNo||'').trim();
                if (s) injLots.push({ lotNo: s, qty: workQty });
            }
            if (!injLots.length) {
                const dk = String(w.date||'').replace(/-/g,'').slice(2,8);
                if (dk) injLots.push({ lotNo: dk, qty: workQty });
            }
            const totalLotQty = injLots.reduce(function(s,l){return s+l.qty;},0);
            injLots.forEach(function(lj) {
                const wipQty = totalLotQty > 0 ? (effGood * lj.qty / totalLotQty) : (effGood / injLots.length);
                if (!wipMap[lj.lotNo]) wipMap[lj.lotNo] = { lotNo: lj.lotNo, paintLot: paintLot, balance: 0 };
                else if (!wipMap[lj.lotNo].paintLot && paintLot) wipMap[lj.lotNo].paintLot = paintLot;
                wipMap[lj.lotNo].balance += wipQty;
            });
        });

        Object.keys(usedByLot).forEach(function(lotNo) {
            if (wipMap[lotNo]) wipMap[lotNo].balance -= usedByLot[lotNo];
        });

        return Object.values(wipMap)
            .map(function(l){ return { lotNo: l.lotNo, paintLot: l.paintLot||'', balance: Math.round(l.balance) }; })
            .sort(function(a,b){ return a.lotNo.localeCompare(b.lotNo); });
    }

    // ── 레이져 후 재공품 팝업 ────────────────────────────────────────────
    function showWipDetail(keyEnc, evt) {
        _closeDetailPopup();
        evt.stopPropagation();

        const parts = decodeURIComponent(keyEnc).split('||');
        const carModel = parts[0]||'', partName = parts[1]||'', color = parts[2]||'';

        const r = (_calcWip()).find(function(x){ return x.carModel===carModel && x.partName===partName && (x.color||'')===color; });
        if (!r) return;

        const lotRows = _calcWipLotDetail(carModel, partName, color);

        // 입출고 내역 rows
        const laserWorks = (Storage.getAll(STORE_LASER)||[]).filter(function(w){
            return (w.carModel||'')===carModel && (w.partName||'')===partName && (!color||(w.color||'')===color) && !w.isManualOut;
        });
        const drainMap  = _buildAfterLaserDrainMap();
        const drainLine = drainMap[`${carModel}||${partName}`];
        const paintWorks = (Storage.getAll(STORE_PAINT)||[]).filter(function(w){
            return (w.carModel||'')===carModel && (w.partName||'')===partName && (!drainLine||(w.line||'').trim()===drainLine);
        });

        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS)||[];
        const inspGoodMap = {};
        laserInsps.forEach(function(i){ if(i.workLogId){ const g=Math.max(0,(Number(i.inspQty)||0)-(Number(i.failQty)||0)); inspGoodMap[i.workLogId]=(inspGoodMap[i.workLogId]||0)+g; } });

        const allHistRows = [];
        laserWorks.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(w){
            const goodQty = (w.id&&(w.id in inspGoodMap)) ? inspGoodMap[w.id] : (Number(w.quantity)||0);
            const lots = Array.isArray(w.paintLots)&&w.paintLots.length ? w.paintLots.map(function(pl){ return (pl&&pl.lotNo)||''; }).filter(Boolean).join(',') : (w.paintLot||w.lotNo||'-');
            allHistRows.push(`<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:4px 8px;"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;background:rgba(139,92,246,0.12);color:var(--accent-purple);">레이져 입고</span></td>
                <td style="padding:4px 8px;font-size:0.78rem;">${_esc(w.date||'-')}</td>
                <td style="padding:4px 8px;font-size:0.74rem;color:var(--text-muted);">${_esc(lots)}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:var(--accent-purple);">+${UIUtils.formatNumber(goodQty)}</td>
            </tr>`);
        });
        paintWorks.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(w){
            const qty = Number(w.productionQty)||0;
            const wLots = Array.isArray(w.lots)&&w.lots.length ? w.lots.map(function(l){return l&&l.lotNo||'';}).filter(Boolean).join(',') : (w.lotNo||'-');
            allHistRows.push(`<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:4px 8px;"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;background:rgba(37,99,235,0.10);color:var(--accent-blue);">도장-B 출고</span></td>
                <td style="padding:4px 8px;font-size:0.78rem;">${_esc(w.date||'-')}</td>
                <td style="padding:4px 8px;font-size:0.74rem;color:var(--text-muted);">${_esc(wLots)}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:var(--accent-blue);">-${UIUtils.formatNumber(qty)}</td>
            </tr>`);
        });
        allHistRows.sort(function(a,b){ const da=a.match(/\d{4}-\d{2}-\d{2}/)||['']; const db=b.match(/\d{4}-\d{2}-\d{2}/)||['']; return da[0].localeCompare(db[0]); });

        const visibleLots = lotRows.filter(function(l){return l.balance>0;});
        const lotTableHtml = visibleLots.length === 0
            ? '<div style="color:var(--text-muted);font-size:0.82rem;padding:6px 0;">재고 없음</div>'
            : `<table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:rgba(139,92,246,0.07);">
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">도장 LOT</th>
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">사출 LOT</th>
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">재고 (EA)</th>
                </tr></thead>
                <tbody>${visibleLots.map(function(l){
                    return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                        <td style="padding:4px 10px;font-family:monospace;font-size:0.82rem;color:var(--accent-green);">${_esc(l.paintLot||'-')}</td>
                        <td style="padding:4px 10px;font-family:monospace;font-size:0.82rem;">${_esc(l.lotNo)}</td>
                        <td style="padding:4px 10px;text-align:right;font-weight:700;color:var(--accent-purple);">${UIUtils.formatNumber(l.balance)}</td>
                    </tr>`;
                }).join('')}</tbody>
               </table>`;

        const popup = document.createElement('div');
        popup.id = 'lwDetailPopup';
        popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:320px;max-width:460px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;`;
        const pos = _popupPosition(evt);
        popup.style.top = pos.top + 'px';
        popup.style.left = pos.left + 'px';

        popup.innerHTML = `
            <div style="background:var(--accent-purple,#7c3aed);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0;">
                <div>
                    <div style="font-size:0.72rem;opacity:0.8;">${_esc(carModel)}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${_esc(partName)} <span style="font-size:0.8rem;font-weight:400;">${color&&color!=='-'?'/ '+_esc(color):''}</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;opacity:0.8;">현재 재공품</div>
                    <div style="font-size:1.3rem;font-weight:800;">${UIUtils.formatNumber(Math.max(0,r.wip))} <span style="font-size:0.75rem;font-weight:400;">EA</span></div>
                </div>
            </div>
            <div style="padding:10px 12px;">
                <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">inventory_2</span>사출 LOT별 잔량
                </div>
                ${lotTableHtml}
            </div>
            ${_canEditWip() ? `
            <div style="padding:0 12px 8px;display:flex;gap:6px;">
                <button onclick="LaserWipModule.adjustAfterLaserFromPopup('${keyEnc}','in')" style="flex:1;font-size:0.78rem;padding:5px 10px;border:1px solid var(--accent-green);border-radius:6px;background:#fff;color:var(--accent-green);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">arrow_downward</span>수동입고
                </button>
                <button onclick="LaserWipModule.adjustAfterLaserFromPopup('${keyEnc}','out')" style="flex:1;font-size:0.78rem;padding:5px 10px;border:1px solid var(--accent-red);border-radius:6px;background:#fff;color:var(--accent-red);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">arrow_upward</span>수동출고
                </button>
            </div>` : ''}
            <div style="padding:0 12px 10px;display:flex;align-items:center;gap:8px;">
                <button onclick="(function(btn){
                    const el=document.getElementById('lwDetailHistArea');
                    const show=el.style.display==='none';
                    el.style.display=show?'block':'none';
                    btn.innerHTML=show?'<span class=\\'material-symbols-outlined\\' style=\\'font-size:14px;vertical-align:middle;\\'>expand_less</span> 내역 닫기':'<span class=\\'material-symbols-outlined\\' style=\\'font-size:14px;vertical-align:middle;\\'>expand_more</span> 입출고 내역 확인 (${allHistRows.length}건)';
                })(this)" style="font-size:0.78rem;padding:4px 12px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-secondary);">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">expand_more</span>입출고 내역 확인 (${allHistRows.length}건)
                </button>
                <span style="font-size:0.75rem;color:var(--text-muted);">입고 ${UIUtils.formatNumber(r.laserQty)} / 출고 ${UIUtils.formatNumber(r.paintBQty)} EA</span>
            </div>
            <div id="lwDetailHistArea" style="display:none;overflow-y:auto;max-height:240px;border-top:1px solid var(--border-color);">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">구분</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">날짜</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">LOT</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                        </tr>
                    </thead>
                    <tbody>${allHistRows.join('')}</tbody>
                </table>
            </div>`;

        document.body.appendChild(popup);
        document.addEventListener('click', function _closeOnOuter(e) {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _closeOnOuter); }
        });
    }

    // ── 레이져 잔량 팝업 ─────────────────────────────────────────────────
    function showResidualDetail(keyEnc, evt) {
        _closeDetailPopup();
        evt.stopPropagation();

        const parts = decodeURIComponent(keyEnc).split('||');
        const carModel = parts[0]||'', partName = parts[1]||'', color = parts[2]||'';

        const r = _calcLaserResidualWip().find(function(x){ return x.carModel===carModel && x.partName===partName && (x.color||'')===color; });
        if (!r) return;

        // 레이져 작업 엔트리별 LOT잔량 계산
        const laserAllWorks = (Storage.getAll(STORE_LASER)||[]).filter(function(w){
            return (w.carModel||'')===carModel && (w.partName||'')===partName && (!color||(w.color||'')===color);
        });

        // 일반 작업 잔량 rows
        const lotEntries = [];
        laserAllWorks.filter(function(w){ return !w.isManualOut&&!w.isResidualManualIn&&!w.isResidualManualOut; }).forEach(function(w){
            const goodQty  = Number(w.inspectionGoodQty)||Number(w.completedQty)||Number(w.quantity)||0;
            const packUnit = Number(w.packUnit)||0;
            const resQty   = Number(w.laserResidualQty)||(packUnit>0?Math.max(0,goodQty-Math.floor(goodQty/packUnit)*packUnit):0);
            if (resQty <= 0) return;
            const paintLots = Array.isArray(w.paintLots)&&w.paintLots.length ? w.paintLots : [];
            const paintLot  = paintLots.length&&paintLots[0]&&paintLots[0].paintDate
                ? String(paintLots[0].paintDate).replace(/-/g,'').slice(2,8)
                : String(w.paintDate||w.date||'').replace(/-/g,'').slice(2,8);
            const injLots   = paintLots.map(function(l){ return l&&l.lotNo||''; }).filter(Boolean);
            const injStr    = injLots.length ? injLots.join(', ') : (w.paintLot||w.lotNo||'-');
            lotEntries.push({ paintLot: paintLot||'-', injLot: injStr, qty: resQty });
        });
        // 수기 입출고 조정분 (별도 행)
        var manualAdj = 0;
        laserAllWorks.filter(function(w){ return w.isResidualManualIn||w.isResidualManualOut; }).forEach(function(w){
            manualAdj += w.isResidualManualIn ? (Number(w.quantity)||0) : -(Number(w.quantity)||0);
        });

        const lotTableHtml = lotEntries.length === 0
            ? '<div style="color:var(--text-muted);font-size:0.82rem;padding:6px 0;">LOT 정보 없음</div>'
            : `<table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:rgba(245,158,11,0.07);">
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">도장 LOT</th>
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">사출 LOT</th>
                    <th style="padding:4px 10px;font-size:0.7rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">재고 (EA)</th>
                </tr></thead>
                <tbody>
                    ${lotEntries.map(function(e){
                        return `<tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                            <td style="padding:4px 10px;font-family:monospace;font-size:0.82rem;color:var(--accent-green);">${_esc(e.paintLot)}</td>
                            <td style="padding:4px 10px;font-family:monospace;font-size:0.82rem;">${_esc(e.injLot)}</td>
                            <td style="padding:4px 10px;text-align:right;font-weight:700;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(e.qty)}</td>
                        </tr>`;
                    }).join('')}
                    ${manualAdj !== 0 ? `<tr style="border-top:1px dashed var(--border-color);">
                        <td colspan="2" style="padding:4px 10px;font-size:0.74rem;color:var(--text-muted);">수기 조정</td>
                        <td style="padding:4px 10px;text-align:right;font-size:0.8rem;font-weight:700;color:${manualAdj>0?'var(--accent-green)':'var(--accent-red)'};">${manualAdj>0?'+':''}${UIUtils.formatNumber(manualAdj)}</td>
                    </tr>` : ''}
                </tbody>
               </table>`;

        // 입출고 내역: laserWorks rows (잔량 발생) + residual manual rows
        const laserWorks = (Storage.getAll(STORE_LASER)||[]).filter(function(w){
            return (w.carModel||'')===carModel && (w.partName||'')===partName && (!color||(w.color||'')===color);
        });
        const histRows = [];
        laserWorks.filter(function(w){return !w.isManualOut&&!w.isResidualManualIn&&!w.isResidualManualOut;}).forEach(function(w){
            const goodQty = Number(w.inspectionGoodQty)||Number(w.completedQty)||Number(w.quantity)||0;
            const packUnit = Number(w.packUnit)||0;
            const residualQty = Number(w.laserResidualQty)||(packUnit>0?Math.max(0,goodQty-Math.floor(goodQty/packUnit)*packUnit):0);
            if (residualQty <= 0) return;
            const lots = Array.isArray(w.paintLots)&&w.paintLots.length ? w.paintLots.map(function(pl){return pl&&pl.lotNo||'';}).filter(Boolean).join(',') : (w.paintLot||w.lotNo||'-');
            histRows.push(`<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:4px 8px;"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;background:rgba(245,158,11,0.12);color:var(--accent-orange,#f59e0b);">잔량 발생</span></td>
                <td style="padding:4px 8px;font-size:0.78rem;">${_esc(w.date||'-')}</td>
                <td style="padding:4px 8px;font-size:0.74rem;color:var(--text-muted);">${_esc(lots)}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:var(--accent-orange,#f59e0b);">+${UIUtils.formatNumber(residualQty)}</td>
            </tr>`);
        });
        laserWorks.filter(function(w){return w.isResidualManualIn||w.isResidualManualOut;}).forEach(function(w){
            const qty = Number(w.quantity)||0;
            const isIn = w.isResidualManualIn;
            histRows.push(`<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:4px 8px;"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;background:${isIn?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.10)'};color:${isIn?'var(--accent-green)':'var(--accent-red)'};">${isIn?'수기 입고':'수기 출고'}</span></td>
                <td style="padding:4px 8px;font-size:0.78rem;">${_esc(w.date||'-')}</td>
                <td style="padding:4px 8px;font-size:0.74rem;color:var(--text-muted);">${_esc(w.lotNo||w.note||'-')}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:${isIn?'var(--accent-green)':'var(--accent-red)'};">${isIn?'+':'-'}${UIUtils.formatNumber(qty)}</td>
            </tr>`);
        });

        const popup = document.createElement('div');
        popup.id = 'lwDetailPopup';
        popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:340px;max-width:480px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;`;
        const pos = _popupPosition(evt);
        popup.style.top = pos.top + 'px';
        popup.style.left = pos.left + 'px';

        popup.innerHTML = `
            <div style="background:var(--accent-orange,#f59e0b);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0;">
                <div>
                    <div style="font-size:0.72rem;opacity:0.85;">${_esc(carModel)}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${_esc(partName)} <span style="font-size:0.8rem;font-weight:400;">${color&&color!=='-'?'/ '+_esc(color):''}</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;opacity:0.85;">현재 잔량</div>
                    <div style="font-size:1.3rem;font-weight:800;">${UIUtils.formatNumber(r.residualQty)} <span style="font-size:0.75rem;font-weight:400;">EA</span></div>
                </div>
            </div>
            <div style="padding:10px 12px;">
                <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">sell</span>LOT / 작업일 정보
                </div>
                ${lotTableHtml}
                ${r.packUnit ? `<div style="margin-top:6px;font-size:0.74rem;color:var(--text-muted);">포장단위: <strong style="color:var(--text-primary);">${UIUtils.formatNumber(r.packUnit)}</strong> / 출하가능: <strong style="color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)} EA</strong></div>` : ''}
            </div>
            ${_canEditWip() ? `
            <div style="padding:0 12px 8px;display:flex;gap:6px;">
                <button onclick="LaserWipModule.adjustResidualFromPopup('${keyEnc}','in')" style="flex:1;font-size:0.78rem;padding:5px 10px;border:1px solid var(--accent-green);border-radius:6px;background:#fff;color:var(--accent-green);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">arrow_downward</span>수동입고
                </button>
                <button onclick="LaserWipModule.adjustResidualFromPopup('${keyEnc}','out')" style="flex:1;font-size:0.78rem;padding:5px 10px;border:1px solid var(--accent-red);border-radius:6px;background:#fff;color:var(--accent-red);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">arrow_upward</span>수동출고
                </button>
            </div>` : ''}
            <div style="padding:0 12px 10px;display:flex;align-items:center;gap:8px;">
                <button onclick="(function(btn){
                    const el=document.getElementById('lwDetailHistArea');
                    const show=el.style.display==='none';
                    el.style.display=show?'block':'none';
                    btn.innerHTML=show?'<span class=\\'material-symbols-outlined\\' style=\\'font-size:14px;vertical-align:middle;\\'>expand_less</span> 내역 닫기':'<span class=\\'material-symbols-outlined\\' style=\\'font-size:14px;vertical-align:middle;\\'>expand_more</span> 입출고 내역 확인 (${histRows.length}건)';
                })(this)" style="font-size:0.78rem;padding:4px 12px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-secondary);">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">expand_more</span>입출고 내역 확인 (${histRows.length}건)
                </button>
            </div>
            <div id="lwDetailHistArea" style="display:none;overflow-y:auto;max-height:240px;border-top:1px solid var(--border-color);">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">구분</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">날짜</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">LOT</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                        </tr>
                    </thead>
                    <tbody>${histRows.join('')}</tbody>
                </table>
            </div>`;

        document.body.appendChild(popup);
        document.addEventListener('click', function _closeOnOuter(e) {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _closeOnOuter); }
        });
    }

    function _num(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _laserResidualRow(r) {
        const encKey = encodeURIComponent(`${r.carModel||''}||${r.partName||''}||${r.color||''}`);
        return `<tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                    onclick="LaserWipModule.showResidualDetail('${encKey}', event)"
                    onmouseover="this.style.background='rgba(245,158,11,0.07)'"
                    onmouseout="this.style.background=''">
            <td style="padding:10px 14px;font-weight:600;">${_esc(r.carModel || '-')}</td>
            <td style="padding:10px 14px;">${_esc(r.partName || '-')}</td>
            <td style="padding:10px 14px;">${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${_esc(r.color)}</span>` : '-'}</td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;">${UIUtils.formatNumber(r.goodQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)}</td>
            <td style="padding:10px 14px;text-align:right;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:800;color:var(--accent-orange);">${UIUtils.formatNumber(r.residualQty)}</td>
            <td style="padding:10px 14px;text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:rgba(245,158,11,0.12);color:var(--accent-orange);">
                    <span class="material-symbols-outlined" style="font-size:0.85rem;">move_to_inbox</span> 잔량입고
                </span>
            </td>
        </tr>`;
    }

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _dateTime(dateValue, timeValue) {
        const date = String(dateValue || '').trim();
        const time = String(timeValue || '').trim();
        if (!date && !time) return '';
        const dateMatch = date.match(/\d{4}-\d{2}-\d{2}/);
        const timeMatch = (date.match(/[ T](\d{2}:\d{2})/) || time.match(/(\d{2}:\d{2})/));
        return [dateMatch ? dateMatch[0] : date, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' ');
    }

    function _uniqueList(values) {
        return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
    }

    function _listCell(values) {
        const list = _uniqueList(values);
        if (!list.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
            ${list.slice(0, 3).map(v => `<span style="font-size:0.74rem;color:var(--text-secondary);white-space:nowrap;">${_esc(v)}</span>`).join('')}
            ${list.length > 3 ? `<span style="font-size:0.7rem;color:var(--text-muted);">+${list.length - 3}</span>` : ''}
        </div>`;
    }

    function _afterLaserRow(r) {
        const wip = r.wip;
        const wipColor = wip > 0 ? 'var(--accent-green)' : (wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
        let statusBadge;
        if (wip > 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.12);color:var(--accent-green);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">hourglass_empty</span> 도장 투입 대기
            </span>`;
        } else if (wip < 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.12);color:var(--accent-red);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">error</span> 수량 오류
            </span>`;
        } else {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:var(--bg-secondary);color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">check_circle</span> 소진완료
            </span>`;
        }
        const rowBg = wip > 0 ? '' : (wip < 0 ? 'background:rgba(239,68,68,0.04);' : 'background:var(--bg-secondary);opacity:0.7;');
        const encKey = encodeURIComponent(`${r.carModel||''}||${r.partName||''}||${r.color||''}`);
        return `<tr style="border-bottom:1px solid var(--border-color);${rowBg}cursor:pointer;"
                    onclick="LaserWipModule.showWipDetail('${encKey}', event)"
                    onmouseover="this.style.background='rgba(139,92,246,0.07)'"
                    onmouseout="this.style.background='${wip > 0 ? '' : (wip < 0 ? 'rgba(239,68,68,0.04)' : 'var(--bg-secondary)')}'">
            <td style="padding:10px 14px;font-weight:600;">${r.carModel || '-'}</td>
            <td style="padding:10px 14px;">${r.partName || '-'}</td>
            <td style="padding:10px 14px;">
                ${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${r.color}</span>` : '-'}
            </td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-purple);">${UIUtils.formatNumber(r.laserQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-blue);">${UIUtils.formatNumber(r.paintBQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:700;color:${wipColor};">${UIUtils.formatNumber(wip)}</td>
            <td style="padding:10px 14px;text-align:center;">${statusBadge}</td>
        </tr>`;
    }

    // ── 공정명 정규화 ────────────────────────────────────────────────────
    function _normProc(v) {
        const s = (v || '').trim();
        if (/^도장.?A$/i.test(s)) return '도장-A';
        if (/^도장.?B$/i.test(s)) return '도장-B';
        if (/^레이[져저]$/i.test(s)) return '레이져';
        return s;
    }

    // ── 레이져 직후 공정이 도장(A/B)인 제품 맵 구성 ─────────────────────
    // 반환: { 'carModel||partName': '도장-A' | '도장-B' }
    function _buildAfterLaserDrainMap() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const map = {};
        products.forEach(p => {
            const seq = ['process1','process2','process3','process4']
                .map(k => _normProc(p[k] || '')).filter(Boolean);
            const idxLaser = seq.findIndex(v => v === '레이져');
            if (idxLaser < 0 || idxLaser === seq.length - 1) return;
            const next = seq[idxLaser + 1];
            if (next === '도장-A' || next === '도장-B') {
                map[`${p.carModel||''}||${p.partName||''}`] = next;
            }
        });
        return map;
    }

    // ── 레이져 후 WIP 계산 ────────────────────────────────────────────────
    // laserQty = 레이져 외관 검사 양품수(inspQty - failQty).
    // 검사 기록이 없는 작업은 작업수량으로 fallback.
    function _calcWip() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const drainMap   = _buildAfterLaserDrainMap();

        // workLogId → 검사 양품수 (inspQty - failQty)
        const inspGoodMap = {};
        laserInsps.forEach(function(insp) {
            if (!insp.workLogId) return;
            const good = Math.max(0, (Number(insp.inspQty) || 0) - (Number(insp.failQty) || 0));
            inspGoodMap[insp.workLogId] = (inspGoodMap[insp.workLogId] || 0) + good;
        });

        const laserMap = {};

        laserWorks.forEach(w => {
            const prodKey = `${w.carModel||''}||${w.partName||''}`;
            if (!drainMap[prodKey]) return; // 레이져→도장 구조 아닌 제품 제외
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) laserMap[key] = {
                carModel: w.carModel||'', partName: w.partName||'', color: w.color||'',
                laserQty: 0, paintBQty: 0, drainLine: drainMap[prodKey],
                laserDates: [], paintDates: [], injectionLots: []
            };
            if (w.isManualOut) {
                laserMap[key].paintBQty += Number(w.quantity) || 0;
            } else {
                // 검사 양품수 우선 사용, 검사 기록 없으면 작업수량 fallback
                const goodQty = (w.id && (w.id in inspGoodMap))
                    ? inspGoodMap[w.id]
                    : Number(w.quantity) || 0;
                laserMap[key].laserQty += goodQty;
                laserMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
                    w.paintLots.forEach(lot => {
                        laserMap[key].paintDates.push(lot && lot.paintDate ? lot.paintDate : '');
                        laserMap[key].injectionLots.push(lot && lot.lotNo ? lot.lotNo : '');
                    });
                } else {
                    laserMap[key].paintDates.push(w.paintDate || '');
                    laserMap[key].injectionLots.push(w.paintLot || w.lotNo || '');
                }
            }
        });

        paintWorks.forEach(w => {
            const prodKey   = `${w.carModel||''}||${w.partName||''}`;
            const drainLine = drainMap[prodKey];
            if (!drainLine) return;
            if ((w.line||'').trim() !== drainLine) return; // 해당 제품의 drain 공정과 일치하는 것만
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) return;
            laserMap[key].paintBQty += Number(w.productionQty) || 0;
        });

        return Object.values(laserMap)
            .map(r => ({ ...r, wip: r.laserQty - r.paintBQty }))
            .filter(r => r.laserQty > 0)
            .sort((a, b) => {
                const cm = (a.carModel||'').localeCompare(b.carModel||'');
                return cm !== 0 ? cm : (a.partName||'').localeCompare(b.partName||'');
            });
    }

    // ── 외부 공개 API ─────────────────────────────────────────────────────

    /**
     * 차종+품명+컬러 기준 레이져 후 재공 재고 조회
     * production-plan.js 도장-B 모달에서 호출용
     */
    function getWipStock(carModel, partName) {
        // 도장 컬러와 무관하게 차종+품명 기준으로 합산
        return _calcWip()
            .filter(r => {
                const cmOk = !carModel || r.carModel === carModel;
                const pnOk = !partName || r.partName === partName;
                return cmOk && pnOk;
            })
            .reduce((s, r) => s + Math.max(0, r.wip), 0);
    }

    function refresh() {
        _renderTabContent();
        UIUtils.toast('재공품 현황을 새로고침했습니다.', 'info');
    }

    function openManualInput() {
        if (!_canEditWip()) {
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        if (typeof LaserStandbyModule === 'undefined' || typeof LaserStandbyModule.openAdjustModal !== 'function') {
            UIUtils.toast('레이저 대기 재공품 추가 화면을 열 수 없습니다.', 'warning');
            return;
        }
        LaserStandbyModule.openAdjustModal('', true);
    }

    // ── 레이져 후 재공품 수기 등록 ──────────────────────────────────────

    function _getPaintBProducts() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => {
            const seq = ['process1','process2','process3','process4']
                .map(k => _normProc(p[k]||'')).filter(Boolean);
            const idx = seq.findIndex(v => v === '레이져');
            if (idx < 0 || idx === seq.length - 1) return false;
            const next = seq[idx + 1];
            return next === '도장-A' || next === '도장-B';
        });
    }

    function openAfterLaserInput(prefill) {
        const products  = _getPaintBProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 수기 등록', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">info</span>
                레이져 완료 수량을 수기로 등록합니다. 도장-B 공정이 있는 제품만 선택 가능합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwAfterDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwAfterCarModel" onchange="LaserWipModule.onAfterCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwAfterPartName" onchange="LaserWipModule.onAfterPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwAfterColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAfterQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwAfterNote" placeholder="수기등록">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAfterLaserInput()">등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwAfterCarModel', 'lwAfterPartName', 'lwAfterColor', onAfterCarChange, onAfterPartChange);
    }

    function onAfterCarChange() {
        const carModel  = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const products  = _getPaintBProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwAfterColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onAfterPartChange() {
        const carModel = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const products = _getPaintBProducts().filter(p =>
            (!carModel || p.carModel === carModel) && (!partName || p.partName === partName)
        );
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function saveAfterLaserInput() {
        const date     = (document.getElementById('lwAfterDate')     || {}).value || '';
        const carModel = (document.getElementById('lwAfterCarModel') || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const color    = (document.getElementById('lwAfterColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwAfterQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwAfterNote')     || {}).value.trim() || '수기등록';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, machine: '', note, isManual: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 수기 등록 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    // ── 레이져 후 재공품 출고 ───────────────────────────────────────────

    function openAfterLaserOut(prefill) {
        const rows      = _calcWip().filter(r => r.wip > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);display:flex;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:1rem;flex-shrink:0;">arrow_upward</span>
                레이져 완료 재공품을 도장-B 투입 전에 수동으로 출고 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwOutCarModel" onchange="LaserWipModule.onOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwOutPartName" onchange="LaserWipModule.onOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwOutNote" placeholder="수기 출고">
                </div>
            </div>
            <div id="lwOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);"
                onclick="LaserWipModule.saveAfterLaserOut()">출고 등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwOutCarModel', 'lwOutPartName', 'lwOutColor', onOutCarChange, onOutPartChange);
    }

    function onOutCarChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwOutColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        const info = document.getElementById('lwOutStockInfo');
        if (info) info.textContent = '';
    }

    function onOutPartChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors   = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
        const match = rows.find(r => r.partName === partName);
        const info  = document.getElementById('lwOutStockInfo');
        if (info && match) info.innerHTML = `현재 재공품: <strong style="color:var(--accent-purple);">${UIUtils.formatNumber(match.wip)} EA</strong>`;
    }

    async function saveAfterLaserOut() {
        const date     = (document.getElementById('lwOutDate')     || {}).value || '';
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const color    = (document.getElementById('lwOutColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwOutQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwOutNote')     || {}).value.trim() || '수기 출고';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName && (!color || r.color === color));
        if (wip && quantity > wip.wip) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 재공품(${wip.wip})을 초과합니다.`, 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, machine: '', note, isManual: true, isManualOut: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 출고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function init(container) {
        render(container);
    }

    function _activeTabId() { return _activeTab; }

    // 레이져 후 다음 공정이 도장(A/B)인 제품 여부 — laser.js에서 출하대기 유입 차단용
    function isAfterLaserDrainProduct(carModel, partName) {
        return !!_buildAfterLaserDrainMap()[`${carModel||''}||${partName||''}`];
    }

    return { init, render, refresh, switchTab, openTab, _activeTabId, isAfterLaserDrainProduct, openManualInput,
             openAfterLaserInput, onAfterCarChange, onAfterPartChange, saveAfterLaserInput,
             openAfterLaserOut, onOutCarChange, onOutPartChange, saveAfterLaserOut,
             openEditManualEntry, saveEditManualEntry, removeManualEntry,
             openResidualInput, onResidualInCarChange, onResidualInPartChange, saveResidualInput,
             openResidualOut, onResidualOutCarChange, onResidualOutPartChange, saveResidualOut,
             openEditResidualManualEntry, saveEditResidualManualEntry, removeResidualManualEntry,
             getWipStock, _calcWip, showWipDetail, showResidualDetail,
             adjustAfterLaserFromPopup, adjustResidualFromPopup };
})();
