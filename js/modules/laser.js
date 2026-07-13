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

    // 레이져 작업이력 수정 버튼 노출 대상: 관리자(admin) 또는 레이져 운영자만.
    // 계정 역할이 기본 키('laser_op')가 아닌 커스텀 역할일 수 있어, 역할 키와 라벨('레이져운영자')을 함께 매칭한다.
    function _canWriteLaserWork() {
        try {
            if (_isAdminUser()) return true;
            const user = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
            if (!user) return false;
            const roleKeys = Array.isArray(user.roles) ? user.roles.slice() : [];
            if (user.role) roleKeys.push(user.role);
            const roleDefs = (typeof AuthModule !== 'undefined' && Array.isArray(AuthModule.ROLES)) ? AuthModule.ROLES : [];
            return roleKeys.some(function(rk) {
                const key = String(rk || '');
                if (key === 'laser_op') return true;
                const def = roleDefs.find(function(d) { return d.key === key; });
                const label = String((def && def.label) || key).replace(/\s/g, '');
                // '레이져운영자' / '레이저운영자' 등 라벨 매칭
                return /레이[져저].*운영/.test(label);
            });
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
            return;
        }
        const standardEnd = _minutesToTime(startMin + estimateMin);
        endEl.dataset.standardEnd = standardEnd;
        const autoManaged = endEl.dataset.standardAuto === '1';
        if (forceFill || !endEl.value || autoManaged) {
            endEl.value = standardEnd;
            endEl.dataset.standardAuto = '1';
        }
        if (hintEl) hintEl.textContent = `표준 완료시간은 ${standardEnd} 입니다`;
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
        if (!startEl || !endEl || !startEl.value || !endEl.value || !endEl.dataset.standardEnd) return false;
        const startMin = _timeToMinutes(startEl.value);
        const endMinRaw = _timeToMinutes(endEl.value);
        const stdMinRaw = _timeToMinutes(endEl.dataset.standardEnd);
        if (startMin === null || endMinRaw === null || stdMinRaw === null) return false;
        const normalizeAfterStart = value => value < startMin ? value + 1440 : value;
        return normalizeAfterStart(endMinRaw) > normalizeAfterStart(stdMinRaw);
    }

    function updateOvertimeReasonVisibility() {
        const wrap = document.getElementById('lwOvertimeReasonWrap');
        const stdEl = document.getElementById('lwOvertimeStandardTime');
        const endEl = document.getElementById('lwEndTime');
        const show = _isEndOverStandard();
        if (wrap) wrap.style.display = show ? 'block' : 'none';
        if (stdEl) stdEl.textContent = (endEl && endEl.dataset.standardEnd) || '-';
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
        const actualEnd = _inputValue('lwEndTime');

        _sendManagerNotification(
            '레이져 작업 완료 지연 통보',
            `[${carModel || '-'} / ${partName || '-'}]\n표준 완료시간: ${standardEnd}\n실제 완료시간: ${actualEnd}\n사유: ${reason}`,
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

    // 재공재고 > 0인 레이저 대기품의 도장작업 레코드 목록 반환
    function getLaserStandbyItems() {
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
                    result.push({
                        carModel: item.carModel,
                        partName: item.partName,
                        color,
                        date: '',
                        productionQty: shortfall,
                        lots: (ov && (ov.paintLot || ov.injectionLot))
                            ? [{ paintDate: ov.paintLot || '', lotNo: ov.injectionLot || '', qty: shortfall }]
                            : []
                    });
                });
            }
        } catch (e) { /* 수기 재고 병합 실패 시 도장 작업일지 기준 목록만 표시 */ }

        return result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
                            <table class="data-table data-table--compact" style="min-width:920px;table-layout:fixed;">
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
                                        <th style="width:96px;">품질확인</th>
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

    function renderTable(data) {
        const tbody = document.getElementById('lwTableBody');
        const isAdmin = _isAdminUser();
        const canEdit = _canWriteLaserWork();
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
                    <div style="display:flex; gap:3px; flex-wrap:nowrap; align-items:center;">
                        ${d.qcFirst ? '<span class="badge badge-success" style="padding:1px 5px;font-size:0.72rem;">초</span>' : '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>'}
                        ${d.qcMiddle ? '<span class="badge badge-success" style="padding:1px 5px;font-size:0.72rem;">중</span>' : ''}
                        ${d.qcLast ? '<span class="badge badge-success" style="padding:1px 5px;font-size:0.72rem;">종</span>' : ''}
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
                <textarea class="form-input" id="lwOvertimeReason" rows="2" placeholder="표준 완료시간을 초과한 사유를 입력하세요." style="resize:vertical;">${d.overtimeReason || ''}</textarea>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">표준 완료시간 <strong id="lwOvertimeStandardTime">-</strong> 이후 완료 시 사유 입력 필수</div>
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

    function previewStandbyQty(idx, lotIdx, value) {
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

        // 현재 재고 합계
        const totalBalance = filtered.reduce((sum, w) => {
            const lots = Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ qty: Number(w.productionQty) || 0 }];
            return sum + lots.reduce((s, l) => s + (Number(l.qty) || 0), 0);
        }, 0);

        el.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:8px;">
                <div style="font-size:0.75rem; color:var(--accent-green); font-weight:600; display:flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">swap_vert</span>
                    선입선출(FIFO) 순서 — 도장작업일 오래된 순으로 정렬됨
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
                    <col style="width:108px;">
                    <col style="width:92px;">
                    <col style="width:92px;">
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
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">도장작업일</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">도장LOT</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">LOT수량</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">사출LOT</th>
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
                        const lots = Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ lotNo: w.lotNo || '', qty: Number(w.productionQty) || 0 }];
                        return lots.map((lot, lotIdx) => {
                            const inputId = `lwLotPickQty_${globalIdx}_${lotIdx}`;
                            const paintLotText = w.date ? w.date.replace(/-/g,'').slice(2,8) : '-';
                            return `
                            <tr style="${rowBg}" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${rowBg}'">
                                <td style="padding:5px 8px; text-align:center; white-space:nowrap;">${lotIdx === 0 ? orderBadge : ''}</td>
                                <td style="padding:5px 8px; white-space:nowrap;">${lotIdx === 0 ? (w.carModel || '-') : ''}</td>
                                <td style="padding:5px 8px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lotIdx === 0 ? (w.partName || '-') : ''}</td>
                                <td style="padding:5px 8px; white-space:nowrap;">${lotIdx === 0 ? (w.color || '-') : ''}</td>
                                <td style="padding:5px 8px; white-space:nowrap; font-weight:${lotIdx === 0 && isFirst ? '700' : '400'}; color:${lotIdx === 0 && isFirst ? 'var(--accent-green)' : 'inherit'};">${lotIdx === 0 ? (w.date || '-') : ''}</td>
                                <td style="padding:5px 8px; font-family:monospace; font-size:0.8rem; color:var(--accent-green); white-space:nowrap;">${lotIdx === 0 ? paintLotText : ''}</td>
                                <td style="padding:5px 8px; text-align:right; font-weight:700; color:var(--accent-blue); white-space:nowrap;">${UIUtils.formatNumber(lot.qty || 0)}</td>
                                <td style="padding:5px 8px; font-family:monospace; font-size:0.8rem; white-space:nowrap;">${lot.lotNo || '-'}</td>
                                <td style="padding:5px 8px; text-align:right;">
                                    <input id="${inputId}" type="text" class="form-input" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true" value="" placeholder="입력" style="height:30px;text-align:right;padding:4px 8px;"
                                           oninput="this.value=this.value.replace(/[^0-9]/g,'');LaserWorkModule.previewStandbyQty(${globalIdx}, ${lotIdx}, this.value)">
                                </td>
                                <td style="padding:5px 8px; text-align:center; white-space:nowrap;">
                                    <button class="btn btn-sm btn-primary" onclick="LaserWorkModule.selectStandbyItem(${globalIdx}, ${lotIdx}, '${inputId}')">LOT 선택</button>
                                </td>
                            </tr>`;
                        }).join('');
                    }).join('')}
                </tbody>
            </table>`;
    }

    // 대기품 항목 선택 → 폼 자동 채움 + 선입선출 경고
    function selectStandbyItem(idx, lotIdx = 0, qtyInputId = '') {
        const w = _standbyItems[idx];
        if (!w) return;
        const lots = Array.isArray(w.lots) && w.lots.length > 0 ? w.lots : [{ lotNo: w.lotNo || '', qty: Number(w.productionQty) || 0 }];
        const lot = lots[lotIdx] || lots[0] || {};
        const maxQty = Number(lot.qty) || Number(w.productionQty) || 0;
        const pickQty = Number((document.getElementById(qtyInputId) || {}).value) || 0;
        if (pickQty <= 0) {
            UIUtils.toast('LOT 작업수량을 입력하세요.', 'warning');
            return;
        }
        if (pickQty > maxQty) {
            UIUtils.toast(`LOT 잔량(${UIUtils.formatNumber(maxQty)}EA)보다 큰 수량은 선택할 수 없습니다.`, 'warning');
            return;
        }
        const sameSelectedQty = _selectedLots
            .filter(row => (row.paintDate || '') === (w.date || '') && (row.lotNo || '') === (lot.lotNo || w.lotNo || ''))
            .reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
        if (sameSelectedQty + pickQty > maxQty) {
            UIUtils.toast(`이미 선택한 수량을 포함하면 LOT 잔량(${UIUtils.formatNumber(maxQty)}EA)을 초과합니다.`, 'warning');
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

        // 도장 LOT 내부 배열에 추가
        _selectedLots.push({ paintDate: w.date || '', lotNo: lot.lotNo || w.lotNo || '', qty: pickQty, manual: false });
        renderLotRows();

        // 선택한 LOT 작업수량만 총 작업수량에 반영
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

        UIUtils.toast(`${w.carModel} / ${w.partName} / ${lot.lotNo || '-'} ${UIUtils.formatNumber(pickQty)}EA 선택되었습니다.`, 'success');
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
        return {
            date: document.getElementById('lwDate').value,
            machine: document.getElementById('lwMachine').value,
            startTime: document.getElementById('lwStartTime').value,
            endTime: document.getElementById('lwEndTime').value,
            standardEndTime: (document.getElementById('lwEndTime') || {}).dataset?.standardEnd || '',
            overtimeReason: (document.getElementById('lwOvertimeReason') || {}).value?.trim() || '',
            overtimeNotified: (document.getElementById('lwOvertimeNotified') || {}).value === '1',
            carModel: _selectedCarModel || (manualEnabled ? manualCarModel : ''),
            partName: _selectedPartName || (manualEnabled ? manualPartName : ''),
            color: _selectedColor || (manualEnabled ? manualColor : ''),
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
            if (qA > 0) {
                await Storage.add(STORE, { ...data, quantity: qA });
            }
            if (qB > 0 && linkedProd) {
                await Storage.add(STORE, { ...data, quantity: qB, partName: linkedProd.partName, color: linkedProd.color || data.color });
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
                    // 일부만 어긋남 → 차이를 마지막 LOT에 반영
                    _selectedLots[_selectedLots.length - 1].qty = Math.max(0, _selectedLots[_selectedLots.length - 1].qty + (totalQty - lotQtySum));
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
    let _currentView = 'inspection';
    let _nonconformStandardImage = null;

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

    // 검사 이력 수정·삭제: 관리자(admin) 또는 레이져운영자(laser_op)만.
    // 커스텀 역할은 라벨('레이져운영자')로도 매칭한다.
    function _canEditInspection() {
        try {
            if (_isAdminUser()) return true;
            const user = _currentUser();
            if (!user) return false;
            const roleKeys = Array.isArray(user.roles) ? user.roles.slice() : [];
            if (user.role) roleKeys.push(user.role);
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
            .filter(w => w.id && !inspectedIds.has(w.id) && qcReady(w))
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
                            return `
                            <tr>
                                <td>${_dateStack(w.date, w.startTime)}</td>
                                <td style="white-space:nowrap;"><span class="badge badge-info">${w.machine || '-'}</span></td>
                                <td style="white-space:nowrap;font-size:0.82rem;">${w.carModel || '-'}</td>
                                <td style="font-weight:600;">${w.partName || '-'}</td>
                                <td style="white-space:nowrap;">${w.color || '-'}</td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(w.quantity || 0)}</td>
                                <td>${_dateListHtml(info.paintDates)}</td>
                                <td>${_lotListHtml(info.injectionLots)}</td>
                                <td style="white-space:nowrap;">
                                    <button class="btn btn-sm btn-primary" onclick="LaserInspectionModule.openInspFromWork('${w.id}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_task</span> 검사 등록
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
            <span style="color:var(--border);">|</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">작업수량 <strong style="color:var(--accent-blue);font-size:0.95rem;">${UIUtils.formatNumber(work.quantity||0)} EA</strong>
                <input type="hidden" id="liInspQty" value="${work.quantity||0}">
            </span>
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

    // 검사자 선택 카드 (도장 검사와 동일 패턴)
    function _buildInspectorCard() {
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h5 style="margin:0;font-size:0.85rem;color:var(--text-primary);">검사자</h5>
                    <button type="button" class="btn btn-sm btn-primary" id="liAddInspectorBtn"
                        onclick="LaserInspectionModule._addInspectorField()"
                        style="gap:4px;padding:4px 8px;font-size:0.78rem;">
                        <span class="material-symbols-outlined" style="font-size:14px;">add</span> 추가
                    </button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;" id="liInspectorContainer"></div>
            </div>
        </div>`;
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
            <div class="form-group" id="liInspectorGroup${idx}" style="margin:0;">
                <label class="form-label" style="font-size:0.72rem;">검사자${idx}</label>
                <select id="liInspector${idx}" class="form-select"
                    style="padding:5px 6px;border:1px solid var(--border);font-size:0.85rem;"
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
    function _buildQtyCard(d = {}, autoInspQty = 0) {
        const failQty = d.failQty || 0;
        const goodQty = d.goodQty !== undefined ? d.goodQty : Math.max(0, autoInspQty - failQty);
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);">검사 수량</h5>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">양품수</label>
                        <input type="number" class="form-input" id="liGoodQty" value="${goodQty>0?goodQty:''}" placeholder="-" min="0"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"
                            onchange="LaserInspectionModule._updateDefectQty()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">불량수</label>
                        <input type="number" class="form-input" id="liDefectQty" value="${failQty}" min="0"
                            style="text-align:right;font-weight:600;font-size:0.9rem;padding:5px 6px;"
                            onchange="LaserInspectionModule._updateGoodQty()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.72rem;">합계 (자동)</label>
                        <input type="text" class="form-input" id="liTotalQty" value="${goodQty+failQty}" readonly
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


    // 저장/취소 버튼 (좌측, 세로 배치)
    function _buildBtns(saveAction, opts = {}) {
        if (opts.readonly) {
            const editBtn = opts.editId
                ? `<button class="btn btn-primary" onclick="LaserInspectionModule.edit('${opts.editId}')" style="width:100%;justify-content:center;">
                    <span class="material-symbols-outlined">edit</span> 수정
                </button>`
                : '';
            return `
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${editBtn}
                <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()" style="width:100%;justify-content:center;">
                    <span class="material-symbols-outlined">close</span> 닫기
                </button>
            </div>`;
        }
        return `
        <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="btn btn-primary" onclick="${saveAction}" style="width:100%;justify-content:center;">
                <span class="material-symbols-outlined">save</span> 저장
            </button>
            <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()" style="width:100%;justify-content:center;">
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

    // 2-컬럼 레이아웃 래퍼 (도장 검사 일지 스타일)
    function _build2Col(leftContent, rightContent) {
        return `
        <div style="display:grid;grid-template-columns:260px 1fr;gap:10px;align-items:start;">
            <div style="display:flex;flex-direction:column;gap:10px;">${leftContent}</div>
            ${rightContent}
        </div>`;
    }

    function buildFormHTML(d = {}) {
        const left = _buildSelectCard(d) + _buildInspInfoCard(d) + _buildQtyCard(d) + _buildInspectorCard();
        return _build2Col(left, _buildDefectCard(d.defectDetails||{}));
    }

    // ─ 모달 열기 ─────────────────────────────────────────────────────
    function openAddModal() {
        _liCarModel = ''; _liPartName = ''; _liColor = ''; _liWorkId = null;
        const left = _buildSelectCard() + _buildInspInfoCard() + _buildQtyCard() +
            _buildPackagingCard() + _buildInspectorCard() + _buildBtns('LaserInspectionModule._saveInspection()');
        _openModal('레이져 검사 등록', _build2Col(left, _buildDefectCard()));
        setTimeout(() => _initInspectorFields(), 50);
    }

    function openInspFromWork(workId) {
        const w = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!w) { UIUtils.toast('작업 정보를 찾을 수 없습니다.', 'error'); return; }
        _liCarModel = w.carModel || ''; _liPartName = w.partName || '';
        _liColor    = w.color    || ''; _liWorkId   = w.id;
        const prevResidualQty = _getPrevResidualQty(w.carModel, w.partName, w.color);
        const packUnit = _parsePackNum(w.packUnit) || _findProductPackUnit(w.carModel, w.partName, w.color);
        const initGoodQty = w.quantity || 0;
        const left = _buildInspInfoCard({}, w) + _buildQtyCard({}, w.quantity||0) +
            _buildPackagingCard({}, prevResidualQty, packUnit, initGoodQty) +
            _buildInspectorCard() +
            _buildBtns('LaserInspectionModule._saveInspection()');
        _openModal(`레이져 검사 등록 — ${w.partName||''}`,
            _buildWorkBanner(w) + _build2Col(left, _buildDefectCard()));
        setTimeout(() => {
            _calculateInspectionTime();
            _initInspectorFields();
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
        const packUnit = d.packUnit || (workRef?.packUnit) || _findProductPackUnit(d.carModel, d.partName, d.color);
        const left = (workRef ? '' : _buildSelectCard(d)) +
            _buildInspInfoCard(d) + _buildQtyCard(d) +
            _buildPackagingCard(d, prevResidualQty, packUnit) +
            _buildInspectorCard() +
            (isEdit
                ? _buildBtns(`LaserInspectionModule._saveInspection('${id}')`)
                : _buildBtns('', { readonly: true, editId: canEdit ? id : null }));
        _openModal(isEdit ? '레이져 검사 수정' : '레이져 검사 보기',
            (workRef ? _buildWorkBanner(workRef) : '') +
            _build2Col(left, _buildDefectCard(d.defectDetails||{})));
        setTimeout(() => {
            _initInspectorFields(d.inspectors || []);
            if (!workRef) onCarModelChange(d.partName);
            if (!isEdit) _setInspectionFormReadonly(true);
        }, 50);
    }

    function view(id) {
        _openInspectionDetail(id, 'view');
    }

    function edit(id) {
        _openInspectionDetail(id, 'edit');
    }

    function _validateFailQty(data) {
        const inspQty = Number(data.inspQty) || 0;
        const failQty = Number(data.failQty) || 0;
        const defectTotal = Object.values(data.defectDetails || {})
            .reduce((sum, value) => sum + (Number(value) || 0), 0);

        if (failQty > inspQty) {
            UIUtils.toast(`불량수는 검사수량보다 클 수 없습니다. 검사 ${UIUtils.formatNumber(inspQty)} EA / 불량 ${UIUtils.formatNumber(failQty)} EA`, 'warning');
            const failEl = document.getElementById('liDefectQty');
            if (failEl) failEl.focus();
            return false;
        }
        if (defectTotal > inspQty) {
            UIUtils.toast(`불량 유형 합계는 검사수량보다 클 수 없습니다. 검사 ${UIUtils.formatNumber(inspQty)} EA / 불량 유형 합계 ${UIUtils.formatNumber(defectTotal)} EA`, 'warning');
            return false;
        }
        return true;
    }

    // ─ 저장 ──────────────────────────────────────────────────────────
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
        if (existingId) {
            await Storage.update(STORE, existingId, data);
            UIUtils.toast('수정되었습니다.', 'success');
        } else {
            await Storage.add(STORE, data);
            UIUtils.toast('검사 등록되었습니다.', 'success');

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

            if (_workRef && data.workLogId) {
                await Storage.update(DB.STORES.LASER_WORK_LOG, data.workLogId, {
                    ..._workRef,
                    packUnit: _packUnit,
                    inspectionGoodQty: data.goodQty || 0,
                    shippingEligibleQty: _packQty,
                    laserResidualQty: _residualQty,
                    laserResidualStatus: _residualQty > 0 ? '잔량' : ''
                });
            }

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
        _closeModal();
        renderStandby();
        search();
    }

    // ─ 데이터 수집 ───────────────────────────────────────────────────
    function collectData() {
        const inspQtyEl = document.getElementById('liInspQty');
        const inspQty   = parseInt((inspQtyEl?.value || '').toString().replace(/,/g, '') || 0);
        const goodQty   = parseInt(document.getElementById('liGoodQty')?.value || 0);
        const failQty   = parseInt(document.getElementById('liDefectQty')?.value || 0);

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
            inspQty, goodQty, failQty,
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
        let sum = 0;
        const defectInputs = document.querySelectorAll('[id^="linj-"],[id^="lpaint-"],[id^="llaser-"]');
        defectInputs.forEach(el => { sum += parseInt(el.value||0); });
        const iEl = document.getElementById('liInspQty');
        const maxDefectQty = parseInt(iEl?.value?.toString().replace(/,/g,'')||0);
        if (maxDefectQty > 0 && sum > maxDefectQty) {
            const activeEl = document.activeElement;
            if (activeEl && Array.from(defectInputs).includes(activeEl)) {
                const overflow = sum - maxDefectQty;
                const current = parseInt(activeEl.value || 0);
                activeEl.value = Math.max(0, current - overflow);
                sum = maxDefectQty;
            } else {
                sum = maxDefectQty;
            }
            UIUtils.toast(`불량수는 검사수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(maxDefectQty)} EA`, 'warning');
        }
        const dEl = document.getElementById('liDefectQty');
        if (dEl) dEl.value = sum;
        const gEl = document.getElementById('liGoodQty');
        const tEl = document.getElementById('liTotalQty');
        if (iEl && gEl) gEl.value = Math.max(0, parseInt(iEl.value?.toString().replace(/,/g,'')||0) - sum);
        if (tEl) tEl.value = parseInt(gEl?.value||0) + sum;
        _updatePackagingCalc();
    }

    function _updateDefectQty() {
        const i = parseInt((document.getElementById('liInspQty')?.value||'').replace(/,/g,'')||0);
        const g = parseInt(document.getElementById('liGoodQty')?.value||0);
        const dEl = document.getElementById('liDefectQty');
        if (dEl) dEl.value = Math.max(0, i - g);
        const tEl = document.getElementById('liTotalQty');
        if (tEl) tEl.value = i;
    }

    function _updateGoodQty() {
        const i = parseInt((document.getElementById('liInspQty')?.value||'').replace(/,/g,'')||0);
        const dEl = document.getElementById('liDefectQty');
        let f = parseInt(dEl?.value||0);
        if (f > i) {
            f = i;
            if (dEl) dEl.value = i;
            UIUtils.toast(`불량수는 검사수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(i)} EA`, 'warning');
        }
        const gEl = document.getElementById('liGoodQty');
        if (gEl) gEl.value = Math.max(0, i - f);
        const tEl = document.getElementById('liTotalQty');
        if (tEl) tEl.value = Math.max(0, i - f) + f;
        _updatePackagingCalc();
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
        _updatePackagingCalc, _autoBoxCount,
        _addInspectorField, _syncInspectorOptions,
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
    let _manualOverrides = [];
    let _manualOverridesLoaded = false;

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

                <div class="stat-cards" id="lsbStats"></div>

                <!-- 차종별 재공 재고 현황 (블록) -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">입고(도장완료) − 출고(레이져처리) = 재공재고</span>
                    </div>
                    <div class="card-body" id="lsbInventory" style="padding:16px; display:flex; flex-direction:column; gap:14px;"></div>
                </div>

                <!-- 분출 현황 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">table_rows</span> 분출 현황 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
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
        } catch (e) {
            console.warn('[LaserStandbyModule] CONFIG 수기조정 로드 실패:', e);
        }
        renderAll();
    }

    // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
    function findProduct(products, w) {
        const car = String(w.carModel || '').trim();
        const part = String(w.partName || '').trim();
        const color = String(w.color || '').trim();
        const match = (p) => String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
        return products.find(p => match(p) && String(p.color || '').trim() === color)
            || products.find(p => match(p));
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

        return unique.find(product => color && _sameText(product.color, color))
            || unique.find(product => car && _sameText(product.carModel, car))
            || unique[0]
            || null;
    }

    function _canonicalStandbyRecord(row, products, injectionMaterials) {
        const prod = findProduct(products, row)
            || _findProductByInjectionPart(products, injectionMaterials, row);

        // ⚠ 제품 마스터에 매칭되는 제품이 없으면 예전에는 원본 행을 그대로 통과시켰다.
        // 그 결과 도장/사출 쪽 품명(예: 'PAO COVER (WHITE)')이 재공 현황에 제품 품명인 척
        // 섞여 들어와 존재하지 않는 유령 품목이 만들어졌다. 통과시키되 반드시 표시한다.
        if (!prod) return { ...row, _unmatchedProduct: true };

        const originalPartName = String(row.partName || '').trim();
        const productPartName = String(prod.partName || '').trim();
        return {
            ...row,
            productId: prod.id || row.productId || '',
            carModel: prod.carModel || row.carModel || '',
            partName: productPartName || row.partName || '',
            color: prod.color || row.color || '',
            sourcePartName: originalPartName && originalPartName !== productPartName
                ? originalPartName
                : (row.sourcePartName || '')
        };
    }

    function _itemKey(carModel, partName, color) {
        return `${carModel || ''}||${partName || ''}||${color || ''}`;
    }

    function _normalizeQty(value) {
        const qty = parseInt(String(value || '').replace(/,/g, ''), 10);
        return Number.isFinite(qty) && qty > 0 ? qty : 0;
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
        return products.filter(prod => _hasLaserAfterPaintFlow(prod));
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

    // 레이져 작업 등록(LaserWorkModule) 화면에서 수기 등록 재고를 대기품 목록에 반영하기 위해 사용
    async function ensureManualOverridesLoadedForWork() {
        return _ensureManualOverridesLoaded();
    }

    // 현재 캐시된(비동기 로드 완료된) 재공 재고 스냅샷 — 동기 함수라 로드 전에 호출하면 빈 값일 수 있음
    function getStockSnapshotSync() {
        return _buildInventorySnapshot().stockItems;
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
            const user = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
            const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
            return roles.some(role => String(role || '') === 'admin');
        } catch (e) {
            return false;
        }
    }

    // 수량 수정(재공 조정/출고) 권한: 관리자(admin) 또는 레이져운영자(laser_op).
    // 커스텀 역할일 수 있어 역할 키('laser_op')와 라벨('레이져운영자')을 함께 매칭한다. (삭제는 관리자 전용 유지)
    function _canEditStandby() {
        try {
            if (_isAdminUser()) return true;
            const user = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
            if (!user) return false;
            const roleKeys = Array.isArray(user.roles) ? user.roles.slice() : [];
            if (user.role) roleKeys.push(user.role);
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
                    outRecords: []
                };
            }
            const qty = Number(w.productionQty) || 0;
            inventoryMap[key].inQty += qty;
            inventoryMap[key].inRecords.push({
                sourceType: DB.STORES.PAINTING_WORK,
                sourceId: w.id || '',
                date: _recordedDateTime(w, w.date || '', w.endTime || w.startTime || ''),
                paintingDate: _paintingWorkDateTime(w),
                qty,
                lotNo: w.lotNo || (w.lots && w.lots.length > 0 ? [...new Set(w.lots.map(l => l.lotNo).filter(Boolean))].join(', ') : ''),
                note: w.note || w.line || ''
            });
        });

        laserWorks.forEach(raw => {
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            const key = _itemKey(w.carModel, w.partName, w.color || '');
            if (!inventoryMap[key]) return;
            const qty = Number(w.quantity) || 0;
            inventoryMap[key].outQty += qty;
            const paintDates = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.paintDate).filter(Boolean))].join(', ')
                : (w.paintDate || '');
            const injLots = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.lotNo).filter(Boolean))].join(', ')
                : (w.paintLot || w.lotNo || '');
            inventoryMap[key].outRecords.push({
                sourceType: DB.STORES.LASER_WORK_LOG,
                sourceId: w.id || '',
                date: _formatWorkDateTime(w.date || '', w.endTime || w.startTime || ''),
                paintingDate: _formatWorkDateTime(paintDates, ''),
                lotNo: injLots,
                qty,
                machine: w.machine || '',
                note: w.note || w.machine || ''
            });
        });

        _manualOverrides.forEach(rawOverride => {
            const override = _canonicalStandbyRecord(rawOverride, products, injectionMaterials);
            const key = _itemKey(override.carModel, override.partName, override.color || '');
            if (!key.replace(/\|/g, '')) return;
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
                    outRecords: []
                };
            }

            const currentStock = inventoryMap[key].inQty - inventoryMap[key].outQty;
            const targetStock = _normalizeQty(override.actualQty);
            const diff = targetStock - currentStock;
            inventoryMap[key].manualOverride = override;

            if (diff > 0) {
                inventoryMap[key].inQty += diff;
                inventoryMap[key].inRecords.push({
                    sourceType: 'manual_override',
                    sourceId: override.id || '',
                    date: _formatWorkDateTime(override.updatedAt || override.date || UIUtils.today(), ''),
                    paintingDate: _formatWorkDateTime(override.paintLot || override.date || '', ''),
                    qty: diff,
                    lotNo: override.injectionLot || '',
                    paintLot: override.paintLot || '',
                    injectionLot: override.injectionLot || '',
                    note: override.manualType === 'add' ? '수기추가' : '수기조정'
                });
            } else if (diff < 0) {
                inventoryMap[key].outQty += Math.abs(diff);
                inventoryMap[key].outRecords.push({
                    sourceType: 'manual_override',
                    sourceId: override.id || '',
                    date: _formatWorkDateTime(override.updatedAt || override.date || UIUtils.today(), ''),
                    paintingDate: _formatWorkDateTime(override.paintLot || override.date || '', ''),
                    lotNo: override.injectionLot || '',
                    qty: Math.abs(diff),
                    machine: override.manualType === 'add' ? '수기추가' : '수기조정',
                    note: override.manualType === 'add' ? '수기추가' : '수기조정'
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
        const allRows = [
            ...((item.inRecords || []).map(r => ({ kind: 'in', ...r }))),
            ...((item.outRecords || []).map(r => ({ kind: 'out', ...r })))
        ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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
        const srcType = String((r && r.sourceType) || '').trim();
        if (r && r.kind === 'out') {
            if (srcType === 'laser_work' || /레이저|레이져/.test(machine)) {
                return { label: '레이저 출고', color: '#7c3aed', detail: machine || note || '레이저 작업' };
            }
            return { label: '수동 차감', color: '#dc2626', detail: note || machine || '수기 출고' };
        }
        if (srcType === 'manual_override' || /수기|수동|조정|추가/.test(note)) {
            return { label: '수동입고', color: '#0891b2', detail: note || '수기 등록' };
        }
        return { label: '도장 완료', color: '#2563eb', detail: note || '도장 작업 입고' };
    }

    function _standbyToInvRecords(allRows) {
        return (allRows || []).map(function(r) {
            const lot = r.injLotNo || r.lotNo || '무표기';
            const qty = Number(r.qty) || 0;
            return {
                type: r.kind === 'out' ? '출고' : '입고',
                date: r.date,
                quantity: qty,
                lotNo: lot,
                lots: [{ lotNo: lot, qty: qty }],
                _orig: r,
                receivedBy: r.operator,
                outgoingBy: r.operator
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
        const who = r.operator || r.machine || r.note || '-';
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

        const adjusted = normalized.map(lot => ({
            lotNo: lot.lotNo,
            paintLot: lot.paintLot,
            qty: Number(lot.qty) || 0
        }));
        const diff = total - lotQtySum;
        if (Math.abs(diff) > 0.001) {
            adjusted[adjusted.length - 1].qty = Math.max(0, adjusted[adjusted.length - 1].qty + diff);
        }
        return adjusted.filter(lot => lot.qty > 0);
    }

    function _buildLotBalanceRows(key, item = null) {
        const [carModel, partName, color] = String(key || '').split('||');
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const injectionMaterials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
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

        paintingWorks.forEach(raw => {
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName || ((w.color || '') !== (color || ''))) return;
            const totalQty = Number(w.productionQty) || 0;
            if (totalQty <= 0) return;
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
            const w = _canonicalStandbyRecord(raw, products, injectionMaterials);
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName || ((w.color || '') !== (color || ''))) return;
            const totalQty = Number(w.quantity) || 0;
            if (totalQty <= 0) return;
            const fallbackPaintLot = String(w.paintDate || w.date || '').replace(/-/g, '').slice(2, 8);
            const lots = _expandLotQuantities(
                totalQty,
                Array.isArray(w.paintLots) && w.paintLots.length > 0 ? w.paintLots : [{ lotNo: w.lotNo || w.paintLot || '', qty: totalQty, paintDate: w.paintDate || '' }],
                w.lotNo || w.paintLot || '',
                fallbackPaintLot
            );
            lots.forEach(lot => addLot(lot.lotNo, lot.paintLot || fallbackPaintLot, -lot.qty));
        });

        const manualRows = item
            ? [
                ...((item.inRecords || []).filter(r => r.sourceType === 'manual_override').map(r => ({ kind: 'in', ...r }))),
                ...((item.outRecords || []).filter(r => r.sourceType === 'manual_override').map(r => ({ kind: 'out', ...r })))
            ]
            : [];
        manualRows.forEach(row => {
            addLot(row.lotNo || row.injectionLot || '(미확인)', row.paintLot || row.paintingDate || '-', row.kind === 'in' ? row.qty : -row.qty);
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
        renderStats(stockItems, allItems);
        renderInventoryBlocks(stockItems);
        renderDetailTable(allItems);
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
                    아래 <b>분출 현황</b>에서 입·출고 내역을 확인하세요.
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
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);table-layout:fixed;">
                        <colgroup>
                            <col>
                            <col style="width:62px;">
                            <col style="width:96px;">
                            <col style="width:108px;">
                        </colgroup>
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 6px;text-align:center;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근입고</th>
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
        const deleteHeader = isAdmin ? '<th style="text-align:center;">삭제</th>' : '';
        const deleteColspan = isAdmin ? 9 : 8;

        // 모든 입고/출고 레코드를 분리 평탄화
        const incomingRows = [];
        const outgoingRows = [];
        items.forEach(item => {
            item.inRecords.forEach(r => {
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
                    sourceId: r.sourceId || ''
                });
            });
            item.outRecords.forEach(r => {
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
                    sourceId: r.sourceId || ''
                });
            });
        });

        incomingRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        outgoingRows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        if (incomingRows.length === 0 && outgoingRows.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;padding:20px;">내역이 없습니다.</p>`;
            return;
        }

        const emptyRow = label => `
            <tr>
                <td colspan="${deleteColspan}" style="text-align:center;color:var(--text-muted);padding:18px;font-size:0.84rem;">${label}</td>
            </tr>`;

        const incomingBody = incomingRows.length
            ? incomingRows.map(r => `
                <tr style="border-left:3px solid var(--accent-green);">
                    <td style="white-space:nowrap;">${r.date || '-'}</td>
                    <td><strong>${r.carModel || '-'}</strong></td>
                    <td>${r.partName || '-'}</td>
                    <td>${r.color || '-'}</td>
                    <td style="text-align:right;color:var(--accent-green);font-weight:700;">${UIUtils.formatNumber(r.qty || 0)}</td>
                    <td style="white-space:nowrap;">${r.paintingDate || '-'}</td>
                    <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary);">${r.lotNo || '-'}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);">${r.note || ''}</td>
                    ${isAdmin ? `<td style="text-align:center;white-space:nowrap;">${_deleteButton(r, 'in')}</td>` : ''}
                </tr>`).join('')
            : emptyRow('입고 내역이 없습니다.');

        const outgoingBody = outgoingRows.length
            ? outgoingRows.map(r => `
                <tr style="border-left:3px solid var(--accent-blue);">
                    <td style="white-space:nowrap;">${r.date || '-'}</td>
                    <td><strong>${r.carModel || '-'}</strong></td>
                    <td>${r.partName || '-'}</td>
                    <td>${r.color || '-'}</td>
                    <td style="text-align:right;color:var(--accent-blue);font-weight:700;">${UIUtils.formatNumber(r.qty || 0)}</td>
                    <td style="white-space:nowrap;">${r.paintingDate || '-'}</td>
                    <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary);">${r.lotNo || '-'}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);">${r.note || ''}</td>
                    ${isAdmin ? `<td style="text-align:center;white-space:nowrap;">${_deleteButton(r, 'out')}</td>` : ''}
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
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>입고일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>컬러</th>
                                    <th style="text-align:right;">입고수량</th>
                                    <th>도장작업일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th>사출 LOT</th>
                                    <th>비고</th>
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
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>출고일<br><small style="font-weight:400;">(출고시. 년월일시분)</small></th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>컬러</th>
                                    <th style="text-align:right;">출고수량</th>
                                    <th>도장작업일<br><small style="font-weight:400;">(년월일시분)</small></th>
                                    <th>사출 LOT</th>
                                    <th>비고</th>
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

    async function openAdjustModal(keyEnc = '', isAddMode = false) {
        if (!_canEditStandby()) {
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
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

        UIUtils.showModal(addMode ? '레이저 대기 재공품 추가' : '레이저 대기 재공 수량 조정', `
            ${unmatchedBanner}
            <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    현재 전산 재고 <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(currentStock)} EA</strong>
                </div>
            </div>
            ${identityFieldsHtml}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${addMode ? '추가 수량' : '수량'}</label>
                    <input type="number" class="form-input" id="lsbAdjustQty" value="${override ? _normalizeQty(override.actualQty) : currentStock}" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 LOT - ${addMode ? '필수' : '임의입력'}</label>
                    <input type="text" class="form-input" id="lsbAdjustPaintLot" value="${_escapeAttr(initialPaintLot)}" placeholder="도장 LOT 입력">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 LOT - ${addMode ? '필수' : '임의입력'}</label>
                    <input type="text" class="form-input" id="lsbAdjustInjectionLot" value="${_escapeAttr(initialInjectionLot)}" placeholder="사출 LOT 입력">
                </div>
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

    async function saveAdjustModal(keyEnc = '', isAddMode = false) {
        if (!_canEditStandby()) {
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const originalKey = keyEnc ? decodeURIComponent(keyEnc) : '';
        const addMode = isAddMode || !originalKey;
        const carModel = document.getElementById('lsbAdjustCarModel')?.value || '';
        const partName = document.getElementById('lsbAdjustPartName')?.value || '';
        const color = document.getElementById('lsbAdjustColor')?.value || '';
        const actualQty = _normalizeQty(document.getElementById('lsbAdjustQty')?.value || 0);
        const paintLot = document.getElementById('lsbAdjustPaintLot')?.value?.trim() || '';
        const injectionLot = document.getElementById('lsbAdjustInjectionLot')?.value?.trim() || '';

        if (!carModel || !partName) {
            UIUtils.toast('차종과 품명을 선택해 주세요.', 'warning');
            return;
        }
        if (addMode && (!paintLot || !injectionLot)) {
            UIUtils.toast('도장 LOT와 사출 LOT는 필수입니다.', 'warning');
            return;
        }
        if (addMode && actualQty <= 0) {
            UIUtils.toast('수량을 1개 이상 입력해 주세요.', 'warning');
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

        const nextRecord = {
            id: currentIndex >= 0 ? _manualOverrides[currentIndex].id : Storage.generateId(),
            carModel: normalizedCarModel,
            partName: normalizedPartName,
            color: normalizedColor,
            actualQty,
            paintLot,
            injectionLot,
            manualType: addMode ? 'add' : 'edit',
            updatedAt: new Date().toISOString()
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
        UIUtils.toast(addMode ? '레이저 대기 재공품이 추가되었습니다.' : '재공 수량이 조정되었습니다.', 'success');
    }

    function renderContentOnly(container) {
        container.innerHTML = `
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
                    <h4><span class="material-symbols-outlined">table_rows</span> 분출 현황 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
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
        event.stopPropagation();

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

        const lotRowsHtml = lotBalRows.map(r => `
            <tr>
                <td style="font-family:monospace;color:var(--accent-green);">${r.paintLot || '-'}</td>
                <td style="font-family:monospace;">${r.lotNo || '-'}</td>
                <td style="text-align:right;color:var(--accent-blue);font-weight:600;">${UIUtils.formatNumber(r.qty)}</td>
                ${canEdit ? `<td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserStandbyModule.openAdjustModal('${_keyJs}'),80);">
                        보정 수정
                    </button>
                </td>` : ''}
            </tr>`).join('');

        const historySection = StockDetailUI.buildInvHistorySection(_standbyToInvRecords(allRows), {
            routeFn: function(d) {
                return _standbyRoute(d._orig || { kind: d.type === '출고' ? 'out' : 'in' });
            },
            lotFn: function(d) {
                const r = d._orig;
                if (!r) return d.lotNo || '무표기';
                const injLot = r.injLotNo || r.lotNo || '-';
                const paintLot = r.kind === 'in'
                    ? (r.paintLot ? String(r.paintLot).replace(/-/g, '').slice(2, 8) : '-')
                    : (r.paintLot || '-');
                return paintLot && paintLot !== '-'
                    ? injLot + ' / ' + paintLot
                    : injLot;
            },
            whoFn: function(d) {
                const r = d._orig;
                return (r && (r.operator || r.machine || r.note)) || '-';
            }
        });

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${carModel}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${partName}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${color}</span>` : ''}
                ${canEdit ? `
                <div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserStandbyModule.openAdjustModal('${_keyJs}'),80);">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">edit</span> 수량 수정
                    </button>
                    <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                        onclick="LaserStandbyModule._openStandbyOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 출고
                    </button>
                </div>` : ''}
            </div>
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

    // ── 레이져 대기품 출고 ──────────────────────────────────────────────
    async function openStandbyOutModal() {
        if (!_canEditStandby()) {
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        await _ensureManualOverridesLoaded();

        const products  = _getLaserTargetProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        UIUtils.showModal('레이져 대기품 출고', `
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
                onclick="LaserStandbyModule.saveStandbyOutModal()">출고 등록</button>
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
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
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
        const record = {
            id: existingIdx >= 0 ? _manualOverrides[existingIdx].id : Storage.generateId(),
            carModel, partName, color,
            actualQty: newQty,
            paintLot, injectionLot,
            manualType: 'out',
            updatedAt: new Date().toISOString()
        };
        if (existingIdx >= 0) {
            _manualOverrides[existingIdx] = record;
        } else {
            _manualOverrides.push(record);
        }
        await _saveManualOverrides();
        UIUtils.closeModal();
        renderAll();
        UIUtils.toast(`레이져 대기품 출고 완료 — ${partName} ${outQty}EA (잔여 ${newQty}EA)`, 'success');
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

    return {
        init   : render,
        render,
        renderContentOnly,
        refresh,
        openLayout,
        openAdjustModal,
        saveAdjustModal,
        onAdjustCarChange,
        onAdjustPartChange,
        openStandbyOutModal,
        onStandbyOutCarChange,
        onStandbyOutPartChange,
        saveStandbyOutModal,
        deleteFlowRecord,
        _openStandbyOutForPart,
        _showItemDetail,
        ensureManualOverridesLoadedForWork,
        getStockSnapshotSync,
        normalizeStandbyRecord: function(row, products, injectionMaterials) {
            return _canonicalStandbyRecord(
                row || {},
                products || (Storage.getAll(DB.STORES.PRODUCTS) || []),
                injectionMaterials || (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [])
            );
        }
    };
})();
