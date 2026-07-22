/**
 * 레이져 공정 모듈 (작업일지 및 검사일지)
 */

var LaserWorkModule = (function() {
    const STORE = DB.STORES.LASER_WORK_LOG;
    const MACHINES = ['1호기', '2호기', '3호기'];
    let _standbyItems = []; // 레이저 대기품 캐시 (모달 열 때 갱신)
    let _selectedLots = []; // 다중 도장LOT (내부 저장용, 대기품 선택 시 자동 채움)
    let _selectedCarModel = '';
    let _selectedPartName = '';
    let _selectedColor = '';
    let _externalWorkers = [];
    let _qcPhotos = { First: null, Middle: null, Last: null }; // { name, url }

    // background cache warm → 레이져 작업 화면 1회 재렌더 (뒤늦게 로드되는 스토어 반영)
    let _cacheWarmUnsub = null;
    let _cacheWarmRefreshTimer = null;
    function _bindCacheWarmRefreshOnce() {
        if (typeof Storage === 'undefined' || typeof Storage.onCacheWarm !== 'function') return;
        if (_cacheWarmUnsub) return;

        const watch = new Set([
            DB.STORES.PRODUCTS,
            DB.STORES.PAINTING_WORK,
            DB.STORES.LASER_WORK_LOG
        ].filter(Boolean));

        _cacheWarmUnsub = Storage.onCacheWarm(function(storeName) {
            // 현재 화면이 레이져 작업일지일 때만 (컨테이너 존재로 판단)
            if (!document.getElementById('lwInProgressTableBody')) return;
            if (storeName !== '*' && !watch.has(storeName)) return;

            // 과도한 리렌더 방지: 디바운스 (마지막 워밍 이벤트 기준)
            clearTimeout(_cacheWarmRefreshTimer);
            _cacheWarmRefreshTimer = setTimeout(function() {
                _cacheWarmRefreshTimer = null;
                try { search(); } catch (e) {}
            }, 250);
        });
    }

    // ── 관리자 통보 헬퍼 (painting.js와 동일 패턴) ──────────────────────
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
        const users = _getNotifyUsersByRole();
        if (!users.length) {
            return '<div style="margin-top:8px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 통보 대상 사용자가 없습니다.</div>';
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
        return '<div style="margin-top:8px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:10px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
            '<div style="font-size:0.8rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="LaserWorkModule.toggleNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">' + helpText + '</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:12px;max-height:180px;overflow:auto;">' + roleBlocks + '</div>' +
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

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getLaserWorkerOptions() {
        const users = (typeof AuthModule !== 'undefined' && typeof AuthModule.getUsers === 'function')
            ? (AuthModule.getUsers() || [])
            : [];
        const roleKeys = new Set(['laser_op', 'laser_inspector']);
        const registered = users
            .filter(user => {
                if (!user || user.active === false) return false;
                const keys = Array.isArray(user.roles) ? user.roles : [user.role];
                return keys.some(key => roleKeys.has(String(key || '')));
            })
            .map(user => user.displayName || user.username || user.id)
            .filter(Boolean);
        return [...new Set([...registered, ..._externalWorkers])].sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _workerSelect(id, label, selectedValue, required = true) {
        const options = [...new Set([..._getLaserWorkerOptions(), selectedValue].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return `
            <div class="form-group">
                <label class="form-label">${label}${required ? ' <span style="color:var(--accent-red)">*</span>' : ''}</label>
                <select class="form-select" id="${id}">
                    <option value="">-- 작업자 선택 --</option>
                    ${options.map(name => `<option value="${_esc(name)}" ${name === selectedValue ? 'selected' : ''}>${_esc(name)}</option>`).join('')}
                </select>
            </div>`;
    }

    function _splitDateParts(dateValue, timeValue = '') {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return null;
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) {
            return { year: '', monthDay: rawDate || '-', time: timeMatch ? timeMatch[1] : '' };
        }
        return {
            year: dateMatch[1],
            monthDay: `${dateMatch[2]}-${dateMatch[3]}`,
            time: timeMatch ? timeMatch[1] : ''
        };
    }

    function _workDateCell(dateValue, timeValue = '') {
        const parts = _splitDateParts(dateValue, timeValue);
        if (!parts) return '<span style="color:var(--text-muted);">-</span>';
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.05;min-width:56px;">
                ${parts.year ? `<span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${parts.year}</span>` : ''}
                <strong style="font-size:0.92rem;color:var(--text-primary);letter-spacing:0;">${parts.monthDay}</strong>
                ${parts.time ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${parts.time}</span>` : ''}
            </div>`;
    }

    function _paintDateCell(row) {
        const lots = Array.isArray(row.paintLots) && row.paintLots.length > 0
            ? row.paintLots.map(lot => lot && lot.paintDate).filter(Boolean)
            : [row.paintDate].filter(Boolean);
        const uniqueDates = [...new Set(lots)];
        if (uniqueDates.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return `
            <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start;">
                ${uniqueDates.map(date => _workDateCell(date, '')).join('')}
            </div>`;
    }

    function _lotKey(carModel, partName, color, paintDate, lotNo) {
        return [
            carModel || '',
            partName || '',
            color || '',
            paintDate || '',
            lotNo || ''
        ].join('||');
    }

    function _workLots(work) {
        const rawLots = Array.isArray(work.lots) && work.lots.length > 0
            ? work.lots
            : (work.lotNo ? [{ lotNo: work.lotNo, qty: Number(work.productionQty) || 0 }] : []);
        const fallbackQty = Number(work.productionQty) || 0;
        if (!rawLots.length) return [{ lotNo: '', qty: fallbackQty }];
        const sumQty = rawLots.reduce((sum, lot) => sum + (Number(lot && lot.qty) || 0), 0);
        return rawLots.map(lot => ({
            lotNo: lot && lot.lotNo ? String(lot.lotNo) : '',
            qty: Number(lot && lot.qty) || (rawLots.length === 1 ? fallbackQty : 0)
        })).filter(lot => lot.qty > 0 || lot.lotNo);
    }

    function _selectedLotQtyTotal() {
        return _selectedLots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
    }

    function _mergeLots(lots) {
        const map = {};
        (lots || []).forEach(lot => {
            const paintDate = lot && lot.paintDate ? lot.paintDate : '';
            const lotNo = lot && lot.lotNo ? lot.lotNo : '';
            const key = `${paintDate}||${lotNo}`;
            if (!map[key]) map[key] = { paintDate, lotNo, qty: 0, manual: !!(lot && lot.manual) };
            if (lot && lot.manual) map[key].manual = true;
            map[key].qty += Number(lot && lot.qty) || 0;
        });
        return Object.values(map).filter(lot => lot.paintDate || lot.lotNo || lot.qty > 0);
    }

    function _isAdminUser() {
        try {
            const user = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
            const roles = Array.isArray(user && user.roles) ? user.roles : [user && user.role];
            return roles.some(role => String(role || '') === 'admin');
        } catch (e) {
            return false;
        }
    }

    function _canWriteLaserWork() {
        try {
            if (_isAdminUser()) return true;
            return typeof AuthModule !== 'undefined' &&
                typeof AuthModule.canWritePage === 'function' &&
                AuthModule.canWritePage('laser-work');
        } catch (e) { /* 무시 */ }
        return false;
    }

    function _normalizeFlowKey(value) {
        return String(value || '').trim().replace(/\s+/g, '').replace(/[-_]/g, '');
    }

    function _normalizeLookupText(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[\[\]\(\)\{\}_-]/g, '');
    }

    function _lookupTokens(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[\[\]\(\)\{\}_\-\/]/g, ' ')
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2);
    }

    function _isLaserProcessName(value) {
        const key = _normalizeFlowKey(value);
        const lower = String(value || '').trim().toLowerCase();
        return key === '레이저' || key === '레이져' || lower.includes('laser');
    }

    // 제품 공정(process1~4)에 도장 공정이 포함되는지 검사 (사출→레이저 직결 품목은 도장 LOT가 없음)
    function _hasPaintingProcess(prod) {
        if (!prod) return true; // 제품 미확인 시 기존 동작 유지(도장LOT 필수)
        return [prod.process1, prod.process2, prod.process3, prod.process4].some(v => {
            const s = String(v || '').replace(/\s+/g, '');
            return s.includes('도장') || s.toUpperCase().includes('PAINT');
        });
    }

    function _firstFilled(obj, keys) {
        for (const key of keys) {
            const value = obj && obj[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
    }

    function _productCarName(prod) {
        return _firstFilled(prod, ['carModel', 'model', 'vehicleModel', 'car']);
    }

    function _productPartName(prod) {
        return _firstFilled(prod, ['partName', 'productName', 'itemName', 'name']);
    }

    function _productColorName(prod) {
        return _firstFilled(prod, ['color', 'colorName', 'paintColor']);
    }

    function _hasLaserProcess(prod) {
        if (!prod) return false;
        return [prod.process1, prod.process2, prod.process3, prod.process4]
            .some(_isLaserProcessName);
    }

    function _getLaserProcessSpec(prod) {
        if (!prod) return null;
        for (let i = 1; i <= 4; i++) {
            const proc = _firstFilled(prod, [`process${i}`, `proc${i}`]);
            if (_isLaserProcessName(proc)) {
                const ct = _firstFilled(prod, [`ct${i}`, `cTime${i}`, `ctime${i}`, `cycleTime${i}`, `cycle${i}`, `C_TIME${i}`]);
                const cvt = _firstFilled(prod, [`cvt${i}`, `CVT${i}`, `Cvt${i}`]);
                return { ct, cvt, cycleSec: ct || cvt || '', processIndex: i };
            }
        }
        return null;
    }

    function _productNameValues(prod) {
        return [
            _productPartName(prod),
            prod && prod.displayName,
            prod && prod.code
        ].filter(Boolean);
    }

    function _nameMatchScore(inputName, prod) {
        const inputKey = _normalizeLookupText(inputName);
        if (!inputKey) return 0;
        const inputTokens = _lookupTokens(inputName);
        let best = 0;
        _productNameValues(prod).forEach(name => {
            const nameKey = _normalizeLookupText(name);
            if (!nameKey) return;
            if (nameKey === inputKey) best = Math.max(best, 100);
            if (nameKey.includes(inputKey) || inputKey.includes(nameKey)) best = Math.max(best, 70);
            const nameTokens = _lookupTokens(name);
            const matched = nameTokens.reduce((sum, token) => {
                return sum + (inputTokens.some(t => t === token || t.includes(token) || token.includes(t)) ? 1 : 0);
            }, 0);
            if (matched > 0) best = Math.max(best, Math.min(65, matched * 18));
        });
        return best;
    }

    function _colorMatchScore(inputColor, prod) {
        const colorKey = _normalizeLookupText(inputColor);
        if (!colorKey) return 0;
        const prodKey = _normalizeLookupText(_productColorName(prod));
        if (!prodKey) return 0;
        if (prodKey === colorKey) return 30;
        if (prodKey.includes(colorKey) || colorKey.includes(prodKey)) return 18;
        const colorTokens = _lookupTokens(inputColor);
        const prodTokens = _lookupTokens(_productColorName(prod));
        return prodTokens.some(token => colorTokens.some(t => t === token || t.includes(token) || token.includes(t))) ? 10 : -8;
    }

    function _findProductForWork(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const carKey = _normalizeLookupText(carModel);
        const scored = new Map();

        function addCandidate(prod, baseScore) {
            if (!prod) return;
            const candidateKey = prod.id || `${_productCarName(prod)}||${_productPartName(prod)}||${_productColorName(prod)}`;
            const spec = _getLaserProcessSpec(prod);
            let score = baseScore;
            if (_hasLaserProcess(prod)) score += 35;
            if (spec && (spec.ct || spec.cvt)) score += 45;
            const current = scored.get(candidateKey);
            if (!current || score > current.score) scored.set(candidateKey, { product: prod, score });
        }

        products.forEach(prod => {
            if (carKey && _normalizeLookupText(_productCarName(prod)) !== carKey) return;
            const nameScore = _nameMatchScore(partName, prod);
            if (partName && nameScore <= 0) return;
            const baseScore = 100 + nameScore + _colorMatchScore(color, prod);
            addCandidate(prod, baseScore);

            const linked = products.filter(other =>
                other && prod && (
                    (prod.linkedProductId && other.id === prod.linkedProductId) ||
                    (other.linkedProductId && prod.id && other.linkedProductId === prod.id)
                ) &&
                (!carKey || _normalizeLookupText(_productCarName(other)) === carKey)
            );
            linked.forEach(other => addCandidate(other, baseScore - 20));
        });

        const candidates = [...scored.values()].sort((a, b) => b.score - a.score);
        return candidates[0] && candidates[0].score >= 120 ? candidates[0].product : null;
    }

    function _getLaserCycleSpec(carModel, partName, color) {
        const prod = _findProductForWork(carModel, partName, color);
        if (!prod) return { ct: '', cvt: '', cycleSec: '', packUnit: '', foundProduct: false, foundProcess: false };
        const packUnit = _firstFilled(prod, ['packUnit', 'packingUnit', 'packageUnit', 'packQty', 'packingQty']);
        const spec = _getLaserProcessSpec(prod);
        if (spec) return { ...spec, packUnit, foundProduct: true, foundProcess: true };
        return { ct: '', cvt: '', cycleSec: '', packUnit, foundProduct: true, foundProcess: false };
    }

    function _toNumber(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _splitFullBoxQty(qty, packUnit) {
        const total = Math.max(0, _toNumber(qty));
        const unit = _toNumber(packUnit);
        if (unit <= 0) return { packUnit: 0, fullBoxQty: total, residualQty: 0, boxCount: 0 };
        const boxCount = Math.floor(total / unit);
        const fullBoxQty = boxCount * unit;
        return { packUnit: unit, fullBoxQty, residualQty: total - fullBoxQty, boxCount };
    }

    function _fmtLaserMinutes(min) {
        const n = Number(min) || 0;
        if (n <= 0) return '00 min';
        if (n < 10) return `${n.toFixed(1)} min`;
        return `${Math.round(n)} min`;
    }

    // 완료시간 예상치는 제품기초 CT가 아니라, 실제 입력된 각인 시간(프로그램 기록값)을 CT로 사용한다.
    function _effectiveEngravingCt(spec) {
        const liveInput = document.getElementById('lwEngravingTime');
        const live = liveInput ? Number(liveInput.value) || 0 : 0;
        return live > 0 ? live : (Number(spec && spec.ct) || 0);
    }

    function _laserEstimateMinutes(spec) {
        const ct = _effectiveEngravingCt(spec);
        const cvt = Number(spec && spec.cvt) || 0;
        const qtyInput = document.getElementById('lwQuantity');
        const qtyValue = qtyInput && String(qtyInput.value || '').trim() !== '' ? Number(qtyInput.value) : 0;
        const qty = qtyValue || _selectedLotQtyTotal();
        if (ct <= 0 || cvt <= 0 || qty <= 0) return 0;
        return (qty / cvt) * ct / 60;
    }

    function _timeToMinutes(value) {
        const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        return Number(m[1]) * 60 + Number(m[2]);
    }

    function _minutesToTime(total) {
        const mins = ((Math.round(Number(total) || 0) % 1440) + 1440) % 1440;
        const h = String(Math.floor(mins / 60)).padStart(2, '0');
        const m = String(mins % 60).padStart(2, '0');
        return `${h}:${m}`;
    }

    function _fmtProgramDateYYMMDD(dateValue) {
        const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return '';
        return `${match[1].slice(2)}${match[2]}${match[3]}`;
    }

    function _laserProgramGuideName(partName, dateValue) {
        const name = String(partName || '').trim();
        const ymd = _fmtProgramDateYYMMDD(dateValue);
        if (!name && !ymd) return '품명+작업일날짜(YYMMDD)';
        return `${name || '품명'}-${ymd || 'YYMMDD'}`;
    }

    function updateLaserGuideChecks() {
        const partName = _selectedPartName || _inputValue('lwPartName') || _inputValue('lwSbPart') || '';
        const dateValue = _inputValue('lwDate');
        const programGuide = _laserProgramGuideName(partName, dateValue);
        const guideEl = document.getElementById('lwProgramGuideName');
        const hiddenProgramEl = document.getElementById('lwProgramName');
        const hiddenLensEl = document.getElementById('lwLensHeight');
        const programCheck = document.getElementById('lwProgramNameChecked');
        const lensPointerCheck = document.getElementById('lwLensPointerChecked');
        const lensRulerCheck = document.getElementById('lwLensRulerChecked');
        if (guideEl) guideEl.textContent = programGuide;
        if (hiddenProgramEl) hiddenProgramEl.value = programCheck && programCheck.checked ? programGuide : '';
        if (hiddenLensEl) {
            const checkedMethods = [
                lensPointerCheck && lensPointerCheck.checked ? '포인터' : '',
                lensRulerCheck && lensRulerCheck.checked ? '자' : ''
            ].filter(Boolean);
            hiddenLensEl.value = checkedMethods.length ? `${checkedMethods.join('/')} 375mm 확인` : '';
        }
    }

    function updatePackUnitDisplay() {
        const el = document.getElementById('lwPackUnitDisplay');
        if (!el) return;
        const spec = _getLaserCycleSpec(_selectedCarModel, _selectedPartName, _selectedColor);
        const packQty = Number(String((spec && spec.packUnit) || '').replace(/,/g, '')) || 0;
        const qtyInput = document.getElementById('lwQuantity');
        const qtyValue = qtyInput && String(qtyInput.value || '').trim() !== '' ? Number(qtyInput.value) : 0;
        const workQty = qtyValue || _selectedLotQtyTotal();
        const fullBoxCount = packQty > 0 && workQty > 0 ? Math.floor(workQty / packQty) : 0;
        const residualQty = packQty > 0 && workQty > 0 ? workQty - (fullBoxCount * packQty) : 0;
        el.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;font-weight:800;">
                <span>박스 당 포장 수량 : <strong style="font-size:1.18rem;color:var(--accent-blue);">${packQty ? UIUtils.formatNumber(packQty) : '000'}</strong>개</span>
                <span style="color:var(--text-muted);">|</span>
                <span>예상 박스 <strong style="font-size:1.18rem;color:var(--accent-blue);">${UIUtils.formatNumber(fullBoxCount || 0)}</strong> BOX</span>
                <span style="color:var(--text-muted);font-size:0.78rem;">(포장·잔량은 외관검사에서 처리)</span>
            </div>`;
    }

    // 완료 지연 사유 판정 여유 — 표준 완료시간 이후 15분까지는 사유 입력 없이 허용
    const OVERTIME_GRACE_MINUTES = 15;

    function updateStandardEndTime(forceFill = false) {
        const startEl = document.getElementById('lwStartTime');
        const endEl = document.getElementById('lwEndTime');
        const hintEl = document.getElementById('lwStandardEndHint');
        if (!startEl || !endEl) return;
        const startMin = _timeToMinutes(startEl.value);
        const spec = _getLaserCycleSpec(_selectedCarModel, _selectedPartName, _selectedColor);
        const estimateMin = _laserEstimateMinutes(spec);
        if (startMin === null || estimateMin <= 0) {
            if (hintEl) hintEl.textContent = '';
            endEl.dataset.standardEnd = '';
            endEl.dataset.graceEnd = '';
            endEl.dataset.graceMinutes = '';
            return;
        }
        const graceMin = OVERTIME_GRACE_MINUTES;
        const standardEnd = _minutesToTime(startMin + estimateMin);
        const graceEnd = _minutesToTime(startMin + estimateMin + graceMin);
        endEl.dataset.standardEnd = standardEnd;
        endEl.dataset.graceEnd = graceEnd;
        endEl.dataset.graceMinutes = String(graceMin);
        const autoManaged = endEl.dataset.standardAuto === '1';
        if (forceFill || !endEl.value || autoManaged) {
            endEl.value = standardEnd;
            endEl.dataset.standardAuto = '1';
        }
        if (hintEl) {
            hintEl.textContent = `표준 완료시간은 ${standardEnd} 입니다 (${graceMin}분 여유 → ${graceEnd}까지 지연 사유 없음)`;
        }
        updateOvertimeReasonVisibility();
    }

    function markEndTimeManual() {
        const endEl = document.getElementById('lwEndTime');
        if (endEl) endEl.dataset.standardAuto = '0';
        updateOvertimeReasonVisibility();
    }

    function _isEndOverStandard() {
        const startEl = document.getElementById('lwStartTime');
        const endEl = document.getElementById('lwEndTime');
        if (!startEl || !endEl || !startEl.value || !endEl.value) return false;
        const startMin = _timeToMinutes(startEl.value);
        const endMinRaw = _timeToMinutes(endEl.value);
        // 지연 사유는 표준 완료시간 + 15분 여유(graceEnd)를 넘을 때만 요구한다.
        const thresholdRaw = _timeToMinutes(endEl.dataset.graceEnd || endEl.dataset.standardEnd);
        if (startMin === null || endMinRaw === null || thresholdRaw === null) return false;
        const normalizeAfterStart = value => value < startMin ? value + 1440 : value;
        return normalizeAfterStart(endMinRaw) > normalizeAfterStart(thresholdRaw);
    }

    function updateOvertimeReasonVisibility() {
        const wrap = document.getElementById('lwOvertimeReasonWrap');
        const stdEl = document.getElementById('lwOvertimeStandardTime');
        const endEl = document.getElementById('lwEndTime');
        const show = _isEndOverStandard();
        if (wrap) wrap.style.display = show ? 'block' : 'none';
        if (stdEl) {
            const standardEnd = (endEl && endEl.dataset.standardEnd) || '-';
            const graceEnd = (endEl && endEl.dataset.graceEnd) || '';
            const graceMin = (endEl && endEl.dataset.graceMinutes) || '';
            stdEl.textContent = graceEnd
                ? `${standardEnd} (여유 ${graceMin}분 → ${graceEnd})`
                : standardEnd;
        }
    }

    // 표준 완료시간을 초과했을 때 관리자에게 즉시 통보한다.
    function notifyOvertimeManager() {
        const reason = _inputValue('lwOvertimeReason');
        if (!reason) {
            UIUtils.toast('완료 지연 사유를 먼저 입력하세요.', 'warning');
            _focusInput('lwOvertimeReason');
            return;
        }
        const recipients = _getSelectedNotifyUsers('lwOvertime');
        if (!recipients.length) {
            UIUtils.toast('통보할 담당자를 선택하세요.', 'warning');
            return;
        }
        const carModel = _selectedCarModel || _inputValue('lwCarModel') || _inputValue('lwSbCar');
        const partName = _selectedPartName || _inputValue('lwPartName') || _inputValue('lwSbPart');
        const endEl = document.getElementById('lwEndTime');
        const standardEnd = (endEl && endEl.dataset.standardEnd) || '-';
        const graceEnd = (endEl && endEl.dataset.graceEnd) || standardEnd;
        const graceMin = (endEl && endEl.dataset.graceMinutes) || '';
        const actualEnd = _inputValue('lwEndTime');

        _sendManagerNotification(
            '레이져 작업 완료 지연 통보',
            `[${carModel || '-'} / ${partName || '-'}]\n표준 완료시간: ${standardEnd}\n여유 기준(+${graceMin || 15}분): ${graceEnd}\n실제 완료시간: ${actualEnd}\n사유: ${reason}`,
            recipients
        );

        const hidden = document.getElementById('lwOvertimeNotified');
        if (hidden) hidden.value = '1';
        const badge = document.getElementById('lwOvertimeNotifiedBadge');
        if (badge) badge.style.display = 'inline';
        UIUtils.toast('관리자에게 통보했습니다.', 'success');
    }

    function _updateLaserCycleEstimate(spec) {
        const detail = document.getElementById('lwLaserCycleDetail');
        if (!detail || !spec) return;
        const ct = _effectiveEngravingCt(spec);
        const cvt = Number(spec.cvt) || 0;
        const qtyInput = document.getElementById('lwQuantity');
        const qtyValue = qtyInput && String(qtyInput.value || '').trim() !== '' ? Number(qtyInput.value) : 0;
        const qty = qtyValue || _selectedLotQtyTotal();
        updatePackUnitDisplay();
        if (ct > 0 && cvt > 0) {
            const totalSec = (qty / cvt) * ct;
            detail.innerHTML = `각인 시간(CT) <strong>${UIUtils.formatNumber(ct)} sec</strong> / CVT <strong>${UIUtils.formatNumber(cvt)}개</strong> /
                예상 작업 소요시간 <strong style="color:var(--accent-blue);">${_fmtLaserMinutes(totalSec / 60)}</strong>
                <span style="color:var(--text-muted);">(${UIUtils.formatNumber(qty)} / ${UIUtils.formatNumber(cvt)} × ${UIUtils.formatNumber(ct)} sec)</span>`;
            updateStandardEndTime(false);
            return;
        }
        detail.textContent = spec.cvt
            ? `제품 기초 레이져 공정 CVT ${spec.cvt}개 (각인 시간을 입력하세요)`
            : (spec.foundProduct ? '제품기초 레이져공정 CVT 미등록' : '제품기초 제품 매칭 실패');
        updateStandardEndTime(true);
    }

    function _refreshLaserCycleSpec(forceValue = false) {
        const spec = _getLaserCycleSpec(_selectedCarModel, _selectedPartName, _selectedColor);
        const label = document.getElementById('lwEngravingCycleLabel');
        const input = document.getElementById('lwEngravingTime');
        const sec = spec.cycleSec || '';
        if (label) label.textContent = `1cycle = ${sec || '00'} sec`;
        if (input && (forceValue || !input.value) && sec) input.value = sec;
        _updateLaserCycleEstimate(spec);
        _updateManualPaintLotVisibility(_selectedCarModel, _selectedPartName, _selectedColor);
    }

    // 사출→레이저 직결 품목(도장 공정 없음)은 수기 등록 시 도장LOT 입력을 감춘다.
    function _updateManualPaintLotVisibility(carModel, partName, color) {
        const wrap = document.getElementById('lwManualPaintLotWrap');
        const input = document.getElementById('lwManualPaintLot');
        if (!wrap || !input) return;
        const prod = _findProductForWork(carModel, partName, color);
        const needsPaint = _hasPaintingProcess(prod);
        wrap.style.display = needsPaint ? '' : 'none';
        if (!needsPaint) input.value = '';
    }

    // 각인 시간(실제 입력값) 변경 시 완료시간 예상치/표준완료시간을 다시 계산
    function onEngravingTimeInput() {
        const spec = _getLaserCycleSpec(_selectedCarModel, _selectedPartName, _selectedColor);
        _updateLaserCycleEstimate(spec);
    }

    function _getLaserRelatedProducts() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.filter(prod => _hasLaserProcess(prod));
    }

    // 재공재고 > 0인 레이저 대기품 — 보정 후 재고(LaserStandbyModule 스냅샷) 단일 기준
    function getLaserStandbyItems() {
        try {
            if (typeof LaserStandbyModule !== 'undefined'
                && typeof LaserStandbyModule.getWorkLotSnapshotSync === 'function'
                && typeof LaserStandbyModule.getStockSnapshotSync === 'function') {
                const rows = (LaserStandbyModule.getWorkLotSnapshotSync() || [])
                    .filter(function(row) { return (Number(row.productionQty) || 0) > 0; })
                    .map(function(row) { return { ...row }; });

                const coveredQtyByKey = {};
                rows.forEach(function(row) {
                    const key = `${row.carModel}||${row.partName}||${row.color || ''}`;
                    coveredQtyByKey[key] = (coveredQtyByKey[key] || 0) + (Number(row.productionQty) || 0);
                });

                // LOT 배분이 없거나 FIFO 합이 보정 재고보다 적을 때 미배분 잔량 보충
                (LaserStandbyModule.getStockSnapshotSync() || []).forEach(function(item) {
                    const color = item.color === '-' ? '' : (item.color || '');
                    const key = `${item.carModel}||${item.partName}||${color}`;
                    const stockQty = Number(item.stockQty) || 0;
                    if (stockQty <= 0) return;
                    const already = coveredQtyByKey[key] || 0;
                    const shortfall = stockQty - already;
                    if (shortfall <= 0.001) return;

                    const ov = item.manualOverride;
                    const ovLots = ov && Array.isArray(ov.lots) && ov.lots.length > 0
                        ? ov.lots.map(function(l) {
                            return {
                                paintDate: String(l.paintLot || l.paintDate || ''),
                                lotNo: String(l.injectionLot || l.lotNo || ''),
                                qty: Number(l.qty) || 0
                            };
                        }).filter(function(l) { return l.lotNo && l.qty > 0; })
                        : (ov && (ov.paintLot || ov.injectionLot)
                            ? [{ paintDate: ov.paintLot || '', lotNo: ov.injectionLot || '', qty: shortfall }]
                            : []);

                    const firstPaintLot = ovLots.length > 0
                        ? (ovLots[0].paintDate || '')
                        : (ov && ov.paintLot ? ov.paintLot : '');
                    const syntheticDate = firstPaintLot && /^\d{6}$/.test(firstPaintLot)
                        ? `20${firstPaintLot.slice(0, 2)}-${firstPaintLot.slice(2, 4)}-${firstPaintLot.slice(4, 6)}`
                        : '';

                    rows.push({
                        carModel: item.carModel,
                        partName: item.partName,
                        color: color,
                        date: syntheticDate,
                        productionQty: shortfall,
                        lots: ovLots.length > 0 ? ovLots : [],
                        isStockShortfallRow: true
                    });
                    coveredQtyByKey[key] = stockQty;
                });

                return rows.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
            }
        } catch (e) { /* 스냅샷 실패 시 레거시 폴백 */ }

        return _getLaserStandbyItemsLegacy();
    }

    // LaserStandbyModule 미로드·스냅샷 실패 시 폴백 (도장작업 − 레이저작업 원본 계산)
    function _getLaserStandbyItemsLegacy() {
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks    = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products      = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const injectionMaterials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const normalizeStandbyRecord = (row) => {
            if (typeof LaserStandbyModule !== 'undefined' && LaserStandbyModule.normalizeStandbyRecord) {
                return LaserStandbyModule.normalizeStandbyRecord(row, products, injectionMaterials);
            }
            return row;
        };

        // 차종+품명(+컬러)이 정확히 일치하는 제품을 우선 사용한다. _findProductForWork()는 유사도
        // 점수제라 품명에 특수문자/긴 수식어가 붙으면 기준 점수를 못 넘겨 매칭 실패로 처리되는데,
        // 그 경우 "재공 재고 현황"(WIP) 화면에는 보이는 항목이 이 목록에서만 통째로 빠지는 문제가 있었다.
        const _exactProductFor = (carModel, partName, color) => {
            const car = String(carModel || '').trim();
            const part = String(partName || '').trim();
            const clr = String(color || '').trim();
            const match = (p) => String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
            return products.find(p => match(p) && String(p.color || '').trim() === clr)
                || products.find(p => match(p))
                || null;
        };

        const laserPaintWorks = paintingWorks.map(normalizeStandbyRecord).filter(w => {
            const prod = _exactProductFor(w.carModel, w.partName, w.color) || _findProductForWork(w.carModel, w.partName, w.color);
            if (!prod || !_hasLaserProcess(prod)) return false;
            // 이 작업의 도장 라인 이후에 레이저가 있을 때만 레이저 대기에 포함
            // (도장-B가 레이저 뒤에 있으면 도장-B 완료품은 레이저 대기 대상 아님)
            const procs = [prod.process1, prod.process2, prod.process3, prod.process4]
                .map(p => (p || '').trim());
            const paintLine = (w.line || '').trim();
            const paintIdx  = procs.indexOf(paintLine);
            const laserIdx  = procs.findIndex(p => p.includes('레이저') || p.includes('레이져'));
            if (laserIdx < 0) return false;
            if (paintIdx < 0) return true;   // 라인 정보 없으면 안전하게 포함
            return laserIdx > paintIdx;       // 레이저가 이 도장 이후에 위치할 때만
        });

        // 도장 작업일 + 사출 LOT 단위로 레이저 처리 수량 집계
        const outByDate = {};
        const outByLot = {};
        laserWorks.forEach(rawWork => {
            const lw = normalizeStandbyRecord(rawWork);
            const base = `${lw.carModel}||${lw.partName}||${lw.color || ''}`;
            const lots = Array.isArray(lw.paintLots) && lw.paintLots.length > 0
                ? lw.paintLots
                : (lw.paintDate || lw.paintLot ? [{ paintDate: lw.paintDate || '', lotNo: lw.paintLot || lw.lotNo || '', qty: Number(lw.quantity) || 0 }] : []);

            if (lots.length > 0) {
                const totalQty = Number(lw.quantity) || 0;
                const explicitQty = lots.reduce((sum, lot) => sum + (Number(lot && lot.qty) || 0), 0);
                const qtyEach = explicitQty > 0 ? 0 : (totalQty / lots.length);
                lots.forEach(lot => {
                    const paintDate = lot && lot.paintDate ? lot.paintDate : (lw.paintDate || '');
                    const lotNo = lot && lot.lotNo ? lot.lotNo : (lw.paintLot || lw.lotNo || '');
                    const qty = Number(lot && lot.qty) || qtyEach;
                    const dateKey = `${base}||${paintDate}`;
                    const lotKey = _lotKey(lw.carModel, lw.partName, lw.color || '', paintDate, lotNo);
                    outByDate[dateKey] = (outByDate[dateKey] || 0) + qty;
                    if (lotNo) outByLot[lotKey] = (outByLot[lotKey] || 0) + qty;
                });
            } else {
                // 도장날짜 정보 없으면 제품 키 전체에 합산 (fallback)
                const k = `${base}||`;
                outByDate[k] = (outByDate[k] || 0) + (Number(lw.quantity) || 0);
            }
        });

        // 각 도장 작업 레코드의 잔여 수량 계산 → 잔여 > 0인 것만 반환
        const result = laserPaintWorks.map(w => {
            const k = `${w.carModel}||${w.partName}||${w.color || ''}||${w.date || ''}`;
            const used = outByDate[k] || 0;
            let lots = _workLots(w).map(lot => {
                const lotKey = _lotKey(w.carModel, w.partName, w.color || '', w.date || '', lot.lotNo || '');
                return {
                    ...lot,
                    qty: Math.max(0, (Number(lot.qty) || 0) - (outByLot[lotKey] || 0))
                };
            }).filter(lot => lot.qty > 0);
            const lotRemain = lots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
            const dateRemain = Math.max(0, (Number(w.productionQty) || 0) - used);
            if (lotRemain > 0 && dateRemain > 0 && lotRemain > dateRemain) {
                let cap = dateRemain;
                lots = lots.map(lot => {
                    const qty = Math.min(Number(lot.qty) || 0, cap);
                    cap -= qty;
                    return { ...lot, qty };
                }).filter(lot => lot.qty > 0);
            }
            const remainingQty = lots.length > 0
                ? lots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0)
                : dateRemain;
            return { ...w, productionQty: remainingQty, lots };
        }).filter(w => {
            return (Number(w.productionQty) || 0) > 0;
        });

        // 작업등록 FIFO는 대기재고 상세와 동일한 LOT 잔량 계산을 사용한다.
        // 차감·보정·수기 이력을 모두 반영한 권위 있는 LOT 행으로 원본 도장작업 행을 대체한다.
        try {
            if (typeof LaserStandbyModule !== 'undefined' && LaserStandbyModule.getWorkLotSnapshotSync) {
                const authoritativeRows = LaserStandbyModule.getWorkLotSnapshotSync() || [];
                const authoritativeKeys = new Set(authoritativeRows.map(function(row) {
                    return `${row.carModel}||${row.partName}||${row.color || ''}`;
                }));
                for (let i = result.length - 1; i >= 0; i--) {
                    const row = result[i];
                    const key = `${row.carModel}||${row.partName}||${row.color || ''}`;
                    if (authoritativeKeys.has(key)) result.splice(i, 1);
                }
                result.push.apply(result, authoritativeRows);
            }
        } catch (e) { /* 상세 LOT 조회 실패 시 기존 원본 도장작업 계산 사용 */ }

        // 도장 작업일지 없이 "재공품 현황" 화면에서 수기 등록/일괄 등록된 재고는 위 로직에 전혀
        // 반영되지 않아 이 목록(작업 등록 드롭다운)에서 보이지 않는 문제가 있었다. 그 재고 중
        // 아직 위 목록으로 커버되지 않는 만큼을 보충 항목으로 추가한다.
        try {
            if (typeof LaserStandbyModule !== 'undefined' && LaserStandbyModule.getStockSnapshotSync) {
                const coveredQtyByKey = {};
                result.forEach(w => {
                    const k2 = `${w.carModel}||${w.partName}||${w.color || ''}`;
                    coveredQtyByKey[k2] = (coveredQtyByKey[k2] || 0) + (Number(w.productionQty) || 0);
                });
                (LaserStandbyModule.getStockSnapshotSync() || []).forEach(item => {
                    const color = item.color === '-' ? '' : (item.color || '');
                    const k2 = `${item.carModel}||${item.partName}||${color}`;
                    const already = coveredQtyByKey[k2] || 0;
                    const shortfall = (Number(item.stockQty) || 0) - already;
                    if (shortfall <= 0) return;
                    const ov = item.manualOverride;
                    // 신형 lots 배열 우선 → 구형 단일 paintLot/injectionLot → 없음
                    const ovLots = ov && Array.isArray(ov.lots) && ov.lots.length > 0
                        ? ov.lots.map(function(l) {
                            return { paintDate: String(l.paintLot || l.paintDate || ''), lotNo: String(l.injectionLot || l.lotNo || ''), qty: Number(l.qty) || 0 };
                          }).filter(function(l) { return l.lotNo && l.qty > 0; })
                        : (ov && (ov.paintLot || ov.injectionLot)
                            ? [{ paintDate: ov.paintLot || '', lotNo: ov.injectionLot || '', qty: shortfall }]
                            : []);
                    // date를 도장 LOT의 날짜로 채워야 작업등록 화면에서 도장LOT가 표시된다.
                    const firstPaintLot = ovLots.length > 0 ? (ovLots[0].paintDate || '') : (ov && ov.paintLot ? ov.paintLot : '');
                    const syntheticDate = firstPaintLot && /^\d{6}$/.test(firstPaintLot)
                        ? '20' + firstPaintLot.slice(0,2) + '-' + firstPaintLot.slice(2,4) + '-' + firstPaintLot.slice(4,6)
                        : '';
                    result.push({
                        carModel: item.carModel,
                        partName: item.partName,
                        color,
                        date: syntheticDate,
                        productionQty: shortfall,
                        lots: ovLots.length > 0 ? ovLots : []
                    });
                });
            }
        } catch (e) { /* 수기 재고 병합 실패 시 도장 작업일지 기준 목록만 표시 */ }

        return result.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-work', '', '',
                    '<button class="btn btn-primary btn-sm" onclick="LaserWorkModule.openAddModal()"><span class="material-symbols-outlined">add</span> 작업 등록</button>')}

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="lwFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="lwFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">장비</label>
                        <select class="form-select" id="lwFilterMachine">
                            <option value="">전체</option>
                            ${MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="LaserWorkModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="lwStats"></div>

                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">hourglass_top</span> 레이져 작업중 (중품/종품 입력 대기)</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table data-table--compact" style="min-width:760px;table-layout:fixed;">
                                <thead>
                                    <tr>
                                        <th style="width:76px;">레이져작업일</th>
                                        <th style="width:80px;">장비</th>
                                        <th style="width:76px;">차종</th>
                                        <th style="width:220px;">품명</th>
                                        <th style="width:72px;">수량</th>
                                        <th style="width:140px;">대기 항목</th>
                                        <th style="width:140px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="lwInProgressTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 레이져 작업 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table data-table--compact" style="min-width:1000px;table-layout:fixed;">
                                <thead>
                                    <tr>
                                        <th style="width:76px;">레이져작업일</th>
                                        <th style="width:80px;">장비</th>
                                        <th style="width:68px;">시간</th>
                                        <th style="width:76px;">차종</th>
                                        <th style="width:200px;">품명</th>
                                        <th style="width:72px;">수량</th>
                                        <th style="width:80px;">도장작업일</th>
                                        <th style="width:110px;">사출LOT</th>
                                        <th style="width:176px;">품질확인</th>
                                        <th style="width:180px;">작업자</th>
                                        <th style="width:100px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="lwTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
        _bindCacheWarmRefreshOnce();
    }

    // 작업완료 여부 판단: status가 명시적으로 'in_progress'가 아니면 완료로 취급 (구버전 데이터 호환)
    function _isWorkCompleted(d) {
        return d.status !== 'in_progress';
    }

    // 재공/잔량의 실사 보정은 생산 작업이 아니라 재고 카운트 조정이다.
    // 계산·감사 기록은 laser_work_log에 유지하되 작업 이력/통계에서는 제외한다.
    function _isInventoryCorrectionRecord(d) {
        // laser-wip.js가 만드는 모든 수기 입고·출고·LOT 보정은 isManual=true이다.
        // 개별 플래그가 추가되거나 구버전 레코드에 일부 플래그가 빠져도 작업 실적으로 오인하지 않는다.
        return !!(d && (
            d.isManual ||
            d.isResidualLotAdjust ||
            d.isWipLotAdjust ||
            d.isResidualManualIn ||
            d.isResidualManualOut ||
            d.isManualOut
        ));
    }

    function search() {
        const start = document.getElementById('lwFilterStart').value;
        const end = document.getElementById('lwFilterEnd').value;
        const machine = document.getElementById('lwFilterMachine').value;

        let data = Storage.getByDateRange(STORE, start, end);
        data = data.filter(d => !_isInventoryCorrectionRecord(d));
        if (machine) data = data.filter(d => d.machine === machine);
        data.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.startTime || '').localeCompare(String(a.startTime || '')));

        // 작업 이력(완료건)과 작업중(미완료건)을 분리해 각각 다른 섹션에 표시
        const completedData = data.filter(_isWorkCompleted);
        const inProgressData = data.filter(d => !_isWorkCompleted(d));

        renderStats(completedData);
        renderInProgressTable(inProgressData);
        renderTable(completedData);
    }

    function renderInProgressTable(data) {
        const tbody = document.getElementById('lwInProgressTableBody');
        if (!tbody) return;
        const isAdmin = _isAdminUser();
        const canEdit = _canWriteLaserWork();
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">작업중인 항목이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const req = _qcRequiredStages(d.quantity);
            const remain = [];
            if (req.middle && !d.qcMiddle) remain.push('중품');
            if (req.last && !d.qcLast) remain.push('종품');
            return `
                <tr>
                    <td style="white-space:nowrap;">${_workDateCell(d.date, d.startTime)}</td>
                    <td style="white-space:nowrap;"><span class="badge badge-info" style="display:inline-flex;align-items:center;justify-content:center;min-width:56px;font-size:0.7rem;padding:2px 6px;white-space:nowrap;">${d.machine || '-'}</span></td>
                    <td style="font-weight:600;white-space:nowrap;">${d.carModel || '-'}</td>
                    <td style="min-width:0;"><div style="font-weight:600;">${d.partName || '-'}</div></td>
                    <td style="text-align:right;font-weight:700;">${UIUtils.formatNumber(d.quantity)}</td>
                    <td><span class="badge badge-warning" style="font-size:0.72rem;padding:2px 6px;">${remain.length ? remain.join('/') + ' 입력 필요' : '작업완료 처리 필요'}</span></td>
                    <td style="white-space:nowrap;">
                        <div style="display:flex;gap:4px;align-items:center;justify-content:flex-start;white-space:nowrap;">
                            ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="LaserWorkModule.edit('${d.id}')">이어서 입력</button>` : ''}
                            ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="LaserWorkModule.remove('${d.id}')">삭제</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderStats(data) {
        // 호출 경로가 추가되더라도 재고 수기조정이 생산실적 통계에 섞이지 않도록 이중 방어
        data = (data || []).filter(d => !_isInventoryCorrectionRecord(d));
        const total = data.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
        const inspections = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const inspectedIds = new Set(inspections.map(item => item.workLogId).filter(Boolean));
        // 검사 대기: 작업 완료 + 초중종 입력 완료 + 미검사
        const pendingWorks = data.filter(item =>
            item.id && !inspectedIds.has(item.id) && isWorkQcFullyEntered(item)
        );
        const pendingCount = pendingWorks.length;
        const pendingQty = pendingWorks.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const machines = MACHINES.map(m => ({
            name: m,
            qty: data.filter(d => d.machine === m).reduce((s, d) => s + (Number(d.quantity) || 0), 0)
        }));

        document.getElementById('lwStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(total)}</div>
                <div class="stat-card-label">총 작업수량</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${UIUtils.formatNumber(pendingQty)}</div>
                <div class="stat-card-label">검사 대기 수량 (${UIUtils.formatNumber(pendingCount)}건)</div>
            </div>
            ${machines.map(m => `
                <div class="stat-card">
                    <div class="stat-card-value">${UIUtils.formatNumber(m.qty)}</div>
                    <div class="stat-card-label">${m.name} 실적</div>
                </div>
            `).join('')}
        `;
    }

    // 작업 이력 표의 초/중/종품 셀: 완료 배지 + (있으면) 작은 썸네일. 클릭 시 원본 크기로 확인.
    function _qcStageCell(done, photoUrl, shortLabel, fullLabel) {
        if (!done) return '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>';
        const src = photoUrl ? (typeof ApiClient !== 'undefined' ? ApiClient.photoUrl(photoUrl) : photoUrl) : '';
        const thumb = src
            ? `<img src="${src}" alt="${fullLabel}" title="${fullLabel} 사진 (클릭 시 확대)"
                    style="width:22px;height:22px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);cursor:pointer;vertical-align:middle;"
                    onclick="LaserWorkModule.viewQcPhotoUrl('${photoUrl.replace(/'/g, "\\'")}', '${fullLabel}')">`
            : '';
        return `<span style="display:inline-flex;align-items:center;gap:2px;"><span class="badge badge-success" style="padding:1px 5px;font-size:0.72rem;">${shortLabel}</span>${thumb}</span>`;
    }

    function renderTable(data) {
        const tbody = document.getElementById('lwTableBody');
        const isAdmin = _isAdminUser();
        const canEdit = _canWriteLaserWork();
        // 잔량/재공 수기 입출고·보정은 재고 감사 이력이며 레이저 작업일지가 아니다.
        data = (data || []).filter(d => !_isInventoryCorrectionRecord(d));
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted);">기록이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td style="white-space:nowrap;">${_workDateCell(d.date, d.startTime)}</td>
                <td style="white-space:nowrap;"><span class="badge badge-info" style="display:inline-flex;align-items:center;justify-content:center;min-width:56px;font-size:0.7rem;padding:2px 6px;white-space:nowrap;">${d.machine || '-'}</span></td>
                <td style="font-size:0.78rem;line-height:1.3;text-align:center;"><div>${d.startTime || '-'}</div><div style="color:var(--text-muted);font-size:0.72rem;">${d.endTime || '-'}</div></td>
                <td style="font-weight:600;white-space:nowrap;">${d.carModel || '-'}</td>
                <td style="min-width:0;">
                    <div style="font-weight:600;">${d.partName || '-'}</div>
                </td>
                <td style="text-align:right; font-weight:700;">${UIUtils.formatNumber(d.quantity)}</td>
                <td style="white-space:nowrap;">${_paintDateCell(d)}</td>
                <td style="font-size:0.8rem; font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.paintLot || '-'}</td>
                <td style="overflow:hidden;">
                    <div style="display:flex; gap:4px; flex-wrap:nowrap; align-items:center;">
                        ${_qcStageCell(d.qcFirst, d.qcFirstPhotoUrl, '초', '초품')}
                        ${d.qcMiddle ? _qcStageCell(d.qcMiddle, d.qcMiddlePhotoUrl, '중', '중품') : ''}
                        ${d.qcLast ? _qcStageCell(d.qcLast, d.qcLastPhotoUrl, '종', '종품') : ''}
                    </div>
                </td>
                <td style="font-size:0.8rem;white-space:nowrap;">${[d.worker1, d.worker2, d.worker3].filter(Boolean).join(', ') || '-'}</td>
                <td style="white-space:nowrap;">
                    <div style="display:flex;gap:4px;align-items:center;justify-content:flex-start;white-space:nowrap;">
                        ${canEdit ? `<button class="btn btn-sm btn-outline" onclick="LaserWorkModule.edit('${d.id}')">수정</button>` : ''}
                        ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="LaserWorkModule.remove('${d.id}')">삭제</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function buildFormHTML(d = {}) {
        // 레이저 대기품 목록 갱신
        _standbyItems = getLaserStandbyItems();
        // 대기품 목록에 있는 차종만 필터 옵션으로 사용
        const sbCarModels = [...new Set(_standbyItems.map(w => w.carModel).filter(Boolean))].sort();

        // 수정 모드: 기존 차종/품명/컬러/LOT 읽기 전용 표시
        const isEditMode = !!(d.carModel || d.partName || d.date);
        // 도장 작업일 (paintDate) 과 사출 LOT (lotNo) 분리
        const paintDateSummary = _selectedLots.length > 0
            ? [...new Set(_selectedLots.map(l => l.paintDate).filter(Boolean))].join(', ')
            : (d.paintDate || (d.paintLots && d.paintLots[0] ? d.paintLots[0].paintDate : '') || '-');
        const injLotSummary = _selectedLots.length > 0
            ? [...new Set(_selectedLots.map(l => l.lotNo).filter(Boolean))].join(', ')
            : (d.paintLot || (d.paintLots ? [...new Set(d.paintLots.map(l => l.lotNo).filter(Boolean))].join(', ') : '') || '-');
        const manualChecked = !isEditMode && !!(d.manualInput || d.manualEntry || d.manualMode);

        return `
            ${isEditMode ? `
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:0.82rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;">
                    <div><span style="color:var(--text-muted);font-size:0.72rem;">차종</span><div style="font-weight:700;">${d.carModel || '-'}</div></div>
                    <div><span style="color:var(--text-muted);font-size:0.72rem;">품명</span><div style="font-weight:700;">${d.partName || '-'}</div></div>
                    <div><span style="color:var(--text-muted);font-size:0.72rem;">컬러</span><div style="font-weight:700;">${d.color || '-'}</div></div>
                    <div><span style="color:var(--text-muted);font-size:0.72rem;">도장LOT</span><div style="font-weight:600;font-family:monospace;">${paintDateSummary}</div></div>
                    <div><span style="color:var(--text-muted);font-size:0.72rem;">사출LOT</span><div style="font-weight:600;font-family:monospace;">${injLotSummary}</div></div>
                </div>
            </div>
            ` : `
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">list_alt</span>
                    <span style="font-weight:600;font-size:0.85rem;">레이저 대기품</span>
                    ${_standbyItems.length === 0 ? `<span style="font-size:0.75rem;color:var(--accent-red);">대기 품목 없음</span>` : `<span style="font-size:0.75rem;color:var(--text-muted);">차종 선택 후 클릭</span>`}
                </div>
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                    <select class="form-select" id="lwSbCar" onchange="LaserWorkModule.onSbCarChange()" style="flex:1;" ${_standbyItems.length === 0 ? 'disabled' : ''}>
                        <option value="">-- 차종 --</option>
                        ${sbCarModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <select class="form-select" id="lwSbPart" onchange="LaserWorkModule.onSbPartChange()" style="flex:2;" disabled>
                        <option value="">-- 품명 --</option>
                    </select>
                </div>
                <div id="lwStandbyResults" style="font-size:0.82rem;color:var(--text-muted);min-height:22px;">
                    ${_standbyItems.length > 0 ? '차종을 선택하세요.' : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;padding:7px 12px;border:1px solid rgba(59,130,246,0.18);border-radius:8px;background:rgba(59,130,246,0.04);">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;color:var(--text-primary);">
                    <input type="checkbox" id="lwManualToggle" ${manualChecked ? 'checked' : ''} onchange="LaserWorkModule.toggleManualSection()">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">edit_square</span>
                    수기 등록
                </label>
                <span style="font-size:0.75rem;color:var(--text-muted);">레이져 대기품이 없는 품목이 있을 시에 체크하고 입력하시오</span>
            </div>
            <div id="lwManualSection" style="display:${manualChecked ? 'block' : 'none'};background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.18);border-radius:8px;padding:8px 12px;margin-bottom:8px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:6px;">
                    <div class="form-group" style="margin:0;"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="lwCarModel" onchange="LaserWorkModule.onCarModelChange()">
                            <option value="">-- 차종 선택 --</option>
                            ${[...new Set(_getLaserRelatedProducts().map(_productCarName).filter(Boolean))].sort().map(car => `<option value="${car}" ${d.carModel === car ? 'selected' : ''}>${car}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="lwPartName" onchange="LaserWorkModule.onPartChange()">
                            <option value="">-- 품명 선택 --</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;"><label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="lwColor" onchange="LaserWorkModule.refreshLaserCycleSpec(true)">
                            <option value="">-- 컬러 선택 --</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;"><label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="lwQuantity" value="${d.quantity || ''}" placeholder="0" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserWorkModule.calcCompletedQty()">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="form-group" id="lwManualPaintLotWrap" style="margin:0;"><label class="form-label">도장LOT <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="lwManualPaintLot" value="${d.paintDate || ''}" placeholder="도장 LOT">
                    </div>
                    <div class="form-group" style="margin:0;"><label class="form-label">사출LOT <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="lwManualInjLot" value="${d.paintLot || ''}" placeholder="사출 LOT">
                    </div>
                </div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">checklist</span>
                        <span style="font-weight:700;font-size:0.85rem;">선택된 작업 LOT</span>
                    </div>
                    <button type="button" class="btn btn-outline btn-sm" onclick="LaserWorkModule.addLotRow('', '', 0)">
                        <span class="material-symbols-outlined" style="font-size:14px;">add</span> 직접 추가
                    </button>
                </div>
                <div id="lwLotContainer"></div>
                <div id="lwPackUnitDisplay" style="margin-top:8px;padding:9px 12px;border:1px solid rgba(37,99,235,0.25);border-radius:8px;background:rgba(37,99,235,0.06);font-size:1rem;font-weight:800;color:var(--text-primary);text-align:right;">
                    박스당 포장 수량은 : <strong style="font-size:1.18rem;color:var(--accent-blue);">-</strong> 개
                </div>
            </div>
            <div id="lwResidualInfo" style="display:none;margin-bottom:8px;"></div>
            <div id="lwSplitPanel" style="display:none;margin-bottom:8px;padding:8px 12px;background:rgba(109,40,217,0.06);border:1px solid rgba(109,40,217,0.25);border-radius:8px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:#7c3aed;">call_split</span>
                    <span style="font-weight:600;font-size:0.85rem;color:#7c3aed;">납품처별 분리 등록</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin-bottom:6px;">
                    <div>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">납품처 A</div>
                        <div id="lwSplitLabelA" style="font-size:0.82rem;font-weight:600;"></div>
                        <input type="number" class="form-input" id="lwSplitQtyA" placeholder="0" min="0" oninput="LaserWorkModule.onSplitQtyChange()" style="margin-top:3px;">
                    </div>
                    <div style="text-align:center;color:var(--text-muted);">+</div>
                    <div>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px;">납품처 B</div>
                        <div id="lwSplitLabelB" style="font-size:0.82rem;font-weight:600;"></div>
                        <input type="number" class="form-input" id="lwSplitQtyB" placeholder="0" min="0" oninput="LaserWorkModule.onSplitQtyChange()" style="margin-top:3px;">
                    </div>
                </div>
                <div id="lwSplitTotal" style="font-size:0.82rem;padding:4px 10px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border-color);text-align:right;">
                    합계: <strong>0</strong> / 대기 <strong id="lwSplitStock">0</strong> EA
                </div>
                <input type="hidden" id="lwSplitLinkedProductId">
            </div>
            `}
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr${isEditMode ? ' 1fr' : ''};gap:8px;margin-bottom:8px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">작업일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="lwDate" value="${d.date || UIUtils.today()}" oninput="LaserWorkModule.updateLaserGuideChecks(); LaserWorkModule.updateStandardEndTime(true)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">레이져 장비 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwMachine">
                        <option value="">-- 장비 선택 --</option>
                        ${MACHINES.map(m => `<option value="${m}" ${d.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">시작 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="lwStartTime" value="${d.startTime || ''}" oninput="LaserWorkModule.updateStandardEndTime(true)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">완료 시간 <span style="color:var(--accent-red)">*</span></label>
                    <input type="time" class="form-input" id="lwEndTime" value="${d.endTime || ''}" oninput="LaserWorkModule.markEndTimeManual()">
                    <div id="lwStandardEndHint" style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;line-height:1.25;"></div>
                </div>
                ${isEditMode ? `<div class="form-group" style="margin:0;">
                    <label class="form-label">수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lwQuantity" value="${d.quantity || ''}" placeholder="0" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserWorkModule.calcCompletedQty()">
                </div>` : ''}
            </div>
            <div id="lwOvertimeReasonWrap" style="display:none;margin:-2px 0 8px 0;padding:10px 12px;border:1px solid rgba(239,68,68,0.28);border-radius:8px;background:rgba(239,68,68,0.06);">
                <label class="form-label" style="color:var(--accent-red);">완료 지연 사유 <span style="color:var(--accent-red)">*</span></label>
                <textarea class="form-input" id="lwOvertimeReason" rows="2" placeholder="표준 완료시간 + 15분 여유를 초과한 사유를 입력하세요." style="resize:vertical;">${d.overtimeReason || ''}</textarea>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">표준 완료시간 <strong id="lwOvertimeStandardTime">-</strong> 초과 시 사유 입력 필수</div>
                ${_buildNotifySelectorHtml('lwOvertime', '완료 지연 사유를 통보할 담당자를 선택하세요.')}
                <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
                    <button type="button" id="lwNotifyManagerBtn" class="btn btn-danger btn-sm" onclick="LaserWorkModule.notifyOvertimeManager()">
                        <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">campaign</span> 관리자 통보
                    </button>
                    <span id="lwOvertimeNotifiedBadge" style="display:${d.overtimeNotified ? 'inline' : 'none'};color:#16a34a;font-weight:700;font-size:0.82rem;">✓ 통보 완료</span>
                </div>
                <input type="hidden" id="lwOvertimeNotified" value="${d.overtimeNotified ? '1' : ''}">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">렌즈 높이 확인 방법 <span style="color:var(--accent-red)">*</span></label>
                    <div style="min-height:38px;display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);">
                        <span style="font-size:0.86rem;color:var(--text-secondary);white-space:nowrap;">렌즈 높이 확인 방법 :</span>
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;font-weight:700;cursor:pointer;">
                            <input type="checkbox" id="lwLensPointerChecked" ${d.lensHeight ? 'checked' : ''} onchange="LaserWorkModule.updateLaserGuideChecks()" style="width:18px;height:18px;"> 포인터
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;font-weight:700;cursor:pointer;">
                            <input type="checkbox" id="lwLensRulerChecked" ${d.lensHeight ? 'checked' : ''} onchange="LaserWorkModule.updateLaserGuideChecks()" style="width:18px;height:18px;"> 자
                        </label>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">기준 높이: 375mm</div>
                    <input type="hidden" id="lwLensHeight" value="${d.lensHeight || ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">각인 시간은 프로그램의 시간을 기록(sec) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="lwEngravingTime" value="${d.engravingTime || ''}" placeholder="0.0" oninput="LaserWorkModule.onEngravingTimeInput()">
                    <div id="lwLaserCycleDetail" style="font-size:0.86rem;line-height:1.45;color:var(--text-muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
                </div>
                <div class="form-group" style="margin:0;grid-column:1 / -1;">
                    <div style="min-height:40px;display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);">
                        <span style="font-size:0.86rem;color:var(--text-secondary);font-weight:700;white-space:nowrap;">프로그램 저장 이름 <span style="color:var(--accent-red)">*</span> :</span>
                        <span style="flex:1;min-width:0;font-size:1rem;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">[ <span id="lwProgramGuideName">${_laserProgramGuideName(d.partName || _selectedPartName, d.date || UIUtils.today())}</span> ]</span>
                        <span style="font-size:0.76rem;color:var(--text-muted);white-space:nowrap;">품명-yymmdd</span>
                        <label style="display:flex;align-items:center;gap:7px;margin:0;white-space:nowrap;cursor:pointer;">
                            <input type="checkbox" id="lwProgramNameChecked" ${d.programName ? 'checked' : ''} onchange="LaserWorkModule.updateLaserGuideChecks()" style="width:18px;height:18px;">
                            <span style="font-size:0.9rem;font-weight:700;color:var(--text-primary);">저장이름 확인</span>
                        </label>
                    </div>
                    <input type="hidden" id="lwProgramName" value="${d.programName || ''}">
                </div>
            </div>
            <div style="background:var(--bg-secondary); padding:10px 12px; border-radius:8px; margin-bottom:8px;">
                <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">checklist</span> 초중종물 확인 및 LOSS
                    <span id="lwQcRuleText" style="margin-left:auto;font-size:0.78rem;color:var(--accent-blue);font-weight:800;">작업수량 기준 자동 적용</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
                    ${(function(){
                        const firstDone  = !!(d.qcFirstQuality  && d.qcFirstPosition  && d.qcFirstPhoto);
                        const middleDone = !!(d.qcMiddleQuality && d.qcMiddlePosition && d.qcMiddlePhoto);
                        return [
                        ['lwQcFirst',  'lwQcFirstLoss',  '초품', 'First',  d.qcFirstLoss  ?? '', d.qcFirstQuality,  d.qcFirstPosition,  d.qcFirstPhoto,  d.qcFirstPhotoUrl  || '', true       ],
                        ['lwQcMiddle', 'lwQcMiddleLoss', '중품', 'Middle', d.qcMiddleLoss ?? '', d.qcMiddleQuality, d.qcMiddlePosition, d.qcMiddlePhoto, d.qcMiddlePhotoUrl || '', firstDone  ],
                        ['lwQcLast',   'lwQcLastLoss',   '종품', 'Last',   d.qcLastLoss   ?? '', d.qcLastQuality,   d.qcLastPosition,   d.qcLastPhoto,   d.qcLastPhotoUrl   || '', middleDone ]
                        ];
                    })().map(([cbId, inId, label, type, lossVal, ckQual, ckPos, ckPhoto, photoUrl, enabled]) => {
                        const previewSrc = photoUrl ? (typeof ApiClient !== 'undefined' ? ApiClient.photoUrl(photoUrl) : photoUrl) : '';
                        const done = !!(ckQual && ckPos && ckPhoto);
                        return `
                        <div id="${cbId}Card" style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;${enabled ? '' : 'opacity:0.4;pointer-events:none;'}">
                            <div style="display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:1px solid var(--border-color);">
                                <span id="${cbId}DoneIcon" class="material-symbols-outlined" style="font-size:1rem;color:${done ? 'var(--accent-blue)' : 'var(--text-muted)'};">check</span>
                                <span style="font-weight:700;font-size:0.88rem;">${label} 확인</span>
                            </div>
                            <div id="${cbId}SubItems" style="display:flex;flex-direction:column;gap:5px;">
                                <label style="display:flex;align-items:center;gap:5px;font-size:0.78rem;cursor:pointer;margin:0;">
                                    <input type="checkbox" id="${cbId}Quality" ${ckQual ? 'checked' : ''} onchange="LaserWorkModule.checkQcProgress()">
                                    <span>각인품질 확인</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:5px;font-size:0.78rem;cursor:pointer;margin:0;">
                                    <input type="checkbox" id="${cbId}Position" ${ckPos ? 'checked' : ''} onchange="LaserWorkModule.checkQcProgress()">
                                    <span>위치 도면확인</span>
                                </label>
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <label style="display:flex;align-items:center;gap:5px;font-size:0.78rem;margin:0;">
                                        <input type="checkbox" id="${cbId}Photo" ${ckPhoto ? 'checked' : ''} onclick="return false;" style="pointer-events:none;accent-color:var(--accent-blue);">
                                        <span>사진 등록</span>
                                    </label>
                                    <label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;padding:2px 8px;border:1px dashed var(--accent-blue);border-radius:4px;font-size:0.73rem;color:var(--accent-blue);white-space:nowrap;">
                                        <span class="material-symbols-outlined" style="font-size:13px;">add_photo_alternate</span>
                                        사진 선택
                                        <input type="file" id="${cbId}PhotoFile" accept="image/*" style="display:none;"
                                            onchange="LaserWorkModule.uploadQcPhoto('${type}', '${cbId}')">
                                    </label>
                                </div>
                                <div id="${cbId}PhotoPreviewWrap" style="display:${previewSrc ? 'block' : 'none'};">
                                    <img id="${cbId}PhotoPreview" src="${previewSrc}"
                                        style="max-width:100%;max-height:72px;border-radius:4px;border:1px solid var(--border-color);object-fit:cover;cursor:pointer;"
                                        onclick="LaserWorkModule.viewQcPhoto('${type}')">
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;border-top:1px solid var(--border-color);padding-top:7px;margin-top:auto;">
                                <label style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">LOSS</label>
                                <input type="number" class="form-input" id="${inId}" value="${lossVal}" min="0" placeholder="0"
                                    style="text-align:right;"
                                    oninput="LaserWorkModule.calcCompletedQty()">
                                <span style="font-size:0.75rem;color:var(--text-muted);">EA</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.18);border-radius:6px;font-size:0.85rem;">
                    <span style="color:var(--text-muted);">작업수량</span>
                    <span id="lwQtyDisplay" style="font-weight:700;">-</span>
                    <span style="color:var(--text-muted);">−</span>
                    <span style="color:var(--text-muted);">샘플LOSS</span>
                    <span id="lwLossDisplay" style="font-weight:700;color:#d97706;">-</span>
                    <span style="color:var(--text-muted);">=</span>
                    <span style="color:var(--text-muted);">작업완료수량</span>
                    <span id="lwCompletedDisplay" style="font-weight:800;font-size:1rem;color:var(--accent-blue);">-</span>
                    <span style="color:var(--text-muted);">EA</span>
                </div>
            </div>
            <div class="form-row">
                ${_workerSelect('lwWorker1', '작업자 1 - 조작원&외관검사', d.worker1 || '', true)}
                ${_workerSelect('lwWorker2', '작업자 2 - 각인검사', d.worker2 || '', true)}
                ${_workerSelect('lwWorker3', '작업자 3 - 제품지그', d.worker3 || '', false)}
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:-8px;">
                <button type="button" class="btn btn-outline btn-sm" onclick="LaserWorkModule.addExternalWorker()">
                    <span class="material-symbols-outlined" style="font-size:16px;">person_add</span> 외부 작업자 추가
                </button>
            </div>
            <div id="lwExternalWorkerRow" style="display:none;margin-top:8px;padding:10px 12px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">person_add</span>
                    <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);white-space:nowrap;">외부 작업자 이름</span>
                    <input type="text" class="form-input" id="lwExternalWorkerName" placeholder="이름 입력 후 추가"
                        style="flex:1;"
                        onkeydown="if(event.key==='Enter'){LaserWorkModule.confirmAddExternalWorker();}if(event.key==='Escape'){LaserWorkModule.cancelAddExternalWorker();}">
                    <button type="button" class="btn btn-primary btn-sm" onclick="LaserWorkModule.confirmAddExternalWorker()">추가</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="LaserWorkModule.cancelAddExternalWorker()">취소</button>
                </div>
            </div>
        `;
    }

    // ── 도장 LOT 다중 선택 관리 ───────────────────────────────────────
    function addLotRow(paintDate, lotNo, qty) {
        _selectedLots.push({ paintDate: paintDate || '', lotNo: lotNo || '', qty: Number(qty) || 0, manual: true });
        _syncSelectedLotQty();
        renderLotRows();
    }

    function removeLotRow(idx) {
        _selectedLots.splice(idx, 1);
        _syncSelectedLotQty();
        renderLotRows();
    }

    function updateLot(idx, field, value) {
        if (_selectedLots[idx]) {
            _selectedLots[idx][field] = field === 'qty' ? (Number(value) || 0) : value;
        }
        if (field === 'qty') {
            _syncSelectedLotQty();
            calcCompletedQty();
        }
    }

    function previewStandbyQty(idx, value) {
        const w = _standbyItems[idx];
        if (!w) return;
        _selectedCarModel = w.carModel || '';
        _selectedPartName = w.partName || '';
        _selectedColor = w.color || '';
        updateLaserGuideChecks();
        const qtyEl = document.getElementById('lwQuantity');
        if (qtyEl) qtyEl.value = Number(value) || '';
        calcCompletedQty();
    }

    function _syncSelectedLotQty() {
        const qtyEl = document.getElementById('lwQuantity');
        const total = _selectedLotQtyTotal();
        if (qtyEl) qtyEl.value = total > 0 ? total : '';
        _refreshLaserCycleSpec(false);
    }

    function renderLotRows() {
        const container = document.getElementById('lwLotContainer');
        if (!container) return;
        if (_selectedLots.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:4px 0;">대기품 선택 또는 + 버튼으로 도장 LOT를 추가하세요.</div>';
            return;
        }
        container.innerHTML = _selectedLots.map((l, i) => l.manual ? `
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.75rem; color:var(--text-muted); min-width:18px; text-align:center; font-weight:600;">${i + 1}</span>
                <input type="date" class="form-input" value="${l.paintDate}"
                       style="flex:0 0 140px;"
                       onchange="LaserWorkModule.updateLot(${i}, 'paintDate', this.value)">
                <input type="text" class="form-input" value="${l.lotNo}"
                       placeholder="사출 LOT 번호"
                       style="flex:1;"
                       oninput="LaserWorkModule.updateLot(${i}, 'lotNo', this.value)">
                <input type="text" class="form-input" value="${l.qty || ''}"
                       placeholder="작업수량"
                       inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true"
                       style="flex:0 0 110px; text-align:right;"
                       oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserWorkModule.updateLot(${i}, 'qty', this.value)">
                <button type="button" class="btn btn-sm btn-danger" onclick="LaserWorkModule.removeLotRow(${i})"
                        style="padding:4px 8px; flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">close</span>
                </button>
            </div>
        ` : `
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);">
                <span style="font-size:0.75rem;color:var(--text-muted);min-width:18px;text-align:center;font-weight:700;">${i + 1}</span>
                <div style="flex:0 0 138px;display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">도장LOT</span>
                    <span style="font-size:0.88rem;font-weight:800;color:var(--text-primary);">${l.paintDate || '-'}</span>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">사출LOT</span>
                    <span style="font-size:0.88rem;font-weight:800;color:var(--text-primary);">${l.lotNo || '-'}</span>
                </div>
                <div style="flex:0 0 118px;display:flex;flex-direction:column;gap:2px;text-align:right;">
                    <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">작업수량</span>
                    <span style="font-size:0.92rem;font-weight:800;color:var(--accent-blue);">${UIUtils.formatNumber(Number(l.qty) || 0)} EA</span>
                </div>
                <button type="button" class="btn btn-sm btn-danger" onclick="LaserWorkModule.removeLotRow(${i})"
                        style="padding:4px 8px;flex-shrink:0;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">close</span>
                </button>
            </div>
        `).join('');
    }

    // ── 레이저 대기품 필터 ─────────────────────────────────────────────
    // 차종 변경 → 품명 드롭다운 갱신
    function onSbCarChange() {
        const car     = (document.getElementById('lwSbCar')  || {}).value || '';
        const partSel = document.getElementById('lwSbPart');
        if (!partSel) return;

        const parts = [...new Set(
            _standbyItems.filter(w => !car || w.carModel === car).map(w => w.partName).filter(Boolean)
        )].sort();

        partSel.innerHTML = '<option value="">-- 품명 --</option>' +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
        partSel.disabled = parts.length === 0;

        const resEl = document.getElementById('lwStandbyResults');
        if (resEl) resEl.innerHTML = '<span style="color:var(--text-muted)">품명을 선택하세요.</span>';
        _renderResidualInfo('', '');
    }

    // 검사 후 잔량 현황 섹션 렌더링 (최근 외관검사 기록 기반)
    function _renderResidualInfo(car, part) {
        const el = document.getElementById('lwResidualInfo');
        if (!el) return;
        if (!car || !part) { el.style.display = 'none'; return; }

        const inspections = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const matching = inspections
            .filter(i => i.carModel === car && i.partName === part && typeof i.residualQty === 'number')
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                            (b.inspectionStartTime || '').localeCompare(a.inspectionStartTime || ''));

        if (matching.length === 0 || Number(matching[0].residualQty) === 0) {
            el.style.display = 'none';
            return;
        }

        const latest = matching[0];
        const residualQty = Number(latest.residualQty) || 0;

        el.style.display = 'block';
        el.innerHTML = `
        <div style="padding:8px 12px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.4);border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-orange);">inventory</span>
            <span style="font-weight:700;font-size:0.85rem;color:var(--accent-orange);">검사 후 잔량</span>
            <span style="font-size:0.78rem;color:var(--text-muted);">${car} / ${part}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">최근 검사일: ${latest.date || '-'}</span>
            <span style="margin-left:auto;font-size:1rem;font-weight:800;color:var(--accent-orange);">${UIUtils.formatNumber(residualQty)} EA</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">(외관검사 등록 시 자동 반영)</span>
        </div>`;
    }

    // 품명 변경 → 결과 테이블 렌더링
    function onSbPartChange() {
        const car  = (document.getElementById('lwSbCar')  || {}).value || '';
        const part = (document.getElementById('lwSbPart') || {}).value || '';
        renderStandbyResults(car, part);
        _renderResidualInfo(car, part);
    }

    // 필터 결과 테이블 렌더링 (선입선출: 도장작업일 오름차순)
    function renderStandbyResults(car, part) {
        const el = document.getElementById('lwStandbyResults');
        if (!el) return;
        if (!part) {
            el.innerHTML = '<span style="color:var(--text-muted)">품명을 선택하세요.</span>';
            return;
        }

        // 오름차순 정렬: 오래된 항목이 맨 위 (선입선출)
        const filtered = _standbyItems
            .filter(w => (!car || w.carModel === car) && w.partName === part)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        if (filtered.length === 0) {
            el.innerHTML = '<span style="color:var(--text-muted)">해당 품목의 대기품이 없습니다.</span>';
            return;
        }

        const oldestDate = filtered[0].date || '';

        // 현재 재고 합계: 보정 후 FIFO 행 합산(상단·행 잔여 동일 경로)
        const totalBalance = filtered.reduce(function(sum, w) {
            const lots = Array.isArray(w.lots) && w.lots.length > 0
                ? w.lots
                : [{ qty: Number(w.productionQty) || 0 }];
            return sum + lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        }, 0);

        el.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:8px;">
                <div style="font-size:0.75rem; color:var(--accent-green); font-weight:600; display:flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">swap_vert</span>
                    선입선출(FIFO) 순서 — 도장 LOT 오래된 순으로 정렬됨
                </div>
                <div style="display:flex; align-items:center; gap:6px; background:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.2); border-radius:6px; padding:3px 10px;">
                    <span class="material-symbols-outlined" style="font-size:14px; color:var(--accent-blue);">inventory_2</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">현재 재고 합계</span>
                    <span style="font-size:0.88rem; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(totalBalance)} EA</span>
                </div>
            </div>
            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
                <colgroup>
                    <col style="width:82px;">
                    <col style="width:86px;">
                    <col style="width:auto;">
                    <col style="width:64px;">
                    <col style="width:92px;">
                    <col style="width:150px;">
                    <col style="width:88px;">
                    <col style="width:120px;">
                    <col style="width:88px;">
                </colgroup>
                <thead>
                    <tr style="background:var(--bg-primary);">
                        <th style="padding:5px 8px; text-align:center; font-size:0.78rem; border-bottom:1px solid var(--border-color);">FIFO</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">차종</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">품명</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">컬러</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">도장LOT</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">사출LOT</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">잔여수량</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">작업수량</th>
                        <th style="padding:5px 8px; text-align:center; font-size:0.78rem; border-bottom:1px solid var(--border-color);">선택</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((w, i) => {
                        const globalIdx = _standbyItems.indexOf(w);
                        const isFirst = i === 0;
                        const rowBg = isFirst ? 'background:rgba(52,211,153,0.07);' : '';
                        const orderBadge = isFirst
                            ? `<span style="color:var(--accent-green);font-weight:700;font-size:0.8rem;">① 선출</span>`
                            : `<span style="color:#f59e0b;font-size:0.75rem;">⚠ 후순위</span>`;
                        // ✓ 같은 도장LOT(도장작업)은 사출LOT가 여러 개여도 한 행으로 묶고,
                        //   사출LOT는 참고용 목록으로만 표기한다 (선택/입력은 도장LOT 단위로 1번만).
                        const lots = Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ lotNo: w.lotNo || '', qty: Number(w.productionQty) || 0 }];
                        const totalQty = lots.reduce((s, l) => s + (Number(l.qty) || 0), 0);
                        const lotNoText = [...new Set(lots.map(l => l.lotNo).filter(Boolean))].join(', ') || '-';
                        const paintLotText = w.date ? w.date.replace(/-/g,'').slice(2,8) : '-';
                        const inputId = `lwLotPickQty_${globalIdx}`;
                        return `
                        <tr style="${rowBg}" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${rowBg}'">
                            <td style="padding:5px 8px; text-align:center; white-space:nowrap;">${orderBadge}</td>
                            <td style="padding:5px 8px; white-space:nowrap;">${w.carModel || '-'}</td>
                            <td style="padding:5px 8px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${w.partName || '-'}</td>
                            <td style="padding:5px 8px; white-space:nowrap;">${w.color || '-'}</td>
                            <td style="padding:5px 8px; font-family:monospace; font-size:0.8rem; color:var(--accent-green); white-space:nowrap;">${paintLotText}</td>
                            <td style="padding:5px 8px; font-family:monospace; font-size:0.78rem; white-space:normal; overflow-wrap:anywhere;" title="${lotNoText}">${lotNoText}</td>
                            <td style="padding:5px 8px; text-align:right; font-weight:700; color:var(--accent-blue); white-space:nowrap;">${UIUtils.formatNumber(totalQty)}</td>
                            <td style="padding:5px 8px; text-align:right;">
                                <input id="${inputId}" type="text" class="form-input" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" value="" placeholder="입력" style="height:30px;text-align:right;padding:4px 8px;"
                                       oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserWorkModule.previewStandbyQty(${globalIdx}, this.value)">
                            </td>
                            <td style="padding:5px 8px; text-align:center; white-space:nowrap;">
                                <button class="btn btn-sm btn-primary" onclick="LaserWorkModule.selectStandbyItem(${globalIdx}, '${inputId}')">LOT 선택</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    // 대기품 항목 선택 → 폼 자동 채움 + 선입선출 경고
    // ✓ 도장LOT(도장작업) 단위로 선택한다. 사출LOT가 여러 개여도 pickQty를 사출LOT 순서대로
    //   배분해 _selectedLots에 기록만 남기고(선입선출), 사용자는 도장LOT 1건으로만 조작한다.
    function selectStandbyItem(idx, qtyInputId) {
        const w = _standbyItems[idx];
        if (!w) return;
        const lots = Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ lotNo: w.lotNo || '', qty: Number(w.productionQty) || 0 }];
        const maxQty = lots.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
        const pickQty = Number((document.getElementById(qtyInputId) || {}).value) || 0;
        if (pickQty <= 0) {
            UIUtils.toast('작업수량을 입력하세요.', 'warning');
            return;
        }
        if (pickQty > maxQty) {
            UIUtils.toast(`잔여수량(${UIUtils.formatNumber(maxQty)}EA)보다 큰 수량은 선택할 수 없습니다.`, 'warning');
            return;
        }
        // 이 도장LOT(도장작업일 기준)에서 이미 선택된 수량 합계 — 사출LOT 구분 없이 전체로 체크
        const sameSelectedQty = _selectedLots
            .filter(row => (row.paintDate || '') === (w.date || ''))
            .reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
        if (sameSelectedQty + pickQty > maxQty) {
            UIUtils.toast(`이미 선택한 수량을 포함하면 잔여수량(${UIUtils.formatNumber(maxQty)}EA)을 초과합니다.`, 'warning');
            return;
        }

        // 선입선출(FIFO) 체크: 같은 차종/품명 중 가장 오래된 항목인지 확인
        const sameItems = _standbyItems
            .filter(s => s.carModel === w.carModel && s.partName === w.partName)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const oldestDate = sameItems.length > 0 ? (sameItems[0].date || '') : '';
        if (w.date > oldestDate) {
            UIUtils.toast(
                `⚠ 선입선출 원칙 위반: 더 오래된 재고가 있습니다 (도장일: ${oldestDate})`,
                'warning'
            );
        }

        // 차종/품명/컬러 모듈 변수에 저장
        _selectedCarModel = w.carModel || '';
        _selectedPartName = w.partName || '';
        _selectedColor    = w.color    || '';
        updateLaserGuideChecks();

        // ✓ pickQty를 이 도장LOT의 사출LOT들에 순서대로(선입선출) 배분해 각각 기록으로 남긴다.
        //   이미 다른 선택으로 소모된 사출LOT 잔량은 제외하고 배분한다.
        const consumedByLot = {};
        _selectedLots.forEach(row => {
            if ((row.paintDate || '') !== (w.date || '')) return;
            const key = row.lotNo || '';
            consumedByLot[key] = (consumedByLot[key] || 0) + (Number(row.qty) || 0);
        });
        let remaining = pickQty;
        lots.forEach(lot => {
            if (remaining <= 0) return;
            const lotNo = lot.lotNo || w.lotNo || '';
            const already = consumedByLot[lotNo] || 0;
            const available = Math.max(0, (Number(lot.qty) || 0) - already);
            if (available <= 0) return;
            const take = Math.min(available, remaining);
            if (take > 0) {
                _selectedLots.push({ paintDate: w.date || '', lotNo, qty: take, manual: false });
                consumedByLot[lotNo] = already + take;
                remaining -= take;
            }
        });
        renderLotRows();

        // 선택한 작업수량만 총 작업수량에 반영
        const qtyEl = document.getElementById('lwQuantity');
        if (qtyEl) qtyEl.value = _selectedLotQtyTotal() || '';
        _refreshLaserCycleSpec(true);
        calcCompletedQty();
        updateStandardEndTime(false);

        // 연결 제품 감지 → 분할 패널 표시
        const splitPanel = document.getElementById('lwSplitPanel');
        if (splitPanel) {
            const allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const selProd = _findProductForWork(w.carModel, w.partName, w.color);
            const linkedProdId = selProd ? selProd.linkedProductId : null;
            const linkedProd = linkedProdId ? allProds.find(p => p.id === linkedProdId) : null;
            if (linkedProd) {
                document.getElementById('lwSplitLinkedProductId').value = linkedProd.id;
                document.getElementById('lwSplitLabelA').textContent = `${selProd.partName} (${selProd.customer || '납품처 없음'})`;
                document.getElementById('lwSplitLabelB').textContent = `${linkedProd.partName} (${linkedProd.customer || '납품처 없음'})`;
                const stock = _selectedLotQtyTotal() || pickQty;
                document.getElementById('lwSplitStock').textContent = UIUtils.formatNumber(stock);
                splitPanel.style.display = 'block';
            } else {
                splitPanel.style.display = 'none';
            }
        }

        const lotSummary = [...new Set(lots.map(l => l.lotNo).filter(Boolean))].join(', ') || '-';
        UIUtils.toast(`${w.carModel} / ${w.partName} / ${lotSummary} ${UIUtils.formatNumber(pickQty)}EA 선택되었습니다.`, 'success');
    }

    function onSplitQtyChange() {
        const qA = Number((document.getElementById('lwSplitQtyA') || {}).value) || 0;
        const qB = Number((document.getElementById('lwSplitQtyB') || {}).value) || 0;
        const stock = Number(String((document.getElementById('lwSplitStock') || {}).textContent || '').replace(/,/g, '')) || 0;
        const total = qA + qB;
        const ok = total === stock;
        const el = document.getElementById('lwSplitTotal');
        if (el) el.innerHTML = `합계: <strong style="color:${ok ? 'var(--accent-green)' : 'var(--accent-red)'};">${UIUtils.formatNumber(total)}</strong> / 대기 <strong id="lwSplitStock">${UIUtils.formatNumber(stock)}</strong> EA
            ${!ok && total > 0 ? `<span style="margin-left:8px;font-size:0.75rem;color:var(--accent-red);">⚠ 합계가 대기 수량과 다릅니다</span>` : ''}`;
    }

    function onCarModelChange(prevPart = '', prevColor = '') {
        const car = document.getElementById('lwCarModel').value;
        const partSelect = document.getElementById('lwPartName');
        const colorSelect = document.getElementById('lwColor');
        const products = _getLaserRelatedProducts();

        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';

        _renderResidualInfo('', '');
        if (!car) return;
        const parts = [...new Set(products.filter(p => _productCarName(p) === car).map(_productPartName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            parts.map(p => `<option value="${p}" ${p === prevPart ? 'selected' : ''}>${p}</option>`).join('');

        if (prevPart) onPartChange(prevPart, prevColor);
    }

    function onPartChange(selectedPart = '', prevColor = '') {
        const car = document.getElementById('lwCarModel').value;
        const part = selectedPart || document.getElementById('lwPartName').value;
        const colorSelect = document.getElementById('lwColor');
        const products = _getLaserRelatedProducts();

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        if (!car || !part) return;

        const colors = [...new Set(products.filter(p => _productCarName(p) === car && _productPartName(p) === part).map(_productColorName).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}" ${c === prevColor ? 'selected' : ''}>${c}</option>`).join('');
        _selectedCarModel = car;
        _selectedPartName = part;
        _selectedColor = prevColor || colorSelect.value || '';
        updateLaserGuideChecks();
        _refreshLaserCycleSpec(true);
        _renderResidualInfo(car, part);
    }

    function refreshLaserCycleSpec(forceValue = false) {
        const carEl = document.getElementById('lwCarModel');
        const partEl = document.getElementById('lwPartName');
        const colorEl = document.getElementById('lwColor');
        if (carEl) _selectedCarModel = carEl.value || '';
        if (partEl) _selectedPartName = partEl.value || '';
        if (colorEl) _selectedColor = colorEl.value || '';
        updateLaserGuideChecks();
        _refreshLaserCycleSpec(forceValue);
    }

    function toggleManualSection() {
        const checked = !!((document.getElementById('lwManualToggle') || {}).checked);
        const section = document.getElementById('lwManualSection');
        if (section) section.style.display = checked ? 'block' : 'none';
    }

    function onQcToggle(cbId) {
        const cb = document.getElementById(cbId);
        const sub = document.getElementById(cbId + 'SubItems');
        if (!cb || !sub) return;
        sub.style.display = cb.checked ? 'flex' : 'none';
        checkQcProgress();
    }

    function _qcStageComplete(prefix) {
        const g = id => !!(document.getElementById(id) || {}).checked;
        return g(prefix + 'Quality') && g(prefix + 'Position') && g(prefix + 'Photo');
    }

    function _qcStageTouched(prefix) {
        const g = id => !!(document.getElementById(id) || {}).checked;
        return g(prefix + 'Quality') || g(prefix + 'Position') || g(prefix + 'Photo');
    }

    function _currentWorkQtyForQc() {
        return Number((document.getElementById('lwQuantity') || {}).value) || _selectedLotQtyTotal() || 0;
    }

    function _qcRequiredStages(qty = _currentWorkQtyForQc()) {
        const n = Number(qty) || 0;
        if (n > 0 && n <= 4000) return { first: true, middle: false, last: false, label: '4,000개 이하: 초품' };
        if (n > 0 && n <= 8000) return { first: true, middle: false, last: true, label: '4,001~8,000개: 초품 + 종품' };
        return { first: true, middle: true, last: true, label: '8,000개 초과: 초품 + 중품 + 종품' };
    }

    function checkQcProgress() {
        const required = _qcRequiredStages();
        const firstDone  = _qcStageComplete('lwQcFirst');

        function setStageDoneVisual(prefix, done) {
            const icon = document.getElementById(prefix + 'DoneIcon');
            if (icon) icon.style.color = done ? 'var(--accent-blue)' : 'var(--text-muted)';
        }

        function clearStage(prefix) {
            [prefix, `${prefix}Quality`, `${prefix}Position`, `${prefix}Photo`].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });
            const loss = document.getElementById(`${prefix}Loss`);
            if (loss) loss.value = '';
        }

        function setCardEnabled(prefix, enabled, isRequired = true) {
            const card = document.getElementById(prefix + 'Card');
            if (!card) return;
            card.style.opacity = enabled ? '' : '0.4';
            card.style.pointerEvents = enabled ? '' : 'none';
            card.dataset.required = isRequired ? '1' : '0';
            const sub = document.getElementById(prefix + 'SubItems');
            if (sub) sub.style.display = 'flex';
            const cb = document.getElementById(prefix);
            if (cb) cb.disabled = !enabled;
        }

        setCardEnabled('lwQcFirst', true, true);
        setCardEnabled('lwQcMiddle', required.middle, required.middle);
        setCardEnabled('lwQcLast', required.last, required.last);
        setStageDoneVisual('lwQcFirst', firstDone);
        setStageDoneVisual('lwQcMiddle', required.middle && _qcStageComplete('lwQcMiddle'));
        setStageDoneVisual('lwQcLast', required.last && _qcStageComplete('lwQcLast'));

        const ruleEl = document.getElementById('lwQcRuleText');
        if (ruleEl) ruleEl.textContent = required.label;

        if (!required.middle) clearStage('lwQcMiddle');
        if (!required.last) clearStage('lwQcLast');
    }

    async function uploadQcPhoto(type, cbId) {
        const input = document.getElementById(cbId + 'PhotoFile');
        if (!input || !input.files[0]) return;
        const file = input.files[0];
        const toast = UIUtils.toast('사진 업로드 중...', 'info');
        try {
            const url = await ApiClient.uploadPhoto(file, 'laser');
            _qcPhotos[type] = { name: file.name, url };
            const wrap = document.getElementById(cbId + 'PhotoPreviewWrap');
            const img  = document.getElementById(cbId + 'PhotoPreview');
            if (img)  img.src = ApiClient.photoUrl(url);
            if (wrap) wrap.style.display = 'block';
            const photoCb = document.getElementById(cbId + 'Photo');
            if (photoCb) photoCb.checked = true;
            checkQcProgress();
            UIUtils.toast('사진 업로드 완료', 'success');
        } catch (e) {
            UIUtils.toast('사진 업로드 실패: ' + e.message, 'error');
        }
    }

    function viewQcPhoto(type) {
        const p = _qcPhotos[type];
        if (!p || !p.url) return;
        const src = ApiClient.photoUrl(p.url);
        UIUtils.showModal('사진 확인', `<img src="${src}" style="max-width:100%;border-radius:8px;">`, '', 'md');
    }

    // 작업 이력 테이블의 초/중/종품 썸네일 클릭 시 원본 크기로 확인
    function viewQcPhotoUrl(url, label) {
        if (!url) return;
        const src = typeof ApiClient !== 'undefined' ? ApiClient.photoUrl(url) : url;
        UIUtils.showModal(label ? `${label} 사진 확인` : '사진 확인', `<img src="${src}" style="max-width:100%;border-radius:8px;">`, '', 'md');
    }

    function calcCompletedQty() {
        const qty   = Number((document.getElementById('lwQuantity') || {}).value) || _selectedLotQtyTotal();
        // ✓ 단일 LOT인 경우, 수량 필드를 직접 수정하면 LOT 수량도 함께 동기화한다.
        //   (동기화하지 않으면 저장 시 LOT 합계가 우선 적용되어 사용자의 수량 수정이 조용히 무시됨)
        if (_selectedLots.length === 1 && qty > 0) {
            _selectedLots[0].qty = qty;
        }
        checkQcProgress();
        const loss1 = Number((document.getElementById('lwQcFirstLoss')  || {}).value) || 0;
        const loss2 = Number((document.getElementById('lwQcMiddleLoss') || {}).value) || 0;
        const loss3 = Number((document.getElementById('lwQcLastLoss')   || {}).value) || 0;
        const total = loss1 + loss2 + loss3;
        const completed = Math.max(0, qty - total);
        const fmt = UIUtils.formatNumber;
        const qd = document.getElementById('lwQtyDisplay');
        const ld = document.getElementById('lwLossDisplay');
        const cd = document.getElementById('lwCompletedDisplay');
        if (qd) qd.textContent = fmt(qty);
        if (ld) ld.textContent = fmt(total);
        if (cd) cd.textContent = fmt(completed);
        _refreshLaserCycleSpec(false);
        updateStandardEndTime(true);
    }

    function addExternalWorker() {
        const row = document.getElementById('lwExternalWorkerRow');
        if (!row) return;
        const isVisible = row.style.display !== 'none';
        row.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            const input = document.getElementById('lwExternalWorkerName');
            if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
        }
    }

    function confirmAddExternalWorker() {
        const input = document.getElementById('lwExternalWorkerName');
        const cleanName = String((input || {}).value || '').trim();
        if (!cleanName) { if (input) input.focus(); return; }
        if (!_externalWorkers.includes(cleanName)) _externalWorkers.push(cleanName);

        ['lwWorker1', 'lwWorker2', 'lwWorker3'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const exists = Array.from(select.options).some(opt => opt.value === cleanName);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = cleanName;
                opt.textContent = cleanName;
                select.appendChild(opt);
            }
        });

        const firstEmpty = ['lwWorker1', 'lwWorker2', 'lwWorker3']
            .map(id => document.getElementById(id))
            .find(sel => sel && !sel.value);
        if (firstEmpty) firstEmpty.value = cleanName;

        const row = document.getElementById('lwExternalWorkerRow');
        if (row) row.style.display = 'none';
    }

    function cancelAddExternalWorker() {
        const row = document.getElementById('lwExternalWorkerRow');
        if (row) row.style.display = 'none';
    }

    function _inputValue(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function _focusInput(id) {
        const el = document.getElementById(id);
        if (el && typeof el.focus === 'function') el.focus();
    }

    function collectData() {
        updateLaserGuideChecks();
        checkQcProgress();
        const manualEnabled = !!((document.getElementById('lwManualToggle') || {}).checked);
        const manualCarModel = (document.getElementById('lwCarModel') || {}).value || '';
        const manualPartName = (document.getElementById('lwPartName') || {}).value || '';
        const manualColor = (document.getElementById('lwColor') || {}).value || '';
        const manualPaintLot = (document.getElementById('lwManualPaintLot') || {}).value || '';
        const manualInjLot = (document.getElementById('lwManualInjLot') || {}).value || '';
        const effectiveLots = _selectedLots.length > 0
            ? _selectedLots
            : (manualEnabled && (manualPaintLot || manualInjLot) ? [{ paintDate: manualPaintLot, lotNo: manualInjLot }] : []);
        const mergedLots = _mergeLots(effectiveLots);
        const selectedLotQty = mergedLots.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
        const _qcFirstLoss  = Number((document.getElementById('lwQcFirstLoss')  || {}).value) || 0;
        const _qcMiddleLoss = Number((document.getElementById('lwQcMiddleLoss') || {}).value) || 0;
        const _qcLastLoss   = Number((document.getElementById('lwQcLastLoss')   || {}).value) || 0;
        const _totalLoss    = _qcFirstLoss + _qcMiddleLoss + _qcLastLoss;
        const _workQty      = selectedLotQty > 0 ? selectedLotQty : (Number((document.getElementById('lwQuantity') || {}).value) || 0);
        const _completedQty = Math.max(0, _workQty - _totalLoss);
        const _cycleSpec = _getLaserCycleSpec(
            _selectedCarModel || (manualEnabled ? manualCarModel : ''),
            _selectedPartName || (manualEnabled ? manualPartName : ''),
            _selectedColor || (manualEnabled ? manualColor : '')
        );
        const effectiveCarModel = _selectedCarModel || (manualEnabled ? manualCarModel : '');
        const effectivePartName = _selectedPartName || (manualEnabled ? manualPartName : '');
        const effectiveColor = _selectedColor || (manualEnabled ? manualColor : '');
        const effectiveProduct = _findProductForWork(effectiveCarModel, effectivePartName, effectiveColor);
        return {
            date: document.getElementById('lwDate').value,
            machine: document.getElementById('lwMachine').value,
            startTime: document.getElementById('lwStartTime').value,
            endTime: document.getElementById('lwEndTime').value,
            standardEndTime: (document.getElementById('lwEndTime') || {}).dataset?.standardEnd || '',
            overtimeReason: (document.getElementById('lwOvertimeReason') || {}).value?.trim() || '',
            overtimeNotified: (document.getElementById('lwOvertimeNotified') || {}).value === '1',
            productId: effectiveProduct ? (effectiveProduct.id || '') : '',
            carModel: effectiveCarModel,
            partName: effectivePartName,
            color: effectiveColor,
            paintDate: mergedLots.length > 0 ? (mergedLots[0].paintDate || '') : '',
            paintLots: mergedLots.map(l => ({ paintDate: l.paintDate, lotNo: l.lotNo, qty: Number(l.qty) || 0, manual: !!l.manual })),
            manualInput: manualEnabled && _selectedLots.length === 0,
            engravingTime: Number(document.getElementById('lwEngravingTime').value) || 0,
            quantity: selectedLotQty > 0 ? selectedLotQty : (Number(document.getElementById('lwQuantity').value) || 0),
            paintLot: [...new Set(mergedLots.map(l => l.lotNo).filter(Boolean))].join(', '),
            programName: document.getElementById('lwProgramName').value.trim(),
            lensHeight: document.getElementById('lwLensHeight').value.trim(),
            qcFirst: _qcStageTouched('lwQcFirst'),
            qcMiddle: _qcStageTouched('lwQcMiddle'),
            qcLast: _qcStageTouched('lwQcLast'),
            qcFirstQuality:  (document.getElementById('lwQcFirstQuality')  || {}).checked || false,
            qcFirstPosition: (document.getElementById('lwQcFirstPosition') || {}).checked || false,
            qcFirstPhoto:    (document.getElementById('lwQcFirstPhoto')    || {}).checked || false,
            qcMiddleQuality:  (document.getElementById('lwQcMiddleQuality')  || {}).checked || false,
            qcMiddlePosition: (document.getElementById('lwQcMiddlePosition') || {}).checked || false,
            qcMiddlePhoto:    (document.getElementById('lwQcMiddlePhoto')    || {}).checked || false,
            qcLastQuality:  (document.getElementById('lwQcLastQuality')  || {}).checked || false,
            qcLastPosition: (document.getElementById('lwQcLastPosition') || {}).checked || false,
            qcLastPhoto:    (document.getElementById('lwQcLastPhoto')    || {}).checked || false,
            qcFirstPhotoUrl:  (_qcPhotos.First  && _qcPhotos.First.url)  || '',
            qcMiddlePhotoUrl: (_qcPhotos.Middle && _qcPhotos.Middle.url) || '',
            qcLastPhotoUrl:   (_qcPhotos.Last   && _qcPhotos.Last.url)   || '',
            qcFirstLoss:  _qcFirstLoss,
            qcMiddleLoss: _qcMiddleLoss,
            qcLastLoss:   _qcLastLoss,
            completedQty: _completedQty,
            packUnit: (() => { const s = String(_cycleSpec.packUnit||'').replace(/,/g,''); return Number(s) || Number((s.match(/^(\d+(?:\.\d+)?)/)||[])[1]) || 0; })(),
            worker1: document.getElementById('lwWorker1').value.trim(),
            worker2: document.getElementById('lwWorker2').value.trim(),
            worker3: document.getElementById('lwWorker3').value.trim()
        };
    }

    // strict=false(등록/저장 시): 초품만 필수 — 초중종품은 시차를 두고 나중에 입력하므로 등록 시점엔 중품/종품을 강제하지 않는다.
    // strict=true(작업완료 시): 수량 기준으로 요구되는 초/중/종품을 모두 필수로 검사한다.
    function validateWorkRequired(data, opts = {}) {
        const strict = opts.strict !== false;
        const manualEnabled = !!((document.getElementById('lwManualToggle') || {}).checked);
        const missing = [];
        let focusId = '';
        const add = (label, id) => {
            if (!missing.includes(label)) missing.push(label);
            if (!focusId && id) focusId = id;
        };

        if (!data.carModel) add('차종', manualEnabled ? 'lwCarModel' : 'lwSbCar');
        if (!data.partName) add('품명', manualEnabled ? 'lwPartName' : 'lwSbPart');
        if (!data.color) add('컬러', 'lwColor');
        if (!data.quantity || Number(data.quantity) <= 0) add('작업수량', 'lwQuantity');

        // 제품 마스터에 등록된 컬러만 허용
        if (data.carModel && data.partName && data.color) {
            const masterColors = [...new Set((_getLaserRelatedProducts() || [])
                .filter(function(p) {
                    return _productCarName(p) === data.carModel && _productPartName(p) === data.partName;
                })
                .map(_productColorName)
                .filter(Boolean))];
            if (masterColors.length && masterColors.indexOf(data.color) < 0) {
                UIUtils.toast('컬러는 제품 마스터에 등록된 값만 사용할 수 있습니다: ' + masterColors.join(', '), 'warning');
                _focusInput('lwColor');
                return false;
            }
            if (!masterColors.length) {
                UIUtils.toast('제품 마스터에 해당 차종·품명이 없습니다.', 'warning');
                return false;
            }
        }

        if (manualEnabled && _selectedLots.length === 0) {
            const paintLotWrap = document.getElementById('lwManualPaintLotWrap');
            const paintLotNeeded = !paintLotWrap || paintLotWrap.style.display !== 'none';
            if (paintLotNeeded && !_inputValue('lwManualPaintLot')) add('도장 LOT', 'lwManualPaintLot');
            if (!_inputValue('lwManualInjLot')) add('사출 LOT', 'lwManualInjLot');
        } else {
            if (!_selectedLots.length) add('작업 LOT 선택', 'lwSbCar');
            _selectedLots.forEach((lot, idx) => {
                if (!String(lot.paintDate || '').trim()) add(`LOT ${idx + 1} 도장작업일`, '');
                if (!String(lot.lotNo || '').trim()) add(`LOT ${idx + 1} 사출 LOT`, '');
                if (!(Number(lot.qty) > 0)) add(`LOT ${idx + 1} 작업수량`, '');
            });
        }

        if (!data.date) add('작업일자', 'lwDate');
        if (!data.machine) add('레이져 장비', 'lwMachine');
        if (!data.startTime) add('시작 시간', 'lwStartTime');
        if (!data.endTime) add('완료 시간', 'lwEndTime');
        if (_isEndOverStandard() && !data.overtimeReason) add('완료 지연 사유', 'lwOvertimeReason');
        if (_isEndOverStandard() && data.overtimeReason && !data.overtimeNotified) add('관리자 통보', 'lwNotifyManagerBtn');
        if (!(Number(data.engravingTime) > 0)) add('각인 시간', 'lwEngravingTime');
        if (!data.programName) add('저장이름 확인', 'lwProgramNameChecked');
        if (!data.lensHeight) add('렌즈 높이 포인터/자 확인', 'lwLensPointerChecked');

        const requiredQc = strict ? _qcRequiredStages(data.quantity) : { first: true, middle: false, last: false };
        [
            ['초품', 'lwQcFirst', data.qcFirstQuality, data.qcFirstPosition, data.qcFirstPhoto, requiredQc.first],
            ['중품', 'lwQcMiddle', data.qcMiddleQuality, data.qcMiddlePosition, data.qcMiddlePhoto, requiredQc.middle],
            ['종품', 'lwQcLast', data.qcLastQuality, data.qcLastPosition, data.qcLastPhoto, requiredQc.last],
        ].filter(row => row[5]).forEach(([label, prefix, qual, pos, photo]) => {
            if (!qual) add(`${label} 각인품질 확인`, `${prefix}Quality`);
            if (!pos) add(`${label} 위치 도면확인`, `${prefix}Position`);
            if (!photo) add(`${label} 사진 등록`, `${prefix}PhotoFile`);
        });

        if (_inputValue('lwQcFirstLoss') === '') add('초품 LOSS', 'lwQcFirstLoss');
        if (requiredQc.middle && _inputValue('lwQcMiddleLoss') === '') add('중품 LOSS', 'lwQcMiddleLoss');
        if (requiredQc.last && _inputValue('lwQcLastLoss') === '') add('종품 LOSS', 'lwQcLastLoss');

        if (!data.worker1) add('작업자 1', 'lwWorker1');
        if (!data.worker2) add('작업자 2', 'lwWorker2');

        if (missing.length) {
            UIUtils.toast(`필수 입력 항목을 확인하세요: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` 외 ${missing.length - 6}개` : ''}`, 'warning');
            _focusInput(focusId);
            return false;
        }
        return true;
    }

    // 수량 기준 요구되는 초/중/종품이 실제로 모두 입력 완료됐는지 확인 (완료 상태 자동 판정용)
    function _isFullyQcComplete(quantity) {
        const req = _qcRequiredStages(quantity);
        if (req.first && !_qcStageComplete('lwQcFirst')) return false;
        if (req.middle && !_qcStageComplete('lwQcMiddle')) return false;
        if (req.last && !_qcStageComplete('lwQcLast')) return false;
        if (_inputValue('lwQcFirstLoss') === '') return false;
        if (req.middle && _inputValue('lwQcMiddleLoss') === '') return false;
        if (req.last && _inputValue('lwQcLastLoss') === '') return false;
        return true;
    }

    // 저장된 작업 기록 기준 초/중/종품 입력 완료 여부 (외관 검사 대기 유입 조건)
    function isWorkQcFullyEntered(work) {
        if (!work) return false;
        // 작업중(in_progress)은 초중종 미완료로 취급 — 검사 대기로 넘기지 않음
        if (work.status === 'in_progress') return false;
        const req = _qcRequiredStages(work.quantity);
        if (req.first) {
            const ok = !!(work.qcFirstQuality && work.qcFirstPosition && work.qcFirstPhoto) || !!work.qcFirst;
            if (!ok) return false;
            if (work.qcFirstLoss === undefined || work.qcFirstLoss === null || work.qcFirstLoss === '') return false;
        }
        if (req.middle) {
            const ok = !!(work.qcMiddleQuality && work.qcMiddlePosition && work.qcMiddlePhoto) || !!work.qcMiddle;
            if (!ok) return false;
            if (work.qcMiddleLoss === undefined || work.qcMiddleLoss === null || work.qcMiddleLoss === '') return false;
        }
        if (req.last) {
            const ok = !!(work.qcLastQuality && work.qcLastPosition && work.qcLastPhoto) || !!work.qcLast;
            if (!ok) return false;
            if (work.qcLastLoss === undefined || work.qcLastLoss === null || work.qcLastLoss === '') return false;
        }
        return true;
    }

    function _checkLotQtyMatch(data) {
        if (_selectedLots.length > 0) {
            const lotQty = _selectedLotQtyTotal();
            if (lotQty <= 0) {
                UIUtils.toast('선택한 LOT의 작업수량을 입력하세요.', 'warning');
                return false;
            }
            if (Math.abs(lotQty - Number(data.quantity || 0)) > 0.001) {
                UIUtils.toast(`LOT 작업수량 합계(${UIUtils.formatNumber(lotQty)}EA)와 작업수량(${UIUtils.formatNumber(data.quantity)}EA)이 일치하지 않습니다.`, 'warning');
                return false;
            }
        }
        return true;
    }

    async function openAddModal(prefill) {
        // 대기품 목록에 수기 등록 재고까지 반영되도록, 모달을 열기 전에 로드를 보장한다.
        try {
            if (typeof LaserStandbyModule !== 'undefined' && LaserStandbyModule.ensureManualOverridesLoadedForWork) {
                await LaserStandbyModule.ensureManualOverridesLoadedForWork();
            }
        } catch (e) { /* 무시 — 실패해도 도장 작업일지 기준 목록은 정상 표시 */ }

        const p = prefill || null;
        _selectedLots = [];
        _selectedCarModel = '';
        _selectedPartName = '';
        _selectedColor = '';

        let formData = {};
        if (p) {
            _selectedCarModel = p.carModel || '';
            _selectedPartName = p.partName || '';
            _selectedColor = p.color || '';
            if (Array.isArray(p.paintLots) && p.paintLots.length > 0) {
                _selectedLots = p.paintLots.map(function(lot) {
                    return {
                        paintDate: lot.paintDate || '',
                        lotNo: lot.lotNo || '',
                        qty: Number(lot.qty) || 0,
                        manual: !!lot.manual
                    };
                });
            } else if (p.paintDate || p.paintLot || p.lotNo) {
                _selectedLots = [{
                    paintDate: p.paintDate || p.date || '',
                    lotNo: p.paintLot || p.lotNo || '',
                    qty: Number(p.quantity) || Number(p.productionQty) || 0,
                    manual: false
                }];
            }
            formData = {
                date: p.workDate || UIUtils.today(),
                machine: p.machine || '',
                startTime: p.startTime || '',
                endTime: p.endTime || '',
                carModel: _selectedCarModel,
                partName: _selectedPartName,
                color: _selectedColor,
                quantity: Number(p.quantity) || Number(p.productionQty) || 0,
                programName: p.programName || '',
                lensHeight: p.lensHeight || ''
            };
        }

        _qcPhotos = { First: null, Middle: null, Last: null };
        UIUtils.showModal('레이져 작업 등록', buildFormHTML(formData), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWorkModule.saveNew()">등록</button>
        `, 'lg');
        setTimeout(renderLotRows, 0);
        setTimeout(updateLaserGuideChecks, 0);
        setTimeout(() => _refreshLaserCycleSpec(false), 0);
        setTimeout(calcCompletedQty, 0);
        setTimeout(checkQcProgress, 0);
        setTimeout(updateOvertimeReasonVisibility, 0);
        if (!p) {
            setTimeout(function() {
                const carEl = document.getElementById('lwCarModel');
                if (carEl) {
                    onCarModelChange();
                }
                toggleManualSection();
            }, 0);
        }
    }

    // 납품처 분할 등록 시 같은 전체 LOT를 양쪽 작업에 복사하면 LOT 출고가 중복된다.
    // 원본 LOT 순서를 유지한 채 첫 작업 수량만큼 먼저 배분하고 나머지를 연결 제품에 넘긴다.
    function _partitionPaintLotsForSplit(lots, firstQty) {
        let remainingFirst = Math.max(0, Number(firstQty) || 0);
        const first = [];
        const second = [];
        (Array.isArray(lots) ? lots : []).forEach(function(lot) {
            const qty = Math.max(0, Number(lot && lot.qty) || 0);
            if (qty <= 0) return;
            const firstUsed = Math.min(qty, remainingFirst);
            const secondUsed = qty - firstUsed;
            const base = {
                paintDate: String((lot && lot.paintDate) || ''),
                lotNo: String((lot && lot.lotNo) || ''),
                manual: !!(lot && lot.manual)
            };
            if (firstUsed > 0) first.push({ ...base, qty: firstUsed });
            if (secondUsed > 0) second.push({ ...base, qty: secondUsed });
            remainingFirst -= firstUsed;
        });
        return { first, second };
    }

    function _withSplitPaintLots(data, quantity, paintLots, identityPatch) {
        const lots = Array.isArray(paintLots) ? paintLots : [];
        return {
            ...data,
            ...(identityPatch || {}),
            quantity,
            paintLots: lots,
            paintDate: lots.length > 0 ? (lots[0].paintDate || '') : '',
            paintLot: [...new Set(lots.map(function(lot) { return lot.lotNo; }).filter(Boolean))].join(', ')
        };
    }

    async function saveNew() {
        const data = collectData();
        if (!validateWorkRequired(data, { strict: false })) return;
        if (!_checkLotQtyMatch(data)) return;

        // 등록은 항상 '작업중' 상태 — 완료 처리는 오직 '작업완료' 버튼으로만 한다.
        // (초품만 필요한 소량 작업도 등록 시점엔 작업중으로 두고, 명시적 완료를 거쳐 이력으로 이동)
        data.status = 'in_progress';

        // 분할 등록: 연결 제품이 있고 분할 수량이 입력된 경우
        const splitPanel = document.getElementById('lwSplitPanel');
        const linkedProductId = (document.getElementById('lwSplitLinkedProductId') || {}).value || '';
        if (splitPanel && splitPanel.style.display !== 'none' && linkedProductId) {
            const qAVal = _inputValue('lwSplitQtyA');
            const qBVal = _inputValue('lwSplitQtyB');
            if (qAVal === '' || qBVal === '') {
                UIUtils.toast('분할 수량도 모두 입력하세요.', 'warning');
                _focusInput(qAVal === '' ? 'lwSplitQtyA' : 'lwSplitQtyB');
                return;
            }
            const qA = Number(qAVal) || 0;
            const qB = Number(qBVal) || 0;
            if (qA + qB !== data.quantity) {
                UIUtils.toast(`분할 수량 합계(${qA + qB})가 대기 수량(${data.quantity})과 다릅니다.`, 'warning');
                return;
            }
            const allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const linkedProd = allProds.find(p => p.id === linkedProductId);
            if (qB > 0 && !linkedProd) {
                UIUtils.toast('연결 제품 정보를 찾을 수 없습니다. 제품 마스터의 연결 제품을 확인하세요.', 'error');
                return;
            }
            const sourceProd = allProds.find(function(p) {
                return p.carModel === data.carModel && p.partName === data.partName && p.color === data.color;
            }) || allProds.find(function(p) {
                return p.carModel === data.carModel && p.partName === data.partName;
            });
            const splitGroupId = Storage.generateId();
            const sourceIdentity = {
                splitGroupId,
                standbySourceProductId: sourceProd ? (sourceProd.id || '') : '',
                standbySourceCarModel: data.carModel || '',
                standbySourcePartName: data.partName || '',
                standbySourceColor: data.color || ''
            };
            const sourceLots = (data.paintLots || []).some(function(lot) { return Number(lot && lot.qty) > 0; })
                ? data.paintLots
                : [{
                    paintDate: data.paintDate || '',
                    lotNo: data.paintLot || '',
                    qty: Number(data.quantity) || 0,
                    manual: !!data.manualInput
                }];
            const splitLots = _partitionPaintLotsForSplit(sourceLots, qA);
            if (qA > 0) {
                await Storage.add(STORE, _withSplitPaintLots(data, qA, splitLots.first, sourceIdentity));
            }
            if (qB > 0 && linkedProd) {
                await Storage.add(STORE, _withSplitPaintLots(data, qB, splitLots.second, {
                    ...sourceIdentity,
                    partName: linkedProd.partName,
                    color: linkedProd.color || data.color,
                    productId: linkedProd.id || ''
                }));
            }
            UIUtils.closeModal();
            UIUtils.toast(`납품처별 분리 등록 완료 — ${(document.getElementById('lwSplitLabelA') || {}).textContent || ''}: ${qA}EA / ${(document.getElementById('lwSplitLabelB') || {}).textContent || ''}: ${qB}EA`, 'success');
            search();
            return;
        }

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('작업중으로 등록되었습니다. 중품/종품 입력 후 "작업완료" 버튼을 눌러야 작업 이력으로 이동합니다. (레이져 작업중 목록에서 확인)', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        // 초/중/종품 사진 복원 — 미복원 시 재업로드 없이 저장하면 기존 사진 URL이 지워짐
        _qcPhotos = {
            First:  d.qcFirstPhotoUrl  ? { name: '', url: d.qcFirstPhotoUrl }  : null,
            Middle: d.qcMiddlePhotoUrl ? { name: '', url: d.qcMiddlePhotoUrl } : null,
            Last:   d.qcLastPhotoUrl   ? { name: '', url: d.qcLastPhotoUrl }   : null
        };
        // 모듈 변수 복원
        _selectedCarModel = d.carModel || '';
        _selectedPartName = d.partName || '';
        _selectedColor    = d.color    || '';
        // _selectedLots 초기화: 기존 데이터에서 복원
        if (d.paintLots && d.paintLots.length > 0) {
            _selectedLots = d.paintLots.map(l => ({ paintDate: l.paintDate || '', lotNo: l.lotNo || '', qty: Number(l.qty) || 0, manual: !!l.manual }));
        } else if (d.paintDate || d.paintLot) {
            _selectedLots = [{ paintDate: d.paintDate || '', lotNo: d.paintLot || '', qty: Number(d.quantity) || 0, manual: false }];
        } else {
            _selectedLots = [];
        }
        // ✓ 레거시/불일치 데이터 보정: LOT별 수량 합계가 작업수량과 다르면(0 포함) 자동 맞춤.
        //   ("이어서 입력" 화면엔 LOT qty를 고칠 UI가 없어, 값이 0이면 영원히 저장/완료가 막히는 문제 방지)
        if (_selectedLots.length > 0) {
            const totalQty = Number(d.quantity) || 0;
            const lotQtySum = _selectedLots.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
            if (totalQty > 0 && lotQtySum !== totalQty) {
                if (lotQtySum <= 0) {
                    // 전 LOT 수량이 0 → 전체 작업수량을 균등 배분(마지막 LOT에 나머지 보정)
                    const share = Math.floor(totalQty / _selectedLots.length);
                    _selectedLots.forEach((l, i) => {
                        l.qty = i === _selectedLots.length - 1 ? (totalQty - share * (_selectedLots.length - 1)) : share;
                    });
                } else {
                    // 일부만 어긋나도 전체 LOT를 비례 조정해 합계가 반드시 작업수량과 같게 한다.
                    let allocated = 0;
                    _selectedLots.forEach((l, i) => {
                        l.qty = i === _selectedLots.length - 1
                            ? Math.max(0, totalQty - allocated)
                            : Math.max(0, Math.floor(((Number(l.qty) || 0) / lotQtySum) * totalQty));
                        allocated += l.qty;
                    });
                }
            }
        }
        const isInProgress = d.status === 'in_progress';
        UIUtils.showModal(isInProgress ? '레이져 작업 이어서 입력' : '레이져 작업 수정', buildFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-outline" onclick="LaserWorkModule.saveEdit('${id}')">저장</button>
            ${isInProgress ? `<button class="btn btn-primary" onclick="LaserWorkModule.completeWork('${id}')">작업완료</button>` : ''}
        `, 'lg');
        setTimeout(renderLotRows, 0);
        setTimeout(updateLaserGuideChecks, 0);
        setTimeout(() => _refreshLaserCycleSpec(false), 0);
        setTimeout(calcCompletedQty, 0);
        setTimeout(checkQcProgress, 0);
        setTimeout(updateOvertimeReasonVisibility, 0);
    }

    // 저장: 중품/종품이 아직 없어도 진행 중인 내용을 그대로 저장한다 (완료 처리는 아님).
    // status는 건드리지 않아 기존 상태(작업중/완료)를 그대로 유지한다 — 완료 전환은 '작업완료' 버튼에서만.
    async function saveEdit(id) {
        const data = collectData();
        if (!validateWorkRequired(data, { strict: false })) return;
        if (!_checkLotQtyMatch(data)) return;
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('저장되었습니다.', 'success');
        search();
    }

    // 작업완료: 수량 기준 요구되는 초/중/종품이 모두 입력됐는지 엄격히 확인한 뒤 완료 처리한다.
    async function completeWork(id) {
        const data = collectData();
        if (!validateWorkRequired(data, { strict: true })) return;
        if (!_checkLotQtyMatch(data)) return;
        data.status = 'completed';
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('작업이 완료 처리되었습니다.', 'success');
        search();
    }

    function remove(id) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 레이져 작업 이력을 삭제할 수 있습니다.', 'warning');
            return;
        }
        UIUtils.confirm('해당 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        const headers = ['레이져작업일', '장비', '시작', '종료', '차종', '품명', '도장작업일', '각인시간', '수량', '사출LOT', '프로그램', '초품', '중품', '종품', '작업자1', '작업자2', '작업자3'];
        const rows = data.map(d => [
            d.date, d.machine, d.startTime, d.endTime, d.carModel, d.partName, d.paintDate || '',
            d.engravingTime, d.quantity, d.paintLot, d.programName,
            d.qcFirst ? 'O' : 'X', d.qcMiddle ? 'O' : 'X', d.qcLast ? 'O' : 'X', d.worker1, d.worker2, d.worker3
        ]);
        Storage.exportToCSV(headers, rows, '레이져_작업일지');
    }

    return {
        render,
        openAddModal,
        search,
        onCarModelChange,
        onPartChange,
        onSbCarChange,
        onSbPartChange,
        selectStandbyItem,
        previewStandbyQty,
        onSplitQtyChange,
        toggleManualSection,
        refreshLaserCycleSpec,
        onEngravingTimeInput,
        updateLaserGuideChecks,
        updateStandardEndTime,
        markEndTimeManual,
        updateOvertimeReasonVisibility,
        notifyOvertimeManager,
        toggleNotifyUsers,
        calcCompletedQty,
        onQcToggle,
        checkQcProgress,
        uploadQcPhoto,
        viewQcPhoto,
        viewQcPhotoUrl,
        addExternalWorker,
        confirmAddExternalWorker,
        cancelAddExternalWorker,
        addLotRow,
        removeLotRow,
        updateLot,
        saveNew,
        edit,
        saveEdit,
        completeWork,
        remove,
        exportData,
        isWorkQcFullyEntered,
        _qcRequiredStages
    };
})();


/**
 * 레이져 검사일지 모듈
 */
var LaserInspectionModule = (function() {
    const STORE = DB.STORES.LASER_INSPECTIONS;
    const STANDARD_UPLOAD_ROLES = ['admin', 'prod_manager', 'quality_manager', 'paint_line_op'];
    const NONCONFORM_STANDARD_IMAGE_KEY = 'laser_nonconform_standard_image_v1';
    const LASER_INSPECTION_DRAFT_KEY = 'laser_inspection_drafts';
    let _currentView = 'inspection';
    let _nonconformStandardImage = null;
    let _inspectionDraftCache = null; // { [workLogId]: draftData }

    function _splitDateParts(dateValue, timeValue = '') {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return null;
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) return { year: '', monthDay: rawDate || '-', time: timeMatch ? timeMatch[1] : '' };
        return { year: dateMatch[1], monthDay: `${dateMatch[2]}-${dateMatch[3]}`, time: timeMatch ? timeMatch[1] : '' };
    }

    function _dateStack(dateValue, timeValue = '') {
        const parts = _splitDateParts(dateValue, timeValue);
        if (!parts) return '<span style="color:var(--text-muted);">-</span>';
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.05;min-width:56px;">
                ${parts.year ? `<span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${parts.year}</span>` : ''}
                <strong style="font-size:0.92rem;color:var(--text-primary);letter-spacing:0;">${parts.monthDay}</strong>
                ${parts.time ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${parts.time}</span>` : ''}
            </div>`;
    }

    function _lotInfo(row) {
        const work = row && row.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, row.workLogId) : row;
        const source = work || row || {};
        const paintLots = Array.isArray(source.paintLots) ? source.paintLots : [];
        const paintDates = paintLots.length > 0
            ? [...new Set(paintLots.map(lot => lot && lot.paintDate).filter(Boolean))]
            : [source.paintDate || row?.paintDate].filter(Boolean);
        const injectionLots = paintLots.length > 0
            ? [...new Set(paintLots.map(lot => lot && lot.lotNo).filter(Boolean))]
            : [source.paintLot || source.lotNo || row?.paintLot].filter(Boolean);
        return {
            work,
            laserDate: source.date || row?.date || '',
            laserTime: source.startTime || row?.inspectionStartTime || '',
            paintDates,
            injectionLots
        };
    }

    function _dateListHtml(dates) {
        const rows = Array.isArray(dates) && dates.length ? dates : [];
        if (!rows.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;flex-direction:column;gap:5px;">${rows.map(date => _dateStack(date, '')).join('')}</div>`;
    }

    function _lotListHtml(lots) {
        const rows = Array.isArray(lots) && lots.length ? lots : [];
        if (!rows.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;flex-direction:column;gap:4px;">${rows.map(lot => `<span style="font-family:monospace;font-size:0.78rem;white-space:nowrap;">${lot}</span>`).join('')}</div>`;
    }

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
        const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
        return roles.some(role => STANDARD_UPLOAD_ROLES.includes(String(role || '')));
    }

    function _isAdminUser() {
        const user = _currentUser();
        return !!(user && (user.role === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'))));
    }

    function _canEditInspection() {
        try {
            if (_isAdminUser()) return true;
            return typeof AuthModule !== 'undefined' &&
                typeof AuthModule.canWritePage === 'function' &&
                AuthModule.canWritePage('laser-inspection');
        } catch (e) { /* 무시 */ }
        return false;
    }

    async function _loadNonconformStandardImage() {
        try {
            return await Storage.getConfigValue(NONCONFORM_STANDARD_IMAGE_KEY) || null;
        } catch (e) {
            console.warn('[LaserInspectionModule] standard image load failed:', e);
            return null;
        }
    }

    // 검사 완료된 작업일지 ID Set 반환
    function getInspectedWorkIds() {
        const inspections = Storage.getAll(STORE) || [];
        return new Set(inspections.map(i => i.workLogId).filter(Boolean));
    }

    // 미검사 작업일지 목록 반환
    // ※ 초중종(요구 단계) 입력이 모두 끝난 작업만 외관 검사 대기로 넘긴다.
    function getUninspectedWorks() {
        const works = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const inspectedIds = getInspectedWorkIds();
        const qcReady = (typeof LaserWorkModule !== 'undefined' && typeof LaserWorkModule.isWorkQcFullyEntered === 'function')
            ? LaserWorkModule.isWorkQcFullyEntered
            : (w) => w && w.status !== 'in_progress';
        return works
            // 부분검사 중(inspectionStatus:'partial')인 작업은 검사 이력이 있어도 계속 대기 목록에 남는다.
            .filter(w => w.id && qcReady(w) && (!inspectedIds.has(w.id) || w.inspectionStatus === 'partial'))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function _num(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _splitFullBoxQty(qty, packUnit) {
        const total = Math.max(0, _num(qty));
        const unit = _num(packUnit);
        if (unit <= 0) return { packUnit: 0, fullBoxQty: total, residualQty: 0, boxCount: 0 };
        const boxCount = Math.floor(total / unit);
        const fullBoxQty = boxCount * unit;
        return { packUnit: unit, fullBoxQty, residualQty: total - fullBoxQty, boxCount };
    }

    function _parsePackNum(raw) {
        if (raw === undefined || raw === null || raw === '' || raw === 0) return 0;
        const cleaned = String(raw).replace(/,/g, '');
        const direct = Number(cleaned);
        if (!isNaN(direct) && direct > 0) return direct;
        const m = cleaned.match(/^(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : 0;
    }

    function _findProductPackUnit(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const packKeys = ['packUnit', 'packingUnit', 'packageUnit', 'packQty', 'packingQty'];
        const getRaw = prod => {
            for (const key of packKeys) {
                const v = prod && prod[key];
                if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
            }
            return '';
        };
        const hasPack = p => _parsePackNum(getRaw(p)) > 0;
        const exact = products.find(p =>
            (p.carModel || '') === (carModel || '') &&
            (p.partName || '') === (partName || '') &&
            (p.color || '') === (color || '') &&
            hasPack(p)
        );
        if (exact) return _parsePackNum(getRaw(exact));
        const byPart = products.find(p =>
            (p.carModel || '') === (carModel || '') &&
            (p.partName || '') === (partName || '') &&
            hasPack(p)
        );
        return byPart ? _parsePackNum(getRaw(byPart)) : 0;
    }

    function render(container) {
        if (_currentView === 'standard') {
            renderNonconformStandardPage(container);
            return;
        }
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-inspection', '', '',
                    '<button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.showInspectionPage()"><span class="material-symbols-outlined">checklist</span> 검사일지</button>' +
                    '<button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.showNonconformStandardPage()"><span class="material-symbols-outlined">description</span> 부적합 기준서</button>')}

                <!-- 검사 대기 섹션 -->
                <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-orange, #f59e0b);">
                    <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="display:flex; align-items:center; gap:8px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-orange, #f59e0b);">pending_actions</span>
                            검사 대기 목록
                            <span id="liStandbyBadge" style="font-size:0.78rem; background:var(--accent-orange,#f59e0b); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600;"></span>
                        </h4>
                        <button class="btn btn-sm btn-outline" onclick="LaserInspectionModule.renderStandby()">
                            <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                        </button>
                    </div>
                    <div class="card-body" id="liStandbyBody" style="padding:0;"></div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="liFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="liFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="LaserInspectionModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="liStats"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 검사 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <style>
                            .li-hist-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
                            .li-hist-table{width:100%;min-width:1180px;table-layout:auto;border-collapse:collapse;font-size:clamp(0.72rem,0.65rem + 0.35vw,0.88rem);}
                            .li-hist-table th,.li-hist-table td{padding:clamp(6px,0.55vw,10px) clamp(6px,0.7vw,12px);vertical-align:middle;word-break:keep-all;}
                            .li-hist-table th{white-space:nowrap;line-height:1.25;}
                            .li-hist-table .col-date{min-width:5.5em;width:6%;}
                            .li-hist-table .col-car{min-width:4.5em;width:5%;white-space:nowrap;}
                            .li-hist-table .col-part{min-width:10em;width:14%;}
                            .li-hist-table .col-lot{min-width:5.5em;width:7%;}
                            .li-hist-table .col-inj{min-width:7em;width:9%;}
                            .li-hist-table .col-num{min-width:4.2em;width:5%;text-align:right;white-space:nowrap;}
                            .li-hist-table .col-rate{min-width:3.8em;width:4.5%;text-align:center;white-space:nowrap;}
                            .li-hist-table .col-def{min-width:4em;width:4.5%;text-align:center;white-space:nowrap;}
                            .li-hist-table .col-pack{min-width:5em;width:6%;text-align:right;white-space:nowrap;color:var(--accent-blue);}
                            .li-hist-table .col-resid{min-width:4.2em;width:5%;text-align:right;white-space:nowrap;color:var(--accent-orange);}
                            .li-hist-table .col-note{min-width:5em;width:7%;}
                            .li-hist-table .col-act{min-width:7.5em;width:8%;white-space:nowrap;}
                            @media (max-width:1400px){
                                .li-hist-table{min-width:1080px;font-size:clamp(0.7rem,0.62rem + 0.3vw,0.82rem);}
                            }
                            @media (max-width:1100px){
                                .li-hist-table{min-width:980px;}
                                .li-hist-table .col-part{min-width:8em;}
                            }
                        </style>
                        <div class="data-table-wrapper li-hist-wrap">
                            <table class="data-table li-hist-table">
                                <thead>
                                    <tr>
                                        <th class="col-date">검사일</th>
                                        <th class="col-date">레이져 작업일</th>
                                        <th class="col-car">차종</th>
                                        <th class="col-part">품명</th>
                                        <th class="col-lot">도장LOT</th>
                                        <th class="col-inj">사출LOT</th>
                                        <th class="col-num">검사수량</th>
                                        <th class="col-num">양품</th>
                                        <th class="col-num">불량<br><small style="font-weight:400;">(계)</small></th>
                                        <th class="col-rate">불량률</th>
                                        <th class="col-def">사출불량</th>
                                        <th class="col-def">도장불량</th>
                                        <th class="col-def">레이져불량</th>
                                        <th class="col-pack">포장수량</th>
                                        <th class="col-resid">잔량</th>
                                        <th class="col-note">비고</th>
                                        <th class="col-act">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="liTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        renderStandby();
        search();
        _refreshInspectionDrafts(); // 임시저장 배지 표시를 위해 캐시 선로딩
    }

    // ── 검사 대기 섹션 렌더링 ─────────────────────────────────────────
    function renderStandby() {
        const body  = document.getElementById('liStandbyBody');
        const badge = document.getElementById('liStandbyBadge');
        if (!body) return;

        const works = getUninspectedWorks();
        if (badge) badge.textContent = works.length > 0 ? `${works.length}건` : '';

        if (works.length === 0) {
            body.innerHTML = `
                <p style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.88rem;">
                    <span class="material-symbols-outlined" style="vertical-align:middle; font-size:1.1rem;">check_circle</span>
                    검사 대기 중인 작업이 없습니다.
                </p>`;
            return;
        }

        const isAdmin = _isAdminUser();

        body.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table" style="min-width:820px;table-layout:fixed;">
                    <thead>
                        <tr>
                            <th style="width:80px;">레이져 작업일</th>
                            <th style="width:72px;">장비</th>
                            <th style="width:72px;">차종</th>
                            <th style="width:140px;">품명</th>
                            <th style="width:64px;">컬러</th>
                            <th style="width:72px;text-align:right;">작업수량</th>
                            <th style="width:90px;">도장LOT</th>
                            <th style="width:140px;">사출LOT</th>
                            <th style="${isAdmin ? 'width:150px;' : 'width:90px;'}"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${works.map(w => {
                            const info = _lotInfo(w);
                            const _draft = _inspectionDraftCache && _inspectionDraftCache[w.id];
                            const isPartial = w.inspectionStatus === 'partial';
                            const inspectedQty = w.inspectedQty || 0;
                            const remainingQty = w.remainingQty != null ? w.remainingQty : (w.quantity || 0);
                            const progressPercent = (w.quantity && inspectedQty) ? Math.round(inspectedQty / w.quantity * 100) : 0;
                            const partialBadge = isPartial
                                ? `<span class="badge" style="background:var(--accent-blue);color:#fff;margin-left:4px;font-size:0.68rem;" title="부분검사됨">부분 ${progressPercent}%</span>`
                                : '';
                            const draftBadge = _draft
                                ? `<span class="badge" style="background:var(--accent-orange,#f59e0b);color:#fff;margin-left:4px;font-size:0.68rem;" title="임시 저장됨 (${_formatDraftTime(_draft.savedAt)})">임시저장</span>`
                                : '';
                            const qtyDisplay = isPartial
                                ? `${UIUtils.formatNumber(remainingQty)} <span style="font-size:0.72rem;color:var(--text-muted);">/ ${UIUtils.formatNumber(w.quantity || 0)}</span>`
                                : UIUtils.formatNumber(w.quantity || 0);
                            const btnText = isPartial ? '계속 검사' : (_draft ? '이어서 검사' : '검사 등록');
                            const btnColor = isPartial ? 'var(--accent-blue)' : (_draft ? 'var(--accent-orange,#f59e0b)' : 'inherit');
                            const btnStyle = isPartial || _draft ? ` style="color:${btnColor};border-color:${btnColor};"` : '';
                            const btnClass = isPartial || _draft ? 'btn-outline' : 'btn-primary';
                            return `
                            <tr${isPartial ? ' style="background:rgba(37,99,235,0.06);"' : (_draft ? ' style="background:rgba(245,158,11,0.06);"' : '')}>
                                <td>${_dateStack(w.date, w.startTime)}</td>
                                <td style="white-space:nowrap;"><span class="badge badge-info">${w.machine || '-'}</span></td>
                                <td style="white-space:nowrap;font-size:0.82rem;">${w.carModel || '-'}</td>
                                <td style="font-weight:600;">${w.partName || '-'}${partialBadge}${draftBadge}</td>
                                <td style="white-space:nowrap;">${w.color || '-'}</td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${qtyDisplay}</td>
                                <td>${_dateListHtml(info.paintDates)}</td>
                                <td>${_lotListHtml(info.injectionLots)}</td>
                                <td style="white-space:nowrap;">
                                    <button class="btn btn-sm ${btnClass}" onclick="LaserInspectionModule.openInspFromWork('${w.id}')"${btnStyle}>
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_task</span> ${btnText}
                                    </button>${isAdmin ? `
                                    <button class="btn btn-sm btn-danger" onclick="LaserInspectionModule._deleteStandbyWork('${w.id}')" style="margin-left:4px;">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">delete</span> 삭제
                                    </button>` : ''}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function search() {
        const start = document.getElementById('liFilterStart').value;
        const end   = document.getElementById('liFilterEnd').value;
        let data = Storage.getByDateRange(STORE, start, end);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''));
        renderStats(data);
        renderTable(data);
    }

    async function renderNonconformStandardPage(container) {
        _nonconformStandardImage = await _loadNonconformStandardImage();
        const canUpload = _canUploadNonconformStandard();
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-inspection-standard')}
                <div class="page-header" style="margin:-6px 0 14px;">
                    <div class="page-actions" style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
                        <button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.printNonconformStandardPage()">
                            <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.focusNonconformStandardPasteZone()" ${canUpload ? '' : 'disabled'} style="${canUpload ? '' : 'opacity:.5;cursor:not-allowed;'}">
                            <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 기준서 업로드
                        </button>
                    </div>
                </div>
                <div class="card" style="display:inline-block;width:auto;max-width:100%;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);padding:18px 18px 24px;border-radius:18px;box-shadow:0 18px 42px rgba(15,23,42,0.14),0 6px 14px rgba(15,23,42,0.10);">
                    <div id="laserNonconformStandardPasteZone" tabindex="0" onpaste="LaserInspectionModule.handleNonconformStandardPaste(event)" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" aria-hidden="true"></div>
                    ${_nonconformStandardImage
                        ? `<div style="display:inline-flex;justify-content:flex-start;align-items:flex-start;width:fit-content;max-width:100%;border:1px solid #111;box-shadow:0 10px 28px rgba(15,23,42,0.18),0 3px 8px rgba(15,23,42,0.12);"><img src="${_nonconformStandardImage}" alt="부적합 처리 기준서" style="display:block;max-width:100%;height:auto;"></div>`
                        : `<div style="min-width:980px;min-height:1385px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1rem;">등록된 기준서 이미지가 없습니다.</div>`}
                </div>
            </div>
        `;
    }

    function showNonconformStandardPage() {
        _currentView = 'standard';
        Router.navigate('laser-inspection');
    }

    function showInspectionPage() {
        _currentView = 'inspection';
        Router.navigate('laser-inspection');
    }

    function focusNonconformStandardPasteZone() {
        if (!_canUploadNonconformStandard()) {
            UIUtils.toast('기준서 업로드는 관리자 또는 관리 권한자만 가능합니다.', 'warning');
            return;
        }
        const zone = document.getElementById('laserNonconformStandardPasteZone');
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
                showNonconformStandardPage();
                UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
            } catch (e) {
                console.warn('[LaserInspectionModule] standard save failed:', e);
                UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('클립보드 이미지를 읽을 수 없습니다.', 'error');
        reader.readAsDataURL(file);
    }

    function printNonconformStandardPage() {
        const img = document.querySelector('img[alt="부적합 처리 기준서"]');
        const imageSrc = img ? String(img.getAttribute('src') || '') : String(_nonconformStandardImage || '');
        if (!imageSrc) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드해 주세요.', 'warning');
            return;
        }
        const win = window.open('', 'laser_nonconform_standard_print', 'width=1200,height=900');
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

    function renderStats(data) {
        const total = data.reduce((s, d) => s + (Number(d.inspQty) || 0), 0);
        const bad   = data.reduce((s, d) => s + (Number(d.failQty) || 0), 0);
        const rate  = total > 0 ? (bad / total * 100).toFixed(1) : '0.0';
        const injBad   = data.reduce((s, d) => s + (Number((d.defectDetails || {}).사출불량) || 0), 0);
        const paintBad = data.reduce((s, d) => s + (Number((d.defectDetails || {}).도장불량) || 0), 0);
        const laserBad = data.reduce((s, d) => s + (Number((d.defectDetails || {}).레이져불량) || 0), 0);

        document.getElementById('liStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(total)}</div>
                <div class="stat-card-label">총 검사수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(total - bad)}</div>
                <div class="stat-card-label">총 양품</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${UIUtils.formatNumber(bad)}</div>
                <div class="stat-card-label">총 불량</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${rate}%</div>
                <div class="stat-card-label">평균 불량률</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value" style="font-size:0.9rem;">${UIUtils.formatNumber(injBad)} / ${UIUtils.formatNumber(paintBad)} / ${UIUtils.formatNumber(laserBad)}</div>
                <div class="stat-card-label">사출 / 도장 / 레이져 불량</div>
            </div>
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('liTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="17" style="text-align:center;padding:30px;color:var(--text-muted);">검사 기록이 없습니다.</td></tr>`;
            return;
        }
        const canEdit = _canEditInspection();
        const allDefectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap  = {};
        allDefectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        tbody.innerHTML = data.map(d => {
            const lotInfo = _lotInfo(d);
            const dd = d.defectDetails || {};
            let injBad = 0, paintBad = 0, laserBad = 0;
            Object.entries(dd).forEach(([name, cnt]) => {
                const t = defectTypeMap[name] || 'injection';
                if (t === 'painting') paintBad += Number(cnt) || 0;
                else if (t === 'laser') laserBad += Number(cnt) || 0;
                else injBad += Number(cnt) || 0;
            });
            return `
                <tr style="cursor:pointer;" onclick="LaserInspectionModule._showDetail('${d.id}', event)">
                    <td class="col-date">${_dateStack(d.date, d.inspectionStartTime)}</td>
                    <td class="col-date">${lotInfo.laserDate ? _dateStack(lotInfo.laserDate, lotInfo.laserTime) : '<span style="color:var(--text-muted);">-</span>'}</td>
                    <td class="col-car">${d.carModel || '-'}</td>
                    <td class="col-part" style="font-weight:600;line-height:1.35;">${d.partName || '-'}</td>
                    <td class="col-lot">${_dateListHtml(lotInfo.paintDates)}</td>
                    <td class="col-inj">${_lotListHtml(lotInfo.injectionLots)}</td>
                    <td class="col-num">${UIUtils.formatNumber(d.inspQty)}</td>
                    <td class="col-num" style="color:var(--accent-green);font-weight:600;">${UIUtils.formatNumber(d.goodQty)}</td>
                    <td class="col-num" style="color:var(--accent-red);font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
                    <td class="col-rate" style="font-weight:700;">${(Number(d.failRate) || 0).toFixed(1)}%</td>
                    <td class="col-def">${injBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(injBad)}</span>` : '-'}</td>
                    <td class="col-def">${paintBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(paintBad)}</span>` : '-'}</td>
                    <td class="col-def">${laserBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(laserBad)}</span>` : '-'}</td>
                    <td class="col-pack" style="font-weight:700;">${(d.packQty > 0) ? UIUtils.formatNumber(d.packQty) : '-'}</td>
                    <td class="col-resid" style="font-weight:600;">${(d.residualQty > 0) ? UIUtils.formatNumber(d.residualQty) : '-'}</td>
                    <td class="col-note">${d.note || '-'}</td>
                    <td class="col-act" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-outline" onclick="LaserInspectionModule.view('${d.id}')">보기</button>
                        ${canEdit ? `<button class="btn btn-sm btn-danger" onclick="LaserInspectionModule.remove('${d.id}')">삭제</button>` : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    // ── 검사 이력 상세 조회 팝업 ─────────────────────────────────────
    function _showDetail(id, event) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const lotInfo = _lotInfo(d);

        // 불량 유형 분류
        const allDefectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap  = {};
        allDefectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        const dd = d.defectDetails || {};
        const injDefects   = [];
        const paintDefects = [];
        const laserDefects = [];
        Object.entries(dd).forEach(([name, cnt]) => {
            if (!cnt || Number(cnt) === 0) return;
            const t = defectTypeMap[name] || 'injection';
            const item = { name, cnt: Number(cnt) };
            if (t === 'painting') paintDefects.push(item);
            else if (t === 'laser') laserDefects.push(item);
            else injDefects.push(item);
        });

        const failRate = (Number(d.failRate) || 0).toFixed(1);

        const defectGroupHtml = (label, color, items) => {
            if (!items.length) return '';
            return `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.72rem;font-weight:600;color:${color};margin-bottom:4px;">${label}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${items.map(it => `
                        <span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:0.8rem;">
                            <span style="color:var(--text-muted);">${it.name}</span>
                            <strong style="margin-left:4px;color:var(--accent-red);">${UIUtils.formatNumber(it.cnt)}</strong>
                        </span>`).join('')}
                </div>
            </div>`;
        };

        const hasDefect = injDefects.length || paintDefects.length || laserDefects.length;

        const popupId = 'liDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:18px 20px; min-width:300px; max-width:400px;
            font-size:0.88rem;
        `;

        const vw = window.innerWidth, vh = window.innerHeight;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        popup.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-blue);">crisis_alert</span>
                    <span style="font-weight:700;font-size:0.95rem;">레이져 검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;line-height:1;padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px;font-size:0.82rem;">
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- 공정/LOT 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">레이져 작업일</div>
                    <div>${_dateStack(lotInfo.laserDate, lotInfo.laserTime)}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT</div>
                    <div>${_dateListHtml(lotInfo.paintDates)}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                    <div>${_lotListHtml(lotInfo.injectionLots)}</div>
                </div>
            </div>

            <!-- 검사 수량 카드 -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;text-align:center;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600;font-size:0.75rem;margin-top:2px;">${d.date || '-'}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">검사수량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-blue);margin-top:2px;">${UIUtils.formatNumber(d.inspQty || 0)}</div>
                </div>
                <div style="background:rgba(52,211,153,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">양품</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-green);margin-top:2px;">${UIUtils.formatNumber(d.goodQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">불량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-red);margin-top:2px;">${UIUtils.formatNumber(d.failQty || 0)}</div>
                </div>
            </div>
            <div style="text-align:right;margin-bottom:8px;">
                <span style="font-size:0.78rem;color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700;font-size:0.98rem;color:${parseFloat(failRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${failRate}%</span>
            </div>

            ${(Array.isArray(d.inspectors) && d.inspectors.length) ? `
            <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:0.82rem;">
                <span style="color:var(--text-muted);">검사자</span>
                <strong style="margin-left:6px;color:var(--text-primary);">${d.inspectors.join(', ')}</strong>
            </div>` : ''}

            <!-- 포장 정보 -->
            ${(d.packQty > 0 || d.residualQty > 0) ? `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;text-align:center;border-top:1px solid var(--border);padding-top:8px;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">기존 잔량</div>
                    <div style="font-weight:600;font-size:0.9rem;margin-top:2px;">${UIUtils.formatNumber(d.prevResidualQty || 0)}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">포장수량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-blue);margin-top:2px;">${UIUtils.formatNumber(d.packQty || 0)}</div>
                    ${d.packBoxCount ? `<div style="font-size:0.62rem;color:var(--text-muted);">${UIUtils.formatNumber(d.packBoxCount)}박스 × ${UIUtils.formatNumber(d.packUnit)}</div>` : ''}
                </div>
                <div style="background:rgba(245,158,11,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.64rem;color:var(--text-muted);">신규 잔량</div>
                    <div style="font-weight:700;font-size:0.98rem;color:var(--accent-orange);margin-top:2px;">${UIUtils.formatNumber(d.residualQty || 0)}</div>
                </div>
            </div>` : ''}

            <!-- 불량 상세 -->
            ${hasDefect ? `
            <div style="border-top:1px solid var(--border);padding-top:10px;">
                ${defectGroupHtml('사출 불량', '#ea580c', injDefects)}
                ${defectGroupHtml('도장 불량', '#16a34a', paintDefects)}
                ${defectGroupHtml('레이져 불량', '#ef4444', laserDefects)}
            </div>` : `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:2px 0;border-top:1px solid var(--border);padding-top:8px;">불량 내역 없음</div>`}

        `;

        document.body.appendChild(popup);

        // 화면 밖 보정
        requestAnimationFrame(() => {
            const rect = popup.getBoundingClientRect();
            if (rect.right  > vw - 8) popup.style.left = (vw - rect.width - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', function _close(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _close);
                }
            });
        }, 50);
    }

    // ── 검사 등록 폼 (도장 검사와 동일 구조) ────────────────────────────
    let _liCarModel = '';
    let _liPartName = '';
    let _liColor    = '';
    let _liWorkId   = null;

    function _openModal(title, content) {
        _closeModal();
        const modalEl = document.createElement('div');
        modalEl.id = 'liCustomModal';
        modalEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
        modalEl.innerHTML = `
            <style>
                @media print {
                    body { margin:0!important;padding:0!important;background:white!important; }
                    #liCustomModal { position:static!important;background:white!important; }
                    #liCustomModalInner { position:static!important;max-width:100%!important;max-height:none!important;overflow:visible!important;border-radius:0!important;box-shadow:none!important;padding:20px!important; }
                    .btn { display:none!important; }
                    .card { page-break-inside:avoid;border:1px solid #ccc!important; }
                    .form-input { border:1px solid #ccc!important; }
                }
            </style>
            <div id="liCustomModalInner" style="background:white;border-radius:12px;max-width:85vw;width:85vw;max-height:92vh;overflow:auto;padding:16px 20px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h2 style="margin:0;font-size:1.1rem;">${title}</h2>
                    <button onclick="LaserInspectionModule._closeModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-muted);">✕</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;">${content}</div>
            </div>`;
        document.body.appendChild(modalEl);
    }

    function _closeModal() {
        const el = document.getElementById('liCustomModal');
        if (el) el.remove();
    }

    function _getWorkLossTotal(work) {
        if (!work) return 0;
        return (Number(work.qcFirstLoss) || 0) + (Number(work.qcMiddleLoss) || 0) + (Number(work.qcLastLoss) || 0);
    }

    function _getInspBaseFromWork(work) {
        if (!work) return 0;
        const loss = _getWorkLossTotal(work);
        const qty = Number(work.quantity) || 0;
        if (work.completedQty != null && work.completedQty !== '' && Number.isFinite(Number(work.completedQty))) {
            return Math.max(0, Number(work.completedQty));
        }
        return Math.max(0, qty - loss);
    }

    function _getInspBaseFromForm() {
        const baseEl = document.getElementById('liInspBaseQty');
        if (baseEl) return Math.max(0, Number(baseEl.value) || 0);
        const goodQty = parseInt(document.getElementById('liGoodQty')?.value || 0, 10) || 0;
        const failQty = parseInt(document.getElementById('liDefectQty')?.value || 0, 10) || 0;
        return Math.max(0, goodQty + failQty);
    }

    function _refreshWorkQtyDisplay() {
        const workQty = Math.max(0, Number(document.getElementById('liWorkQty')?.value) || 0);
        const loss = Math.max(0, Number(document.getElementById('liLossTotalHidden')?.value) || 0);
        const base = Math.max(0, workQty - loss);
        const baseEl = document.getElementById('liInspBaseQty');
        const baseLabel = document.getElementById('liInspBaseLabel');
        const lossLabel = document.getElementById('liLossTotalLabel');
        if (baseEl) baseEl.value = base;
        if (baseLabel) baseLabel.textContent = UIUtils.formatNumber(base) + ' EA';
        if (lossLabel) lossLabel.textContent = UIUtils.formatNumber(loss);
    }

    function _sumLaserDefectTypeInputs() {
        let defectSum = 0;
        document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]').forEach(function(el) {
            defectSum += parseInt(String(el.value || '').replace(/,/g, ''), 10) || 0;
        });
        return defectSum;
    }

    function _commitActiveNumericInput() {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        if (typeof active.blur === 'function') active.blur();
    }

    function _recalcInspQuantities() {
        _refreshWorkQtyDisplay();
        const base = _getInspBaseFromForm();
        // 불량수는 항상 불량 유형 입력 합계가 권위 값이다.
        const failQty = _sumLaserDefectTypeInputs();
        const failEl = document.getElementById('liDefectQty');
        if (failEl) failEl.value = failQty;

        // ✓ 부분검사 모드: 양품수는 독립 입력값 — 미검사분을 base로 자동 채우지 않는다.
        if (_isPartialInspectionMode()) {
            const goodQty = parseInt(document.getElementById('liGoodQty')?.value || 0, 10) || 0;
            const total = goodQty + failQty;
            const tEl = document.getElementById('liTotalQty');
            if (tEl) tEl.value = total > 0 ? total : '';
            const inspQtyEl = document.getElementById('liInspQty');
            if (inspQtyEl) inspQtyEl.value = total;
            _updatePackagingCalc();
            return;
        }
        const goodQty = Math.max(0, base - failQty);
        const gEl = document.getElementById('liGoodQty');
        if (gEl) gEl.value = goodQty > 0 || failQty > 0 ? goodQty : '';
        const total = goodQty + failQty;
        const tEl = document.getElementById('liTotalQty');
        if (tEl) tEl.value = total > 0 ? total : '';
        const inspQtyEl = document.getElementById('liInspQty');
        if (inspQtyEl) inspQtyEl.value = total;
        _updatePackagingCalc();
    }

    function _isPartialInspectionMode() {
        const checkbox = document.getElementById('liIsPartialInspection');
        return !!(checkbox && checkbox.checked);
    }

    // ✓ 부분검사 토글 — 체크: 양품수만 초기화 / 해제: 검사기준 자동계산 복원
    // 불량수는 불량 유형 입력 합계를 유지한다. (태블릿에서 0으로 덮이는 문제 방지)
    function _togglePartialInspection() {
        _commitActiveNumericInput();
        const checkbox = document.getElementById('liIsPartialInspection');
        const infoDiv = document.getElementById('liPartialInspectionInfo');
        const goodQtyEl = document.getElementById('liGoodQty');
        if (checkbox && infoDiv) infoDiv.style.display = checkbox.checked ? 'flex' : 'none';
        if (checkbox && checkbox.checked) {
            if (goodQtyEl) { goodQtyEl.readOnly = false; goodQtyEl.style.background = ''; goodQtyEl.value = 0; }
        } else if (goodQtyEl && goodQtyEl.dataset.hasWorkRef === '1') {
            goodQtyEl.readOnly = true;
            goodQtyEl.style.background = 'var(--bg-secondary)';
        }
        _recalcInspQuantities();
    }

    // ── 레이져 검사 임시 저장(draft) — workLogId별 폼 스냅샷 캐시 (DB 레코드 아님) ──
    function _formatDraftTime(iso) {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            const p = n => String(n).padStart(2, '0');
            return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        } catch (e) { return ''; }
    }

    async function _getInspectionDrafts(force) {
        if (_inspectionDraftCache && !force) return _inspectionDraftCache;
        let drafts = {};
        try { drafts = await Storage.getConfigValue(LASER_INSPECTION_DRAFT_KEY) || {}; } catch (e) { drafts = {}; }
        if (!drafts || typeof drafts !== 'object') drafts = {};
        _inspectionDraftCache = drafts;
        return drafts;
    }

    async function _refreshInspectionDrafts() {
        await _getInspectionDrafts(true);
        if (_currentView === 'inspection' && document.getElementById('liStandbyBody')) {
            renderStandby();
        }
    }

    // 현재 검사 모달의 입력값을 수집 (임시 저장 & 복원 공용)
    function _collectInspectionFormData() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const defects = {};
        document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]').forEach(el => {
            const v = String(el.value || '').trim();
            if (v !== '' && v !== '0') defects[el.id] = v;
        });
        return {
            date:         g('liDate'),
            startTime:    g('liStartTime'),
            endTime:      g('liEndTime'),
            goodQty:      g('liGoodQty'),
            defectQty:    g('liDefectQty'),
            prevResidual: g('liPrevResidual'),
            packUnit:     g('liPackUnit'),
            packBoxCount: g('liPackBoxCount'),
            inspectors:   _collectInspectors(),
            defects
        };
    }

    async function _saveInspectionDraft(workId) {
        if (!_canEditInspection()) {
            UIUtils.toast('레이져 검사 입력 권한이 없습니다.', 'warning');
            return;
        }
        if (!workId) { UIUtils.toast('임시 저장할 검사 대상이 없습니다.', 'warning'); return; }
        const work = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!work) { UIUtils.toast('작업일지를 찾을 수 없습니다.', 'warning'); return; }

        const data = _collectInspectionFormData();
        data.savedAt = new Date().toISOString();

        try {
            const drafts = await _getInspectionDrafts();
            drafts[workId] = data;
            await Storage.setConfigValue(LASER_INSPECTION_DRAFT_KEY, drafts);
            _inspectionDraftCache = drafts;
            UIUtils.toast('임시 저장되었습니다. 나중에 이어서 작성할 수 있습니다.', 'success');
            const notice = document.getElementById('liDraftNotice');
            const timeEl = document.getElementById('liDraftNoticeTime');
            if (notice) notice.style.display = 'flex';
            if (timeEl) timeEl.textContent = _formatDraftTime(data.savedAt);
        } catch (e) {
            console.error('레이져 검사 임시 저장 실패', e);
            UIUtils.toast('임시 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    function _applyInspectionDraft(draft) {
        if (!draft) return;
        const setV = (id, val) => { const el = document.getElementById(id); if (el && val != null && val !== '') el.value = val; };
        setV('liDate',      draft.date);
        setV('liStartTime', draft.startTime);
        setV('liEndTime',   draft.endTime);
        setV('liPrevResidual', draft.prevResidual);
        setV('liPackUnit',     draft.packUnit);
        setV('liPackBoxCount', draft.packBoxCount);
        _initInspectorFields(draft.inspectors || []);
        Object.entries(draft.defects || {}).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
        _recalcInspQuantities();
        // 불량 유형 상세가 없으면(합산 0) 저장된 양품/불량 값을 그대로 복원
        if (!draft.defects || Object.keys(draft.defects).length === 0) {
            setV('liGoodQty',   draft.goodQty);
            setV('liDefectQty', draft.defectQty);
            _recalcInspQuantities();
        }
        _calculateInspectionTime();
        _updatePackagingCalc();
    }

    async function _clearInspectionDraft(workId, silent) {
        if (!workId) return;
        try {
            const drafts = await _getInspectionDrafts();
            if (drafts[workId]) {
                delete drafts[workId];
                await Storage.setConfigValue(LASER_INSPECTION_DRAFT_KEY, drafts);
                _inspectionDraftCache = drafts;
            }
        } catch (e) { /* 무시 */ }
        if (!silent) {
            UIUtils.toast('임시 저장 내용을 삭제했습니다.', 'info');
            const notice = document.getElementById('liDraftNotice');
            if (notice) notice.style.display = 'none';
        }
    }

    async function _syncWorkQtyToWorkLogImmediate(newQty) {
        if (!_liWorkId) return;
        const workRef = Storage.getById(DB.STORES.LASER_WORK_LOG, _liWorkId);
        if (!workRef) return;
        const qty = Math.max(0, Number(newQty) || 0);
        const loss = _getWorkLossTotal(workRef);
        const patch = {
            quantity: qty,
            completedQty: Math.max(0, qty - loss)
        };
        if (Array.isArray(workRef.paintLots) && workRef.paintLots.length) {
            patch.paintLots = _scalePaintLotsToQty(workRef.paintLots, qty);
        }
        await Storage.update(DB.STORES.LASER_WORK_LOG, _liWorkId, Object.assign({}, workRef, patch));
        if (typeof LaserWorkModule !== 'undefined' && LaserWorkModule.search) {
            try { LaserWorkModule.search(); } catch (e) { /* ignore */ }
        }
    }

    function _enableWorkQtyEdit() {
        const el = document.getElementById('liWorkQty');
        if (!el || el.disabled) return;
        // 이미 편집 중이면 포커스만
        if (!el.readOnly) {
            el.focus();
            el.select();
            return;
        }
        const prev = Number(el.value) || 0;
        el.readOnly = false;
        el.style.background = '#fff';
        el.style.borderColor = 'var(--accent-blue)';
        el.style.minWidth = '110px';
        el.style.width = '100%';
        el.style.flex = '1 1 110px';
        el.dataset.prevQty = String(prev);

        const btn = document.getElementById('liWorkQtyEditBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span> 적용';
            btn.className = 'btn btn-sm btn-primary';
            btn.style.flexShrink = '0';
            btn.setAttribute('onclick', 'LaserInspectionModule.confirmWorkQtyEdit()');
        }
        let cancelBtn = document.getElementById('liWorkQtyCancelBtn');
        if (!cancelBtn && btn && btn.parentNode) {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.id = 'liWorkQtyCancelBtn';
            cancelBtn.className = 'btn btn-sm btn-outline';
            cancelBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;white-space:nowrap;flex-shrink:0;';
            cancelBtn.textContent = '취소';
            cancelBtn.setAttribute('onclick', 'LaserInspectionModule.cancelWorkQtyEdit()');
            btn.parentNode.insertBefore(cancelBtn, btn.nextSibling);
        }
        const row = el.parentElement;
        if (row) {
            row.style.flexWrap = 'wrap';
            row.style.rowGap = '6px';
        }
        el.oninput = function() { _recalcInspQuantities(); };
        el.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmWorkQtyEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelWorkQtyEdit();
            }
        };
        el.focus();
        el.select();
    }

    function cancelWorkQtyEdit() {
        const el = document.getElementById('liWorkQty');
        if (!el) return;
        const prev = Number(el.dataset.prevQty);
        if (Number.isFinite(prev) && prev > 0) el.value = prev;
        el.readOnly = true;
        el.style.background = 'var(--bg-secondary)';
        el.style.borderColor = '';
        el.style.minWidth = '110px';
        el.style.flex = '1 1 110px';
        el.oninput = null;
        el.onkeydown = null;
        delete el.dataset.prevQty;
        _recalcInspQuantities();
        _resetWorkQtyEditButtons();
    }

    function _resetWorkQtyEditButtons() {
        const btn = document.getElementById('liWorkQtyEditBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">edit</span> 변경';
            btn.className = 'btn btn-sm btn-outline';
            btn.style.cssText = 'padding:4px 10px;font-size:0.75rem;white-space:nowrap;gap:3px;flex-shrink:0;';
            btn.setAttribute('onclick', 'LaserInspectionModule._enableWorkQtyEdit()');
        }
        const cancelBtn = document.getElementById('liWorkQtyCancelBtn');
        if (cancelBtn) cancelBtn.remove();
        const panel = document.getElementById('liWorkQtyEditPanel');
        if (panel) panel.remove();
    }

    function _previewWorkQtyEdit() {
        // 인라인 편집 시 입력과 동시에 _recalcInspQuantities 로 반영
    }

    function confirmWorkQtyEdit() {
        const el = document.getElementById('liWorkQty');
        if (!el) return;
        const newQty = Math.max(0, parseInt(String(el.value || '').replace(/[^\d]/g, ''), 10) || 0);
        if (newQty <= 0) {
            UIUtils.toast('작업수량은 1 이상이어야 합니다.', 'warning');
            el.focus();
            return;
        }
        el.value = newQty;
        el.readOnly = true;
        el.style.background = 'var(--bg-secondary)';
        el.style.borderColor = '';
        el.style.minWidth = '110px';
        el.style.flex = '1 1 110px';
        el.oninput = null;
        el.onkeydown = null;
        delete el.dataset.prevQty;
        _recalcInspQuantities();
        _resetWorkQtyEditButtons();
        _syncWorkQtyToWorkLogImmediate(newQty)
            .then(function() {
                UIUtils.toast('작업일지 수량 ' + UIUtils.formatNumber(newQty) + ' EA 반영', 'success');
            })
            .catch(function(e) {
                UIUtils.toast('작업일지 반영 실패: ' + (e && e.message ? e.message : '오류'), 'error');
            });
    }

    // 작업수량 카드 — 작업일지 연동 검사 등록 시 (초중종 LOSS 차감 후 검사 기준)
    function _buildWorkQtyCard(work) {
        const workQty = Number(work.quantity) || 0;
        const lossTotal = _getWorkLossTotal(work);
        const inspBase = _getInspBaseFromWork(work);
        const lossParts = [];
        if (Number(work.qcFirstLoss)) lossParts.push('초 ' + work.qcFirstLoss);
        if (Number(work.qcMiddleLoss)) lossParts.push('중 ' + work.qcMiddleLoss);
        if (Number(work.qcLastLoss)) lossParts.push('종 ' + work.qcLastLoss);
        const lossHint = lossParts.length ? lossParts.join(' · ') : '-';
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);">작업 수량</h5>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <label class="form-label" style="font-size:0.72rem;margin:0;flex:0 0 auto;white-space:nowrap;">작업수량</label>
                        <input type="number" class="form-input" id="liWorkQty" value="${workQty}" min="0" readonly
                            style="text-align:right;font-weight:700;font-size:0.95rem;padding:5px 8px;flex:1 1 110px;min-width:110px;max-width:100%;background:var(--bg-secondary);">
                        <span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">EA</span>
                        <button type="button" id="liWorkQtyEditBtn" class="btn btn-sm btn-outline"
                            onclick="LaserInspectionModule._enableWorkQtyEdit()"
                            style="padding:4px 10px;font-size:0.75rem;white-space:nowrap;gap:3px;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:14px;">edit</span> 변경
                        </button>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--text-muted);">
                        <span>초중종 LOSS <strong id="liLossTotalLabel" style="color:var(--accent-orange);">${UIUtils.formatNumber(lossTotal)}</strong> EA</span>
                        <span title="${lossHint}">${lossHint}</span>
                    </div>
                    <input type="hidden" id="liLossTotalHidden" value="${lossTotal}">
                    <div style="background:rgba(59,130,246,0.08);border-radius:6px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.72rem;color:var(--text-muted);">검사 기준 (작업−LOSS)</span>
                        <strong id="liInspBaseLabel" style="font-size:0.95rem;color:var(--accent-blue);">${UIUtils.formatNumber(inspBase)} EA</strong>
                    </div>
                    <input type="hidden" id="liInspBaseQty" value="${inspBase}">
                    <input type="hidden" id="liInspQty" value="${inspBase}">
                </div>
            </div>
        </div>`;
    }

    // 작업 정보 컴팩트 배너 (도장 검사 일지 스타일)
    function _buildWorkBanner(work) {
        const lotInfo   = _lotInfo(work);
        const paintLots = lotInfo.paintDates.join(', ')    || '-';
        const injLots   = lotInfo.injectionLots.join(', ') || '-';
        return `
        <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 14px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;border-left:4px solid var(--accent-blue);">
            <span style="font-size:0.75rem;color:var(--text-muted);">작업일 <strong style="color:var(--text-primary);">${work.date||'-'}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">장비 <strong style="color:var(--text-primary);">${work.machine||'-'}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">차종 <strong style="color:var(--text-primary);">${work.carModel||'-'}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">품명 <strong style="color:var(--text-primary);">${work.partName||'-'}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">컬러 <strong style="color:var(--text-primary);">${work.color||'-'}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">도장LOT <strong style="color:var(--text-primary);font-family:monospace;">${paintLots}</strong></span>
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">사출LOT <strong style="color:var(--text-primary);font-family:monospace;">${injLots}</strong></span>
        </div>`;
    }

    // 검사 대상 선택 카드 (수동 등록용 — 좌측)
    function _buildSelectCard(d = {}) {
        const products  = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);">검사 대상</h5>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">차종 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="liCarModel" onchange="LaserInspectionModule.onCarModelChange()">
                            <option value="">-- 차종 선택 --</option>
                            ${carModels.map(c=>`<option value="${c}" ${d.carModel===c?'selected':''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">품명 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="liPartName"><option value="">-- 품명 선택 --</option></select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">검사수량 <span style="color:var(--accent-red)">*</span></label>
                        <input type="number" class="form-input" id="liInspQty" value="${d.inspQty||''}"
                            onchange="LaserInspectionModule._updateDefectTotal()" placeholder="0"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;">
                    </div>
                </div>
            </div>
        </div>`;
    }

    // 검사 정보 카드 (좌측)
    function _buildInspInfoCard(d = {}, workRef = null) {
        const defaultStart = d.inspectionStartTime || (workRef ? workRef.startTime || '' : '');
        const defaultEnd   = d.inspectionEndTime   || (workRef ? workRef.endTime   || '' : '');
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);">검사 정보</h5>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">검사일자</label>
                        <input type="date" class="form-input" id="liDate" value="${d.date||UIUtils.today()}"
                            style="font-weight:600;font-size:0.85rem;padding:6px 8px;">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.72rem;">시작시간</label>
                            <input type="time" class="form-input" id="liStartTime" value="${defaultStart}"
                                style="font-weight:600;font-size:0.82rem;padding:6px 4px;"
                                oninput="LaserInspectionModule._calculateInspectionTime()"
                                onchange="LaserInspectionModule._calculateInspectionTime()">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label" style="font-size:0.72rem;">완료시간</label>
                            <input type="time" class="form-input" id="liEndTime" value="${defaultEnd}"
                                style="font-weight:600;font-size:0.82rem;padding:6px 4px;"
                                oninput="LaserInspectionModule._calculateInspectionTime()"
                                onchange="LaserInspectionModule._calculateInspectionTime()">
                        </div>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">소요시간</label>
                        <input type="text" class="form-input" id="liDuration" placeholder="자동계산" readonly
                            style="background:var(--bg-secondary);font-weight:600;font-size:0.85rem;padding:6px 8px;">
                    </div>
                </div>
            </div>
        </div>`;
    }

    // 검사자 — 저장 버튼 옆 가로 배치
    function _buildInspectorCard() {
        return `
        <div style="display:flex;align-items:flex-end;gap:8px;flex:1 1 auto;flex-wrap:wrap;min-width:0;">
            <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);white-space:nowrap;align-self:center;padding-bottom:2px;">검사자</span>
            <div style="display:flex;align-items:flex-end;gap:8px;flex:1 1 auto;flex-wrap:wrap;min-width:0;" id="liInspectorContainer"></div>
            <button type="button" class="btn btn-sm btn-primary" id="liAddInspectorBtn"
                onclick="LaserInspectionModule._addInspectorField()"
                style="gap:4px;padding:4px 10px;font-size:0.78rem;flex:0 0 auto;">
                <span class="material-symbols-outlined" style="font-size:14px;">add</span> 추가
            </button>
        </div>`;
    }

    // 하단 액션바: 저장/취소 + 검사자
    function _buildActionBar(saveAction, opts) {
        opts = opts || {};
        return `
        <div class="card" style="margin:0;">
            <div class="card-body" style="padding:10px 14px;display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
                ${_buildBtns(saveAction, opts)}
                <div style="width:1px;align-self:stretch;background:var(--border-color);flex:0 0 1px;min-height:36px;"></div>
                ${_buildInspectorCard()}
            </div>
        </div>`;
    }

    // 저장/취소 버튼 (액션바용 가로 배치)
    function _buildBtns(saveAction, opts) {
        opts = opts || {};
        if (opts.readonly) {
            const editBtn = opts.editId
                ? `<button class="btn btn-primary" onclick="LaserInspectionModule.edit('${opts.editId}')" style="justify-content:center;min-width:96px;">
                    <span class="material-symbols-outlined">edit</span> 수정
                </button>`
                : '';
            return `
            <div style="display:flex;gap:6px;flex:0 0 auto;">
                ${editBtn}
                <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()" style="justify-content:center;min-width:80px;">
                    <span class="material-symbols-outlined">close</span> 닫기
                </button>
            </div>`;
        }
        const draftBtn = opts.draftAction
            ? `<button class="btn btn-outline" onclick="${opts.draftAction}" style="justify-content:center;min-width:96px;color:var(--accent-orange);border-color:var(--accent-orange);" title="검사 도중 다른 작업으로 변경 시 임시 저장 가능">
                <span class="material-symbols-outlined" style="font-size:18px;">bookmark_add</span> 임시 저장
            </button>`
            : '';
        return `
        <div style="display:flex;gap:6px;flex:0 0 auto;">
            ${draftBtn}
            <button class="btn btn-primary" onclick="${saveAction}" style="justify-content:center;min-width:96px;">
                <span class="material-symbols-outlined">save</span> 저장${opts.draftAction ? ' (검사 완료)' : ''}
            </button>
            <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()" style="justify-content:center;min-width:80px;">
                <span class="material-symbols-outlined">close</span> 취소
            </button>
        </div>`;
    }

    function _setInspectionFormReadonly(readonly) {
        const root = document.getElementById('liCustomModalInner');
        if (!root) return;
        root.querySelectorAll('input, select, textarea, button').forEach(el => {
            if (el.closest('[onclick*="_closeModal"]') || el.closest('[onclick*="LaserInspectionModule.edit"]')) return;
            if (el.tagName === 'BUTTON') {
                if (readonly) el.style.display = 'none';
                return;
            }
            el.disabled = !!readonly;
            if (readonly) el.style.background = 'var(--bg-secondary)';
        });
    }

    // 상단: 좌측 정보 + 우측 불량 / 하단: 저장+검사자
    function _build2Col(leftContent, rightContent, footerContent) {
        return `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:grid;grid-template-columns:260px 1fr;gap:10px;align-items:start;">
                <div style="display:flex;flex-direction:column;gap:10px;">${leftContent}</div>
                <div style="min-width:0;align-self:start;">${rightContent}</div>
            </div>
            ${footerContent || ''}
        </div>`;
    }

    function buildFormHTML(d) {
        d = d || {};
        const left = _buildSelectCard(d) + _buildInspInfoCard(d) + _buildQtyCard(d);
        return _build2Col(left, _buildDefectCard(d.defectDetails || {}), _buildActionBar('LaserInspectionModule._saveInspection()'));
    }

    // ─ 모달 열기 ─────────────────────────────────────────────────────
    function openAddModal() {
        _liCarModel = ''; _liPartName = ''; _liColor = ''; _liWorkId = null;
        const left = _buildSelectCard() + _buildInspInfoCard() + _buildQtyCard() + _buildPackagingCard();
        _openModal('레이져 검사 등록',
            _build2Col(left, _buildDefectCard(), _buildActionBar('LaserInspectionModule._saveInspection()')));
        setTimeout(function() { _initInspectorFields(); }, 50);
    }

    function openInspFromWork(workId) {
        const w = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!w) { UIUtils.toast('작업 정보를 찾을 수 없습니다.', 'error'); return; }
        _liCarModel = w.carModel || ''; _liPartName = w.partName || '';
        _liColor    = w.color    || ''; _liWorkId   = w.id;
        const prevResidualQty = _getPrevResidualQty(w.carModel, w.partName, w.color);
        const packUnit = _parsePackNum(w.packUnit) || _findProductPackUnit(w.carModel, w.partName, w.color);
        // ✓ 부분검사 이어하기: 남은 수량(remainingQty)을 이번 회차 검사 기준으로 삼는다.
        const isPartialWork = w.inspectionStatus === 'partial';
        const inspBase = isPartialWork ? (w.remainingQty || 0) : _getInspBaseFromWork(w);
        const partialBannerHtml = isPartialWork
            ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin-bottom:8px;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.25);border-radius:8px;font-size:0.82rem;color:var(--text-primary);">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue);">restart_alt</span>
                    <div><strong>부분검사 계속</strong>: 이전 ${UIUtils.formatNumber(w.inspectedQty || 0)}개 검사 완료,
                    <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(w.remainingQty || 0)}개</strong> 남음</div>
                </div>`
            : '';
        const draftNoticeHtml = `
            <div id="liDraftNotice" style="display:none;align-items:center;gap:8px;padding:8px 12px;margin-bottom:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:0.8rem;color:var(--text-primary);">
                <span class="material-symbols-outlined" style="color:var(--accent-orange,#f59e0b);">bookmark_added</span>
                <div style="flex:1;">임시 저장된 내용을 불러왔습니다. (<span id="liDraftNoticeTime"></span>)</div>
                <button type="button" class="btn btn-sm btn-outline" onclick="LaserInspectionModule._clearInspectionDraft('${workId}')">삭제</button>
            </div>`;
        const left = draftNoticeHtml + _buildWorkQtyCard(w) + _buildInspInfoCard({}, w) +
            _buildQtyCard({}, w, inspBase) +
            _buildPackagingCard({}, prevResidualQty, packUnit, inspBase);
        _openModal(`레이져 검사 등록 — ${w.partName || ''}`,
            partialBannerHtml + _buildWorkBanner(w) + _build2Col(left, _buildDefectCard(),
                _buildActionBar('LaserInspectionModule._saveInspection()', { draftAction: `LaserInspectionModule._saveInspectionDraft('${workId}')` })));
        setTimeout(async function() {
            _calculateInspectionTime();
            _initInspectorFields();
            _recalcInspQuantities();
            // ✓ 부분검사 이어하기는 항상 새 라운드로 취급 — 임시저장을 불러오지 않는다.
            if (!isPartialWork) {
                try {
                    const drafts = await _getInspectionDrafts();
                    const draft = drafts[workId];
                    if (draft) {
                        _applyInspectionDraft(draft);
                        const notice = document.getElementById('liDraftNotice');
                        const timeEl = document.getElementById('liDraftNoticeTime');
                        if (notice) notice.style.display = 'flex';
                        if (timeEl) timeEl.textContent = _formatDraftTime(draft.savedAt);
                    }
                } catch (e) { /* 무시 */ }
            }
        }, 0);
    }

    function _openInspectionDetail(id, mode) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const canEdit = _canEditInspection();
        const isEdit = mode === 'edit';
        if (isEdit && !canEdit) {
            UIUtils.toast('검사 이력 수정 권한이 없습니다. (레이져운영자·관리자만 가능)', 'warning');
            return;
        }
        _liCarModel = d.carModel || ''; _liPartName = d.partName || '';
        _liColor    = d.color    || ''; _liWorkId   = d.workLogId || null;
        const workRef = d.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, d.workLogId) : null;
        const prevResidualQty = d.prevResidualQty !== undefined
            ? Number(d.prevResidualQty)
            : _getPrevResidualQty(d.carModel, d.partName, d.color, id);
        const packUnit = d.packUnit || (workRef && workRef.packUnit) || _findProductPackUnit(d.carModel, d.partName, d.color);
        const left = (workRef ? _buildWorkQtyCard(workRef) : _buildSelectCard(d)) +
            _buildInspInfoCard(d) +
            _buildQtyCard(d, workRef, workRef ? _getInspBaseFromWork(workRef) : 0) +
            _buildPackagingCard(d, prevResidualQty, packUnit);
        const footer = isEdit
            ? _buildActionBar(`LaserInspectionModule._saveInspection('${id}')`,
                d.workLogId ? { draftAction: `LaserInspectionModule._saveInspectionDraft('${d.workLogId}')` } : {})
            : _buildActionBar('', { readonly: true, editId: canEdit ? id : null });
        _openModal(isEdit ? '레이져 검사 수정' : '레이져 검사 보기',
            (workRef ? _buildWorkBanner(workRef) : '') +
            _build2Col(left, _buildDefectCard(d.defectDetails || {}), footer));
        setTimeout(function() {
            _initInspectorFields(d.inspectors || []);
            if (!workRef) onCarModelChange(d.partName);
            if (!isEdit) _setInspectionFormReadonly(true);
            if (workRef) _recalcInspQuantities();
        }, 50);
    }

    function _addInspectorField(isFirst = false, selectedName = '') {
        const container = document.getElementById('liInspectorContainer');
        if (!container) return;

        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];
        if (!container.inspectorCount) {
            container.inspectorCount = container.querySelectorAll('[id^="liInspector"]').length;
        }
        if (!isFirst && container.inspectorCount >= 5) {
            UIUtils.toast('검사자는 최대 5명까지 추가할 수 있습니다.', 'warning');
            return;
        }

        container.inspectorCount++;
        const idx = container.inspectorCount;
        const selectedId = selectedName
            ? (inspectors.find(insp => (insp.name || insp.id) === selectedName)?.id || '')
            : '';

        container.insertAdjacentHTML('beforeend', `
            <div class="form-group" id="liInspectorGroup${idx}" style="margin:0;flex:0 1 160px;min-width:120px;max-width:200px;">
                <label class="form-label" style="font-size:0.72rem;margin-bottom:2px;">검사자${idx}</label>
                <select id="liInspector${idx}" class="form-select"
                    style="padding:5px 6px;border:1px solid var(--border);font-size:0.85rem;width:100%;"
                    onchange="LaserInspectionModule._syncInspectorOptions()">
                    <option value="">선택 안함</option>
                    ${inspectors.map(insp => {
                        const id = insp.id || '';
                        const name = insp.name || insp.id || '';
                        return `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${name}</option>`;
                    }).join('')}
                </select>
            </div>
        `);
        _syncInspectorOptions();

        const addBtn = document.getElementById('liAddInspectorBtn');
        if (addBtn) addBtn.disabled = container.inspectorCount >= 5;
    }

    function _syncInspectorOptions() {
        const container = document.getElementById('liInspectorContainer');
        if (!container) return;
        const selects = Array.from(container.querySelectorAll('select[id^="liInspector"]'));
        const selectedValues = selects.map(s => s.value).filter(Boolean);
        selects.forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if (!opt.value || opt.value === sel.value) opt.disabled = false;
                else opt.disabled = selectedValues.includes(opt.value);
            });
        });
    }

    function _initInspectorFields(selectedInspectors = []) {
        const container = document.getElementById('liInspectorContainer');
        if (!container) return;
        container.innerHTML = '';
        container.inspectorCount = 0;
        const names = Array.isArray(selectedInspectors)
            ? selectedInspectors.filter(Boolean)
            : [];
        const count = Math.max(2, Math.min(5, names.length || 2));
        for (let i = 0; i < count; i++) {
            _addInspectorField(i === 0, names[i] || '');
        }
    }

    function _collectInspectors() {
        const inspectors = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`liInspector${i}`);
            if (!el || !el.value) continue;
            if (el.tagName === 'SELECT') {
                const opt = el.options[el.selectedIndex];
                if (opt && opt.text && opt.text !== '선택 안함') inspectors.push(opt.text);
            } else if (el.value) {
                inspectors.push(el.value);
            }
        }
        return inspectors;
    }

    // 검사 수량 카드 (좌측)
    function _buildQtyCard(d = {}, workRef = null, inspBaseQty = 0) {
        const failQty = Number(d.failQty) || 0;
        const hasWorkRef = !!workRef;
        const base = hasWorkRef ? (inspBaseQty || _getInspBaseFromWork(workRef)) : (Number(d.inspQty) || 0);
        const goodQty = d.goodQty !== undefined && d.goodQty !== null && d.goodQty !== ''
            ? Math.max(0, Number(d.goodQty) || 0)
            : Math.max(0, base - failQty);
        const totalQty = goodQty + failQty;
        const goodReadonly = hasWorkRef ? 'readonly style="background:var(--bg-secondary);text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"' : 'style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"';
        const isPartial = !!d.isPartial;
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    검사 수량
                    ${hasWorkRef ? `
                    <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:400;color:var(--text-secondary);cursor:pointer;">
                        <input type="checkbox" id="liIsPartialInspection" ${isPartial ? 'checked' : ''} onchange="LaserInspectionModule._togglePartialInspection()" style="cursor:pointer;">
                        <span>부분검사</span>
                    </label>` : ''}
                </h5>
                ${hasWorkRef ? `
                <div style="margin:-2px 0 8px 0;font-size:0.68rem;color:var(--text-muted);line-height:1.35;text-align:right;">
                    일부 수량만 검사 완료 후 저장 시 체크 — 나머지는 검사 대기로 유지됩니다.
                </div>
                <div id="liPartialInspectionInfo" style="display:${isPartial ? 'flex' : 'none'};align-items:flex-start;gap:6px;margin-bottom:8px;padding:7px 10px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);border-radius:6px;font-size:0.72rem;color:var(--text-secondary);line-height:1.4;">
                    <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent-blue);">info</span>
                    <span>부분검사 시 입력한 수량(양품+불량, 최대 <strong>${UIUtils.formatNumber(base)}</strong> EA)만 검사 완료되며, 나머지는 검사 대기로 유지됩니다.</span>
                </div>` : ''}
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">양품수${hasWorkRef ? ' <span style="font-weight:400;color:var(--text-muted);">(자동)</span>' : ''}</label>
                        <input type="number" class="form-input" id="liGoodQty" value="${goodQty > 0 || failQty > 0 ? goodQty : ''}" placeholder="-" min="0"
                            data-has-work-ref="${hasWorkRef ? '1' : '0'}"
                            ${goodReadonly}
                            oninput="LaserInspectionModule._updateDefectQty()"
                            onchange="LaserInspectionModule._updateDefectQty()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">불량수</label>
                        <input type="number" class="form-input" id="liDefectQty" value="${failQty || ''}" min="0"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"
                            oninput="LaserInspectionModule._updateGoodQty()"
                            onchange="LaserInspectionModule._updateGoodQty()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">합계 (자동)</label>
                        <input type="text" class="form-input" id="liTotalQty" value="${totalQty || ''}" readonly
                            style="background:var(--bg-secondary);text-align:right;font-weight:700;font-size:0.9rem;padding:5px 6px;color:var(--accent-blue);">
                    </div>
                </div>
            </div>
        </div>`;
    }

    // 불량 유형 카드 — 우측, 5열 그리드 (도장 검사 일지 스타일)
    function _buildDefectCard(dd = {}) {
        const allDefects   = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const injDefects   = allDefects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = allDefects.filter(d => d.type === 'painting');
        const laserDefects = allDefects.filter(d => d.type === 'laser');

        const section = (label, color, icon, prefix, defects) => {
            if (!defects.length) return '';
            return `
            <div style="margin-bottom:14px;">
                <div style="font-size:0.78rem;font-weight:700;color:${color};border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:10px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span> ${label}
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
                    ${defects.map(d => `
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:0.78rem;font-weight:600;margin:0;color:var(--text-secondary);display:flex;align-items:flex-start;gap:6px;min-width:0;">
                                <button type="button" title="불량유형 보기"
                                    onclick="LaserInspectionModule.showDefectTypeView('${d.id}')"
                                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border-color);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                </button>
                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name||'').replace(/"/g,'&quot;')}">${d.name}</span>
                            </label>
                            <input type="text" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" id="${prefix}${d.id}" data-defect-name="${d.name}"
                                value="${Number(dd[d.name]||0)>0?dd[d.name]:''}" placeholder="-"
                                style="padding:6px;border:1px solid var(--border-color);border-radius:4px;text-align:center;font-weight:700;font-size:0.9rem;"
                                oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserInspectionModule._updateDefectTotal()">
                        </div>`).join('')}
                </div>
            </div>`;
        };

        return `
        <div class="card" style="height:100%;">
            <div class="card-body" style="padding:14px;">
                <h5 style="margin:0 0 12px 0;font-size:0.85rem;color:var(--text-primary);">불량 유형 입력</h5>
                ${section('사출 불량','#ea580c','precision_manufacturing','linj-',injDefects)}
                ${section('도장 불량','#16a34a','format_paint','lpaint-',paintDefects)}
                ${section('레이져 불량','#ef4444','crisis_alert','llaser-',laserDefects)}
            </div>
        </div>`;
    }


    function view(id) {
        _openInspectionDetail(id, 'view');
    }

    function edit(id) {
        _openInspectionDetail(id, 'edit');
    }

    function _validateFailQty(data) {
        const inspBase = Number(data.inspBaseQty) || Number(data.inspQty) || 0;
        const failQty = Number(data.failQty) || 0;
        const defectTotal = Object.values(data.defectDetails || {})
            .reduce((sum, value) => sum + (Number(value) || 0), 0);

        if (failQty > inspBase) {
            UIUtils.toast(`불량수는 검사 기준(${UIUtils.formatNumber(inspBase)} EA)보다 클 수 없습니다.`, 'warning');
            const failEl = document.getElementById('liDefectQty');
            if (failEl) failEl.focus();
            return false;
        }
        if (defectTotal > inspBase) {
            UIUtils.toast(`불량 유형 합계는 검사 기준(${UIUtils.formatNumber(inspBase)} EA)보다 클 수 없습니다.`, 'warning');
            return false;
        }
        return true;
    }

    // ─ 저장 ──────────────────────────────────────────────────────────
    function _scalePaintLotsToQty(paintLots, newQty) {
        const lots = (Array.isArray(paintLots) ? paintLots : []).map(function(l) {
            return Object.assign({}, l);
        });
        if (!lots.length) return lots;
        const target = Math.max(0, Number(newQty) || 0);
        if (lots.length === 1) {
            lots[0].qty = target;
            return lots;
        }
        const lotSum = lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (lotSum <= 0) {
            lots[0].qty = target;
            return lots;
        }
        var allocated = 0;
        lots.forEach(function(l, idx) {
            if (idx === lots.length - 1) {
                l.qty = Math.max(0, target - allocated);
            } else {
                l.qty = Math.round((Number(l.qty) || 0) / lotSum * target);
                allocated += l.qty;
            }
        });
        return lots;
    }

    async function _syncWorkLogFromInspection(data, isPartial, existingId) {
        if (!data.workLogId) return null;
        const workRef = Storage.getById(DB.STORES.LASER_WORK_LOG, data.workLogId);
        if (!workRef) return null;

        const newWorkQty = Math.max(0, Number(data.workQty) || Number(workRef.quantity) || 0);
        const oldQty = Number(workRef.quantity) || 0;
        const qtyChanged = newWorkQty > 0 && newWorkQty !== oldQty;
        const loss = _getWorkLossTotal(workRef);
        const patch = {
            packUnit: data.packUnit || workRef.packUnit || 0,
            inspectionGoodQty: Number(data.goodQty) || 0,
            shippingEligibleQty: Number(data.packQty) || 0,
            laserResidualQty: Number(data.residualQty) || 0,
            laserResidualStatus: (Number(data.residualQty) || 0) > 0 ? '잔량' : ''
        };

        if (qtyChanged) {
            patch.quantity = newWorkQty;
            patch.completedQty = Math.max(0, newWorkQty - loss);
            if (Array.isArray(workRef.paintLots) && workRef.paintLots.length) {
                patch.paintLots = _scalePaintLotsToQty(workRef.paintLots, newWorkQty);
            }
        }

        // ✓ 부분검사 진행 상태(작업일지에 누적 검사수량/남은수량 저장)
        let remainingQty = 0;
        if (isPartial) {
            const totalBase = _getInspBaseFromWork(qtyChanged ? Object.assign({}, workRef, patch) : workRef);
            // 기존 검사 건 수정 시, 이전에 이 건이 이미 반영한 수량만큼은 누적에서 빼고 새 값으로 대체(중복 가산 방지)
            let prevRoundQty = 0;
            if (existingId) {
                const prevRecord = Storage.getById(STORE, existingId);
                prevRoundQty = prevRecord ? (Number(prevRecord.inspQty) || 0) : 0;
            }
            const cumulativeInspectedQty = Math.max(0, (Number(workRef.inspectedQty) || 0) - prevRoundQty + (Number(data.inspQty) || 0));
            remainingQty = Math.max(0, totalBase - cumulativeInspectedQty);
            patch.inspectionStatus = remainingQty > 0 ? 'partial' : 'completed';
            patch.inspectedQty = cumulativeInspectedQty;
            patch.remainingQty = remainingQty;
            patch.lastInspectionDate = data.date || UIUtils.today();
        } else {
            patch.inspectionStatus = 'completed';
        }

        await Storage.update(DB.STORES.LASER_WORK_LOG, data.workLogId, Object.assign({}, workRef, patch));
        return { qtyChanged: qtyChanged, oldQty: oldQty, newQty: newWorkQty, isPartial: isPartial, remainingQty: remainingQty };
    }

    async function _saveInspection(existingId) {
        if (existingId && !_canEditInspection()) {
            UIUtils.toast('검사 이력 수정 권한이 없습니다. (레이져운영자·관리자만 가능)', 'warning');
            return;
        }
        const data = collectData();
        if (!data.inspQty || !data.partName) {
            UIUtils.toast('필수 항목(품명, 검사수량)을 입력하세요.', 'warning');
            return;
        }
        if (!_validateFailQty(data)) return;

        // ✓ 부분검사: 이번 회차 검사수량이 검사 대상 수량(검사 기준)을 넘지 않는지 확인
        const isPartial = _isPartialInspectionMode();
        const availableQty = _getInspBaseFromForm();
        if (isPartial && availableQty > 0 && data.inspQty > availableQty) {
            UIUtils.toast(`이번 검사수량(${UIUtils.formatNumber(data.inspQty)})이 검사 대상 수량(${UIUtils.formatNumber(availableQty)})을 초과할 수 없습니다.`, 'warning');
            return;
        }
        data.isPartial = isPartial;
        data.inspectionStatus = isPartial ? 'partial' : 'completed';

        // 외관검사 합계(양품+불량) ↔ 레이저 작업일지 작업수량 연동 + 부분검사 진행상태 반영
        let syncResult = null;
        try {
            syncResult = await _syncWorkLogFromInspection(data, isPartial, existingId);
        } catch (e) {
            console.error('[LaserInspection] work log sync failed:', e);
            UIUtils.toast('작업일지 수량 연동에 실패했습니다: ' + (e && e.message ? e.message : '오류'), 'error');
            return;
        }

        const partialMsg = (isPartial && syncResult)
            ? (syncResult.remainingQty > 0
                ? `부분검사 완료: 이번 회차 ${UIUtils.formatNumber(data.inspQty)} EA 검사, 남은 수량 ${UIUtils.formatNumber(syncResult.remainingQty)} EA (검사 대기 상태 유지)`
                : '부분검사로 전량 소진되어 검사 완료 처리되었습니다.')
            : null;

        if (existingId) {
            await Storage.update(STORE, existingId, data);
            UIUtils.toast(
                partialMsg || (syncResult && syncResult.qtyChanged
                    ? `수정되었습니다. 작업일지 수량 ${UIUtils.formatNumber(syncResult.oldQty)} → ${UIUtils.formatNumber(syncResult.newQty)} EA 반영`
                    : '수정되었습니다.'),
                'success'
            );
        } else {
            await Storage.add(STORE, data);
            UIUtils.toast(
                partialMsg || (syncResult && syncResult.qtyChanged
                    ? `검사 등록되었습니다. 작업일지 수량 ${UIUtils.formatNumber(syncResult.oldQty)} → ${UIUtils.formatNumber(syncResult.newQty)} EA 반영`
                    : '검사 등록되었습니다.'),
                'success'
            );

            // ── 출하검사 대기 자동 등록 ────────────────────────────────
            const _workRef = data.workLogId
                ? Storage.getById(DB.STORES.LASER_WORK_LOG, data.workLogId) : null;
            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p =>
                p.carModel === data.carModel && p.partName === data.partName && p.color === data.color)
                || _products.find(p => p.carModel === data.carModel && p.partName === data.partName);

            const _lot = _lotInfo(_workRef || data);
            const _paintingDate = _lot.paintDates.join(', ');
            const _lotNo = _lot.injectionLots.join(', ');
            const _laserLot = _lot.laserDate || data.date || '';
            const _packUnit  = data.packUnit || ((_workRef && _workRef.packUnit) || _findProductPackUnit(data.carModel, data.partName, data.color));
            const _packQty   = data.packQty || 0;
            const _boxCount  = data.packBoxCount || 0;
            const _residualQty = data.residualQty || 0;

            // 레이져 후 도장(A/B) 공정이 있는 제품은 출하대기가 아닌 재공품(WIP)으로 남김
            const _isWipProduct = typeof LaserWipModule !== 'undefined' &&
                LaserWipModule.isAfterLaserDrainProduct(data.carModel || '', data.partName || '');

            if (_packQty > 0 && !_isWipProduct) {
                await Storage.add(DB.STORES.SHIPPING_STANDBY, {
                    date         : data.date || UIUtils.today(),
                    source       : 'laser_inspection',
                    carModel     : data.carModel     || '',
                    partName     : data.partName     || '',
                    color        : data.color        || '',
                    paintingDate : _paintingDate,
                    paintLot     : _paintingDate,
                    lotNo        : _lotNo,
                    injectionLot : _lotNo,
                    laserLot     : _laserLot,
                    laserWorkDate: _lot.laserDate || '',
                    inspectionQty: _packQty,
                    goodQty      : _packQty,
                    packUnit     : _packUnit,
                    boxCount     : _boxCount,
                    laserResidualQty: _residualQty,
                    customer     : _prod ? (_prod.customer || '') : '',
                    status       : '대기'
                });
            }
        }
        // 검사 저장(부분검사 포함) 완료 시 임시 저장 내용은 정리
        if (data.workLogId) await _clearInspectionDraft(data.workLogId, true);
        _closeModal();
        renderStandby();
        search();
        if (typeof LaserWorkModule !== 'undefined' && LaserWorkModule.search) {
            try { LaserWorkModule.search(); } catch (e) { /* ignore */ }
        }
    }

    // ─ 데이터 수집 ───────────────────────────────────────────────────
    function collectData() {
        const goodQty   = parseInt(document.getElementById('liGoodQty')?.value || 0, 10) || 0;
        const failQty   = parseInt(document.getElementById('liDefectQty')?.value || 0, 10) || 0;
        const inspBaseQty = _getInspBaseFromForm();
        const inspQty   = Math.max(0, goodQty + failQty);
        const workQty   = parseInt(document.getElementById('liWorkQty')?.value || 0, 10) || 0;
        const inspQtyEl = document.getElementById('liInspQty');
        if (inspQtyEl) inspQtyEl.value = inspQty;

        const defectDetails = {};
        document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]').forEach(el => {
            const val = parseInt(el.value || 0);
            if (val > 0) defectDetails[el.dataset.defectName] = val;
        });

        const carModelEl = document.getElementById('liCarModel');
        const partNameEl = document.getElementById('liPartName');
        const prevResidualQty = parseInt(document.getElementById('liPrevResidual')?.value || 0);
        const packUnit        = parseInt(document.getElementById('liPackUnit')?.value || 0);
        const packBoxCount    = parseInt(document.getElementById('liPackBoxCount')?.value || 0);
        const packQty         = packUnit * packBoxCount;
        const residualQty     = Math.max(0, prevResidualQty + goodQty - packQty);
        return {
            date               : document.getElementById('liDate')?.value || UIUtils.today(),
            carModel           : carModelEl ? carModelEl.value : _liCarModel,
            partName           : partNameEl ? partNameEl.value : _liPartName,
            color              : _liColor,
            workLogId          : _liWorkId || '',
            inspectionStartTime: document.getElementById('liStartTime')?.value || '',
            inspectionEndTime  : document.getElementById('liEndTime')?.value   || '',
            inspQty, goodQty, failQty, workQty, inspBaseQty,
            failRate           : inspQty > 0 ? (failQty / inspQty * 100) : 0,
            defectDetails,
            inspectors         : _collectInspectors(),
            prevResidualQty, packUnit, packBoxCount, packQty, residualQty
        };
    }

    function onCarModelChange(prevPart = '') {
        const carEl = document.getElementById('liCarModel');
        if (!carEl) return;
        const partSelect = document.getElementById('liPartName');
        if (!partSelect) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            [...new Set(products.filter(p => p.carModel === carEl.value).map(p => p.partName))].sort()
            .map(p => `<option value="${p}" ${p === prevPart ? 'selected' : ''}>${p}</option>`).join('');
    }

    // ─ 계산 헬퍼 ─────────────────────────────────────────────────────
    function _updateDefectTotal() {
        _recalcInspQuantities();
    }

    function _updateDefectQty() {
        if (document.getElementById('liWorkQty')) {
            _recalcInspQuantities();
            return;
        }
        const g = parseInt(document.getElementById('liGoodQty')?.value || 0, 10) || 0;
        const f = parseInt(document.getElementById('liDefectQty')?.value || 0, 10) || 0;
        const tEl = document.getElementById('liTotalQty');
        if (tEl) tEl.value = g + f;
        const inspQtyEl = document.getElementById('liInspQty');
        if (inspQtyEl) inspQtyEl.value = g + f;
        _updatePackagingCalc();
    }

    function _updateGoodQty() {
        _recalcInspQuantities();
    }

    function _getPrevResidualQty(carModel, partName, color, excludeId) {
        // 1순위: 레이져 후 잔량 재고 현황 (레이져잔량)
        if (typeof LaserWipModule !== 'undefined' && typeof LaserWipModule.getResidualQty === 'function') {
            const laserResidual = LaserWipModule.getResidualQty(carModel, partName, color);
            if (laserResidual > 0) return laserResidual;
        }
        // 2순위: 직전 외관검사의 신규 잔량 (폴백)
        const all = Storage.getAll(STORE) || [];
        const match = all
            .filter(i => i.carModel === carModel && i.partName === partName &&
                         (!color || !i.color || i.color === color) &&
                         i.id !== excludeId && typeof i.residualQty === 'number')
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                            (b.inspectionStartTime || '').localeCompare(a.inspectionStartTime || ''));
        return match.length ? (Number(match[0].residualQty) || 0) : 0;
    }

    function _buildPackagingCard(d = {}, prevResQty = 0, packUnitDef = 0, initGoodQty = 0) {
        const prevRes  = d.prevResidualQty !== undefined ? Number(d.prevResidualQty) : prevResQty;
        const packUnit = d.packUnit !== undefined ? Number(d.packUnit) : Number(packUnitDef) || 0;
        const goodHint = Number(d.goodQty) || initGoodQty;
        // 박스 수: 기존 저장값 우선, 없으면 (기존잔량+양품) ÷ 박스단위 자동계산
        const boxCount = d.packBoxCount !== undefined
            ? Number(d.packBoxCount)
            : (packUnit > 0 ? Math.floor((prevRes + goodHint) / packUnit) : 0);
        const packQty  = Number(d.packQty) || packUnit * boxCount;
        const newResid = d.residualQty !== undefined
            ? Number(d.residualQty)
            : Math.max(0, prevRes + goodHint - packQty);
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);display:flex;align-items:center;gap:5px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">inventory_2</span>
                    포장
                </h5>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">기존 잔량 <span style="font-weight:400;color:var(--text-muted);font-size:0.65rem;">(레이져잔량)</span></label>
                        <input type="number" class="form-input" id="liPrevResidual" value="${prevRes}" min="0"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"
                            oninput="LaserInspectionModule._updatePackagingCalc()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">박스당 수량</label>
                        <input type="number" class="form-input" id="liPackUnit" value="${packUnit || ''}" min="1" placeholder="-"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"
                            oninput="LaserInspectionModule._autoBoxCount()">
                    </div>
                </div>
                <div class="form-group" style="margin:0 0 8px 0;">
                    <label class="form-label" style="font-size:0.72rem;">박스 수 <span style="font-weight:400;color:var(--text-muted);font-size:0.68rem;">(조정 가능)</span></label>
                    <input type="number" class="form-input" id="liPackBoxCount" value="${boxCount || ''}" min="0" placeholder="0"
                        style="text-align:right;font-weight:700;font-size:0.95rem;padding:5px 6px;"
                        oninput="LaserInspectionModule._updatePackagingCalc()">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--bg-secondary);border-radius:6px;padding:8px;">
                    <div style="text-align:center;">
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">포장수량</div>
                        <div id="liPackQtyDisp" style="font-weight:700;font-size:1.05rem;color:var(--accent-blue);">${UIUtils.formatNumber(packQty)}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);">EA</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">신규 잔량</div>
                        <div id="liNewResidDisp" style="font-weight:700;font-size:1.05rem;color:${newResid < 0 ? 'var(--accent-red)' : 'var(--accent-orange)'};">${UIUtils.formatNumber(Math.max(0, newResid))}</div>
                        <div style="font-size:0.65rem;color:var(--text-muted);">EA</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _autoBoxCount() {
        const prevRes  = parseInt(document.getElementById('liPrevResidual')?.value || 0);
        const packUnit = parseInt(document.getElementById('liPackUnit')?.value || 0);
        const goodQty  = parseInt(document.getElementById('liGoodQty')?.value || 0);
        const boxCountEl = document.getElementById('liPackBoxCount');
        if (boxCountEl && packUnit > 0) {
            boxCountEl.value = Math.floor((prevRes + goodQty) / packUnit);
        }
        _updatePackagingCalc();
    }

    function _updatePackagingCalc() {
        const prevRes  = parseInt(document.getElementById('liPrevResidual')?.value || 0);
        const packUnit = parseInt(document.getElementById('liPackUnit')?.value || 0);
        const boxCount = parseInt(document.getElementById('liPackBoxCount')?.value || 0);
        const goodQty  = parseInt(document.getElementById('liGoodQty')?.value || 0);
        const packQty  = packUnit * boxCount;
        const newResid = prevRes + goodQty - packQty;
        const packDisp  = document.getElementById('liPackQtyDisp');
        const residDisp = document.getElementById('liNewResidDisp');
        if (packDisp) packDisp.textContent = UIUtils.formatNumber(packQty);
        if (residDisp) {
            residDisp.textContent = UIUtils.formatNumber(Math.max(0, newResid));
            residDisp.style.color = newResid < 0 ? 'var(--accent-red)' : 'var(--accent-orange)';
        }
    }

    function _calculateInspectionTime() {
        const s = document.getElementById('liStartTime');
        const e = document.getElementById('liEndTime');
        const d = document.getElementById('liDuration');
        if (!s||!e||!d) return;
        if (!s.value||!e.value) { d.value=''; return; }
        const toMin = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
        let dur = toMin(e.value) - toMin(s.value);
        if (dur < 0) dur += 1440;
        d.value = `${dur}분`;
    }

    function _viewText(value) {
        const text = String(value == null ? '' : value).trim();
        if (!text) return '<span style="color:var(--text-muted);">-</span>';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');
    }

    function _viewImages(defect) {
        const images = Array.isArray(defect.exampleImages)
            ? defect.exampleImages
            : (defect.exampleImage ? [defect.exampleImage] : []);
        if (!images.length) return '<div style="color:var(--text-muted);font-size:0.86rem;">등록된 예시 사진이 없습니다.</div>';
        return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
            ${images.map((src, i) => `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-secondary);">
                    <img src="${src}" alt="불량 예시 ${i + 1}" style="width:100%;height:130px;object-fit:contain;background:#fff;display:block;">
                    <div style="padding:4px 8px;font-size:0.76rem;color:var(--text-muted);">예시 ${i + 1}</div>
                </div>`).join('')}
        </div>`;
    }

    function _showDefectViewOverlay(bodyHtml) {
        document.getElementById('liDefectViewOverlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'liDefectViewOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.38);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
        overlay.innerHTML = `
            <div style="width:min(820px,96vw);max-height:88vh;display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:0 24px 80px rgba(15,23,42,0.35);overflow:hidden;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border-color);">
                    <h3 style="margin:0;font-size:1.05rem;font-weight:800;">불량 유형 보기</h3>
                    <button type="button" onclick="LaserInspectionModule.closeDefectTypeView()" style="border:none;background:transparent;cursor:pointer;color:var(--text-muted);padding:4px;">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div style="padding:16px 18px;overflow:auto;">${bodyHtml}</div>
                <div style="padding:12px 18px;border-top:1px solid var(--border-color);display:flex;justify-content:flex-end;">
                    <button class="btn btn-secondary" onclick="LaserInspectionModule.closeDefectTypeView()">닫기</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    function closeDefectTypeView() {
        document.getElementById('liDefectViewOverlay')?.remove();
    }

    function showDefectTypeView(id) {
        const defect = (Storage.getAll(DB.STORES.DEFECT_TYPES) || []).find(d => d && d.id === id);
        if (!defect) {
            UIUtils.toast('불량유형 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        const typeLabel = {
            injection: '사출 불량',
            painting: '도장 불량',
            laser: '레이져 불량',
            printing: '인쇄 불량',
            plating: '도금 불량'
        }[defect.type || 'injection'] || '불량 유형';
        const causes = defect.causes || {};
        _showDefectViewOverlay(`
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                    <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">search</span>
                    <div>
                        <div style="font-size:0.78rem;color:var(--text-muted);">${typeLabel}</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary);">${_viewText(defect.name)}</div>
                    </div>
                </div>
                <div>
                    <div class="form-label">설명</div>
                    <div style="padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:#fff;line-height:1.45;">${_viewText(defect.description)}</div>
                </div>
                <div>
                    <div class="form-label">예시 사진</div>
                    ${_viewImages(defect)}
                </div>
                <div>
                    <div class="form-label">4M 불량 원인</div>
                    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;"><strong style="color:#2563eb;">Machine (기계/설비)</strong><div style="margin-top:6px;line-height:1.45;">${_viewText(causes.machine || defect.machineCause)}</div></div>
                        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;"><strong style="color:#d97706;">Material (재료)</strong><div style="margin-top:6px;line-height:1.45;">${_viewText(causes.material || defect.materialCause)}</div></div>
                        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;"><strong style="color:#7c3aed;">Method (방법)</strong><div style="margin-top:6px;line-height:1.45;">${_viewText(causes.method || defect.methodCause)}</div></div>
                        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;"><strong style="color:#16a34a;">Man (작업자)</strong><div style="margin-top:6px;line-height:1.45;">${_viewText(causes.man || defect.manCause)}</div></div>
                    </div>
                </div>
                <div>
                    <div class="form-label">조치 방법</div>
                    <div style="padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:#fff;line-height:1.45;">${_viewText(defect.countermeasure || defect.actionMethod)}</div>
                </div>
            </div>
        `);
    }

    // ─ 숫자 키패드 ───────────────────────────────────────────────────

    function remove(id) {
        if (!_canEditInspection()) {
            UIUtils.toast('검사 이력 삭제 권한이 없습니다. (레이져운영자·관리자만 가능)', 'warning');
            return;
        }
        UIUtils.confirm('해당 검사 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderStandby();
            search();
        });
    }

    // 검사 대기 항목(레이져 작업 기록) 삭제 요청 — 사유 입력 모달 표시 (관리자 전용)
    function _deleteStandbyWork(workId) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning');
            return false;
        }
        const work = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!work) {
            UIUtils.toast('작업 기록을 찾을 수 없습니다.', 'error');
            return false;
        }
        if (getInspectedWorkIds().has(workId)) {
            UIUtils.toast('이미 검사가 등록된 작업입니다. 검사 이력에서 삭제하세요.', 'warning');
            return false;
        }

        const label = `${work.date || ''} / ${work.machine || '-'} / ${work.carModel || ''} ${work.partName || ''} / ${UIUtils.formatNumber(work.quantity || 0)}EA`;
        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);margin-right:4px;">delete_outline</span> 검사 대기 삭제',
            `
                <div style="padding:4px 0;">
                    <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:16px;">
                        <span class="material-symbols-outlined" style="color:#ea580c;font-size:28px;">warning</span>
                        <div>
                            <div style="font-weight:700;margin-bottom:2px;">검사 대기 항목(레이져 작업 기록)을 삭제합니다.</div>
                            <div style="font-size:0.85rem;color:var(--text-secondary);">${label}</div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">삭제 사유 <span style="color:var(--accent-red)">*</span></label>
                        <textarea class="form-input" id="laserStandbyDeleteReason" placeholder="삭제 사유를 입력하세요 (예: 중복 등록, 오입력, 계획 변경 등)" style="resize:vertical;min-height:80px;"></textarea>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">info</span>
                        삭제 후 복구할 수 없으며, 삭제 이력이 기록됩니다.
                    </div>
                </div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-danger" onclick="LaserInspectionModule._confirmDeleteStandbyWork('${workId}')">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">delete</span> 삭제
                </button>
            `,
            '520px'
        );

        setTimeout(() => {
            const el = document.getElementById('laserStandbyDeleteReason');
            if (el) el.focus();
        }, 100);
        return true;
    }

    // 검사 대기 삭제 확정 — 사유 검증 후 감사 로그 기록 + LASER_WORK_LOG 삭제
    async function _confirmDeleteStandbyWork(workId) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning');
            return false;
        }
        const reasonInput = document.getElementById('laserStandbyDeleteReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        if (!reason) {
            UIUtils.toast('삭제 사유를 입력해주세요.', 'warning');
            if (reasonInput) reasonInput.focus();
            return false;
        }

        const work = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!work) {
            UIUtils.toast('작업 기록을 찾을 수 없습니다.', 'error');
            return false;
        }
        if (getInspectedWorkIds().has(workId)) {
            UIUtils.toast('이미 검사가 등록된 작업입니다. 검사 이력에서 삭제하세요.', 'warning');
            return false;
        }

        try {
            const user = _currentUser();
            const logEntry = {
                id: Storage.generateId(),
                type: 'laser_work',
                typeLabel: '레이저 작업(검사대기)',
                deletedAt: new Date().toISOString(),
                deletedBy: user ? (user.displayName || user.name || user.id || '알 수 없음') : '알 수 없음',
                reason: reason,
                originalId: workId,
                originalData: Object.assign({}, work),
                summary: `${work.date || ''} / ${work.machine || '-'} / ${work.carModel || ''} ${work.partName || ''} / ${UIUtils.formatNumber(work.quantity || 0)}EA`,
            };
            await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, logEntry);
            await Storage.remove(DB.STORES.LASER_WORK_LOG, workId);
            UIUtils.closeModal();
            UIUtils.toast('삭제 완료. 이력이 기록되었습니다.', 'success');
            renderStandby();
            return true;
        } catch (error) {
            console.error('[LaserInspectionModule] 검사 대기 삭제 오류:', error);
            UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            return false;
        }
    }

    return {
        render, openAddModal, openInspFromWork, search, renderStandby, onCarModelChange, view, edit, remove,
        _deleteStandbyWork, _confirmDeleteStandbyWork,
        _closeModal, _saveInspection, _showDetail,
        showDefectTypeView, closeDefectTypeView,
        showNonconformStandardPage, showInspectionPage,
        focusNonconformStandardPasteZone, handleNonconformStandardPaste, printNonconformStandardPage,
        _updateDefectTotal, _updateDefectQty, _updateGoodQty, _calculateInspectionTime,
        _enableWorkQtyEdit, confirmWorkQtyEdit, cancelWorkQtyEdit, _previewWorkQtyEdit, _recalcInspQuantities,
        _updatePackagingCalc, _autoBoxCount,
        _addInspectorField, _syncInspectorOptions,
        _togglePartialInspection, _saveInspectionDraft, _clearInspectionDraft,
    };
})();


// ===================================================================
// 레이져 대기품 — 차종별 재공 재고 관리
// 입고: 도장 작업 완료 (제조공정-2: 레이저 제품)
// 출고: 레이져 작업 처리 완료
// 재공재고: 입고 합계 - 출고 합계
// ===================================================================
var LaserStandbyModule = (function() {
    const MANUAL_OVERRIDE_KEY = 'laser_standby_stock_overrides_v1';
    const HISTORY_RESET_KEY = 'laser_standby_history_resets_v1';
    let _manualOverrides = [];
    let _manualOverridesLoaded = false;
    let _historyResets = [];
    let _historyResetsLoaded = false;

    // background cache warm → 레이져 대기품 화면 1회 재렌더 (뒤늦게 로드되는 스토어 반영)
    let _cacheWarmUnsub = null;
    let _cacheWarmRefreshTimer = null;
    function _bindCacheWarmRefreshOnce() {
        if (typeof Storage === 'undefined' || typeof Storage.onCacheWarm !== 'function') return;
        if (_cacheWarmUnsub) return;

        const watch = new Set([
            DB.STORES.PRODUCTS,
            DB.STORES.PAINTING_WORK,
            DB.STORES.LASER_WORK_LOG
        ].filter(Boolean));

        _cacheWarmUnsub = Storage.onCacheWarm(function(storeName) {
            // 현재 화면이 레이져 대기품 현황일 때만 (컨테이너 존재로 판단)
            if (!document.getElementById('lsbInventory')) return;
            if (storeName !== '*' && !watch.has(storeName)) return;

            // 마지막 워밍 이벤트 기준 디바운스 (중간 이벤트만 스킵하지 않음)
            clearTimeout(_cacheWarmRefreshTimer);
            _cacheWarmRefreshTimer = setTimeout(function() {
                _cacheWarmRefreshTimer = null;
                try { renderAll(); } catch (e) {}
            }, 250);
        });
    }

    function _escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up" style="padding:20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:8px;">
                    <div>
                        <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-orange);">hourglass_top</span>
                            레이져 대기품 현황
                        </h3>
                        <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-secondary);">
                            도장 완료 후 레이져 공정 대기 중인 재공품 현황과 재고 흐름을 확인합니다.
                        </p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="btn btn-secondary" onclick="LaserStandbyModule.openLayout()">
                            <span class="material-symbols-outlined">map</span> 재공품 현황 레이아웃
                        </button>
                        <button class="btn btn-secondary" onclick="LaserStandbyModule.refresh()">
                            <span class="material-symbols-outlined">refresh</span> 새로고침
                        </button>
                    </div>
                </div>

                <div id="lsbUnassignedWarn"></div>
                <div class="stat-cards" id="lsbStats"></div>

                <!-- 차종별 재공 재고 현황 (블록) -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">입고(도장완료) − 출고(레이져처리) = 재공재고</span>
                    </div>
                    <div class="card-body" id="lsbInventory" style="padding:16px; display:flex; flex-direction:column; gap:14px;"></div>
                </div>

                <!-- 입출고 현황 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">table_rows</span> 입출고 현황</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">입고와 출고 내역을 분리 표시</span>
                    </div>
                    <div class="card-body" id="lsbDetail" style="padding:0;"></div>
                </div>

            </div>
        `;
        _initStandbyView();
    }

    async function _initStandbyView() {
        _bindCacheWarmRefreshOnce();
        if (!_requiredStoresReady()) {
            _renderNotReadyState();
        }
        try {
            await _ensureManualOverridesLoaded();
            await _ensureHistoryResetsLoaded();
        } catch (e) {
            console.warn('[LaserStandbyModule] CONFIG 수기조정/리셋 로드 실패:', e);
        }
        renderAll();
    }

    // 제품 조회 헬퍼 — 컬러가 있으면 제품 마스터 컬러와 정확히 일치해야 함 (다른 컬러로 조용히 치환하지 않음)
    function findProduct(products, w) {
        const productId = String((w && w.productId) || '').trim();
        if (productId) {
            const byId = products.find(function(p) { return String((p && p.id) || '') === productId; });
            if (byId) return byId;
        }
        const car = String(w.carModel || '').trim();
        const part = String(w.partName || '').trim();
        const color = String(w.color || '').trim();
        const match = (p) => String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
        if (color) {
            return products.find(p => match(p) && String(p.color || '').trim() === color) || null;
        }
        return products.find(p => match(p)) || null;
    }

    function _sameText(a, b) {
        return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    }

    function _findProductByInjectionPart(products, injectionMaterials, row) {
        const car = String(row.carModel || '').trim();
        const part = String(row.partName || '').trim();
        const color = String(row.color || '').trim();
        if (!part) return null;

        const candidates = [];
        (injectionMaterials || []).forEach(mat => {
            if (!_sameText(mat.injPartName, part)) return;
            if (car && mat.carModel && !_sameText(mat.carModel, car)) return;

            const linkedIds = Array.isArray(mat.productIds) ? mat.productIds.map(id => String(id)) : [];
            if (linkedIds.length) {
                products.forEach(product => {
                    if (linkedIds.includes(String(product.id || ''))) candidates.push(product);
                });
            }

            [mat.mfgProductName, mat.mfgProductName2].forEach(name => {
                const mfgName = String(name || '').trim();
                if (!mfgName) return;
                products.forEach(product => {
                    if (car && product.carModel && !_sameText(product.carModel, car)) return;
                    if (_sameText(product.partName, mfgName)) candidates.push(product);
                });
            });
        });

        const unique = [];
        const seen = new Set();
        candidates.forEach(product => {
            const key = String(product && product.id || `${product.carModel}||${product.partName}||${product.color}`);
            if (!product || seen.has(key)) return;
            seen.add(key);
            unique.push(product);
        });

        if (color) {
            // 컬러가 명시된 기록은 다른 컬러 제품으로 조용히 치환하지 않는다.
            return unique.find(product => _sameText(product.color, color)) || null;
        }
        return unique.find(product => car && _sameText(product.carModel, car))
            || (unique.length === 1 ? unique[0] : null);
    }

    function _canonicalStandbyRecord(row, products, injectionMaterials) {
        // 납품처 분할 작업은 작업 결과 품명이 연결 제품으로 바뀔 수 있지만,
        // 레이져 대기에서는 작업 전 원본 품목을 차감해야 한다.
        const identityRow = row && row.standbySourcePartName
            ? {
                ...row,
                productId: row.standbySourceProductId || row.productId || '',
                carModel: row.standbySourceCarModel || row.carModel || '',
                partName: row.standbySourcePartName || row.partName || '',
                color: row.standbySourceColor != null ? row.standbySourceColor : (row.color || '')
            }
            : row;
        const prod = findProduct(products, identityRow)
            || _findProductByInjectionPart(products, injectionMaterials, identityRow);

        // ⚠ 제품 마스터에 매칭되는 제품이 없으면 예전에는 원본 행을 그대로 통과시켰다.
        // 그 결과 도장/사출 쪽 품명(예: 'PAO COVER (WHITE)')이 재공 현황에 제품 품명인 척
        // 섞여 들어와 존재하지 않는 유령 품목이 만들어졌다. 통과시키되 반드시 표시한다.
        if (!prod) return { ...identityRow, _unmatchedProduct: true };

        const originalPartName = String(identityRow.partName || '').trim();
        const productPartName = String(prod.partName || '').trim();
        return {
            ...row,
            productId: prod.id || identityRow.productId || '',
            carModel: prod.carModel || identityRow.carModel || '',
            partName: productPartName || identityRow.partName || '',
            color: prod.color || identityRow.color || '',
            sourcePartName: originalPartName && originalPartName !== productPartName
                ? originalPartName
                : (identityRow.sourcePartName || '')
        };
    }

    function _itemKey(carModel, partName, color) {
        return `${carModel || ''}||${partName || ''}||${color || ''}`;
    }

    function _normalizeQty(value) {
        const qty = parseInt(String(value || '').replace(/,/g, ''), 10);
        return Number.isFinite(qty) && qty > 0 ? qty : 0;
    }

    function _scaleLotRowsToTotal(lots, totalQty) {
        const rows = (lots || []).filter(function(lot) {
            return _normalizeQty(lot && lot.qty) > 0;
        });
        const total = _normalizeQty(totalQty);
        const sourceTotal = rows.reduce(function(sum, lot) {
            return sum + _normalizeQty(lot.qty);
        }, 0);
        if (!rows.length || total <= 0 || sourceTotal <= 0) return total <= 0 ? [] : rows;

        let allocated = 0;
        return rows.map(function(lot, index) {
            const qty = index === rows.length - 1
                ? Math.max(0, total - allocated)
                : Math.max(0, Math.floor((_normalizeQty(lot.qty) / sourceTotal) * total));
            allocated += qty;
            return Object.assign({}, lot, { qty: qty });
        }).filter(function(lot) { return lot.qty > 0; });
    }

    function _normalizeFlowKey(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/[-_]/g, '');
    }

    function _hasLaserAfterPaintFlow(prod) {
        if (!prod) return false;
        const seq = [prod.process1, prod.process2, prod.process3, prod.process4]
            .map(_normalizeFlowKey)
            .filter(Boolean);
        const idxPaintA = seq.findIndex(v => v === '도장A');
        const idxPaintB = seq.findIndex(v => v === '도장B');
        const idxLaser  = seq.findIndex(v => v === '레이저' || v === '레이져');
        if (idxLaser < 0) return false;
        // 도장-A 또는 도장-B 중 하나라도 레이져보다 먼저 나오면 해당
        const idxPaint = Math.min(
            idxPaintA >= 0 ? idxPaintA : Infinity,
            idxPaintB >= 0 ? idxPaintB : Infinity
        );
        return idxPaint < idxLaser;
    }

    function _isLaserProcessName(value) {
        const key = _normalizeFlowKey(value);
        const lower = String(value || '').trim().toLowerCase();
        return key === '레이저' || key === '레이져' || lower.includes('laser');
    }

    function _normalizePaintLine(value) {
        const raw = String(value || '').trim();
        const alias = { '도장(A)': '도장-A', '도장(B)': '도장-B' };
        return alias[raw] || raw;
    }

    function _hasLaserProcess(prod) {
        if (!prod) return false;
        return [prod.process1, prod.process2, prod.process3, prod.process4]
            .some(_isLaserProcessName);
    }

    // 도장 작업 완료품이 레이저 대기 재고에 포함되는지 (LaserWorkModule.getLaserStandbyItems와 동일 기준)
    function _isPaintingWorkLaserStandbyInbound(paintingWork, prod) {
        if (!prod || !_hasLaserProcess(prod)) return false;
        const procs = [prod.process1, prod.process2, prod.process3, prod.process4]
            .map(p => String(p || '').trim());
        const paintLine = _normalizePaintLine(paintingWork.line || '');
        const paintIdx = procs.indexOf(paintLine);
        const laserIdx = procs.findIndex(p => p.includes('레이저') || p.includes('레이져'));
        if (laserIdx < 0) return false;
        if (!paintLine || paintIdx < 0) return true;
        return laserIdx > paintIdx;
    }

    function _getLaserRelatedProducts() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.filter(prod => _hasLaserProcess(prod));
    }

    function _getLaserTargetProducts() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        // 레이져 납품처 분리 연결의 대상 제품(예: KNOB BLACK [LED])은
        // 레이져 작업 시점에야 생기므로 대기품(도장→레이져 전) 목록에서 제외한다.
        // 대기 품명은 소스 제품(예: KNOB [LED] BK 1spot)만 표시.
        const linkedTargetIds = new Set(
            products.map(function(p) { return p && p.linkedProductId; }).filter(Boolean)
        );
        return products.filter(function(prod) {
            if (!prod || linkedTargetIds.has(prod.id)) return false;
            return _hasLaserAfterPaintFlow(prod);
        });
    }

    function _getOverrideByKey(key) {
        return _manualOverrides.find(item => _itemKey(item.carModel, item.partName, item.color) === key) || null;
    }

    async function _ensureManualOverridesLoaded(forceReload = false) {
        if (_manualOverridesLoaded && !forceReload) return _manualOverrides;
        const rows = await Storage.getConfigValue(MANUAL_OVERRIDE_KEY);
        _manualOverrides = Array.isArray(rows) ? rows : [];
        _manualOverridesLoaded = true;
        return _manualOverrides;
    }

    async function _saveManualOverrides() {
        await Storage.setConfigValue(MANUAL_OVERRIDE_KEY, _manualOverrides);
    }

    async function _ensureHistoryResetsLoaded(forceReload = false) {
        if (_historyResetsLoaded && !forceReload) return _historyResets;
        const rows = await Storage.getConfigValue(HISTORY_RESET_KEY);
        _historyResets = Array.isArray(rows) ? rows : [];
        _historyResetsLoaded = true;
        return _historyResets;
    }

    async function _saveHistoryResets() {
        await Storage.setConfigValue(HISTORY_RESET_KEY, _historyResets);
    }

    function _eventStamp(value) {
        return String(value || '')
            .trim()
            .replace(' ', 'T')
            .replace(/(\d{4}-\d{2}-\d{2})T?(\d{2}:\d{2})?(:\d{2})?.*$/, function(_, d, hm, sec) {
                return d + 'T' + (hm || '00:00') + (sec || ':00');
            });
    }

    // 재고 선후관계는 사용자가 수정 가능한 생산일/시간보다 실제 레코드 생성시각을 우선한다.
    // 수기보정은 effectiveAt(신규) → updatedAt(레거시), 작업은 createdAt을 사용하고,
    // 해당 값이 없는 오래된 레코드만 생산일+시간으로 폴백한다.
    function _inventoryEventStamp(record, fallbackDate = '', fallbackTime = '') {
        if (!record) return _eventStamp(_formatWorkDateTime(fallbackDate, fallbackTime));
        const preferred = record.effectiveAt
            || record.createdAt
            || record.updatedAt
            || '';
        return _eventStamp(preferred || _formatWorkDateTime(
            record.date || fallbackDate,
            record.endTime || record.startTime || fallbackTime
        ));
    }

    function _isBeforeHistoryReset(dateValue, resetAt) {
        if (!resetAt) return false;
        return _eventStamp(dateValue) < _eventStamp(resetAt);
    }

    function _getHistoryResetForKey(key) {
        const k = String(key || '');
        return (_historyResets || []).find(function(r) {
            if (!r) return false;
            if (r.key && r.key === k) return true;
            return _itemKey(r.carModel, r.partName, r.color) === k;
        }) || null;
    }

    // 레이져 작업 등록(LaserWorkModule) 화면에서 수기 등록 재고를 대기품 목록에 반영하기 위해 사용
    async function ensureManualOverridesLoadedForWork() {
        await _ensureHistoryResetsLoaded();
        return _ensureManualOverridesLoaded();
    }

    // 현재 캐시된(비동기 로드 완료된) 재공 재고 스냅샷 — 동기 함수라 로드 전에 호출하면 빈 값일 수 있음
    function getStockSnapshotSync() {
        return _buildInventorySnapshot().stockItems;
    }

    // 레이저 작업등록 FIFO가 대기재고 상세의 LOT 계산과 같은 값을 사용하도록 제공한다.
    // 도장 작업 원본만 재계산하면 수기 차감·LOT 보정이 누락되어 화면별 수량이 달라진다.
    function getWorkLotSnapshotSync() {
        const snapshot = _buildInventorySnapshot();
        const rows = [];

        (snapshot.stockItems || []).forEach(function(item) {
            const grouped = {};
            _buildLotBalanceRows(item.key, item).forEach(function(lot) {
                const paintLot = String(lot.paintLot || '').trim();
                const groupKey = paintLot || 'LOT 미지정';
                if (!grouped[groupKey]) {
                    grouped[groupKey] = {
                        carModel: item.carModel || '',
                        partName: item.partName || '',
                        color: item.color === '-' ? '' : (item.color || ''),
                        paintLot: paintLot,
                        lots: [],
                        quantity: 0
                    };
                }
                grouped[groupKey].lots.push({
                    paintDate: paintLot,
                    lotNo: String(lot.lotNo || ''),
                    qty: Number(lot.qty) || 0
                });
                grouped[groupKey].quantity += Number(lot.qty) || 0;
            });

            Object.values(grouped).forEach(function(group) {
                if (group.quantity <= 0) return;
                const p = group.paintLot;
                const date = /^\d{6}$/.test(p)
                    ? `20${p.slice(0, 2)}-${p.slice(2, 4)}-${p.slice(4, 6)}`
                    : p;
                rows.push({
                    carModel: group.carModel,
                    partName: group.partName,
                    color: group.color,
                    date: date,
                    productionQty: group.quantity,
                    lots: group.lots,
                    isAuthoritativeLotBalance: true
                });
            });
        });
        return rows;
    }

    function _parseManualLotPair(value) {
        const text = String(value || '').trim();
        if (!text) return { paintLot: '', injectionLot: '' };
        const parts = text.split('/').map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) return { paintLot: parts[0], injectionLot: parts.slice(1).join(' / ') };
        return { paintLot: '', injectionLot: text };
    }

    function _formatWorkDateTime(dateValue, timeValue = '') {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return '-';

        const dateTimeMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        if (dateTimeMatch) return `${dateTimeMatch[1]} ${dateTimeMatch[2]}`;

        const dateOnly = (rawDate.match(/\d{4}-\d{2}-\d{2}/) || [rawDate])[0];
        const timeOnly = (rawTime.match(/\d{2}:\d{2}/) || [])[0] || '';
        return [dateOnly, timeOnly].filter(Boolean).join(' ') || '-';
    }

    function _paintingWorkDateTime(work) {
        if (!work) return '-';
        return _formatWorkDateTime(work.date || work.paintingDate || '', work.endTime || work.startTime || '');
    }

    function _recordedDateTime(record, fallbackDate = '', fallbackTime = '') {
        return _formatWorkDateTime(
            record.createdAt || record.updatedAt || record.date || fallbackDate,
            record.createdAt || record.updatedAt ? '' : fallbackTime
        );
    }

    function _isAdminUser() {
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function') {
                return !!AuthModule.isAdminUser();
            }
            const user = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
            const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
            return roles.some(role => String(role || '') === 'admin');
        } catch (e) {
            return false;
        }
    }

    // 수량 수정(재공 조정/출고) 권한: 관리자(admin) 또는 설정 화면에서 "레이져 대기품"
    // 입력 권한을 부여받은 역할(범용 권한 시스템, AuthModule.canWritePage). (삭제는 관리자 전용 유지)
    function _canEditStandby() {
        try {
            if (_isAdminUser()) return true;
            return typeof AuthModule !== 'undefined' &&
                typeof AuthModule.canWritePage === 'function' &&
                AuthModule.canWritePage('laser-standby');
        } catch (e) { /* 무시 */ }
        return false;
    }

    function _deleteButton(row, kind) {
        if (!_isAdminUser() || !row.sourceType || !row.sourceId) return '';
        const label = kind === 'in' ? '입고' : '출고';
        return `
            <button type="button" class="btn btn-sm btn-danger"
                    style="padding:3px 8px;font-size:0.72rem;border-radius:6px;"
                    onclick="event.stopPropagation(); LaserStandbyModule.deleteFlowRecord('${kind}', '${encodeURIComponent(row.sourceType)}', '${encodeURIComponent(row.sourceId)}')">
                삭제
            </button>`;
    }

    function _buildInventorySnapshot() {
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const injectionMaterials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const inventoryMap = {};

        const laserPaintWorks = paintingWorks
            .map(w => _canonicalStandbyRecord(w, products, injectionMaterials))
            .filter(w => {
            const prod = findProduct(products, w);
            return _isPaintingWorkLaserStandbyInbound(w, prod);
        });

        laserPaintWorks.forEach(w => {
            const key = _itemKey(w.carModel, w.partName, w.color || '');
            const histReset = _getHistoryResetForKey(key);
            const prod = findProduct(products, w);
            if (!inventoryMap[key]) {
                inventoryMap[key] = {
                    key,
                    carModel: w.carModel || '-',
                    partName: w.partName || '-',
                    color: w.color || '-',
                    itemType: prod ? (prod.process2 || '-') : '-',
                    unmatchedProduct: !!w._unmatchedProduct,
                    inQty: 0,
                    outQty: 0,
                    inRecords: [],
                    outRecords: [],
                    historyReset: histReset || null
                };
            } else if (histReset) {
                inventoryMap[key].historyReset = histReset;
            }
            const qty = Number(w.productionQty) || 0;
            const paintLot = String(_paintingWorkDateTime(w) || w.date || '').replace(/-/g, '').slice(2, 8);
            const injLot = w.lotNo || (w.lots && w.lots.length > 0
                ? [...new Set(w.lots.map(l => l.lotNo).filter(Boolean))].join(', ')
                : '');
            inventoryMap[key].inQty += qty;
            inventoryMap[key].inRecords.push({
                sourceType: DB.STORES.PAINTING_WORK,
                sourceId: w.id || '',
                date: _recordedDateTime(w, w.date || '', w.endTime || w.startTime || ''),
                eventStamp: _inventoryEventStamp(w, w.date || '', w.endTime || w.startTime || ''),
                paintingDate: _paintingWorkDateTime(w),
                qty,
                lotNo: injLot,
                injLotNo: injLot,
                paintLot: paintLot || '',
                line: w.line || '',
                note: w.note || ''
            });
        });

        // 수기 입고/보정 품목은 실제 날짜와 관계없이 아래 레이져 작업 루프보다 먼저
        // 품목 바구니를 준비한다. 기존 코드는 데이터 날짜가 7/10 입고 → 7/16 출고여도
        // 스토어 종류별로 도장입고 → 레이져작업 → 수기보정 순서로 처리하여,
        // 도장 자동입고가 없는 수기 품목의 7/16 출고를 먼저 버리는 문제가 있었다.
        // 수량 보정은 기존과 같이 뒤의 보정 계산에서 적용하고 여기서는 키만 선등록한다.
        _manualOverrides.forEach(function(rawOverride) {
            const override = _canonicalStandbyRecord(rawOverride, products, injectionMaterials);
            const key = _itemKey(override.carModel, override.partName, override.color || '');
            if (!key.replace(/\|/g, '') || inventoryMap[key]) return;
            const prod = findProduct(products, override) || {};
            inventoryMap[key] = {
                key,
                carModel: override.carModel || '-',
                partName: override.partName || '-',
                color: override.color || '-',
                itemType: prod.process2 || '-',
                unmatchedProduct: !!override._unmatchedProduct,
                inQty: 0,
                outQty: 0,
                inRecords: [],
                outRecords: [],
                historyReset: _getHistoryResetForKey(key)
            };
        });

        laserWorks.forEach(raw => {
            // isManual 레코드는 잔량·재공 수기 조정이며 대기품 출고가 아니다.
            // 대기품 출고는 _manualOverrides(CONFIG)에 저장되므로 여기서 걸러야 한다.
            if (raw && raw.isManual) return;
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            const key = _itemKey(w.carModel, w.partName, w.color || '');
            const histReset = _getHistoryResetForKey(key);
            // 도장 자동입고가 없고 수기 재고보정으로만 입고된 품목도 레이져 작업 출고를
            // 보존해야 한다. 이전에는 이 시점에 품목 바구니가 없으면 출고를 버렸고,
            // 뒤에서 수기보정 입고만 생성되어 작업 후에도 대기재고가 차감되지 않았다.
            if (!inventoryMap[key]) {
                const prod = findProduct(products, w) || {};
                inventoryMap[key] = {
                    key,
                    carModel: w.carModel || '-',
                    partName: w.partName || '-',
                    color: w.color || '-',
                    itemType: prod.process2 || '-',
                    unmatchedProduct: !!w._unmatchedProduct,
                    inQty: 0,
                    outQty: 0,
                    inRecords: [],
                    outRecords: [],
                    historyReset: histReset || null
                };
            } else if (histReset) {
                inventoryMap[key].historyReset = histReset;
            }
            const qty = Number(w.quantity) || 0;
            inventoryMap[key].outQty += qty;
            const paintDates = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.paintDate).filter(Boolean))].join(', ')
                : (w.paintDate || '');
            const injLots = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.lotNo).filter(Boolean))].join(', ')
                : (w.paintLot || w.lotNo || '');
            const paintLotOut = paintDates
                ? String(paintDates).split(/[,\s]+/).filter(Boolean).map(function(p) {
                    const digits = String(p).replace(/-/g, '').replace(/\D/g, '');
                    if (digits.length >= 8) return digits.slice(2, 8);
                    if (digits.length === 6) return digits;
                    return p;
                }).join(', ')
                : '';
            inventoryMap[key].outRecords.push({
                sourceType: DB.STORES.LASER_WORK_LOG,
                sourceId: w.id || '',
                date: _formatWorkDateTime(w.date || '', w.endTime || w.startTime || ''),
                eventStamp: _inventoryEventStamp(w, w.date || '', w.endTime || w.startTime || ''),
                paintingDate: _formatWorkDateTime(paintDates, ''),
                lotNo: injLots,
                injLotNo: injLots,
                paintLot: paintLotOut,
                qty,
                machine: w.machine || '',
                operator: [w.worker1, w.worker2, w.worker3].filter(Boolean).join(', ') || w.author || '',
                author: w.author || '',
                note: w.note || ''
            });
        });

        (_historyResets || []).forEach(function(reset) {
            if (!reset) return;
            const key = reset.key || _itemKey(reset.carModel, reset.partName, reset.color);
            if (inventoryMap[key]) inventoryMap[key].historyReset = reset;
        });

        _manualOverrides.forEach(rawOverride => {
            const override = _canonicalStandbyRecord(rawOverride, products, injectionMaterials);
            const key = _itemKey(override.carModel, override.partName, override.color || '');
            if (!key.replace(/\|/g, '')) return;
            const histReset = _getHistoryResetForKey(key);
            if (!inventoryMap[key]) {
                const prod = findProduct(products, override) || {};
                inventoryMap[key] = {
                    key,
                    carModel: override.carModel || '-',
                    partName: override.partName || '-',
                    color: override.color || '-',
                    itemType: prod.process2 || '-',
                    inQty: 0,
                    outQty: 0,
                    inRecords: [],
                    outRecords: [],
                    historyReset: histReset || null
                };
            } else if (histReset) {
                inventoryMap[key].historyReset = histReset;
            }

            // 수기 보정은 "보정 시점에 재고를 targetStock으로 맞춘다"는 절대값 지시다.
            // 이후(보정 시점보다 뒤)에 쌓인 실제 도장/레이져 실적은 그대로 얹혀야 하므로,
            // diff는 "보정 시점 이전" 원본 기록만을 기준으로 계산한다 — 전체 기간을 기준으로
            // 계산하면 보정 이후의 실제 실적까지 diff에 흡수되어 재고가 그 실적을 반영하지 못하고
            // 보정값에 고정돼버린다(실제로 이 문제가 있었다).
            const overrideEventStamp = _inventoryEventStamp(
                override,
                override.date || UIUtils.today(),
                ''
            );
            const overrideDisplayDate = _formatWorkDateTime(
                override.date || override.updatedAt || UIUtils.today(),
                ''
            );
            const rawInBefore = inventoryMap[key].inRecords
                .filter(r => String(r.eventStamp || _eventStamp(r.date)) <= overrideEventStamp)
                .reduce((s, r) => s + (Number(r.qty) || 0), 0);
            const rawOutBefore = inventoryMap[key].outRecords
                .filter(r => String(r.eventStamp || _eventStamp(r.date)) <= overrideEventStamp)
                .reduce((s, r) => s + (Number(r.qty) || 0), 0);
            const currentStock = rawInBefore - rawOutBefore;
            const targetStock = _normalizeQty(override.actualQty);
            const diff = targetStock - currentStock;
            inventoryMap[key].manualOverride = override;
            inventoryMap[key].manualOverrideDate = overrideEventStamp;

            // absoluteAfter=targetStock을 함께 실어, 이력 화면이 diff를 이전 잔량에 누적하지 않고
            // targetStock으로 바로 덮어쓰게 한다 — 이력의 "현재 수량"이 항상 실제 재고와 일치해야 하므로.
            if (diff > 0) {
                inventoryMap[key].inQty += diff;
                inventoryMap[key].inRecords.push({
                    sourceType: 'manual_override',
                    sourceId: override.id || '',
                    date: overrideDisplayDate,
                    eventStamp: overrideEventStamp,
                    paintingDate: _formatWorkDateTime(override.paintLot || override.date || '', ''),
                    qty: diff,
                    absoluteAfter: targetStock,
                    lotNo: override.injectionLot || '',
                    injLotNo: override.injectionLot || '',
                    paintLot: override.paintLot || '',
                    injectionLot: override.injectionLot || '',
                    author: override.author || '',
                    operator: override.author || '',
                    note: override.note || (override.manualType === 'add' ? '수기추가'
                        : (override.manualType === 'out' ? '수기출고' : '수기조정'))
                });
            } else if (diff < 0) {
                inventoryMap[key].outQty += Math.abs(diff);
                inventoryMap[key].outRecords.push({
                    sourceType: 'manual_override',
                    sourceId: override.id || '',
                    date: overrideDisplayDate,
                    eventStamp: overrideEventStamp,
                    paintingDate: _formatWorkDateTime(override.paintLot || override.date || '', ''),
                    lotNo: override.injectionLot || '',
                    injLotNo: override.injectionLot || '',
                    paintLot: override.paintLot || '',
                    qty: Math.abs(diff),
                    absoluteAfter: targetStock,
                    author: override.author || '',
                    operator: override.author || '',
                    machine: override.note || (override.manualType === 'add' ? '수기추가'
                        : (override.manualType === 'out' ? '수기출고' : '수기조정')),
                    note: override.note || (override.manualType === 'add' ? '수기추가'
                        : (override.manualType === 'out' ? '수기출고' : '수기조정'))
                });
            }
        });

        const allItems = Object.values(inventoryMap)
            .map(item => ({ ...item, stockQty: item.inQty - item.outQty }))
            .sort((a, b) => String(a.carModel || '').localeCompare(String(b.carModel || '')) || String(a.partName || '').localeCompare(String(b.partName || '')));
        const stockItems = allItems.filter(item => item.stockQty > 0);

        return { inventoryMap, allItems, stockItems };
    }

    function _getDetailSnapshot(key) {
        const { inventoryMap } = _buildInventorySnapshot();
        const item = inventoryMap[key] || null;
        if (!item) return { item: null, totalIn: 0, totalOut: 0, stock: 0, allRows: [] };
        const histReset = item.historyReset || _getHistoryResetForKey(key);
        let allRows = [
            ...((item.inRecords || []).map(r => ({ kind: 'in', ...r }))),
            ...((item.outRecords || []).map(r => ({ kind: 'out', ...r })))
        ];
        // 이력만 리셋: 재고/LOT 집계는 전체 유지, 리셋 이전 이력은 기록으로 남기고(재고 재생 제외)
        if (histReset && histReset.historyResetAt) {
            allRows = allRows.map(function(r) {
                if (_isBeforeHistoryReset(r.date, histReset.historyResetAt)) {
                    return Object.assign({}, r, { beforeReset: true });
                }
                return r;
            });
            const openingStock = Number(histReset.openingStock != null ? histReset.openingStock : histReset.prevStock) || 0;
            const openingLots = Array.isArray(histReset.openingLots) ? histReset.openingLots : [];
            const paintLots = [...new Set(openingLots.map(function(l) {
                return String((l && (l.paintLot || l.paintDate)) || '').trim();
            }).filter(function(v) { return v && v !== '-'; }))];
            const injLots = [...new Set(openingLots.map(function(l) {
                return String((l && (l.lotNo || l.injectionLot || l.injLot)) || '').trim();
            }).filter(function(v) { return v && v !== '-'; }))];
            allRows.push({
                kind: 'in',
                date: histReset.historyResetAt,
                qty: openingStock,
                sourceType: 'history_reset_baseline',
                note: '이력 리셋 시점 잔량',
                paintLot: paintLots.join(', ') || '-',
                lotNo: injLots.join(', ') || '-',
                injLotNo: injLots.join(', ') || '-',
                injectionLot: injLots.join(', ') || '-',
                operator: histReset.author || '',
                author: histReset.author || '',
                isHistoryReset: true
            });
        }
        allRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        return {
            item,
            totalIn: Number(item.inQty) || 0,
            totalOut: Number(item.outQty) || 0,
            stock: Number(item.stockQty != null ? item.stockQty : ((item.inQty || 0) - (item.outQty || 0))),
            allRows
        };
    }

    function _standbyRoute(r) {
        const note = String((r && r.note) || '').trim();
        const machine = String((r && r.machine) || '').trim();
        const line = String((r && r.line) || '').trim();
        const srcType = String((r && r.sourceType) || '').trim();
        const laserWorkStore = (typeof DB !== 'undefined' && DB.STORES && DB.STORES.LASER_WORK_LOG)
            ? DB.STORES.LASER_WORK_LOG
            : 'laser_work_log';

        if (srcType === 'history_reset_baseline') {
            return { label: '이력 리셋', color: '#2563eb', detail: note || '리셋 시점 잔량' };
        }

        if (r && r.kind === 'out') {
            // 레이져 작업일지로 대기품을 소진한 경우 → 수동 출고가 아니라 레이져 생산
            const isLaserWork = srcType === laserWorkStore
                || srcType === 'laser_work_log'
                || srcType === 'laser_work'
                || /레이저|레이져/.test(machine)
                || /레이저|레이져/.test(note);
            if (isLaserWork) {
                return { label: '레이져 생산', color: '#7c3aed', detail: machine || note || '레이져 작업' };
            }
            return { label: '수동 출고', color: '#dc2626', detail: note || machine || '수기 출고' };
        }

        // 입고: 수동 입고 vs 도장 라인에서 입고
        if (srcType === 'manual_override' || /수기|수동|조정|추가/.test(note) || /수기|수동|조정|추가/.test(machine)) {
            return { label: '수동 입고', color: '#0891b2', detail: note || machine || '수기 등록' };
        }
        return {
            label: '도장 라인에서 입고',
            color: '#2563eb',
            detail: line || note || '도장 작업 입고'
        };
    }

    function _standbyWho(r) {
        if (!r) return '-';
        return r.operator || r.author
            || [r.worker1, r.worker2, r.worker3].filter(Boolean).join(', ')
            || '-';
    }

    function _standbyPaintLotDisplay(r) {
        function toYymmdd(v) {
            const s = String(v || '').trim();
            if (!s) return '';
            if (/^\d{6}$/.test(s)) return s;
            const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (m) return m[1].slice(2) + m[2] + m[3];
            const digits = s.replace(/-/g, '').replace(/\D/g, '');
            if (digits.length >= 8) return digits.slice(2, 8);
            if (digits.length === 6) return digits;
            return s;
        }
        const raw = String(r.paintLot || '').trim();
        if (raw) {
            return raw.split(/[,\s]+/).filter(Boolean).map(toYymmdd).filter(Boolean).join(', ') || '-';
        }
        const fromPainting = toYymmdd(r.paintingDate);
        return fromPainting || '-';
    }

    function _standbyToSimpleHistItems(allRows) {
        return (allRows || []).map(function(r) {
            const route = _standbyRoute(r);
            const injLot = r.injLotNo || r.injectionLot || r.lotNo || '-';
            const paintLot = _standbyPaintLotDisplay(r);
            const isReset = r.sourceType === 'history_reset_baseline' || !!r.isHistoryReset;
            const srcType = String(r.sourceType || '').trim();
            const srcId = String(r.sourceId || '').trim();
            let editKind = '';
            if (!isReset && srcId) {
                if (srcType === 'manual_override') editKind = 'standby_override';
                else if (srcType === DB.STORES.PAINTING_WORK || srcType === 'painting_work') editKind = 'standby_paint';
                else if (srcType === DB.STORES.LASER_WORK_LOG || srcType === 'laser_work_log') editKind = 'standby_laser';
            }
            return {
                date: r.date,
                isOut: r.kind === 'out',
                routeLabel: route.label,
                routeColor: route.color,
                routeDetail: route.detail,
                paintLot: paintLot || '-',
                injLot: injLot,
                lot: injLot,
                qty: Number(r.qty) || 0,
                absoluteAfter: isReset
                    ? (Number(r.qty) || 0)
                    : (r.absoluteAfter != null ? Number(r.absoluteAfter) : null),
                isHistoryReset: isReset,
                beforeReset: !!r.beforeReset,
                author: _standbyWho(r),
                note: r.note || '',
                _orig: r,
                sourceType: srcType,
                sourceId: srcId,
                editKind: editKind
            };
        });
    }

    function _standbyToInvRecords(allRows) {
        return (allRows || []).map(function(r) {
            const injLot = r.injLotNo || r.injectionLot || r.lotNo || '무표기';
            const paintLot = _standbyPaintLotDisplay(r);
            const qty = Number(r.qty) || 0;
            return {
                type: r.kind === 'out' ? '출고' : '입고',
                date: r.date,
                quantity: qty,
                lotNo: injLot,
                paintLot: paintLot || '-',
                injLot: injLot,
                lots: [{ lotNo: injLot, paintLot: paintLot || '', qty: qty }],
                _orig: r,
                receivedBy: r.operator || r.author || '',
                outgoingBy: r.operator || r.author || ''
            };
        });
    }

    function _formatStandbyHistoryRow(r) {
        const isOut = r.kind === 'out';
        const route = _standbyRoute(r);
        const injLot = r.injLotNo || r.lotNo || '-';
        const paintLot = r.kind === 'in'
            ? (r.paintLot ? String(r.paintLot).replace(/-/g, '').slice(2, 8) : '-')
            : (r.paintLot || '-');
        const lotText = paintLot && paintLot !== '-'
            ? `${injLot} / ${paintLot}`
            : injLot;
        const who = _standbyWho(r);
        const detail = String(route.detail || '').replace(/"/g, '&quot;');
        return `
            <tr>
                <td style="white-space:nowrap;font-size:0.8rem;">${r.date || '-'}</td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;
                        background:${isOut ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'};
                        color:${isOut ? '#dc2626' : '#16a34a'};">${isOut ? '출고' : '입고'}</span>
                </td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:4px;
                        border:1px solid ${route.color}44;background:${route.color}12;color:${route.color};">${route.label}</span>
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;max-width:160px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${detail}">${route.detail}</div>
                </td>
                <td style="font-size:0.8rem;font-family:monospace;">${lotText}</td>
                <td style="text-align:right;font-weight:600;color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};">
                    ${isOut ? '−' : '+'}${UIUtils.formatNumber(r.qty)}
                </td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${who}</td>
            </tr>`;
    }

    function _expandLotQuantities(totalQty, lots, fallbackLotNo = '', fallbackPaintLot = '') {
        const total = Number(totalQty) || 0;
        const sourceLots = Array.isArray(lots) ? lots : [];
        const normalized = sourceLots.map(lot => ({
            lotNo: String((lot && (lot.lotNo || lot.injectionLot)) || fallbackLotNo || '(미확인)'),
            paintLot: String((lot && (lot.paintLot || lot.paintDate)) || fallbackPaintLot || ''),
            qty: Number(lot && lot.qty) || 0
        })).filter(lot => lot.lotNo || lot.paintLot || lot.qty > 0);

        if (!normalized.length) {
            return total > 0 ? [{ lotNo: fallbackLotNo || '(미확인)', paintLot: fallbackPaintLot || '', qty: total }] : [];
        }

        const lotQtySum = normalized.reduce((sum, lot) => sum + (Number(lot.qty) || 0), 0);
        if (lotQtySum <= 0) {
            const equalQty = total > 0 ? (total / normalized.length) : 0;
            return normalized.map((lot, index) => ({
                lotNo: lot.lotNo,
                paintLot: lot.paintLot,
                qty: index === normalized.length - 1 ? Math.max(0, total - (equalQty * index)) : equalQty
            }));
        }

        if (total <= 0) return [];
        // LOT 합계가 작업수량과 다르면 마지막 LOT 하나에 차이를 몰아넣지 않는다.
        // 큰 음수 차이에서 마지막 LOT만 0으로 잘리고 앞 LOT가 작업수량을 초과해 남는 문제를
        // 방지하도록 전체 LOT를 비례 조정하고 마지막 LOT에 반올림 잔여만 배분한다.
        let allocated = 0;
        const adjusted = normalized.map(function(lot, index) {
            const qty = index === normalized.length - 1
                ? Math.max(0, total - allocated)
                : Math.max(0, Math.floor(((Number(lot.qty) || 0) / lotQtySum) * total));
            allocated += qty;
            return {
                lotNo: lot.lotNo,
                paintLot: lot.paintLot,
                qty: qty
            };
        });
        return adjusted.filter(lot => lot.qty > 0);
    }

    function _buildLotBalanceRows(key, item = null) {
        const [carModel, partName, color] = String(key || '').split('||');
        const override = item && item.manualOverride;
        const overrideLots = override && Array.isArray(override.lots) ? override.lots : [];
        // _buildInventorySnapshot이 계산한 것과 같은 보정 시점 기준선을 그대로 쓴다(있으면 재계산하지 않음).
        const overrideDateStamp = override
            ? String((item && item.manualOverrideDate) || _formatWorkDateTime(override.date || override.updatedAt || UIUtils.today(), '') || '')
            : '';

        const balanceMap = {};
        function addLot(lotNo, paintLot, qtyDelta) {
            const lotKey = String(lotNo || '(미확인)');
            if (!balanceMap[lotKey]) {
                balanceMap[lotKey] = { lotNo: lotKey, paintLot: paintLot || '-', qty: 0 };
            }
            if ((!balanceMap[lotKey].paintLot || balanceMap[lotKey].paintLot === '-') && paintLot) {
                balanceMap[lotKey].paintLot = paintLot;
            }
            balanceMap[lotKey].qty += Number(qtyDelta) || 0;
        }

        // 출고 LOT가 현재 보유 LOT와 정확히 맞지 않더라도 음수 LOT를 만들지 않는다.
        // 같은 사출 LOT → 미확인 LOT → 나머지 보유 LOT 순서로 실제 재고만 0까지 차감한다.
        function drainLot(lotNo, qty) {
            let remaining = Math.max(0, Number(qty) || 0);
            if (remaining <= 0) return;
            const requested = String(lotNo || '(미확인)');
            const orderedKeys = Object.keys(balanceMap).sort(function(a, b) {
                const rank = function(key) {
                    if (key === requested) return 0;
                    if (key === '(미확인)') return 1;
                    return 2;
                };
                return rank(a) - rank(b);
            });
            orderedKeys.forEach(function(key) {
                if (remaining <= 0) return;
                const row = balanceMap[key];
                const available = Math.max(0, Number(row && row.qty) || 0);
                if (available <= 0) return;
                const used = Math.min(available, remaining);
                row.qty = available - used;
                remaining -= used;
            });
        }

        // 보정 시점 LOT 스냅샷을 기준선으로 놓는다. 보정 이전 원본 기록은 이 스냅샷에 이미
        // 반영돼 있으므로 다시 더하지 않고, 보정 이후 실제 실적만 추가로 얹는다.
        if (overrideLots.length > 0) {
            overrideLots.forEach(function(lot) {
                const lotNo = String((lot && (lot.injectionLot || lot.lotNo)) || '').trim();
                if (!lotNo) return;
                addLot(lotNo, String((lot && (lot.paintLot || lot.paintDate)) || '-').trim() || '-', Number(lot && lot.qty) || 0);
            });
        } else if (override) {
            // LOT 배분이 없는 레거시 보정도 보정 시점의 기준 재고로 먼저 세워야
            // 이후 레이져 작업 출고가 이 수량을 정상적으로 차감할 수 있다.
            const targetQty = _normalizeQty(override.actualQty);
            if (targetQty > 0) addLot('(미확인)', '-', targetQty);
        }

        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const injectionMaterials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

        paintingWorks.forEach(raw => {
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName || ((w.color || '') !== (color || ''))) return;
            // _buildInventorySnapshot과 동일한 필터: 이 도장 작업이 레이저 대기 인바운드인지 확인
            const prod = products.find(function(p) {
                return String(p.carModel||'').trim() === String(w.carModel||'').trim() &&
                       String(p.partName||'').trim() === String(w.partName||'').trim();
            });
            if (!_isPaintingWorkLaserStandbyInbound(w, prod)) return;
            const totalQty = Number(w.productionQty) || 0;
            if (totalQty <= 0) return;
            if (overrideDateStamp) {
                const recordDate = _inventoryEventStamp(w, w.date || '', w.endTime || w.startTime || '');
                if (String(recordDate || '') <= overrideDateStamp) return; // 보정 시점 이전은 스냅샷에 이미 포함
            }
            const paintLot = String(_paintingWorkDateTime(w) || w.date || '').replace(/-/g, '').slice(2, 8);
            const lots = _expandLotQuantities(
                totalQty,
                Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ lotNo: w.lotNo || '', qty: totalQty, paintDate: w.date || '' }],
                w.lotNo || '',
                paintLot
            );
            lots.forEach(lot => addLot(lot.lotNo, lot.paintLot || paintLot, lot.qty));
        });

        laserWorks.forEach(raw => {
            // isManual 레코드(잔량·재공 수기조정)는 대기품 LOT 잔량 계산에 포함하지 않는다.
            if (raw && raw.isManual) return;
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName || ((w.color || '') !== (color || ''))) return;
            const totalQty = Number(w.quantity) || 0;
            if (totalQty <= 0) return;
            if (overrideDateStamp) {
                const recordDate = _inventoryEventStamp(w, w.date || '', w.endTime || w.startTime || '');
                if (String(recordDate || '') <= overrideDateStamp) return;
            }
            const fallbackPaintLot = String(w.paintDate || w.date || '').replace(/-/g, '').slice(2, 8);
            const lots = _expandLotQuantities(
                totalQty,
                Array.isArray(w.paintLots) && w.paintLots.length > 0 ? w.paintLots : [{ lotNo: w.lotNo || w.paintLot || '', qty: totalQty, paintDate: w.paintDate || '' }],
                w.lotNo || w.paintLot || '',
                fallbackPaintLot
            );
            lots.forEach(lot => drainLot(lot.lotNo, lot.qty));
        });

        return Object.values(balanceMap)
            .filter(row => row.qty > 0.001)
            .sort((a, b) => String(a.lotNo || '').localeCompare(String(b.lotNo || '')))
            .map(row => ({
                lotNo: row.lotNo,
                paintLot: row.paintLot || '-',
                qty: Math.round(row.qty * 1000) / 1000
            }));
    }

    // 레이저 대기품 재고 계산에 반드시 필요한 스토어
    //   PAINTING_WORK  : 입고(도장완료) 소스
    //   LASER_WORK_LOG : 출고(레이저처리) 소스
    //   PRODUCTS       : 공정 라우팅(도장→레이저) 판별
    const _REQUIRED_STORES = [
        DB.STORES.PAINTING_WORK,
        DB.STORES.LASER_WORK_LOG,
        DB.STORES.PRODUCTS,
        DB.STORES.INJECTION_MATERIALS
    ].filter(Boolean);

    // 필수 스토어가 모두 "권위 있는 소스"에서 로드됐는지 확인.
    // Storage.isStoreReady 가 없으면(구버전) 캐시 존재 여부로 안전하게 폴백.
    function _requiredStoresReady() {
        if (typeof Storage.areStoresReady === 'function') {
            return Storage.areStoresReady(_REQUIRED_STORES);
        }
        if (typeof Storage.isStoreReady === 'function') {
            return _REQUIRED_STORES.every(s => Storage.isStoreReady(s));
        }
        return true; // 준비 상태 API가 없으면 기존 동작 유지
    }

    // 필수 스토어가 아직 준비되지 않았을 때 "재고 0" 대신 로딩 상태를 표시한다.
    // (DB 이력은 남아 있는데 화면에서 사라져 보이는 사고 방지)
    function _renderNotReadyState() {
        const statsEl = document.getElementById('lsbStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card"><div class="stat-card-value">–</div><div class="stat-card-label">재공 품목 수</div></div>
                <div class="stat-card"><div class="stat-card-value">–</div><div class="stat-card-label">총 재공 재고 (EA)</div></div>
                <div class="stat-card"><div class="stat-card-value">–</div><div class="stat-card-label">총 입고 (도장완료)</div></div>
                <div class="stat-card"><div class="stat-card-value">–</div><div class="stat-card-label">총 출고 (레이져처리)</div></div>`;
        }
        const invEl = document.getElementById('lsbInventory');
        if (invEl) {
            invEl.innerHTML = `
                <div style="text-align:center;padding:40px;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.4;margin-bottom:8px;">sync</span>
                    재고 데이터를 불러오는 중입니다...
                    <div style="margin-top:8px;font-size:0.78rem;color:var(--text-secondary);line-height:1.5;">
                        서버에서 도장/레이저 이력을 로드하고 있습니다. 잠시만 기다려 주세요.<br>
                        데이터가 준비되면 자동으로 갱신됩니다.
                    </div>
                </div>`;
        }
        const detEl = document.getElementById('lsbDetail');
        if (detEl) {
            detEl.innerHTML = `
                <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem;">
                    입출고 내역을 불러오는 중입니다...
                </div>`;
        }
    }

    function renderAll() {
        // ── 게이트: 필수 스토어가 준비되지 않았으면 계산/렌더를 보류 ──
        // 캐시가 아직 안 찬 상태에서 재고를 0으로 계산해 표시하면
        // "DB 이력은 있는데 화면에서 사라지는" 사고가 발생한다.
        // 준비되면 캐시 워밍 이벤트가 renderAll 을 다시 호출한다.
        if (!_requiredStoresReady()) {
            _renderNotReadyState();
            return;
        }
        const { allItems, stockItems } = _buildInventorySnapshot();
        renderUnassignedWarn(stockItems);
        renderStats(stockItems, allItems);
        renderInventoryBlocks(stockItems);
        renderDetailTable(allItems);
    }

    function _isUnassignedStandbyLot(lot) {
        const paintLot = String((lot && lot.paintLot) || '').trim();
        const lotNo = String((lot && lot.lotNo) || '').trim();
        const paintMissing = !paintLot || paintLot === '-' || paintLot === 'LOT 미지정';
        const injMissing = !lotNo || lotNo === '-' || lotNo === '(미확인)';
        return paintMissing || injMissing;
    }

    function _collectStandbyUnassigned(stockItems) {
        const result = [];
        (stockItems || []).forEach(function(item) {
            const key = item.key || (item.carModel + '||' + item.partName + '||' + (item.color || ''));
            let unassignedQty = 0;
            try {
                const lots = _buildLotBalanceRows(key, item).filter(function(l) {
                    return (Number(l.qty) || 0) > 0;
                });
                lots.forEach(function(l) {
                    if (_isUnassignedStandbyLot(l)) unassignedQty += Math.max(0, Number(l.qty) || 0);
                });
                const stock = item.stockQty != null ? item.stockQty : ((item.inQty || 0) - (item.outQty || 0));
                if (stock > 0 && !lots.length) unassignedQty = Math.max(unassignedQty, stock);
            } catch (e) { /* 집계 실패 시 해당 품목 스킵 */ }
            if (unassignedQty > 0) {
                result.push({
                    carModel: item.carModel,
                    partName: item.partName,
                    color: item.color,
                    qty: unassignedQty,
                    key: key
                });
            }
        });
        return result.sort(function(a, b) {
            return (Number(b.qty) || 0) - (Number(a.qty) || 0);
        });
    }

    function renderUnassignedWarn(stockItems) {
        const el = document.getElementById('lsbUnassignedWarn');
        if (!el) return;
        const list = _collectStandbyUnassigned(stockItems);
        if (!list.length) {
            el.innerHTML = '';
            return;
        }
        const totalQty = list.reduce(function(s, i) { return s + (Number(i.qty) || 0); }, 0);
        const accent = 'var(--accent-orange,#f59e0b)';
        const preview = list.slice(0, 6).map(function(i) {
            const label = [i.carModel, i.partName, i.color && i.color !== '-' ? i.color : '']
                .filter(Boolean).join(' · ');
            const enc = encodeURIComponent(i.key);
            return `<button type="button"
                onclick="LaserStandbyModule._showItemDetail('${enc}', event)"
                style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px dashed rgba(245,158,11,0.55);
                       border-radius:999px;background:rgba(255,255,255,0.7);cursor:pointer;font-size:0.74rem;
                       color:var(--text-primary);font-family:inherit;white-space:nowrap;">
                ${_escapeHtml(label)} <strong style="color:${accent};">${UIUtils.formatNumber(i.qty)} EA</strong>
            </button>`;
        }).join('');
        const more = list.length > 6
            ? `<span style="font-size:0.74rem;color:var(--text-muted);">+${list.length - 6}종</span>`
            : '';
        el.innerHTML = `
        <div style="margin-bottom:14px;padding:12px 14px;background:rgba(245,158,11,0.10);
                    border:1px solid rgba(245,158,11,0.38);border-radius:8px;line-height:1.45;">
            <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="font-size:1.15rem;color:${accent};flex-shrink:0;margin-top:1px;">warning</span>
                <div style="flex:1;min-width:200px;">
                    <div style="font-size:0.88rem;font-weight:700;color:${accent};">
                        LOT 미지정 경고
                        <span style="font-weight:600;color:var(--text-secondary);margin-left:6px;">
                            ${list.length}종 · ${UIUtils.formatNumber(totalQty)} EA
                        </span>
                    </div>
                    <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:3px;">
                        도장/사출 LOT가 없는 대기 재고가 있습니다. 품목 상세에서 수량 보정·수동입출고로 LOT를 등록하세요.
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;">
                        ${preview}${more}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function renderStats(stockItems, allItems) {
        const el = document.getElementById('lsbStats');
        if (!el) return;
        const totalStock = stockItems.reduce((s, i) => s + (i.stockQty != null ? i.stockQty : (i.inQty - i.outQty)), 0);
        const totalIn    = allItems.reduce((s, i) => s + i.inQty,  0);
        const totalOut   = allItems.reduce((s, i) => s + i.outQty, 0);

        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${stockItems.length}</div>
                <div class="stat-card-label">재공 품목 수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재공 재고 (EA)</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${UIUtils.formatNumber(totalIn)}</div>
                <div class="stat-card-label">총 입고 (도장완료)</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${UIUtils.formatNumber(totalOut)}</div>
                <div class="stat-card-label">총 출고 (레이져처리)</div>
            </div>
        `;
    }

    // 입고 이력은 있는데 재고가 0으로 계산된 이상 징후 감지 (데이터 소실 방어)
    function _detectInboundStockAnomaly() {
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        let inboundQty = 0;
        let inboundRecords = 0;
        paintingWorks.forEach(w => {
            const prod = findProduct(products, w);
            if (!_isPaintingWorkLaserStandbyInbound(w, prod)) return;
            const qty = Number(w.productionQty) || 0;
            if (qty <= 0) return;
            inboundQty += qty;
            inboundRecords += 1;
        });
        const outQty = laserWorks.reduce((s, w) => s + (Number(w.quantity) || 0), 0);
        const hasManualStock = _manualOverrides.some(o => _normalizeQty(o.actualQty) > 0);
        const suspicious = inboundRecords > 0 && inboundQty > 0 && outQty === 0 && !hasManualStock;
        if (suspicious) {
            console.warn('[LaserStandby][anomaly] 도장 입고 이력은 있으나 재공 재고가 0 — 데이터 불일치', {
                inboundRecords, inboundQty, outQty
            });
        }
        return { suspicious, inboundRecords, inboundQty };
    }

    function renderInventoryBlocks(items) {
        const el = document.getElementById('lsbInventory');
        if (!el) return;

        if (items.length === 0) {
            const { allItems } = _buildInventorySnapshot();
            const depleted = allItems.filter(i => {
                const stock = i.stockQty != null ? i.stockQty : ((i.inQty || 0) - (i.outQty || 0));
                return (i.inQty || 0) > 0 && stock <= 0;
            });
            const anomaly = _detectInboundStockAnomaly();
            const anomalyBanner = anomaly.suspicious
                ? `<div style="margin-top:16px;padding:12px 16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:8px;text-align:left;font-size:0.82rem;color:var(--text-primary);line-height:1.5;">
                    <strong style="color:var(--accent-red);display:flex;align-items:center;gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;">warning</span> 데이터 불일치 감지
                    </strong>
                    <div style="margin-top:6px;">
                        도장 완료 입고 이력 <strong>${anomaly.inboundRecords}건</strong>
                        (${UIUtils.formatNumber(anomaly.inboundQty)} EA)이 있으나 재공 재고가 0으로 표시됩니다.
                        레이저 출고 이력이 없는 상태입니다. 페이지를 새로고침하거나, 계속되면 관리자에게 문의하세요.
                    </div>
                    <button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="LaserStandbyModule.refresh()">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">refresh</span> 새로고침
                    </button>
                   </div>`
                : '';
            const depletedHint = depleted.length > 0
                ? `<div style="margin-top:12px;font-size:0.8rem;color:var(--text-secondary);line-height:1.5;">
                    최근 레이저 작업·출고로 재고가 소진된 품목 <strong>${depleted.length}건</strong>이 있습니다.
                    아래 <b>입출고 현황</b>에서 입·출고 내역을 확인하세요.
                   </div>`
                : '';
            el.innerHTML = `
                <div style="text-align:center;padding:40px;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">${anomaly.suspicious ? 'warning' : 'check_circle'}</span>
                    ${anomaly.suspicious
                        ? '재공 재고를 계산할 수 없습니다.'
                        : '현재 레이져 공정 대기 재공품이 없습니다.'}
                    ${anomalyBanner}
                    ${depletedHint}
                </div>`;
            return;
        }

        // 차종별 그룹핑
        const carGroups = {};
        items.forEach(item => {
            const car = item.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(item);
        });

        const cards = Object.entries(carGroups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([carModel, carItems]) => {
                const totalStock = carItems.reduce((s, i) => s + (i.stockQty != null ? i.stockQty : (i.inQty - i.outQty)), 0);
                const totalIn    = carItems.reduce((s, i) => s + i.inQty,  0);
                const totalOut   = carItems.reduce((s, i) => s + i.outQty, 0);

                const rows = carItems
                    .sort((a, b) => String(a.partName || '').localeCompare(String(b.partName || ''), 'ko') || String(a.color || '').localeCompare(String(b.color || '')))
                    .map(item => {
                        const stock = item.stockQty != null ? item.stockQty : (item.inQty - item.outQty);
                        const stockColor = stock >= 100 ? 'var(--accent-blue)'
                                         : stock >= 30  ? 'var(--accent-green)'
                                         : 'var(--accent-orange)';
                        const lastIn = item.inRecords.length > 0
                            ? [...item.inRecords].sort((a,b)=>b.date.localeCompare(a.date))[0].date : '';
                        const itemKey = item.key || (item.carModel + '||' + item.partName + '||' + (item.color || ''));
                        const paintLotText = (() => {
                            try {
                                const labels = _buildLotBalanceRows(itemKey, item)
                                    .filter(function(l) { return (Number(l.qty) || 0) > 0; })
                                    .map(function(l) { return l.paintLot; });
                                const uniq = [...new Set(labels.map(function(v) {
                                    const raw = String(v == null ? '' : v).trim();
                                    if (!raw || raw === '-') return '';
                                    const s = raw.replace(/-/g, '');
                                    if (/^\d{6}$/.test(s)) return s;
                                    if (/^\d{8}$/.test(s)) return s.slice(2, 8);
                                    if (s.length > 8) return s.slice(2, 8);
                                    return s || raw;
                                }).filter(Boolean))].sort();
                                return uniq.length ? uniq.join(', ') : '-';
                            } catch (e) {
                                return '-';
                            }
                        })();

                        return `
                        <tr onclick="LaserStandbyModule._showItemDetail('${encodeURIComponent(item.carModel+'||'+item.partName+'||'+item.color)}', event)"
                            style="cursor:pointer;"
                            onmouseover="this.style.background='var(--bg-secondary)'"
                            onmouseout="this.style.background=''">
                            <td style="padding:5px 8px;font-size:0.78rem;font-weight:600;border-bottom:1px solid var(--border-color);white-space:normal;word-break:break-word;line-height:1.3;">
                                ${item.partName}
                                ${item.unmatchedProduct ? `<span title="제품 마스터에 없는 품명입니다. 도장/사출 품명이 그대로 들어온 유령 품목일 수 있습니다." style="margin-left:4px;font-size:0.64rem;font-weight:700;color:var(--accent-red);background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.35);border-radius:4px;padding:0 4px;white-space:nowrap;">⚠ 미등록 품명</span>` : ''}
                            </td>
                            <td style="padding:5px 6px;font-size:0.74rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${item.color && item.color !== '-' ? item.color : ''}
                            </td>
                            <td style="padding:5px 6px;font-family:monospace;font-size:0.72rem;color:var(--accent-green);border-bottom:1px solid var(--border-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${paintLotText}">
                                ${paintLotText}
                            </td>
                            <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                                <span style="font-size:0.88rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                                <span style="font-size:0.66rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;text-align:right;">
                                ${lastIn}
                            </td>
                        </tr>`;
                    }).join('');

                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-blue);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${carModel}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${carItems.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">
                            재공 <strong>${UIUtils.formatNumber(totalStock)}</strong> EA
                        </div>
                    </div>
                    <table style="width:max-content;min-width:100%;border-collapse:collapse;background:var(--bg-primary);table-layout:auto;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 6px;text-align:center;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">컬러</th>
                                <th style="padding:4px 6px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">도장 LOT</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">재고</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">최근입고</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            });

        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;">${cards.join('')}</div>`;
    }

    function renderDetailTable(items) {
        const el = document.getElementById('lsbDetail');
        if (!el) return;
        const isAdmin = _isAdminUser();
        const deleteHeader = isAdmin ? '<th style="text-align:center;white-space:nowrap;">삭제</th>' : '';
        const deleteColspan = isAdmin ? 9 : 8;

        // 모든 입고/출고 레코드를 분리 평탄화
        const incomingRows = [];
        const outgoingRows = [];
        items.forEach(item => {
            const histReset = item.historyReset || null;
            item.inRecords.forEach(r => {
                const beforeReset = !!(histReset && histReset.historyResetAt
                    && _isBeforeHistoryReset(r.date, histReset.historyResetAt));
                incomingRows.push({
                    carModel: item.carModel,
                    partName: item.partName,
                    color: item.color,
                    date: r.date,
                    qty: r.qty,
                    paintingDate: r.paintingDate || r.paintLot || '',
                    lotNo: r.injectionLot || r.lotNo || '',
                    note: r.note || '',
                    sourceType: r.sourceType || '',
                    sourceId: r.sourceId || '',
                    beforeReset: beforeReset
                });
            });
            item.outRecords.forEach(r => {
                const beforeReset = !!(histReset && histReset.historyResetAt
                    && _isBeforeHistoryReset(r.date, histReset.historyResetAt));
                outgoingRows.push({
                    carModel: item.carModel,
                    partName: item.partName,
                    color: item.color,
                    date: r.date,
                    qty: r.qty,
                    paintingDate: r.paintingDate || r.paintLot || '',
                    lotNo: r.lotNo || r.injectionLot || '',
                    note: r.note || r.machine || '',
                    sourceType: r.sourceType || '',
                    sourceId: r.sourceId || '',
                    beforeReset: beforeReset
                });
            });
        });

        incomingRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        outgoingRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        if (incomingRows.length === 0 && outgoingRows.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;padding:20px;">내역이 없습니다.</p>`;
            return;
        }

        // 입고/출고 표 — 글자수 맞춤 (품명·컬러 공백/깨짐 방지). fixed+% col 사용 금지
        const ioTableStyle = 'width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;';
        const ioColgroup = '';

        const emptyRow = label => `
            <tr>
                <td colspan="${deleteColspan}" style="text-align:center;color:var(--text-muted);padding:18px;font-size:0.84rem;">${label}</td>
            </tr>`;

        const incomingBody = incomingRows.length
            ? incomingRows.map(r => `
                <tr style="border-left:3px solid var(--accent-green);${r.beforeReset ? 'opacity:0.72;' : ''}">
                    <td style="white-space:nowrap;padding:8px 10px;">${r.date || '-'}</td>
                    <td style="white-space:nowrap;padding:8px 10px;"><strong>${r.carModel || '-'}</strong></td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.partName || '-'}</td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.color || '-'}</td>
                    <td style="text-align:right;color:var(--accent-green);font-weight:700;white-space:nowrap;padding:8px 10px;">${UIUtils.formatNumber(r.qty || 0)}</td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.paintingDate || '-'}</td>
                    <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;padding:8px 10px;">${r.lotNo || '-'}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;padding:8px 10px;" title="${(r.note || '').replace(/"/g, '&quot;')}">${r.note || ''}${r.beforeReset ? ' <span style="color:#94a3b8;">(리셋 이전 기록)</span>' : ''}</td>
                    ${isAdmin ? `<td style="text-align:center;white-space:nowrap;padding:8px 10px;">${_deleteButton(r, 'in')}</td>` : ''}
                </tr>`).join('')
            : emptyRow('입고 내역이 없습니다.');

        const outgoingBody = outgoingRows.length
            ? outgoingRows.map(r => `
                <tr style="border-left:3px solid var(--accent-blue);${r.beforeReset ? 'opacity:0.72;' : ''}">
                    <td style="white-space:nowrap;padding:8px 10px;">${r.date || '-'}</td>
                    <td style="white-space:nowrap;padding:8px 10px;"><strong>${r.carModel || '-'}</strong></td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.partName || '-'}</td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.color || '-'}</td>
                    <td style="text-align:right;color:var(--accent-blue);font-weight:700;white-space:nowrap;padding:8px 10px;">${UIUtils.formatNumber(r.qty || 0)}</td>
                    <td style="white-space:nowrap;padding:8px 10px;">${r.paintingDate || '-'}</td>
                    <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;padding:8px 10px;">${r.lotNo || '-'}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;padding:8px 10px;" title="${(r.note || '').replace(/"/g, '&quot;')}">${r.note || ''}${r.beforeReset ? ' <span style="color:#94a3b8;">(리셋 이전 기록)</span>' : ''}</td>
                    ${isAdmin ? `<td style="text-align:center;white-space:nowrap;padding:8px 10px;">${_deleteButton(r, 'out')}</td>` : ''}
                </tr>`).join('')
            : emptyRow('출고 내역이 없습니다.');

        el.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:18px;padding:16px;">
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;font-size:0.95rem;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-green);">input</span>
                            입고현황
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">${incomingRows.length}건</span>
                    </div>
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table" style="${ioTableStyle}">
                            ${ioColgroup}
                            <thead>
                                <tr>
                                    <th style="white-space:nowrap;">입고일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th style="white-space:nowrap;">차종</th>
                                    <th style="white-space:nowrap;">품명</th>
                                    <th style="white-space:nowrap;">컬러</th>
                                    <th style="text-align:right;white-space:nowrap;">입고수량</th>
                                    <th style="white-space:nowrap;">도장작업일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th style="white-space:nowrap;">사출 LOT</th>
                                    <th style="white-space:nowrap;">비고</th>
                                    ${deleteHeader}
                                </tr>
                            </thead>
                            <tbody>${incomingBody}</tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;font-size:0.95rem;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">output</span>
                            출고현황
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">${outgoingRows.length}건</span>
                    </div>
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table" style="${ioTableStyle}">
                            ${ioColgroup}
                            <thead>
                                <tr>
                                    <th style="white-space:nowrap;">출고일<br><small style="font-weight:400;">(출고시. 년월일시분)</small></th>
                                    <th style="white-space:nowrap;">차종</th>
                                    <th style="white-space:nowrap;">품명</th>
                                    <th style="white-space:nowrap;">컬러</th>
                                    <th style="text-align:right;white-space:nowrap;">출고수량</th>
                                    <th style="white-space:nowrap;">도장작업일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th style="white-space:nowrap;">사출 LOT</th>
                                    <th style="white-space:nowrap;">비고</th>
                                    ${deleteHeader}
                                </tr>
                            </thead>
                            <tbody>${outgoingBody}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }


    // 페이지 헤더 없이 내용만 렌더링 (통합 재공품 현황 탭에서 호출)
    function _escapeAttr(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function _ensureSelectOption(selectEl, value, label) {
        if (!selectEl) return;
        const v = String(value ?? '');
        if (!v) return;
        const exists = Array.from(selectEl.options).some(opt => opt.value === v);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = label != null ? String(label) : (v || '-');
            selectEl.appendChild(opt);
        }
        selectEl.value = v;
    }

    function onAdjustCarChange(selectedPartName = '', selectedColor = '') {
        const carModelEl = document.getElementById('lsbAdjustCarModel');
        const partEl = document.getElementById('lsbAdjustPartName');
        const colorEl = document.getElementById('lsbAdjustColor');
        if (!carModelEl || !partEl || !colorEl) return;

        const carModel = carModelEl.value || '';
        // 대기 재고는 레이저 공정 제품 기준으로 쌓일 수 있어, 드롭다운은 관련 제품 전체에서 구성
        const products = _getLaserRelatedProducts();
        const partNames = [...new Set(products
            .filter(prod => !carModel || prod.carModel === carModel)
            .map(prod => prod.partName)
            .filter(Boolean))];
        if (selectedPartName && !partNames.includes(selectedPartName)) {
            partNames.push(selectedPartName);
        }
        partNames.sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(name => `<option value="${_escapeAttr(name)}">${_escapeAttr(name)}</option>`).join('');
        if (selectedPartName) partEl.value = selectedPartName;

        onAdjustPartChange(selectedColor);
    }

    function onAdjustPartChange(selectedColor = '') {
        const carModel = document.getElementById('lsbAdjustCarModel')?.value || '';
        const partName = document.getElementById('lsbAdjustPartName')?.value || '';
        const colorEl = document.getElementById('lsbAdjustColor');
        if (!colorEl) return;

        const products = _getLaserRelatedProducts();
        const colors = [...new Set(products
            .filter(prod => (!carModel || prod.carModel === carModel) && (!partName || prod.partName === partName))
            .map(prod => prod.color || '')
            .filter(Boolean))];
        if (selectedColor && !colors.includes(selectedColor)) {
            colors.push(selectedColor);
        }
        colors.sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(color => `<option value="${_escapeAttr(color)}">${_escapeAttr(color || '-')}</option>`).join('');
        if (selectedColor) colorEl.value = selectedColor;
        else if (selectedColor === '' && partName) {
            // 컬러 없는 재고 키도 유지 (빈 값 선택 상태)
            colorEl.value = '';
        }
    }

    // 도장/사출 LOT 입력 형식: YYMMDD 6자리, 미래 날짜 금지
    function _isFutureLotDate(value) {
        const v = String(value == null ? '' : value).trim();
        if (!/^\d{6}$/.test(v)) return false;
        const dateStr = '20' + v.substring(0, 2) + '-' + v.substring(2, 4) + '-' + v.substring(4, 6);
        const today = new Date().toISOString().slice(0, 10);
        return dateStr > today;
    }

    function _lotValidationMessage(value) {
        const v = String(value == null ? '' : value).trim();
        if (v.length !== 6 || !/^\d{6}$/.test(v)) return 'YYMMDD 형식(6자리 숫자)으로 입력해 주세요.';
        const mm = parseInt(v.substring(2, 4), 10);
        const dd = parseInt(v.substring(4, 6), 10);
        if (mm < 1 || mm > 12) return '월(MM)은 01~12 범위여야 합니다.';
        if (dd < 1 || dd > 31) return '일(DD)은 01~31 범위여야 합니다.';
        if (_isFutureLotDate(v)) return '미래 날짜는 입력할 수 없습니다.';
        return null;
    }

    function _validateLotFormat(input) {
        if (!input) return;
        input.value = String(input.value || '').replace(/[^0-9]/g, '');
        if (input.value.length > 6) input.value = input.value.substring(0, 6);
    }

    function _checkLotFormat(input) {
        if (!input) return;
        const value = String(input.value || '').trim();
        if (!value) return;
        const err = _lotValidationMessage(value);
        if (err) {
            UIUtils.toast(err, 'warning');
            input.focus();
        }
    }

    function _adjustLotRowHtml(lot = {}) {
        const paintLot = String(lot.paintLot || lot.paintDate || '').trim();
        const injectionLot = String(lot.injectionLot || lot.lotNo || '').trim();
        const qty = _normalizeQty(lot.qty);
        return `
            <div class="lsb-adjust-lot-row" style="display:grid;grid-template-columns:1fr 1fr 140px 34px;gap:8px;align-items:end;margin-bottom:8px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">도장 LOT <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input lsb-adjust-paint-lot" value="${_escapeAttr(paintLot)}"
                        placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserStandbyModule._validateLotFormat(this)"
                        onblur="LaserStandbyModule._checkLotFormat(this)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input lsb-adjust-injection-lot" value="${_escapeAttr(injectionLot)}"
                        placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserStandbyModule._validateLotFormat(this)"
                        onblur="LaserStandbyModule._checkLotFormat(this)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">LOT 수량</label>
                    <input type="number" class="form-input lsb-adjust-lot-qty" value="${qty || ''}" min="0" placeholder="0" oninput="LaserStandbyModule.onAdjustLotQtyInput()">
                </div>
                <button type="button" class="btn btn-sm btn-danger" style="height:38px;padding:0;"
                    title="LOT 행 삭제" onclick="LaserStandbyModule.removeAdjustLotRow(this)">−</button>
            </div>`;
    }

    function addAdjustLotRow(lot) {
        const container = document.getElementById('lsbAdjustLotRows');
        if (!container) return;
        container.insertAdjacentHTML('beforeend', _adjustLotRowHtml(lot || {}));
        onAdjustLotQtyInput();
    }

    // LOT 행이 1개뿐일 때는 배분 방식이 하나로 정해져 있으므로(총수량 = 그 LOT 수량),
    // "수정 후 총수량" 입력에 맞춰 그 LOT 수량도 실시간으로 따라가게 한다.
    // (그렇지 않으면 예전에 저장된 LOT 수량이 그대로 남아 총수량과 계속 어긋나 저장이 막힌다.)
    function onAdjustTotalQtyInput(value) {
        const container = document.getElementById('lsbAdjustLotRows');
        if (!container) return;
        const rows = container.querySelectorAll('.lsb-adjust-lot-row');
        if (rows.length !== 1) return;
        const qtyInput = rows[0].querySelector('.lsb-adjust-lot-qty');
        if (qtyInput) qtyInput.value = value;
    }

    // 반대 방향: LOT별 수량을 고치면(추가/삭제 포함) "수정 후 총수량"이 그 합계를 그대로
    // 따라가게 한다. 총수량은 결국 LOT 배분의 합이어야 하므로, 사용자가 아래 LOT 수량만
    // 고쳐도 위 총수량을 따로 다시 입력할 필요가 없게 하기 위함.
    function onAdjustLotQtyInput() {
        const container = document.getElementById('lsbAdjustLotRows');
        const totalInput = document.getElementById('lsbAdjustQty');
        if (!container || !totalInput) return;
        const sum = Array.from(container.querySelectorAll('.lsb-adjust-lot-qty'))
            .reduce(function(s, input) { return s + (_normalizeQty(input.value) || 0); }, 0);
        totalInput.value = sum;
    }

    function removeAdjustLotRow(button) {
        const container = document.getElementById('lsbAdjustLotRows');
        const row = button && button.closest ? button.closest('.lsb-adjust-lot-row') : null;
        if (!container || !row) return;
        const rows = container.querySelectorAll('.lsb-adjust-lot-row');
        if (rows.length <= 1) {
            row.querySelectorAll('input').forEach(function(input) { input.value = ''; });
            onAdjustLotQtyInput();
            return;
        }
        row.remove();
        onAdjustLotQtyInput();
    }

    function _readAdjustLotRows() {
        return Array.from(document.querySelectorAll('#lsbAdjustLotRows .lsb-adjust-lot-row'))
            .map(function(row) {
                return {
                    paintLot: String((row.querySelector('.lsb-adjust-paint-lot') || {}).value || '').trim(),
                    injectionLot: String((row.querySelector('.lsb-adjust-injection-lot') || {}).value || '').trim(),
                    qty: _normalizeQty((row.querySelector('.lsb-adjust-lot-qty') || {}).value || 0)
                };
            })
            .filter(function(lot) { return lot.paintLot || lot.injectionLot || lot.qty > 0; });
    }

    async function openAdjustModal(keyEnc = '', isAddMode = false) {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const key = keyEnc ? decodeURIComponent(keyEnc) : '';
        const addMode = isAddMode || !key;
        const snapshot = key ? _getDetailSnapshot(key) : { item: null, stock: 0 };
        const item = snapshot.item;
        const override = key ? _getOverrideByKey(key) : null;
        const [keyCar = '', keyPart = '', keyColor = ''] = key ? key.split('||') : ['', '', ''];
        // 재고 키(차종||품명||컬러)를 우선 — item.color의 표시용 '-'가 실제 값을 덮지 않도록
        const displayOr = (v) => {
            const s = String(v ?? '').trim();
            return s && s !== '-' ? s : '';
        };
        const carModel = String(override?.carModel || keyCar || displayOr(item?.carModel) || '').trim();
        const partName = String(override?.partName || keyPart || displayOr(item?.partName) || '').trim();
        const color = String(
            override?.color != null && String(override.color).trim() !== ''
                ? override.color
                : (key ? keyColor : displayOr(item?.color))
        ).trim();
        const currentStock = item ? snapshot.stock : 0;
        const products = _getLaserRelatedProducts();
        const carModels = [...new Set(products.map(prod => prod.carModel).filter(Boolean))];
        if (carModel && !carModels.includes(carModel)) carModels.push(carModel);
        carModels.sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const latestInRecord = item && (item.inRecords || []).length > 0
            ? [...item.inRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
            : null;
        const parsedLot = _parseManualLotPair(latestInRecord?.lotNo || '');
        const initialPaintLot = (override?.paintLot || (latestInRecord && latestInRecord.note === '수기조정' ? parsedLot.paintLot : '') || '').trim();
        const initialInjectionLot = (override?.injectionLot || parsedLot.injectionLot || '').trim();
        const savedLots = override && Array.isArray(override.lots) ? override.lots : [];
        const calculatedLots = (!addMode && key && item) ? _buildLotBalanceRows(key, item) : [];
        const initialLots = savedLots.length > 0
            ? savedLots
            : (calculatedLots.length > 0
                ? calculatedLots
                : [{ paintLot: initialPaintLot, injectionLot: initialInjectionLot, qty: addMode ? 0 : currentStock }]);

        // 이 항목이 제품 마스터에 없는 품명인가 (= 유령 품목)
        const _isUnmatchedItem = !!_canonicalStandbyRecord(
            { carModel, partName, color },
            Storage.getAll(DB.STORES.PRODUCTS) || [],
            Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []
        )._unmatchedProduct;

        // 유령 품목은 읽기전용으로 고정하면 고칠 방법이 없으므로 드롭다운으로 재지정하게 한다.
        const _useSelectIdentity = addMode || _isUnmatchedItem;

        const unmatchedBanner = (!addMode && _isUnmatchedItem) ? `
            <div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;line-height:1.5;">
                <strong style="color:var(--accent-red);display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">warning</span> 제품 마스터에 없는 품명입니다
                </strong>
                <div style="margin-top:5px;color:var(--text-secondary);">
                    <strong>${_escapeAttr(partName)}</strong>${color ? ' / ' + _escapeAttr(color) : ''} 은(는) 제품 품명이 아니라
                    사출 자재명이거나 오타일 수 있습니다. 아래에서 <strong>올바른 제품</strong>으로 다시 지정한 뒤 저장하세요.
                </div>
            </div>` : '';

        // 기존 아이템 수량 수정: 차종/품명/컬러는 고정 표시 (제품 마스터 미등록이어도 누락되지 않음)
        const identityFieldsHtml = _useSelectIdentity ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lsbAdjustCarModel" onchange="LaserStandbyModule.onAdjustCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(name => `<option value="${_escapeAttr(name)}" ${name === carModel ? 'selected' : ''}>${_escapeAttr(name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lsbAdjustPartName" onchange="LaserStandbyModule.onAdjustPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lsbAdjustColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>` : `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" value="${_escapeAttr(carModel || '-')}" readonly
                        style="background:var(--bg-secondary, #f3f4f6);cursor:default;">
                    <input type="hidden" id="lsbAdjustCarModel" value="${_escapeAttr(carModel)}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" value="${_escapeAttr(partName || '-')}" readonly
                        style="background:var(--bg-secondary, #f3f4f6);cursor:default;">
                    <input type="hidden" id="lsbAdjustPartName" value="${_escapeAttr(partName)}">
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" class="form-input" value="${_escapeAttr(color || '-')}" readonly
                        style="background:var(--bg-secondary, #f3f4f6);cursor:default;">
                    <input type="hidden" id="lsbAdjustColor" value="${_escapeAttr(color)}">
                </div>
            </div>`;

        UIUtils.showModal(addMode ? '레이저 대기 재공품 추가' : '레이저 대기 수량 보정', `
            ${unmatchedBanner}
            <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    현재 전산 재고 <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(currentStock)} EA</strong>
                </div>
            </div>
            ${identityFieldsHtml}
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label class="form-label">${addMode ? '추가 수량' : '수정 후 총수량'}</label>
                    <input type="number" class="form-input" id="lsbAdjustQty" value="${override ? _normalizeQty(override.actualQty) : currentStock}" min="0" placeholder="0" oninput="LaserStandbyModule.onAdjustTotalQtyInput(this.value)">
                </div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div>
                        <strong style="font-size:0.85rem;">LOT별 재고 배분</strong>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">도장·사출 LOT는 YYMMDD(6자리) 필수 · LOT 수량 합계 = 총수량</div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" onclick="LaserStandbyModule.addAdjustLotRow()">
                        <span class="material-symbols-outlined" style="font-size:1rem;">add</span> LOT 추가
                    </button>
                </div>
                <div id="lsbAdjustLotRows">${initialLots.map(_adjustLotRowHtml).join('')}</div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserStandbyModule.saveAdjustModal('${encodeURIComponent(key)}', ${addMode ? 'true' : 'false'})">${addMode ? '등록' : '저장'}</button>
        `, 'lg');

        if (addMode) {
            setTimeout(() => {
                onAdjustCarChange(partName, color);
                _ensureSelectOption(document.getElementById('lsbAdjustPartName'), partName, partName);
                _ensureSelectOption(document.getElementById('lsbAdjustColor'), color, color || '-');
            }, 0);
        } else if (_isUnmatchedItem) {
            // 유령 품목 재지정: 차종의 제품 목록만 채우고, 잘못된 품명은 선택지에 넣지 않는다.
            setTimeout(() => { onAdjustCarChange(); }, 0);
        }
    }

    // 수기 보정(수량 보정/수동입고/수동출고)은 권한자만 할 수 있는데 작성자가 안 남으면
    // 누가 고쳤는지 추적할 수 없다 — _manualOverrides에 저장하는 모든 경로에서 공용으로 쓴다.
    function _currentAuthorName() {
        try {
            const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            return (u && (u.displayName || u.username)) || '';
        } catch (e) { return ''; }
    }

    async function saveAdjustModal(keyEnc = '', isAddMode = false) {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const originalKey = keyEnc ? decodeURIComponent(keyEnc) : '';
        const addMode = isAddMode || !originalKey;
        const carModel = document.getElementById('lsbAdjustCarModel')?.value || '';
        const partName = document.getElementById('lsbAdjustPartName')?.value || '';
        const color = document.getElementById('lsbAdjustColor')?.value || '';
        const actualQty = _normalizeQty(document.getElementById('lsbAdjustQty')?.value || 0);
        const lots = _readAdjustLotRows();
        // LOT이 1개뿐이면 배분 방식이 유일하므로(총수량 = 그 LOT 수량) 화면에서 못 맞춘 경우
        // 저장 시점에 자동으로 맞춰준다. LOT이 여러 개일 때는 어느 LOT을 조정할지 애매하므로
        // 그대로 두고 아래 불일치 검증에서 사용자가 직접 배분하게 한다.
        if (lots.length === 1 && actualQty > 0) {
            lots[0].qty = actualQty;
        }
        const invalidLot = lots.find(function(lot) {
            return !lot.paintLot || !lot.injectionLot || lot.qty <= 0;
        });
        const lotFormatError = lots.reduce(function(err, lot) {
            if (err) return err;
            const paintErr = _lotValidationMessage(lot.paintLot);
            if (paintErr) return '도장 LOT: ' + paintErr;
            const injErr = _lotValidationMessage(lot.injectionLot);
            if (injErr) return '사출 LOT: ' + injErr;
            return null;
        }, null);
        const lotQtySum = lots.reduce(function(sum, lot) { return sum + lot.qty; }, 0);
        const paintLot = [...new Set(lots.map(function(lot) { return lot.paintLot; }).filter(Boolean))].join(', ');
        const injectionLot = [...new Set(lots.map(function(lot) { return lot.injectionLot; }).filter(Boolean))].join(', ');

        if (!carModel || !partName) {
            UIUtils.toast('차종과 품명을 선택해 주세요.', 'warning');
            return;
        }
        if (!lots.length || invalidLot) {
            UIUtils.toast('각 LOT 행의 도장 LOT, 사출 LOT, LOT 수량을 모두 입력해 주세요.', 'warning');
            return;
        }
        if (lotFormatError) {
            UIUtils.toast(lotFormatError, 'warning');
            return;
        }
        if (addMode && actualQty <= 0) {
            UIUtils.toast('수량을 1개 이상 입력해 주세요.', 'warning');
            return;
        }
        if (Math.abs(lotQtySum - actualQty) > 0.001) {
            UIUtils.toast(
                `LOT 수량 합계(${UIUtils.formatNumber(lotQtySum)} EA)와 수정 후 총수량(${UIUtils.formatNumber(actualQty)} EA)이 일치하지 않습니다.`,
                'warning'
            );
            return;
        }

        const normalizedIdentity = _canonicalStandbyRecord(
            { carModel, partName, color },
            Storage.getAll(DB.STORES.PRODUCTS) || [],
            Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []
        );

        // ⚠ 제품 마스터에 없는 품명으로는 수기 보정을 저장하지 않는다.
        // 예전에는 그대로 통과되어 사출 자재명('PAO COVER')이나 오타('HIGH BACLL KONB')가
        // 재공 현황에 제품인 척 남는 유령 품목이 되었다.
        if (normalizedIdentity._unmatchedProduct) {
            UIUtils.toast(
                `제품 마스터에 없는 품명입니다: ${carModel} / ${partName}${color ? ' / ' + color : ''}\n` +
                `제품 마스터에 등록된 품명·컬러를 선택하세요. (사출 자재명은 사용할 수 없습니다)`,
                'error'
            );
            return;
        }

        const normalizedCarModel = normalizedIdentity.carModel || carModel;
        const normalizedPartName = normalizedIdentity.partName || partName;
        const normalizedColor = normalizedIdentity.color || color;
        const nextKey = _itemKey(normalizedCarModel, normalizedPartName, normalizedColor);
        const currentIndex = originalKey
            ? _manualOverrides.findIndex(item => _itemKey(item.carModel, item.partName, item.color) === originalKey)
            : -1;

        const author = _currentAuthorName();

        const effectiveAt = new Date().toISOString();
        const nextRecord = {
            id: currentIndex >= 0 ? _manualOverrides[currentIndex].id : Storage.generateId(),
            carModel: normalizedCarModel,
            partName: normalizedPartName,
            color: normalizedColor,
            actualQty,
            paintLot,
            injectionLot,
            lots,
            manualType: addMode ? 'add' : 'edit',
            author,
            effectiveAt,
            updatedAt: effectiveAt
        };

        _manualOverrides = _manualOverrides.filter((item, index) => {
            if (index === currentIndex) return false;
            return _itemKey(item.carModel, item.partName, item.color) !== nextKey;
        });
        _manualOverrides.push(nextRecord);
        await _saveManualOverrides();

        if (addMode && typeof AuthModule !== 'undefined' && typeof AuthModule.sendInternalMessage === 'function') {
            try {
                AuthModule.sendInternalMessage({
                    targetType: 'role',
                    targetId: 'prod_manager',
                    title: '레이저 대기 재공품 추가 알림',
                    body: [
                        `차종: ${normalizedCarModel}`,
                        `품명: ${normalizedPartName}`,
                        `컬러: ${normalizedColor || '-'}`,
                        `수량: ${UIUtils.formatNumber(actualQty)} EA`,
                        `도장 LOT: ${paintLot}`,
                        `사출 LOT: ${injectionLot}`,
                    ].join('\n'),
                    category: 'laser-standby',
                    priority: 'high'
                });
            } catch (e) {
                console.warn('[LaserStandbyModule] 생산관리자 통보 실패:', e);
            }
        }

        UIUtils.closeModal();
        renderAll();
        UIUtils.toast(addMode ? '레이저 대기 재공품이 추가되었습니다.' : '수량이 보정되었습니다.', 'success');
    }

    function renderContentOnly(container) {
        container.innerHTML = `
            <div id="lsbUnassignedWarn"></div>
            <div class="stat-cards" id="lsbStats" style="margin-bottom:16px;"></div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">입고(도장완료) − 출고(레이져처리) = 재공재고</span>
                </div>
                <div class="card-body" id="lsbInventory" style="padding:16px; display:flex; flex-direction:column; gap:14px;"></div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 입출고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">입고와 출고 내역을 분리 표시</span>
                </div>
                <div class="card-body" id="lsbDetail" style="padding:0;"></div>
            </div>`;
        _initStandbyView();
    }

    async function refresh() {
        await Promise.allSettled(_REQUIRED_STORES.map(s => Storage.refresh(s)));
        await _ensureManualOverridesLoaded(true);
        renderAll();
        UIUtils.toast('재고 현황을 새로고침했습니다.', 'info');
    }

    function openLayout() {
        Router.navigate('laser-layout');
    }

    function _openStandbyInForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(async () => {
            await openStandbyInModal();
            setTimeout(() => {
                const carSel = document.getElementById('lsbInCarModel');
                if (carSel) carSel.value = carModel || '';
                onStandbyInCarChange(partName || '');
                setTimeout(() => {
                    const colorSel = document.getElementById('lsbInColor');
                    if (colorSel && color) colorSel.value = color;
                    onStandbyInPartChange();
                }, 50);
            }, 80);
        }, 80);
    }

    function _openStandbyOutForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(async () => {
            await openStandbyOutModal();
            setTimeout(() => {
                const carSel = document.getElementById('lsbOutCarModel');
                if (carSel) carSel.value = carModel || '';
                onStandbyOutCarChange(partName || '');
                setTimeout(() => {
                    const colorSel = document.getElementById('lsbOutColor');
                    if (colorSel && color) colorSel.value = color;
                    onStandbyOutPartChange();
                }, 50);
            }, 80);
        }, 80);
    }

    async function _showItemDetail(keyEnc, event) {
        if (event && event.stopPropagation) event.stopPropagation();

        const key = decodeURIComponent(keyEnc);
        const [carModel, partName, color] = key.split('||');
        const snapshot = _getDetailSnapshot(key);
        const stock = snapshot.stock;
        const totalIn = snapshot.totalIn;
        const totalOut = snapshot.totalOut;
        const allRows = snapshot.allRows;
        const lotBalRows = _buildLotBalanceRows(key, snapshot.item);
        const lotCount = lotBalRows.filter(r => (Number(r.qty) || 0) > 0).length;

        const _cmJs = String(carModel || '').replace(/'/g, "\\'");
        const _pnJs = String(partName || '').replace(/'/g, "\\'");
        const _clJs = String(color || '').replace(/'/g, "\\'");
        const _keyJs = encodeURIComponent(key);
        const canEdit = _canEditStandby();

        // ✓ 도장LOT 기준으로 묶어서 1행으로 표시 — 사출LOT는 (수량) 태그로 참고 나열만 한다.
        const _lotGroupsByPaintLot = {};
        lotBalRows.forEach(r => {
            const gKey = r.paintLot || '-';
            if (!_lotGroupsByPaintLot[gKey]) _lotGroupsByPaintLot[gKey] = { paintLot: r.paintLot || '-', lots: [], totalQty: 0 };
            _lotGroupsByPaintLot[gKey].lots.push({ lotNo: r.lotNo, qty: r.qty });
            _lotGroupsByPaintLot[gKey].totalQty += Number(r.qty) || 0;
        });
        const lotGroupRows = Object.values(_lotGroupsByPaintLot)
            .sort((a, b) => String(a.paintLot).localeCompare(String(b.paintLot)));

        const lotRowsHtml = lotGroupRows.map(g => {
            const lotTags = g.lots.map(l => `
                <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border:1px solid var(--border-color);border-radius:999px;font-size:0.76rem;font-family:monospace;white-space:nowrap;background:var(--bg-secondary);">
                    ${l.lotNo || '-'} <strong style="color:var(--accent-blue);">(${UIUtils.formatNumber(l.qty)})</strong>
                </span>`).join(' ');
            return `
            <tr>
                <td style="font-family:monospace;color:var(--accent-green);white-space:nowrap;">${g.paintLot}</td>
                <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${lotTags}</div></td>
                <td style="text-align:right;color:var(--accent-blue);font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(g.totalQty)}</td>
                ${canEdit ? `<td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserStandbyModule.openAdjustModal('${_keyJs}'),80);">
                        수량 보정
                    </button>
                </td>` : ''}
            </tr>`;
        }).join('');

        const simpleHistItems = _standbyToSimpleHistItems(allRows);

        // 안전장치: 이력을 재생한 "현재 수량"과 실제 재고(stock)가 어긋나면 조용히 틀린 값을 보여주지 않고
        // 화면에 경고를 띄운다. (수기 보정 diff 계산이 절대값 지시를 델타로 잘못 누적하는 등의 회귀를 조기에 잡기 위함)
        const _replaySteps = StockDetailUI.simpleReplaySteps(simpleHistItems, function(item) {
            return item.isOut ? -(Number(item.qty) || 0) : (Number(item.qty) || 0);
        }, { floorZero: true, getAbsoluteAfter: function(item) { return (item && item.absoluteAfter != null) ? item.absoluteAfter : null; } });
        const _liveSteps = _replaySteps.filter(function(s) { return !(s.archiveOnly || (s.item && (s.item.beforeReset || s.item.archiveOnly))); });
        const _replayedStock = _liveSteps.length ? Number(_liveSteps[_liveSteps.length - 1].stockAfter) || 0 : 0;
        const _stockMismatch = Math.abs(_replayedStock - (Number(stock) || 0)) > 0.001;
        if (_stockMismatch) {
            console.error('[LaserStandby] 이력 재생 결과가 재고와 불일치:', {
                key, carModel, partName, color, stock, replayedStock: _replayedStock
            });
        }

        const historySection = StockDetailUI.buildSimpleHistorySection(simpleHistItems, {
            floorZero: true,
            splitLots: true,
            showActions: canEdit,
            actionHtmlFn: canEdit ? function(item) {
                // 이력 리셋 스냅샷만 제외. 리셋 이전 기록도 입력 실수 교정 가능
                if (!item || !item.editKind || !item.sourceId || item.isHistoryReset || item.routeLabel === '이력 리셋') return '';
                const st = encodeURIComponent(item.sourceType || '');
                const sid = encodeURIComponent(item.sourceId || '');
                return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                    onclick="event.stopPropagation();UIUtils.closeModal();setTimeout(function(){LaserStandbyModule.openEditHistoryRecord('${item.editKind}','${st}','${sid}');},80);">수정</button>`;
            } : null,
            // 이력 리셋뿐 아니라 수기 보정(override)도 절대값 지시이므로 그대로 반영한다.
            // (override의 qty는 "변화량"이 아니라 targetStock 산출용 내부 보정치라 그대로 누적하면 실재고와 어긋난다)
            getAbsoluteAfter: function(item) {
                if (item && item.absoluteAfter != null) return item.absoluteAfter;
                return null;
            }
        });

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${carModel}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${partName}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${color}</span>` : ''}
            </div>
            ${_stockMismatch ? `
            <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;line-height:1.5;">
                <strong style="color:var(--accent-red);display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">error</span> 이력과 재고가 일치하지 않습니다
                </strong>
                <div style="margin-top:5px;color:var(--text-secondary);">
                    현재 재고는 <strong>${UIUtils.formatNumber(stock)} EA</strong>인데 아래 입출고 이력을 재생한 값은
                    <strong>${UIUtils.formatNumber(_replayedStock)} EA</strong>로 서로 다릅니다. 이력의 "현재 수량" 열을 그대로 믿지 말고,
                    '수량 보정'으로 실제 재고를 다시 맞춘 뒤에도 계속 보이면 데이터 담당자에게 문의하세요.
                </div>
            </div>` : ''}
            ${(canEdit || _isAdminUser()) ? `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;align-items:center;">
                ${canEdit ? `
                <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                    onclick="LaserStandbyModule._openStandbyInForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 수동입고
                </button>
                <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                    onclick="LaserStandbyModule._openStandbyOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 수동 출고
                </button>` : ''}
                ${canEdit ? `<button class="btn btn-sm btn-outline" style="font-size:0.78rem;border-color:var(--accent-red);color:var(--accent-red);"
                    onclick="UIUtils.closeModal();setTimeout(()=>LaserStandbyModule.confirmResetStandby('${_keyJs}'),80);">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">restart_alt</span> 이력만 리셋
                </button>` : ''}
            </div>` : ''}
            ${snapshot.item && snapshot.item.historyReset ? `
            <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);font-size:0.8rem;color:var(--text-secondary);">
                <strong style="color:#2563eb;">이력만 리셋 적용</strong>
                · ${_escapeHtml(String(snapshot.item.historyReset.historyResetAt || '').replace('T', ' ').slice(0, 16))}
                이전 이력은 <strong>리셋 이전 기록</strong>으로 남기고, 재고·도장/사출 LOT는 유지합니다.
                ${snapshot.item.historyReset.author ? ' · ' + _escapeHtml(snapshot.item.historyReset.author) : ''}
                ${snapshot.item.historyReset.note ? ' · ' + _escapeHtml(snapshot.item.historyReset.note) : ''}
            </div>` : ''}
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(stock)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">현재 재공 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(totalIn)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">입고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-red);">${UIUtils.formatNumber(totalOut)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${lotCount}</div>
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
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'lg'
        );
    }

    async function confirmResetStandby(keyEnc) {
        if (!_canEditStandby()) {
            UIUtils.toast('관리자·레이져운영자만 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();
        await _ensureHistoryResetsLoaded();

        const key = decodeURIComponent(keyEnc || '');
        const [carModel, partName, color] = String(key).split('||');
        const { inventoryMap } = _buildInventorySnapshot();
        const item = inventoryMap[key] || null;
        const stock = item
            ? (Number(item.stockQty != null ? item.stockQty : ((item.inQty || 0) - (item.outQty || 0))) || 0)
            : 0;
        const rawHistCount = item
            ? ((item.inRecords || []).length + (item.outRecords || []).length)
            : 0;
        const lotCount = item ? _buildLotBalanceRows(key, item).filter(function(r) { return (Number(r.qty) || 0) > 0; }).length : 0;
        const existing = _getHistoryResetForKey(key);

        UIUtils.showModal('레이져 대기 이력만 리셋', `
            <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.88rem;font-weight:700;color:#2563eb;margin-bottom:6px;">과거 이력은 기록으로 남깁니다 (재고·LOT 유지)</div>
                <ul style="margin:0;padding-left:18px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                    <li>리셋 시각 <strong>이전 입출고는 "리셋 이전" 기록으로 남깁니다</strong>.</li>
                    <li>재고 수량 계산은 리셋 시점 잔량부터 다시 시작합니다.</li>
                    <li><strong>현재 재고 수량</strong>과 <strong>도장 LOT / 사출 LOT</strong>는 그대로 둡니다.</li>
                    <li>수기 보정(OVERRIDE)도 유지합니다.</li>
                    <li>도장/레이져 <strong>원본 작업일지는 삭제되지 않습니다</strong>.</li>
                </ul>
            </div>
            <div style="font-size:0.85rem;margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                <div><strong>${_escapeHtml(carModel || '-')}</strong> · ${_escapeHtml(partName || '-')}${color && color !== '-' ? ' · ' + _escapeHtml(color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);">현재 재고 ${UIUtils.formatNumber(stock)} EA · LOT ${lotCount}건 · 리셋 이전 이력 ${rawHistCount}건${existing ? ' · 이전 리셋 있음' : ''}</div>
            </div>
            <div class="form-group">
                <label class="form-label">리셋 사유 (선택)</label>
                <input type="text" class="form-input" id="lsbResetNote" placeholder="예: 과거 이력 정리 (재고 유지)">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-danger" onclick="LaserStandbyModule.executeResetStandby('${_jsArgKey(keyEnc)}')">이력만 리셋</button>
        `, 'md');
    }

    function _jsArgKey(value) {
        return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    async function executeResetStandby(keyEnc) {
        if (!_canEditStandby()) {
            UIUtils.toast('관리자·레이져운영자만 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();
        await _ensureHistoryResetsLoaded();

        const key = decodeURIComponent(keyEnc || '');
        const [carModel, partName, color] = String(key).split('||');
        if (!carModel || !partName) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const { inventoryMap } = _buildInventorySnapshot();
        const item = inventoryMap[key] || null;
        const openingStock = item
            ? (Number(item.stockQty != null ? item.stockQty : ((item.inQty || 0) - (item.outQty || 0))) || 0)
            : 0;
        const openingLots = item
            ? _buildLotBalanceRows(key, item).map(function(lot) {
                return {
                    paintLot: lot.paintLot || '-',
                    lotNo: lot.lotNo || '',
                    qty: Number(lot.qty) || 0
                };
            })
            : [];
        const note = ((document.getElementById('lsbResetNote') || {}).value || '').trim() || '이력만 리셋';
        const historyResetAt = new Date().toISOString();
        let author = '';
        try {
            const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            author = (u && (u.displayName || u.username)) || '';
        } catch (e) { /* ignore */ }

        // 이력만 리셋: 재고·LOT·수기보정(OVERRIDE)은 유지하고 화면 이력만 컷오버
        _historyResets = (_historyResets || []).filter(function(r) {
            const rk = (r && r.key) || _itemKey(r && r.carModel, r && r.partName, r && r.color);
            return rk !== key;
        });
        _historyResets.push({
            id: Storage.generateId(),
            key: key,
            carModel: carModel,
            partName: partName,
            color: color || '',
            historyResetAt: historyResetAt,
            historyOnly: true,
            openingStock: openingStock,
            prevStock: openingStock,
            openingLots: openingLots,
            author: author,
            note: note,
            updatedAt: historyResetAt
        });
        await _saveHistoryResets();

        UIUtils.closeModal();
        UIUtils.toast(`이력만 리셋 완료 — 재고 ${UIUtils.formatNumber(openingStock)} EA · LOT 유지`, 'success');
        renderAll();
        setTimeout(function() {
            try { _showItemDetail(encodeURIComponent(key), { stopPropagation: function() {} }); } catch (e) {}
        }, 80);
    }

    // ── 레이져 대기품 수동입고 ────────────────────────────────────────────
    async function openStandbyInModal() {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const products  = _getLaserTargetProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);
        const fg = (flex) => `class="form-group" style="flex:${flex};margin-bottom:0;min-width:0;"`;

        UIUtils.showModal('레이져 대기품 수동입고', `
            <div style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.18);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary);">
                도장 완료 후 레이져 대기 재공품을 수동으로 추가 등록합니다.
                <span id="lsbInStockVal" style="display:block;margin-top:4px;color:var(--text-muted);">현재 전산 재고: — 품명을 선택하세요 —</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px 10px;align-items:flex-end;">
                <div ${fg('0 1 148px')}>
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lsbInDate" value="${today}">
                </div>
                <div ${fg('1 1 88px')}>
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lsbInCarModel" onchange="LaserStandbyModule.onStandbyInCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div ${fg('1.6 1 140px')}>
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lsbInPartName" onchange="LaserStandbyModule.onStandbyInPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div ${fg('1.2 1 110px')}>
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lsbInColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
                <div ${fg('0 1 108px')}>
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lsbInInjectionLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserStandbyModule._validateLotFormat(this)"
                        onblur="LaserStandbyModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 120px')}>
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lsbInPaintLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserStandbyModule._validateLotFormat(this)"
                        onblur="LaserStandbyModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 118px')}>
                    <label class="form-label">입고 수량 (EA) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="lsbInQty" min="1" placeholder="0">
                </div>
                <div ${fg('2 1 160px')}>
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lsbInNote" placeholder="수기 대기입고">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserStandbyModule.saveStandbyInModal()">등록</button>
        `, 'min(720px, calc(100vw - 32px))');
    }

    function onStandbyInCarChange(selectedPartName = '') {
        const carModel  = document.getElementById('lsbInCarModel')?.value || '';
        const products  = _getLaserTargetProducts();
        const partNames = [...new Set(products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const partEl = document.getElementById('lsbInPartName');
        if (partEl) partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(n => `<option value="${n}" ${n === selectedPartName ? 'selected' : ''}>${n}</option>`).join('');
        onStandbyInPartChange();
    }

    function onStandbyInPartChange() {
        const carModel = document.getElementById('lsbInCarModel')?.value || '';
        const partName = document.getElementById('lsbInPartName')?.value || '';
        const colorEl  = document.getElementById('lsbInColor');
        if (!colorEl) return;

        const products = _getLaserTargetProducts();
        const colors   = [...new Set(products
            .filter(p => (!carModel || p.carModel === carModel) && (!partName || p.partName === partName))
            .map(p => p.color || '').filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        const stockVal = document.getElementById('lsbInStockVal');
        if (stockVal && partName) {
            const { inventoryMap } = _buildInventorySnapshot();
            const keys  = Object.keys(inventoryMap).filter(k => k.startsWith(`${carModel}||${partName}||`));
            const stock = keys.reduce((s, k) => s + Math.max(0, (inventoryMap[k]?.inQty || 0) - (inventoryMap[k]?.outQty || 0)), 0);
            stockVal.textContent = `현재 전산 재고: ${UIUtils.formatNumber(stock)} EA`;
        } else if (stockVal) {
            stockVal.textContent = '현재 전산 재고: — 품명을 선택하세요 —';
        }
    }

    async function saveStandbyInModal() {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const date         = (document.getElementById('lsbInDate')?.value || '').trim() || UIUtils.today();
        const carModel     = document.getElementById('lsbInCarModel')?.value || '';
        const partName     = document.getElementById('lsbInPartName')?.value || '';
        let color          = document.getElementById('lsbInColor')?.value || '';
        const inQty        = parseInt(document.getElementById('lsbInQty')?.value || '0', 10);
        const paintLot     = (document.getElementById('lsbInPaintLot')?.value || '').trim();
        const injectionLot = (document.getElementById('lsbInInjectionLot')?.value || '').trim();
        const note         = (document.getElementById('lsbInNote')?.value || '').trim() || '수기 대기입고';

        if (!carModel || !partName || !inQty || inQty <= 0) {
            UIUtils.toast('차종, 품명, 입고 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const inColorCheck = _assertStandbyMasterColor(carModel, partName, color);
        if (!inColorCheck.ok) {
            UIUtils.toast(inColorCheck.message, 'warning');
            return;
        }
        color = inColorCheck.color;
        if (!paintLot || !injectionLot) {
            UIUtils.toast('도장 LOT와 사출 LOT를 입력해 주세요.', 'warning');
            return;
        }
        const paintLotErr = _lotValidationMessage(paintLot);
        if (paintLotErr) {
            UIUtils.toast('도장 LOT: ' + paintLotErr, 'warning');
            document.getElementById('lsbInPaintLot')?.focus();
            return;
        }
        const injectionLotErr = _lotValidationMessage(injectionLot);
        if (injectionLotErr) {
            UIUtils.toast('사출 LOT: ' + injectionLotErr, 'warning');
            document.getElementById('lsbInInjectionLot')?.focus();
            return;
        }

        const { inventoryMap } = _buildInventorySnapshot();
        const key = _itemKey(carModel, partName, color);
        const item = inventoryMap[key];
        const currentStock = item ? Math.max(0, item.inQty - item.outQty) : 0;
        const newQty = currentStock + inQty;

        const existingIdx = _manualOverrides.findIndex(o =>
            _itemKey(o.carModel, o.partName, o.color || '') === key
        );
        // 항상 작업 출고까지 반영된 현재 권위 LOT 잔량에서 시작한다.
        // 원본 override.lots를 다시 쓰면 보정 이후 레이져 작업 차감이 되살아난다.
        let remainingLots = _buildLotBalanceRows(key, item).map(function(lot) {
            return {
                paintLot: String(lot.paintLot || '').trim(),
                injectionLot: String(lot.lotNo || '').trim(),
                qty: _normalizeQty(lot.qty)
            };
        }).filter(function(lot) { return lot.injectionLot && lot.qty > 0; });

        remainingLots = _scaleLotRowsToTotal(remainingLots, currentStock);
        if (!remainingLots.length && currentStock > 0) {
            remainingLots.push({ paintLot: '', injectionLot: '(미확인)', qty: currentStock });
        }

        const matchIdx = remainingLots.findIndex(function(lot) {
            return lot.paintLot === paintLot && lot.injectionLot === injectionLot;
        });
        if (matchIdx >= 0) {
            remainingLots[matchIdx].qty += inQty;
        } else {
            remainingLots.push({ paintLot: paintLot, injectionLot: injectionLot, qty: inQty });
        }

        const remainingPaintLots = [...new Set(remainingLots.map(function(lot) { return lot.paintLot; }).filter(Boolean))].join(', ');
        const remainingInjectionLots = [...new Set(remainingLots.map(function(lot) { return lot.injectionLot; }).filter(Boolean))].join(', ');
        const effectiveAt = new Date().toISOString();
        const record = {
            id: existingIdx >= 0 ? _manualOverrides[existingIdx].id : Storage.generateId(),
            carModel, partName, color,
            actualQty: newQty,
            paintLot: remainingPaintLots,
            injectionLot: remainingInjectionLots,
            lots: remainingLots,
            date,
            note,
            manualType: 'add',
            author: _currentAuthorName(),
            effectiveAt,
            updatedAt: effectiveAt
        };
        if (existingIdx >= 0) {
            _manualOverrides[existingIdx] = record;
        } else {
            _manualOverrides.push(record);
        }
        await _saveManualOverrides();
        UIUtils.closeModal();
        UIUtils.toast(`레이져 대기품 수동입고 완료 — ${partName} +${UIUtils.formatNumber(inQty)} EA`, 'success');
        renderAll();
    }

    // ── 레이져 대기품 수동 출고 ──────────────────────────────────────────
    async function openStandbyOutModal() {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const products  = _getLaserTargetProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        UIUtils.showModal('레이져 대기품 수동 출고', `
            <div id="lsbOutStockBox" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    현재 전산 재고 <strong id="lsbOutStockVal" style="color:var(--accent-red);">— 품명을 선택하세요 —</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lsbOutCarModel" onchange="LaserStandbyModule.onStandbyOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lsbOutPartName" onchange="LaserStandbyModule.onStandbyOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lsbOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량</label>
                    <input type="number" class="form-input" id="lsbOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 LOT - 임의입력</label>
                    <input type="text" class="form-input" id="lsbOutPaintLot" placeholder="도장 LOT 입력">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 LOT - 임의입력</label>
                    <input type="text" class="form-input" id="lsbOutInjectionLot" placeholder="사출 LOT 입력">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);"
                onclick="LaserStandbyModule.saveStandbyOutModal()">수동 출고 등록</button>
        `, 'lg');
    }

    function onStandbyOutCarChange(selectedPartName = '') {
        const carModel  = document.getElementById('lsbOutCarModel')?.value || '';
        const products  = _getLaserTargetProducts();
        const partNames = [...new Set(products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const partEl = document.getElementById('lsbOutPartName');
        if (partEl) partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(n => `<option value="${n}" ${n === selectedPartName ? 'selected' : ''}>${n}</option>`).join('');
        onStandbyOutPartChange();
    }

    function onStandbyOutPartChange() {
        const carModel = document.getElementById('lsbOutCarModel')?.value || '';
        const partName = document.getElementById('lsbOutPartName')?.value || '';
        const colorEl  = document.getElementById('lsbOutColor');
        if (!colorEl) return;

        const products = _getLaserTargetProducts();
        const colors   = [...new Set(products
            .filter(p => (!carModel || p.carModel === carModel) && (!partName || p.partName === partName))
            .map(p => p.color || '').filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // 현재 재고 업데이트
        const stockVal = document.getElementById('lsbOutStockVal');
        if (stockVal && partName) {
            const { inventoryMap } = _buildInventorySnapshot();
            const key   = _itemKey(carModel, partName, '');
            const keys  = Object.keys(inventoryMap).filter(k => k.startsWith(`${carModel}||${partName}||`));
            const stock = keys.reduce((s, k) => s + Math.max(0, (inventoryMap[k]?.inQty || 0) - (inventoryMap[k]?.outQty || 0)), 0);
            stockVal.textContent = `${UIUtils.formatNumber(stock)} EA`;
        } else if (stockVal) {
            stockVal.textContent = '— 품명을 선택하세요 —';
        }
    }

    async function saveStandbyOutModal() {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 없습니다. (관리자·설정에서 입력 권한 부여된 역할만 가능)', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const carModel      = document.getElementById('lsbOutCarModel')?.value     || '';
        const partName      = document.getElementById('lsbOutPartName')?.value     || '';
        const color         = document.getElementById('lsbOutColor')?.value        || '';
        const outQty        = parseInt(document.getElementById('lsbOutQty')?.value || '0', 10);
        const paintLot      = document.getElementById('lsbOutPaintLot')?.value.trim()      || '';
        const injectionLot  = document.getElementById('lsbOutInjectionLot')?.value.trim()  || '';

        if (!carModel || !partName || !outQty || outQty <= 0) {
            UIUtils.toast('차종, 품명, 출고 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        const { inventoryMap } = _buildInventorySnapshot();
        const key = _itemKey(carModel, partName, color);
        const item = inventoryMap[key];
        const currentStock = item ? Math.max(0, item.inQty - item.outQty) : 0;

        if (outQty > currentStock) {
            UIUtils.toast(`출고 수량(${outQty})이 현재 재고(${currentStock})를 초과합니다.`, 'warning');
            return;
        }

        const newQty = currentStock - outQty;
        const existingIdx = _manualOverrides.findIndex(o =>
            _itemKey(o.carModel, o.partName, o.color || '') === key
        );
        // 수동 출고도 원본 override가 아니라 정상 작업 차감까지 반영된 현재 LOT에서 시작한다.
        let remainingLots = _buildLotBalanceRows(key, item).map(function(lot) {
            return {
                paintLot: String(lot.paintLot || '').trim(),
                injectionLot: String(lot.lotNo || '').trim(),
                qty: _normalizeQty(lot.qty)
            };
        }).filter(function(lot) { return lot.injectionLot && lot.qty > 0; });

        // ✓ 계산된 LOT 잔량 합계가 재고 스냅샷(currentStock)과 어긋나는 경우(계산 경로 차이 등)
        //   마지막 LOT에 차액을 반영해 항상 합계가 일치하도록 맞춘다.
        remainingLots = _scaleLotRowsToTotal(remainingLots, currentStock);
        if (!remainingLots.length && currentStock > 0) {
            remainingLots.push({ paintLot: '', injectionLot: '(미확인)', qty: currentStock });
        }

        // LOT별 실사 보정이 있는 품목은 출고 후에도 LOT 배분을 보존한다.
        // 입력한 사출 LOT를 우선 차감하고, 미입력/잔여분은 등록 순서대로 차감한다.
        if (remainingLots.length > 0) {
            let remainingOut = outQty;
            const ordered = remainingLots.slice().sort(function(a, b) {
                const aPreferred = injectionLot && a.injectionLot === injectionLot ? 0 : 1;
                const bPreferred = injectionLot && b.injectionLot === injectionLot ? 0 : 1;
                return aPreferred - bPreferred;
            });
            ordered.forEach(function(lot) {
                if (remainingOut <= 0) return;
                const used = Math.min(lot.qty, remainingOut);
                lot.qty -= used;
                remainingOut -= used;
            });
            remainingLots = remainingLots.filter(function(lot) { return lot.qty > 0; });
        }
        const remainingPaintLots = remainingLots.length
            ? [...new Set(remainingLots.map(function(lot) { return lot.paintLot; }).filter(Boolean))].join(', ')
            : paintLot;
        const remainingInjectionLots = remainingLots.length
            ? [...new Set(remainingLots.map(function(lot) { return lot.injectionLot; }).filter(Boolean))].join(', ')
            : injectionLot;
        const effectiveAt = new Date().toISOString();
        const record = {
            id: existingIdx >= 0 ? _manualOverrides[existingIdx].id : Storage.generateId(),
            carModel, partName, color,
            actualQty: newQty,
            paintLot: remainingPaintLots,
            injectionLot: remainingInjectionLots,
            lots: remainingLots,
            manualType: 'out',
            author: _currentAuthorName(),
            effectiveAt,
            updatedAt: effectiveAt
        };
        if (existingIdx >= 0) {
            _manualOverrides[existingIdx] = record;
        } else {
            _manualOverrides.push(record);
        }
        await _saveManualOverrides();
        UIUtils.closeModal();
        renderAll();
        UIUtils.toast(`수동 출고 완료 — ${partName} ${outQty}EA (잔여 ${newQty}EA)`, 'success');
    }

    async function deleteFlowRecord(kind, sourceTypeEnc, sourceIdEnc) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning');
            return;
        }

        const sourceType = decodeURIComponent(sourceTypeEnc || '');
        const sourceId = decodeURIComponent(sourceIdEnc || '');
        if (!sourceType || !sourceId) {
            UIUtils.toast('삭제할 원본 정보를 찾을 수 없습니다.', 'error');
            return;
        }

        const label = kind === 'in' ? '입고' : '출고';
        UIUtils.confirm(`${label} 내역을 삭제하시겠습니까?`, async () => {
            try {
                if (sourceType === 'manual_override') {
                    await _ensureManualOverridesLoaded(true);
                    const before = _manualOverrides.length;
                    _manualOverrides = _manualOverrides.filter(row => String(row.id || '') !== String(sourceId));
                    if (_manualOverrides.length === before) {
                        UIUtils.toast('삭제할 수기 내역을 찾을 수 없습니다.', 'warning');
                        return;
                    }
                    await _saveManualOverrides();
                } else {
                    await Storage.remove(sourceType, sourceId);
                }

                await _ensureManualOverridesLoaded(true);
                renderAll();
                UIUtils.toast(`${label} 내역이 삭제되었습니다.`, 'success');
            } catch (e) {
                console.error('[LaserStandbyModule] flow record delete failed:', e);
                UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            }
        });
    }

    function _standbyMasterColors(carModel, partName) {
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        const products = _getLaserRelatedProducts();
        return [...new Set(products
            .filter(function(p) {
                return String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
            })
            .map(function(p) { return String(p.color || '').trim(); })
            .filter(Boolean))]
            .sort(function(a, b) { return String(a).localeCompare(String(b), 'ko'); });
    }

    function _assertStandbyMasterColor(carModel, partName, color) {
        const colors = _standbyMasterColors(carModel, partName);
        if (!colors.length) return { ok: false, message: '제품 마스터에 해당 차종·품명이 없습니다.', colors: colors };
        const c = String(color || '').trim();
        if (!c) return { ok: false, message: '컬러를 선택해 주세요.', colors: colors };
        if (colors.indexOf(c) < 0) {
            return { ok: false, message: '컬러는 제품 마스터 값만 가능합니다: ' + colors.join(', '), colors: colors };
        }
        return { ok: true, color: c, colors: colors };
    }

    async function openEditHistoryRecord(editKind, sourceTypeEnc, sourceIdEnc) {
        if (!_canEditStandby()) {
            UIUtils.toast('레이져 대기품 입력 권한이 있는 사용자만 수정할 수 있습니다.', 'warning');
            return;
        }
        const sourceType = decodeURIComponent(sourceTypeEnc || '');
        const sourceId = decodeURIComponent(sourceIdEnc || '');
        if (editKind === 'standby_override') {
            await _ensureManualOverridesLoaded(true);
            const ov = (_manualOverrides || []).find(function(r) { return String(r.id || '') === String(sourceId); });
            if (!ov) { UIUtils.toast('수기 내역을 찾을 수 없습니다.', 'warning'); return; }
            const key = _itemKey(ov.carModel, ov.partName, ov.color || '');
            openAdjustModal(encodeURIComponent(key), false);
            return;
        }
        if (editKind === 'standby_paint' || editKind === 'standby_laser') {
            const store = editKind === 'standby_paint'
                ? (DB.STORES.PAINTING_WORK || 'painting_work')
                : (DB.STORES.LASER_WORK_LOG || 'laser_work_log');
            const rows = Storage.getAll(store) || [];
            const entry = rows.find(function(r) { return String(r.id || '') === String(sourceId); });
            if (!entry) { UIUtils.toast('원본 내역을 찾을 수 없습니다.', 'warning'); return; }
            const products = _getLaserRelatedProducts();
            const carModels = [...new Set(products.map(function(p) { return p.carModel; }).filter(Boolean))]
                .sort(function(a, b) { return String(a).localeCompare(String(b), 'ko'); });
            const carModel = entry.carModel || '';
            const partName = entry.partName || '';
            const color = entry.color || '';
            const partNames = [...new Set(products.filter(function(p) { return !carModel || p.carModel === carModel; })
                .map(function(p) { return p.partName; }).filter(Boolean))]
                .sort(function(a, b) { return String(a).localeCompare(String(b), 'ko'); });
            if (partName && partNames.indexOf(partName) < 0) partNames.push(partName);
            const colors = _standbyMasterColors(carModel, partName);
            if (color && colors.indexOf(color) < 0) colors.push(color);
            const qty = editKind === 'standby_paint'
                ? (Number(entry.productionQty) || 0)
                : (Number(entry.quantity) || 0);
            const title = editKind === 'standby_paint' ? '도장 입고 내역 수정' : '레이져 출고(작업) 내역 수정';

            UIUtils.showModal(title, `
                <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">컬러는 제품 마스터에 등록된 값만 선택할 수 있습니다.</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="lsbHistEditCar" onchange="LaserStandbyModule.onHistEditCarChange('${editKind}')">
                            <option value="">-- 차종 --</option>
                            ${carModels.map(function(m) { return `<option value="${_escapeAttr(m)}"${m === carModel ? ' selected' : ''}>${_escapeAttr(m)}</option>`; }).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">품명</label>
                        <select class="form-select" id="lsbHistEditPart" onchange="LaserStandbyModule.onHistEditPartChange()">
                            <option value="">-- 품명 --</option>
                            ${partNames.map(function(n) { return `<option value="${_escapeAttr(n)}"${n === partName ? ' selected' : ''}>${_escapeAttr(n)}</option>`; }).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="lsbHistEditColor">
                            <option value="">-- 컬러 --</option>
                            ${colors.map(function(c) { return `<option value="${_escapeAttr(c)}"${c === color ? ' selected' : ''}>${_escapeAttr(c)}</option>`; }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lsbHistEditQty" min="1" value="${qty}">
                </div>
            `, `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserStandbyModule.saveEditHistoryRecord('${editKind}','${encodeURIComponent(store)}','${encodeURIComponent(sourceId)}')">저장</button>
            `, 'md');
            return;
        }
        UIUtils.toast('수정할 수 없는 내역입니다.', 'warning');
    }

    function onHistEditCarChange() {
        const carModel = (document.getElementById('lsbHistEditCar') || {}).value || '';
        const products = _getLaserRelatedProducts().filter(function(p) { return !carModel || p.carModel === carModel; });
        const partNames = [...new Set(products.map(function(p) { return p.partName; }).filter(Boolean))]
            .sort(function(a, b) { return String(a).localeCompare(String(b), 'ko'); });
        const partEl = document.getElementById('lsbHistEditPart');
        if (partEl) {
            partEl.innerHTML = '<option value="">-- 품명 --</option>' +
                partNames.map(function(n) { return `<option value="${_escapeAttr(n)}">${_escapeAttr(n)}</option>`; }).join('');
        }
        const colorEl = document.getElementById('lsbHistEditColor');
        if (colorEl) colorEl.innerHTML = '<option value="">-- 컬러 --</option>';
    }

    function onHistEditPartChange() {
        const carModel = (document.getElementById('lsbHistEditCar') || {}).value || '';
        const partName = (document.getElementById('lsbHistEditPart') || {}).value || '';
        const colors = _standbyMasterColors(carModel, partName);
        const colorEl = document.getElementById('lsbHistEditColor');
        if (colorEl) {
            colorEl.innerHTML = '<option value="">-- 컬러 --</option>' +
                colors.map(function(c) { return `<option value="${_escapeAttr(c)}">${_escapeAttr(c)}</option>`; }).join('');
        }
    }

    async function saveEditHistoryRecord(editKind, storeEnc, sourceIdEnc) {
        if (!_canEditStandby()) return;
        const store = decodeURIComponent(storeEnc || '');
        const sourceId = decodeURIComponent(sourceIdEnc || '');
        const carModel = (document.getElementById('lsbHistEditCar') || {}).value || '';
        const partName = (document.getElementById('lsbHistEditPart') || {}).value || '';
        const color = (document.getElementById('lsbHistEditColor') || {}).value || '';
        const qty = parseInt((document.getElementById('lsbHistEditQty') || {}).value || '0', 10);
        if (!carModel || !partName || !qty || qty <= 0) {
            UIUtils.toast('차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheck = _assertStandbyMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        const updates = { carModel: carModel, partName: partName, color: colorCheck.color };
        if (editKind === 'standby_paint') updates.productionQty = qty;
        else updates.quantity = qty;
        try {
            await Storage.update(store, sourceId, updates);
            UIUtils.closeModal();
            UIUtils.toast('내역이 수정되었습니다.', 'success');
            renderAll();
        } catch (e) {
            UIUtils.toast('수정 실패: ' + (e && e.message ? e.message : '오류'), 'error');
        }
    }

    return {
        init   : render,
        render,
        renderContentOnly,
        refresh,
        openLayout,
        openAdjustModal,
        saveAdjustModal,
        addAdjustLotRow,
        removeAdjustLotRow,
        onAdjustTotalQtyInput,
        onAdjustLotQtyInput,
        onAdjustCarChange,
        onAdjustPartChange,
        openStandbyInModal,
        onStandbyInCarChange,
        onStandbyInPartChange,
        saveStandbyInModal,
        openStandbyOutModal,
        onStandbyOutCarChange,
        onStandbyOutPartChange,
        saveStandbyOutModal,
        deleteFlowRecord,
        openEditHistoryRecord,
        onHistEditCarChange,
        onHistEditPartChange,
        saveEditHistoryRecord,
        confirmResetStandby,
        executeResetStandby,
        _validateLotFormat,
        _checkLotFormat,
        _openStandbyInForPart,
        _openStandbyOutForPart,
        _showItemDetail,
        ensureManualOverridesLoadedForWork,
        getStockSnapshotSync,
        getWorkLotSnapshotSync,
        normalizeStandbyRecord: function(row, products, injectionMaterials) {
            return _canonicalStandbyRecord(
                row || {},
                products || (Storage.getAll(DB.STORES.PRODUCTS) || []),
                injectionMaterials || (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [])
            );
        }
    };
})();
