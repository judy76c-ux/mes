/**
 * 사출 공정 모듈
 * - 사출 입고 (수입검사일지)
 * - 사출 창고 (자재 재고관리)
 */

// ===================================================================
// 사출 입고 (수입검사일지)
// ===================================================================
var InjectionIncomingModule = (function() {
            const STORE = DB.STORES.INJECTION_INSPECTIONS;
            const INV_STORE = DB.STORES.INJECTION_INVENTORY;

            function render(container) {
                container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>사출 입고 (수입검사일지)</h3>
                        <p>사출 자재 입고 시 수입검사를 기록합니다.</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="InjectionIncomingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 검사 등록
                        </button>
                        <button class="btn btn-secondary" onclick="InjectionIncomingModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="injInspStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="injInspEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="injInspCarModel" onchange="InjectionIncomingModule.onFilterCarModelChange()" style="min-width:130px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">품목</label>
                        <select class="form-select" id="injInspPartName" style="min-width:150px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="InjectionIncomingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                        <button class="btn btn-secondary" onclick="InjectionIncomingModule.resetFilter()" style="margin-left:6px;">
                            <span class="material-symbols-outlined">refresh</span> 초기화
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="injInspStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일자</th>
                                        <th>사출 LOT</th>
                                        <th>성적서 접수</th>
                                        <th>품명</th>
                                        <th>입고수량</th>
                                        <th>시료코드</th>
                                        <th>검사수량</th>
                                        <th>Ac/Re</th>
                                        <th>합격</th>
                                        <th>불합격</th>
                                        <th>사출처</th>
                                        <th>판정</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="injInspTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
                search();
            }

            function _populateFilterDropdowns(allData) {
                // 차종 드롭다운
                const carModelEl = document.getElementById('injInspCarModel');
                if (carModelEl) {
                    const prevCar = carModelEl.value;
                    const carModels = [...new Set(allData.map(d => d.carModel).filter(Boolean))].sort();
                    carModelEl.innerHTML = '<option value="">전체</option>' +
                        carModels.map(m => `<option value="${m}" ${m === prevCar ? 'selected' : ''}>${m}</option>`).join('');
                }
            }

            function onFilterCarModelChange() {
                const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
                const allData = Storage.getAll(STORE);
                const partNameEl = document.getElementById('injInspPartName');
                if (!partNameEl) return;
                const prevPart = partNameEl.value;
                const parts = [...new Set(
                    allData.filter(d => !carModel || d.carModel === carModel)
                    .map(d => d.partName).filter(Boolean)
                )].sort();
                partNameEl.innerHTML = '<option value="">전체</option>' +
                    parts.map(p => `<option value="${p}" ${p === prevPart ? 'selected' : ''}>${p}</option>`).join('');
            }

            function resetFilter() {
                const startEl = document.getElementById('injInspStart');
                const endEl = document.getElementById('injInspEnd');
                const carEl = document.getElementById('injInspCarModel');
                const partEl = document.getElementById('injInspPartName');
                if (startEl) startEl.value = UIUtils.monthAgo();
                if (endEl) endEl.value = UIUtils.today();
                if (carEl) carEl.value = '';
                if (partEl) {
                    partEl.innerHTML = '<option value="">전체</option>';
                }
                search();
            }

            function search() {
                const start = document.getElementById('injInspStart').value;
                const end = document.getElementById('injInspEnd').value;
                const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
                const partName = (document.getElementById('injInspPartName') || {}).value || '';

                let data = Storage.getByDateRange(STORE, start, end);

                // 차종 필터
                if (carModel) data = data.filter(d => d.carModel === carModel);
                // 품목 필터
                if (partName) data = data.filter(d => d.partName === partName);

                data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                // 전체 데이터로 드롭다운 갱신 (날짜 범위 기준)
                const allInRange = Storage.getByDateRange(STORE, start, end);
                _populateFilterDropdowns(allInRange);
                // 차종 선택된 경우 품목 드롭다운도 갱신
                onFilterCarModelChange();
                // 선택값 복원
                if (carModel) {
                    const carEl = document.getElementById('injInspCarModel');
                    if (carEl) carEl.value = carModel;
                }
                if (partName) {
                    const partEl = document.getElementById('injInspPartName');
                    if (partEl) partEl.value = partName;
                }

                renderStats(data);
                renderTable(data);
            }

            function renderStats(data) {
                const totalQty = data.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0);
                const passQty = data.reduce((s, d) => s + (Number(d.passQty) || 0), 0);
                const failQty = data.reduce((s, d) => s + (Number(d.failQty) || 0), 0);

                document.getElementById('injInspStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">검사 건수</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">입고 수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(passQty)}</div>
                <div class="stat-card-label">합격 수량</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${UIUtils.formatNumber(failQty)}</div>
                <div class="stat-card-label">불합격 수량</div>
            </div>
        `;
            }

            function renderTable(data) {
                const tbody = document.getElementById('injInspTableBody');

                if (data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
                    return;
                }

                tbody.innerHTML = data.map(d => {
                    const verdict = (Number(d.failQty) || 0) === 0 ? 'success' : 'danger';
                    const verdictText = (Number(d.failQty) || 0) === 0 ? '합격' : '불합격';
                    // 사출 LOT 목록 (전체)
                    const lotList = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
                    // 성적서 미접수 여부
                    const certMissing = lotList.some(l => !l.certReceived);
                    // 사출 LOT 컬럼: 전체 LOT 번호 나열
                    const injLotDisplay = lotList.map(l =>
                        `<span style="display:inline-block;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.8rem;margin:1px;font-family:monospace;font-weight:600;">${l.lotNo || '-'}</span>`
                    ).join('');
                    // 성적서 접수 컬럼: 접수된 LOT ✓, 미접수 아이콘
                    const certDisplay = lotList.map(l => l.certReceived
                        ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#dcfce7;border:1px solid #86efac;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#16a34a;font-weight:600;">
                             <span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>${l.lotNo || '-'}
                           </span>`
                        : `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#dc2626;font-weight:600;" title="성적서 미접수">
                             <span class="material-symbols-outlined" style="font-size:0.9rem;">cancel</span>${l.lotNo || '-'}
                           </span>`
                    ).join('');
                    const rowStyle = certMissing ? ' style="background:rgba(220,38,38,0.05);"' : '';
                    return `
                <tr${rowStyle}>
                    <td>${d.date}</td>
                    <td>${injLotDisplay}</td>
                    <td>${certDisplay}</td>
                    <td>${d.partName || '-'}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.incomingQty)}</td>
                    <td style="text-align:center;font-weight:600;color:var(--accent-blue)">${d.sampleCode || '-'}</td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.inspectionQty)}</td>
                    <td style="text-align:center;font-size:0.82rem;color:var(--text-secondary)">${d.acCriteria != null ? d.acCriteria + '/' + d.reCriteria : '-'}</td>
                    <td style="text-align:right;color:var(--accent-green)">${UIUtils.formatNumber(d.passQty)}</td>
                    <td style="text-align:right;color:var(--accent-red)">${UIUtils.formatNumber(d.failQty)}</td>
                    <td>${d.supplierName || '-'}</td>
                    <td>${UIUtils.badge(verdictText, verdict)}</td>
                    <td>
                        <div style="font-size:0.8rem;color:var(--accent-red);margin-bottom:2px;">
                            ${Object.entries(d.defectDetails || {}).map(([k, v]) => `${k}(${v})`).join(', ')}
                        </div>
                        ${d.note || '-'}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="InjectionIncomingModule.edit('${d.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="InjectionIncomingModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `;
                }).join('');
            }

            function openAddModal() {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
                const carModels = [...new Set(materials.map(m => m.carModel).filter(Boolean))].sort();
                const carModelOptions = carModels.map(c => `<option value="${c}">${c}</option>`).join('');

                const inspectors = Storage.getAll(DB.STORES.INSPECTORS);
                const inspectorOptions = inspectors.map(i => `<option value="${i.name}">${i.name}</option>`).join('');

                UIUtils.showModal('수입검사 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일자</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="addInjDate" value="${UIUtils.today()}">
                        <input type="time" class="form-input" id="addInjTime" value="${new Date().toTimeString().slice(0, 5)}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">검사자</label>
                    <select class="form-input" id="addInjInspector">
                        <option value="">-- 검사자 선택 --</option>
                        ${inspectorOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjCarModel" onchange="InjectionIncomingModule.onCarModelSelect()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjPart" onchange="InjectionIncomingModule.onPartNameSelect()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="addInjColor" onchange="InjectionIncomingModule.onColorSelect()">
                        <option value="">-- 품명 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <input type="text" class="form-input" id="addInjSupplier" placeholder="자동 입력" readonly style="background:var(--bg-secondary);">
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <label class="form-label" style="margin:0; font-weight:600;">
                        LOT 목록 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-left:6px;">☑ 성적서 접수된 LOT 체크</span>
                    </label>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjectionIncomingModule.addInjLotRow()" style="display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;">add</span> LOT 추가
                    </button>
                </div>
                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div style="display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; font-size:0.78rem; color:var(--text-muted); padding-bottom:6px; border-bottom:1px solid var(--border); margin-bottom:6px;">
                        <span style="text-align:center; font-size:1rem;">✓</span>
                        <span>LOT번호 (YYMMDD)</span>
                        <span style="text-align:right;">수량 (EA)</span>
                        <span></span>
                    </div>
                    <div id="injLotRows"></div>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 입고수량</span>
                    <span id="injLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="addInjInQty" value="0">
            </div>
            <div id="injSamplingInfo" style="display:none;margin-bottom:16px;background:var(--bg-primary);border:1.5px solid var(--accent-blue);border-radius:var(--border-radius);padding:12px 16px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--accent-blue);margin-bottom:10px;">
                    <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">science</span>
                    샘플링 검사 기준 (KS Q ISO 2859-1 · 보통검사 · G-II · AQL 0.65)
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;">
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">시료코드</div>
                        <div id="injSampleCode" style="font-size:1.2rem;font-weight:700;color:var(--accent-blue);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">검사수량(n)</div>
                        <div id="injSampleSize" style="font-size:1.2rem;font-weight:700;color:var(--text-primary);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">합격판정수(Ac)</div>
                        <div id="injSampleAc" style="font-size:1.2rem;font-weight:700;color:var(--accent-green);"></div>
                    </div>
                    <div style="background:var(--bg-secondary);border-radius:6px;padding:8px 4px;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">불합격판정수(Re)</div>
                        <div id="injSampleRe" style="font-size:1.2rem;font-weight:700;color:var(--accent-red);"></div>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사수량 <span style="font-size:0.75rem;color:var(--accent-blue);font-weight:400;">(샘플링 자동)</span></label>
                    <input type="number" class="form-input" id="addInjInspQty" min="0" placeholder="자동입력"
                           readonly style="background:var(--bg-secondary);border-color:var(--accent-blue);color:var(--accent-blue);font-weight:600;">
                </div>
                <div class="form-group">
                    <label class="form-label">합격수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="addInjPassQty" min="0" placeholder="0">
                </div>
            </div>

            <!-- 불량 상세 입력 별도 (사출 불량 목록 호출) -->
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span>
                불량 상세 (사출 불량)
            </div>
            <div id="addInjDefectBreakdown" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:12px;">
                <!-- JavaScript 통해서 동적 렌더링됨 -->
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">총 불합격수량 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(자동합산)</span></label>
                    <input type="number" class="form-input" id="addInjFailQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="addInjNote" placeholder="검사 상세 내용" style="height:38px;resize:none;"></textarea>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.saveNew()">등록</button>
        `);

                setTimeout(() => {
                    addInjLotRow(); // 첫 LOT 행 초기화
                    const defects = Storage.getAll(DB.STORES.DEFECT_TYPES).filter(d => d.type === 'injection' || !d.type);
                    const container = document.getElementById('addInjDefectBreakdown');
                    if (defects.length === 0) {
                        container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다. (관리/설정에서 등록 요망)</div>';
                    } else {
                        container.innerHTML = defects.map(d => `
                    <div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">
                        <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${d.name}">${d.name}</label>
                        <input type="number" class="form-input defect-input-new" data-defect-id="${d.id}" data-defect-name="${d.name}" min="0" placeholder="0" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalAddFailQty()">
                    </div>
                `).join('');
                    }
                }, 100);
            }

            function calcTotalAddFailQty() {
                const inputs = document.querySelectorAll('.defect-input-new');
                let total = 0;
                inputs.forEach(input => {
                    total += (Number(input.value) || 0);
                });
                document.getElementById('addInjFailQty').value = total || '';
            }

            function addInjLotRow() {
                const container = document.getElementById('injLotRows');
                if (!container) return;
                const div = document.createElement('div');
                div.className = 'inj-lot-row';
                div.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
                div.innerHTML = `
                    <label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">
                        <input type="checkbox" class="inj-lot-cert" style="width:16px;height:16px;cursor:pointer;">
                    </label>
                    <input type="text" class="form-input inj-lot-no" placeholder="YYMMDD" maxlength="6"
                           style="font-family:monospace; letter-spacing:1px;"
                           oninput="this.value=this.value.replace(/[^0-9]/g,'');"
                           onblur="InjectionIncomingModule._validateInjLotFormat(this)">
                    <input type="number" class="form-input inj-lot-qty" min="0" placeholder="0"
                           style="text-align:right;"
                           oninput="InjectionIncomingModule.calcInjLotTotal()">
                    <button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"
                            style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>
                    </button>`;
                container.appendChild(div);
            }

            function removeInjLotRow(btn) {
                const row = btn.closest('.inj-lot-row');
                if (!row) return;
                const container = document.getElementById('injLotRows');
                if (container && container.querySelectorAll('.inj-lot-row').length <= 1) {
                    UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
                    return;
                }
                row.remove();
                calcInjLotTotal();
            }

            function calcInjLotTotal() {
                const qtyInputs = document.querySelectorAll('#injLotRows .inj-lot-qty');
                let total = 0;
                qtyInputs.forEach(inp => { total += (Number(inp.value) || 0); });
                const totalEl = document.getElementById('injLotTotalQty');
                if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
                const hiddenEl = document.getElementById('addInjInQty');
                if (hiddenEl) hiddenEl.value = total;
                onIncomingQtyInput();
            }

            function onCarModelSelect() {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
                const carModel = document.getElementById('addInjCarModel').value;
                const partSelect = document.getElementById('addInjPart');
                const colorSelect = document.getElementById('addInjColor');

                partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
                colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
                document.getElementById('addInjSupplier').value = '';

                if (!carModel) return;

                const filtered = materials.filter(m => m.carModel === carModel);
                const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
                partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                    partNames.map(p => `<option value="${p}">${p}</option>`).join('');

                if (partNames.length === 1) {
                    partSelect.value = partNames[0];
                    onPartNameSelect();
                }
            }

            function onPartNameSelect() {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
                const carModel = document.getElementById('addInjCarModel').value;
                const partName = document.getElementById('addInjPart').value;
                const colorSelect = document.getElementById('addInjColor');

                colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
                document.getElementById('addInjSupplier').value = '';

                if (!partName) return;

                const filtered = materials.filter(m => m.carModel === carModel && m.injPartName === partName);
                const colors = [...new Set(filtered.map(m => m.injColor).filter(Boolean))].sort();
                colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
                    colors.map(c => `<option value="${c}">${c}</option>`).join('');

                if (colors.length === 1) {
                    colorSelect.value = colors[0];
                    onColorSelect();
                }
            }

            function onColorSelect() {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
                const carModel = document.getElementById('addInjCarModel').value;
                const partName = document.getElementById('addInjPart').value;
                const color = document.getElementById('addInjColor').value;

                if (!color) {
                    document.getElementById('addInjSupplier').value = '';
                    return;
                }
                const material = materials.find(m =>
                    m.carModel === carModel && m.injPartName === partName && m.injColor === color
                );
                document.getElementById('addInjSupplier').value = material ? (material.supplier || '') : '';
            }

            function onIncomingQtyInput() {
                const qty = Number(document.getElementById('addInjInQty').value);
                const infoBox = document.getElementById('injSamplingInfo');
                const inspEl = document.getElementById('addInjInspQty');

                if (!qty || qty <= 0) {
                    infoBox.style.display = 'none';
                    inspEl.value = '';
                    return;
                }

                const info = SamplingTable.getSamplingInfo(qty);
                if (!info) {
                    infoBox.style.display = 'none';
                    inspEl.value = '';
                    return;
                }

                document.getElementById('injSampleCode').textContent = info.sampleCode;
                document.getElementById('injSampleSize').textContent = info.sampleSize;
                document.getElementById('injSampleAc').textContent = info.ac;
                document.getElementById('injSampleRe').textContent = info.re;
                infoBox.style.display = 'block';

                inspEl.value = Math.min(info.sampleSize, qty);
            }

            async function saveNew() {
                const dateVal = document.getElementById('addInjDate').value;
                const timeVal = document.getElementById('addInjTime').value;

                // LOT 목록 수집
                const lotRows = document.querySelectorAll('#injLotRows .inj-lot-row');
                const lots = [];
                lotRows.forEach(row => {
                    const lotNo = ((row.querySelector('.inj-lot-no') || {}).value || '').trim();
                    const qty = Number((row.querySelector('.inj-lot-qty') || {}).value) || 0;
                    const certReceived = ((row.querySelector('.inj-lot-cert') || {}).checked) || false;
                    if (lotNo || qty > 0) {
                        lots.push({ lotNo, qty, certReceived });
                    }
                });

                if (lots.length === 0) {
                    UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
                    return;
                }

                const incomingQty = lots.reduce((s, l) => s + l.qty, 0);

                const data = {
                    date: `${dateVal} ${timeVal}`,
                    inspector: document.getElementById('addInjInspector') ? document.getElementById('addInjInspector').value.trim() : '',
                    carModel: document.getElementById('addInjCarModel').value.trim(),
                    partName: document.getElementById('addInjPart').value.trim(),
                    color: document.getElementById('addInjColor').value.trim(),
                    incomingQty,
                    lots,
                    lotNo: lots.length > 0 ? lots[0].lotNo : '',
                    sampleCode: document.getElementById('injSampleCode')?.textContent.trim() || '',
                    acCriteria: document.getElementById('injSampleAc')?.textContent.trim() !== '' ?
                        Number(document.getElementById('injSampleAc').textContent.trim()) : null,
                    reCriteria: document.getElementById('injSampleRe')?.textContent.trim() !== '' ?
                        Number(document.getElementById('injSampleRe').textContent.trim()) : null,
                    inspectionQty: Number(document.getElementById('addInjInspQty').value) || 0,
                    passQty: Number(document.getElementById('addInjPassQty').value) || 0,
                    failQty: Number(document.getElementById('addInjFailQty').value) || 0,
                    defectDetails: {},
                    supplierName: document.getElementById('addInjSupplier').value.trim(),
                    note: document.getElementById('addInjNote').value.trim()
                };

                const defectInputs = document.querySelectorAll('.defect-input-new');
                defectInputs.forEach(input => {
                    const qty = Number(input.value) || 0;
                    if (qty > 0) {
                        const name = input.getAttribute('data-defect-name');
                        data.defectDetails[name] = qty;
                    }
                });

                if (!data.date || !data.partName) {
                    UIUtils.toast('날짜와 품명은 필수입니다.', 'warning');
                    return;
                }

                await Storage.add(STORE, data);
                // 자동 창고 입고 처리 없음 → 사출 창고 "입고 대기품" 섹션에서 LOT별 수동 처리

                UIUtils.closeModal();
                UIUtils.toast('수입검사가 등록되었습니다.', 'success');
                search();
            }

            function edit(id) {
                const d = Storage.getById(STORE, id);
                if (!d) return;

                const fullDate = d.date || '';
                const [datePart, timePart] = fullDate.split(' ');

                UIUtils.showModal('수입검사 수정', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일자</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="editInjDate" value="${datePart || UIUtils.today()}">
                        <input type="time" class="form-input" id="editInjTime" value="${timePart || '00:00'}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">성적서 접수 LOT번호</label>
                    <input type="text" class="form-input" id="editInjLot" value="${d.lotNo || ''}" maxlength="6"
                           oninput="this.value = this.value.replace(/[^0-9]/g, '');"
                           onblur="InjectionIncomingModule._validateInjLotFormat(this)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="editInjPart" value="${d.partName || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">업체명</label>
                    <input type="text" class="form-input" id="editInjSupplier" value="${d.supplierName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고수량</label>
                    <input type="number" class="form-input" id="editInjInQty" value="${d.incomingQty || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">검사수량</label>
                    <input type="number" class="form-input" id="editInjInspQty" value="${d.inspectionQty || 0}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">합격수량</label>
                    <input type="number" class="form-input" id="editInjPassQty" value="${d.passQty || 0}">
                </div>
            </div>

            <!-- 불량 상세 입력 별도 (사출 불량 목록 호출) -->
            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-red);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">warning</span>
                불량 상세 (사출 불량)
            </div>
            <div id="editInjDefectBreakdown" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:12px;">
                <!-- JavaScript 통해서 동적 렌더링됨 -->
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">총 불합격수량</label>
                    <input type="number" class="form-input" id="editInjFailQty" value="${d.failQty || 0}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="editInjNote">${d.note || ''}</textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.saveEdit('${id}')">저장</button>
        `);

                setTimeout(() => {
                    const defects = Storage.getAll(DB.STORES.DEFECT_TYPES).filter(df => df.type === 'injection' || !df.type);
                    const container = document.getElementById('editInjDefectBreakdown');
                    const details = d.defectDetails || {};

                    if (defects.length === 0) {
                        container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다.</div>';
                    } else {
                        container.innerHTML = defects.map(function(df) {
                            const val = details[df.name] || '';
                            return '<div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">'
                                + '<label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + df.name + '">' + df.name + '</label>'
                                + '<input type="number" class="form-input defect-input-edit" data-defect-id="' + df.id + '" data-defect-name="' + df.name + '" min="0" placeholder="0" value="' + val + '" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalEditFailQty()">'
                                + '</div>';
                        }).join('');
                    }
                }, 100);
            }

    function calcTotalEditFailQty() {
        const inputs = document.querySelectorAll('.defect-input-edit');
        let total = 0;
        inputs.forEach(input => {
            total += (Number(input.value) || 0);
        });
        document.getElementById('editInjFailQty').value = total || 0;
    }

    async function saveEdit(id) {
        const dateVal = document.getElementById('editInjDate').value;
        const timeVal = document.getElementById('editInjTime').value;

        const updateData = {
            date: `${dateVal} ${timeVal}`,
            lotNo: document.getElementById('editInjLot').value.trim(),
            partName: document.getElementById('editInjPart').value.trim(),
            supplierName: document.getElementById('editInjSupplier').value.trim(),
            incomingQty: Number(document.getElementById('editInjInQty').value) || 0,
            inspectionQty: Number(document.getElementById('editInjInspQty').value) || 0,
            passQty: Number(document.getElementById('editInjPassQty').value) || 0,
            failQty: Number(document.getElementById('editInjFailQty').value) || 0,
            defectDetails: {}, 
            note: document.getElementById('editInjNote').value.trim()
        };

        const defectInputs = document.querySelectorAll('.defect-input-edit');
        defectInputs.forEach(input => {
            const qty = Number(input.value) || 0;
            if (qty > 0) {
                const name = input.getAttribute('data-defect-name');
                updateData.defectDetails[name] = qty;
            }
        });

        await Storage.update(STORE, id, updateData);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['검사일자', '성적서 접수 LOT번호', '품명', '업체명', '입고수량', '시료코드', '검사수량', '합격판정수(Ac)', '불합격판정수(Re)', '합격', '불합격', '비고'];
        const rows = data.map(d => [d.date, d.lotNo, d.partName, d.supplierName, d.incomingQty, d.sampleCode || '', d.inspectionQty, d.acCriteria ?? '', d.reCriteria ?? '', d.passQty, d.failQty, d.note || '']);
        Storage.exportToCSV(headers, rows, '수입검사일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // LOT 번호 형식 검증 (YYMMDD)
    function _validateInjLotFormat(input) {
        const value = input.value.trim();
        if (!value) return; // 빈 값은 허용

        if (value.length !== 6) {
            UIUtils.toast('LOT번호는 YYMMDD 형식으로 6자리여야 합니다 (예: 250625)', 'warning');
            input.focus();
            input.select();
            return;
        }

        const yy = parseInt(value.substring(0, 2));
        const mm = parseInt(value.substring(2, 4));
        const dd = parseInt(value.substring(4, 6));

        // 월 범위 검증 (01~12)
        if (mm < 1 || mm > 12) {
            UIUtils.toast('월(MM)은 01~12 범위여야 합니다', 'warning');
            input.focus();
            input.select();
            return;
        }

        // 일 범위 검증 (01~31)
        if (dd < 1 || dd > 31) {
            UIUtils.toast('일(DD)은 01~31 범위여야 합니다', 'warning');
            input.focus();
            input.select();
            return;
        }
    }

    return {
        render,
        search,
        resetFilter,
        onFilterCarModelChange,
        openAddModal,
        onCarModelSelect,
        onPartNameSelect,
        onColorSelect,
        onIncomingQtyInput,
        addInjLotRow,
        removeInjLotRow,
        calcInjLotTotal,
        saveNew,
        edit,
        saveEdit,
        calcTotalAddFailQty,
        calcTotalEditFailQty,
        remove,
        exportData,
        _validateInjLotFormat
    };
})();

// ===================================================================
// 사출 창고 (자재 재고관리)
// ===================================================================
// InjectionWarehouseModule 관련 코드는 injection_part2.js로 이관되었습니다.

