/**
 * 원자재 창고 (입출고 / 재고 현황) 모듈
 * 원자재의 입출고 내역을 KG 단위로 관리하고 현재 재고를 집계합니다.
 */

const RawMaterialInventoryModule = (function () {
    const STORE = DB.STORES.RAW_MATERIAL_INVENTORY;
    const MAT_STORE = DB.STORES.RAW_MATERIALS;

    // ── 재고 계산 헬퍼 ──────────────────────────────────────────────────
    function _calcStock() {
        const all = Storage.getAll(STORE) || [];
        const map = {};
        all.forEach(r => {
            const key = r.matId || r.matName;
            if (!map[key]) {
                map[key] = {
                    matId: r.matId,
                    matName: r.matName,
                    color: r.color,
                    supplier: r.supplier,
                    incoming: 0,
                    outgoing: 0
                };
            }
            if (r.type === '입고') map[key].incoming += Number(r.quantity) || 0;
            else map[key].outgoing += Number(r.quantity) || 0;
        });
        return Object.values(map).map(m => ({ ...m, balance: m.incoming - m.outgoing }));
    }

    // ── 현재 재고 섹션 토글 ─────────────────────────────────────────────
    function showCurrentStock() {
        const section = document.getElementById('rawMatStockSection');
        if (!section) return;
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? '' : 'none';
        const btn = document.getElementById('rawMatStockToggleBtn');
        if (btn) btn.textContent = isHidden ? '⊙ 재고 숨기기' : '⊙ 재고 보기';
        if (isHidden) _renderStockTable();
    }

    function _renderStockTable() {
        const tbody = document.getElementById('rawMatStockTbody');
        if (!tbody) return;
        const stocks = _calcStock();
        if (stocks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = stocks.map(s => {
            let statusBadge;
            if (s.balance <= 0) {
                statusBadge = `<span style="color:var(--accent-red);font-weight:700;">재고없음</span>`;
            } else if (s.balance < 10) {
                statusBadge = `<span style="color:var(--accent-orange,#f59e0b);font-weight:700;">부족</span>`;
            } else {
                statusBadge = `<span style="color:var(--accent-green);font-weight:700;">정상</span>`;
            }
            return `
                <tr>
                    <td><strong>${s.matName || '-'}</strong></td>
                    <td>${s.color || '-'}</td>
                    <td>${s.supplier || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(s.incoming)} KG</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(s.outgoing)} KG</td>
                    <td style="text-align:right;font-weight:700;">${UIUtils.formatNumber(s.balance)} KG</td>
                    <td style="text-align:center;">${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // ── 검색/필터 ────────────────────────────────────────────────────────
    function search() {
        const startDate = document.getElementById('rawMatFilterStart')?.value || '';
        const endDate   = document.getElementById('rawMatFilterEnd')?.value   || '';
        const matFilter = document.getElementById('rawMatFilterMat')?.value   || '';
        const typeFilter= document.getElementById('rawMatFilterType')?.value  || '';

        let data = Storage.getAll(STORE) || [];

        if (startDate) data = data.filter(r => (r.date || '') >= startDate);
        if (endDate)   data = data.filter(r => (r.date || '') <= endDate);
        if (matFilter) data = data.filter(r => r.matName === matFilter);
        if (typeFilter && typeFilter !== '전체') data = data.filter(r => r.type === typeFilter);

        data.sort((a, b) => {
            const dateCmp = (b.date || '').localeCompare(a.date || '');
            if (dateCmp !== 0) return dateCmp;
            return (b.time || '').localeCompare(a.time || '');
        });

        _renderHistoryTable(data);
    }

    function _renderHistoryTable(data) {
        const tbody = document.getElementById('rawMatHistoryTbody');
        if (!tbody) return;
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted);">내역이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((r, idx) => {
            const typeBadge = r.type === '출고'
                ? UIUtils.badge('출고', 'danger')
                : UIUtils.badge('입고', 'success');
            return `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>${r.date || '-'}</td>
                    <td>${r.time || '-'}</td>
                    <td><strong>${r.matName || '-'}</strong></td>
                    <td>${r.color || '-'}</td>
                    <td style="font-family:monospace;">${r.lotNo || '-'}</td>
                    <td style="text-align:right;font-weight:600;">
                        ${r.bags ? `<span style="color:var(--accent-blue);">${r.bags}포</span><br>` : ''}
                        <span style="font-size:0.85rem;">${UIUtils.formatNumber(r.quantity)} KG</span>
                    </td>
                    <td style="text-align:center;">${typeBadge}</td>
                    <td>${r.supplier || '-'}</td>
                    <td style="font-size:0.82rem;color:var(--text-muted);">${r.note || '-'}</td>
                    <td style="text-align:center;white-space:nowrap;">
                        <button onclick="RawMaterialInventoryModule.remove('${r.id}')"
                            title="삭제"
                            style="padding:2px 6px;font-size:0.72rem;border:1px solid var(--border-color);border-radius:4px;background:transparent;color:var(--text-muted);opacity:0.35;cursor:pointer;transition:opacity 0.2s;"
                            onmouseenter="this.style.opacity='1';this.style.color='var(--accent-red)';this.style.borderColor='var(--accent-red)';"
                            onmouseleave="this.style.opacity='0.35';this.style.color='var(--text-muted)';this.style.borderColor='var(--border-color)';">
                            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function _buildMatFilterOptions() {
        const all = Storage.getAll(STORE) || [];
        const names = [...new Set(all.map(r => r.matName).filter(Boolean))].sort();
        return `<option value="">전체 원재료</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    // ── 렌더 ────────────────────────────────────────────────────────────
    function render(container) {
        if (!container) container = document.getElementById('contentArea');
        if (!container) return;

        const today = UIUtils.today();

        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>원자재 창고 (입출고 / 재고 현황)</h3>
                        <p>원자재의 입출고 내역을 KG 단위로 관리합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="RawMaterialInventoryModule.openIncomingModal()">
                            <span class="material-symbols-outlined">login</span> + 입고
                        </button>
                        <button class="btn btn-danger" onclick="RawMaterialInventoryModule.openOutgoingModal()">
                            <span class="material-symbols-outlined">logout</span> - 출고
                        </button>
                        <button id="rawMatStockToggleBtn" class="btn btn-outline" onclick="RawMaterialInventoryModule.showCurrentStock()">
                            ⊙ 재고 보기
                        </button>
                        <button class="btn btn-outline" onclick="RawMaterialInventoryModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <!-- 현재 재고 현황 카드 (기본 숨김) -->
                <div class="card" id="rawMatStockSection" style="display:none; margin-bottom:20px; border-left:3px solid var(--accent-blue);">
                    <div class="card-header">
                        <h4 style="display:flex;align-items:center;gap:8px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-blue);">inventory_2</span>
                            현재 재고 현황
                        </h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>원재료명</th>
                                        <th>컬러</th>
                                        <th>공급처</th>
                                        <th style="text-align:right;">입고(KG)</th>
                                        <th style="text-align:right;">출고(KG)</th>
                                        <th style="text-align:right;">현재재고(KG)</th>
                                        <th style="text-align:center;">상태</th>
                                    </tr>
                                </thead>
                                <tbody id="rawMatStockTbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 입출고 내역 카드 -->
                <div class="card">
                    <div class="card-header">
                        <h4 style="display:flex;align-items:center;gap:8px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-green);">receipt_long</span>
                            입출고 내역
                        </h4>
                    </div>
                    <div class="card-body" style="border-bottom:1px solid var(--border-color);">
                        <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                            <div class="form-group">
                                <label class="form-label">시작일</label>
                                <input type="date" id="rawMatFilterStart" class="form-input" value="${today}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">종료일</label>
                                <input type="date" id="rawMatFilterEnd" class="form-input" value="${today}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">원재료</label>
                                <select id="rawMatFilterMat" class="form-select">
                                    ${_buildMatFilterOptions()}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">유형</label>
                                <select id="rawMatFilterType" class="form-select">
                                    <option value="전체">전체</option>
                                    <option value="입고">입고</option>
                                    <option value="출고">출고</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">&nbsp;</label>
                                <div style="display:flex;gap:8px;">
                                    <button class="btn btn-primary" onclick="RawMaterialInventoryModule.search()">
                                        <span class="material-symbols-outlined">search</span> 조회
                                    </button>
                                    <button class="btn btn-outline" onclick="RawMaterialInventoryModule._resetFilter()">초기화</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="text-align:center;width:48px;">No</th>
                                        <th>일자</th>
                                        <th>시간</th>
                                        <th>원재료명</th>
                                        <th>컬러</th>
                                        <th>LOT번호</th>
                                        <th style="text-align:right;">수량(KG)</th>
                                        <th style="text-align:center;">유형</th>
                                        <th>공급처</th>
                                        <th>비고</th>
                                        <th style="text-align:center;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="rawMatHistoryTbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        search();
    }

    function _resetFilter() {
        const today = UIUtils.today();
        const s = document.getElementById('rawMatFilterStart');
        const e = document.getElementById('rawMatFilterEnd');
        const m = document.getElementById('rawMatFilterMat');
        const t = document.getElementById('rawMatFilterType');
        if (s) s.value = today;
        if (e) e.value = today;
        if (m) m.value = '';
        if (t) t.value = '전체';
        search();
    }

    // ── 포 수량 입력 시 KG 자동 계산 표시 ──────────────────────────────
    function _updateBagsDisplay() {
        const bagsEl    = document.getElementById('rawMatFormBags');
        const packKgEl  = document.getElementById('rawMatFormPackKg');
        const displayEl = document.getElementById('rawMatFormKgDisplay');
        if (!bagsEl || !packKgEl || !displayEl) return;

        const bags   = parseInt(bagsEl.value, 10) || 0;
        const packKg = parseFloat(packKgEl.value) || 25;
        const totalKg = bags * packKg;

        if (bags > 0) {
            displayEl.textContent = `${bags}포 × ${packKg}KG = ${totalKg.toLocaleString()}KG`;
            displayEl.style.color = 'var(--accent-blue)';
        } else {
            displayEl.textContent = '포 수량을 입력하세요';
            displayEl.style.color = 'var(--text-muted)';
        }
    }

    // ── 원재료 선택 시 컬러/공급처/포장단위 자동 채움 (입고) ─────────────
    function _onRawMatSelect(sel) {
        const matId = sel.value;
        const mats = Storage.getAll(MAT_STORE) || [];
        const mat = mats.find(m => m.id === matId);

        const colorEl    = document.getElementById('rawMatFormColor');
        const supplierEl = document.getElementById('rawMatFormSupplier');
        const packKgEl   = document.getElementById('rawMatFormPackKg');
        const packLabelEl= document.getElementById('rawMatFormPackLabel');

        if (mat) {
            if (colorEl)     colorEl.value     = mat.color    || '';
            if (supplierEl)  supplierEl.value  = mat.supplier || '';
            const packKg    = mat.packKg    || 25;
            const packLabel = mat.packLabel || (packKg + 'KG/포');
            if (packKgEl)    packKgEl.value    = packKg;
            if (packLabelEl) packLabelEl.textContent = packLabel;
        } else {
            if (colorEl)     colorEl.value     = '';
            if (supplierEl)  supplierEl.value  = '';
            if (packKgEl)    packKgEl.value    = 25;
            if (packLabelEl) packLabelEl.textContent = '25KG/포';
        }
        _updateBagsDisplay();
    }

    // ── 입고 모달 ────────────────────────────────────────────────────────
    function openIncomingModal() {
        const today   = UIUtils.today();
        const nowTime = new Date().toTimeString().slice(0, 5);
        const mats    = Storage.getAll(MAT_STORE) || [];

        const matOptions = mats.length > 0
            ? mats.map(m => `<option value="${m.id}" data-pack-kg="${m.packKg || 25}" data-pack-label="${m.packLabel || (m.packKg || 25) + 'KG/포'}">${m.matName}${m.color ? ' (' + m.color + ')' : ''} — ${m.supplier || ''}</option>`).join('')
            : `<option value="">등록된 원재료 없음</option>`;

        const body = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" id="rawMatFormDate" class="form-input" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">입고시간</label>
                    <input type="time" id="rawMatFormTime" class="form-input" value="${nowTime}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">원재료 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select id="rawMatFormMatId" class="form-select" onchange="RawMaterialInventoryModule._onRawMatSelect(this)">
                        <option value="">-- 원재료를 선택하세요 --</option>
                        ${matOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" id="rawMatFormColor" class="form-input" placeholder="자동 입력" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
                <div class="form-group">
                    <label class="form-label">공급처</label>
                    <input type="text" id="rawMatFormSupplier" class="form-input" placeholder="자동 입력" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">
                        수량 (포) <span style="color:var(--accent-red)">*</span>
                        <span id="rawMatFormPackLabel" style="font-size:0.78rem;color:var(--accent-blue);font-weight:600;margin-left:6px;">25KG/포</span>
                    </label>
                    <input type="number" id="rawMatFormBags" class="form-input" placeholder="1" min="1" step="1" style="text-align:right;font-size:1.1rem;"
                        oninput="RawMaterialInventoryModule._updateBagsDisplay()">
                    <div id="rawMatFormKgDisplay"
                        style="margin-top:6px;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;font-size:0.9rem;font-weight:600;color:var(--text-muted);">
                        포 수량을 입력하세요
                    </div>
                    <input type="hidden" id="rawMatFormPackKg" value="25">
                </div>
                <div class="form-group">
                    <label class="form-label">LOT번호</label>
                    <input type="text" id="rawMatFormLot" class="form-input" placeholder="LOT 번호 입력">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">비고</label>
                    <textarea id="rawMatFormNote" class="form-textarea" rows="2" placeholder="비고 사항을 입력하세요"></textarea>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="RawMaterialInventoryModule.saveIncoming()">
                <span class="material-symbols-outlined">login</span> 입고 등록
            </button>
        `;

        UIUtils.showModal('원자재 입고 등록', body, footer);
    }

    // ── 출고 모달 ────────────────────────────────────────────────────────
    function openOutgoingModal() {
        const today   = UIUtils.today();
        const nowTime = new Date().toTimeString().slice(0, 5);
        const mats    = Storage.getAll(MAT_STORE) || [];

        const stocks  = _calcStock().filter(s => s.balance > 0);
        const matOptions = stocks.length > 0
            ? stocks.map(s => {
                const mat = mats.find(m => m.id === s.matId);
                const packKg    = (mat && mat.packKg)    ? mat.packKg    : 25;
                const packLabel = (mat && mat.packLabel) ? mat.packLabel : packKg + 'KG/포';
                const balancePo = Math.floor(s.balance / packKg);
                return `<option value="${s.matId || s.matName}"
                    data-color="${s.color || ''}"
                    data-supplier="${s.supplier || ''}"
                    data-pack-kg="${packKg}"
                    data-pack-label="${packLabel}"
                    data-balance="${s.balance}"
                    data-balance-po="${balancePo}">
                    ${s.matName}${s.color ? ' (' + s.color + ')' : ''} — 재고: ${balancePo}포 (${UIUtils.formatNumber(s.balance)}KG)
                </option>`;
            }).join('')
            : `<option value="">출고 가능한 재고 없음</option>`;

        const body = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" id="rawMatFormDate" class="form-input" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">출고시간</label>
                    <input type="time" id="rawMatFormTime" class="form-input" value="${nowTime}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">원재료 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select id="rawMatFormMatId" class="form-select" onchange="RawMaterialInventoryModule._onRawMatSelectOut(this)">
                        <option value="">-- 출고할 원재료를 선택하세요 --</option>
                        ${matOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" id="rawMatFormColor" class="form-input" placeholder="자동 입력" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
                <div class="form-group">
                    <label class="form-label">공급처</label>
                    <input type="text" id="rawMatFormSupplier" class="form-input" placeholder="자동 입력" readonly style="background:var(--bg-secondary);cursor:default;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">
                        수량 (포) <span style="color:var(--accent-red)">*</span>
                        <span id="rawMatFormPackLabel" style="font-size:0.78rem;color:var(--accent-blue);font-weight:600;margin-left:6px;">25KG/포</span>
                    </label>
                    <input type="number" id="rawMatFormBags" class="form-input" placeholder="1" min="1" step="1" style="text-align:right;font-size:1.1rem;"
                        oninput="RawMaterialInventoryModule._updateBagsDisplay()">
                    <div id="rawMatFormKgDisplay"
                        style="margin-top:6px;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;font-size:0.9rem;font-weight:600;color:var(--text-muted);">
                        포 수량을 입력하세요
                    </div>
                    <div id="rawMatStockHint" style="display:none;margin-top:4px;font-size:0.82rem;color:var(--accent-blue);font-weight:600;"></div>
                    <input type="hidden" id="rawMatFormPackKg" value="25">
                    <input type="hidden" id="rawMatFormBalanceKg" value="0">
                </div>
                <div class="form-group">
                    <label class="form-label">LOT번호</label>
                    <input type="text" id="rawMatFormLot" class="form-input" placeholder="LOT 번호 입력">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">비고</label>
                    <textarea id="rawMatFormNote" class="form-textarea" rows="2" placeholder="비고 사항을 입력하세요"></textarea>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-danger" onclick="RawMaterialInventoryModule.saveOutgoing()">
                <span class="material-symbols-outlined">logout</span> 출고 등록
            </button>
        `;

        UIUtils.showModal('원자재 출고 등록', body, footer);
    }

    // 출고 모달 전용 select 핸들러
    function _onRawMatSelectOut(sel) {
        const opt = sel.options[sel.selectedIndex];
        const colorEl     = document.getElementById('rawMatFormColor');
        const supplierEl  = document.getElementById('rawMatFormSupplier');
        const hintEl      = document.getElementById('rawMatStockHint');
        const packKgEl    = document.getElementById('rawMatFormPackKg');
        const packLabelEl = document.getElementById('rawMatFormPackLabel');
        const balanceEl   = document.getElementById('rawMatFormBalanceKg');

        if (colorEl)    colorEl.value    = opt.dataset.color    || '';
        if (supplierEl) supplierEl.value = opt.dataset.supplier || '';

        const packKg    = parseFloat(opt.dataset.packKg)    || 25;
        const packLabel = opt.dataset.packLabel || (packKg + 'KG/포');
        const balanceKg = parseFloat(opt.dataset.balance)   || 0;
        const balancePo = parseInt(opt.dataset.balancePo, 10) || 0;

        if (packKgEl)    packKgEl.value           = packKg;
        if (packLabelEl) packLabelEl.textContent  = packLabel;
        if (balanceEl)   balanceEl.value          = balanceKg;

        if (hintEl && sel.value) {
            hintEl.textContent = `현재 재고: ${balancePo}포 (${UIUtils.formatNumber(balanceKg)}KG) — 최대 ${balancePo}포 출고 가능`;
            hintEl.style.display = 'block';
        } else if (hintEl) {
            hintEl.style.display = 'none';
        }
        _updateBagsDisplay();
    }

    // ── 입고 저장 ────────────────────────────────────────────────────────
    async function saveIncoming() {
        const date     = document.getElementById('rawMatFormDate')?.value     || '';
        const time     = document.getElementById('rawMatFormTime')?.value     || '';
        const matId    = document.getElementById('rawMatFormMatId')?.value    || '';
        const color    = document.getElementById('rawMatFormColor')?.value    || '';
        const supplier = document.getElementById('rawMatFormSupplier')?.value || '';
        const lotNo    = document.getElementById('rawMatFormLot')?.value      || '';
        const bags     = parseInt(document.getElementById('rawMatFormBags')?.value, 10) || 0;
        const packKg   = parseFloat(document.getElementById('rawMatFormPackKg')?.value) || 25;
        const note     = document.getElementById('rawMatFormNote')?.value     || '';

        if (!date)    { UIUtils.toast('입고일자를 입력하세요.', 'warning'); return; }
        if (!matId)   { UIUtils.toast('원재료를 선택하세요.', 'warning'); return; }
        if (bags <= 0){ UIUtils.toast('수량(포)을 올바르게 입력하세요.', 'warning'); return; }

        const totalKg = bags * packKg;

        // 원재료 이름 조회
        const mats = Storage.getAll(MAT_STORE) || [];
        const mat  = mats.find(m => m.id === matId);
        const matName = mat ? mat.matName : matId;

        const record = {
            date,
            time,
            matId,
            matName,
            color,
            supplier,
            lotNo,
            bags,
            packKg,
            quantity: totalKg,   // KG 단위로 저장 (ledger 집계 기준)
            type: '입고',
            note,
            createdAt: new Date().toISOString()
        };

        try {
            await Storage.add(STORE, record);
            UIUtils.closeModal();
            UIUtils.toast(`입고 등록 완료: ${bags}포 (${totalKg.toLocaleString()}KG)`, 'success');
            render();
        } catch (e) {
            console.error(e);
            UIUtils.toast('저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // ── 출고 저장 ────────────────────────────────────────────────────────
    async function saveOutgoing() {
        const date      = document.getElementById('rawMatFormDate')?.value     || '';
        const time      = document.getElementById('rawMatFormTime')?.value     || '';
        const matKey    = document.getElementById('rawMatFormMatId')?.value    || '';
        const color     = document.getElementById('rawMatFormColor')?.value    || '';
        const supplier  = document.getElementById('rawMatFormSupplier')?.value || '';
        const lotNo     = document.getElementById('rawMatFormLot')?.value      || '';
        const bags      = parseInt(document.getElementById('rawMatFormBags')?.value, 10) || 0;
        const packKg    = parseFloat(document.getElementById('rawMatFormPackKg')?.value) || 25;
        const balanceKg = parseFloat(document.getElementById('rawMatFormBalanceKg')?.value) || 0;
        const note      = document.getElementById('rawMatFormNote')?.value     || '';

        if (!date)    { UIUtils.toast('출고일자를 입력하세요.', 'warning'); return; }
        if (!matKey)  { UIUtils.toast('원재료를 선택하세요.', 'warning'); return; }
        if (bags <= 0){ UIUtils.toast('수량(포)을 올바르게 입력하세요.', 'warning'); return; }

        const totalKg = bags * packKg;

        // 재고 검증 (KG 기준)
        if (totalKg > balanceKg) {
            const maxPo = Math.floor(balanceKg / packKg);
            UIUtils.toast(`재고 초과: 현재 재고 ${maxPo}포(${UIUtils.formatNumber(balanceKg)}KG), 요청 ${bags}포(${totalKg}KG)`, 'error');
            return;
        }

        // matId 조회
        const mats   = Storage.getAll(MAT_STORE) || [];
        const mat    = mats.find(m => m.id === matKey);
        const matId  = mat ? mat.id : '';
        const stocks = _calcStock();
        const stock  = stocks.find(s => (s.matId || s.matName) === matKey);
        const matName= mat ? mat.matName : (stock ? stock.matName : matKey);

        const record = {
            date,
            time,
            matId,
            matName,
            color,
            supplier,
            lotNo,
            bags,
            packKg,
            quantity: totalKg,
            type: '출고',
            note,
            createdAt: new Date().toISOString()
        };

        try {
            await Storage.add(STORE, record);
            UIUtils.closeModal();
            UIUtils.toast(`출고 등록 완료: ${bags}포 (${totalKg.toLocaleString()}KG)`, 'success');
            render();
        } catch (e) {
            console.error(e);
            UIUtils.toast('저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // ── 삭제 ─────────────────────────────────────────────────────────────
    function remove(id) {
        UIUtils.confirm('이 내역을 삭제하시겠습니까?', async () => {
            try {
                await Storage.remove(STORE, id);
                UIUtils.toast('삭제되었습니다.', 'success');
                render();
            } catch (e) {
                console.error(e);
                UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            }
        });
    }

    // ── 내보내기 ──────────────────────────────────────────────────────────
    function exportData() {
        const data = Storage.getAll(STORE) || [];
        if (data.length === 0) { UIUtils.toast('내보낼 데이터가 없습니다.', 'warning'); return; }

        const header = ['No', '일자', '시간', '원재료명', '컬러', 'LOT번호', '수량(KG)', '유형', '공급처', '비고', '등록일시'];
        const rows = data
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .map((r, i) => [
                i + 1,
                r.date || '',
                r.time || '',
                r.matName || '',
                r.color || '',
                r.lotNo || '',
                r.quantity || 0,
                r.type || '',
                r.supplier || '',
                r.note || '',
                r.createdAt ? r.createdAt.slice(0, 19).replace('T', ' ') : ''
            ]);

        const csvContent = [header, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `원자재_입출고_${UIUtils.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        UIUtils.toast('내보내기가 완료되었습니다.', 'success');
    }

    // ── init ─────────────────────────────────────────────────────────────
    function init() {
        render();
    }

    // ── public API ───────────────────────────────────────────────────────
    return {
        init,
        render,
        openIncomingModal,
        saveIncoming,
        openOutgoingModal,
        saveOutgoing,
        remove,
        search,
        showCurrentStock,
        _updateBagsDisplay,
        _onRawMatSelect,
        _onRawMatSelectOut,
        _resetFilter,
        exportData
    };
})();
