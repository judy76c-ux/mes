// ===================================================================
// 사출 창고 (자재 재고관리)
// ===================================================================
var InjectionWarehouseModule = (function() {
    const STORE = DB.STORES.INJECTION_INVENTORY;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="Router.navigate('injection-layout')"
                            title="1층 소재/완제품 보관창고 배치 레이아웃을 시각적으로 편집합니다.">
                            <span class="material-symbols-outlined">map</span> 레이아웃
                        </button>
                        <button class="btn btn-primary" onclick="InjectionWarehouseModule.openAddModal('입고')">
                            <span class="material-symbols-outlined">add_circle</span> 사출 입고
                        </button>
                        <button class="btn btn-danger" onclick="InjectionWarehouseModule.openAddModal('출고')">
                            <span class="material-symbols-outlined">do_not_disturb_on</span> 사출 출고
                        </button>
                    </div>
                </div>

                <!-- 입고 대기품 섹션 -->
                <div id="injInspStandbyCard" style="margin-bottom:20px;"></div>

                <!-- 차종별 재고 타일 -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">grid_view</span> 차종별 재고 현황</h4>
                        <select id="injTileCarFilter" class="form-select" style="width:140px;"
                            onchange="InjectionWarehouseModule.renderCarTiles()">
                            <option value="">전체 차종</option>
                        </select>
                    </div>
                    <div class="card-body">
                        <div id="injCarTiles" style="display:flex; gap:12px; align-items:flex-start;"></div>
                    </div>
                </div>

                <!-- 입출고 조회 -->
                <div class="card">
                    <div class="card-header" style="flex-wrap:wrap; gap:8px;">
                        <h4><span class="material-symbols-outlined">receipt_long</span> 입출고 조회</h4>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                            <input type="date" id="injTxStart" class="form-input" style="width:130px;"
                                value="${UIUtils.monthAgo ? UIUtils.monthAgo() : ''}">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" id="injTxEnd" class="form-input" style="width:130px;"
                                value="${UIUtils.today ? UIUtils.today() : ''}">
                            <select id="injTxCar" class="form-select" style="width:110px;"
                                onchange="InjectionWarehouseModule.onTxCarChange()">
                                <option value="">전체 차종</option>
                            </select>
                            <select id="injTxPart" class="form-select" style="width:130px;">
                                <option value="">전체 품명</option>
                            </select>
                            <select id="injTxType" class="form-select" style="width:90px;">
                                <option value="">전체</option>
                                <option value="입고">입고</option>
                                <option value="출고">출고</option>
                            </select>
                            <button class="btn btn-primary" onclick="InjectionWarehouseModule.filterTransactions()">
                                <span class="material-symbols-outlined">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>일자</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>사출처</th>
                                        <th>LOT번호</th>
                                        <th style="text-align:right;">수량</th>
                                        <th style="text-align:right;">금액</th>
                                        <th>유형</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="injInvTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        loadData();
    }

    function loadData() {
        const data = Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        // ── 재고 집계: 차종+품명+컬러 키 ──────────────────────────
        const stockMap = {}; // key: carModel||partName||color
        let totalValue = 0;
        data.forEach(d => {
            // v19: injMaterialId 있으면 ID 직접 조회, 없으면 carModel+partName 텍스트 Fallback
            const mat = (d.injMaterialId && materials.find(m => m.id === d.injMaterialId))
                     || materials.find(m => m.carModel === d.carModel && m.injPartName === d.partName);
            const price = Number(mat ? mat.unitPrice : 0) || 0;
            const qty = Number(d.quantity) || 0;
            const key = `${d.carModel||''}||${d.partName||''}||${d.color||''}`;
            if (!stockMap[key]) stockMap[key] = { carModel: d.carModel||'', partName: d.partName||'', color: d.color||'', stock: 0, price };
            if (d.type === '출고') {
                stockMap[key].stock -= qty;
                totalValue -= qty * price;
            } else {
                stockMap[key].stock += qty;
                totalValue += qty * price;
            }
        });

        const totalStock = Object.values(stockMap).reduce((s, v) => s + v.stock, 0);
        const partCount  = Object.keys(stockMap).length;


        // ── 차종 드롭다운 채우기 ───────────────────────────────────
        const carModels = [...new Set(data.map(d => d.carModel).filter(Boolean))].sort();
        ['injTileCarFilter','injTxCar'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = `<option value="">전체 차종</option>` +
                carModels.map(c => `<option value="${c}">${c}</option>`).join('');
            sel.value = cur;
        });

        // ── 차종별 타일 렌더링 ─────────────────────────────────────
        renderCarTiles(stockMap, data);

        // ── 입출고 조회 테이블 (초기: 전체, 최신순) ──────────────
        const sortedData = data.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderTxTable(sortedData, materials);

        renderInspStandby();
    }

    // 차종 카드 HTML 생성
    function _buildCarCard(carModel, items) {
        const totalCarStock = items.reduce((s, i) => s + i.stock, 0);
        // 사출자재 마스터에서 제작품목 설정 여부 확인용
        const _allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const rows = items
            .sort((a, b) => a.partName.localeCompare(b.partName))
            .map(item => {
                // 생산 계획 예약 수량 조회
                const r = (typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule._calcInjPlanReserved)
                    ? ProductionPlanModule._calcInjPlanReserved(item.partName, null, item.carModel, item.color)
                    : { pending: 0, inProgress: 0 };
                const reserved   = r.pending + r.inProgress;
                const available  = item.stock - reserved;

                // ── 제작품목 미설정 경고 뱃지 ──────────────────────────
                // ★ .trim() 비교 + productIds 포함 여부도 확인 (v19 드롭다운 등록 지원)
                const _matEntry = _allMats.find(m =>
                    (m.injPartName || '').trim() === (item.partName || '').trim());
                const _hasMfgMapping = _matEntry && (
                    _matEntry.mfgProductName || _matEntry.mfgProductName2 ||
                    (_matEntry.productIds && _matEntry.productIds.length > 0));
                const _noMappingBadge = (!_hasMfgMapping)
                    ? `<span title="설정 > 사출자재에서 제작품목1/2를 입력해야 예약 수량이 표시됩니다"
                             style="font-size:0.62rem;background:rgba(234,179,8,0.15);color:#b45309;
                                    border:1px solid rgba(234,179,8,0.4);border-radius:3px;
                                    padding:0 4px;margin-left:4px;cursor:help;vertical-align:middle;">
                            ⚠ 제작품목 미설정
                        </span>`
                    : '';

                // 재고 표시 (예약 있을 때는 취소선 + 가용 표시)
                const _ep = encodeURIComponent(item.partName);
                const _em = encodeURIComponent(carModel);
                const _ec = encodeURIComponent(item.color || '');
                let stockHtml;
                if (r.inProgress > 0) {
                    stockHtml = `
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
                            <span style="font-size:0.7rem;color:var(--text-muted);text-decoration:line-through;">${UIUtils.formatNumber(item.stock)}</span>
                            <span style="font-size:0.85rem;font-weight:700;color:${available > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(available)} EA</span>
                            <span onclick="event.stopPropagation();InjectionWarehouseModule.showReserveDetailPopup(event,'${_ep}','${_em}','${_ec}')"
                                  style="font-size:0.68rem;background:rgba(234,88,12,0.12);color:#ea580c;border:1px solid rgba(234,88,12,0.3);border-radius:3px;padding:0 4px;white-space:nowrap;cursor:pointer;"
                                  title="클릭하여 예약 상세 보기">미입력실적 -${UIUtils.formatNumber(r.inProgress)} ℹ</span>
                        </div>`;
                } else if (r.pending > 0) {
                    stockHtml = `
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
                            <span style="font-size:0.7rem;color:var(--text-muted);text-decoration:line-through;">${UIUtils.formatNumber(item.stock)}</span>
                            <span style="font-size:0.85rem;font-weight:700;color:${available > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(available)} EA</span>
                            <span onclick="event.stopPropagation();InjectionWarehouseModule.showReserveDetailPopup(event,'${_ep}','${_em}','${_ec}')"
                                  style="font-size:0.68rem;background:rgba(234,179,8,0.12);color:#ca8a04;border:1px solid rgba(234,179,8,0.3);border-radius:3px;padding:0 4px;white-space:nowrap;cursor:pointer;"
                                  title="클릭하여 예약 상세 보기">예약 -${UIUtils.formatNumber(r.pending)} ℹ</span>
                        </div>`;
                } else {
                    stockHtml = `<span style="font-size:0.85rem;font-weight:700;color:${item.stock > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(item.stock)} EA</span>`;
                }

                return `
                <tr onclick="InjectionWarehouseModule.showPartDetail('${carModel}','${item.partName}','${item.color}')"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:5px 8px; font-size:0.82rem; font-weight:600;
                               border-bottom:1px solid var(--border-color);">
                        ${item.partName}${_noMappingBadge}
                    </td>
                    <td style="padding:5px 8px; font-size:0.82rem; color:var(--text-muted);
                               border-bottom:1px solid var(--border-color);">
                        ${item.color || '-'}
                    </td>
                    <td style="padding:5px 8px; text-align:right; border-bottom:1px solid var(--border-color);">
                        ${stockHtml}
                    </td>
                </tr>`;
            }).join('');
        return `
            <div style="border:1px solid var(--border-color); border-radius:6px;
                        overflow:hidden; background:var(--bg-primary); margin-bottom:12px;">
                <div style="background:#7ec8e3; padding:6px 10px;
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:0.92rem; color:#1a3a4a;">${carModel}</span>
                    <span style="font-size:0.78rem; color:#1a3a4a; font-weight:600;">${items.length}개품목</span>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <tbody>${rows}</tbody>
                </table>
                <div style="padding:5px 8px; background:var(--bg-secondary);
                            border-top:2px solid var(--border-color);
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.78rem; color:var(--text-muted);">합계</span>
                    <span style="font-size:0.88rem; font-weight:800; color:var(--accent-blue);">
                        ${UIUtils.formatNumber(totalCarStock)} EA
                    </span>
                </div>
            </div>
        `;
    }

    // 차종별 타일 렌더링 (Greedy bin-packing 컬럼 배치)
    function renderCarTiles(stockMapArg, dataArg) {
        const tilesEl = document.getElementById('injCarTiles');
        if (!tilesEl) return;

        const data      = dataArg  || Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        const stockMap = stockMapArg || (() => {
            const m = {};
            data.forEach(d => {
                const mat = materials.find(x => x.carModel === d.carModel && x.injPartName === d.partName);
                const price = Number(mat ? mat.unitPrice : 0) || 0;
                const qty = Number(d.quantity) || 0;
                const key = `${d.carModel||''}||${d.partName||''}||${d.color||''}`;
                if (!m[key]) m[key] = { carModel: d.carModel||'', partName: d.partName||'', color: d.color||'', stock: 0, price };
                if (d.type === '출고') m[key].stock -= qty; else m[key].stock += qty;
            });
            return m;
        })();

        const filterCar = (document.getElementById('injTileCarFilter') || {}).value || '';

        // 차종별 그룹핑 (재고 > 0)
        const byCarModel = {};
        Object.values(stockMap).forEach(item => {
            if (filterCar && item.carModel !== filterCar) return;
            if (item.stock <= 0) return;
            if (!byCarModel[item.carModel]) byCarModel[item.carModel] = [];
            byCarModel[item.carModel].push(item);
        });

        const entries = Object.entries(byCarModel);
        if (entries.length === 0) {
            tilesEl.innerHTML = `<p style="color:var(--text-muted); padding:20px;">재고 데이터가 없습니다.</p>`;
            return;
        }

        // 품목 수 내림차순 정렬
        entries.sort(([, a], [, b]) => b.length - a.length || a[0].carModel.localeCompare(b[0].carModel));

        // 컬럼 수 결정 (차종 수에 따라 유동)
        const total = entries.length;
        const COLS = total <= 2 ? total : total <= 6 ? 3 : 4;

        // Greedy bin-packing: 각 카드를 누적 품목 수가 가장 적은 컬럼에 배치
        const cols   = Array.from({ length: COLS }, () => []);       // 컬럼별 카드 목록
        const heights = Array(COLS).fill(0);                          // 컬럼별 누적 품목 수

        for (const [carModel, items] of entries) {
            const minIdx = heights.indexOf(Math.min(...heights));
            cols[minIdx].push([carModel, items]);
            heights[minIdx] += items.length + 1; // +1: 헤더/합계 행 높이 보정
        }

        // 컬럼별 HTML 생성
        tilesEl.innerHTML = cols.map(colCards => `
            <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
                ${colCards.map(([carModel, items]) => _buildCarCard(carModel, items)).join('')}
            </div>
        `).join('');
    }

    // 입출고 조회 필터 적용
    function filterTransactions() {
        const data      = Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const start  = (document.getElementById('injTxStart') || {}).value || '';
        const end    = (document.getElementById('injTxEnd')   || {}).value || '';
        const car    = (document.getElementById('injTxCar')   || {}).value || '';
        const part   = (document.getElementById('injTxPart')  || {}).value || '';
        const type   = (document.getElementById('injTxType')  || {}).value || '';

        const filtered = data.filter(d => {
            if (start && (d.date || '') < start) return false;
            if (end   && (d.date || '') > end)   return false;
            if (car   && d.carModel !== car)      return false;
            if (part  && d.partName !== part)     return false;
            if (type  && d.type    !== type)      return false;
            return true;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderTxTable(filtered, materials);
    }

    // 차종 변경 시 품명 드롭다운 업데이트
    function onTxCarChange() {
        const car  = (document.getElementById('injTxCar') || {}).value || '';
        const data = Storage.getAll(STORE);
        const parts = [...new Set(
            data.filter(d => !car || d.carModel === car).map(d => d.partName).filter(Boolean)
        )].sort();
        const sel = document.getElementById('injTxPart');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체 품명</option>` +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 입출고 테이블 렌더링
    function renderTxTable(data, materials) {
        const tbody = document.getElementById('injInvTableBody');
        if (!tbody) return;
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">입출고 내역이 없습니다.</td></tr>`;
            return;
        }
        const mats = materials || Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        tbody.innerHTML = data.map(d => {
            const mat   = mats.find(m => m.carModel === d.carModel && m.injPartName === d.partName);
            const price = Number(mat ? mat.unitPrice : 0) || 0;
            const value = (Number(d.quantity) || 0) * price;
            const typeBadge = d.type === '출고' ? 'danger' : 'success';
            return `
                <tr>
                    <td style="white-space:nowrap;">${d.date || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td>${d.color || '-'}</td>
                    <td>${d.supplier || '-'}</td>
                    <td>${d.lotNo || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.quantity)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(value)}</td>
                    <td>
                        ${UIUtils.badge(d.type || '입고', typeBadge)}
                        ${d.outgoingType === '반출' ? `<span style="margin-left:4px;font-size:0.72rem;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:10px;">반출</span>` : ''}
                        ${d.returnReason ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">사유: ${d.returnReason}</div>` : ''}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.openEditModal('${d.id}')">수정</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 품목 클릭 시 LOT 상세 팝업
    function showPartDetail(carModel, partName, color) {
        const data = Storage.getAll(STORE);
        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        const items = data.filter(d =>
            d.carModel === carModel &&
            d.partName === partName &&
            (d.color || '') === (color || '')
        ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        let stock = 0;
        items.forEach(d => {
            const qty = Number(d.quantity) || 0;
            if (d.type === '출고') stock -= qty; else stock += qty;
        });

        const mat   = mats.find(m => m.carModel === carModel && m.injPartName === partName);
        const price = Number(mat ? mat.unitPrice : 0) || 0;

        // 입고 내역만 표시 (출고 제외)
        const inItems = items.filter(d => d.type !== '출고');

        const rows = inItems.map(d => {
            const qty = Number(d.quantity) || 0;
            return `
                <tr>
                    <td style="white-space:nowrap;">${d.date || '-'}</td>
                    <td>${d.lotNo || '-'}</td>
                    <td>${d.supplier || '-'}</td>
                    <td style="text-align:right; color:var(--accent-green); font-weight:600;">
                        ${UIUtils.formatNumber(qty)}
                    </td>
                </tr>
            `;
        }).join('');

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color ? ' · ' + color : ''}`,
            `
            <div style="margin-bottom:16px; display:flex; gap:16px; flex-wrap:wrap;">
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(stock)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">현재 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700; color:var(--accent-green);">${UIUtils.formatNumber(stock * price)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">재고 금액 (₩)</div>
                </div>
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700;">${inItems.length}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">입고 건수</div>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>입고일</th>
                            <th>LOT번호</th>
                            <th>공급처</th>
                            <th style="text-align:right;">수량</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">입고 내역이 없습니다.</td></tr>`}
                    </tbody>
                </table>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'md'
        );
    }

    // ── 수입 검사 완료품 입고 대기 섹션 ──────────────────────────────
    function renderInspStandby() {
        const card = document.getElementById('injInspStandbyCard');
        if (!card) return;

        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.INJECTION_INVENTORY)   || [];

        // 창고 입고 기록: partName + lotNo 기준 Set
        // lots[] 배열 안의 모든 LOT도 포함해서 체크
        const inStockSet = new Set();
        inventory.filter(i => i.type === '입고').forEach(i => {
            if (i.lotNo) inStockSet.add(`${i.partName}||${i.lotNo}`);
            if (i.lots && i.lots.length > 0) {
                i.lots.forEach(function(lot) {
                    if (lot.lotNo) inStockSet.add(`${i.partName}||${lot.lotNo}`);
                });
            }
        });

        // 검사 기록 → LOT별 행 펼치기
        const rows = [];
        inspections
            .filter(i => (i.lots && i.lots.length > 0) || (Number(i.passQty) || 0) > 0)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .forEach(insp => {
                if (insp.lots && insp.lots.length > 0) {
                    // 다중 LOT: 각 LOT별 개별 행
                    insp.lots.forEach(lot => {
                        rows.push({
                            inspId: insp.id,
                            date: insp.date,
                            carModel: insp.carModel,
                            partName: insp.partName,
                            color: insp.color,
                            supplierName: insp.supplierName,
                            lotNo: lot.lotNo,
                            qty: lot.qty,
                            certReceived: lot.certReceived || false
                        });
                    });
                } else {
                    // 구형 단일 LOT 레코드 하위 호환
                    rows.push({
                        inspId: insp.id,
                        date: insp.date,
                        carModel: insp.carModel,
                        partName: insp.partName,
                        color: insp.color,
                        supplierName: insp.supplierName,
                        lotNo: insp.lotNo,
                        qty: insp.passQty,
                        certReceived: false
                    });
                }
            });

        // 입고 대기 중인 항목만 필터링 (입고 완료된 항목 제외)
        const pendingRows = rows.filter(r => !inStockSet.has(`${r.partName}||${r.lotNo}`));

        if (pendingRows.length === 0) {
            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; padding:10px 14px;
                            background:var(--bg-card); border:1px solid var(--border);
                            border-left:3px solid var(--accent-green); border-radius:8px;
                            margin-bottom:0; color:var(--accent-green); font-size:0.85rem;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">check_circle</span>
                    <span style="font-weight:600;">사출 창고 입고 대기품</span>
                    <span style="color:var(--text-muted); font-size:0.8rem;">(수입 검사 완료품)</span>
                    <span style="margin-left:auto; color:var(--text-muted); font-size:0.82rem;">입고 대기 없음</span>
                    <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.renderInspStandby()"
                        style="padding:2px 8px; font-size:0.78rem;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">refresh</span>
                    </button>
                </div>`;
            return;
        }

        card.innerHTML = `
            <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-orange,#f59e0b);">
                <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;">
                    <h4 style="display:flex; align-items:center; gap:8px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-orange,#f59e0b);">move_to_inbox</span>
                        사출 창고 입고 대기품
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(수입 검사 완료품)</span>
                        <span style="font-size:0.78rem; background:var(--accent-orange,#f59e0b); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600;">대기 ${pendingRows.length}건</span>
                    </h4>
                    <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.renderInspStandby()">
                        <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                    </button>
                </div>
                <div class="card-body" id="injInspStandbyBody" style="padding:0;"></div>
            </div>`;
        const body = card.querySelector('#injInspStandbyBody');
        body.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>검사일</th>
                            <th>차종</th>
                            <th>사출명</th>
                            <th>컬러</th>
                            <th>공급처</th>
                            <th>LOT번호</th>
                            <th style="text-align:center;">성적서</th>
                            <th style="text-align:right;">수량</th>
                            <th style="text-align:center;">상태</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingRows.map(r => `
                            <tr style="background:rgba(245,158,11,0.06);">
                                <td style="font-size:0.82rem;">${(r.date || '').slice(0, 10)}</td>
                                <td>${r.carModel || '-'}</td>
                                <td><strong>${r.partName || '-'}</strong></td>
                                <td>${r.color || '-'}</td>
                                <td style="font-size:0.82rem;">${r.supplierName || '-'}</td>
                                <td style="font-family:monospace; font-weight:600;">${r.lotNo || '-'}</td>
                                <td style="text-align:center;">
                                    ${r.certReceived
                                        ? '<span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-green);vertical-align:middle;">check_circle</span>'
                                        : '<span style="color:var(--text-muted);font-size:0.85rem;">-</span>'}
                                </td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(r.qty || 0)}</td>
                                <td style="text-align:center;">
                                    <span class="badge badge-warning" style="background:var(--accent-orange,#f59e0b);color:#fff;">입고대기</span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="InjectionWarehouseModule.openAddFromInspection('${r.inspId}', '${r.lotNo}')">
                                        <span class="material-symbols-outlined" style="font-size:0.9rem;">add_circle</span> 입고
                                    </button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // 검사 기록으로부터 입고 모달 자동 채움
    function openAddFromInspection(inspId, lotNo) {
        const insp = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('검사 정보를 �을 수 없습니다.', 'error'); return; }

        openAddModal('입고');
        setTimeout(() => {
            const carSel  = document.getElementById('addInvCarModel');
            const partSel = document.getElementById('addInvPart');
            const colorSel = document.getElementById('addInvColor');

            if (carSel) {
                carSel.value = insp.carModel || '';
                InjectionWarehouseModule.onModalCarModelChange();
            }
            setTimeout(() => {
                if (partSel) {
                    partSel.value = insp.partName || '';
                    InjectionWarehouseModule.onModalPartChange();
                }
                setTimeout(() => {
                    if (colorSel && insp.color) colorSel.value = insp.color;
                    // 다중 LOT 또는 단일 LOT 처리
                    const container = document.getElementById('invLotRows');
                    if (!container) return;
                    container.innerHTML = '';
                    // 클릭한 특정 LOT만 채움 (전체 X)
                    var targetLot = null;
                    if (lotNo && insp.lots && insp.lots.length > 0) {
                        targetLot = insp.lots.find(function(l) { return l.lotNo === lotNo; });
                    }
                    var fillLotNo = targetLot ? targetLot.lotNo : (lotNo || insp.lotNo || '');
                    var fillQty   = targetLot ? targetLot.qty   : (insp.passQty || 0);

                    var row = document.createElement('div');
                    row.className = 'inv-lot-row';
                    row.style.cssText = 'display:grid; grid-template-columns:100px 1fr 34px; gap:8px; align-items:center; margin-bottom:6px;';
                    row.innerHTML = '<input type="text" class="form-input inv-lot-no" value="' + fillLotNo + '" maxlength="6" style="font-family:monospace; letter-spacing:1px;" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                        + '<input type="number" class="form-input inv-lot-qty" value="' + fillQty + '" min="0" style="text-align:right;" oninput="InjectionWarehouseModule.calcInvLotTotal()">'
                        + '<button type="button" onclick="InjectionWarehouseModule.removeInvLotRow(this)" style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                        + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                        + '</button>';
                    container.appendChild(row);
                    InjectionWarehouseModule.calcInvLotTotal();
                }, 80);
            }, 80);
        }, 80);
    }

    function openAddModal(type = '입고') {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        // 출고 시: 재고 > 0 인 차종만 표시
        let uniqueCarModels;
        if (type === '출고') {
            const stockMap = _calcStockMap();
            const carsWithStock = new Set(
                Object.values(stockMap)
                    .filter(v => v.stock > 0)
                    .map(v => v.carModel)
            );
            uniqueCarModels = [...new Set(materials.map(m => m.carModel).filter(Boolean))]
                .filter(c => carsWithStock.has(c))
                .sort();
        } else {
            uniqueCarModels = [...new Set(materials.map(m => m.carModel).filter(Boolean))].sort();
        }

        const colorClass = type === '출고' ? 'var(--accent-red)' : 'var(--accent-blue)';
        const titleIcon = type === '출고' ? 'do_not_disturb_on' : 'add_circle';

        UIUtils.showModal(`<span class="material-symbols-outlined" style="vertical-align:middle;color:${colorClass};">${titleIcon}</span> 사출 ${type} 등록`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${type}일시</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="addInvDate" value="${UIUtils.today()}">
                        <input type="time" class="form-input" id="addInvTime" value="${new Date().toTimeString().slice(0, 5)}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">구분</label>
                    <input type="text" class="form-input" id="addInvType" value="${type}" readonly style="background:var(--bg-secondary);font-weight:700;color:${colorClass}; text-align:center;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="addInvCarModel" onchange="InjectionWarehouseModule.onModalCarModelChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출명</label>
                    <select class="form-select" id="addInvPart" onchange="InjectionWarehouseModule.onModalPartChange()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 컬러</label>
                    <select class="form-select" id="addInvColor" onchange="InjectionWarehouseModule.onModalColorChange()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <div id="addInvSupplierDisplay" style="padding:8px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; color:var(--text-muted); font-size:0.92rem; min-height:38px; display:flex; align-items:center;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>
                    </div>
                    <input type="hidden" id="addInvSupplier">
                </div>
            </div>
            ${type === '출고' ? `
            <div class="form-row" id="outTypeRow">
                <div class="form-group" style="flex:none;">
                    <label class="form-label">출고 구분 <span style="color:var(--accent-red)">*</span></label>
                    <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="outgoingType" id="outTypeProduction" value="생산출고" checked
                                onchange="InjectionWarehouseModule.onOutTypeChange()">
                            <span style="font-weight:600;color:var(--accent-blue);">생산 출고</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="outgoingType" id="outTypeReturn" value="반출"
                                onchange="InjectionWarehouseModule.onOutTypeChange()">
                            <span style="font-weight:600;color:var(--accent-orange,#f59e0b);">반출</span>
                        </label>
                    </div>
                </div>
            </div>
            <div id="returnReasonGroup" style="display:none; margin-bottom:12px;">
                <label class="form-label">반출 사유 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="returnReasonInput" placeholder="반출 사유를 입력하세요" style="width:100%; box-sizing:border-box;">
            </div>` : ''}
            <div style="margin-bottom:16px;">

                ${type === '출고' ? `
                <div id="addInvStockArea" style="margin-bottom:10px; padding:10px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">
                    <div id="lotStockListContainer">
                        <label class="form-label" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:5px; display:block;">상세 LOT별 재고 (클릭 시 자동 입력)</label>
                        <div id="lotStockList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:white;">
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                        <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">현재 가용 재고 합계</span>
                        <span id="addInvCurrentStock" style="font-size:1.1rem; font-weight:700; color:var(--accent-blue);">0 EA</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;
                            background:rgba(239,68,68,0.05); border:1px solid var(--accent-red);
                            border-radius:8px; padding:10px 12px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-red); font-size:1.1rem;">auto_fix_high</span>
                    <span style="font-size:0.82rem; font-weight:600; white-space:nowrap; color:var(--text-secondary);">총 출고 수량</span>
                    <input type="number" id="fifoTotalQty" class="form-input" min="1" placeholder="수량 입력"
                        style="flex:1; max-width:120px; text-align:right;">
                    <span style="font-size:0.82rem; color:var(--text-muted);">EA</span>
                    <button type="button" class="btn btn-sm btn-danger"
                        onclick="InjectionWarehouseModule.autoFillFIFO()"
                        style="white-space:nowrap; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">playlist_add_check</span>
                        선입선출 자동 입력
                    </button>
                </div>` : `
                <div id="addInvStockArea" style="display:none; margin-bottom:10px; padding:10px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">
                    <div id="lotStockListContainer">
                        <label class="form-label" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:5px; display:block;">상세 LOT별 재고 (참조용)</label>
                        <div id="lotStockList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:white;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                        <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">현재 가용 재고 합계</span>
                        <span id="addInvCurrentStock" style="font-size:1.1rem; font-weight:700; color:var(--accent-blue);">0 EA</span>
                    </div>
                </div>`}

                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div id="invLotRows"></div>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.addInvLotRow()" style="margin-top:4px; display:flex; align-items:center; gap:4px; font-size:0.8rem;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">add</span> LOT 추가
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 ${type}수량</span>
                    <span id="invLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="addInvQty" value="0">
                <input type="hidden" id="addInvUnit" value="EA">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="addInvSource" placeholder="기타 특이사항">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn ${type === '출고' ? 'btn-danger' : 'btn-primary'}" onclick="InjectionWarehouseModule.saveNew()">확인</button>
        `);
        // 첫 LOT 행 초기화
        setTimeout(() => {
            addInvLotRow();
        }, 100);
    }

    /**
     * 컬러 드롭다운 갱신 — 사출자재 마스터(INJECTION_MATERIALS)의 injColor 기준
     * @param {string} carModel  - 선택된 차종
     * @param {string} partName  - 선택된 사출명 (없으면 차종 전체 스캔)
     */
    function _updateColorOptions(carModel, partName) {
        const colorSel = document.getElementById('addInvColor');
        if (!colorSel) return;

        if (!carModel) {
            colorSel.innerHTML = '<option value="">-- 차종 먼저 선택 --</option>';
            return;
        }

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

        // 사출명이 지정된 경우 해당 자재만, 아니면 차종 전체 자재 스캔
        const targets = partName
            ? materials.filter(m => m.carModel === carModel && m.injPartName === partName)
            : materials.filter(m => m.carModel === carModel);

        // injColor 파싱: 쉼표/공백 구분자로 여러 색상이 들어올 수 있음
        const colorSet = new Set();
        targets.forEach(m => {
            if (m.injColor) {
                m.injColor.split(/[,，、\/]/).map(c => c.trim()).filter(Boolean)
                    .forEach(c => colorSet.add(c));
            }
        });

        const colors = [...colorSet].sort();

        if (colors.length === 0) {
            colorSel.innerHTML = '<option value="">-- 컬러 정보 없음 --</option>';
            return;
        }

        colorSel.innerHTML = '<option value="">-- 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // 컬러가 1개뿐이면 자동 선택
        if (colors.length === 1) colorSel.value = colors[0];
    }

    // 선입선출(FIFO) 자동 LOT 입력
    function autoFillFIFO() {
        const totalQty = parseInt(document.getElementById('fifoTotalQty')?.value) || 0;
        if (totalQty <= 0) { UIUtils.toast('총 출고 수량을 입력해주세요.', 'warning'); return; }

        const carModel = document.getElementById('addInvCarModel')?.value || '';
        const partName = document.getElementById('addInvPart')?.value || '';
        const color    = document.getElementById('addInvColor')?.value || '';

        if (!carModel || !partName) { UIUtils.toast('차종과 품목을 먼저 선택해주세요.', 'warning'); return; }

        // LOT별 재고 계산
        const allStock = Storage.getAll(STORE) || [];
        const filtered = allStock.filter(s =>
            s.carModel === carModel &&
            s.partName === partName &&
            (color ? (s.color || '') === color : true)
        );

        const lotMap = {};
        filtered.forEach(s => {
            const lot = s.lotNo || '무표기';
            const qty = Number(s.quantity) || 0;
            if (!lotMap[lot]) lotMap[lot] = { qty: 0, date: s.date || '000000' };
            if (s.type === '출고') lotMap[lot].qty -= qty; else lotMap[lot].qty += qty;
        });

        // 재고 > 0 인 LOT를 날짜 오름차순(선입선출) 정렬
        const fifoLots = Object.entries(lotMap)
            .filter(([, v]) => v.qty > 0)
            .sort(([a], [b]) => a.localeCompare(b));

        if (fifoLots.length === 0) { UIUtils.toast('가용 재고가 없습니다.', 'error'); return; }

        // 총 가용 재고 확인
        const totalAvail = fifoLots.reduce((s, [, v]) => s + v.qty, 0);
        if (totalQty > totalAvail) {
            UIUtils.toast(`재고 부족! 가용 재고: ${totalAvail.toLocaleString()} EA`, 'error');
            return;
        }

        // FIFO 배분
        let remaining = totalQty;
        const allocations = [];
        for (const [lot, v] of fifoLots) {
            if (remaining <= 0) break;
            const allocQty = Math.min(remaining, v.qty);
            allocations.push({ lot, qty: allocQty });
            remaining -= allocQty;
        }

        // LOT 행 초기화 후 자동 채우기
        const container = document.getElementById('invLotRows');
        if (!container) return;
        container.innerHTML = '';

        allocations.forEach(({ lot, qty }) => {
            addInvLotRow();
            const rows = container.querySelectorAll('.inv-lot-row');
            const lastRow = rows[rows.length - 1];
            const lotInput = lastRow.querySelector('.inv-lot-no');
            const qtyInput = lastRow.querySelector('.inv-lot-qty');
            if (lotInput) lotInput.value = lot === '무표기' ? '' : lot;
            if (qtyInput) { qtyInput.value = qty; }
        });

        calcInvLotTotal();
        UIUtils.toast(`선입선출 자동 입력 완료 (${allocations.length}개 LOT, 총 ${totalQty.toLocaleString()} EA)`, 'success');
    }

    // 재고 맵 계산 헬퍼 (차종||품목||컬러 → {stock})
    function _calcStockMap() {
        const data = Storage.getAll(STORE);
        const m = {};
        data.forEach(d => {
            const qty = Number(d.quantity) || 0;
            const key = `${d.carModel||''}||${d.partName||''}||${d.color||''}`;
            if (!m[key]) m[key] = { carModel: d.carModel||'', partName: d.partName||'', color: d.color||'', stock: 0 };
            if (d.type === '출고') m[key].stock -= qty; else m[key].stock += qty;
        });
        return m;
    }

    function onModalCarModelChange() {
        const carModel = document.getElementById('addInvCarModel').value;
        const partSelect = document.getElementById('addInvPart');
        const supplierDisplay = document.getElementById('addInvSupplierDisplay');
        const supplierHidden  = document.getElementById('addInvSupplier');

        partSelect.innerHTML = '<option value="">-- 사출명 선택 --</option>';
        if (supplierDisplay) supplierDisplay.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>';
        if (supplierHidden)  supplierHidden.value = '';

        _updateColorOptions(carModel, '');   // 차종 전체 스캔 (사출명 미선택)
        const _typeForHide = document.getElementById('addInvType')?.value || '입고';
        if (_typeForHide !== '출고') document.getElementById('addInvStockArea').style.display = 'none';

        if (!carModel) return;

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const filtered = materials.filter(m => m.carModel === carModel);
        const type = document.getElementById('addInvType')?.value || '입고';

        let partNames;
        if (type === '출고') {
            // 출고 시: 해당 차종에서 재고 > 0 인 품목만
            const stockMap = _calcStockMap();
            const partsWithStock = new Set(
                Object.values(stockMap)
                    .filter(v => v.carModel === carModel && v.stock > 0)
                    .map(v => v.partName)
            );
            partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))]
                .filter(p => partsWithStock.has(p))
                .sort();
        } else {
            partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
        }

        partSelect.innerHTML = '<option value="">-- 사출명 선택 --</option>' +
            partNames.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function onModalPartChange() {
        const carModel = document.getElementById('addInvCarModel').value;
        const partName = document.getElementById('addInvPart').value;
        const supplierDisplay = document.getElementById('addInvSupplierDisplay');
        const supplierHidden  = document.getElementById('addInvSupplier');
        const stockArea = document.getElementById('addInvStockArea');

        const _type2 = document.getElementById('addInvType')?.value || '입고';
        if (!carModel || !partName) {
            if (supplierDisplay) supplierDisplay.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>';
            if (supplierHidden)  supplierHidden.value = '';
            if (_type2 !== '출고') stockArea.style.display = 'none';
            return;
        }

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const material = materials.find(m => m.carModel === carModel && m.injPartName === partName);

        const supplierText = (material && material.supplier) ? material.supplier : '-';
        if (supplierDisplay) {
            supplierDisplay.innerHTML = `<strong style="color:var(--text-primary);">${supplierText}</strong>`;
        }
        if (supplierHidden) supplierHidden.value = supplierText;

        // 단위 갱신
        const unitEl = document.getElementById('addInvUnit');
        if (unitEl && material && material.unit) unitEl.value = material.unit;

        // 사출자재 마스터 injColor 기준으로 컬러 옵션 갱신 (사출명 확정 후)
        _updateColorOptions(carModel, partName);

        // 재고 계산 및 표시
        updateLotStockList(carModel, partName);
    }

    function updateLotStockList(carModel, partName) {
        const stockArea = document.getElementById('addInvStockArea');
        const stockDisplay = document.getElementById('addInvCurrentStock');
        const lotList = document.getElementById('lotStockList');
        const type = document.getElementById('addInvType').value;

        const color = (document.getElementById('addInvColor') || {}).value || '';
        const allStock = Storage.getAll(STORE) || [];
        const filteredStock = allStock.filter(s =>
            s.carModel === carModel &&
            s.partName === partName &&
            (!color || (s.color || '') === color)
        );

        // LOT별 집계
        const stockMap = {};
        let totalQty = 0;

        filteredStock.forEach(s => {
            const lot = s.lotNo || '무표기';
            const qty = Number(s.quantity) || 0;
            if (!stockMap[lot]) stockMap[lot] = 0;

            if (s.type === '출고') {
                stockMap[lot] -= qty;
                totalQty -= qty;
            } else {
                stockMap[lot] += qty;
                totalQty += qty;
            }
        });

        stockDisplay.textContent = `${totalQty.toLocaleString()} EA`;
        stockDisplay.style.color = (type === '출고' && totalQty <= 0) ? 'var(--accent-red)' : 'var(--accent-blue)';

        let displayLots = Object.entries(stockMap).map(([lot, qty]) => ({
            lot,
            qty
        }));
        if (type === '출고') displayLots = displayLots.filter(item => item.qty > 0);
        displayLots.sort((a, b) => a.lot.localeCompare(b.lot));

        if (displayLots.length === 0) {
            lotList.innerHTML = '<div style="padding:10px; color:var(--text-muted); text-align:center; font-size:0.8rem;">기존 재고 기록이 없습니다.</div>';
        } else {
            lotList.innerHTML = displayLots.map(item => {
                const isSelectable = type === '출고' && item.qty > 0;
                const cursor = isSelectable ? 'cursor:pointer;' : 'cursor:default;';
                const hover = isSelectable ? `onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='white'"` : '';
                const click = isSelectable ? `onclick="InjectionWarehouseModule.onLotItemSelect('${item.lot}', ${item.qty})"` : '';

                return `
                    <div ${click} ${hover} style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--border); ${cursor} font-size:0.82rem;">
                        <span style="font-weight:600;">LOT: ${item.lot}</span>
                        <span style="color:${item.qty > 0 ? 'var(--accent-blue)' : 'var(--text-muted)'}; font-weight:700;">${item.qty.toLocaleString()} EA</span>
                    </div>`;
            }).join('');
        }

        stockArea.style.display = 'block';
    }

    function onLotItemSelect(lot, qty) {
        const container = document.getElementById('invLotRows');
        if (!container) return;
        const lotNo = lot === '무표기' ? '' : lot;

        // 이미 같은 LOT 행이 있으면 해당 행 포커스
        const existingRows = container.querySelectorAll('.inv-lot-row');
        for (const row of existingRows) {
            const lotInput = row.querySelector('.inv-lot-no');
            if (lotInput && lotInput.value === lotNo) {
                const qtyInput = row.querySelector('.inv-lot-qty');
                if (qtyInput) {
                    qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                    qtyInput.focus();
                }
                UIUtils.toast(`LOT ${lot} 행에 수량을 입력하세요 (가용: ${qty.toLocaleString()} EA)`, 'info');
                return;
            }
        }

        // 빈 LOT 행이 있으면 채우기, 없으면 새 행 추가
        let filled = false;
        for (const row of existingRows) {
            const lotInput = row.querySelector('.inv-lot-no');
            const qtyInput = row.querySelector('.inv-lot-qty');
            if (lotInput && !lotInput.value.trim()) {
                lotInput.value = lotNo;
                if (qtyInput) {
                    qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                    qtyInput.focus();
                }
                filled = true;
                break;
            }
        }
        if (!filled) {
            addInvLotRow();
            const rows = container.querySelectorAll('.inv-lot-row');
            const lastRow = rows[rows.length - 1];
            const lotInput = lastRow.querySelector('.inv-lot-no');
            const qtyInput = lastRow.querySelector('.inv-lot-qty');
            if (lotInput) lotInput.value = lotNo;
            if (qtyInput) {
                qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                qtyInput.focus();
            }
        }
        UIUtils.toast(`LOT ${lot} 선택됨 (가용: ${qty.toLocaleString()} EA) — 수량을 입력하세요`, 'info');
    }

    // 컬러 변경 → LOT 재고 목록 갱신
    function onModalColorChange() {
        const carModel = (document.getElementById('addInvCarModel') || {}).value || '';
        const partName = (document.getElementById('addInvPart') || {}).value || '';
        if (carModel && partName) updateLotStockList(carModel, partName);
    }

    // 출고 구분 변경 → 반출 사유 표시/숨김
    function onOutTypeChange() {
        const isReturn = document.getElementById('outTypeReturn')?.checked;
        const reasonGroup = document.getElementById('returnReasonGroup');
        if (reasonGroup) reasonGroup.style.display = isReturn ? '' : 'none';
        if (!isReturn) {
            const reasonInput = document.getElementById('returnReasonInput');
            if (reasonInput) reasonInput.value = '';
        }
    }

    function addInvLotRow() {
        const container = document.getElementById('invLotRows');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'inv-lot-row';
        div.style.cssText = 'display:grid; grid-template-columns:100px 1fr 34px; gap:8px; align-items:center; margin-bottom:6px;';
        div.innerHTML = '<input type="text" class="form-input inv-lot-no" placeholder="YYMMDD (필수)" maxlength="6"'
            + ' style="font-family:monospace; letter-spacing:1px;"'
            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); this.style.borderColor=this.value?\'\':\'\' ;">'
            + '<input type="number" class="form-input inv-lot-qty" min="0" placeholder="0"'
            + ' style="text-align:right;"'
            + ' oninput="InjectionWarehouseModule.calcInvLotTotal()">'
            + '<button type="button" onclick="InjectionWarehouseModule.removeInvLotRow(this)"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
            + '</button>';
        container.appendChild(div);
    }

    function removeInvLotRow(btn) {
        const row = btn.closest('.inv-lot-row');
        if (!row) return;
        const container = document.getElementById('invLotRows');
        if (container && container.querySelectorAll('.inv-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
        calcInvLotTotal();
    }

    function calcInvLotTotal() {
        const qtyInputs = document.querySelectorAll('#invLotRows .inv-lot-qty');
        let total = 0;
        qtyInputs.forEach(function(inp) { total += (Number(inp.value) || 0); });
        const totalEl = document.getElementById('invLotTotalQty');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
        const hiddenEl = document.getElementById('addInvQty');
        if (hiddenEl) hiddenEl.value = total;
    }

    async function saveNew() {
        const dateVal = document.getElementById('addInvDate').value;
        const timeVal = document.getElementById('addInvTime').value;

        // LOT 목록 수집 + 필수 입력 검사
        const lotRows = document.querySelectorAll('#invLotRows .inv-lot-row');
        const lots = [];
        let lotValid = true;
        lotRows.forEach(function(row) {
            const lotInput = row.querySelector('.inv-lot-no');
            const qtyInput = row.querySelector('.inv-lot-qty');
            const lotNo = (lotInput ? lotInput.value : '').trim();
            const qty = Number(qtyInput ? qtyInput.value : 0) || 0;

            // LOT 번호 필수 검사
            if (!lotNo) {
                if (lotInput) {
                    lotInput.style.borderColor = 'var(--accent-red)';
                    lotInput.focus();
                }
                lotValid = false;
            } else {
                if (lotInput) lotInput.style.borderColor = '';
                lots.push({ lotNo: lotNo, qty: qty });
            }
        });

        if (!lotValid) {
            UIUtils.toast('LOT 번호는 필수 입력 항목입니다.', 'error');
            return;
        }

        if (lots.length === 0) {
            UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
            return;
        }

        const totalQty = lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const _invCarModel = document.getElementById('addInvCarModel').value;
        const _invPartName = document.getElementById('addInvPart').value;

        // v19: injMaterialId — injection_materials에서 carModel+injPartName으로 ID 조회
        var _allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        var _matMatch = _allMats.find(function(m) {
            return m.injPartName === _invPartName && m.carModel === _invCarModel;
        }) || _allMats.find(function(m) {
            return m.injPartName === _invPartName;
        });
        var _injMaterialId = _matMatch ? _matMatch.id : '';

        const _type = document.getElementById('addInvType').value;

        // 출고 구분 (생산출고 / 반출)
        let _outgoingType = '';
        let _returnReason = '';
        if (_type === '출고') {
            const outTypeEl = document.querySelector('input[name="outgoingType"]:checked');
            _outgoingType = outTypeEl ? outTypeEl.value : '생산출고';
            if (_outgoingType === '반출') {
                _returnReason = ((document.getElementById('returnReasonInput') || {}).value || '').trim();
                if (!_returnReason) {
                    UIUtils.toast('반출 사유를 입력하세요.', 'warning');
                    document.getElementById('returnReasonInput')?.focus();
                    return;
                }
            }
        }

        const data = {
            date: `${dateVal} ${timeVal}`.trim(),
            type: _type,
            outgoingType: _outgoingType || undefined,   // 생산출고 / 반출
            returnReason: _returnReason || undefined,    // 반출 사유
            carModel: _invCarModel,
            partName: _invPartName,
            color: (document.getElementById('addInvColor') || {}).value || '',
            supplier: (document.getElementById('addInvSupplier') || {}).value || '',
            lots: lots,
            lotNo: lots.length > 0 ? lots[0].lotNo : '',
            quantity: totalQty,
            unit: (document.getElementById('addInvUnit') || { value: 'EA', textContent: 'EA' }).value || 'EA',
            source: ((document.getElementById('addInvSource') || {}).value || '').trim(),
            injMaterialId: _injMaterialId || undefined  // v19
        };

        if (!data.carModel || !data.partName) {
            UIUtils.toast('차종과 품명을 선택하세요.', 'warning');
            return;
        }

        if (data.quantity <= 0) {
            UIUtils.toast('수량을 입력하세요.', 'warning');
            return;
        }

        // 출고 시 재고 체크
        if (data.type === '출고') {
            const allStock = Storage.getAll(STORE) || [];
            const filtered = allStock.filter(s => s.carModel === data.carModel && s.partName === data.partName && (s.lotNo || '무표기') === (data.lotNo || '무표기'));

            let lotAvailable = 0;
            filtered.forEach(s => {
                if (s.type === '출고') lotAvailable -= (Number(s.quantity) || 0);
                else lotAvailable += (Number(s.quantity) || 0);
            });

            if (data.quantity > lotAvailable) {
                UIUtils.toast(`해당 LOT의 가용 재고(${lotAvailable.toLocaleString()} EA)를 초과할 수 없습니다.`, 'danger');
                return;
            }
        }
        if (data.quantity <= 0) {
            UIUtils.toast('유효한 수량을 입력하세요.', 'warning');
            return;
        }

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast(`${data.type} 등록이 완료되었습니다.`, 'success');
        loadData();
    }

    function remove(id) {
        UIUtils.confirm('이 재고 기록을 삭제하시겠습니까? (삭제 시 실제 재고량에 직접 반영됩니다.)', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
        });
    }

    function openEditModal(id) {
        const d = Storage.getById(STORE, id);
        if (!d) { UIUtils.toast('기록을 찾을 수 없습니다.', 'error'); return; }
        const typeColor = d.type === '출고' ? 'var(--accent-red)' : 'var(--accent-blue)';
        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:${typeColor};margin-right:4px;">edit</span> 입출고 이력 수정`,
            `<div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:14px;font-size:0.85rem;">
                <div style="display:flex;gap:16px;flex-wrap:wrap;">
                    <span><strong>일자:</strong> ${d.date || '-'} ${d.time || ''}</span>
                    <span><strong>구분:</strong> <span style="color:${typeColor};font-weight:700;">${d.type || '-'}</span></span>
                    <span><strong>차종:</strong> ${d.carModel || '-'}</span>
                    <span><strong>품명:</strong> ${d.partName || '-'}</span>
                    <span><strong>컬러:</strong> ${d.color || '-'}</span>
                    <span><strong>LOT:</strong> ${d.lotNo || (d.lots ? d.lots.map(l=>l.lotNo).join(', ') : '-')}</span>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="editInvQty" value="${d.quantity || 0}" min="1"
                        style="font-size:1.1rem;font-weight:700;text-align:right;">
                </div>
                ${d.type === '출고' ? `
                <div class="form-group">
                    <label class="form-label">출고 구분</label>
                    <input type="text" class="form-input" value="${d.outgoingType || '생산출고'}" readonly
                        style="background:var(--bg-secondary);">
                </div>` : ''}
            </div>
            ${d.returnReason ? `
            <div class="form-group">
                <label class="form-label">반출 사유</label>
                <input type="text" class="form-input" id="editReturnReason" value="${d.returnReason || ''}">
            </div>` : ''}
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="editInvNote" value="${d.note || ''}" placeholder="특이사항">
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="InjectionWarehouseModule.saveEdit('${id}')">저장</button>`
        );
    }

    async function saveEdit(id) {
        const qtyEl = document.getElementById('editInvQty');
        const qty = Number((qtyEl || {}).value) || 0;
        if (!qty) { UIUtils.toast('수량을 입력하세요.', 'warning'); if (qtyEl) qtyEl.focus(); return; }
        const note        = (document.getElementById('editInvNote') || {}).value || '';
        const returnReason = (document.getElementById('editReturnReason') || {}).value || undefined;
        const updates = { quantity: qty, note };
        if (returnReason !== undefined) updates.returnReason = returnReason;
        await Storage.update(STORE, id, updates);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadData();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['일자', '차종', '사출명', '컬러', '사출처', 'LOT번호', '단위', '수량', '유형', '비고'];
        const rows = data.map(d => [
            d.date || '',
            d.carModel || '',
            d.partName || '',
            d.color || '',
            d.supplier || '',
            d.lotNo || '',
            d.unit || 'EA',
            d.quantity || 0,
            d.type || '입고',
            d.source || ''
        ]);
        Storage.exportToCSV(headers, rows, '사출창고_입출고현황');
        UIUtils.toast('CSV 데이터 내보내기 성공', 'success');
    }

    function onLotInput(input, msgId) {
        // 숫자만 허용
        const val = input.value.replace(/\D/g, '').slice(0, 6);
        input.value = val;

        const msg = document.getElementById(msgId);
        if (!msg) return;

        if (val.length === 0) {
            msg.innerHTML = '';
            input.style.borderColor = '';
            return;
        }

        if (val.length < 6) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ ${6 - val.length}자리 더 입력하세요 (현재 ${val.length}/6)</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        // 6자리 도달 — 날짜 유효성 확인 (YYMMDD)
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        const yyStr = val.slice(0, 2);
        const yyNum = parseInt(yyStr, 10);

        const fullYear = yyNum >= 50 ? 1900 + yyNum : 2000 + yyNum;
        const inputDate = new Date(fullYear, mm - 1, dd);

        if (inputDate.getFullYear() !== fullYear || inputDate.getMonth() !== mm - 1 || inputDate.getDate() !== dd) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 유효하지 않은 날짜입니다 (월: ${mm}, 일: ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (inputDate > today) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 오늘 이후(미래)의 날짜입니다</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        msg.innerHTML = `<span style="color:var(--accent-green);">✓ ${fullYear}년 ${String(mm).padStart(2, '0')}월 ${String(dd).padStart(2, '0')}일</span>`;
        input.style.borderColor = 'var(--accent-green)';
    }

    function showStockModal() {
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        // 차종+품명 기준으로 현재고 + LOT + 재공금액 집계
        const stockMap = {};
        data.forEach(d => {
            const color = d.color || '-';
            const key = `${d.carModel}_${d.partName}_${color}`;
            if (!stockMap[key]) {
                const mat = materials.find(m => m.carModel === d.carModel && m.injPartName === d.partName);
                stockMap[key] = {
                    carModel: d.carModel || '-',
                    partName: d.partName || '-',
                    color: color,
                    supplier: d.supplier || '-',
                    unit: d.unit || 'EA',
                    price: Number(mat ? mat.unitPrice : 0) || 0,
                    qty: 0,
                    lots: new Set()
                };
            }
            const qty = Number(d.quantity) || 0;
            if (d.type === '출고') {
                stockMap[key].qty -= qty;
            } else {
                stockMap[key].qty += qty;
                if (d.lotNo) stockMap[key].lots.add(d.lotNo);
            }
        });

        const rows = Object.values(stockMap).map(r => ({
            ...r,
            lots: Array.from(r.lots).sort()
        })).sort((a, b) => a.carModel.localeCompare(b.carModel) || a.partName.localeCompare(b.partName) || a.color.localeCompare(b.color));

        const carModels = [...new Set(rows.map(r => r.carModel).filter(c => c !== '-'))].sort();

        const tableRows = rows.length === 0 ?
            `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>` :
            rows.map(r => {
                const qtyColor = r.qty <= 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
                const lotBadges = r.lots.length > 0 ?
                    r.lots.map(l => `<span class="lot-badge-sm">${l}</span>`).join('') :
                    '<span style="color:var(--text-muted)">-</span>';
                return `
                    <tr data-car-model="${r.carModel}">
                        <td>${r.carModel}</td>
                        <td><strong>${r.partName}</strong></td>
                        <td>${r.color !== '-' ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.8rem;background:var(--bg-secondary);border:1px solid var(--border);">${r.color}</span>` : '-'}</td>
                        <td style="text-align:right;">${UIUtils.formatNumber(r.price)}</td>
                        <td style="text-align:right;font-weight:700;color:${qtyColor};">
                            ${UIUtils.formatNumber(r.qty)}<span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);margin-left:3px;">${r.unit}</span>
                        </td>
                        <td><div style="display:flex; flex-wrap:wrap; gap:4px;">${lotBadges}</div></td>
                    </tr>`;
            }).join('');

        UIUtils.showModal('사출 자재 현재 재고 현황', `
            <style>
                .lot-badge-sm {
                    display:inline-block;
                    background:var(--bg-primary);
                    border:1px solid var(--border);
                    border-radius:4px;
                    padding:1px 6px;
                    font-size:0.75rem;
                    color:var(--text-secondary);
                }
            </style>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);">filter_alt</span>
                <select class="form-select" id="injStockCarFilter" style="max-width:200px;"
                        onchange="InjectionWarehouseModule.filterStock()">
                    <option value="">전체 차종</option>
                    ${carModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <span style="font-size:0.82rem;color:var(--text-muted);">총 ${rows.length}개 품목</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>차종</th>
                            <th>사출명</th>
                            <th>컬러</th>
                            <th style="text-align:right;">단가</th>
                            <th style="text-align:right;">현재고</th>
                            <th>LOT 목록</th>
                        </tr>
                    </thead>
                    <tbody id="injStockTableBody">${tableRows}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
        `, 'lg');
    }

    function filterStock() {
        const carModel = document.getElementById('injStockCarFilter').value;
        const rows = document.querySelectorAll('#injStockTableBody tr[data-car-model]');
        rows.forEach(row => {
            row.style.display = (!carModel || row.dataset.carModel === carModel) ? '' : 'none';
        });
    }

    // ── 예약 집계 상세 팝업 ──────────────────────────────────────────
    // 사출 창고 목록의 예약 뱃지 클릭 시 호출 — 당일 계획 / 미입력 실적 분리 표시
    function showReserveDetailPopup(event, encPart, encModel, encColor) {
        event.stopPropagation();

        const partName = decodeURIComponent(encPart);
        const carModel = decodeURIComponent(encModel);
        const color    = decodeURIComponent(encColor);

        // 기존 팝업이 같은 뱃지를 다시 클릭한 경우 닫기 (토글)
        const oldPopup = document.getElementById('injReserveDetailPopup');
        if (oldPopup) {
            oldPopup.remove();
            if (oldPopup.dataset.key === `${partName}|${carModel}|${color}`) return;
        }

        const detail = (typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule._getInjReserveDetail)
            ? ProductionPlanModule._getInjReserveDetail(partName, carModel, color)
            : { pendingPlans: [], inProgressPlans: [], pendingTotal: 0, inProgressTotal: 0 };

        const { pendingPlans, inProgressPlans, pendingTotal, inProgressTotal } = detail;
        const totalReserved = pendingTotal + inProgressTotal;

        // 계획 목록 행 생성
        function _rows(plans, color) {
            if (!plans.length) return `<div style="font-size:0.75rem;color:var(--text-muted);padding:4px 0;">해당 없음</div>`;
            return plans.map(p => `
                <div style="display:flex;gap:6px;align-items:center;font-size:0.75rem;padding:3px 0;border-bottom:1px solid var(--border-color);">
                    <span style="color:var(--text-muted);min-width:78px;flex-shrink:0;">${p.date || '-'}</span>
                    <span style="flex:1;color:var(--text-secondary);">${p.line || '-'}</span>
                    <span style="font-weight:700;white-space:nowrap;">${UIUtils.formatNumber(p.planQty)} 개</span>
                    <span style="font-size:0.68rem;background:${color};border-radius:3px;padding:0 4px;white-space:nowrap;">${p.status}</span>
                </div>`).join('');
        }

        // 미입력 실적 — 클릭 시 생산계획 페이지로 이동
        function _clickableRows(plans, bgColor) {
            if (!plans.length) return `<div style="font-size:0.75rem;color:var(--text-muted);padding:4px 0;">해당 없음</div>`;
            return plans.map(p => `
                <div data-plan-date="${p.date || ''}" data-plan-id="${p.id || ''}"
                     style="display:flex;gap:6px;align-items:center;font-size:0.75rem;padding:4px 6px;
                            border-bottom:1px solid var(--border-color);cursor:pointer;border-radius:4px;
                            transition:background 0.15s;"
                     onmouseover="this.style.background='rgba(234,88,12,0.1)'"
                     onmouseout="this.style.background=''"
                     onclick="InjectionWarehouseModule._goToPlan(this)">
                    <span class="material-symbols-outlined" style="font-size:13px;color:#ea580c;flex-shrink:0;">open_in_new</span>
                    <span style="color:var(--text-muted);min-width:78px;flex-shrink:0;">${p.date || '-'}</span>
                    <span style="flex:1;color:var(--text-secondary);">${p.line || '-'}</span>
                    <span style="font-weight:700;white-space:nowrap;">${UIUtils.formatNumber(p.planQty)} 개</span>
                    <span style="font-size:0.68rem;background:${bgColor};border-radius:3px;padding:0 4px;white-space:nowrap;">${p.status}</span>
                </div>`).join('');
        }

        const popup = document.createElement('div');
        popup.id = 'injReserveDetailPopup';
        popup.dataset.key = `${partName}|${carModel}|${color}`;
        popup.style.cssText = [
            'position:fixed','z-index:9999',
            'background:var(--bg-primary,#fff)',
            'border:1.5px solid var(--border-color)',
            'border-radius:10px',
            'box-shadow:0 8px 28px rgba(0,0,0,0.2)',
            'padding:14px 16px',
            'min-width:250px','max-width:340px',
            'font-family:inherit'
        ].join(';');

        popup.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span style="font-weight:700;font-size:0.9rem;display:flex;align-items:center;gap:5px;">
                    <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-blue);">event_note</span>
                    예약 집계 상세
                </span>
                <span style="font-size:0.75rem;color:var(--text-muted);background:var(--bg-secondary);
                             padding:2px 7px;border-radius:10px;">${partName} ${color || ''}</span>
            </div>

            <!-- 요약 카드 -->
            <div style="background:var(--bg-secondary);border-radius:7px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                    <span style="font-size:0.83rem;color:var(--text-secondary);">당일 계획 (대기)</span>
                    <span style="font-weight:700;color:var(--accent-blue);font-size:0.92rem;">${UIUtils.formatNumber(pendingTotal)} 개</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                    <span style="font-size:0.83rem;color:var(--text-secondary);">미입력 실적</span>
                    <span style="font-weight:700;color:${inProgressTotal > 0 ? '#ea580c' : 'var(--text-muted)'};font-size:0.92rem;">${UIUtils.formatNumber(inProgressTotal)} 개</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:6px 0 2px;margin-top:4px;border-top:1.5px solid var(--border-color);">
                    <span style="font-size:0.85rem;font-weight:600;">합계 예약</span>
                    <span style="font-weight:800;color:var(--accent-red);font-size:0.98rem;">${UIUtils.formatNumber(totalReserved)} 개</span>
                </div>
            </div>

            <!-- 대기 계획 목록 -->
            ${pendingPlans.length > 0 ? `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.76rem;font-weight:600;color:var(--accent-blue);
                            margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">schedule</span>
                    대기 계획 (${pendingPlans.length}건)
                </div>
                <div style="max-height:90px;overflow-y:auto;">
                    ${_rows(pendingPlans, 'rgba(234,179,8,0.15)')}
                </div>
            </div>` : ''}

            <!-- 미입력 실적 목록 -->
            ${inProgressPlans.length > 0 ? `
            <div>
                <div style="font-size:0.76rem;font-weight:600;color:#ea580c;
                            margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">warning</span>
                    미입력 실적 (${inProgressPlans.length}건)
                </div>
                <div style="max-height:90px;overflow-y:auto;">
                    ${_clickableRows(inProgressPlans, 'rgba(234,88,12,0.12)')}
                </div>
            </div>` : ''}

            <div style="margin-top:8px;text-align:center;font-size:0.68rem;color:var(--text-muted);">
                미입력 실적 클릭 시 해당 계획으로 이동
            </div>`;

        // 위치 지정 (화면 경계 보정)
        document.body.appendChild(popup);
        const rect = event.currentTarget.getBoundingClientRect();
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        let left = rect.left;
        let top  = rect.bottom + 6;
        if (left + pw > window.innerWidth  - 10) left = window.innerWidth  - pw - 10;
        if (left < 10) left = 10;
        if (top  + ph > window.innerHeight - 10) top  = rect.top - ph - 6;
        if (top  < 10) top  = 10;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';

        // 외부 클릭 시 닫기 (팝업 내부 클릭은 닫지 않음 — 미입력 실적 행 클릭 허용)
        const _close = (e) => {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _close); }
        };
        setTimeout(() => document.addEventListener('click', _close), 10);
    }

    // 미입력 실적 행 클릭 → 생산계획 페이지로 이동
    function _goToPlan(rowEl) {
        const date = rowEl.dataset.planDate;
        const popup = document.getElementById('injReserveDetailPopup');
        if (popup) popup.remove();
        if (typeof Router !== 'undefined') {
            Router.navigate('production-plan');
            if (date && typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule.selectDate) {
                setTimeout(() => ProductionPlanModule.selectDate(date), 300);
            }
        }
    }

    return {
        render,
        loadData,
        renderInspStandby,
        renderCarTiles,
        filterTransactions,
        onTxCarChange,
        showPartDetail,
        openAddModal,
        openAddFromInspection,
        onModalCarModelChange,
        onModalPartChange,
        onModalColorChange,
        onOutTypeChange,
        updateLotStockList,
        onLotItemSelect,
        autoFillFIFO,
        addInvLotRow,
        removeInvLotRow,
        calcInvLotTotal,
        saveNew,
        remove,
        openEditModal,
        saveEdit,
        exportData,
        onLotInput,
        showStockModal,
        filterStock,
        showReserveDetailPopup,
        _goToPlan
    };
})();
