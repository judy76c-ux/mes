// ===================================================================
// 원료 입고 (수입검사일지)
// ===================================================================
var PaintIncomingInspectionModule = (function() {
    const STORE = DB.STORES.PAINT_INCOMING_INSPECTIONS;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${IncomingUI.renderSection('paint-incoming-inspection')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintIncomingInspectionModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 검사 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="piFilterStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="piFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">구매처</label>
                        <select class="form-select" id="piFilterSupplier" onchange="PaintIncomingInspectionModule.onFilterSupplierChange()" style="min-width:130px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">원료명 (품목)</label>
                        <select class="form-select" id="piFilterPaintName" style="min-width:150px;">
                            <option value="">전체</option>
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="PaintIncomingInspectionModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                        <button class="btn btn-secondary" onclick="PaintIncomingInspectionModule.resetFilter()" style="margin-left:6px;">
                            <span class="material-symbols-outlined">refresh</span> 초기화
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="piStats"></div>

                <div id="piCertPendingSection"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일자</th>
                                        <th>도료품명</th>
                                        <th>입고수량</th>
                                        <th>제조일자</th>
                                        <th>제조사 표기 LOT</th>
                                        <th>LOT구분</th>
                                        <th>용기상태</th>
                                        <th>유효기간</th>
                                        <th>성적서</th>
                                        <th>판정</th>
                                        <th>검사자</th>
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

    function _populateSupplierDropdown(allData) {
        const el = document.getElementById('piFilterSupplier');
        if (!el) return;
        const prev = el.value;
        const suppliers = [...new Set(allData.map(d => d.supplier).filter(Boolean))].sort();
        el.innerHTML = '<option value="">전체</option>' +
            suppliers.map(s => `<option value="${s}" ${s === prev ? 'selected' : ''}>${s}</option>`).join('');
    }

    function onFilterSupplierChange() {
        const supplier = (document.getElementById('piFilterSupplier') || {}).value || '';
        const allData = Storage.getAll(STORE);
        const paintEl = document.getElementById('piFilterPaintName');
        if (!paintEl) return;
        const prev = paintEl.value;
        const paints = [...new Set(
            allData.filter(d => !supplier || d.supplier === supplier)
            .map(d => d.paintName).filter(Boolean)
        )].sort();
        paintEl.innerHTML = '<option value="">전체</option>' +
            paints.map(p => `<option value="${p}" ${p === prev ? 'selected' : ''}>${p}</option>`).join('');
    }

    function resetFilter() {
        const startEl = document.getElementById('piFilterStart');
        const endEl = document.getElementById('piFilterEnd');
        const supEl = document.getElementById('piFilterSupplier');
        const paintEl = document.getElementById('piFilterPaintName');
        if (startEl) startEl.value = UIUtils.monthAgo();
        if (endEl) endEl.value = UIUtils.today();
        if (supEl) supEl.value = '';
        if (paintEl) paintEl.innerHTML = '<option value="">전체</option>';
        search();
    }

    // LOT 구분 배지 렌더링 헬퍼
    function lotCheckBadge(val) {
        if (!val) return '-';
        const map = {
            '신규LOT 원료입고': {
                icon: 'arrow_upward', label: '신규 LOT',
                bg: '#dcfce7', border: '#86efac', color: '#16a34a'
            },
            '신규LOT 입고': {
                icon: 'arrow_upward', label: '신규 LOT',
                bg: '#dcfce7', border: '#86efac', color: '#16a34a'
            },
            '동일LOT 입고': {
                icon: 'arrow_downward', label: '입고된 LOT',
                bg: '#e0f2fe', border: '#7dd3fc', color: '#0369a1'
            },
            '선입불량 LOT 입고': {
                icon: 'warning', label: '신규LOT',
                bg: '#fff7ed', border: '#fed7aa', color: '#ea580c',
                suffix: '<span style="font-size:0.72rem;margin-left:2px;opacity:0.85;">FIFO</span>'
            }
        };
        const cfg = map[val];
        if (!cfg) return `<span style="font-size:0.82rem;">${val}</span>`;
        return `<span style="display:inline-flex;align-items:center;gap:3px;background:${cfg.bg};border:1px solid ${cfg.border};border-radius:5px;padding:2px 8px;font-weight:700;font-size:0.82rem;color:${cfg.color};">
            <span class="material-symbols-outlined" style="font-size:0.95rem;">${cfg.icon}</span>${cfg.label}${cfg.suffix || ''}
        </span>`;
    }

    function search() {
        const start = document.getElementById('piFilterStart').value;
        const end = document.getElementById('piFilterEnd').value;
        const supplier = (document.getElementById('piFilterSupplier') || {}).value || '';
        const paintName = (document.getElementById('piFilterPaintName') || {}).value || '';

        let data = Storage.getByDateRange(STORE, start, end);
        if (supplier) data = data.filter(d => d.supplier === supplier);
        if (paintName) data = data.filter(d => d.paintName === paintName);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const allInRange = Storage.getByDateRange(STORE, start, end);
        _populateSupplierDropdown(allInRange);
        onFilterSupplierChange();
        if (supplier) {
            const el = document.getElementById('piFilterSupplier');
            if (el) el.value = supplier;
        }
        if (paintName) {
            const el = document.getElementById('piFilterPaintName');
            if (el) el.value = paintName;
        }

        renderStats(data);
        renderPiCertPendingSection();
        renderTable(data);
    }

    function renderStats(data) {
        const total = data.length;
        const passCount = data.filter(d => d.verdict === '합격').length;
        const specialCount = data.filter(d => d.verdict === '특채').length;
        const failCount = data.filter(d => d.verdict === '불합격').length;
        const totalQty = data.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0);

        document.getElementById('piStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${total}</div>
                <div class="stat-card-label">검사 건수</div>
            </div>
            <div class="stat-card purple">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">입고 수량</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${passCount}</div>
                <div class="stat-card-label">합격</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${specialCount}</div>
                <div class="stat-card-label">특채</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${failCount}</div>
                <div class="stat-card-label">불합격</div>
            </div>
        `;
    }

    function renderTable(data) {
        const tbody = document.getElementById('piTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const verdictType = d.verdict === '합격' ? 'success'
                : d.verdict === '특채' ? 'warning'
                : 'danger';
            const containerType = (d.containerStatus === '양호' || d.containerStatus === '합격') ? 'success'
                : (d.containerStatus === '불량' || d.containerStatus === '불합격') ? 'danger' : '';
            const expType = (d.expDateCheck === '3개월 미만' || d.expDateCheck === '합격') ? 'success'
                : (d.expDateCheck === '6개월 미만') ? 'info'
                : (d.expDateCheck === '불합격' || d.expDateCheck === '6개월 이상') ? 'danger' : '';
            const certType = d.certCheck === '합격' || d.certCheck === '접수완료' ? 'success'
                : (d.certCheck === '불합격' || d.certCheck === '접수대기') ? 'danger' : '';
            const _dsp = (d.date || '').split(' ');
            const _dpp = (_dsp[0] || '').split('-');
            const _dtt = _dsp[1] ? _dsp[1].slice(0,5) : '';
            const _dateFmt = _dpp.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _dpp[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + _dpp[1] + '-' + _dpp[2] + '</span>' +
                  (_dtt ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _dtt + '</span>' : '')
                : (d.date || '-');
            return `
                <tr>
                    <td style="line-height:1.3;">${_dateFmt}</td>
                    <td><strong>${d.paintName || '-'}</strong></td>
                    <td style="text-align:right">${UIUtils.formatNumber(d.incomingQty)}</td>
                    <td>${d.mfgDate || '-'}</td>
                    <td>${d.lotNo || '-'}</td>
                    <td>${lotCheckBadge(d.lotCheck)}</td>
                    <td>${d.containerStatus && containerType ? UIUtils.badge(d.containerStatus, containerType) : (d.containerStatus || '-')}</td>
                    <td>${d.expDateCheck && expType ? UIUtils.badge(d.expDateCheck, expType) : (d.expDateCheck || '-')}</td>
                    <td>${d.certCheck && certType ? UIUtils.badge(d.certCheck, certType) : (d.certCheck || '-')}</td>
                    <td>${UIUtils.badge(d.verdict || '-', verdictType)}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted);">${d.inspector || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="PaintIncomingInspectionModule.view('${d.id}')">
                            <span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px;">visibility</span> 보기
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function buildFormHTML(d = {}) {
        const paints = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const uniqueSuppliers = [...new Set(paints.map(p => p.supplier).filter(Boolean))].sort();
        const inspectors = (Storage.getAll(DB.STORES.INSPECTORS) || [])
            .filter(i => (i.processes || []).includes('incoming'));
        const inspectorOptions = inspectors.map(i => `<option value="${i.name}" ${i.name === (d.inspector || '') ? 'selected' : ''}>${i.name}</option>`).join('');

        let supplierOptions = `<option value="">-- 구매처 선택 --</option>`;
        uniqueSuppliers.forEach(sup => {
            supplierOptions += `<option value="${sup}" ${d.supplier === sup ? 'selected' : ''}>${sup}</option>`;
        });

        const currentSupplier = d.supplier || '';
        let paintOptions = `<option value="">-- 원료명 선택 --</option>`;
        let initialManufacturer = '';
        if (currentSupplier) {
            const filteredPaints = paints.filter(p => p.supplier === currentSupplier);
            filteredPaints.forEach(p => {
                paintOptions += `<option value="${p.name}" ${d.paintName === p.name ? 'selected' : ''}>${p.name}</option>`;
            });
            // 편집 모드: 기존 선택된 도료의 제조사 초기값 설정
            if (d.paintName) {
                const matchedPaint = filteredPaints.find(p => p.name === d.paintName);
                if (matchedPaint) initialManufacturer = matchedPaint.manufacturer || '';
            }
        }

        const lotCheckInitHTML = (() => {
            const v = d.lotCheck || '';
            if (!v) return '<span style="color:var(--text-muted);font-size:0.82rem;">제조일자 입력 시 자동 판정</span>';
            return lotCheckBadge(v);
            const lotCfg = {
                '동일LOT 입고': {
                    color: 'var(--accent-blue)',
                    bg: '#e3f2fd'
                },
                '신규LOT 입고': {
                    color: 'var(--accent-green)',
                    bg: '#e8f5e9'
                },
                '선입불량 LOT 입고': {
                    color: 'var(--accent-red)',
                    bg: '#ffebee'
                },
                '선입선출': {
                    color: 'var(--accent-blue)',
                    bg: '#e3f2fd'
                },
                '신규LOT': {
                    color: 'var(--accent-green)',
                    bg: '#e8f5e9'
                },
            } [v] || {
                color: 'var(--text-secondary)',
                bg: 'var(--bg-secondary)'
            };
            return `<span style="display:inline-block;background:${lotCfg.bg};color:${lotCfg.color};border:1.5px solid ${lotCfg.color};border-radius:6px;padding:5px 14px;font-weight:700;font-size:0.875rem;">${v}</span>`;
        })();

        const fullDate = d.date || '';
        const [datePart, timePart] = fullDate.split(' ');

        return `
            <!-- ① 입력 항목 -->
            <div style="font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">edit_note</span>
                입력 항목
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">검사일시 <span style="color:var(--accent-red)">*</span></label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="piDate" value="${datePart || UIUtils.today()}">
                        <input type="time" class="form-input" id="piTime" value="${timePart || new Date().toTimeString().slice(0, 5)}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">검사자 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="piInspector">
                        <option value="">-- 검사자 선택 --</option>
                        ${inspectorOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="piSupplier">
                        ${supplierOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">원료명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="piPaintName">
                        ${paintOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사 표기 LOT <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="piLotNo" placeholder="제조사 표기 LOT 번호 입력" value="${d.lotNo || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">제조일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="piMfgDate"
                        value="${d.mfgDate || ''}"
                        min="2000-01-01"
                        max="${Storage.today()}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="piIncomingQty" min="1" placeholder="0" value="${d.incomingQty || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">도료 명판 사진
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(NAS 저장)</span>
                    </label>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.85rem;background:var(--bg-secondary);">
                            <span class="material-symbols-outlined" style="font-size:18px;">photo_camera</span>
                            <span>사진 선택</span>
                            <input type="file" id="piNameplateFile" accept="image/*" style="display:none"
                                onchange="PaintIncomingInspectionModule.onNameplateFileChange(this)">
                        </label>
                        <span id="piNameplateFileName" style="font-size:0.78rem;color:var(--text-muted);">미선택</span>
                    </div>
                    ${d.nameplatePhotoUrl ? `<div id="piNameplatePreview" style="margin-top:6px;">
                        <img src="${ApiClient.photoUrl(d.nameplatePhotoUrl)}" style="max-height:80px;border-radius:6px;border:1px solid var(--border);">
                        <span style="font-size:0.75rem;color:var(--accent-green);margin-left:6px;">✓ 저장됨</span>
                    </div>` : `<div id="piNameplatePreview"></div>`}
                    <input type="hidden" id="piNameplatePhotoUrl" value="${d.nameplatePhotoUrl || ''}">
                </div>
            </div>

            <!-- ② 자동 표시 항목 -->
            <div style="font-weight:600;color:var(--text-primary);margin:20px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">auto_awesome</span>
                자동 표시
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(원료명 선택 시 자동)</span></label>
                    <input type="text" class="form-input" id="piManufacturer" readonly
                        style="background:var(--bg-secondary);color:var(--accent-blue);font-weight:600;"
                        placeholder="원료명 선택 시 자동 표시"
                        value="${initialManufacturer}">
                </div>
                <div class="form-group">
                    <label class="form-label">포장단위 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(원료명 선택 시 자동)</span></label>
                    <input type="text" class="form-input" id="piPackUnit" placeholder="예: 20L/캔, 1kg/캔" value="${d.packUnit || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">유통기한 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(원료명 선택 시 자동)</span></label>
                    <input type="text" class="form-input" id="piShelfLife" placeholder="예: 12개월, 6개월" value="${d.shelfLife || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">유효기간 (만료일) <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(제조일자+유통기한 자동계산)</span></label>
                    <input type="date" class="form-input" id="piExpDate" value="${d.expDate || ''}">
                </div>
            </div>
            <!-- 유효기간 임박 경고 -->
            <div id="piExpDateWarning" style="display:none; margin-bottom:12px; padding:10px 14px;
                background:rgba(244,67,54,0.10); border:1.5px solid var(--accent-red);
                border-radius:8px; color:var(--accent-red); font-size:0.875rem;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px;">warning</span>
                    <span id="piExpDateWarningMsg" style="font-weight:600;"></span>
                </div>
            </div>
            <!-- LOT 변경 확인 (자동 판정) -->
            <div style="display:flex;align-items:center;gap:12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 16px;margin-bottom:12px;">
                <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;white-space:nowrap;">LOT 변경 확인</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">(이전 입고 제조일 비교 자동 판정)</span>
                <input type="hidden" id="piLotCheckValue" value="${d.lotCheck || ''}">
                <div id="piLotCheckResult" style="display:flex;align-items:center;">
                    ${lotCheckInitHTML}
                </div>
            </div>
            <!-- 신LOT 입고 시 성적서 접수 안내 -->
            <div id="piNewLotWarning" style="display:none;margin-bottom:12px;padding:12px 14px;background:#e8f5e9;border:1.5px solid var(--accent-green);border-radius:6px;color:var(--accent-green);font-weight:600;font-size:0.875rem;">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;margin-right:6px;">info</span>
                신LOT 입고 - 성적서 접수 필요
            </div>
            <!-- 입고 도료 현재 재고 및 LOT 정보 -->
            <div style="padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;margin-bottom:4px;">
                <div style="font-weight:600;color:var(--text-primary);margin-bottom:10px;font-size:0.875rem;">📦 입고 도료 현재 재고 및 LOT 정보</div>
                <div id="piCurrentInventory" style="font-size:0.825rem;color:var(--text-muted);">
                    <span>도료명을 선택하면 현재 재고 정보가 표시됩니다.</span>
                </div>
            </div>

            <!-- ③ 검사항목 -->
            <div style="font-weight:600;color:var(--text-primary);margin:20px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">fact_check</span>
                검사항목 <span style="color:var(--accent-red);font-size:0.85rem;">*</span>
                <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">모든 항목 필수</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-bottom:4px;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:9px 14px;text-align:left;color:var(--text-secondary);font-weight:600;width:32%;border-bottom:1px solid var(--border);">검사항목</th>
                        <th style="padding:9px 14px;text-align:center;color:var(--text-secondary);font-weight:600;width:32%;border-bottom:1px solid var(--border);">결과</th>
                        <th style="padding:9px 14px;text-align:left;color:var(--text-secondary);font-weight:600;width:36%;border-bottom:1px solid var(--border);">특이사항</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 14px;color:var(--text-primary);font-weight:500;">용기 상태</td>
                        <td style="padding:10px 14px;text-align:center;">
                            <div style="display:flex;gap:20px;justify-content:center;">
                                <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.875rem;">
                                    <input type="radio" name="piContainer" value="양호"
                                        ${d.containerStatus === '양호' || d.containerStatus === '합격' ? 'checked' : ''}
                                        onchange="PaintIncomingInspectionModule.onContainerStatusChange()"> 양호
                                </label>
                                <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.875rem;">
                                    <input type="radio" name="piContainer" value="불량"
                                        ${d.containerStatus === '불량' || d.containerStatus === '불합격' ? 'checked' : ''}
                                        onchange="PaintIncomingInspectionModule.onContainerStatusChange()"> 불량
                                </label>
                            </div>
                        </td>
                        <td style="padding:8px 14px;">
                            <input type="text" class="form-input" id="piContainerNote" placeholder="특이사항" value="${d.containerNote || ''}" style="margin:0;padding:6px 10px;">
                        </td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 14px;color:var(--text-primary);font-weight:500;">유효기간 확인
                            <div style="font-size:0.72rem;color:var(--text-muted);font-weight:400;margin-top:2px;">제조일 기준 자동 판정 · 6개월 이상은 생산 확인 후 입고</div>
                        </td>
                        <td style="padding:10px 14px;text-align:center;">
                            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start;justify-content:center;max-width:260px;margin:0 auto;">
                                <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);">제조일로부터 <span style="font-weight:400;color:var(--text-muted);">(자동)</span></div>
                                <label style="display:flex;align-items:center;gap:6px;font-size:0.875rem;opacity:0.95;">
                                    <input type="radio" name="piExpCheck" value="3개월 미만" disabled
                                        ${d.expDateCheck === '3개월 미만' || d.expDateCheck === '합격' ? 'checked' : ''}> 3개월 미만
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;font-size:0.875rem;opacity:0.95;">
                                    <input type="radio" name="piExpCheck" value="6개월 미만" disabled
                                        ${d.expDateCheck === '6개월 미만' ? 'checked' : ''}> 6개월 미만
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;font-size:0.875rem;color:var(--accent-red);font-weight:600;opacity:0.95;">
                                    <input type="radio" name="piExpCheck" value="6개월 이상" disabled
                                        ${d.expDateCheck === '6개월 이상' ? 'checked' : ''}> 6개월 이상
                                </label>
                                <input type="hidden" id="piExpCheckValue" value="${d.expDateCheck === '합격' ? '3개월 미만' : (d.expDateCheck || '')}">
                            </div>
                            <div id="piExpAgeHint" style="display:none;margin-top:8px;font-size:0.78rem;color:var(--accent-red);font-weight:600;"></div>
                        </td>
                        <td style="padding:8px 14px;">
                            <input type="text" class="form-input" id="piExpCheckNote" placeholder="특이사항" value="${d.expDateCheckNote || ''}" style="margin:0;padding:6px 10px;">
                        </td>
                    </tr>
                    <tr id="piOver6NotifyRow" style="border-bottom:1px solid var(--border);${d.expDateCheck === '6개월 이상' ? '' : 'display:none;'}">
                        <td colspan="3" style="padding:12px 14px;background:#fff7ed;">
                            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;padding:10px 12px;border:1px solid #fdba74;border-radius:8px;background:#fff;">
                                <span class="material-symbols-outlined" style="color:#ea580c;font-size:22px;">verified</span>
                                <div>
                                    <div style="font-weight:700;color:#c2410c;margin-bottom:2px;">6개월 이상 — 특채 · 생산 확인 후 입고</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);">
                                        원칙상 입고 불가입니다. <strong>특채</strong>로 등록되며 품질·생산 관리자에게 통보됩니다.
                                        생산 일정에 소모 가능한지 확인 후 창고 입고 처리됩니다.
                                    </div>
                                </div>
                            </div>
                            <input type="hidden" id="piOver6Notified" value="${d.over6Notified ? '1' : ''}">
                        </td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 14px;color:var(--text-primary);font-weight:500;">성적서 접수 확인</td>
                        <td style="padding:10px 14px;text-align:center;">
                            <div style="display:flex;gap:20px;justify-content:center;">
                                <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.875rem;">
                                    <input type="radio" name="piCert" value="접수완료"
                                        ${d.certCheck === '접수완료' ? 'checked' : ''}
                                        onchange="PaintIncomingInspectionModule.onCertCheckChange(this)"> 접수완료
                                </label>
                                <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.875rem;">
                                    <input type="radio" name="piCert" value="접수대기"
                                        ${d.certCheck === '접수대기' ? 'checked' : ''}
                                        onchange="PaintIncomingInspectionModule.onCertCheckChange(this)"> 접수대기
                                </label>
                            </div>
                        </td>
                        <td style="padding:8px 14px;">
                            <input type="text" class="form-input" id="piCertNote" placeholder="특이사항" value="${d.certNote || ''}" style="margin:0;padding:6px 10px;">
                        </td>
                    </tr>
                    <tr id="piCertPhotoRow" style="border-bottom:1px solid var(--border);${d.certCheck === '접수완료' ? '' : 'display:none;'}">
                        <td style="padding:10px 14px;color:var(--accent-green);font-weight:600;">성적서 사진</td>
                        <td colspan="2" style="padding:10px 14px;">
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid var(--accent-green);border-radius:6px;cursor:pointer;font-size:0.85rem;background:#f0fdf4;color:var(--accent-green);">
                                    <span class="material-symbols-outlined" style="font-size:18px;">upload_file</span>
                                    <span>성적서 사진 업로드</span>
                                    <input type="file" id="piCertFile" accept="image/*" style="display:none"
                                        onchange="PaintIncomingInspectionModule.onCertFileChange(this)">
                                </label>
                                <span id="piCertFileName" style="font-size:0.78rem;color:var(--text-muted);">미선택</span>
                                ${d.certPhotoUrl ? `<a href="${ApiClient.photoUrl(d.certPhotoUrl)}" target="_blank" style="font-size:0.78rem;color:var(--accent-green);">✓ 저장된 사진 보기</a>` : ''}
                            </div>
                            ${d.certPhotoUrl ? `<div id="piCertPreview" style="margin-top:8px;">
                                <img src="${ApiClient.photoUrl(d.certPhotoUrl)}" style="max-height:100px;border-radius:6px;border:1px solid var(--border);">
                            </div>` : `<div id="piCertPreview"></div>`}
                            <input type="hidden" id="piCertPhotoUrl" value="${d.certPhotoUrl || ''}">
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="form-row" style="margin-top:20px;">
                <div class="form-group">
                    <label class="form-label">최종 판정 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="piVerdict" onchange="PaintIncomingInspectionModule.onVerdictChange()">
                        <option value="">-- 선택 --</option>
                        <option value="합격" ${d.verdict === '합격' ? 'selected' : ''}>✅ 합격</option>
                        <option value="특채" ${d.verdict === '특채' ? 'selected' : ''}>⚠ 특채 (예외 입고)</option>
                        <option value="불합격" ${d.verdict === '불합격' ? 'selected' : ''}>❌ 불합격</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="piNote" placeholder="비고" value="${d.note || ''}">
                </div>
            </div>
            <div id="piSpecialApprovalRow" style="margin-top:12px;${d.verdict === '특채' || d.expDateCheck === '6개월 이상' ? '' : 'display:none;'}">
                <div style="padding:12px 14px;border:1px solid #fbbf24;border-radius:8px;background:#fffbeb;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <span class="material-symbols-outlined" style="color:#d97706;">verified</span>
                        <strong style="color:#b45309;">특채 — 생산 일정 확인 후 입고</strong>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:10px;">
                        6개월 이상 도료는 특채로 등록됩니다. 생산관리자·품질관리자가 일정 소모 가능 여부를 확인한 후 창고 입고가 가능합니다.
                    </div>
                    <div class="form-group" style="margin:0 0 10px;">
                        <label class="form-label">특채 사유 <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="piSpecialReason"
                            placeholder="특채 사유 (예: 생산 긴급 투입, 품질 확인 후 사용 등)"
                            value="${d.specialReason || (d.expDateCheck === '6개월 이상' ? '제조일로부터 6개월 이상 — 특채 입고' : '')}">
                    </div>
                    <div id="piSpecialNotifyWrap">
                        ${_buildProdNotifySelectorHtml(
                            d.specialNotifyRecipients || d.over6NotifyRecipients || _defaultNotifyRecipientIds(),
                            'pi-special-notify-user'
                        )}
                    </div>
                </div>
            </div>
        `;
    }

    function collectFormData() {
        const dateVal = document.getElementById('piDate').value;
        const timeVal = document.getElementById('piTime').value;
        const expHidden = (document.getElementById('piExpCheckValue') || {}).value || '';
        const expRadio = (document.querySelector('input[name="piExpCheck"]:checked') || {}).value || '';
        return {
            date: `${dateVal} ${timeVal}`.trim(),
            inspector: document.getElementById('piInspector').value.trim(),
            supplier: document.getElementById('piSupplier').value.trim(),
            paintName: document.getElementById('piPaintName').value.trim(),
            packUnit: document.getElementById('piPackUnit').value.trim(),
            incomingQty: Number(document.getElementById('piIncomingQty').value) || 0,
            mfgDate: document.getElementById('piMfgDate').value,
            expDate: document.getElementById('piExpDate').value,
            shelfLife: document.getElementById('piShelfLife').value.trim(),
            lotNo: document.getElementById('piLotNo').value.trim(),
            containerStatus: (document.querySelector('input[name="piContainer"]:checked') || {}).value || '',
            containerNote: document.getElementById('piContainerNote').value.trim(),
            expDateCheck: expHidden || expRadio,
            expDateCheckNote: document.getElementById('piExpCheckNote').value.trim(),
            certCheck: (document.querySelector('input[name="piCert"]:checked') || {}).value || '',
            certNote: document.getElementById('piCertNote').value.trim(),
            certPhotoUrl: (document.getElementById('piCertPhotoUrl') || {}).value || '',
            nameplatePhotoUrl: (document.getElementById('piNameplatePhotoUrl') || {}).value || '',
            lotCheck: document.getElementById('piLotCheckValue')?.value || '',
            verdict: document.getElementById('piVerdict').value,
            note: document.getElementById('piNote').value.trim(),
            specialReason: (document.getElementById('piSpecialReason') || {}).value
                ? document.getElementById('piSpecialReason').value.trim() : '',
            specialNotifyRecipients: _getSelectedProdNotifyUsers('pi-special-notify-user'),
            over6NotifyRecipients: _getSelectedProdNotifyUsers('pi-over6-notify-user'),
            over6Notified: (document.getElementById('piOver6Notified') || {}).value === '1'
        };
    }

    // ── 생산 통보 (6개월 이상 / 특채) ────────────────────────────────
    function _getProdNotifyUsers() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce((map, role) => {
            map[role.key] = role;
            return map;
        }, {});
        const preferRoles = new Set(['prod_manager', 'quality_manager']);
        return users
            .filter(u => u && u.active !== false)
            .map(u => {
                const roles = [...(Array.isArray(u.roles) ? u.roles : []), u.role].filter(Boolean).map(String);
                const primary = roles.find(r => preferRoles.has(r)) || '';
                if (!primary) return null;
                const role = roleMap[primary] || null;
                return {
                    id: String(u.id || ''),
                    name: String(u.displayName || u.username || u.id || ''),
                    role: primary,
                    roleLabel: role ? role.label : primary,
                    roleColor: role ? role.color : 'var(--text-muted)',
                    preferred: true
                };
            })
            .filter(u => u && u.id)
            .sort((a, b) => a.roleLabel.localeCompare(b.roleLabel, 'ko') || a.name.localeCompare(b.name, 'ko'));
    }

    function _defaultNotifyRecipientIds() {
        return _getProdNotifyUsers().map(u => u.id);
    }

    function _autoSelectNotifyUsers(checkboxClass) {
        const checks = Array.from(document.querySelectorAll('.' + (checkboxClass || 'pi-special-notify-user')));
        checks.forEach(check => { check.checked = true; });
    }

    function _buildProdNotifySelectorHtml(selectedIds, checkboxClass) {
        const cls = checkboxClass || 'pi-special-notify-user';
        const users = _getProdNotifyUsers();
        const selected = new Set(
            (selectedIds && selectedIds.length ? selectedIds : users.map(u => u.id)).map(String)
        );
        if (!users.length) {
            return '<div style="padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 품질/생산 관리자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(user => {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(key => {
            const group = groups[key];
            return `<div style="display:flex;flex-direction:column;gap:8px;">
                <div style="font-size:0.78rem;font-weight:700;color:${group.color};">${group.label}</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
                    ${group.items.map(user => `
                        <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.18);border-radius:8px;background:#fff;cursor:pointer;">
                            <input type="checkbox" class="${cls}" value="${user.id}"
                                ${selected.has(user.id) ? 'checked' : ''}
                                style="width:16px;height:16px;accent-color:#dc2626;">
                            <span style="font-size:0.82rem;color:var(--text-primary);font-weight:600;">${user.name}</span>
                        </label>`).join('')}
                </div>
            </div>`;
        }).join('');
        return `<div style="border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <div style="font-size:0.8rem;font-weight:700;color:#dc2626;">생산 통보 수신자 지정</div>
                <button type="button" class="btn btn-outline btn-sm" onclick="PaintIncomingInspectionModule.toggleOver6NotifyUsers(true, '${cls}')">전체 선택</button>
            </div>
            <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">품질 관리자·생산 관리자 중 통보받을 담당자를 선택하세요.</div>
            <div style="display:flex;flex-direction:column;gap:12px;max-height:180px;overflow:auto;">${roleBlocks}</div>
        </div>`;
    }

    function _getSelectedProdNotifyUsers(checkboxClass) {
        const cls = checkboxClass || 'pi-over6-notify-user';
        return Array.from(document.querySelectorAll('.' + cls + ':checked'))
            .map(el => String(el.value || '').trim())
            .filter(Boolean);
    }

    function toggleOver6NotifyUsers(forceCheck, checkboxClass) {
        const cls = checkboxClass || 'pi-over6-notify-user';
        const checks = Array.from(document.querySelectorAll('.' + cls));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(check => !check.checked);
        checks.forEach(check => { check.checked = shouldCheck; });
    }

    function _sendOver6ProdNotification(data, recipientIds, opts) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return false;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return false;
        const months = _monthsSinceMfg(data.mfgDate, (data.date || '').split(' ')[0] || UIUtils.today());
        const isSpecial = !!(opts && opts.special);
        return AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: isSpecial
                ? '도료 수입검사 — 특채(생산 확인 후 입고) 통보'
                : '도료 수입검사 — 6개월 이상 입고 불가 통보',
            body: [
                isSpecial
                    ? '제조일로부터 6개월 이상 경과 도료를 특채로 등록했습니다. 생산 일정에 소모 가능한지 확인해 주세요.'
                    : '제조일로부터 6개월 이상 경과한 도료가 수입검사에서 확인되었습니다.',
                isSpecial
                    ? '특채 사유를 확인하고, 생산 일정 소모 가능 여부 확인 후 입고 처리하세요.'
                    : '입고 불가(불합격) 처리되며 생산 측에 통보합니다.',
                '',
                `검사일: ${data.date || '-'}`,
                `구매처: ${data.supplier || '-'}`,
                `원료명: ${data.paintName || '-'}`,
                `제조일자: ${data.mfgDate || '-'}`,
                `경과: ${months != null ? months + '개월' : '-'}`,
                `제조사 LOT: ${data.lotNo || '-'}`,
                `입고수량: ${UIUtils.formatNumber(data.incomingQty)}`,
                `용기 상태: ${data.containerStatus || '-'}`,
                `유효기간 확인: ${data.expDateCheck || '-'}`,
                `최종 판정: ${data.verdict || '-'}`,
                isSpecial && data.specialReason ? `특채 사유: ${data.specialReason}` : '',
                `검사자: ${data.inspector || '-'}`,
                data.expDateCheckNote ? `특이사항: ${data.expDateCheckNote}` : '',
                data.note ? `비고: ${data.note}` : ''
            ].filter(Boolean).join('\n'),
            category: isSpecial ? 'paint_incoming_special' : 'paint_incoming_over6',
            priority: 'high'
        });
    }

    // ── 사진 이벤트 핸들러 ──────────────────────────────────────────
    function onCertCheckChange(radio) {
        const row = document.getElementById('piCertPhotoRow');
        if (row) row.style.display = radio.value === '접수완료' ? '' : 'none';
    }

    // 제조일 기준 경과 개월 수 (검사일 또는 오늘 기준)
    function _monthsSinceMfg(mfgDate, baseDate) {
        if (!mfgDate) return null;
        const mfg = new Date(mfgDate);
        const base = new Date(baseDate || UIUtils.today());
        if (Number.isNaN(mfg.getTime()) || Number.isNaN(base.getTime())) return null;
        let months = (base.getFullYear() - mfg.getFullYear()) * 12 + (base.getMonth() - mfg.getMonth());
        if (base.getDate() < mfg.getDate()) months -= 1;
        return months;
    }

    function _mfgAgeCategory(mfgDate, baseDate) {
        const months = _monthsSinceMfg(mfgDate, baseDate);
        if (months == null) return null;
        if (months < 0) return 'future';
        if (months < 3) return 'under3';
        if (months < 6) return 'under6';
        return 'over6';
    }

    function _syncExpCheckFromMfg() {
        const mfgEl = document.getElementById('piMfgDate');
        const inspEl = document.getElementById('piDate');
        const hintEl = document.getElementById('piExpAgeHint');
        const hiddenEl = document.getElementById('piExpCheckValue');
        const radios = document.querySelectorAll('input[name="piExpCheck"]');
        if (!mfgEl || !mfgEl.value) {
            if (hintEl) { hintEl.style.display = 'none'; hintEl.textContent = ''; }
            if (hiddenEl) hiddenEl.value = '';
            radios.forEach(r => { r.checked = false; });
            _updateOver6NotifyRow();
            onVerdictChange();
            return;
        }
        const cat = _mfgAgeCategory(mfgEl.value, inspEl ? inspEl.value : UIUtils.today());
        let value = '';
        if (cat === 'under3') {
            value = '3개월 미만';
            if (hintEl) { hintEl.style.display = 'block'; hintEl.style.color = 'var(--accent-green)'; hintEl.textContent = '✓ 자동 판정: 제조일로부터 3개월 미만 — 입고 가능'; }
        } else if (cat === 'under6') {
            value = '6개월 미만';
            if (hintEl) { hintEl.style.display = 'block'; hintEl.style.color = 'var(--accent-orange)'; hintEl.textContent = '✓ 자동 판정: 제조일로부터 6개월 미만 — 입고 가능'; }
        } else if (cat === 'over6') {
            value = '6개월 이상';
            if (hintEl) { hintEl.style.display = 'block'; hintEl.style.color = 'var(--accent-red)'; hintEl.textContent = '⚠ 자동 판정: 6개월 이상 — 특채 등록 · 생산 확인 후 입고'; }
        } else if (cat === 'future') {
            value = '';
            if (hintEl) { hintEl.style.display = 'block'; hintEl.style.color = 'var(--accent-red)'; hintEl.textContent = '⛔ 제조일자가 미래입니다.'; }
        } else if (hintEl) {
            hintEl.style.display = 'none';
            hintEl.textContent = '';
        }
        radios.forEach(r => { r.checked = r.value === value; });
        if (hiddenEl) hiddenEl.value = value;
        _updateOver6NotifyRow();
        _syncVerdictFromChecks();
        onVerdictChange();
        if (value === '6개월 이상') {
            const reasonEl = document.getElementById('piSpecialReason');
            if (reasonEl && !reasonEl.value.trim()) {
                reasonEl.value = '제조일로부터 6개월 이상 — 특채 입고';
            }
            _autoSelectNotifyUsers('pi-special-notify-user');
        }
    }

    function _updateOver6NotifyRow() {
        const row = document.getElementById('piOver6NotifyRow');
        const expCheck = (document.getElementById('piExpCheckValue') || {}).value
            || (document.querySelector('input[name="piExpCheck"]:checked') || {}).value || '';
        const show = expCheck === '6개월 이상';
        if (row) row.style.display = show ? '' : 'none';
        if (!show) {
            const notified = document.getElementById('piOver6Notified');
            if (notified) notified.value = '';
        }
    }

    function onExpCheckChange() {
        _updateOver6NotifyRow();
        _syncVerdictFromChecks();
        onVerdictChange();
    }

    function onContainerStatusChange() {
        _syncVerdictFromChecks();
        onVerdictChange();
    }

    function onVerdictChange() {
        const verdictEl = document.getElementById('piVerdict');
        const verdict = (verdictEl || {}).value || '';
        const expCheck = (document.getElementById('piExpCheckValue') || {}).value
            || (document.querySelector('input[name="piExpCheck"]:checked') || {}).value || '';
        const specialRow = document.getElementById('piSpecialApprovalRow');
        const showSpecial = verdict === '특채' || expCheck === '6개월 이상';
        if (specialRow) specialRow.style.display = showSpecial ? '' : 'none';
        if (showSpecial) _autoSelectNotifyUsers('pi-special-notify-user');
    }

    function _syncVerdictFromChecks() {
        const verdictEl = document.getElementById('piVerdict');
        if (!verdictEl) return;
        const container = (document.querySelector('input[name="piContainer"]:checked') || {}).value || '';
        const expCheck = (document.getElementById('piExpCheckValue') || {}).value
            || (document.querySelector('input[name="piExpCheck"]:checked') || {}).value || '';
        const mfgEl = document.getElementById('piMfgDate');
        const inspEl = document.getElementById('piDate');
        const cat = mfgEl && mfgEl.value
            ? _mfgAgeCategory(mfgEl.value, inspEl ? inspEl.value : UIUtils.today())
            : null;

        if (container === '불량' || cat === 'future') {
            verdictEl.value = '불합격';
            return;
        }
        // 6개월 이상 → 특채 자동
        if (expCheck === '6개월 이상' || cat === 'over6') {
            verdictEl.value = '특채';
            return;
        }
        if (container === '양호' && (expCheck === '3개월 미만' || expCheck === '6개월 미만')) {
            verdictEl.value = '합격';
        }
    }

    function onNameplateFileChange(input) {
        const file = input.files && input.files[0];
        const nameEl = document.getElementById('piNameplateFileName');
        const previewEl = document.getElementById('piNameplatePreview');
        if (!file) return;
        if (nameEl) nameEl.textContent = file.name;
        // 로컬 미리보기
        const reader = new FileReader();
        reader.onload = e => {
            if (previewEl) previewEl.innerHTML = `<img src="${e.target.result}" style="max-height:80px;border-radius:6px;border:1px solid var(--border);margin-top:6px;">
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:6px;">업로드 전</span>`;
        };
        reader.readAsDataURL(file);
    }

    function onCertFileChange(input) {
        const file = input.files && input.files[0];
        const nameEl = document.getElementById('piCertFileName');
        const previewEl = document.getElementById('piCertPreview');
        if (!file) return;
        if (nameEl) nameEl.textContent = file.name;
        const reader = new FileReader();
        reader.onload = e => {
            if (previewEl) previewEl.innerHTML = `<img src="${e.target.result}" style="max-height:100px;border-radius:6px;border:1px solid var(--border);margin-top:8px;">`;
        };
        reader.readAsDataURL(file);
    }

    // 선택된 사진 파일을 NAS에 업로드하고 URL 반환 (없으면 기존 URL 유지)
    async function _uploadPendingPhotos() {
        const nameplateFile = (document.getElementById('piNameplateFile') || {}).files;
        const certFile = (document.getElementById('piCertFile') || {}).files;
        let nameplateUrl = (document.getElementById('piNameplatePhotoUrl') || {}).value || '';
        let certUrl = (document.getElementById('piCertPhotoUrl') || {}).value || '';

        if (nameplateFile && nameplateFile[0]) {
            try {
                nameplateUrl = await ApiClient.uploadPhoto(nameplateFile[0], 'paint-inspections');
                const urlInput = document.getElementById('piNameplatePhotoUrl');
                if (urlInput) urlInput.value = nameplateUrl;
            } catch (e) {
                UIUtils.toast('명판 사진 업로드 실패: ' + e.message, 'error');
                throw e;
            }
        }
        if (certFile && certFile[0]) {
            try {
                certUrl = await ApiClient.uploadPhoto(certFile[0], 'paint-inspections');
                const urlInput = document.getElementById('piCertPhotoUrl');
                if (urlInput) urlInput.value = certUrl;
            } catch (e) {
                UIUtils.toast('성적서 사진 업로드 실패: ' + e.message, 'error');
                throw e;
            }
        }
        return { nameplateUrl, certUrl };
    }

    function _validateFormData(data) {
        if (!data.inspector) { UIUtils.toast('검사자를 선택하세요.', 'warning'); return false; }
        if (!data.lotNo) { UIUtils.toast('제조사 표기 LOT를 입력하세요.', 'warning'); return false; }
        if (!data.mfgDate) { UIUtils.toast('제조일자를 입력하세요.', 'warning'); return false; }
        if (!data.incomingQty || data.incomingQty <= 0) { UIUtils.toast('입고수량을 입력하세요.', 'warning'); return false; }
        if (!data.containerStatus) { UIUtils.toast('검사항목 — 용기 상태를 선택하세요.', 'warning'); return false; }
        if (!data.expDateCheck) { UIUtils.toast('검사항목 — 유효기간 확인을 선택하세요.', 'warning'); return false; }
        if (!data.certCheck) { UIUtils.toast('검사항목 — 성적서 접수 확인을 선택하세요.', 'warning'); return false; }
        if (!data.verdict) { UIUtils.toast('최종 판정을 선택하세요.', 'warning'); return false; }

        const ageCat = _mfgAgeCategory(data.mfgDate, (data.date || '').split(' ')[0] || UIUtils.today());
        if (ageCat === 'future') {
            UIUtils.toast('제조일자는 오늘 날짜보다 미래일 수 없습니다.', 'warning');
            return false;
        }
        if (data.containerStatus === '불량' && (data.verdict === '합격' || data.verdict === '특채')) {
            UIUtils.toast('용기 상태가 불량이면 합격/특채 판정할 수 없습니다.', 'warning');
            return false;
        }

        // 6개월 이상: 특채 자동 처리 + 품질/생산 관리자 통보
        if (data.expDateCheck === '6개월 이상' || ageCat === 'over6') {
            if (data.verdict !== '특채') {
                UIUtils.toast('6개월 이상 도료는 특채 자동 처리됩니다. 최종 판정을 확인하세요.', 'warning');
                return false;
            }
            if (!data.specialReason) {
                UIUtils.toast('특채 사유를 입력하세요.', 'warning');
                return false;
            }
            const recipients = (data.specialNotifyRecipients && data.specialNotifyRecipients.length)
                ? data.specialNotifyRecipients
                : _defaultNotifyRecipientIds();
            if (!recipients.length) {
                UIUtils.toast('통보할 품질/생산 관리자가 없습니다. 사용자 역할을 확인하세요.', 'warning');
                return false;
            }
            data.specialNotifyRecipients = recipients;
            return true;
        }

        if (data.verdict === '특채') {
            if (!data.specialReason) {
                UIUtils.toast('특채 사유를 입력하세요.', 'warning');
                return false;
            }
            const recipients = (data.specialNotifyRecipients && data.specialNotifyRecipients.length)
                ? data.specialNotifyRecipients
                : _defaultNotifyRecipientIds();
            if (!recipients.length) {
                UIUtils.toast('특채 시 품질/생산 관리자 통보 대상이 없습니다.', 'warning');
                return false;
            }
            data.specialNotifyRecipients = recipients;
            return true;
        }

        if (data.verdict === '합격' && data.expDateCheck !== '3개월 미만' && data.expDateCheck !== '6개월 미만') {
            UIUtils.toast('유효기간 확인(3개월 미만 / 6개월 미만)이 자동 판정되어야 합격 입고할 수 있습니다.', 'warning');
            return false;
        }
        return true;
    }

    function setupPaintSelectSync(excludeId) {
        setTimeout(() => {
            const supplierSelect = document.getElementById('piSupplier');
            const paintSelect = document.getElementById('piPaintName');
            const packUnitInput = document.getElementById('piPackUnit');
            const shelfLifeInput = document.getElementById('piShelfLife');
            const mfgDateInput = document.getElementById('piMfgDate');
            const expDateInput = document.getElementById('piExpDate');
            if (!supplierSelect || !paintSelect) return;

            const paints = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];

            function calcExpDate() {
                if (!mfgDateInput || !shelfLifeInput || !expDateInput) return;
                const mfgDate = mfgDateInput.value;
                const shelfLife = shelfLifeInput.value.trim();
                if (!mfgDate || !shelfLife) return;

                const d = new Date(mfgDate);
                const monthMatch = shelfLife.match(/(\d+)\s*개월/);
                const yearMatch = shelfLife.match(/(\d+)\s*년/);
                if (monthMatch) {
                    d.setMonth(d.getMonth() + parseInt(monthMatch[1]));
                } else if (yearMatch) {
                    d.setFullYear(d.getFullYear() + parseInt(yearMatch[1]));
                } else {
                    return;
                }
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                expDateInput.value = `${yyyy}-${mm}-${dd}`;
                checkExpDateWarning();
            }

            // 유효기간 임박 경고 (검사일 기준 3일 이내 또는 만료)
            function checkExpDateWarning() {
                const warningEl  = document.getElementById('piExpDateWarning');
                const warningMsg = document.getElementById('piExpDateWarningMsg');
                if (!warningEl || !warningMsg || !expDateInput) return;

                const expDate  = expDateInput.value;
                const inspDateEl = document.getElementById('piDate');
                const inspDate = inspDateEl ? inspDateEl.value : '';

                if (!expDate || !inspDate) {
                    warningEl.style.display = 'none';
                    return;
                }

                // 날짜 차이 (일 단위, 소수점 버림)
                const expMs   = new Date(expDate).getTime();
                const inspMs  = new Date(inspDate).getTime();
                const diffDays = Math.floor((expMs - inspMs) / (1000 * 60 * 60 * 24));

                // 3개월 임박 기준: 검사일 기준 3개월 후 날짜 계산
                const inspDateObj = new Date(inspDate);
                const threeMonthsLater = new Date(inspDateObj);
                threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
                const isWithin3Months = new Date(expDate) <= threeMonthsLater;

                if (diffDays < 0) {
                    warningEl.style.display = 'block';
                    warningMsg.textContent = `⛔ 입고 불가 — 유효기간이 이미 만료된 도료입니다! (만료: ${expDate})`;
                } else if (isWithin3Months) {
                    const remainMonths = Math.floor(diffDays / 30);
                    const remainDays   = diffDays % 30;
                    const remainText   = remainMonths > 0
                        ? `${remainMonths}개월 ${remainDays}일`
                        : `${diffDays}일`;
                    warningEl.style.display = 'block';
                    warningMsg.textContent = `⚠ 입고 경고 — 유효기간 만료까지 ${remainText} 남았습니다 (만료: ${expDate})`;
                } else {
                    warningEl.style.display = 'none';
                }
            }

            function updateLotDisplay(value) {
                const resultEl = document.getElementById('piLotCheckResult');
                const hiddenEl = document.getElementById('piLotCheckValue');
                const warningEl = document.getElementById('piNewLotWarning');
                if (!resultEl) return;
                if (!value) {
                    resultEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">제조일자 입력 시 자동 판정</span>';
                    if (hiddenEl) hiddenEl.value = '';
                    if (warningEl) warningEl.style.display = 'none';
                    return;
                }
                const cfg = {
                    '동일LOT 입고': {
                        color: 'var(--accent-blue)',
                        bg: '#e3f2fd'
                    },
                    '신규LOT 입고': {
                        color: 'var(--accent-green)',
                        bg: '#e8f5e9'
                    },
                    '선입불량 LOT 입고': {
                        color: 'var(--accent-red)',
                        bg: '#ffebee'
                    },
                } [value] || {
                    color: 'var(--text-secondary)',
                    bg: 'var(--bg-secondary)'
                };
                resultEl.innerHTML = lotCheckBadge(value);
                if (hiddenEl) hiddenEl.value = value;
                if (warningEl) {
                    warningEl.style.display = (value === '신규LOT 입고' || value === '신규LOT 원료입고') ? 'block' : 'none';
                }
                // 성적서 접수 자동 처리
                const certCompleteEl = document.querySelector('input[name="piCert"][value="접수완료"]');
                const certWaitEl = document.querySelector('input[name="piCert"][value="접수대기"]');
                const certNoteEl = document.getElementById('piCertNote');
                if (value === '동일LOT 입고') {
                    // 동일LOT → 접수완료 자동 체크 + 특이사항 입력
                    if (certCompleteEl) certCompleteEl.checked = true;
                    if (certNoteEl) certNoteEl.value = '접수된 LOT';
                } else {
                    // 다른 LOT 상태 → 자동 입력값 초기화
                    if (certCompleteEl) certCompleteEl.checked = false;
                    if (certWaitEl) certWaitEl.checked = false;
                    if (certNoteEl && certNoteEl.value === '접수된 LOT') certNoteEl.value = '';
                }
            }

            function lotToDateStr(lot) {
                if (!lot || !/^\d{6}$/.test(lot)) return '';
                const yy = parseInt(lot.slice(0, 2), 10);
                const mm = lot.slice(2, 4);
                const dd = lot.slice(4, 6);
                const yyyy = yy < 50 ? '20' + String(yy).padStart(2, '0') : '19' + String(yy).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }

            function checkLotStatus() {
                const supplier = supplierSelect.value || '';
                const paintName = paintSelect.value || '';
                const mfgDate = mfgDateInput ? mfgDateInput.value : '';
                if (!supplier || !paintName || !mfgDate) {
                    updateLotDisplay('');
                    return;
                }

                const inspEntries = Storage.getAll(STORE)
                    .filter(r => r.supplier === supplier && r.paintName === paintName && r.mfgDate && r.id !== excludeId)
                    .map(r => ({
                        date: r.date || '',
                        mfgDate: r.mfgDate
                    }));

                const allMaterials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
                const matchedMat = allMaterials.find(m => m.supplier === supplier && m.name === paintName);
                const invEntries = [];
                if (matchedMat) {
                    (Storage.getAll(DB.STORES.PAINT_INVENTORY) || [])
                    .filter(r => r.materialId === matchedMat.id && r.type !== '출고' && r.lotNo)
                        .forEach(r => {
                            const mfgDateStr = lotToDateStr(r.lotNo);
                            if (mfgDateStr) invEntries.push({
                                date: r.date || '',
                                mfgDate: mfgDateStr
                            });
                        });
                }

                const combined = [...inspEntries, ...invEntries].sort((a, b) => b.date.localeCompare(a.date));
                const prev = combined[0];

                if (!prev) {
                    updateLotDisplay('신규LOT 원료입고');
                } else if (mfgDate === prev.mfgDate) {
                    updateLotDisplay('동일LOT 입고');
                } else if (mfgDate > prev.mfgDate) {
                    updateLotDisplay('신규LOT 입고');
                } else {
                    updateLotDisplay('선입불량 LOT 입고');
                }
            }

            supplierSelect.addEventListener('change', (e) => {
                const sup = e.target.value;
                const filtered = paints.filter(p => p.supplier === sup);
                paintSelect.innerHTML = '<option value="">-- 원료명 선택 --</option>' + filtered.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                paintSelect.value = '';
                if (packUnitInput) packUnitInput.value = '';
                if (shelfLifeInput) shelfLifeInput.value = '';
                // 구매처 변경 시 제조사 초기화
                const manufacturerInput = document.getElementById('piManufacturer');
                if (manufacturerInput) manufacturerInput.value = '';
                checkLotStatus();
            });

            function updateInventoryDisplay() {
                const sup = supplierSelect.value;
                const paintName = paintSelect.value;
                const invEl = document.getElementById('piCurrentInventory');
                if (!invEl || !sup || !paintName) {
                    invEl.innerHTML = '<span style="color:var(--text-muted);">도료명을 선택하면 현재 재고 정보가 표시됩니다.</span>';
                    return;
                }

                const allMaterials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
                const matchedMat = allMaterials.find(m => m.supplier === sup && m.name === paintName);
                if (!matchedMat) {
                    invEl.innerHTML = '<span style="color:var(--text-muted);">재고 정보가 없습니다.</span>';
                    return;
                }

                const invEntries = (Storage.getAll(DB.STORES.PAINT_INVENTORY) || [])
                    .filter(r => r.materialId === matchedMat.id && r.type !== '출고');

                if (invEntries.length === 0) {
                    invEl.innerHTML = '<span style="color:var(--text-muted);">현재 재고가 없습니다.</span>';
                    return;
                }

                const lotData = invEntries.map(entry => {
                    const lotNo = entry.lotNo || '기타';
                    const qty = entry.currentQty || 0;
                    return {
                        lotNo: lotNo,
                        qty: qty,
                        date: entry.date || ''
                    };
                }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                const totalQty = lotData.reduce((sum, item) => sum + item.qty, 0);
                const lotList = lotData.map(item =>
                    `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:var(--text-primary);font-weight:500;">LOT: ${item.lotNo}</span>
                        <span style="color:var(--accent-blue);font-weight:600;font-size:0.9rem;">${UIUtils.formatNumber(item.qty)}</span>
                    </div>`
                ).join('');

                invEl.innerHTML = `
                    <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1.5px solid var(--accent-blue);">
                        <div style="display:flex;justify-content:space-between;align-items:baseline;">
                            <span style="color:var(--text-secondary);font-weight:500;">총 재고</span>
                            <span style="color:var(--accent-blue);font-weight:700;font-size:1.1rem;">${UIUtils.formatNumber(totalQty)}</span>
                        </div>
                    </div>
                    <div>
                        ${lotList}
                    </div>
                `;
            }

            paintSelect.addEventListener('change', (e) => {
                const selectedPaintName = e.target.value;
                const sup = supplierSelect.value;
                const paintData = paints.find(p => p.supplier === sup && p.name === selectedPaintName);
                const manufacturerInput = document.getElementById('piManufacturer');
                if (paintData) {
                    if (packUnitInput && paintData.packUnit) packUnitInput.value = paintData.packUnit;
                    if (shelfLifeInput && paintData.shelfLife) {
                        shelfLifeInput.value = paintData.shelfLife;
                        calcExpDate();
                    }
                    // 제조사 자동 표시
                    if (manufacturerInput) manufacturerInput.value = paintData.manufacturer || '';
                } else {
                    if (manufacturerInput) manufacturerInput.value = '';
                }
                updateInventoryDisplay();
                checkLotStatus();
            });

            if (mfgDateInput) mfgDateInput.addEventListener('change', () => {
                calcExpDate();
                checkLotStatus();
                _syncExpCheckFromMfg();
            });
            if (shelfLifeInput) shelfLifeInput.addEventListener('change', calcExpDate);
            // 유효기간 직접 수정 시 경고 체크
            if (expDateInput) expDateInput.addEventListener('change', checkExpDateWarning);
            // 검사일 변경 시 경고 재체크
            const inspDateEl = document.getElementById('piDate');
            if (inspDateEl) inspDateEl.addEventListener('change', () => {
                checkExpDateWarning();
                _syncExpCheckFromMfg();
            });

            checkLotStatus();
            checkExpDateWarning();
            _syncExpCheckFromMfg();
            onVerdictChange();
            updateInventoryDisplay();
        }, 100);
    }

    function openAddModal() {
        UIUtils.showModal('도료 수입검사 등록', buildFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintIncomingInspectionModule.saveNew()">등록</button>
        `, '1050px');
        setupPaintSelectSync(null);
    }

    async function saveNew() {
        const data = collectFormData();
        if (!data.date || !data.supplier || !data.paintName) {
            UIUtils.toast('검사일자, 구매처, 원료명은 필수입니다.', 'warning');
            return;
        }
        if (!_validateFormData(data)) return;
        if (data.mfgDate && data.mfgDate > UIUtils.today()) {
            UIUtils.toast('제조일자는 오늘 날짜보다 미래일 수 없습니다.', 'warning');
            return;
        }
        try {
            await _uploadPendingPhotos();
        } catch (e) { return; }
        const finalData = collectFormData();
        // 저장 직전 자동 판정 재동기화
        if (finalData.mfgDate) {
            const ageCat = _mfgAgeCategory(finalData.mfgDate, (finalData.date || '').split(' ')[0] || UIUtils.today());
            if (ageCat === 'under3') finalData.expDateCheck = '3개월 미만';
            else if (ageCat === 'under6') finalData.expDateCheck = '6개월 미만';
            else if (ageCat === 'over6') {
                finalData.expDateCheck = '6개월 이상';
                finalData.verdict = '특채';
                if (!finalData.specialReason) finalData.specialReason = '제조일로부터 6개월 이상 — 특채 입고';
            }
        }
        if (finalData.verdict === '특채' || finalData.expDateCheck === '6개월 이상') {
            const recipients = (finalData.specialNotifyRecipients && finalData.specialNotifyRecipients.length)
                ? finalData.specialNotifyRecipients
                : _defaultNotifyRecipientIds();
            if (!recipients.length) {
                UIUtils.toast('통보할 품질/생산 관리자가 없습니다.', 'error');
                return;
            }
            finalData.verdict = '특채';
            finalData.specialNotifyRecipients = recipients;
            finalData.over6NotifyRecipients = recipients;
            const ok = _sendOver6ProdNotification(finalData, recipients, { special: true });
            if (!ok) {
                UIUtils.toast('특채 통보 전송에 실패했습니다. 로그인 상태를 확인하세요.', 'error');
                return;
            }
            finalData.over6Notified = true;
            finalData.over6NotifiedAt = new Date().toISOString();
            finalData.specialNotified = true;
            finalData.specialNotifiedAt = finalData.over6NotifiedAt;
            finalData.prodConfirmed = false;
        }
        await Storage.add(STORE, finalData);
        UIUtils.closeModal();
        UIUtils.toast(
            finalData.verdict === '특채'
                ? '특채 등록 및 통보 완료. 생산 일정 확인 후 입고 처리하세요.'
                : '도료 수입검사가 등록되었습니다.',
            finalData.verdict === '특채' ? 'warning' : 'success'
        );
        search();
        if (typeof PaintInventoryModule !== 'undefined' && PaintInventoryModule.renderPaintInspStandby) {
            PaintInventoryModule.renderPaintInspStandby();
        }
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        UIUtils.showModal('도료 수입검사 수정', buildFormHTML(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintIncomingInspectionModule.saveEdit('${id}')">저장</button>
        `, '1050px');
        setupPaintSelectSync(id);
    }

    async function saveEdit(id) {
        const data = collectFormData();
        if (!data.date || !data.supplier || !data.paintName) {
            UIUtils.toast('검사일자, 구매처, 원료명은 필수입니다.', 'warning');
            return;
        }
        if (!_validateFormData(data)) return;
        if (data.mfgDate && data.mfgDate > UIUtils.today()) {
            UIUtils.toast('제조일자는 오늘 날짜보다 미래일 수 없습니다.', 'warning');
            return;
        }
        try {
            await _uploadPendingPhotos();
        } catch (e) { return; }
        const finalData = collectFormData();
        const prev = Storage.getById(STORE, id) || {};
        if (finalData.mfgDate) {
            const ageCat = _mfgAgeCategory(finalData.mfgDate, (finalData.date || '').split(' ')[0] || UIUtils.today());
            if (ageCat === 'under3') finalData.expDateCheck = '3개월 미만';
            else if (ageCat === 'under6') finalData.expDateCheck = '6개월 미만';
            else if (ageCat === 'over6') {
                finalData.expDateCheck = '6개월 이상';
                finalData.verdict = '특채';
                if (!finalData.specialReason) finalData.specialReason = '제조일로부터 6개월 이상 — 특채 입고';
            }
        }
        if ((finalData.verdict === '특채' || finalData.expDateCheck === '6개월 이상') && !prev.specialNotified && !prev.over6Notified) {
            const recipients = (finalData.specialNotifyRecipients && finalData.specialNotifyRecipients.length)
                ? finalData.specialNotifyRecipients
                : _defaultNotifyRecipientIds();
            if (!recipients.length) {
                UIUtils.toast('통보할 품질/생산 관리자가 없습니다.', 'error');
                return;
            }
            finalData.verdict = '특채';
            finalData.specialNotifyRecipients = recipients;
            finalData.over6NotifyRecipients = recipients;
            const ok = _sendOver6ProdNotification(finalData, recipients, { special: true });
            if (!ok) {
                UIUtils.toast('특채 통보 전송에 실패했습니다. 로그인 상태를 확인하세요.', 'error');
                return;
            }
            finalData.over6Notified = true;
            finalData.over6NotifiedAt = new Date().toISOString();
            finalData.specialNotified = true;
            finalData.specialNotifiedAt = finalData.over6NotifiedAt;
            finalData.prodConfirmed = false;
        } else if (prev.over6Notified || prev.specialNotified) {
            finalData.over6Notified = true;
            finalData.over6NotifiedAt = prev.over6NotifiedAt || prev.specialNotifiedAt || '';
            finalData.specialNotified = !!prev.specialNotified || finalData.verdict === '특채';
            finalData.specialNotifiedAt = prev.specialNotifiedAt || '';
            if (prev.prodConfirmed) {
                finalData.prodConfirmed = true;
                finalData.prodConfirmedAt = prev.prodConfirmedAt || '';
                finalData.prodConfirmedBy = prev.prodConfirmedBy || '';
                finalData.prodConfirmNote = prev.prodConfirmNote || '';
            } else if (finalData.verdict === '특채') {
                finalData.prodConfirmed = false;
            }
            if (!finalData.over6NotifyRecipients.length && prev.over6NotifyRecipients) {
                finalData.over6NotifyRecipients = prev.over6NotifyRecipients;
            }
            if (!finalData.specialNotifyRecipients.length && prev.specialNotifyRecipients) {
                finalData.specialNotifyRecipients = prev.specialNotifyRecipients;
            }
            if (!finalData.specialReason && prev.specialReason) {
                finalData.specialReason = prev.specialReason;
            }
        }
        await Storage.update(STORE, id, finalData);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        search();
        if (typeof PaintInventoryModule !== 'undefined' && PaintInventoryModule.renderPaintInspStandby) {
            PaintInventoryModule.renderPaintInspStandby();
        }
    }

    function view(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const verdictText = d.verdict || '-';
        const verdictColor = d.verdict === '합격' ? 'var(--accent-green)'
            : d.verdict === '특채' ? 'var(--accent-orange)'
            : d.verdict === '불합격' ? 'var(--accent-red)'
            : 'var(--text-muted)';

        const row = (label, value) =>
            `<div style="display:flex;gap:0;border-bottom:1px solid var(--border);">
                <div style="width:140px;flex-shrink:0;padding:8px 12px;background:var(--bg-secondary);font-size:0.82rem;font-weight:600;color:var(--text-muted);">${label}</div>
                <div style="flex:1;padding:8px 14px;font-size:0.9rem;">${value}</div>
            </div>`;

        UIUtils.showModal(`도료 수입검사 상세`, `
            <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:16px;">
                ${row('검사일자', d.date || '-')}
                ${row('검사자', d.inspector || '-')}
                ${row('구매처', d.supplier || '-')}
                ${row('도료품명', d.paintName || '-')}
                ${row('제조사 표기 LOT', d.lotNo || '-')}
                ${row('제조일자', d.mfgDate || '-')}
                ${row('유효기간', d.expDate || '-')}
                ${row('입고수량', UIUtils.formatNumber(d.incomingQty))}
                ${row('LOT 구분', d.lotCheck || '-')}
                ${row('용기 상태', d.containerStatus || '-')}
                ${row('유효기간 확인', d.expDateCheck || '-')}
                ${d.verdict === '특채' ? row('특채 사유', d.specialReason || '-') : ''}
                ${(d.expDateCheck === '6개월 이상' || d.verdict === '특채') ? row('생산 통보', (d.over6Notified || d.specialNotified)
                    ? `✓ 통보 완료${((d.specialNotifyRecipients || d.over6NotifyRecipients || []).length) ? ` (${(d.specialNotifyRecipients || d.over6NotifyRecipients || []).length}명)` : ''}`
                    : '미통보') : ''}
                ${d.verdict === '특채' ? row('생산 확인', d.prodConfirmed
                    ? `✓ 확인 완료 (${d.prodConfirmedBy || '-'}${d.prodConfirmedAt ? ' / ' + String(d.prodConfirmedAt).slice(0, 10) : ''})`
                    : '생산 일정 소모 확인 대기') : ''}
                ${d.verdict === '특채' && d.prodConfirmNote ? row('생산 확인 비고', d.prodConfirmNote) : ''}
                ${row('성적서 접수', d.certCheck || '-')}
                ${d.certPhotoUrl ? row('성적서 사진', `<a href="${ApiClient.photoUrl(d.certPhotoUrl)}" target="_blank"><img src="${ApiClient.photoUrl(d.certPhotoUrl)}" style="max-height:80px;border-radius:6px;border:1px solid var(--border);cursor:pointer;"></a>`) : ''}
                ${d.nameplatePhotoUrl ? row('명판 사진', `<a href="${ApiClient.photoUrl(d.nameplatePhotoUrl)}" target="_blank"><img src="${ApiClient.photoUrl(d.nameplatePhotoUrl)}" style="max-height:80px;border-radius:6px;border:1px solid var(--border);cursor:pointer;"></a>`) : ''}
                ${row('비고', d.note || '-')}
                ${row('최종 판정', `<strong style="color:${verdictColor};font-size:1rem;">${verdictText}</strong>`)}
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-outline" onclick="UIUtils.closeModal();PaintIncomingInspectionModule.edit('${id}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">edit</span> 수정
            </button>
            <button class="btn" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
                onclick="PaintIncomingInspectionModule.confirmDelete('${id}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">delete</span> 삭제
            </button>
        `, '700px');
    }

    function confirmDelete(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const label = `${d.date || ''} / ${d.paintName || ''}`;
        UIUtils.showModal('삭제 확인 — 관리자 인증 필요',
            `<div style="padding:8px 0;">
                <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:16px;">
                    <span class="material-symbols-outlined" style="color:#ea580c;font-size:28px;">warning</span>
                    <div>
                        <div style="font-weight:700;color:#c2410c;margin-bottom:4px;">삭제 후 복구가 불가능합니다</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);">${label}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">삭제 사유 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="deleteReasonInput" placeholder="삭제 사유를 입력하세요">
                </div>
                <div style="font-size:0.82rem;color:var(--text-muted);margin-top:8px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">info</span>
                    삭제 시 관리자 인증이 필요하며, 삭제 이력이 기록됩니다.
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn" style="background:#dc2626;color:#fff;" onclick="PaintIncomingInspectionModule._doDelete('${id}')">
                 <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">lock</span> 관리자 인증 후 삭제
             </button>`,
            '520px'
        );
    }

    async function _doDelete(id) {
        const reason = (document.getElementById('deleteReasonInput') || {}).value || '';
        if (!reason.trim()) { UIUtils.toast('삭제 사유를 입력하세요.', 'warning'); return; }
        const d = Storage.getById(STORE, id);
        if (!d) { UIUtils.toast('레코드를 찾을 수 없습니다.', 'error'); return; }
        UIUtils.closeModal();
        AuthModule.requireAdminAuth(async function() {
            const user = AuthModule.getCurrentUser();
            const logEntry = {
                id: Storage.generateId(),
                type: 'paint',
                typeLabel: '도료 수입검사',
                deletedAt: new Date().toISOString(),
                deletedBy: user ? user.displayName : '알 수 없음',
                reason: reason,
                originalId: id,
                originalData: Object.assign({}, d),
                summary: `${d.date || ''} / ${d.paintName || ''} / 입고${UIUtils.formatNumber(d.incomingQty)}`,
            };
            await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, logEntry);
            await Storage.remove(STORE, id);
            if (typeof PaintInventoryModule !== 'undefined' && PaintInventoryModule.renderPaintInspStandby) {
                PaintInventoryModule.renderPaintInspStandby();
            }
            UIUtils.toast('삭제 완료. 이력이 기록되었습니다.', 'success');
            search();
        });
    }

    function remove(id) {
        confirmDelete(id);
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = [
            '검사일자', '검사자', '구매처', '원료명', '포장단위', '입고수량',
            '제조일자', '유효기간(만료일)', '유통기한', '제조사 표기 LOT',
            '용기상태', '용기상태_비고', '유효기간확인', '유효기간확인_비고',
            '성적서접수확인', '성적서확인_비고', 'LOT구분', '최종판정', '비고'
        ];
        const rows = data.map(d => [
            d.date, d.inspector, d.supplier, d.paintName, d.packUnit, d.incomingQty,
            d.mfgDate, d.expDate, d.shelfLife, d.lotNo,
            d.containerStatus, d.containerNote,
            d.expDateCheck, d.expDateCheckNote,
            d.certCheck, d.certNote,
            d.lotCheck, d.verdict, d.note || ''
        ]);
        Storage.exportToCSV(headers, rows, '원료_수입검사일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    function renderPiCertPendingSection() {
        const el = document.getElementById('piCertPendingSection');
        if (!el) return;

        const allRecords = Storage.getAll(STORE);
        const pending = allRecords.filter(d => d.certCheck !== '접수완료')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (pending.length === 0) { el.innerHTML = ''; return; }

        el.innerHTML = `
            <div class="card" style="border:2px solid #fca5a5;margin-bottom:16px;">
                <div class="card-header" style="background:rgba(220,38,38,0.06);border-bottom:1px solid #fca5a5;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="color:#dc2626;">pending_actions</span>
                        <span style="font-weight:700;color:#dc2626;font-size:1rem;">도료 성적서 미접수 관리</span>
                        <span style="background:#dc2626;color:#fff;border-radius:12px;padding:1px 10px;font-size:0.82rem;font-weight:700;">${pending.length}건</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--text-muted);">접수 완료 처리 후 목록에서 제거됩니다</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>검사일자</th>
                                <th>원료명</th>
                                <th>구매처</th>
                                <th>제조일자</th>
                                <th>제조사 표기 LOT</th>
                                <th>입고수량</th>
                                <th>LOT구분</th>
                                <th style="text-align:center;">접수 처리</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pending.map(d => {
                                const _ps = (d.date || '').split(' ');
                                const _pp = (_ps[0] || '').split('-');
                                const _pt = _ps[1] ? _ps[1].slice(0,5) : '';
                                const _pFmt = _pp.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _pp[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _pp[1] + '-' + _pp[2] + '</span>' +
                                      (_pt ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _pt + '</span>' : '')
                                    : (d.date || '-');
                                return `
                                <tr style="background:rgba(220,38,38,0.03);">
                                    <td style="line-height:1.3;">${_pFmt}</td>
                                    <td><strong>${d.paintName || '-'}</strong></td>
                                    <td>${d.supplier || '-'}</td>
                                    <td>${d.mfgDate || '-'}</td>
                                    <td style="font-family:monospace;">${d.lotNo || '-'}</td>
                                    <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                                    <td>${lotCheckBadge(d.lotCheck)}</td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm btn-primary"
                                            onclick="PaintIncomingInspectionModule.markCertReceived('${d.id}')"
                                            style="font-size:0.78rem;">
                                            <span class="material-symbols-outlined" style="font-size:0.9rem;">check_circle</span>
                                            접수 완료
                                        </button>
                                    </td>
                                </tr>`; }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function markCertReceived(id) {
        const record = Storage.getById(STORE, id);
        if (!record) return;
        UIUtils.showModal('도료 성적서 접수 완료', `
            <div style="padding:8px 0;">
                <p style="margin-bottom:16px;color:var(--text-secondary);">
                    <strong>${record.paintName || ''}</strong> (${record.supplier || ''}) 의 성적서 접수일을 입력하세요.
                </p>
                <div class="form-group">
                    <label class="form-label">접수일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="piCertReceivedDate" value="${Storage.today()}" max="${Storage.today()}">
                </div>
                <div class="form-group" style="margin-top:14px;">
                    <label class="form-label" style="margin-bottom:6px;">성적서 사진 <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">(선택)</span></label>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;padding:6px 12px;border:1px solid var(--accent-green);border-radius:6px;font-size:.82rem;color:var(--accent-green);background:#f0fdf4;">
                            <span class="material-symbols-outlined" style="font-size:16px;">photo_camera</span> 사진 선택
                            <input type="file" id="piCertQuickPhotoFile" accept="image/*" capture="environment" style="display:none;"
                                onchange="PaintIncomingInspectionModule._onCertQuickPhotoSelected()">
                        </label>
                        <span id="piCertQuickPhotoName" style="font-size:.8rem;color:var(--text-muted);">선택된 파일 없음</span>
                    </div>
                    <div id="piCertQuickPhotoPreview" style="margin-top:8px;display:none;">
                        <img id="piCertQuickPhotoImg" style="max-width:100%;max-height:180px;border-radius:6px;border:1px solid var(--border-color);">
                    </div>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintIncomingInspectionModule.confirmCertReceived('${id}')">
                <span class="material-symbols-outlined">check_circle</span> 접수 완료
            </button>
        `);
    }

    function _onCertQuickPhotoSelected() {
        const input = document.getElementById('piCertQuickPhotoFile');
        const nameEl = document.getElementById('piCertQuickPhotoName');
        const previewEl = document.getElementById('piCertQuickPhotoPreview');
        const imgEl = document.getElementById('piCertQuickPhotoImg');
        if (!input || !input.files[0]) return;
        if (nameEl) nameEl.textContent = input.files[0].name;
        const reader = new FileReader();
        reader.onload = e => {
            if (imgEl) imgEl.src = e.target.result;
            if (previewEl) previewEl.style.display = '';
        };
        reader.readAsDataURL(input.files[0]);
    }

    async function confirmCertReceived(id) {
        const dateVal = (document.getElementById('piCertReceivedDate') || {}).value;
        if (!dateVal) { UIUtils.toast('접수일을 입력하세요.', 'warning'); return; }

        let certPhotoUrl = '';
        const photoInput = document.getElementById('piCertQuickPhotoFile');
        if (photoInput && photoInput.files[0]) {
            try {
                certPhotoUrl = await ApiClient.uploadPhoto(photoInput.files[0], 'paint-inspections');
            } catch (err) {
                UIUtils.toast('사진 업로드 실패: ' + err.message, 'warning');
            }
        }

        const updateData = { certCheck: '접수완료', certNote: '접수 완료', certReceivedDate: dateVal };
        if (certPhotoUrl) updateData.certPhotoUrl = certPhotoUrl;
        await Storage.update(STORE, id, updateData);
        UIUtils.closeModal();
        UIUtils.toast('성적서 접수 완료 처리되었습니다.', 'success');
        search();
    }

    return {
        render,
        search,
        resetFilter,
        onFilterSupplierChange,
        openAddModal,
        saveNew,
        view,
        edit,
        saveEdit,
        remove,
        confirmDelete,
        _doDelete,
        exportData,
        onCertCheckChange,
        onContainerStatusChange,
        onExpCheckChange,
        onVerdictChange,
        toggleOver6NotifyUsers,
        onNameplateFileChange,
        onCertFileChange,
        markCertReceived,
        _onCertQuickPhotoSelected,
        confirmCertReceived
    };
})();
