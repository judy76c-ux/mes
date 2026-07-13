/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기)
 * - 탭 3: 레이져 후 잔량 현황   (포장단위 미달 잔량, 레이져→검사·출고 제품 / 도장-B 재공 3품목 제외)
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

    // onclick 인자용 — URI 인코딩은 1회만. 따옴표만 이스케이프한다.
    function _jsArg(value) {
        return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function _parseProductKey(keyEnc) {
        let s = String(keyEnc || '');
        for (let i = 0; i < 3; i++) {
            try {
                const d = decodeURIComponent(s);
                if (d === s) break;
                s = d;
            } catch (e) { break; }
        }
        const parts = s.split('||');
        return {
            carModel: (parts[0] || '').trim(),
            partName: (parts[1] || '').trim(),
            color: (parts[2] || '').trim()
        };
    }

    function _productKey(carModel, partName, color) {
        return encodeURIComponent(`${carModel || ''}||${partName || ''}||${color || ''}`);
    }

    function _decodeArg(value) {
        let s = String(value || '');
        for (let i = 0; i < 2; i++) {
            try {
                const d = decodeURIComponent(s);
                if (d === s) break;
                s = d;
            } catch (e) { break; }
        }
        return s;
    }

    function _isCorruptedLaserIdentity(w) {
        const cm = String(w && w.carModel || '');
        const pn = String(w && w.partName || '');
        if (!cm) return false;
        if (cm.indexOf('%7C%7C') >= 0) return true;
        if (cm.indexOf('||') >= 0 && !pn) return true;
        if ((cm.indexOf('%20') >= 0 || cm.indexOf('%5B') >= 0 || cm.indexOf('%5D') >= 0) && !pn) return true;
        return false;
    }

    async function _repairCorruptedLaserWorkRecords() {
        const all = Storage.getAll(STORE_LASER) || [];
        let repaired = 0;
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            if (!_isCorruptedLaserIdentity(w)) continue;
            const parsed = _parseProductKey(w.carModel);
            if (!parsed.carModel || !parsed.partName) continue;
            if (parsed.carModel === w.carModel && parsed.partName === w.partName && (parsed.color || '') === (w.color || '')) continue;
            try {
                await Storage.update(STORE_LASER, w.id, {
                    carModel: parsed.carModel,
                    partName: parsed.partName,
                    color: parsed.color || w.color || ''
                });
                repaired++;
            } catch (e) {
                console.warn('[LaserWip] repair failed:', w.id, e);
            }
        }
        if (repaired > 0) {
            console.info('[LaserWip] repaired corrupted laser work records:', repaired);
        }
        return repaired;
    }

    function _validateProductIdentity(carModel, partName, color) {
        if (!carModel || !partName) return false;
        if (carModel.indexOf('%7C') >= 0 || carModel.indexOf('||') >= 0) return false;
        if (partName.indexOf('%7C') >= 0 || partName.indexOf('||') >= 0) return false;
        return true;
    }

    // 도장 LOT(YYMMDD) / 사출 LOT 문자열 정규화 — 보정 저장·집계 키 일치용
    function _normalizePaintLot(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw || raw === '-') return '-';
        const s = raw.replace(/-/g, '');
        if (/^\d{6}$/.test(s)) return s;
        if (/^\d{8}$/.test(s)) return s.slice(2, 8);
        if (s.length > 8) return s.slice(2, 8);
        return s || raw;
    }

    function _normalizeInjLot(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s || s === '-') return '-';
        return s.split(',').map(function(p) { return p.trim(); }).filter(Boolean).join(', ');
    }

    function _residualLotKey(paintLot, injLot) {
        return _normalizePaintLot(paintLot) + '|' + _normalizeInjLot(injLot);
    }

    function _workResidualLotKeys(w) {
        const paintLots = Array.isArray(w.paintLots) && w.paintLots.length ? w.paintLots : [];
        const paintLot = paintLots.length && paintLots[0] && paintLots[0].paintDate
            ? _normalizePaintLot(paintLots[0].paintDate)
            : _normalizePaintLot(w.paintDate || w.date || '');
        const injLots = paintLots.length
            ? paintLots.map(function(l) { return _normalizeInjLot(l && l.lotNo || ''); }).filter(function(v) { return v && v !== '-'; })
            : [_normalizeInjLot(w.paintLot || w.lotNo || '')].filter(function(v) { return v && v !== '-'; });
        const injStr = injLots.length ? injLots.join(', ') : '-';
        return [_residualLotKey(paintLot, injStr)];
    }

    function _findResidualLotSourceWorks(carModel, partName, color, paintLot, injLot) {
        const targetKey = _residualLotKey(paintLot, injLot);
        return (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return false;
            if (color && (w.color || '') !== color) return false;
            if (w.isManualOut || w.isResidualManualIn || w.isResidualManualOut) return false;
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (resQty <= 0) return false;
            return _workResidualLotKeys(w).some(function(k) { return k === targetKey; });
        });
    }

    function _getResidualLotQtyFromDetail(detail, paintLot, injLot) {
        const key = _residualLotKey(paintLot, injLot);
        const row = (detail && detail.lots || []).find(function(l) {
            return _residualLotKey(l.paintLot, l.injLot) === key;
        });
        return row ? Math.max(0, Number(row.qty) || 0) : 0;
    }

    async function _neutralizePriorLotAdjustRecords(carModel, partName, color, paintLot, injLot) {
        const targetKey = _residualLotKey(paintLot, injLot);
        const items = Storage.getAll(STORE_LASER) || [];
        for (let i = 0; i < items.length; i++) {
            const w = items[i];
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) continue;
            if (color && (w.color || '') !== color) continue;
            if (!w.isResidualLotAdjust || w.isResidualAuditOnly) continue;
            if (_residualLotKey(w.residualPaintLot, w.lotNo) !== targetKey) continue;
            await Storage.update(STORE_LASER, w.id, { isResidualAuditOnly: true });
        }
    }

    // 수기 입/출고 모달을 열 때 팝업에서 넘어온 품목을 드롭다운에 자동 선택한다.
    // 제품 목록(잔량 대상)에 없는 품목이면 조용히 무시되고 수동 선택으로 진행 가능.
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

    // 재공/잔량 상세 팝업의 '수량 수정'(절대 수량 지정) — 관리자·레이져운영자만
    function openAdjustAfterLaserModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const r = (_calcWip()).find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.wip) || 0) : 0;
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 수량 수정', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 재공품 <strong style="color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(currentQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjAfterDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjAfterQty" value="${currentQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjAfterNote" placeholder="수량 수정">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
                입력한 수량과 현재 재고의 차이만큼 수동입고/출고로 반영됩니다.
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustAfterLaserModal('${_jsArg(keyEnc || '')}')">저장</button>
        `, 'md');
    }

    async function saveAdjustAfterLaserModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) { UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning'); return; }

        const r = (_calcWip()).find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.wip) || 0) : 0;
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjAfterQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjAfterDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjAfterNote') || {}).value || '').trim() || '수량 수정';
        const diff = targetQty - currentQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (diff > 0) {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: diff, machine: '', note,
                isManual: true
            });
        } else {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: Math.abs(diff), machine: '', note,
                isManual: true, isManualOut: true
            });
        }

        UIUtils.closeModal();
        UIUtils.toast(`재공품 수량이 ${UIUtils.formatNumber(currentQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
    }

    function openAdjustResidualModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const r = _calcLaserResidualWip().find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const packUnit = r ? Number(r.packUnit) || 0 : 0;
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 수량 수정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 잔량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(currentQty)} EA</strong>
                    ${packUnit ? `<span style="margin-left:8px;color:var(--text-muted);">포장단위 ${UIUtils.formatNumber(packUnit)}</span>` : ''}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjResDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 잔량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjResQty" value="${currentQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjResNote" placeholder="수량 수정">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
                입력한 잔량과 현재 잔량의 차이만큼 수동입고/출고로 반영됩니다.
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustResidualModal('${_jsArg(keyEnc || '')}')">저장</button>
        `, 'md');
    }

    async function saveAdjustResidualModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) { UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning'); return; }

        const r = _calcLaserResidualWip().find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const packUnit = r ? Number(r.packUnit) || 0 : 0;
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjResQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjResDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjResNote') || {}).value || '').trim() || '수량 수정';
        const diff = targetQty - currentQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (diff > 0) {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: diff, note, packUnit,
                isManual: true, isResidualManualIn: true
            });
        } else {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: Math.abs(diff), note, packUnit,
                isManual: true, isResidualManualOut: true
            });
        }

        UIUtils.closeModal();
        UIUtils.toast(`잔량이 ${UIUtils.formatNumber(currentQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
    }

    // 재공/잔량 상세 팝업의 '수량 수정'(수동입고/출고) 진입 — 관리자·레이져운영자만
    function adjustAfterLaserFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const prefill = _parseProductKey(keyEnc);
        if (mode === 'out') openAfterLaserOut(prefill); else openAfterLaserInput(prefill);
    }
    function adjustResidualFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const prefill = _parseProductKey(keyEnc);
        if (mode === 'out') openResidualOut(prefill); else openResidualInput(prefill);
    }

    const TABS = [
        { id: 'standby',     label: '레이져 대기품 현황',    icon: 'hourglass_top' },
        { id: 'after-laser', label: '레이져 후 재공품 현황', icon: 'bolt' },
        { id: 'after-laser-residual', label: '레이져 후 잔량 현황', icon: 'inventory_2' }
    ];
    const TAB_STATE_KEY = 'mes_laser_wip_tab';

    function _saveActiveTab() {
        try { sessionStorage.setItem(TAB_STATE_KEY, _activeTab); } catch (e) { /* 무시 */ }
    }

    function _restoreActiveTab() {
        try {
            const saved = sessionStorage.getItem(TAB_STATE_KEY);
            if (saved && TABS.some(function(t) { return t.id === saved; })) {
                _activeTab = saved;
            }
        } catch (e) { /* 무시 */ }
    }

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
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserStandbyModule.openStandbyOutModal()", 'var(--accent-red)')}` : '';
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
        _restoreActiveTab();
        const activePageId = _activeTab === 'standby' ? 'laser-wip-standby'
            : (_activeTab === 'after-laser' ? 'laser-wip-after' : 'laser-wip-residual');
        container.innerHTML = `
        <div class="fade-in-up">
            ${LaserProcessUI.renderSection(activePageId)}
            <div id="wipTabNav">${_tabNav()}</div>
            <div id="wipTabContent"></div>
        </div>`;
        _repairCorruptedLaserWorkRecords().finally(function() {
            _renderTabContent();
        });
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;
        _saveActiveTab();
        const container = document.getElementById('contentArea');
        if (container) { render(container); return; }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    function openTab(tab) {
        _activeTab = TABS.some(t => t.id === tab) ? tab : 'standby';
        _saveActiveTab();
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
                        const encKey = _productKey(r.carModel, r.partName, r.color || '');
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
                        const encKey = _productKey(r.carModel, r.partName, r.color || '');
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
                if (w.isResidualAuditOnly) return;
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

    // ── 상세 모달 공통 ───────────────────────────────────────────────────
    function _closeDetailPopup() {
        UIUtils.closeModal();
        const el = document.getElementById('lwDetailPopup');
        if (el) el.remove();
    }

    function _wipHistorySection(histItems) {
        return StockDetailUI.buildSimpleHistorySection(histItems);
    }

    function _openAfterLaserOutForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openAfterLaserOut({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openAfterLaserInForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openAfterLaserInput({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openResidualOutForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openResidualOut({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openResidualInForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openResidualInput({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _calcResidualLotDetail(carModel, partName, color) {
        const laserAllWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color);
        });

        const lotMap = {};
        laserAllWorks.filter(function(w) { return !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut; }).forEach(function(w) {
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (resQty <= 0) return;
            _workResidualLotKeys(w).forEach(function(key) {
                const pipeIdx = key.indexOf('|');
                const paintLot = pipeIdx >= 0 ? key.slice(0, pipeIdx) : key;
                const injLot = pipeIdx >= 0 ? key.slice(pipeIdx + 1) : '-';
                if (!lotMap[key]) lotMap[key] = { paintLot: paintLot, injLot: injLot, qty: 0 };
                lotMap[key].qty += resQty;
            });
        });

        var manualAdj = 0;
        laserAllWorks.filter(function(w) {
            return (w.isResidualManualIn || w.isResidualManualOut) && w.isResidualLotAdjust && w.residualLotAbsoluteQty == null;
        }).forEach(function(w) {
            if (w.isResidualAuditOnly) return;
            const qty = Number(w.quantity) || 0;
            const paintLot = _normalizePaintLot(w.residualPaintLot || w.paintDate || w.date || '-');
            const injLot = _normalizeInjLot(w.lotNo || '-');
            const key = _residualLotKey(paintLot, injLot);
            if (!lotMap[key]) lotMap[key] = { paintLot: paintLot, injLot: injLot, qty: 0 };
            lotMap[key].qty += w.isResidualManualIn ? qty : -qty;
        });
        laserAllWorks.filter(function(w) {
            return (w.isResidualManualIn || w.isResidualManualOut) && !w.isResidualLotAdjust;
        }).forEach(function(w) {
            if (w.isResidualAuditOnly) return;
            const qty = Number(w.quantity) || 0;
            manualAdj += w.isResidualManualIn ? qty : -qty;
        });

        // LOT별 절대 수량 보정(최신 건 우선) — 감사 전용 기록은 집계 제외
        laserAllWorks.filter(function(w) {
            return w.isResidualLotAdjust && w.residualLotAbsoluteQty != null && !w.isResidualAuditOnly;
        }).sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        }).forEach(function(w) {
            const paintLot = _normalizePaintLot(w.residualPaintLot || w.paintDate || w.date || '-');
            const injLot = _normalizeInjLot(w.lotNo || '-');
            const key = _residualLotKey(paintLot, injLot);
            if (!lotMap[key]) lotMap[key] = { paintLot: paintLot, injLot: injLot, qty: 0 };
            lotMap[key].qty = Math.max(0, Number(w.residualLotAbsoluteQty) || 0);
        });

        const lots = Object.values(lotMap)
            .map(function(l) { return { paintLot: l.paintLot, injLot: l.injLot, qty: Math.round(l.qty) }; })
            .filter(function(l) { return l.qty > 0; })
            .sort(function(a, b) { return String(a.paintLot || '').localeCompare(String(b.paintLot || '')) || String(a.injLot || '').localeCompare(String(b.injLot || '')); });

        return { lots: lots, manualAdj: manualAdj };
    }

    function openAdjustResidualLotModal(keyEnc, paintLotEnc, injLotEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const injLot = _decodeArg(injLotEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 LOT 보정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;margin-top:6px;">
                    도장 LOT <strong style="font-family:monospace;color:var(--accent-green);">${_esc(paintLot)}</strong>
                    · 사출 LOT <strong style="font-family:monospace;">${_esc(injLot)}</strong>
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 잔량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(curQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjResLotDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 잔량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjResLotQty" value="${curQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjResLotNote" placeholder="LOT 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustResidualLotModal('${_jsArg(keyEnc || '')}','${_jsArg(paintLotEnc || '')}','${_jsArg(injLotEnc || '')}',${curQty})">저장</button>
        `, 'md');
    }

    async function saveAdjustResidualLotModal(keyEnc, paintLotEnc, injLotEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _normalizePaintLot(_decodeArg(paintLotEnc));
        const injLot = _normalizeInjLot(_decodeArg(injLotEnc));
        const detail = _calcResidualLotDetail(carModel, partName, color);
        const curQty = _getResidualLotQtyFromDetail(detail, paintLot, injLot) || Math.max(0, Number(currentQty) || 0);
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjResLotQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjResLotDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjResLotNote') || {}).value || '').trim() || `LOT ${paintLot}/${injLot} 보정`;

        if (targetQty === curQty) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다. 목록에서 다시 시도해 주세요.', 'error');
            return;
        }

        const prod = _getResidualProducts().find(function(p) { return p.carModel === carModel && p.partName === partName && (!color || p.color === color); });
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;
        const diff = targetQty - curQty;
        const injParts = injLot.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        const sources = _findResidualLotSourceWorks(carModel, partName, color, paintLot, injLot);

        try {
            await _neutralizePriorLotAdjustRecords(carModel, partName, color, paintLot, injLot);
            if (sources.length === 1 && injParts.length <= 1) {
                await Storage.update(STORE_LASER, sources[0].id, {
                    laserResidualQty: targetQty,
                    laserResidualStatus: targetQty > 0 ? '잔량' : ''
                });
                await Storage.add(STORE_LASER, {
                    date, carModel, partName, color, lotNo: injLot, residualPaintLot: paintLot,
                    note, packUnit, isManual: true, isResidualLotAdjust: true,
                    residualLotAbsoluteQty: targetQty, isResidualAuditOnly: true,
                    quantity: Math.abs(diff),
                    isResidualManualIn: diff > 0,
                    isResidualManualOut: diff < 0
                });
            } else {
                const base = {
                    date, carModel, partName, color, lotNo: injLot, residualPaintLot: paintLot,
                    note, packUnit, isManual: true, isResidualLotAdjust: true,
                    residualLotAbsoluteQty: targetQty
                };
                if (diff > 0) {
                    await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: diff, isResidualManualIn: true }));
                } else {
                    await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: Math.abs(diff), isResidualManualOut: true }));
                }
            }
        } catch (err) {
            console.error('[LaserWip] saveAdjustResidualLotModal failed:', err);
            UIUtils.toast('LOT 보정 저장에 실패했습니다.', 'error');
            return;
        }

        UIUtils.closeModal();
        UIUtils.toast(`LOT ${paintLot}/${injLot} 잔량이 ${UIUtils.formatNumber(curQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
        setTimeout(function() { showResidualDetail(_productKey(carModel, partName, color)); }, 80);
    }

    function openAdjustAfterLaserLotModal(keyEnc, paintLotEnc, lotNoEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const lotNo = _decodeArg(lotNoEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 LOT 보정', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;margin-top:6px;">
                    도장 LOT <strong style="font-family:monospace;color:var(--accent-green);">${_esc(paintLot || '-')}</strong>
                    · 사출 LOT <strong style="font-family:monospace;">${_esc(lotNo)}</strong>
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 수량 <strong style="color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(curQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjWipLotDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjWipLotQty" value="${curQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjWipLotNote" placeholder="LOT 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustAfterLaserLotModal('${_jsArg(keyEnc || '')}','${_jsArg(paintLotEnc || '')}','${_jsArg(lotNoEnc || '')}',${curQty})">저장</button>
        `, 'md');
    }

    async function saveAdjustAfterLaserLotModal(keyEnc, paintLotEnc, lotNoEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const lotNo = _decodeArg(lotNoEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjWipLotQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjWipLotDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjWipLotNote') || {}).value || '').trim() || `LOT ${paintLot || '-'}/${lotNo} 보정`;
        const diff = targetQty - curQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다. 목록에서 다시 시도해 주세요.', 'error');
            return;
        }

        const paintLots = paintLot ? [{ paintDate: paintLot, lotNo: lotNo, qty: Math.abs(diff) }] : [];
        const base = {
            date, carModel, partName, color, lotNo: lotNo, paintLot: paintLot || '',
            paintLots: paintLots, machine: '', note, isManual: true, isWipLotAdjust: true
        };

        if (diff > 0) {
            await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: diff }));
        } else {
            await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: Math.abs(diff), isManualOut: true }));
        }

        UIUtils.closeModal();
        UIUtils.toast(`LOT ${lotNo} 수량이 ${UIUtils.formatNumber(curQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
        setTimeout(function() { showWipDetail(_productKey(carModel, partName, color)); }, 80);
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

        laserWorks.filter(function(w) {
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return false;
            if (color && (w.color || '') !== color) return false;
            return w.isWipLotAdjust;
        }).forEach(function(w) {
            const qty = Number(w.quantity) || 0;
            const lotNo = String(w.lotNo || '').trim() || '-';
            const paintLot = w.paintLot || (Array.isArray(w.paintLots) && w.paintLots[0] && w.paintLots[0].paintDate
                ? String(w.paintLots[0].paintDate).replace(/-/g, '').slice(2, 8) : '');
            if (!wipMap[lotNo]) wipMap[lotNo] = { lotNo: lotNo, paintLot: paintLot || '', balance: 0 };
            else if (!wipMap[lotNo].paintLot && paintLot) wipMap[lotNo].paintLot = paintLot;
            if (w.isManualOut) wipMap[lotNo].balance -= qty;
            else wipMap[lotNo].balance += qty;
        });

        return Object.values(wipMap)
            .map(function(l){ return { lotNo: l.lotNo, paintLot: l.paintLot||'', balance: Math.round(l.balance) }; })
            .sort(function(a,b){ return String(a.lotNo || '').localeCompare(String(b.lotNo || '')); });
    }

    // ── 레이져 후 재공품 상세 모달 ────────────────────────────────────────
    function showWipDetail(keyEnc, evt) {
        if (evt) evt.stopPropagation();

        const { carModel, partName, color } = _parseProductKey(keyEnc);

        const r = (_calcWip()).find(function(x) { return x.carModel === carModel && x.partName === partName && (x.color || '') === color; });
        if (!r) return;

        const lotRows = _calcWipLotDetail(carModel, partName, color);
        const visibleLots = lotRows.filter(function(l) { return l.balance > 0; });

        const laserWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color) && !w.isManualOut;
        });
        const drainMap = _buildAfterLaserDrainMap();
        const drainLine = drainMap[`${carModel}||${partName}`];
        const paintWorks = (Storage.getAll(STORE_PAINT) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!drainLine || (w.line || '').trim() === drainLine);
        });

        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const inspGoodMap = {};
        laserInsps.forEach(function(i) {
            if (i.workLogId) {
                const g = Math.max(0, (Number(i.inspQty) || 0) - (Number(i.failQty) || 0));
                inspGoodMap[i.workLogId] = (inspGoodMap[i.workLogId] || 0) + g;
            }
        });

        const histItems = [];
        laserWorks.forEach(function(w) {
            const goodQty = (w.id && (w.id in inspGoodMap)) ? inspGoodMap[w.id] : (Number(w.quantity) || 0);
            const lots = Array.isArray(w.paintLots) && w.paintLots.length
                ? w.paintLots.map(function(pl) { return (pl && pl.lotNo) || ''; }).filter(Boolean).join(', ')
                : (w.paintLot || w.lotNo || '-');
            histItems.push({
                date: w.date || '-',
                isOut: false,
                routeLabel: '레이저 입고',
                routeColor: '#7c3aed',
                routeDetail: w.machine || '레이저 작업',
                lot: lots,
                qty: goodQty,
                note: w.note || w.machine || '-'
            });
        });
        paintWorks.forEach(function(w) {
            const qty = Number(w.productionQty) || 0;
            const wLots = Array.isArray(w.lots) && w.lots.length
                ? w.lots.map(function(l) { return l && l.lotNo || ''; }).filter(Boolean).join(', ')
                : (w.lotNo || '-');
            histItems.push({
                date: w.date || '-',
                isOut: true,
                routeLabel: '도장-B 출고',
                routeColor: '#2563eb',
                routeDetail: w.line || '도장-B 투입',
                lot: wLots,
                qty: qty,
                note: w.note || '-'
            });
        });
        histItems.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });

        const _cmJs = String(carModel || '').replace(/'/g, "\\'");
        const _pnJs = String(partName || '').replace(/'/g, "\\'");
        const _clJs = String(color || '').replace(/'/g, "\\'");
        const _keyJs = _productKey(carModel, partName, color);
        const canEdit = _canEditWip();

        const lotRowsHtml = visibleLots.map(function(l) {
            const _plJs = encodeURIComponent(l.paintLot || '');
            const _lnJs = encodeURIComponent(l.lotNo || '');
            return `<tr>
                <td style="font-family:monospace;color:var(--accent-green);">${_esc(l.paintLot || '-')}</td>
                <td style="font-family:monospace;">${_esc(l.lotNo)}</td>
                <td style="text-align:right;color:var(--accent-purple,#7c3aed);font-weight:600;">${UIUtils.formatNumber(l.balance)}</td>
                ${canEdit ? `<td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserWipModule.openAdjustAfterLaserLotModal('${_jsArg(_keyJs)}','${_plJs}','${_lnJs}',${Number(l.balance) || 0}),80);">
                        보정 수정
                    </button>
                </td>` : ''}
            </tr>`;
        }).join('');

        const historySection = _wipHistorySection(histItems);

        UIUtils.showModal(
            `⚡ ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${_esc(carModel)}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${_esc(partName)}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${_esc(color)}</span>` : ''}
                ${canEdit ? `
                <div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                        onclick="LaserWipModule._openAfterLaserInForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 입고
                    </button>
                    <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                        onclick="LaserWipModule._openAfterLaserOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 출고
                    </button>
                </div>` : ''}
            </div>
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(Math.max(0, r.wip))}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">현재 재공 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(r.laserQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">입고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-red);">${UIUtils.formatNumber(r.paintBQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${visibleLots.length}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">보유 LOT 수</div>
                </div>
            </div>
            ${StockDetailUI.buildLotTableSection({
                headers: canEdit ? ['도장 LOT', '사출 LOT', '현재 수량', ''] : ['도장 LOT', '사출 LOT', '현재 수량'],
                colSpan: canEdit ? 4 : 3,
                rowsHtml: lotRowsHtml
            })}
            ${historySection}
            `,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'lg'
        );
    }

    // ── 레이져 잔량 상세 모달 ─────────────────────────────────────────────
    function showResidualDetail(keyEnc, evt) {
        if (evt) evt.stopPropagation();

        const { carModel, partName, color } = _parseProductKey(keyEnc);

        const r = _calcLaserResidualWip().find(function(x) { return x.carModel === carModel && x.partName === partName && (x.color || '') === color; });
        if (!r) return;

        const laserAllWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color);
        });

        const { lots: lotEntries, manualAdj } = _calcResidualLotDetail(carModel, partName, color);

        const histItems = [];
        laserAllWorks.filter(function(w) { return !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut; }).forEach(function(w) {
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const residualQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (residualQty <= 0) return;
            const lots = Array.isArray(w.paintLots) && w.paintLots.length
                ? w.paintLots.map(function(pl) { return pl && pl.lotNo || ''; }).filter(Boolean).join(', ')
                : (w.paintLot || w.lotNo || '-');
            histItems.push({
                date: w.date || '-',
                isOut: false,
                routeLabel: '잔량 발생',
                routeColor: '#f59e0b',
                routeDetail: w.machine || '레이저 작업',
                lot: lots,
                qty: residualQty,
                note: w.note || w.machine || '-'
            });
        });
        laserAllWorks.filter(function(w) { return w.isResidualManualIn || w.isResidualManualOut; }).forEach(function(w) {
            const qty = Number(w.quantity) || 0;
            const isIn = w.isResidualManualIn;
            const isLotAdjust = !!w.isResidualLotAdjust;
            histItems.push({
                date: w.date || '-',
                isOut: !isIn,
                routeLabel: isLotAdjust ? 'LOT 보정' : (isIn ? '수기 입고' : '수기 출고'),
                routeColor: isLotAdjust ? '#2563eb' : (isIn ? '#16a34a' : '#dc2626'),
                routeDetail: isLotAdjust
                    ? ((w.residualPaintLot ? w.residualPaintLot + ' / ' : '') + (w.lotNo || ''))
                    : (isIn ? '잔량 수기 입고' : '잔량 수기 출고'),
                lot: w.lotNo || w.note || '-',
                qty: qty,
                note: w.note || '-'
            });
        });
        histItems.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });

        const _cmJs = String(carModel || '').replace(/'/g, "\\'");
        const _pnJs = String(partName || '').replace(/'/g, "\\'");
        const _clJs = String(color || '').replace(/'/g, "\\'");
        const _keyJs = _productKey(carModel, partName, color);
        const canEdit = _canEditWip();

        const lotRowsHtml = lotEntries.map(function(e) {
            const _plJs = encodeURIComponent(e.paintLot || '');
            const _ilJs = encodeURIComponent(e.injLot || '');
            return `<tr>
                <td style="font-family:monospace;color:var(--accent-green);">${_esc(e.paintLot)}</td>
                <td style="font-family:monospace;">${_esc(e.injLot)}</td>
                <td style="text-align:right;color:var(--accent-orange,#f59e0b);font-weight:600;">${UIUtils.formatNumber(e.qty)}</td>
                ${canEdit ? `<td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserWipModule.openAdjustResidualLotModal('${_jsArg(_keyJs)}','${_plJs}','${_ilJs}',${Number(e.qty) || 0}),80);">
                        보정 수정
                    </button>
                </td>` : ''}
            </tr>`;
        }).join('') + (manualAdj !== 0 ? `<tr style="border-top:1px dashed var(--border-color);">
                <td colspan="${canEdit ? 3 : 2}" style="font-size:0.82rem;color:var(--text-muted);">품목 수기 조정</td>
                <td style="text-align:right;font-weight:600;color:${manualAdj > 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${manualAdj > 0 ? '+' : ''}${UIUtils.formatNumber(manualAdj)}</td>
                ${canEdit ? '<td></td>' : ''}
            </tr>` : '');

        const historySection = _wipHistorySection(histItems);

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${_esc(carModel)}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${_esc(partName)}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${_esc(color)}</span>` : ''}
                ${canEdit ? `
                <div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                        onclick="LaserWipModule._openResidualInForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 입고
                    </button>
                    <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                        onclick="LaserWipModule._openResidualOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 출고
                    </button>
                </div>` : ''}
            </div>
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(r.residualQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">현재 잔량 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출하가능 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">포장단위 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${lotEntries.length}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">LOT 항목 수</div>
                </div>
            </div>
            ${StockDetailUI.buildLotTableSection({
                title: '현재 보관 LOT',
                headers: canEdit ? ['도장 LOT', '사출 LOT', '잔량 (EA)', ''] : ['도장 LOT', '사출 LOT', '잔량 (EA)'],
                colSpan: canEdit ? 4 : 3,
                emptyText: 'LOT 정보가 없습니다.',
                rowsHtml: lotRowsHtml
            })}
            ${historySection}
            `,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'lg'
        );
    }

    function _num(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _laserResidualRow(r) {
        const encKey = _productKey(r.carModel || '', r.partName || '', r.color || '');
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
        const encKey = _productKey(r.carModel || '', r.partName || '', r.color || '');
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

    function _productProcessSeq(p) {
        return ['process1', 'process2', 'process3', 'process4']
            .map(k => _normProc(p[k] || ''))
            .filter(Boolean);
    }

    function _hasLaserProcess(p) {
        return _productProcessSeq(p).includes('레이져');
    }

    function _getProcessAfterLaser(p) {
        const seq = _productProcessSeq(p);
        const idx = seq.findIndex(v => v === '레이져');
        if (idx < 0 || idx === seq.length - 1) return '';
        return seq[idx + 1];
    }

    // 레이져 후 재공품(도장-B 투입 대기): T1xx LENS / T1xx PARK / P702 Lens 등
    function _isAfterLaserWipProduct(p) {
        return _getProcessAfterLaser(p) === '도장-B';
    }

    // 레이져 잔량 대상: 제조공정에 레이져 포함, 레이져→도장-B 재공품은 제외(검사·출고 흐름)
    function _getResidualProducts() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p =>
            _hasLaserProcess(p) && !_isAfterLaserWipProduct(p)
        );
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
        _repairCorruptedLaserWorkRecords().then(function(repaired) {
            _renderTabContent();
            if (repaired > 0) {
                UIUtils.toast('손상된 레이저 기록 ' + repaired + '건을 자동 복구했습니다.', 'success');
            } else {
                UIUtils.toast('재공품 현황을 새로고침했습니다.', 'info');
            }
        });
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
            const next = _getProcessAfterLaser(p);
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
                    <label class="form-label">사출 LOT</label>
                    <input type="text" class="form-input" id="lwAfterInjectionLot" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 작업일</label>
                    <input type="text" class="form-input" id="lwAfterPaintDate" readonly style="background:var(--bg-secondary);cursor:default;">
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

        // LOT 필드 초기화
        const injLotEl = document.getElementById('lwAfterInjectionLot');
        const paintDateEl = document.getElementById('lwAfterPaintDate');
        if (injLotEl) injLotEl.value = '';
        if (paintDateEl) paintDateEl.value = '';
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

        // 선택한 제품의 기존 LOT 정보 표시
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName);
        const injLotEl = document.getElementById('lwAfterInjectionLot');
        const paintDateEl = document.getElementById('lwAfterPaintDate');
        if (wip) {
            const injLots = (Array.isArray(wip.injectionLots) ? wip.injectionLots : []).filter(Boolean);
            const paintDates = (Array.isArray(wip.paintDates) ? wip.paintDates : []).filter(Boolean);
            if (injLotEl) injLotEl.value = injLots.length > 0 ? injLots.join(', ') : '-';
            if (paintDateEl) paintDateEl.value = paintDates.length > 0 ? paintDates.join(', ') : '-';
        } else {
            if (injLotEl) injLotEl.value = '-';
            if (paintDateEl) paintDateEl.value = '-';
        }
    }

    async function saveAfterLaserInput() {
        const date     = (document.getElementById('lwAfterDate')     || {}).value || '';
        const carModel = (document.getElementById('lwAfterCarModel') || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const color    = (document.getElementById('lwAfterColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwAfterQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwAfterNote')     || {}).value.trim() || '수기등록';
        const injectionLot = ((document.getElementById('lwAfterInjectionLot') || {}).value || '').trim();
        const paintDate = ((document.getElementById('lwAfterPaintDate') || {}).value || '').trim();

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        const record = { date, carModel, partName, color, quantity, machine: '', note, isManual: true };
        if (injectionLot && injectionLot !== '-') record.lotNo = injectionLot;
        if (paintDate && paintDate !== '-') record.paintDate = paintDate;

        await Storage.add(STORE_LASER, record);
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
                    <label class="form-label">사출 LOT</label>
                    <input type="text" class="form-input" id="lwOutInjectionLot" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 작업일</label>
                    <input type="text" class="form-input" id="lwOutPaintDate" readonly style="background:var(--bg-secondary);cursor:default;">
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

        // LOT 필드 초기화
        const injLotEl = document.getElementById('lwOutInjectionLot');
        const paintDateEl = document.getElementById('lwOutPaintDate');
        if (injLotEl) injLotEl.value = '';
        if (paintDateEl) paintDateEl.value = '';
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

        // 선택한 제품의 기존 LOT 정보 표시
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName);
        const injLotEl = document.getElementById('lwOutInjectionLot');
        const paintDateEl = document.getElementById('lwOutPaintDate');
        if (wip) {
            const injLots = (Array.isArray(wip.injectionLots) ? wip.injectionLots : []).filter(Boolean);
            const paintDates = (Array.isArray(wip.paintDates) ? wip.paintDates : []).filter(Boolean);
            if (injLotEl) injLotEl.value = injLots.length > 0 ? injLots.join(', ') : '-';
            if (paintDateEl) paintDateEl.value = paintDates.length > 0 ? paintDates.join(', ') : '-';
        } else {
            if (injLotEl) injLotEl.value = '-';
            if (paintDateEl) paintDateEl.value = '-';
        }
    }

    async function saveAfterLaserOut() {
        const date     = (document.getElementById('lwOutDate')     || {}).value || '';
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const color    = (document.getElementById('lwOutColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwOutQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwOutNote')     || {}).value.trim() || '수기 출고';
        const injectionLot = ((document.getElementById('lwOutInjectionLot') || {}).value || '').trim();
        const paintDate = ((document.getElementById('lwOutPaintDate') || {}).value || '').trim();

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName && (!color || r.color === color));
        if (wip && quantity > wip.wip) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 재공품(${wip.wip})을 초과합니다.`, 'warning');
            return;
        }

        const record = { date, carModel, partName, color, quantity, machine: '', note, isManual: true, isManualOut: true };
        if (injectionLot && injectionLot !== '-') record.lotNo = injectionLot;
        if (paintDate && paintDate !== '-') record.paintDate = paintDate;

        await Storage.add(STORE_LASER, record);
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

    function getResidualQty(carModel, partName, color) {
        const rows = _calcLaserResidualWip();
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        const clr = String(color || '').trim();
        // 1) 차종+품명+컬러 정확 매칭
        let match = rows.find(r =>
            String(r.carModel || '').trim() === car &&
            String(r.partName || '').trim() === part &&
            String(r.color || '').trim() === clr
        );
        // 2) 컬러 없으면 차종+품명 합산
        if (!match && !clr) {
            const same = rows.filter(r =>
                String(r.carModel || '').trim() === car &&
                String(r.partName || '').trim() === part
            );
            if (same.length) {
                return same.reduce((s, r) => s + (Number(r.residualQty) || 0), 0);
            }
        }
        // 3) 컬러 불일치 시 차종+품명 폴백 (도장 컬러 vs 제품 컬러 표기 차이)
        if (!match) {
            const same = rows.filter(r =>
                String(r.carModel || '').trim() === car &&
                String(r.partName || '').trim() === part
            );
            if (same.length === 1) match = same[0];
            else if (same.length > 1 && clr) {
                match = same.find(r => String(r.color || '').trim() === clr) || null;
            }
        }
        return match ? Math.max(0, Number(match.residualQty) || 0) : 0;
    }

    return { init, render, refresh, switchTab, openTab, _activeTabId, isAfterLaserDrainProduct, openManualInput,
             openAfterLaserInput, onAfterCarChange, onAfterPartChange, saveAfterLaserInput,
             openAfterLaserOut, onOutCarChange, onOutPartChange, saveAfterLaserOut,
             openEditManualEntry, saveEditManualEntry, removeManualEntry,
             openResidualInput, onResidualInCarChange, onResidualInPartChange, saveResidualInput,
             openResidualOut, onResidualOutCarChange, onResidualOutPartChange, saveResidualOut,
             openEditResidualManualEntry, saveEditResidualManualEntry, removeResidualManualEntry,
             getWipStock, _calcWip, showWipDetail, showResidualDetail,
             getResidualQty, _calcLaserResidualWip,
             adjustAfterLaserFromPopup, adjustResidualFromPopup,
             openAdjustAfterLaserModal, saveAdjustAfterLaserModal,
             openAdjustResidualModal, saveAdjustResidualModal,
             openAdjustAfterLaserLotModal, saveAdjustAfterLaserLotModal,
             openAdjustResidualLotModal, saveAdjustResidualLotModal,
             _openAfterLaserOutForPart, _openAfterLaserInForPart,
             _openResidualOutForPart, _openResidualInForPart };
})();
