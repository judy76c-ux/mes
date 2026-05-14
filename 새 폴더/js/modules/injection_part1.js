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
                        <h3>사출 수입검사</h3>
                        <p>사출 자재 수입검사 결과를 기록합니다.</p>
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

                <div id="injCertPendingSection"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일자</th>
                                        <th>사출 LOT</th>
                                        <th>성적서 접수</th>
                                        <th>차종</th>
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

    function _populateCarModelDropdown(allData) {
        const el = document.getElementById('injInspCarModel');
        if (!el) return;
        const prev = el.value;
        const carModels = [...new Set(allData.map(d => d.carModel).filter(Boolean))].sort();
        el.innerHTML = '<option value="">전체</option>' +
            carModels.map(m => `<option value="${m}" ${m === prev ? 'selected' : ''}>${m}</option>`).join('');
    }

    function onFilterCarModelChange() {
        const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
        const allData = Storage.getAll(STORE);
        const partEl = document.getElementById('injInspPartName');
        if (!partEl) return;
        const prev = partEl.value;
        const parts = [...new Set(
            allData.filter(d => !carModel || d.carModel === carModel)
            .map(d => d.partName).filter(Boolean)
        )].sort();
        partEl.innerHTML = '<option value="">전체</option>' +
            parts.map(p => `<option value="${p}" ${p === prev ? 'selected' : ''}>${p}</option>`).join('');
    }

    function resetFilter() {
        const startEl = document.getElementById('injInspStart');
        const endEl = document.getElementById('injInspEnd');
        const carEl = document.getElementById('injInspCarModel');
        const partEl = document.getElementById('injInspPartName');
        if (startEl) startEl.value = UIUtils.monthAgo();
        if (endEl) endEl.value = UIUtils.today();
        if (carEl) carEl.value = '';
        if (partEl) partEl.innerHTML = '<option value="">전체</option>';
        search();
    }

    function search() {
        const start = document.getElementById('injInspStart').value;
        const end = document.getElementById('injInspEnd').value;
        const carModel = (document.getElementById('injInspCarModel') || {}).value || '';
        const partName = (document.getElementById('injInspPartName') || {}).value || '';

        let data = Storage.getByDateRange(STORE, start, end);
        if (carModel) data = data.filter(d => d.carModel === carModel);
        if (partName) data = data.filter(d => d.partName === partName);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 날짜 범위 전체 기준으로 드롭다운 갱신
        const allInRange = Storage.getByDateRange(STORE, start, end);
        _populateCarModelDropdown(allInRange);
        onFilterCarModelChange();
        // 선택값 복원
        if (carModel) {
            const el = document.getElementById('injInspCarModel');
            if (el) el.value = carModel;
        }
        if (partName) {
            const el = document.getElementById('injInspPartName');
            if (el) el.value = partName;
        }

        renderStats(data);
        renderCertPendingSection();
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

    function renderCertPendingSection() {
        const el = document.getElementById('injCertPendingSection');
        if (!el) return;

        // 전체 레코드에서 성적서 미접수 항목 추출
        const allRecords = Storage.getAll(STORE);
        const pending = allRecords.filter(d => {
            const lots = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            return lots.some(l => !l.certReceived);
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (pending.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = `
            <div class="card" style="border:2px solid #fca5a5;margin-bottom:16px;">
                <div class="card-header" style="background:rgba(220,38,38,0.06);border-bottom:1px solid #fca5a5;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="color:#dc2626;">pending_actions</span>
                        <span style="font-weight:700;color:#dc2626;font-size:1rem;">성적서 미접수 관리</span>
                        <span style="background:#dc2626;color:#fff;border-radius:12px;padding:1px 10px;font-size:0.82rem;font-weight:700;">${pending.length}건</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--text-muted);">접수 완료 처리 후 목록에서 제거됩니다</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>검사일자</th>
                                <th>미접수 LOT</th>
                                <th>차종</th>
                                <th>품명</th>
                                <th>입고수량</th>
                                <th>사출처</th>
                                <th style="text-align:center;">접수 처리</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pending.map(d => {
                                const lots = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false, qty: d.incomingQty }] : []);
                                const pendingLots = lots.filter(l => !l.certReceived);
                                const lotBadges = pendingLots.map(l =>
                                    `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;padding:1px 7px;font-size:0.8rem;font-family:monospace;color:#dc2626;font-weight:600;">
                                        <span class="material-symbols-outlined" style="font-size:0.85rem;">cancel</span>${l.lotNo || '-'}
                                    </span>`
                                ).join('');
                                return `
                                    <tr style="background:rgba(220,38,38,0.03);">
                                        <td>${d.date}</td>
                                        <td>${lotBadges}</td>
                                        <td>${d.carModel || '-'}</td>
                                        <td>${d.partName || '-'}</td>
                                        <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                                        <td>${d.supplierName || '-'}</td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-primary"
                                                onclick="InjectionIncomingModule.markCertReceived('${d.id}')"
                                                style="font-size:0.78rem;">
                                                <span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>
                                                접수 완료
                                            </button>
                                        </td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function markCertReceived(id) {
        const record = Storage.getById(STORE, id);
        if (!record) return;
        UIUtils.showModal('성적서 접수 완료', `
            <div style="padding:8px 0;">
                <p style="margin-bottom:16px;color:var(--text-secondary);">
                    <strong>${record.carModel || ''} ${record.partName || ''}</strong> 의 성적서 접수일을 입력하세요.
                </p>
                <div class="form-group">
                    <label class="form-label">접수일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="certReceivedDate" value="${Storage.today()}" max="${Storage.today()}">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionIncomingModule.confirmCertReceived('${id}')">
                <span class="material-symbols-outlined">check_circle</span> 접수 완료
            </button>
        `);
    }

    async function confirmCertReceived(id) {
        const dateVal = (document.getElementById('certReceivedDate') || {}).value;
        if (!dateVal) { UIUtils.toast('접수일을 입력하세요.', 'warning'); return; }
        const record = Storage.getById(STORE, id);
        if (!record) return;
        const lots = (record.lots && record.lots.length > 0)
            ? record.lots.map(l => ({ ...l, certReceived: true, certReceivedDate: dateVal }))
            : [];
        if (lots.length > 0) {
            await Storage.update(STORE, id, { lots, certReceivedDate: dateVal });
            await propagateCertReceived(lots);
        } else {
            await Storage.update(STORE, id, { certReceived: true, certReceivedDate: dateVal });
        }
        UIUtils.closeModal();
        UIUtils.toast('성적서 접수 완료 처리되었습니다.', 'success');
        search();
    }

    function renderTable(data) {
        const tbody = document.getElementById('injInspTableBody');

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        // FIFO 위반 사전 계산: 차종+품명별 등록순 기준 최대 LOT 추적
        const fifoViolations = new Set(); // record id → 위반
        const sorted = [...data].sort((a, b) => a.date < b.date ? -1 : 1);
        const maxLotByPart = {}; // 'carModel|partName' → maxLotNo
        sorted.forEach(r => {
            const key = `${r.carModel}|${r.partName}`;
            const lots = (r.lots && r.lots.length > 0) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const minLot = lots.map(l => l.lotNo || '').filter(Boolean).sort()[0];
            const maxLot = lots.map(l => l.lotNo || '').filter(Boolean).sort().pop();
            if (maxLotByPart[key] && minLot && minLot < maxLotByPart[key]) {
                fifoViolations.add(r.id);
            }
            if (maxLot && (!maxLotByPart[key] || maxLot > maxLotByPart[key])) {
                maxLotByPart[key] = maxLot;
            }
        });

        tbody.innerHTML = data.map(d => {
            const verdict = (Number(d.failQty) || 0) === 0 ? 'success' : 'danger';
            const verdictText = (Number(d.failQty) || 0) === 0 ? '합격' : '불합격';
            const lotList = (d.lots && d.lots.length > 0) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            const certMissing = lotList.some(l => !l.certReceived);
            const isFifoViolation = fifoViolations.has(d.id);
            const injLotDisplay = lotList.map(l =>
                `<span style="display:inline-block;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.8rem;margin:1px;font-family:monospace;font-weight:600;">${l.lotNo || '-'}</span>`
            ).join('') + (isFifoViolation
                ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:1px 6px;font-size:0.75rem;margin:1px;color:#ea580c;font-weight:700;" title="선입선출 위반: 이전에 등록된 최신 LOT보다 오래된 재고입니다"><span class="material-symbols-outlined" style="font-size:0.85rem;">warning</span>FIFO</span>`
                : '');
            const certDisplay = lotList.map(l => l.certReceived
                ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#dcfce7;border:1px solid #86efac;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#16a34a;font-weight:600;"><span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>${l.lotNo || '-'}</span>`
                : `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;padding:1px 6px;font-size:0.78rem;margin:1px;font-family:monospace;color:#dc2626;font-weight:600;" title="성적서 미접수"><span class="material-symbols-outlined" style="font-size:0.9rem;">cancel</span>미접수</span>`
            ).join('');
            const rowStyle = isFifoViolation
                ? ' style="background:rgba(234,88,12,0.05);"'
                : certMissing ? ' style="background:rgba(220,38,38,0.05);"' : '';
            return `
                <tr${rowStyle}>
                    <td>${d.date}</td>
                    <td>${injLotDisplay}</td>
                    <td>${certDisplay}</td>
                    <td>${d.carModel || '-'}</td>
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
                            ${Object.entries(d.defectDetails || {}).map(([k, v]) => `
            ${k
            }(${v
            })
            `).join(', ')}
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
        // 외부공급처 제품이 있는 차종만 필터링 (사내만 있는 차종 제외)
        const carModelsWithExternal = [...new Set(
            materials
                .filter(m => m.supplier !== '사내')
                .map(m => m.carModel)
                .filter(Boolean)
        )].sort();
        const carModelOptions = carModelsWithExternal.map(c => `<option value="${c}">${c}</option>`).join('');

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
                <div id="fifoWarning" style="display:none; align-items:center; gap:8px; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:8px 14px; margin-bottom:6px;">
                    <span class="material-symbols-outlined" style="color:#ea580c; font-size:1.2rem;">warning</span>
                    <span id="fifoWarningMsg" style="font-size:0.85rem; color:#c2410c; font-weight:600;"></span>
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
            try {
                const allDefs = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
                const defects = allDefs.filter(d => d && (d.type === 'injection' || !d.type));
                const container = document.getElementById('addInjDefectBreakdown');
                if (!container) return; // 모달이 이미 닫혔을 경우 방어
                if (defects.length === 0) {
                    container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다. <a style="color:var(--accent-blue);cursor:pointer;" onclick="Router.navigate(\'settings\');UIUtils.closeModal();">관리/설정에서 등록하세요.</a></div>';
                } else {
                    container.innerHTML = defects.map(d => `
                        <div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">
                            <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name || ''}</label>
                            <input type="number" class="form-input defect-input-new" data-defect-id="${d.id}" data-defect-name="${(d.name || '').replace(/"/g, '&quot;')}" min="0" placeholder="0" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalAddFailQty()">
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error('[사출 불량 렌더] 추가폼 오류:', e);
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
        div.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
            + '<input type="checkbox" class="inj-lot-cert" style="width:16px;height:16px;cursor:pointer;">'
            + '</label>'
            + '<input type="text" class="form-input inj-lot-no" placeholder="YYMMDD" maxlength="6"'
            + ' style="font-family:monospace; letter-spacing:1px;"'
            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); if(this.value.length===6) InjectionIncomingModule.onLotInput(this, null);"'
            + ' onblur="InjectionIncomingModule.onLotInput(this, null)">'
            + '<input type="number" class="form-input inj-lot-qty" min="0" placeholder="0"'
            + ' style="text-align:right;"'
            + ' oninput="InjectionIncomingModule.calcInjLotTotal()">'
            + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
            + '</button>';
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

    function calcInjLotTotalEdit() {
        const qtyInputs = document.querySelectorAll('#editInjLotRows .inj-lot-qty');
        let total = 0;
        qtyInputs.forEach(inp => { total += (Number(inp.value) || 0); });
        const totalEl = document.getElementById('editInjLotTotalQty');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
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

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && (m.supplier !== '사내');
        });
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

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && m.injPartName === partName && (m.supplier !== '사내');
        });
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
        // 공급처가 "사내"가 아닌 제품만 검색
        const material = materials.find(function(m) {
            return m.carModel === carModel && m.injPartName === partName && m.injColor === color && (m.supplier !== '사내');
        });
        document.getElementById('addInjSupplier').value = material ? (material.supplier || '') : '';
    }

    // Edit 모달용 cascading selector 함수
    function onCarModelSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partSelect = document.getElementById('editInjPart');
        const colorSelect = document.getElementById('editInjColor');

        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>';
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('editInjSupplier').value = '';

        if (!carModel) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && (m.supplier !== '사내');
        });
        const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
        partSelect.innerHTML = '<option value="">-- 품명 선택 --</option>' +
            partNames.map(p => `<option value="${p}">${p}</option>`).join('');

        if (partNames.length === 1) {
            partSelect.value = partNames[0];
            onPartNameSelectEdit();
        }
    }

    function onPartNameSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partName = document.getElementById('editInjPart').value;
        const colorSelect = document.getElementById('editInjColor');

        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        document.getElementById('editInjSupplier').value = '';

        if (!partName) return;

        // 공급처가 "사내"가 아닌 제품만 필터링 (수입검사 대상)
        const filtered = materials.filter(function(m) {
            return m.carModel === carModel && m.injPartName === partName && (m.supplier !== '사내');
        });
        const colors = [...new Set(filtered.map(m => m.injColor).filter(Boolean))].sort();
        colorSelect.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        if (colors.length === 1) {
            colorSelect.value = colors[0];
            onColorSelectEdit();
        }
    }

    function onColorSelectEdit() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const carModel = document.getElementById('editInjCarModel').value;
        const partName = document.getElementById('editInjPart').value;
        const color = document.getElementById('editInjColor').value;

        if (!color) {
            document.getElementById('editInjSupplier').value = '';
            return;
        }
        // 공급처가 "사내"가 아닌 제품만 검색
        const material = materials.find(function(m) {
            return m.carModel === carModel && m.injPartName === partName && m.injColor === color && (m.supplier !== '사내');
        });
        document.getElementById('editInjSupplier').value = material ? (material.supplier || '') : '';
    }

    function onIncomingQtyInput() {
        const qty = Number(document.getElementById('addInjInQty').value);
        const infoBox = document.getElementById('injSamplingInfo');
        const inspEl = document.getElementById('addInjInspQty');

        if (!infoBox || !inspEl) return; // 요소가 없으면 무시 (수정 모달에서 샘플링 미사용)

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

    // 기존 레코드에서 성적서 접수된 LOT 번호 Set 반환
    function getCertifiedLotNos() {
        const allRecords = Storage.getAll(STORE);
        const certified = new Set();
        for (const record of allRecords) {
            const lotList = (record.lots && record.lots.length > 0)
                ? record.lots
                : (record.lotNo ? [{ lotNo: record.lotNo, certReceived: record.certReceived || false }] : []);
            lotList.forEach(l => { if (l.certReceived && l.lotNo) certified.add(l.lotNo); });
        }
        return certified;
    }

    // 성적서 접수된 LOT 번호를 전체 레코드에 전파
    async function propagateCertReceived(savedLots) {
        if (!savedLots || savedLots.length === 0) return;
        // 성적서 접수된 LOT 번호만 추출
        const certifiedLotNos = new Set(
            savedLots.filter(l => l.certReceived && l.lotNo).map(l => l.lotNo)
        );
        if (certifiedLotNos.size === 0) return;

        const allRecords = Storage.getAll(STORE);
        for (const record of allRecords) {
            if (!record.lots || record.lots.length === 0) continue;
            let changed = false;
            const updatedLots = record.lots.map(l => {
                if (!l.certReceived && certifiedLotNos.has(l.lotNo)) {
                    changed = true;
                    return { ...l, certReceived: true };
                }
                return l;
            });
            if (changed) {
                await Storage.update(STORE, record.id, { lots: updatedLots });
            }
        }
    }

    async function saveNew() {
        const dateVal = document.getElementById('addInjDate').value;
        const timeVal = document.getElementById('addInjTime').value;

        // LOT 목록 수집
        const lotRows = document.querySelectorAll('#injLotRows .inj-lot-row');
        const lots = [];
        lotRows.forEach(function(row) {
            const lotNo = ((row.querySelector('.inj-lot-no') || {}).value || '').trim();
            const qty = Number((row.querySelector('.inj-lot-qty') || {}).value) || 0;
            const certReceived = ((row.querySelector('.inj-lot-cert') || {}).checked) || false;
            if (lotNo || qty > 0) {
                lots.push({ lotNo: lotNo, qty: qty, certReceived: certReceived });
            }
        });

        if (lots.length === 0) {
            UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
            return;
        }

        // 기존에 성적서 접수된 LOT이면 자동으로 접수 처리
        const certifiedLotNos = getCertifiedLotNos();
        lots.forEach(l => {
            if (!l.certReceived && certifiedLotNos.has(l.lotNo)) l.certReceived = true;
        });

        const incomingQty = lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const data = {
            date: `${dateVal} ${timeVal}`,
            inspector: document.getElementById('addInjInspector') ? document.getElementById('addInjInspector').value.trim() : '',
            carModel: document.getElementById('addInjCarModel').value.trim(),
            partName: document.getElementById('addInjPart').value.trim(),
            color: document.getElementById('addInjColor').value.trim(),
            incomingQty: incomingQty,
            lots: lots,
            lotNo: lots.length > 0 ? lots[0].lotNo : '',
            sampleCode: document.getElementById('injSampleCode') ?.textContent.trim() || '',
            acCriteria: document.getElementById('injSampleAc') ?.textContent.trim() !== '' ?
                Number(document.getElementById('injSampleAc').textContent.trim()) : null,
            reCriteria: document.getElementById('injSampleRe') ?.textContent.trim() !== '' ?
                Number(document.getElementById('injSampleRe').textContent.trim()) : null,
            inspectionQty: Number(document.getElementById('addInjInspQty').value) || 0,
            passQty: Number(document.getElementById('addInjPassQty').value) || 0,
            failQty: Number(document.getElementById('addInjFailQty').value) || 0,
            defectDetails: {},
            supplierName: document.getElementById('addInjSupplier').value.trim(),
            note: document.getElementById('addInjNote').value.trim()
        };

        const defectInputs = document.querySelectorAll('.defect-input-new');
        defectInputs.forEach(function(input) {
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
        await propagateCertReceived(data.lots);
        // 자동 창고 입고 없음 → 사출 창고 "입고 대기품" 섹션에서 LOT별 수동 처리

        UIUtils.closeModal();
        UIUtils.toast('수입검사가 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const fullDate = d.date || '';
        const [datePart, timePart] = fullDate.split(' ');

        const inspectors = Storage.getAll(DB.STORES.INSPECTORS);
        const inspectorOptions = inspectors.map(i => `<option value="${i.name}" ${d.inspector === i.name ? 'selected' : ''}>${i.name}</option>`).join('');

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        // 외부공급처만 필터링
        const externalMaterials = materials.filter(m => m.supplier !== '사내');
        const carModels = [...new Set(externalMaterials.map(m => m.carModel).filter(Boolean))].sort();
        const carModelOptions = carModels.map(c => `<option value="${c}" ${d.carModel === c ? 'selected' : ''}>${c}</option>`).join('');

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
                    <label class="form-label">검사자</label>
                    <select class="form-input" id="editInjInspector">
                        <option value="">-- 검사자 선택 --</option>
                        ${inspectorOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjCarModel" onchange="InjectionIncomingModule.onCarModelSelectEdit()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjPart" onchange="InjectionIncomingModule.onPartNameSelectEdit()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-input" id="editInjColor" onchange="InjectionIncomingModule.onColorSelectEdit()">
                        <option value="">-- 품명 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <input type="text" class="form-input" id="editInjSupplier" placeholder="자동 입력" readonly style="background:var(--bg-secondary);">
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
                    <div id="editInjLotRows"></div>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 입고수량</span>
                    <span id="editInjLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="editInjInQty" value="0">
            </div>
            <div class="form-row">
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
            // 1. 차종/품명/컬러 cascading selector 초기화
            const carModelSel = document.getElementById('editInjCarModel');
            const partSel = document.getElementById('editInjPart');
            const colorSel = document.getElementById('editInjColor');
            const supplierField = document.getElementById('editInjSupplier');

            if (carModelSel && partSel && colorSel && supplierField) {
                const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

                // 선택된 차종 가져오기
                const selectedCarModel = carModelSel.value;

                if (selectedCarModel) {
                    // 차종에 해당하는 품명 목록 구성
                    const filtered = materials.filter(function(m) {
                        return m.carModel === selectedCarModel && (m.supplier !== '사내');
                    });
                    const partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
                    partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                        partNames.map(p => `<option value="${p}" ${d.partName === p ? 'selected' : ''}>${p}</option>`).join('');

                    // 선택된 품명 가져오기
                    const selectedPartName = partSel.value;

                    if (selectedPartName) {
                        // 품명에 해당하는 컬러 목록 구성
                        const filteredByPart = materials.filter(function(m) {
                            return m.carModel === selectedCarModel && m.injPartName === selectedPartName && (m.supplier !== '사내');
                        });
                        const colors = [...new Set(filteredByPart.map(m => m.injColor).filter(Boolean))].sort();
                        colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' +
                            colors.map(c => `<option value="${c}" ${d.color === c ? 'selected' : ''}>${c}</option>`).join('');

                        // 선택된 컬러에 해당하는 공급처 채우기
                        const selectedColor = colorSel.value;
                        if (selectedColor) {
                            const material = materials.find(function(m) {
                                return m.carModel === selectedCarModel && m.injPartName === selectedPartName && m.injColor === selectedColor && (m.supplier !== '사내');
                            });
                            supplierField.value = material ? (material.supplier || '') : '';
                        } else {
                            supplierField.value = d.supplierName || '';
                        }
                    } else {
                        colorSel.innerHTML = '<option value="">-- 품명 먼저 선택 --</option>';
                        supplierField.value = d.supplierName || '';
                    }
                } else {
                    partSel.innerHTML = '<option value="">-- 차종 먼저 선택 --</option>';
                    colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
                    supplierField.value = '';
                }
            }

            // 2. LOT 행 초기화 (수정 데이터에서)
            const lotContainer = document.getElementById('editInjLotRows');
            if (lotContainer) {
                lotContainer.innerHTML = '';
                if (d.lots && d.lots.length > 0) {
                    d.lots.forEach(function(lot) {
                        const row = document.createElement('div');
                        row.className = 'inj-lot-row';
                        row.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
                        row.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
                            + '<input type="checkbox" class="inj-lot-cert" style="width:16px;height:16px;cursor:pointer;" ' + (lot.certReceived ? 'checked' : '') + '>'
                            + '</label>'
                            + '<input type="text" class="form-input inj-lot-no" value="' + (lot.lotNo || '') + '" maxlength="6" placeholder="YYMMDD"'
                            + ' style="font-family:monospace; letter-spacing:1px;"'
                            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                            + '<input type="number" class="form-input inj-lot-qty" value="' + (lot.qty || 0) + '" min="0" placeholder="0"'
                            + ' style="text-align:right;"'
                            + ' oninput="InjectionIncomingModule.calcInjLotTotalEdit()">'
                            + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
                            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                            + '</button>';
                        lotContainer.appendChild(row);
                    });
                } else {
                    var row = document.createElement('div');
                    row.className = 'inj-lot-row';
                    row.style.cssText = 'display:grid; grid-template-columns:36px 1fr 90px 34px; gap:8px; align-items:center; margin-bottom:6px;';
                    row.innerHTML = '<label style="display:flex; align-items:center; justify-content:center; cursor:pointer; padding:4px;" title="성적서 접수 여부">'
                        + '<input type="checkbox" class="inj-lot-cert" style="width:16px;height:16px;cursor:pointer;">'
                        + '</label>'
                        + '<input type="text" class="form-input inj-lot-no" value="' + (d.lotNo || '') + '" maxlength="6" placeholder="YYMMDD"'
                        + ' style="font-family:monospace; letter-spacing:1px;"'
                        + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                        + '<input type="number" class="form-input inj-lot-qty" value="0" min="0" placeholder="0"'
                        + ' style="text-align:right;"'
                        + ' oninput="InjectionIncomingModule.calcInjLotTotalEdit()">'
                        + '<button type="button" onclick="InjectionIncomingModule.removeInjLotRow(this)"'
                        + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                        + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                        + '</button>';
                    lotContainer.appendChild(row);
                }
                InjectionIncomingModule.calcInjLotTotalEdit();
            }

            // 3. 불량 상세 입력 초기화
            try {
                const allDefs = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
                const defects = allDefs.filter(df => df && (df.type === 'injection' || !df.type));
                const container = document.getElementById('editInjDefectBreakdown');
                if (!container) return; // 모달이 이미 닫혔을 경우 방어
                const details = d.defectDetails || {};

                if (defects.length === 0) {
                    container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:0.85rem;">등록된 사출 불량 유형이 없습니다.</div>';
                } else {
                    container.innerHTML = defects.map(df => {
                        const val = details[df.name] || '';
                        const safeName = (df.name || '').replace(/"/g, '&quot;');
                        return `
                        <div style="background:var(--bg-secondary);padding:8px;border-radius:6px;border:1px solid var(--border);">
                            <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${safeName}">${df.name || ''}</label>
                            <input type="number" class="form-input defect-input-edit" data-defect-id="${df.id}" data-defect-name="${safeName}" min="0" placeholder="0" value="${val}" style="padding:4px 8px;font-size:0.85rem;" oninput="InjectionIncomingModule.calcTotalEditFailQty()">
                        </div>
                    `;
                    }).join('');
                }
            } catch (e) {
                console.error('[사출 불량 렌더] 수정폼 오류:', e);
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

        // LOT 목록 수집
        const lotRows = document.querySelectorAll('#editInjLotRows .inj-lot-row');
        const lots = [];
        lotRows.forEach(function(row) {
            const lotNo = ((row.querySelector('.inj-lot-no') || {}).value || '').trim();
            const qty = Number((row.querySelector('.inj-lot-qty') || {}).value) || 0;
            const certReceived = ((row.querySelector('.inj-lot-cert') || {}).checked) || false;
            if (lotNo || qty > 0) {
                lots.push({ lotNo: lotNo, qty: qty, certReceived: certReceived });
            }
        });

        if (lots.length === 0) {
            UIUtils.toast('LOT 정보를 입력하세요.', 'warning');
            return;
        }

        const incomingQty = lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const updateData = {
            date: `${dateVal} ${timeVal}`,
            inspector: document.getElementById('editInjInspector').value.trim(),
            carModel: document.getElementById('editInjCarModel').value.trim(),
            partName: document.getElementById('editInjPart').value.trim(),
            color: document.getElementById('editInjColor').value.trim(),
            lots: lots,
            lotNo: lots.length > 0 ? lots[0].lotNo : '',
            incomingQty: incomingQty,
            inspectionQty: Number(document.getElementById('editInjInspQty').value) || 0,
            passQty: Number(document.getElementById('editInjPassQty').value) || 0,
            failQty: Number(document.getElementById('editInjFailQty').value) || 0,
            defectDetails: {},
            supplierName: document.getElementById('editInjSupplier').value.trim(),
            note: document.getElementById('editInjNote').value.trim()
        };

        const defectInputs = document.querySelectorAll('.defect-input-edit');
        defectInputs.forEach(function(input) {
            const qty = Number(input.value) || 0;
            if (qty > 0) {
                const name = input.getAttribute('data-defect-name');
                updateData.defectDetails[name] = qty;
            }
        });

        await Storage.update(STORE, id, updateData);
        await propagateCertReceived(updateData.lots);
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

    function onLotInput(input, msgId) {
        // 숫자만 허용
        const val = input.value.replace(/\D/g, '').slice(0, 6);
        input.value = val;

        const msg = document.getElementById(msgId);

        if (val.length === 0) {
            if (msg) { msg.innerHTML = ''; }
            input.style.borderColor = '';
            checkFifoWarning();
            return;
        }

        if (val.length < 6) {
            if (msg) { msg.innerHTML = `<span style="color:var(--accent-red);">⚠ ${6 - val.length}자리 더 입력하세요 (현재 ${val.length}/6)</span>`; }
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
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
            if (msg) msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 유효하지 않은 날짜입니다 (월: ${mm}, 일: ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
            return;
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (inputDate > today) {
            if (msg) msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 오늘 이후(미래)의 날짜입니다</span>`;
            input.style.borderColor = 'var(--accent-red)';
            checkFifoWarning();
            return;
        }

        if (msg) msg.innerHTML = `<span style="color:var(--accent-green);">✓ ${fullYear}년 ${String(mm).padStart(2, '0')}월 ${String(dd).padStart(2, '0')}일</span>`;
        input.style.borderColor = 'var(--accent-green)';

        // 선입선출(FIFO) 경고 체크
        checkFifoWarning();
    }

    function checkFifoWarning() {
        const warningEl = document.getElementById('fifoWarning');
        const warningMsg = document.getElementById('fifoWarningMsg');
        if (!warningEl || !warningMsg) return;

        const carModel = (document.getElementById('addInjCarModel') || {}).value || '';
        const partName = (document.getElementById('addInjPart') || {}).value || '';
        if (!carModel || !partName) { warningEl.style.display = 'none'; return; }

        // 입력 중인 LOT 번호들 수집
        const inputLots = Array.from(document.querySelectorAll('#injLotRows .inj-lot-no'))
            .map(el => el.value.trim())
            .filter(v => v.length === 6);
        if (inputLots.length === 0) { warningEl.style.display = 'none'; return; }

        // 기존 등록된 최대(최신) LOT 번호 조회 (같은 차종+품명)
        const allRecords = Storage.getAll(STORE);
        let maxExistingLot = '';
        allRecords.forEach(r => {
            if (r.carModel !== carModel || r.partName !== partName) return;
            const lotList = (r.lots && r.lots.length > 0) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            lotList.forEach(l => {
                if (l.lotNo && l.lotNo > maxExistingLot) maxExistingLot = l.lotNo;
            });
        });

        if (!maxExistingLot) { warningEl.style.display = 'none'; return; }

        // 입력 LOT 중 기존 최신 LOT보다 오래된 것이 있으면 경고
        const oldLots = inputLots.filter(lotNo => lotNo < maxExistingLot);
        if (oldLots.length > 0) {
            warningMsg.textContent = `선입선출 위반: LOT ${oldLots.join(', ')} 은(는) 기존 최신 LOT(${maxExistingLot})보다 오래된 재고입니다.`;
            warningEl.style.display = 'flex';
        } else {
            warningEl.style.display = 'none';
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
        onCarModelSelectEdit,
        onPartNameSelectEdit,
        onColorSelectEdit,
        onIncomingQtyInput,
        addInjLotRow,
        removeInjLotRow,
        calcInjLotTotal,
        calcInjLotTotalEdit,
        calcTotalAddFailQty,
        calcTotalEditFailQty,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData,
        onLotInput,
        checkFifoWarning,
        markCertReceived,
        confirmCertReceived
    };
})();