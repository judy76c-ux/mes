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

    function _workerSelect(id, label, selectedValue) {
        const options = [...new Set([..._getLaserWorkerOptions(), selectedValue].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return `
            <div class="form-group">
                <label class="form-label">${label} <span style="color:var(--accent-red)">*</span></label>
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
            if (!map[key]) map[key] = { paintDate, lotNo, qty: 0 };
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

    function _fmtLaserMinutes(min) {
        const n = Number(min) || 0;
        if (n <= 0) return '00 min';
        if (n < 10) return `${n.toFixed(1)} min`;
        return `${Math.round(n)} min`;
    }

    function _laserEstimateMinutes(spec) {
        const ct = Number(spec && spec.ct) || 0;
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
        const autoManaged = endEl.dataset.standardAuto === '1';
        if (forceFill || !endEl.value || autoManaged) {
            endEl.value = standardEnd;
            endEl.dataset.standardAuto = '1';
        }
        if (hintEl) hintEl.textContent = `표준 완료시간은 ${standardEnd} 입니다`;
    }

    function markEndTimeManual() {
        const endEl = document.getElementById('lwEndTime');
        if (endEl) endEl.dataset.standardAuto = '0';
    }

    function _updateLaserCycleEstimate(spec) {
        const detail = document.getElementById('lwLaserCycleDetail');
        if (!detail || !spec) return;
        const ct = Number(spec.ct) || 0;
        const cvt = Number(spec.cvt) || 0;
        const qtyInput = document.getElementById('lwQuantity');
        const qtyValue = qtyInput && String(qtyInput.value || '').trim() !== '' ? Number(qtyInput.value) : 0;
        const qty = qtyValue || _selectedLotQtyTotal();
        const packText = spec.packUnit ? ` / 포장단위 <strong>${_esc(spec.packUnit)}</strong>` : '';
        if (ct > 0 && cvt > 0) {
            const totalSec = (qty / cvt) * ct;
            detail.innerHTML = `제품 기초 레이져 공정 C.TIME <strong>${UIUtils.formatNumber(ct)} sec</strong> / CVT <strong>${UIUtils.formatNumber(cvt)}개</strong>${packText}<br>
                예상 작업 소요시간 <strong style="color:var(--accent-blue);">${_fmtLaserMinutes(totalSec / 60)}</strong>
                <span style="color:var(--text-muted);">(${UIUtils.formatNumber(qty)} / ${UIUtils.formatNumber(cvt)} × ${UIUtils.formatNumber(ct)} sec)</span>`;
            updateStandardEndTime(false);
            return;
        }
        detail.textContent = spec.ct || spec.cvt
            ? `제품 기초 레이져 공정 C.TIME ${spec.ct || '-'} sec / CVT ${spec.cvt || '-'}개${spec.packUnit ? ` / 포장단위 ${spec.packUnit}` : ''}`
            : (spec.foundProduct ? '제품기초 레이져공정 CT/CVT 미등록' : '제품기초 제품 매칭 실패');
        updateStandardEndTime(false);
    }

    function _refreshLaserCycleSpec(forceValue = false) {
        const spec = _getLaserCycleSpec(_selectedCarModel, _selectedPartName, _selectedColor);
        const label = document.getElementById('lwEngravingCycleLabel');
        const input = document.getElementById('lwEngravingTime');
        const sec = spec.cycleSec || '';
        if (label) label.textContent = `1cycle = ${sec || '00'} sec`;
        _updateLaserCycleEstimate(spec);
        if (input && (forceValue || !input.value) && sec) input.value = sec;
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

        const laserPaintWorks = paintingWorks.filter(w => {
            const prod = _findProductForWork(w.carModel, w.partName, w.color);
            return prod && _hasLaserProcess(prod);
        });

        // 도장 작업일 + 사출 LOT 단위로 레이저 처리 수량 집계
        const outByDate = {};
        const outByLot = {};
        laserWorks.forEach(lw => {
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
        return laserPaintWorks.map(w => {
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
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-work', '레이져 작업일지', '레이져 작업 실적, 설비별 가동 이력, 작업자와 초중종물 확인 기록을 관리합니다.')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserWorkModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 작업 등록
                        </button>
                    </div>
                </div>

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

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 레이져 작업 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table" style="min-width:1380px;table-layout:fixed;">
                                <thead>
                                    <tr>
                                        <th style="width:54px;">No</th>
                                        <th style="width:86px;">레이져작업일</th>
                                        <th style="width:110px;">장비</th>
                                        <th style="width:112px;">시간</th>
                                        <th style="width:96px;">차종</th>
                                        <th style="width:230px;">품명</th>
                                        <th style="width:82px;">컬러</th>
                                        <th style="width:132px;">프로그램</th>
                                        <th style="width:92px;">수량</th>
                                        <th style="width:96px;">도장작업일</th>
                                        <th style="width:120px;">사출LOT</th>
                                        <th style="width:132px;">품질확인</th>
                                        <th style="width:150px;">작업자</th>
                                        <th style="width:132px;">작업</th>
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
    }

    function search() {
        const start = document.getElementById('lwFilterStart').value;
        const end = document.getElementById('lwFilterEnd').value;
        const machine = document.getElementById('lwFilterMachine').value;

        let data = Storage.getByDateRange(STORE, start, end);
        if (machine) data = data.filter(d => d.machine === machine);
        data.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

        renderStats(data);
        renderTable(data);
    }

    function renderStats(data) {
        const total = data.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
        const inspections = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const inspectedIds = new Set(inspections.map(item => item.workLogId).filter(Boolean));
        const pendingWorks = data.filter(item => item.id && !inspectedIds.has(item.id));
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
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">기록이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((d, i) => `
            <tr>
                <td style="text-align:center;">${data.length - i}</td>
                <td style="white-space:nowrap;">${_workDateCell(d.date, d.startTime)}</td>
                <td style="white-space:nowrap;"><span class="badge badge-info" style="display:inline-flex;align-items:center;justify-content:center;min-width:72px;white-space:nowrap;">${d.machine || '-'}</span></td>
                <td style="font-size:0.8rem;white-space:nowrap;">${d.startTime || '-'} ~ ${d.endTime || '-'}</td>
                <td style="font-weight:600;white-space:nowrap;">${d.carModel || '-'}</td>
                <td style="min-width:0;">
                    <div style="font-weight:600;">${d.partName || '-'}</div>
                </td>
                <td style="white-space:nowrap;">${d.color || '-'}</td>
                <td style="font-size:0.8rem; color:var(--accent-blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.programName || '-'}</td>
                <td style="text-align:right; font-weight:700;">${UIUtils.formatNumber(d.quantity)}</td>
                <td style="white-space:nowrap;">${_paintDateCell(d)}</td>
                <td style="font-size:0.8rem; font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.paintLot || '-'}</td>
                <td>
                    <div style="display:flex; gap:4px; flex-wrap:nowrap; align-items:center; white-space:nowrap;">
                        ${d.qcFirst ? '<span class="badge badge-success">초</span>' : ''}
                        ${d.qcMiddle ? '<span class="badge badge-success">중</span>' : ''}
                        ${d.qcLast ? '<span class="badge badge-success">종</span>' : ''}
                        <span class="badge badge-outline" title="렌즈높이">${d.lensHeight || '-'}</span>
                    </div>
                </td>
                <td style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${[d.worker1, d.worker2, d.worker3].filter(Boolean).join(', ') || '-'}</td>
                <td style="white-space:nowrap;">
                    <div style="display:flex;gap:4px;align-items:center;justify-content:flex-start;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="LaserWorkModule.edit('${d.id}')">수정</button>
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
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;padding:7px 12px;border:1px solid rgba(59,130,246,0.18);border-radius:8px;background:rgba(59,130,246,0.04);">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;color:var(--text-primary);">
                    <input type="checkbox" id="lwManualToggle" ${manualChecked ? 'checked' : ''} onchange="LaserWorkModule.toggleManualSection()">
                    <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">edit_square</span>
                    수기 등록
                </label>
                <span style="font-size:0.75rem;color:var(--text-muted);">대기품에서 불러오거나 직접 입력</span>
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
                        <input type="number" class="form-input" id="lwQuantity" value="${d.quantity || ''}" placeholder="0" oninput="LaserWorkModule.calcCompletedQty()">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="form-group" style="margin:0;"><label class="form-label">도장LOT <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="lwManualPaintLot" value="${d.paintDate || ''}" placeholder="도장 LOT">
                    </div>
                    <div class="form-group" style="margin:0;"><label class="form-label">사출LOT <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="lwManualInjLot" value="${d.paintLot || ''}" placeholder="사출 LOT">
                    </div>
                </div>
            </div>
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
            </div>
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
                    <input type="date" class="form-input" id="lwDate" value="${d.date || UIUtils.today()}">
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
                    <input type="number" class="form-input" id="lwQuantity" value="${d.quantity || ''}" placeholder="0" oninput="LaserWorkModule.calcCompletedQty()">
                </div>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">각인 시간은 프로그램의 시간을 기록(sec) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="lwEngravingTime" value="${d.engravingTime || ''}" placeholder="0.0">
                    <div id="lwLaserCycleDetail" style="font-size:0.86rem;line-height:1.45;color:var(--text-muted);margin-top:5px;"></div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Program File Name <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lwProgramName" value="${d.programName || ''}" placeholder="프로그램 파일명">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">렌즈 높이 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lwLensHeight" value="${d.lensHeight || ''}" placeholder="예: 120mm">
                </div>
            </div>
            <div style="background:var(--bg-secondary); padding:10px 12px; border-radius:8px; margin-bottom:8px;">
                <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">checklist</span> 초중종물 확인 및 LOSS
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
                    ${(function(){
                        const firstDone  = !!(d.qcFirstQuality  && d.qcFirstPosition  && d.qcFirstPhoto);
                        const middleDone = !!(d.qcMiddleQuality && d.qcMiddlePosition && d.qcMiddlePhoto);
                        return [
                        ['lwQcFirst',  'lwQcFirstLoss',  '초품', 'First',  d.qcFirstLoss  ?? 0, d.qcFirstQuality,  d.qcFirstPosition,  d.qcFirstPhoto,  d.qcFirstPhotoUrl  || '', true       ],
                        ['lwQcMiddle', 'lwQcMiddleLoss', '중품', 'Middle', d.qcMiddleLoss ?? 0, d.qcMiddleQuality, d.qcMiddlePosition, d.qcMiddlePhoto, d.qcMiddlePhotoUrl || '', firstDone  ],
                        ['lwQcLast',   'lwQcLastLoss',   '종품', 'Last',   d.qcLastLoss   ?? 0, d.qcLastQuality,   d.qcLastPosition,   d.qcLastPhoto,   d.qcLastPhotoUrl   || '', middleDone ]
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
                ${_workerSelect('lwWorker1', '작업자 1', d.worker1 || '')}
                ${_workerSelect('lwWorker2', '작업자 2', d.worker2 || '')}
                ${_workerSelect('lwWorker3', '작업자 3', d.worker3 || '')}
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
        _selectedLots.push({ paintDate: paintDate || '', lotNo: lotNo || '', qty: Number(qty) || 0 });
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
        if (field === 'qty') _syncSelectedLotQty();
    }

    function previewStandbyQty(idx, lotIdx, value) {
        const w = _standbyItems[idx];
        if (!w) return;
        _selectedCarModel = w.carModel || '';
        _selectedPartName = w.partName || '';
        _selectedColor = w.color || '';
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
        container.innerHTML = _selectedLots.map((l, i) => `
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.75rem; color:var(--text-muted); min-width:18px; text-align:center; font-weight:600;">${i + 1}</span>
                <input type="date" class="form-input" value="${l.paintDate}"
                       style="flex:0 0 140px;"
                       onchange="LaserWorkModule.updateLot(${i}, 'paintDate', this.value)">
                <input type="text" class="form-input" value="${l.lotNo}"
                       placeholder="사출 LOT 번호"
                       style="flex:1;"
                       oninput="LaserWorkModule.updateLot(${i}, 'lotNo', this.value)">
                <input type="number" class="form-input" value="${l.qty || ''}"
                       placeholder="작업수량"
                       min="0"
                       style="flex:0 0 110px; text-align:right;"
                       oninput="LaserWorkModule.updateLot(${i}, 'qty', this.value)">
                <button type="button" class="btn btn-sm btn-danger" onclick="LaserWorkModule.removeLotRow(${i})"
                        style="padding:4px 8px; flex-shrink:0;">
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
    }

    // 품명 변경 → 결과 테이블 렌더링
    function onSbPartChange() {
        const car  = (document.getElementById('lwSbCar')  || {}).value || '';
        const part = (document.getElementById('lwSbPart') || {}).value || '';
        renderStandbyResults(car, part);
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

        el.innerHTML = `
            <div style="font-size:0.75rem; color:var(--accent-green); font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:0.9rem;">swap_vert</span>
                선입선출(FIFO) 순서 — 도장작업일 오래된 순으로 정렬됨
            </div>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--bg-primary);">
                        <th style="padding:5px 8px; text-align:center; font-size:0.78rem; border-bottom:1px solid var(--border-color);">순서</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">차종</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">품명</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">컬러</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">도장작업일</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">LOT잔량</th>
                        <th style="padding:5px 8px; text-align:left; font-size:0.78rem; border-bottom:1px solid var(--border-color);">사출LOT</th>
                        <th style="padding:5px 8px; text-align:right; font-size:0.78rem; border-bottom:1px solid var(--border-color);">작업수량</th>
                        <th style="padding:5px 8px; border-bottom:1px solid var(--border-color);"></th>
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
                            return `
                            <tr style="${rowBg}" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='${rowBg}'">
                                <td style="padding:5px 8px; text-align:center;">${lotIdx === 0 ? orderBadge : ''}</td>
                                <td style="padding:5px 8px;">${lotIdx === 0 ? (w.carModel || '-') : ''}</td>
                                <td style="padding:5px 8px; font-weight:600;">${lotIdx === 0 ? (w.partName || '-') : ''}</td>
                                <td style="padding:5px 8px;">${lotIdx === 0 ? (w.color || '-') : ''}</td>
                                <td style="padding:5px 8px; font-weight:${isFirst ? '700' : '400'}; color:${isFirst ? 'var(--accent-green)' : 'inherit'};">${lotIdx === 0 ? (w.date || '-') : ''}</td>
                                <td style="padding:5px 8px; text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(lot.qty || 0)}</td>
                                <td style="padding:5px 8px; font-family:monospace; font-size:0.8rem;">${lot.lotNo || '-'}</td>
                                <td style="padding:5px 8px;">
                                    <input id="${inputId}" type="number" class="form-input" min="1" max="${Number(lot.qty) || 0}" value="" placeholder="입력" style="height:30px;text-align:right;padding:4px 8px;"
                                           oninput="LaserWorkModule.previewStandbyQty(${globalIdx}, ${lotIdx}, this.value)">
                                </td>
                                <td style="padding:5px 8px;">
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

        // 도장 LOT 내부 배열에 추가
        _selectedLots.push({ paintDate: w.date || '', lotNo: lot.lotNo || w.lotNo || '', qty: pickQty });
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
        _refreshLaserCycleSpec(true);
    }

    function refreshLaserCycleSpec(forceValue = false) {
        const carEl = document.getElementById('lwCarModel');
        const partEl = document.getElementById('lwPartName');
        const colorEl = document.getElementById('lwColor');
        if (carEl) _selectedCarModel = carEl.value || '';
        if (partEl) _selectedPartName = partEl.value || '';
        if (colorEl) _selectedColor = colorEl.value || '';
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

    function checkQcProgress() {
        const firstDone  = _qcStageComplete('lwQcFirst');
        const middleDone = _qcStageComplete('lwQcMiddle');

        function setStageDoneVisual(prefix, done) {
            const icon = document.getElementById(prefix + 'DoneIcon');
            if (icon) icon.style.color = done ? 'var(--accent-blue)' : 'var(--text-muted)';
        }

        function setCardEnabled(prefix, enabled) {
            const card = document.getElementById(prefix + 'Card');
            if (!card) return;
            card.style.opacity = enabled ? '' : '0.4';
            card.style.pointerEvents = enabled ? '' : 'none';
            const sub = document.getElementById(prefix + 'SubItems');
            if (sub) sub.style.display = 'flex';
            const cb = document.getElementById(prefix);
            if (cb) cb.disabled = !enabled;
        }

        setCardEnabled('lwQcMiddle', firstDone);
        setCardEnabled('lwQcLast',   middleDone);
        setStageDoneVisual('lwQcFirst', firstDone);
        setStageDoneVisual('lwQcMiddle', middleDone);
        setStageDoneVisual('lwQcLast', _qcStageComplete('lwQcLast'));

        if (!firstDone) {
            ['lwQcMiddle', 'lwQcMiddleQuality', 'lwQcMiddlePosition', 'lwQcMiddlePhoto'].forEach(id => {
                const el = document.getElementById(id); if (el) el.checked = false;
            });
            setStageDoneVisual('lwQcMiddle', false);
        }
        if (!middleDone) {
            ['lwQcLast', 'lwQcLastQuality', 'lwQcLastPosition', 'lwQcLastPhoto'].forEach(id => {
                const el = document.getElementById(id); if (el) el.checked = false;
            });
            setStageDoneVisual('lwQcLast', false);
        }
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
        return {
            date: document.getElementById('lwDate').value,
            machine: document.getElementById('lwMachine').value,
            startTime: document.getElementById('lwStartTime').value,
            endTime: document.getElementById('lwEndTime').value,
            carModel: _selectedCarModel || (manualEnabled ? manualCarModel : ''),
            partName: _selectedPartName || (manualEnabled ? manualPartName : ''),
            color: _selectedColor || (manualEnabled ? manualColor : ''),
            paintDate: mergedLots.length > 0 ? (mergedLots[0].paintDate || '') : '',
            paintLots: mergedLots.map(l => ({ paintDate: l.paintDate, lotNo: l.lotNo, qty: Number(l.qty) || 0 })),
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
            completedQty: Math.max(0, _workQty - _totalLoss),
            worker1: document.getElementById('lwWorker1').value.trim(),
            worker2: document.getElementById('lwWorker2').value.trim(),
            worker3: document.getElementById('lwWorker3').value.trim()
        };
    }

    function validateWorkRequired(data) {
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
            if (!_inputValue('lwManualPaintLot')) add('도장 LOT', 'lwManualPaintLot');
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
        if (!(Number(data.engravingTime) > 0)) add('각인 시간', 'lwEngravingTime');
        if (!data.programName) add('Program File Name', 'lwProgramName');
        if (!data.lensHeight) add('렌즈 높이', 'lwLensHeight');

        [
            ['초품', 'lwQcFirst', data.qcFirstQuality, data.qcFirstPosition, data.qcFirstPhoto],
            ['중품', 'lwQcMiddle', data.qcMiddleQuality, data.qcMiddlePosition, data.qcMiddlePhoto],
            ['종품', 'lwQcLast', data.qcLastQuality, data.qcLastPosition, data.qcLastPhoto],
        ].forEach(([label, prefix, qual, pos, photo]) => {
            if (!qual) add(`${label} 각인품질 확인`, `${prefix}Quality`);
            if (!pos) add(`${label} 위치 도면확인`, `${prefix}Position`);
            if (!photo) add(`${label} 사진 등록`, `${prefix}PhotoFile`);
        });

        if (_inputValue('lwQcFirstLoss') === '') add('초품 LOSS', 'lwQcFirstLoss');
        if (_inputValue('lwQcMiddleLoss') === '') add('중품 LOSS', 'lwQcMiddleLoss');
        if (_inputValue('lwQcLastLoss') === '') add('종품 LOSS', 'lwQcLastLoss');

        if (!data.worker1) add('작업자 1', 'lwWorker1');
        if (!data.worker2) add('작업자 2', 'lwWorker2');
        if (!data.worker3) add('작업자 3', 'lwWorker3');

        if (missing.length) {
            UIUtils.toast(`필수 입력 항목을 확인하세요: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` 외 ${missing.length - 6}개` : ''}`, 'warning');
            _focusInput(focusId);
            return false;
        }
        return true;
    }

    function openAddModal(prefill) {
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
                        qty: Number(lot.qty) || 0
                    };
                });
            } else if (p.paintDate || p.paintLot || p.lotNo) {
                _selectedLots = [{
                    paintDate: p.paintDate || p.date || '',
                    lotNo: p.paintLot || p.lotNo || '',
                    qty: Number(p.quantity) || Number(p.productionQty) || 0
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
        setTimeout(() => _refreshLaserCycleSpec(false), 0);
        setTimeout(calcCompletedQty, 0);
        setTimeout(checkQcProgress, 0);
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
        if (!validateWorkRequired(data)) return;
        if (_selectedLots.length > 0) {
            const lotQty = _selectedLotQtyTotal();
            if (lotQty <= 0) {
                UIUtils.toast('선택한 LOT의 작업수량을 입력하세요.', 'warning');
                return;
            }
            if (Math.abs(lotQty - Number(data.quantity || 0)) > 0.001) {
                UIUtils.toast(`LOT 작업수량 합계(${UIUtils.formatNumber(lotQty)}EA)와 작업수량(${UIUtils.formatNumber(data.quantity)}EA)이 일치하지 않습니다.`, 'warning');
                return;
            }
        }

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
        UIUtils.toast('등록되었습니다.', 'success');
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
            _selectedLots = d.paintLots.map(l => ({ paintDate: l.paintDate || '', lotNo: l.lotNo || '', qty: Number(l.qty) || 0 }));
        } else if (d.paintDate || d.paintLot) {
            _selectedLots = [{ paintDate: d.paintDate || '', lotNo: d.paintLot || '', qty: Number(d.quantity) || 0 }];
        } else {
            _selectedLots = [];
        }
        UIUtils.showModal('레이져 작업 수정', buildFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWorkModule.saveEdit('${id}')">저장</button>
        `, 'lg');
        setTimeout(renderLotRows, 0);
    }

    async function saveEdit(id) {
        const data = collectData();
        if (!validateWorkRequired(data)) return;
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('해당 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        const headers = ['레이져작업일', '장비', '시작', '종료', '차종', '품명', '컬러', '도장작업일', '각인시간', '수량', '사출LOT', '프로그램', '렌즈높이', '초품', '중품', '종품', '작업자1', '작업자2', '작업자3'];
        const rows = data.map(d => [
            d.date, d.machine, d.startTime, d.endTime, d.carModel, d.partName, d.color, d.paintDate || '',
            d.engravingTime, d.quantity, d.paintLot, d.programName, d.lensHeight,
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
        updateStandardEndTime,
        markEndTimeManual,
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
        remove,
        exportData
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
    function getUninspectedWorks() {
        const works = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const inspectedIds = getInspectedWorkIds();
        return works
            .filter(w => w.id && !inspectedIds.has(w.id))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function render(container) {
        if (_currentView === 'standard') {
            renderNonconformStandardPage(container);
            return;
        }
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-inspection', '외관 검사 일지', '레이져 작업 완료품의 외관 검사 결과와 불량 유형, 검사 대기 현황을 관리합니다.')}

                <div class="page-header" style="margin:-6px 0 14px;">
                    <div class="page-actions" style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
                        <button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.showInspectionPage()">
                            <span class="material-symbols-outlined" style="font-size:15px;">checklist</span> 검사일지
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="LaserInspectionModule.showNonconformStandardPage()">
                            <span class="material-symbols-outlined" style="font-size:15px;">description</span> 부적합 처리 기준서
                        </button>
                    </div>
                </div>

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
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-primary" onclick="LaserInspectionModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 수동 검사 등록
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="liStats"></div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">assignment</span> 검사 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table" style="min-width:1420px;table-layout:fixed;">
                                <thead>
                                    <tr>
                                        <th style="width:90px;">검사일</th>
                                        <th style="width:90px;">레이져 작업일</th>
                                        <th style="width:80px;">차종</th>
                                        <th style="width:150px;">품명</th>
                                        <th style="width:100px;">도장LOT</th>
                                        <th style="width:140px;">사출LOT</th>
                                        <th style="width:80px;text-align:right;">검사수량</th>
                                        <th style="width:70px;">양품</th>
                                        <th style="width:70px;">불량<br><small style="font-weight:400;">(계)</small></th>
                                        <th style="width:70px;">불량률</th>
                                        <th style="width:76px;text-align:center;">사출불량</th>
                                        <th style="width:76px;text-align:center;">도장불량</th>
                                        <th style="width:80px;text-align:center;">레이져불량</th>
                                        <th style="width:100px;">비고</th>
                                        <th style="width:108px;">작업</th>
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

        body.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table" style="min-width:1080px;table-layout:fixed;">
                    <thead>
                        <tr>
                            <th style="width:100px;">레이져 작업일</th>
                            <th style="width:92px;">장비</th>
                            <th style="width:90px;">차종</th>
                            <th style="width:160px;">품명</th>
                            <th style="width:72px;">컬러</th>
                            <th style="width:96px;text-align:right;">작업수량</th>
                            <th style="width:120px;">도장LOT</th>
                            <th style="width:160px;">사출LOT</th>
                            <th style="width:120px;"></th>
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
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="LaserInspectionModule.openInspFromWork('${w.id}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_task</span> 검사 등록
                                    </button>
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
        data.sort((a, b) => b.date.localeCompare(a.date));
        renderStats(data);
        renderTable(data);
    }

    async function renderNonconformStandardPage(container) {
        _nonconformStandardImage = await _loadNonconformStandardImage();
        const canUpload = _canUploadNonconformStandard();
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-inspection-standard', '부적합 처리 기준서', '기준서 업로드 및 인쇄')}
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
            tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:30px;color:var(--text-muted);">검사 기록이 없습니다.</td></tr>`;
            return;
        }
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
            // 검사일과 레이져 작업일이 동일한 경우 레이져 작업일 표시 억제
            const sameDate = lotInfo.laserDate && d.date && lotInfo.laserDate.slice(0,10) === d.date.slice(0,10);
            return `
                <tr style="cursor:pointer;" onclick="LaserInspectionModule._showDetail('${d.id}', event)">
                    <td>${_dateStack(d.date, d.inspectionStartTime)}</td>
                    <td>${sameDate ? '<span style="color:var(--text-muted);font-size:0.75rem;">동일</span>' : _dateStack(lotInfo.laserDate, lotInfo.laserTime)}</td>
                    <td style="white-space:nowrap;font-size:0.82rem;">${d.carModel || '-'}</td>
                    <td style="font-weight:600;">${d.partName || '-'}</td>
                    <td>${_dateListHtml(lotInfo.paintDates)}</td>
                    <td>${_lotListHtml(lotInfo.injectionLots)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.inspQty)}</td>
                    <td style="text-align:right; color:var(--accent-green); font-weight:600;">${UIUtils.formatNumber(d.goodQty)}</td>
                    <td style="text-align:right; color:var(--accent-red); font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
                    <td style="text-align:center; font-weight:700;">${(Number(d.failRate) || 0).toFixed(1)}%</td>
                    <td style="text-align:center;">${injBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(injBad)}</span>` : '-'}</td>
                    <td style="text-align:center;">${paintBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(paintBad)}</span>` : '-'}</td>
                    <td style="text-align:center;">${laserBad > 0 ? `<span style="color:var(--accent-red);">${UIUtils.formatNumber(laserBad)}</span>` : '-'}</td>
                    <td style="font-size:0.8rem;">${d.note || '-'}</td>
                    <td style="white-space:nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-outline" onclick="LaserInspectionModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserInspectionModule.remove('${d.id}')">삭제</button>
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
            <div style="text-align:right;margin-bottom:${hasDefect ? '10px' : '0'};">
                <span style="font-size:0.78rem;color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700;font-size:0.98rem;color:${parseFloat(failRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${failRate}%</span>
            </div>

            <!-- 불량 상세 -->
            ${hasDefect ? `
            <div style="border-top:1px solid var(--border);padding-top:10px;">
                ${defectGroupHtml('사출 불량', '#ea580c', injDefects)}
                ${defectGroupHtml('도장 불량', '#16a34a', paintDefects)}
                ${defectGroupHtml('레이져 불량', '#ef4444', laserDefects)}
            </div>` : `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:2px 0;border-top:1px solid var(--border);padding-top:8px;">불량 내역 없음</div>`}

            ${d.note ? `
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:0.78rem;color:var(--text-muted);">
                비고: <span style="color:var(--text-primary);">${d.note}</span>
            </div>` : ''}
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
            <div id="liCustomModalInner" style="background:white;border-radius:12px;max-width:63vw;width:63vw;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="margin:0;font-size:1.25rem;">${title}</h2>
                    <button onclick="LaserInspectionModule._closeModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-muted);">✕</button>
                </div>
                <div style="display:grid;gap:16px;">${content}</div>
            </div>`;
        document.body.appendChild(modalEl);
    }

    function _closeModal() {
        const el = document.getElementById('liCustomModal');
        if (el) el.remove();
        _closeNumericPad();
    }

    function _buildWorkInfoCard(work) {
        const lotInfo = _lotInfo(work);
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 10px 0;color:var(--text-primary);">레이져 정보</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px 16px;background:var(--bg-secondary);border-radius:8px;padding:14px;">
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">레이져 작업일</div>
                    <div>${_dateStack(work.date, work.startTime)}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">장비</div>
                    <div style="font-size:0.9rem;">${work.machine||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">차종</div>
                    <div style="font-weight:600;font-size:0.9rem;">${work.carModel||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">품명</div>
                    <div style="font-weight:600;font-size:0.9rem;">${work.partName||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">컬러</div>
                    <div style="font-size:0.9rem;">${work.color||'-'}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">도장 LOT</div>
                    <div>${_dateListHtml(lotInfo.paintDates)}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">사출 LOT</div>
                    <div>${_lotListHtml(lotInfo.injectionLots)}</div>
                </div>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px;">레이져 작업 수량</div>
                    <div style="font-weight:700;font-size:1rem;color:var(--accent-blue);">
                        ${UIUtils.formatNumber(work.quantity||0)} EA
                        <input type="hidden" id="liInspQty" value="${work.quantity||0}">
                    </div>
                </div>
            </div>
        </div></div>`;
    }

    function _buildSelectCard(d = {}) {
        const products  = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 대상</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
                <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="liCarModel" onchange="LaserInspectionModule.onCarModelChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(c=>`<option value="${c}" ${d.carModel===c?'selected':''}>${c}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="liPartName"><option value="">-- 품명 선택 --</option></select></div>
                <div class="form-group"><label class="form-label">검사수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="liInspQty" value="${d.inspQty||''}"
                        onchange="LaserInspectionModule._updateDefectTotal()" placeholder="0"></div>
            </div>
        </div></div>`;
    }

    function _buildInspInfoCard(d = {}, workRef = null) {
        const defaultStart = d.inspectionStartTime || (workRef ? workRef.startTime || '' : '');
        const defaultEnd   = d.inspectionEndTime   || (workRef ? workRef.endTime   || '' : '');
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 정보</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
                <div class="form-group"><label class="form-label">검사일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="liDate" value="${d.date||UIUtils.today()}" style="font-weight:600;"></div>
                <div class="form-group"><label class="form-label">검사 시작시간</label>
                    <input type="time" class="form-input" id="liStartTime" value="${defaultStart}" style="font-weight:600;"
                        oninput="LaserInspectionModule._calculateInspectionTime()"
                        onchange="LaserInspectionModule._calculateInspectionTime()"></div>
                <div class="form-group"><label class="form-label">검사 완료시간</label>
                    <input type="time" class="form-input" id="liEndTime" value="${defaultEnd}" style="font-weight:600;"
                        oninput="LaserInspectionModule._calculateInspectionTime()"
                        onchange="LaserInspectionModule._calculateInspectionTime()"></div>
                <div class="form-group"><label class="form-label">소요시간</label>
                    <input type="text" class="form-input" id="liDuration" placeholder="자동계산" readonly style="background:var(--bg-secondary);font-weight:600;"></div>
            </div>
        </div></div>`;
    }

    function _buildDefectCard(dd = {}) {
        const allDefects   = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const injDefects   = allDefects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = allDefects.filter(d => d.type === 'painting');
        const laserDefects = allDefects.filter(d => d.type === 'laser');

        const section = (label, color, icon, prefix, defects) => {
            if (!defects.length) return '';
            return `
            <div style="margin-bottom:16px;">
                <h5 style="margin:0 0 10px 0;color:${color};border-bottom:2px solid ${color};padding-bottom:5px;font-size:0.9rem;">
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">${icon}</span> ${label}
                </h5>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;">
                    ${defects.map(d => `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <label style="font-size:0.9rem;font-weight:600;margin:0;">${d.name}</label>
                            <input type="text" inputmode="numeric" id="${prefix}${d.id}" data-defect-name="${d.name}"
                                value="${dd[d.name]||0}" min="0"
                                style="padding:8px;border:1px solid var(--border-color);border-radius:4px;text-align:center;font-weight:600;font-size:0.95rem;cursor:pointer;background:white;"
                                onfocus="if(this.value==='0')this.value=''"
                                onclick="LaserInspectionModule._showNumericPad(this)"
                                onkeydown="if(!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(event.key)){event.preventDefault();}"
                                oninput="LaserInspectionModule._updateDefectTotal()">
                        </div>`).join('')}
                </div>
            </div>`;
        };

        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">불량 유형 입력</h4>
            ${section('사출 불량','#ea580c','precision_manufacturing','linj-',injDefects)}
            ${section('도장 불량','#16a34a','format_paint','lpaint-',paintDefects)}
            ${section('레이져 불량','#ef4444','crisis_alert','llaser-',laserDefects)}
        </div></div>`;
    }

    function _buildResultCard(d = {}, autoInspQty = 0) {
        const failQty = d.failQty || 0;
        const goodQty = d.goodQty !== undefined ? d.goodQty : Math.max(0, autoInspQty - failQty);
        return `
        <div class="card"><div class="card-body">
            <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 결과</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">양품수</label>
                    <input type="number" class="form-input" id="liGoodQty" value="${goodQty}" min="0"
                        style="text-align:right;font-weight:600;" onchange="LaserInspectionModule._updateDefectQty()"></div>
                <div class="form-group"><label class="form-label">불량수</label>
                    <input type="number" class="form-input" id="liDefectQty" value="${failQty}" min="0"
                        style="text-align:right;font-weight:600;" onchange="LaserInspectionModule._updateGoodQty()"></div>
                <div class="form-group"><label class="form-label">합계 (자동)</label>
                    <input type="text" class="form-input" id="liTotalQty" value="${goodQty+failQty}" readonly
                        style="background:var(--bg-secondary);text-align:right;font-weight:600;"></div>
            </div>
            <div class="form-group" style="margin-top:12px;"><label class="form-label">비고</label>
                <textarea class="form-textarea" id="liNote" style="height:50px;">${d.note||''}</textarea>
            </div>
        </div></div>`;
    }

    function _btnSection(saveAction) {
        return `
        <div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid var(--border-color);">
            <button class="btn btn-primary" onclick="${saveAction}">
                <span class="material-symbols-outlined">save</span> 저장</button>
            <button class="btn btn-outline" onclick="LaserInspectionModule._closeModal()">
                <span class="material-symbols-outlined">close</span> 취소</button>
        </div>`;
    }

    // (buildFormHTML은 하위호환용으로 _buildSelectCard 위임)
    function buildFormHTML(d = {}) { return _buildSelectCard(d) + _buildInspInfoCard(d) + _buildDefectCard(d.defectDetails||{}) + _buildResultCard(d); }

    // ─ 모달 열기 ─────────────────────────────────────────────────────
    function openAddModal() {
        _liCarModel = ''; _liPartName = ''; _liColor = ''; _liWorkId = null;
        _openModal('레이져 검사 등록',
            _buildSelectCard() + _buildInspInfoCard() + _buildDefectCard() + _buildResultCard() +
            _btnSection('LaserInspectionModule._saveInspection()'));
    }

    function openInspFromWork(workId) {
        const w = Storage.getById(DB.STORES.LASER_WORK_LOG, workId);
        if (!w) { UIUtils.toast('작업 정보를 찾을 수 없습니다.', 'error'); return; }
        _liCarModel = w.carModel || ''; _liPartName = w.partName || '';
        _liColor    = w.color    || ''; _liWorkId   = w.id;
        _openModal(`레이져 검사 등록 — ${w.partName || ''}`,
            _buildWorkInfoCard(w) + _buildInspInfoCard({}, w) + _buildDefectCard() +
            _buildResultCard({}, w.quantity || 0) +
            _btnSection('LaserInspectionModule._saveInspection()'));
        setTimeout(_calculateInspectionTime, 0);
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        _liCarModel = d.carModel || ''; _liPartName = d.partName || '';
        _liColor    = d.color    || ''; _liWorkId   = d.workLogId || null;
        const workRef = d.workLogId ? Storage.getById(DB.STORES.LASER_WORK_LOG, d.workLogId) : null;
        _openModal('레이져 검사 수정',
            (workRef ? _buildWorkInfoCard(workRef) : _buildSelectCard(d)) +
            _buildInspInfoCard(d) + _buildDefectCard(d.defectDetails || {}) + _buildResultCard(d) +
            _btnSection(`LaserInspectionModule._saveInspection('${id}')`));
        if (!workRef) setTimeout(() => onCarModelChange(d.partName), 50);
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

            const _lotInfo = _lotInfo(_workRef || data);
            const _paintingDate = _lotInfo.paintDates.join(', ');
            const _lotNo = _lotInfo.injectionLots.join(', ');
            const _laserLot = _lotInfo.laserDate || data.date || '';

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
                laserWorkDate: _lotInfo.laserDate || '',
                inspectionQty: data.goodQty || data.inspQty || 0,
                goodQty      : data.goodQty || 0,
                customer     : _prod ? (_prod.customer || '') : '',
                status       : '대기'
            });
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
            note               : document.getElementById('liNote')?.value?.trim() || ''
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

    // ─ 숫자 키패드 ───────────────────────────────────────────────────
    function _showNumericPad(inputEl) {
        _closeNumericPad();
        const pad = document.createElement('div');
        pad.id = 'liNumericPad';
        pad.style.cssText = 'position:fixed;z-index:99999;background:white;border-radius:16px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25);width:220px;';
        pad.innerHTML = `
            <div style="text-align:center;margin-bottom:10px;font-size:0.85rem;color:var(--text-muted);font-weight:600;">
                ${inputEl.previousElementSibling?.textContent||'입력'}
            </div>
            <div id="liNumpadDisplay" style="text-align:center;font-size:2rem;font-weight:700;color:var(--accent-blue);background:var(--bg-secondary);border-radius:8px;padding:10px;margin-bottom:12px;min-height:56px;">${inputEl.value||'0'}</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${[7,8,9,4,5,6,1,2,3].map(n=>`<button onclick="LaserInspectionModule._numpadInput('${n}')" style="padding:14px;font-size:1.2rem;font-weight:600;border:1px solid var(--border-color);border-radius:8px;background:white;cursor:pointer;">${n}</button>`).join('')}
                <button onclick="LaserInspectionModule._numpadDelete()" style="padding:14px;font-size:1.2rem;border:1px solid var(--border-color);border-radius:8px;background:#fff3f3;cursor:pointer;">⌫</button>
                <button onclick="LaserInspectionModule._numpadInput('0')" style="padding:14px;font-size:1.2rem;font-weight:600;border:1px solid var(--border-color);border-radius:8px;background:white;cursor:pointer;">0</button>
                <button onclick="LaserInspectionModule._numpadConfirm()" style="padding:14px;font-size:1rem;font-weight:700;border:none;border-radius:8px;background:var(--accent-blue);color:white;cursor:pointer;">완료</button>
            </div>`;
        const rect = inputEl.getBoundingClientRect();
        let top = rect.bottom + 8, left = rect.left;
        if (left + 220 > window.innerWidth)  left = window.innerWidth - 228;
        if (top  + 340 > window.innerHeight) top  = rect.top - 348;
        pad.style.top = top + 'px'; pad.style.left = left + 'px';
        document.body.appendChild(pad);
        pad._targetInput = inputEl;
        inputEl._liPadHandler = () => {
            let raw = inputEl.value.replace(/[^0-9]/g,'').substring(0,5);
            if (inputEl.value !== raw) inputEl.value = raw;
            const dp = document.getElementById('liNumpadDisplay');
            if (dp) dp.textContent = raw||'0';
            _updateDefectTotal();
        };
        inputEl.addEventListener('input', inputEl._liPadHandler);
        setTimeout(() => document.addEventListener('click', _numpadOutsideClick), 100);
    }

    function _numpadOutsideClick(e) {
        const pad = document.getElementById('liNumericPad');
        if (!pad) { document.removeEventListener('click',_numpadOutsideClick); return; }
        if (pad.contains(e.target)) return;
        _closeNumericPad();
    }

    function _closeNumericPad() {
        const pad = document.getElementById('liNumericPad');
        if (!pad) return;
        if (pad._targetInput?._liPadHandler) {
            pad._targetInput.removeEventListener('input', pad._targetInput._liPadHandler);
            delete pad._targetInput._liPadHandler;
        }
        pad.remove();
        document.removeEventListener('click', _numpadOutsideClick);
    }

    function _numpadInput(d) {
        const dp = document.getElementById('liNumpadDisplay');
        if (!dp) return;
        let v = dp.textContent === '0' ? d : dp.textContent + d;
        if (v.length <= 5) dp.textContent = v;
    }

    function _numpadDelete() {
        const dp = document.getElementById('liNumpadDisplay');
        if (dp) dp.textContent = dp.textContent.length <= 1 ? '0' : dp.textContent.slice(0,-1);
    }

    function _numpadConfirm() {
        const pad = document.getElementById('liNumericPad');
        if (!pad) return;
        const val = document.getElementById('liNumpadDisplay')?.textContent || '0';
        if (pad._targetInput) { pad._targetInput.value = parseInt(val)||0; _updateDefectTotal(); }
        _closeNumericPad();
    }

    function remove(id) {
        UIUtils.confirm('해당 검사 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderStandby();
            search();
        });
    }

    return {
        render, openAddModal, openInspFromWork, search, renderStandby, onCarModelChange, edit, remove,
        _closeModal, _saveInspection, _showDetail,
        showNonconformStandardPage, showInspectionPage,
        focusNonconformStandardPasteZone, handleNonconformStandardPaste, printNonconformStandardPage,
        _updateDefectTotal, _updateDefectQty, _updateGoodQty, _calculateInspectionTime,
        _showNumericPad, _numpadInput, _numpadDelete, _numpadConfirm
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
        renderAll();
        _ensureManualOverridesLoaded().then(renderAll).catch(() => {});
        _ensureManualOverridesLoaded().then(renderAll).catch(() => {});
    }

    // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
    function findProduct(products, w) {
        return products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
            || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
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

    function _hasLaserProcess(prod) {
        if (!prod) return false;
        return [prod.process1, prod.process2, prod.process3, prod.process4]
            .map(_normalizeFlowKey)
            .some(v => v === '레이저' || v === '레이져');
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
        const inventoryMap = {};

        const laserPaintWorks = paintingWorks.filter(w => {
            const prod = findProduct(products, w);
            if (!prod) return false;
            return _hasLaserAfterPaintFlow(prod);
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

        laserWorks.forEach(w => {
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

        _manualOverrides.forEach(override => {
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
            .sort((a, b) => a.carModel.localeCompare(b.carModel) || a.partName.localeCompare(b.partName));
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

    function renderAll() {
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

    function renderInventoryBlocks(items) {
        const el = document.getElementById('lsbInventory');
        if (!el) return;

        if (items.length === 0) {
            el.innerHTML = `
                <div style="text-align:center;padding:40px;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                    현재 레이져 공정 대기 재공품이 없습니다.
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
                    .sort((a, b) => a.partName.localeCompare(b.partName, 'ko') || a.color.localeCompare(b.color))
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
                            <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;border-bottom:1px solid var(--border-color);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                ${item.partName}
                            </td>
                            <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">
                                ${item.color && item.color !== '-' ? item.color : ''}
                            </td>
                            <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                                <span style="font-size:0.9rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;">
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
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근입고</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            });

        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${cards.join('')}</div>`;
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


    async function _showItemDetail(keyEnc, event) {
        event.stopPropagation();

        const key = decodeURIComponent(keyEnc);
        const [carModel, partName, color] = key.split('||');

        // 팝업 위치 계산
        const rect = event.currentTarget.getBoundingClientRect();
        const existingPop = document.getElementById('lsbDetailPopup');
        if (existingPop) existingPop.remove();

        // 데이터 수집
        const paintingWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const laserWorks = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];

        const inRecords = [];
        const outRecords = [];

        // 입고: 도장 완료 → 레이져 대기 (레이져 작업일지 기반)
        paintingWorks.forEach(w => {
            if (w.carModel !== carModel || w.partName !== partName || (w.color || '') !== (color || '')) return;
            const prod = products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
                || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
            if (!prod || (prod.process2 || '').trim() !== '레이저') return;
            const qty = Number(w.productionQty) || 0;
            if (qty <= 0) return;
            const injLots = w.lots && w.lots.length > 0
                ? [...new Set(w.lots.map(l => l.lotNo).filter(Boolean))].join(', ')
                : (w.lotNo || '');
            inRecords.push({
                date: w.date || '',
                qty,
                injLotNo: injLots || '-',
                paintLot: w.date || '-',
                note: w.line || ''
            });
        });

        // 출고: 레이져 검사 완료 → 출하 대기
        laserWorks.forEach(w => {
            if (w.carModel !== carModel || w.partName !== partName || (w.color || '') !== (color || '')) return;
            const qty = Number(w.quantity) || 0;
            if (qty <= 0) return;
            const injLots = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.lotNo).filter(Boolean))].join(', ')
                : (w.paintLot || '');
            const paintDates = w.paintLots && w.paintLots.length > 0
                ? [...new Set(w.paintLots.map(l => l.paintDate).filter(Boolean))].join(', ')
                : (w.paintDate || '');
            outRecords.push({
                date: w.date || '',
                qty,
                injLotNo: injLots || '-',
                paintLot: paintDates || '-',
                note: w.machine || ''
            });
        });

        const totalIn = inRecords.reduce((s, r) => s + r.qty, 0);
        const totalOut = outRecords.reduce((s, r) => s + r.qty, 0);
        const stock = totalIn - totalOut;
        const stockColor = stock >= 100 ? 'var(--accent-blue)' : stock >= 30 ? 'var(--accent-green)' : 'var(--accent-orange)';

        // 모든 기록 합쳐 날짜순 정렬
        const allRows = [
            ...inRecords.map(r => ({ kind: 'in', ...r })),
            ...outRecords.map(r => ({ kind: 'out', ...r }))
        ].sort((a, b) => b.date.localeCompare(a.date));

        const rowsHtml = allRows.length === 0
            ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:12px;font-size:0.82rem;">내역이 없습니다.</td></tr>`
            : allRows.map(r => `
                <tr style="border-left:3px solid ${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                    <td style="padding:5px 8px;font-size:0.8rem;">
                        ${r.kind === 'in'
                            ? `<span style="background:var(--accent-green);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">입고</span>`
                            : `<span style="background:var(--accent-blue);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">출고</span>`}
                    </td>
                    <td style="padding:5px 8px;font-size:0.8rem;white-space:nowrap;">${r.date || '-'}</td>
                    <td style="padding:5px 8px;text-align:right;font-size:0.85rem;font-weight:700;
                               color:${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                        ${r.kind === 'in' ? '+' : '-'}${UIUtils.formatNumber(r.qty)}
                    </td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.kind === 'in' ? (r.lotNo || '') : (r.note || '')}</td>
                </tr>`).join('');

        const popup = document.createElement('div');
        popup.id = 'lsbDetailPopup';
        popup.style.cssText = `
            position:fixed; z-index:9999; background:var(--bg-primary);
            border:1px solid var(--border-color); border-radius:10px;
            box-shadow:0 8px 32px rgba(0,0,0,0.18); min-width:320px; max-width:440px;
            max-height:70vh; overflow:hidden; display:flex; flex-direction:column;
        `;

        // 위치 조정
        const popW = 440, popH = 400;
        let top = rect.bottom + 6;
        let left = rect.left;
        if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
        if (top + popH > window.innerHeight - 10) top = rect.top - popH - 6;
        popup.style.top = top + 'px';
        popup.style.left = left + 'px';

        popup.innerHTML = `
            <div style="background:var(--accent-blue);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0;">
                <div>
                    <div style="font-size:0.72rem;opacity:0.8;">${carModel}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${partName} <span style="font-size:0.8rem;font-weight:400;">${color && color !== '-' ? '/ ' + color : ''}</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;opacity:0.8;">현재 재공 재고</div>
                    <div style="font-size:1.3rem;font-weight:800;color:${stock >= 30 ? '#fff' : '#ffd966'};">${UIUtils.formatNumber(stock)} <span style="font-size:0.75rem;font-weight:400;">EA</span></div>
                </div>
            </div>
            <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;gap:20px;font-size:0.78rem;">
                <span>총 입고: <strong style="color:var(--accent-green);">${UIUtils.formatNumber(totalIn)} EA</strong></span>
                <span>총 출고: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(totalOut)} EA</strong></span>
                <span>내역 ${allRows.length}건</span>
            </div>
            <div style="overflow-y:auto;flex:1;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">구분</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">날짜</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">비고</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        document.body.appendChild(popup);

        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 0);
    }

    // 페이지 헤더 없이 내용만 렌더링 (통합 재공품 현황 탭에서 호출)
    function onAdjustCarChange(selectedPartName = '', selectedColor = '') {
        const carModelEl = document.getElementById('lsbAdjustCarModel');
        const partEl = document.getElementById('lsbAdjustPartName');
        const colorEl = document.getElementById('lsbAdjustColor');
        if (!carModelEl || !partEl || !colorEl) return;

        const carModel = carModelEl.value || '';
        const products = _getLaserTargetProducts();
        const partNames = [...new Set(products
            .filter(prod => !carModel || prod.carModel === carModel)
            .map(prod => prod.partName)
            .filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(name => `<option value="${name}" ${name === selectedPartName ? 'selected' : ''}>${name}</option>`).join('');

        onAdjustPartChange(selectedColor);
    }

    function onAdjustPartChange(selectedColor = '') {
        const carModel = document.getElementById('lsbAdjustCarModel')?.value || '';
        const partName = document.getElementById('lsbAdjustPartName')?.value || '';
        const colorEl = document.getElementById('lsbAdjustColor');
        if (!colorEl) return;

        const products = _getLaserTargetProducts();
        const colors = [...new Set(products
            .filter(prod => (!carModel || prod.carModel === carModel) && (!partName || prod.partName === partName))
            .map(prod => prod.color || '')
            .filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

        colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(color => `<option value="${color}" ${color === selectedColor ? 'selected' : ''}>${color || '-'}</option>`).join('');
    }

    async function openAdjustModal(keyEnc = '', isAddMode = false) {
        await _ensureManualOverridesLoaded();

        const key = keyEnc ? decodeURIComponent(keyEnc) : '';
        const addMode = isAddMode || !key;
        const snapshot = key ? _getDetailSnapshot(key) : { item: null, stock: 0 };
        const item = snapshot.item;
        const override = key ? _getOverrideByKey(key) : null;
        const [carModel = '', partName = '', color = ''] = key ? key.split('||') : ['', '', ''];
        const currentStock = item ? snapshot.stock : 0;
        const products = _getLaserTargetProducts();
        const carModels = [...new Set(products.map(prod => prod.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const latestInRecord = item && (item.inRecords || []).length > 0
            ? [...item.inRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
            : null;
        const parsedLot = _parseManualLotPair(latestInRecord?.lotNo || '');
        const initialPaintLot = (override?.paintLot || (latestInRecord && latestInRecord.note === '수기조정' ? parsedLot.paintLot : '') || '').trim();
        const initialInjectionLot = (override?.injectionLot || parsedLot.injectionLot || '').trim();

        UIUtils.showModal(addMode ? '레이저 대기 재공품 추가' : '레이저 대기 재공 수량 조정', `
            <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    현재 전산 재고 <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(currentStock)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lsbAdjustCarModel" onchange="LaserStandbyModule.onAdjustCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(name => `<option value="${name}" ${name === (override?.carModel || carModel) ? 'selected' : ''}>${name}</option>`).join('')}
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
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${addMode ? '추가 수량' : '수량'}</label>
                    <input type="number" class="form-input" id="lsbAdjustQty" value="${override ? _normalizeQty(override.actualQty) : currentStock}" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 LOT - ${addMode ? '필수' : '임의입력'}</label>
                    <input type="text" class="form-input" id="lsbAdjustPaintLot" value="${initialPaintLot}" placeholder="도장 LOT 입력">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 LOT - ${addMode ? '필수' : '임의입력'}</label>
                    <input type="text" class="form-input" id="lsbAdjustInjectionLot" value="${initialInjectionLot}" placeholder="사출 LOT 입력">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserStandbyModule.saveAdjustModal('${encodeURIComponent(key)}', ${addMode ? 'true' : 'false'})">${addMode ? '등록' : '저장'}</button>
        `, 'lg');

        setTimeout(() => {
            onAdjustCarChange(override?.partName || partName, override?.color || color);
        }, 0);
    }

    async function saveAdjustModal(keyEnc = '', isAddMode = false) {
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

        const nextKey = _itemKey(carModel, partName, color);
        const currentIndex = originalKey
            ? _manualOverrides.findIndex(item => _itemKey(item.carModel, item.partName, item.color) === originalKey)
            : -1;

        const nextRecord = {
            id: currentIndex >= 0 ? _manualOverrides[currentIndex].id : Storage.generateId(),
            carModel,
            partName,
            color,
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
                        `차종: ${carModel}`,
                        `품명: ${partName}`,
                        `컬러: ${color || '-'}`,
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
        renderAll();
    }

    async function refresh() {
        await _ensureManualOverridesLoaded(true);
        renderAll();
        UIUtils.toast('재고 현황을 새로고침했습니다.', 'info');
    }

    function openLayout() {
        Router.navigate('laser-layout');
    }

    async function _showItemDetail(keyEnc, event) {
        event.stopPropagation();

        const key = decodeURIComponent(keyEnc);
        const [carModel, partName, color] = key.split('||');
        const rect = event.currentTarget.getBoundingClientRect();
        const existingPop = document.getElementById('lsbDetailPopup');
        if (existingPop) existingPop.remove();

        const snapshot = _getDetailSnapshot(key);
        const totalIn = snapshot.totalIn;
        const totalOut = snapshot.totalOut;
        const stock = snapshot.stock;
        const allRows = snapshot.allRows;

        const rowsHtml = allRows.length === 0
            ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px;font-size:0.82rem;">내역이 없습니다.</td></tr>`
            : allRows.map(r => `
                <tr style="border-left:3px solid ${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                    <td style="padding:5px 8px;font-size:0.8rem;">
                        ${r.kind === 'in'
                            ? `<span style="background:var(--accent-green);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">입고</span>`
                            : `<span style="background:var(--accent-blue);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.72rem;">출고</span>`}
                    </td>
                    <td style="padding:5px 8px;font-size:0.8rem;white-space:nowrap;">${r.date || '-'}</td>
                    <td style="padding:5px 8px;text-align:right;font-size:0.85rem;font-weight:700;color:${r.kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)'};">${r.kind === 'in' ? '+' : '-'}${UIUtils.formatNumber(r.qty)}</td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);font-family:monospace;">${r.injLotNo || r.lotNo || '-'}</td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);font-family:monospace;">${r.paintLot || '-'}</td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.note || r.machine || ''}</td>
                </tr>`).join('');

        const popup = document.createElement('div');
        popup.id = 'lsbDetailPopup';
        popup.style.cssText = `
            position:fixed; z-index:9999; background:var(--bg-primary);
            border:1px solid var(--border-color); border-radius:10px;
            box-shadow:0 8px 32px rgba(0,0,0,0.18); min-width:320px; max-width:640px;
            max-height:70vh; overflow:hidden; display:flex; flex-direction:column;
        `;

        const popW = 640, popH = 420;
        let top = rect.bottom + 6;
        let left = rect.left;
        if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
        if (top + popH > window.innerHeight - 10) top = rect.top - popH - 6;
        popup.style.top = top + 'px';
        popup.style.left = left + 'px';

        popup.innerHTML = `
            <div style="background:var(--accent-blue);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0;">
                <div>
                    <div style="font-size:0.72rem;opacity:0.8;">${carModel}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${partName} <span style="font-size:0.8rem;font-weight:400;">${color && color !== '-' ? '/ ' + color : ''}</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.7rem;opacity:0.8;">현재 재공 재고</div>
                    <div style="font-size:1.3rem;font-weight:800;color:${stock >= 30 ? '#fff' : '#ffd966'};">${UIUtils.formatNumber(stock)} <span style="font-size:0.75rem;font-weight:400;">EA</span></div>
                </div>
            </div>
            <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;gap:20px;font-size:0.78rem;align-items:center;">
                <span>총 입고: <strong style="color:var(--accent-green);">${UIUtils.formatNumber(totalIn)} EA</strong></span>
                <span>총 출고: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(totalOut)} EA</strong></span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span>내역 ${allRows.length}건</span>
                    <button type="button" class="btn btn-secondary" style="padding:2px 8px;font-size:0.72rem;height:24px;border-radius:6px;" onclick="event.stopPropagation(); LaserStandbyModule.openAdjustModal('${encodeURIComponent(key)}')">수정</button>
                </span>
            </div>
            <div style="overflow-y:auto;flex:1;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">구분</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border-color);">날짜</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:right;border-bottom:1px solid var(--border-color);">수량</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">사출LOT</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">도장LOT</th>
                            <th style="padding:5px 8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">비고</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        document.body.appendChild(popup);

        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 0);
    }

    // ── 레이져 대기품 출고 ──────────────────────────────────────────────
    async function openStandbyOutModal() {
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

    // ── 일괄 등록 (교체) ────────────────────────────────────────────────
    async function openBulkModal() {
        await _ensureManualOverridesLoaded();

        const products = _getLaserTargetProducts()
            .slice()
            .sort((a, b) => String(a.carModel || '').localeCompare(String(b.carModel || ''), 'ko') ||
                            String(a.partName  || '').localeCompare(String(b.partName  || ''), 'ko'));
        const { inventoryMap } = _buildInventorySnapshot();

        UIUtils.showModal('레이져 대기품 일괄 등록 (교체)', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;
                        padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);display:flex;align-items:flex-start;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:1rem;flex-shrink:0;">warning</span>
                <span>저장 시 기존 수기 등록 내역이 모두 초기화되고 입력한 수량으로 교체됩니다. 수량을 비워두면 해당 품목은 재고 0으로 초기화됩니다.</span>
            </div>
            <div style="max-height:420px;overflow-y:auto;border-radius:8px;border:1px solid var(--border-color);">
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                    <thead style="position:sticky;top:0;z-index:1;background:linear-gradient(180deg,#f1f5f9,#e8ecf1);">
                        <tr>
                            <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                            <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--text-muted);white-space:nowrap;">현재고</th>
                            <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--accent-blue);white-space:nowrap;">등록 수량</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => {
                            const key  = _itemKey(p.carModel, p.partName, p.color || '');
                            const item = inventoryMap[key];
                            const stock = item ? Math.max(0, item.inQty - item.outQty) : 0;
                            return `<tr style="border-bottom:1px solid var(--border-color);"
                                        onmouseover="this.style.background='rgba(66,133,244,0.04)'"
                                        onmouseout="this.style.background=''">
                                <td style="padding:6px 12px;font-weight:600;">${p.carModel || '-'}</td>
                                <td style="padding:6px 12px;">${p.partName || '-'}</td>
                                <td style="padding:6px 12px;">${p.color || '-'}</td>
                                <td style="padding:6px 12px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(stock)}</td>
                                <td style="padding:6px 12px;text-align:right;">
                                    <input type="number" class="form-input lsb-bulk-qty"
                                        data-car="${(p.carModel||'').replace(/"/g,'&quot;')}"
                                        data-part="${(p.partName||'').replace(/"/g,'&quot;')}"
                                        data-color="${(p.color||'').replace(/"/g,'&quot;')}"
                                        placeholder="${stock > 0 ? stock : '0'}"
                                        min="0"
                                        style="width:90px;text-align:right;padding:4px 8px;">
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);"
                onclick="LaserStandbyModule.saveBulkModal()">교체 등록</button>
        `, 'lg');
    }

    async function saveBulkModal() {
        await _ensureManualOverridesLoaded();

        const inputs = document.querySelectorAll('.lsb-bulk-qty');
        const now = new Date().toISOString();
        const newOverrides = [];

        inputs.forEach(input => {
            const val = input.value.trim();
            if (val === '') return;
            const qty = parseInt(val, 10);
            if (isNaN(qty) || qty < 0) return;
            const carModel = input.dataset.car  || '';
            const partName = input.dataset.part || '';
            const color    = input.dataset.color || '';
            if (!carModel || !partName) return;
            newOverrides.push({
                id: Storage.generateId(),
                carModel,
                partName,
                color,
                actualQty: qty,
                paintLot: '',
                injectionLot: '',
                manualType: 'bulk',
                updatedAt: now
            });
        });

        _manualOverrides = newOverrides;
        await _saveManualOverrides();

        UIUtils.closeModal();
        renderAll();
        UIUtils.toast(`일괄 등록 완료 — ${newOverrides.length}건 교체됨`, 'success');
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
        openBulkModal,
        saveBulkModal,
        deleteFlowRecord,
        _showItemDetail
    };
})();
