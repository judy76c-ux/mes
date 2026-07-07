/**
 * 출하/제품 공정 모듈
 * - 출하검사 대기 (도장/레이져 검사 완료품 자동 유입)
 * - 출하검사 일지 (샘플링 검사)
 * - 제품 창고 (재고관리)
 * - 제품 출고
 */

// ===================================================================
// 출하검사 통합 페이지 (대기 + 검사 일지)
// ===================================================================
const ShippingStandbyModule = (function() {
    const SB_STORE = DB.STORES.SHIPPING_STANDBY;
    const SI_STORE = DB.STORES.SHIPPING_INSPECTIONS;
    let _historyRows = [];

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _inspectionDateCell(dateValue, timeValue) {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return '<span style="color:var(--text-muted);">-</span>';
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) return _esc([rawDate, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' '));
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.08;min-width:56px;">
                <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${dateMatch[1]}</span>
                <strong style="font-size:0.92rem;color:var(--text-primary);">${dateMatch[2]}-${dateMatch[3]}</strong>
                ${timeMatch ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${timeMatch[1]}</span>` : ''}
            </div>`;
    }

    function _uniqText(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))].join(', ');
    }

    function _lotFields(row) {
        return {
            paintLot: _uniqText(row.paintLot || row.paintingDate || ''),
            injectionLot: _uniqText(row.injectionLot || row.lotNo || ''),
            laserLot: _uniqText(row.laserLot || row.laserWorkDate || '')
        };
    }

    function _lotCell(value) {
        const text = _uniqText(value);
        return text ? `<span style="font-family:monospace;font-size:0.78rem;">${_esc(text)}</span>` : '<span style="color:var(--text-muted);">-</span>';
    }

    // ── 페이지 렌더 ───────────────────────────────────────────────────
    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions" style="display:flex;align-items:center;gap:8px;width:100%;">
                        <button class="btn btn-outline" onclick="ShippingStandbyModule.openShippingStandardList()">
                            <span class="material-symbols-outlined">fact_check</span> 출하검사 기준서
                        </button>
                    </div>
                </div>

                <!-- 통계 -->
                <div class="stat-cards" id="ssStats"></div>

                <!-- ① 검사 대기 섹션 -->
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-orange);">pending_actions</span>
                            검사 대기
                        </h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>등록일</th>
                                        <th>공정</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>도장 LOT</th>
                                        <th>사출 LOT</th>
                                        <th style="text-align:right">수량</th>
                                        <th style="text-align:center">박스수</th>
                                        <th>납품처</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="ssWaitingBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- ② 검사 이력 섹션 -->
                <div class="card">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="color:var(--accent-green);">task_alt</span>
                            검사 이력
                        </h4>
                        <!-- 기간 필터 -->
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                            <input type="date" class="form-input" id="ssHistStart"
                                value="${UIUtils.monthAgo()}" style="width:130px;font-size:0.82rem;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="ssHistEnd"
                                value="${UIUtils.today()}" style="width:130px;font-size:0.82rem;">
                            <select class="form-select" id="ssHistCar" onchange="ShippingStandbyModule.onHistoryCarChange()"
                                style="width:140px;font-size:0.82rem;">
                                <option value="">전체 차종</option>
                            </select>
                            <select class="form-select" id="ssHistPart" style="width:220px;font-size:0.82rem;">
                                <option value="">전체 품명</option>
                            </select>
                            <button class="btn btn-primary btn-sm"
                                onclick="ShippingStandbyModule.loadHistory()"
                                style="padding:6px 12px;font-size:0.82rem;">
                                <span class="material-symbols-outlined" style="font-size:14px;">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일</th>
                                        <th>납품처</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>도장LOT</th>
                                        <th>사출LOT</th>
                                        <th>레이져 LOT</th>
                                        <th style="text-align:right">LOT 수량</th>
                                        <th style="text-align:center">샘플/코드</th>
                                        <th style="text-align:center">불량</th>
                                        <th style="text-align:center">판정</th>
                                        <th>검사자</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="ssHistoryBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        loadData();
        _renderHistoryFilterOptions();
        loadHistory();
    }

    // ── 대기 목록 ────────────────────────────────────────────────────
    function loadData() {
        const sbData  = Storage.getAll(SB_STORE);
        sbData.sort((a, b) => (b.laserWorkDate || '').localeCompare(a.laserWorkDate || ''));
        const waiting = sbData.filter(d => d.status === '대기');

        // 이력에서 통계
        const siData = Storage.getAll(SI_STORE);
        const pass   = siData.filter(d => d.result === '합격').length;
        const fail   = siData.filter(d => d.result === '불합격').length;

        const statsEl = document.getElementById('ssStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card orange">
                    <div class="stat-card-value">${waiting.length}</div>
                    <div class="stat-card-label">검사 대기</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${siData.length}</div>
                    <div class="stat-card-label">총 검사 건수</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${pass}</div>
                    <div class="stat-card-label">합격</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-card-value">${fail}</div>
                    <div class="stat-card-label">불합격</div>
                </div>
            `;
        }

        const srcLabel = s => s === 'laser_inspection' ? '레이져' : '도장';
        const srcColor = s => s === 'laser_inspection'
            ? 'var(--accent-purple,#a855f7)' : 'var(--accent-blue)';

        const waitingBody = document.getElementById('ssWaitingBody');
        if (!waitingBody) return;

        if (!waiting.length) {
            waitingBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.3;">check_circle</span>
                현재 검사 대기 품목이 없습니다.</td></tr>`;
            return;
        }

        waitingBody.innerHTML = waiting.map(d => `
            <tr>
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td><span style="font-size:0.78rem;font-weight:600;color:${srcColor(d.source)};">${srcLabel(d.source)}</span></td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.paintingDate || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.lotNo || '-'}</td>
                <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.goodQty || d.inspectionQty || 0)}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent-blue);">${d.boxCount > 0 ? UIUtils.formatNumber(d.boxCount) + ' BOX' : '-'}</td>
                <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                <td style="white-space:nowrap;" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary"
                        onclick="ShippingInspectionModule.openFromStandby('${d.id}')"
                        style="padding:4px 10px;font-size:0.8rem;">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">fact_check</span>
                        검사 등록
                    </button>
                    <button class="btn btn-sm btn-danger"
                        onclick="ShippingStandbyModule.removeStandby('${d.id}')"
                        style="padding:4px 8px;font-size:0.8rem;margin-left:4px;">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    // ── 이력 목록 ────────────────────────────────────────────────────
    function _getHistoryBaseData() {
        return (Storage.getAll(SI_STORE) || [])
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function _renderHistoryFilterOptions() {
        const carSel = document.getElementById('ssHistCar');
        const partSel = document.getElementById('ssHistPart');
        if (!carSel || !partSel) return;

        const currentCar = carSel.value || '';
        const currentPart = partSel.value || '';
        const data = _getHistoryBaseData();
        const cars = UIUtils.sortCarModels(data.map(d => d.carModel));
        const partsBase = currentCar ? data.filter(d => (d.carModel || '') === currentCar) : data;
        const parts = [...new Set(partsBase.map(d => d.partName).filter(Boolean))].sort();

        carSel.innerHTML = `<option value="">전체 차종</option>` +
            cars.map(car => `<option value="${car}" ${car === currentCar ? 'selected' : ''}>${car}</option>`).join('');

        partSel.innerHTML = `<option value="">전체 품명</option>` +
            parts.map(part => `<option value="${part}" ${part === currentPart ? 'selected' : ''}>${part}</option>`).join('');

        if (currentPart && !parts.includes(currentPart)) partSel.value = '';
    }

    function onHistoryCarChange() {
        _renderHistoryFilterOptions();
    }

    function loadHistory() {
        const start = document.getElementById('ssHistStart')?.value || '';
        const end   = document.getElementById('ssHistEnd')?.value   || '';
        const car   = document.getElementById('ssHistCar')?.value || '';
        const part  = document.getElementById('ssHistPart')?.value || '';
        _renderHistoryFilterOptions();
        const data  = Storage.getByDateRange(SI_STORE, start, end)
            .filter(d => !car || (d.carModel || '') === car)
            .filter(d => !part || (d.partName || '') === part)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        _historyRows = data;

        const tbody = document.getElementById('ssHistoryBody');
        const exportBtn = document.getElementById('ssExportBtn');
        if (!tbody) return;
        if (exportBtn) exportBtn.style.display = data.length ? 'inline-flex' : 'none';

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text-muted);">해당 기간의 검사 이력이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            const lots = _lotFields(d);
            return `
            <tr style="cursor:pointer;" onclick="ShippingStandbyModule._showDetail('${d.id}', event)">
                <td style="white-space:nowrap;">${_inspectionDateCell(d.date, d.startTime || d.endTime || '')}</td>
                <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td>${_lotCell(lots.paintLot)}</td>
                <td>${_lotCell(lots.injectionLot)}</td>
                <td>${_lotCell(lots.laserLot)}</td>
                <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.lotSize || 0)}</td>
                <td style="text-align:center;font-size:0.82rem;">
                    ${UIUtils.formatNumber(d.sampleQty || 0)}
                </td>
                <td style="text-align:center;font-weight:${d.defectQty > 0 ? '700' : '400'};
                    color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
                    ${d.defectQty || 0}
                </td>
                <td style="text-align:center;">${UIUtils.badge(d.result || '-', badge)}</td>
                <td style="font-size:0.85rem;">${d.inspector || '-'}</td>
                <td></td>
            </tr>`;
        }).join('');
    }

    // ── 이력 행 클릭 → 상세 팝업 ─────────────────────────────────────
    function _showDetail(id, event) {
        const d = Storage.getById(SI_STORE, id);
        if (!d) return;

        const failRate = d.lotSize > 0
            ? ((d.defectQty / d.lotSize) * 100).toFixed(1) : '0.0';

        const resultColor = d.result === '합격'
            ? 'var(--accent-green)' : d.result === '불합격'
            ? 'var(--accent-red)' : 'var(--accent-orange)';

        const popupId = 'ssDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:18px 20px; min-width:320px; max-width:440px;
            font-size:0.88rem;
        `;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        popup.innerHTML = `
            <!-- 헤더 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-blue);">verified</span>
                    <span style="font-weight:700;font-size:0.95rem;">출하검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;line-height:1;padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px;font-size:0.82rem;margin-bottom:6px;">
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">제품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:1px;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);">
                    ${d.customer || '납품처 미지정'}
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${d.paintingDate || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                    <div style="font-weight:600;font-size:0.8rem;font-family:monospace;">${d.lotNo || '-'}</div>
                </div>
            </div>

            <!-- 검사 일시 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;font-size:0.8rem;">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600;">${d.date || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">시작 시간</div>
                    <div style="font-weight:600;">${d.startTime || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 10px;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">완료 시간</div>
                    <div style="font-weight:600;">${d.endTime || '-'}</div>
                </div>
            </div>

            <!-- 수량 카드 -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;text-align:center;">
                <div style="background:rgba(59,130,246,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">LOT 수량</div>
                    <div style="font-weight:700;font-size:0.95rem;color:var(--accent-blue);margin-top:2px;">${UIUtils.formatNumber(d.lotSize || 0)}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">샘플 수</div>
                    <div style="font-weight:700;font-size:0.95rem;margin-top:2px;">${UIUtils.formatNumber(d.sampleQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08);border-radius:8px;padding:7px 4px;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">불량</div>
                    <div style="font-weight:700;font-size:0.95rem;color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};margin-top:2px;">${d.defectQty || 0}</div>
                </div>
                <div style="background:${d.result === '합격' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)'};border-radius:8px;padding:7px 4px;border:1px solid ${resultColor}20;">
                    <div style="font-size:0.62rem;color:var(--text-muted);">판정</div>
                    <div style="font-weight:800;font-size:0.95rem;color:${resultColor};margin-top:2px;">${d.result || '-'}</div>
                </div>
            </div>

            ${d.inspector ? `
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:${d.note ? '6px' : '0'};">
                검사자: <strong style="color:var(--text-primary);">${d.inspector}</strong>
            </div>` : ''}

            ${d.note ? `
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;font-size:0.78rem;color:var(--text-muted);">
                비고: <span style="color:var(--text-primary);">${d.note}</span>
            </div>` : ''}
        `;

        document.body.appendChild(popup);

        // 화면 밖 보정
        requestAnimationFrame(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const rect = popup.getBoundingClientRect();
            if (rect.right  > vw - 8) popup.style.left = (vw - rect.width  - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 외부 클릭 닫기
        setTimeout(() => {
            document.addEventListener('click', function _c(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _c);
                }
            });
        }, 50);
    }

    // ── 삭제 ─────────────────────────────────────────────────────────
    function removeStandby(id) {
        const item = Storage.getById(SB_STORE, id);
        const isPaintingSource = item && item.source === 'painting_inspection' && item.paintingWorkId;
        const confirmMsg = isPaintingSource
            ? '삭제하면 도장 검사 일지가 외관 검사 대기 상태로 복원됩니다. 삭제하시겠습니까?'
            : '대기 항목을 삭제하시겠습니까?';

        UIUtils.confirm(confirmMsg, async () => {
            if (isPaintingSource) {
                // 도장 작업 inspectionStatus 초기화 → 외관 검사 대기로 복원
                await Storage.update(DB.STORES.PAINTING_WORK, item.paintingWorkId, {
                    inspectionStatus: null,
                    inspectionDate: null,
                    inspectionStartTime: null,
                    inspectionEndTime: null,
                    inspectors: null,
                    updatedAt: new Date().toISOString()
                });
                // 해당 작업의 도장 검사 실적 삭제
                const inspections = Storage.getAll(DB.STORES.PAINTING_INSPECTIONS) || [];
                const linked = inspections.filter(i => i.workId === item.paintingWorkId);
                for (const insp of linked) {
                    await Storage.remove(DB.STORES.PAINTING_INSPECTIONS, insp.id);
                }
            }

            await Storage.remove(SB_STORE, id);
            UIUtils.toast(
                isPaintingSource
                    ? '삭제되었습니다. 도장 검사 외관 검사 대기로 복원되었습니다.'
                    : '삭제되었습니다.',
                'success'
            );
            loadData();
        });
    }

    function removeHistory(id) {
        UIUtils.confirm('검사 이력을 삭제하시겠습니까?', async () => {
            await Storage.remove(SI_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
            loadHistory();
        });
    }

    // ── 내보내기 ─────────────────────────────────────────────────────
    function exportHistory() {
        const data = _historyRows && _historyRows.length ? _historyRows : [];
        if (!data.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = ['검사일', '납품처', '차종', '제품명', '컬러', '도장LOT', '사출LOT',
            'LOT수량', '샘플수', '불량수', '판정', '검사자', '비고'];
        const rows = data.map(d => [
            d.date, d.customer||'', d.carModel||'', d.partName||'', d.color||'',
            d.paintingDate||'', d.lotNo||'',
            d.lotSize||0, d.sampleQty||0, d.defectQty||0,
            d.result||'', d.inspector||'', d.note||''
        ]);
        Storage.exportToCSV(headers, rows, '출하검사이력');
        UIUtils.toast('내보내기 완료', 'success');
    }

    const SHIP_STD_CONFIG_KEY = 'shipping_inspection_standards_v1';

    function _stdProductKey(product) {
        return product.id || `${product.carModel || ''}||${product.partName || ''}||${product.color || ''}`;
    }

    function _stdProductLabel(product) {
        return [product.carModel, product.partName, product.color].filter(Boolean).join(' / ') || '품목 미지정';
    }

    async function _loadShipStandards() {
        return (await Storage.getConfigValue(SHIP_STD_CONFIG_KEY).catch(() => ({}))) || {};
    }

    async function _saveShipStandards(data) {
        await Storage.setConfigValue(SHIP_STD_CONFIG_KEY, data || {});
    }

    function _defaultShipStandard(product = {}) {
        return {
            processNo: '100',
            processName: '출하검사',
            equipmentName: '검사대',
            docNo: 'KC-OS-021-1',
            revNo: '00',
            issueDate: UIUtils.today(),
            reviseDate: '',
            model: product.carModel || '',
            partName: product.partName || '',
            color: product.color || '',
            points: [
                { no: 1, item: '외관', standard: 'BURR, SINK MARK 및 유해한 흠이 없을 것.', method: '육안', sample: '10EA/LOT', action: '출하검사성적서' },
                { no: 2, item: '외관(PAINT)', standard: '표면에 스크래치, 흑점, 이물질이 없을 것.', method: '육안', sample: '10EA/LOT', action: '출하검사성적서' },
                { no: 3, item: 'COLOR(색차)', standard: '승인 한도 내 색차 기준을 만족할 것.', method: '색차계', sample: '2EA/LOT', action: '출하검사성적서' }
            ],
            procedure: '1. 제품의 표면상태를 검사한다.\n2. 중요치수를 측정한다.\n3. 불량은 해당 부위 마킹 후 별도의 불량 박스에 보관한다.',
            actionNote: '1. 부적합 발생시 해당 제품 격리 후 부적합 식별을 실시한다.\n2. 부적합 사항은 보고서를 작성하여 담당자 및 조반장에게 통지한다.',
            revisionNo: '00',
            revisionReason: '최초 작성'
        };
    }

    async function openShippingStandardList() {
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || [])
            .slice()
            .sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
                (a.partName || '').localeCompare(b.partName || '', 'ko') ||
                (a.color || '').localeCompare(b.color || '', 'ko'));
        const standards = await _loadShipStandards();
        const rows = products.map(product => {
            const key = _stdProductKey(product);
            const std = standards[key];
            return `
                <tr>
                    <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);">${product.carModel || '-'}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);font-weight:700;">${product.partName || '-'}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);">${product.color || '-'}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;">
                        ${std ? UIUtils.badge('등록', 'success') : UIUtils.badge('미등록', 'warning')}
                    </td>
                    <td style="padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:center;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="ShippingStandbyModule.openShippingStandardEditor('${encodeURIComponent(key)}')">${std ? '수정' : '등록'}</button>
                        ${std ? `<button class="btn btn-sm btn-primary" onclick="ShippingStandbyModule.viewShippingStandard('${encodeURIComponent(key)}')" style="margin-left:4px;">보기</button>` : ''}
                    </td>
                </tr>`;
        }).join('');
        UIUtils.showModal('출하검사 기준서', `
            <div style="margin-bottom:12px;font-size:0.84rem;color:var(--text-secondary);">
                제품 마스터에 등록된 품목별 출하검사 기준서를 등록합니다. 모든 품목이 리스트업됩니다.
            </div>
            <div style="max-height:560px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.86rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:9px 10px;text-align:left;">차종</th>
                            <th style="padding:9px 10px;text-align:left;">품명</th>
                            <th style="padding:9px 10px;text-align:left;">컬러</th>
                            <th style="padding:9px 10px;text-align:center;">상태</th>
                            <th style="padding:9px 10px;text-align:center;">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="5" style="padding:36px;text-align:center;color:var(--text-muted);">제품 마스터에 등록된 품목이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    async function openShippingStandardEditor(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const standards = await _loadShipStandards();
        const data = { ..._defaultShipStandard(product), ...(standards[key] || {}) };
        const pointsText = (data.points || []).map(p =>
            [p.no, p.item, p.standard, p.method, p.sample, p.action].map(v => String(v ?? '').replace(/\t/g, ' ')).join('\t')
        ).join('\n');
        UIUtils.showModal(`출하검사 기준서 ${standards[key] ? '수정' : '등록'} — ${_stdProductLabel(product)}`, `
            <div class="form-row">
                <div class="form-group"><label class="form-label">공정NO</label><input id="shipStdProcessNo" class="form-input" value="${data.processNo || ''}"></div>
                <div class="form-group"><label class="form-label">공정명</label><input id="shipStdProcessName" class="form-input" value="${data.processName || ''}"></div>
                <div class="form-group"><label class="form-label">설비명</label><input id="shipStdEquipmentName" class="form-input" value="${data.equipmentName || ''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">문서번호</label><input id="shipStdDocNo" class="form-input" value="${data.docNo || ''}"></div>
                <div class="form-group"><label class="form-label">Rev No</label><input id="shipStdRevNo" class="form-input" value="${data.revNo || ''}"></div>
                <div class="form-group"><label class="form-label">제정일자</label><input id="shipStdIssueDate" type="date" class="form-input" value="${data.issueDate || ''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">모델</label><input id="shipStdModel" class="form-input" value="${data.model || product.carModel || ''}"></div>
                <div class="form-group"><label class="form-label">품명</label><input id="shipStdPartName" class="form-input" value="${data.partName || product.partName || ''}"></div>
                <div class="form-group"><label class="form-label">컬러</label><input id="shipStdColor" class="form-input" value="${data.color || product.color || ''}"></div>
            </div>
            <div class="form-group">
                <label class="form-label">주요검사 Point <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">No / 항목 / 기준 / 확인방법 / 시료 / 관리방안 순서로 탭 구분</span></label>
                <textarea id="shipStdPoints" class="form-textarea" style="height:170px;font-family:Consolas,monospace;font-size:0.8rem;">${pointsText}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">검사순서</label><textarea id="shipStdProcedure" class="form-textarea" style="height:120px;">${data.procedure || ''}</textarea></div>
                <div class="form-group"><label class="form-label">조치사항</label><textarea id="shipStdActionNote" class="form-textarea" style="height:120px;">${data.actionNote || ''}</textarea></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">개정 NO</label><input id="shipStdRevisionNo" class="form-input" value="${data.revisionNo || ''}"></div>
                <div class="form-group"><label class="form-label">개정사유</label><input id="shipStdRevisionReason" class="form-input" value="${data.revisionReason || ''}"></div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="ShippingStandbyModule.openShippingStandardList()">목록</button>
            <button class="btn btn-primary" onclick="ShippingStandbyModule.saveShippingStandard('${encodeURIComponent(key)}')">저장</button>
        `, 'xl');
    }

    async function saveShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const parsePoints = String(document.getElementById('shipStdPoints')?.value || '')
            .split('\n')
            .map(line => line.split('\t').map(v => v.trim()))
            .filter(cols => cols.some(Boolean))
            .map((cols, idx) => ({
                no: cols[0] || idx + 1,
                item: cols[1] || '',
                standard: cols[2] || '',
                method: cols[3] || '',
                sample: cols[4] || '',
                action: cols[5] || ''
            }));
        const standards = await _loadShipStandards();
        standards[key] = {
            processNo: document.getElementById('shipStdProcessNo')?.value.trim() || '',
            processName: document.getElementById('shipStdProcessName')?.value.trim() || '',
            equipmentName: document.getElementById('shipStdEquipmentName')?.value.trim() || '',
            docNo: document.getElementById('shipStdDocNo')?.value.trim() || '',
            revNo: document.getElementById('shipStdRevNo')?.value.trim() || '',
            issueDate: document.getElementById('shipStdIssueDate')?.value || '',
            model: document.getElementById('shipStdModel')?.value.trim() || '',
            partName: document.getElementById('shipStdPartName')?.value.trim() || '',
            color: document.getElementById('shipStdColor')?.value.trim() || '',
            points: parsePoints,
            procedure: document.getElementById('shipStdProcedure')?.value || '',
            actionNote: document.getElementById('shipStdActionNote')?.value || '',
            revisionNo: document.getElementById('shipStdRevisionNo')?.value.trim() || '',
            revisionReason: document.getElementById('shipStdRevisionReason')?.value.trim() || '',
            updatedAt: new Date().toISOString()
        };
        await _saveShipStandards(standards);
        UIUtils.toast('출하검사 기준서가 저장되었습니다.', 'success');
        openShippingStandardList();
    }

    async function viewShippingStandard(encodedKey) {
        const key = decodeURIComponent(encodedKey);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => _stdProductKey(p) === key) || {};
        const standards = await _loadShipStandards();
        const data = standards[key] || _defaultShipStandard(product);
        const pointRows = (data.points || []).map(p => `
            <tr>
                <td>${p.no || ''}</td><td>${p.item || ''}</td><td>${p.standard || ''}</td>
                <td>${p.method || ''}</td><td>${p.sample || ''}</td><td>${p.action || ''}</td>
            </tr>
        `).join('');
        UIUtils.showModal('출하검사 기준서', `
            <div style="border:2px solid #1d4ed8;background:#fff;color:#111;font-size:13px;">
                <table style="width:100%;border-collapse:collapse;text-align:center;">
                    <tr>
                        <td style="border:1px solid #111;width:80px;font-weight:700;">공정NO</td>
                        <td style="border:1px solid #111;width:100px;">${data.processNo || ''}</td>
                        <td style="border:1px solid #111;width:100px;font-weight:700;">공정명</td>
                        <td style="border:1px solid #111;width:130px;">${data.processName || ''}</td>
                        <td rowspan="3" style="border:1px solid #111;font-size:30px;font-weight:800;letter-spacing:10px;">출하검사 기준서</td>
                        <td style="border:1px solid #111;width:90px;font-weight:700;">문서번호</td>
                        <td style="border:1px solid #111;width:130px;">${data.docNo || ''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #111;font-weight:700;">설비명</td>
                        <td colspan="3" style="border:1px solid #111;">${data.equipmentName || ''}</td>
                        <td style="border:1px solid #111;font-weight:700;">Rev No</td>
                        <td style="border:1px solid #111;">${data.revNo || ''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #111;font-weight:700;">모델</td>
                        <td colspan="3" style="border:1px solid #111;">${data.model || ''}</td>
                        <td style="border:1px solid #111;font-weight:700;">제정일자</td>
                        <td style="border:1px solid #111;">${data.issueDate || ''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #111;font-weight:700;">품명</td>
                        <td colspan="6" style="border:1px solid #111;font-weight:700;">${data.partName || ''}${data.color ? ' / ' + data.color : ''}</td>
                    </tr>
                </table>
                <div style="display:grid;grid-template-columns:42% 58%;min-height:520px;border-top:1px solid #111;">
                    <div style="border-right:1px solid #111;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:72px;font-weight:800;">제품사진</div>
                    <div>
                        <div style="background:#93c5fd;border-bottom:1px solid #111;padding:9px;text-align:center;font-weight:800;">주요검사 Point</div>
                        <table style="width:100%;border-collapse:collapse;text-align:center;font-size:12px;">
                            <thead><tr><th>No</th><th>항목</th><th>기준</th><th>확인방법</th><th>시료</th><th>관리방안</th></tr></thead>
                            <tbody>${pointRows}</tbody>
                        </table>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #111;">
                    <div><div style="background:#93c5fd;text-align:center;font-weight:800;padding:8px;border-bottom:1px solid #111;">검사순서</div><pre style="white-space:pre-wrap;margin:0;padding:10px;font-family:inherit;">${data.procedure || ''}</pre></div>
                    <div style="border-left:1px solid #111;"><div style="background:#93c5fd;text-align:center;font-weight:800;padding:8px;border-bottom:1px solid #111;">조치사항</div><pre style="white-space:pre-wrap;margin:0;padding:10px;font-family:inherit;">${data.actionNote || ''}</pre></div>
                </div>
            </div>
        `, `
            <button class="btn btn-outline" onclick="ShippingStandbyModule.openShippingStandardEditor('${encodeURIComponent(key)}')">수정</button>
            <button class="btn btn-secondary" onclick="ShippingStandbyModule.openShippingStandardList()">목록</button>
        `, 'xl');
    }

    return {
        render, loadData, loadHistory,
        onHistoryCarChange,
        _showDetail,
        removeStandby, removeHistory, exportHistory,
        openShippingStandardList, openShippingStandardEditor,
        saveShippingStandard, viewShippingStandard,
        // 하위호환 (구 코드 참조용)
        remove: removeStandby
    };
})();



// ===================================================================
// 출하검사 일지
// ===================================================================
const ShippingInspectionModule = (function() {
    const STORE    = DB.STORES.SHIPPING_INSPECTIONS;
    const SB_STORE = DB.STORES.SHIPPING_STANDBY;

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _inspectionDateCell(dateValue, timeValue) {
        const rawDate = String(dateValue || '').trim();
        const rawTime = String(timeValue || '').trim();
        if (!rawDate && !rawTime) return '<span style="color:var(--text-muted);">-</span>';
        const dateMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
        const timeMatch = (rawDate.match(/[ T](\d{2}:\d{2})/) || rawTime.match(/(\d{2}:\d{2})/));
        if (!dateMatch) return _esc([rawDate, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' '));
        return `
            <div style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.08;min-width:56px;">
                <span style="font-size:0.68rem;color:var(--text-muted);font-weight:600;">${dateMatch[1]}</span>
                <strong style="font-size:0.92rem;color:var(--text-primary);">${dateMatch[2]}-${dateMatch[3]}</strong>
                ${timeMatch ? `<span style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">${timeMatch[1]}</span>` : ''}
            </div>`;
    }

    function _uniqText(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))].join(', ');
    }

    function _lotFields(row) {
        return {
            paintLot: _uniqText(row.paintLot || row.paintingDate || ''),
            injectionLot: _uniqText(row.injectionLot || row.lotNo || ''),
            laserLot: _uniqText(row.laserLot || row.laserWorkDate || '')
        };
    }

    function _lotCell(value) {
        const text = _uniqText(value);
        return text ? `<span style="font-family:monospace;font-size:0.78rem;">${_esc(text)}</span>` : '<span style="color:var(--text-muted);">-</span>';
    }

    // ── 모달 헬퍼 ─────────────────────────────────────────────────────
    function _openModal(title, content) {
        const existing = document.getElementById('siModal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'siModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div style="background:var(--bg-primary);border-radius:12px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg-primary);z-index:1;">
                    <h3 style="margin:0;font-size:1.1rem;">${title}</h3>
                    <button onclick="ShippingInspectionModule._closeModal()"
                        style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.4rem;line-height:1;">✕</button>
                </div>
                <div style="padding:20px 24px;" id="siModalBody">${content}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function _closeModal() {
        const el = document.getElementById('siModal');
        if (el) el.remove();
    }

    // ── 검사 등록 폼 빌드 ─────────────────────────────────────────────
    function _buildForm(sb) {
        const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];
        const inspectorOptions = inspectors.map(i =>
            `<option value="${i.name || ''}">${i.name || ''}</option>`).join('');

        return `
        <div style="display:grid;gap:14px;">

            <!-- 제품 정보 (읽기전용) -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 10px 0;color:var(--text-primary);">제품 정보</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px 14px;background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">납품처</div>
                        <div style="font-weight:700;font-size:0.9rem;color:var(--accent-blue);">${sb.customer || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">차종</div>
                        <div style="font-weight:600;font-size:0.9rem;">${sb.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">제품명</div>
                        <div style="font-weight:600;font-size:0.9rem;">${sb.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">컬러</div>
                        <div style="font-size:0.9rem;">${sb.color || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">도장 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${sb.paintLot || sb.paintingDate || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${sb.injectionLot || sb.lotNo || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">레이져 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${sb.laserLot || sb.laserWorkDate || '-'}</div>
                    </div>
                </div>
                <input type="hidden" id="siStandbyId"  value="${sb.id    || ''}">
                <input type="hidden" id="siCarModel"   value="${sb.carModel   || ''}">
                <input type="hidden" id="siPartName"   value="${sb.partName   || ''}">
                <input type="hidden" id="siColor"      value="${sb.color      || ''}">
                <input type="hidden" id="siPaintingDate" value="${sb.paintingDate || ''}">
                <input type="hidden" id="siLotNoHidden"  value="${sb.lotNo    || ''}">
                <input type="hidden" id="siPaintLotHidden" value="${sb.paintLot || sb.paintingDate || ''}">
                <input type="hidden" id="siInjectionLotHidden" value="${sb.injectionLot || sb.lotNo || ''}">
                <input type="hidden" id="siLaserLotHidden" value="${sb.laserLot || sb.laserWorkDate || ''}">
                <input type="hidden" id="siSourceHidden" value="${sb.source || ''}">
                <input type="hidden" id="siCustomer"   value="${sb.customer   || ''}">
            </div></div>

            <!-- 검사 정보 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">검사 정보</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사일자 <span style="color:var(--accent-red);">*</span></label>
                        <input type="date" class="form-input" id="siDate" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">시작 시간</label>
                        <input type="time" class="form-input" id="siStartTime">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">완료 시간</label>
                        <input type="time" class="form-input" id="siEndTime">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사자</label>
                        <select class="form-select" id="siInspector">
                            <option value="">-- 검사자 선택 --</option>
                            ${inspectorOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">검사 수량 <span style="color:var(--accent-red);">*</span></label>
                        <input type="number" class="form-input" id="siLotSize" value="${sb.goodQty || sb.inspectionQty || 0}"
                            min="1">
                    </div>
                </div>
            </div></div>

            <!-- 샘플 검사 결과 -->
            <div class="card"><div class="card-body">
                <h4 style="margin:0 0 12px 0;color:var(--text-primary);">샘플 검사 결과</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">샘플 검사 수량</label>
                        <input type="number" class="form-input" id="siSampleQty"
                            value="0" min="0">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">불량 발견 수량</label>
                        <input type="number" class="form-input" id="siDefectQty" value="0" min="0">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">판정</label>
                        <select class="form-select" id="siResult" style="font-weight:700;color:var(--accent-green);">
                            <option value="합격"  style="color:var(--accent-green);">합격</option>
                            <option value="불합격" style="color:var(--accent-red);">불합격</option>
                            <option value="보류">보류</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="siNote" placeholder="특이사항 입력" style="height:60px;"></textarea>
                </div>
            </div></div>

            <!-- 성적서 발행 -->
            <div class="card"><div class="card-body" style="padding:12px 16px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
                    <input type="checkbox" id="siCertIssued" style="width:18px;height:18px;accent-color:var(--accent-blue);cursor:pointer;">
                    <span style="font-size:0.92rem;font-weight:600;color:var(--text-primary);">성적서 발행</span>
                    <span style="font-size:0.78rem;color:var(--text-muted);">체크 시 성적서 발행 완료로 기록됩니다.</span>
                </label>
            </div></div>

            <!-- 버튼 -->
            <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:4px;">
                <button class="btn btn-secondary" onclick="ShippingInspectionModule._closeModal()">취소</button>
                <button class="btn btn-primary" onclick="ShippingInspectionModule._save()">
                    <span class="material-symbols-outlined">save</span> 검사 등록
                </button>
            </div>
        </div>`;
    }

    // ── 대기 항목에서 검사 등록 열기 ─────────────────────────────────
    function openFromStandby(standbyId) {
        const sb = Storage.getById(SB_STORE, standbyId);
        if (!sb) { UIUtils.toast('대기 항목을 찾을 수 없습니다.', 'error'); return; }
        _openModal(`출하검사 등록 — ${sb.partName || ''}`, _buildForm(sb));
    }

    // ── 저장 ─────────────────────────────────────────────────────────
    async function _save() {
        const lotSize   = parseInt(document.getElementById('siLotSize')?.value  || 0);
        const sampleQty = parseInt(document.getElementById('siSampleQty')?.value || 0);
        const defectQty = parseInt(document.getElementById('siDefectQty')?.value || 0);
        const result    = document.getElementById('siResult')?.value || '합격';
        const date      = document.getElementById('siDate')?.value || UIUtils.today();
        const standbyId = document.getElementById('siStandbyId')?.value || '';
        const partName  = document.getElementById('siPartName')?.value || '';

        if (!lotSize) { UIUtils.toast('검사 수량을 입력하세요.', 'warning'); return; }
        if (!partName) { UIUtils.toast('품목 정보가 없습니다.', 'error'); return; }

        const record = {
            date,
            startTime        : document.getElementById('siStartTime')?.value || '',
            endTime          : document.getElementById('siEndTime')?.value   || '',
            inspector        : document.getElementById('siInspector')?.value || '',
            customer         : document.getElementById('siCustomer')?.value  || '',
            carModel         : document.getElementById('siCarModel')?.value  || '',
            partName,
            color            : document.getElementById('siColor')?.value     || '',
            paintingDate     : document.getElementById('siPaintingDate')?.value || '',
            lotNo            : document.getElementById('siLotNoHidden')?.value  || '',
            paintLot         : document.getElementById('siPaintLotHidden')?.value || document.getElementById('siPaintingDate')?.value || '',
            injectionLot     : document.getElementById('siInjectionLotHidden')?.value || document.getElementById('siLotNoHidden')?.value || '',
            laserLot         : document.getElementById('siLaserLotHidden')?.value || '',
            source           : document.getElementById('siSourceHidden')?.value || '',
            lotSize,
            sampleQty,
            defectQty,
            result,
            standbyId,
            note             : document.getElementById('siNote')?.value?.trim() || '',
            certIssued       : document.getElementById('siCertIssued')?.checked || false
        };

        await Storage.add(STORE, record);

        // 대기 상태 → 완료
        if (standbyId) {
            await Storage.update(SB_STORE, standbyId, { status: '완료', inspectionDate: date });
        }

        // 합격 시 제품 창고 입고
        if (result === '합격' && lotSize > 0) {
            await Storage.add(DB.STORES.PRODUCT_INVENTORY, {
                date,
                carModel : record.carModel,
                partName,
                color    : record.color,
                paintingDate: record.paintingDate,
                lotNo    : record.lotNo,
                quantity : lotSize,
                type     : '입고',
                source   : '출하검사 합격'
            });
        }

        _closeModal();
        UIUtils.toast(`출하검사 등록 완료 — ${result}`, result === '합격' ? 'success' : 'error');

        // 통합 페이지 갱신
        if (document.getElementById('ssWaitingBody')) {
            ShippingStandbyModule.loadData();
            ShippingStandbyModule.loadHistory();
        }
    }

    // ── 화면 렌더 (shipping-standby 통합 페이지로 리다이렉트) ──────────
    function render(container) {
        Router.navigate('shipping-standby');
    }

    // ── 구버전 호환용 더미 render (사용 안 함) ─────────────────────────
    function _renderLegacy(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                    <label style="font-size:0.82rem;font-weight:600;white-space:nowrap;">기간</label>
                    <input type="date" class="form-input" id="siStart" value="${UIUtils.monthAgo()}" style="width:130px;">
                    <span style="color:var(--text-muted);">~</span>
                    <input type="date" class="form-input" id="siEnd" value="${UIUtils.today()}" style="width:130px;">
                    <button class="btn btn-primary" onclick="ShippingInspectionModule.search()" style="margin-left:auto;">
                        <span class="material-symbols-outlined">search</span> 조회
                    </button>
                </div>

                <div class="stat-cards" id="siStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>검사일</th>
                                        <th>납품처</th>
                                        <th>차종</th>
                                        <th>제품명</th>
                                        <th>컬러</th>
                                        <th>도장LOT</th>
                                        <th>사출LOT</th>
                                        <th>레이져 LOT</th>
                                        <th style="text-align:right">LOT 수량</th>
                                        <th style="text-align:center">샘플</th>
                                        <th style="text-align:center">불량</th>
                                        <th style="text-align:center">판정</th>
                                        <th>검사자</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="siTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('siStart')?.value || '';
        const end   = document.getElementById('siEnd')?.value   || '';
        const data  = Storage.getByDateRange(STORE, start, end)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const pass  = data.filter(d => d.result === '합격').length;
        const fail  = data.filter(d => d.result === '불합격').length;
        const hold  = data.filter(d => d.result === '보류').length;

        document.getElementById('siStats').innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">검사 건수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${pass}</div>
                <div class="stat-card-label">합격</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${fail}</div>
                <div class="stat-card-label">불합격</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${hold}</div>
                <div class="stat-card-label">보류</div>
            </div>
        `;

        const tbody = document.getElementById('siTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted);">검사 실적이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            const lots = _lotFields(d);
            return `
                <tr>
                    <td style="white-space:nowrap;">${_inspectionDateCell(d.date, d.startTime || d.endTime || '')}</td>
                    <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td>${d.color || '-'}</td>
                    <td>${_lotCell(lots.paintLot)}</td>
                    <td>${_lotCell(lots.injectionLot)}</td>
                    <td>${_lotCell(lots.laserLot)}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.lotSize || d.quantity || 0)}</td>
                    <td style="text-align:center;font-size:0.85rem;">${UIUtils.formatNumber(d.sampleQty || 0)}</td>
                    <td style="text-align:center;color:${d.defectQty > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};font-weight:${d.defectQty > 0 ? '700' : '400'};">${d.defectQty || 0}</td>
                    <td style="text-align:center;">${UIUtils.badge(d.result || '-', badge)}</td>
                    <td style="font-size:0.85rem;">${d.inspector || '-'}</td>
                    <td></td>
                </tr>
            `;
        }).join('');
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
        if (!data.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = ['검사일', '납품처', '차종', '제품명', '컬러', '도장LOT', '사출LOT', 'LOT수량', '샘플수', '불량수', '판정', '검사자', '비고'];
        const rows = data.map(d => [
            d.date, d.customer||'', d.carModel||'', d.partName||'', d.color||'',
            d.paintingDate||'', d.lotNo||'',
            d.lotSize||0, d.sampleQty||0, d.defectQty||0,
            d.result||'', d.inspector||'', d.note||''
        ]);
        Storage.exportToCSV(headers, rows, '출하검사일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        search,
        openFromStandby,
        _closeModal,
        _save,
        remove,
        exportData
    };
})();


// ===================================================================
// 제품 창고 (재고관리)
// ===================================================================
const ProductWarehouseModule = (function() {
    const STORE = DB.STORES.PRODUCT_INVENTORY;

    function render(container) {
        const adminCard = _isAdminUser()
            ? ProdAppleMenu.card({ label: '일괄 등록/수정', subtitle: '관리자 재고 보정', icon: 'admin_panel_settings', accent: '#ef4444', onClick: 'ProductWarehouseModule.openBulkModal()' })
            : '';

        container.innerHTML = `
            <div class="fade-in-up">
                <div id="pwNavStrip" class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">
                    ${[
                        { tab:'stock',    icon:'inventory_2',  title:'재고 현황', sub:'현재 보유 제품 재고', active:true  },
                        { tab:'incoming', icon:'move_to_inbox',title:'입고 이력', sub:'제품 입고 기록',     active:false },
                        { tab:'outgoing', icon:'outbox',       title:'출고 이력', sub:'제품 출고 기록',     active:false }
                    ].map(m => `
                        <button type="button" class="pw-tab-btn${m.active?' pw-tab-active':''}" data-tab="${m.tab}"
                            onclick="ProductWarehouseModule._switchTab('${m.tab}')"
                            style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                                   border:${m.active?'2px solid var(--accent-blue)':'1.5px solid var(--border-color)'};
                                   background:var(--bg-primary);color:var(--text-primary);
                                   cursor:pointer;min-width:160px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                            <span style="display:inline-flex;align-items:center;justify-content:center;
                                         width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                         background:${m.active?'var(--accent-blue)':'var(--bg-secondary)'};">
                                <span class="material-symbols-outlined" style="font-size:24px;color:${m.active?'#fff':'var(--text-muted)'};">${m.icon}</span>
                            </span>
                            <span style="display:flex;flex-direction:column;gap:2px;">
                                <span style="font-size:0.92rem;font-weight:700;">${m.title}</span>
                                <span style="font-size:0.73rem;color:var(--text-muted);">${m.sub}</span>
                            </span>
                        </button>`).join('')}
                    ${adminCard}
                </div>

            <div id="pwTabStock">
                <div class="stat-cards" id="pwStats"></div>
                <div id="pwBlocks"></div>
            </div>
            <div id="pwTabIncoming" style="display:none;"></div>
            <div id="pwTabOutgoing" style="display:none;"></div>
        </div>
        `;
        loadData();
    }

    function _switchTab(tab) {
        ['stock', 'incoming', 'outgoing'].forEach(t => {
            const panelEl = document.getElementById(`pwTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if (panelEl) panelEl.style.display = t === tab ? '' : 'none';
        });
        document.querySelectorAll('.pw-tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tab;
            btn.style.border = isActive ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)';
            const iconBox = btn.querySelector('span[style*="border-radius:10px"]');
            const icon    = btn.querySelector('.material-symbols-outlined');
            if (iconBox) iconBox.style.background = isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)';
            if (icon)    icon.style.color          = isActive ? '#fff' : 'var(--text-muted)';
        });
        if (tab === 'incoming') _loadIncoming();
        if (tab === 'outgoing') _loadOutgoing();
    }

    function _switchTabOutside(tab) {
        const container = document.getElementById('contentArea');
        if (!container) return;
        ProductWarehouseModule.render(container);
        setTimeout(function () { _switchTab(tab); }, 50);
    }

    function _loadIncoming() {
        const el = document.getElementById('pwTabIncoming');
        if (!el) return;
        const data = (Storage.getAll(STORE) || [])
            .filter(d => d.type !== '출고')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const rows = data.length ? data.map(d => `
            <tr>
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td style="text-align:right;font-weight:700;color:var(--accent-green);">+${UIUtils.formatNumber(d.quantity || 0)}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.lotNo || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.paintingDate || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-secondary);">${d.source || '-'}</td>
            </tr>`).join('')
            : `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">입고 이력이 없습니다.</td></tr>`;

        el.innerHTML = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>날짜</th><th>차종</th><th>품명</th><th>컬러</th>
                                <th style="text-align:right;">수량</th>
                                <th>사출 LOT</th><th>도장 LOT</th><th>출처</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function _loadOutgoing() {
        const el = document.getElementById('pwTabOutgoing');
        if (!el) return;
        const data = (Storage.getAll(DB.STORES.PRODUCT_OUTGOING) || [])
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const rows = data.length ? data.map(d => `
            <tr>
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td style="text-align:right;font-weight:700;color:var(--accent-red);">-${UIUtils.formatNumber(d.quantity || 0)}</td>
                <td>${d.customer || '-'}</td>
                <td>${d.deliveryTo || '-'}</td>
                <td style="font-size:0.82rem;">${d.vehicleNo || '-'}</td>
                <td style="font-size:0.82rem;color:var(--text-secondary);">${d.note || '-'}</td>
            </tr>`).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">출고 이력이 없습니다.</td></tr>`;

        el.innerHTML = `
            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>출고일</th><th>품명</th>
                                <th style="text-align:right;">수량</th>
                                <th>거래처</th><th>납품처</th><th>차량번호</th><th>비고</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function loadData() {
        const data = Storage.getAll(STORE);
        data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 차종+품명+컬러 기준 재고 집계
        const itemMap = {};  // key: carModel||partName||color
        data.forEach(d => {
            const car   = d.carModel || '';
            const part  = d.partName || '미분류';
            const color = d.color    || '';
            const key   = `${car}||${part}||${color}`;
            if (!itemMap[key]) {
                itemMap[key] = { car, part, color, inQty: 0, outQty: 0, lastDate: '' };
            }
            const qty = Number(d.quantity) || 0;
            if (d.type === '출고') itemMap[key].outQty += qty;
            else                   itemMap[key].inQty  += qty;
            if (d.date > itemMap[key].lastDate) itemMap[key].lastDate = d.date;
        });

        const items   = Object.values(itemMap);
        const totalIn  = items.reduce((s, i) => s + i.inQty,  0);
        const totalOut = items.reduce((s, i) => s + i.outQty, 0);
        const totalStock = totalIn - totalOut;
        const zeroCount  = items.filter(i => (i.inQty - i.outQty) <= 0).length;

        // 통계 카드
        const statsEl = document.getElementById('pwStats');
        if (statsEl) statsEl.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${items.length}</div>
                <div class="stat-card-label">품목 수</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${UIUtils.formatNumber(totalStock)}</div>
                <div class="stat-card-label">총 재고 (EA)</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-card-value">${UIUtils.formatNumber(totalIn)}</div>
                <div class="stat-card-label">총 입고</div>
            </div>
            <div class="stat-card red">
                <div class="stat-card-value">${zeroCount}</div>
                <div class="stat-card-label">재고 없음</div>
            </div>
        `;

        const blocksEl = document.getElementById('pwBlocks');
        if (!blocksEl) return;

        if (!items.length) {
            blocksEl.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">inventory_2</span>
                재고 데이터가 없습니다.</div>`;
            return;
        }

        // 차종별 그룹핑
        const byCarModel = {};
        items.forEach(i => {
            const car = i.car || '차종 미지정';
            if (!byCarModel[car]) byCarModel[car] = [];
            byCarModel[car].push(i);
        });

        const isAsItem = i => {
            const text = `${i.car || ''} ${i.part || ''} ${i.color || ''}`;
            return /(^|[^A-Z0-9])A\/?S([^A-Z0-9]|$)/i.test(text) || /애프터|서비스/.test(text);
        };

        // 양산 / A/S 차종 분리
        const sortBySize = cars => cars.sort((a, b) =>
            (byCarModel[b].length - byCarModel[a].length) || a.localeCompare(b, 'ko'));
        const massanCars = sortBySize(Object.keys(byCarModel).filter(car => !byCarModel[car].every(isAsItem)));
        const asCars     = sortBySize(Object.keys(byCarModel).filter(car =>  byCarModel[car].every(isAsItem)));

        function renderCarBlock(car, isAs) {
            const headerColor = isAs ? '#475569' : '#2563eb';
            const group = byCarModel[car].sort((a, b) => {
                const aAs = isAsItem(a) ? 1 : 0;
                const bAs = isAsItem(b) ? 1 : 0;
                return aAs - bAs ||
                    (a.part || '').localeCompare(b.part, 'ko') ||
                    (a.color || '').localeCompare(b.color, 'ko');
            });
            const groupTotal = group.reduce((s, i) => s + (i.inQty - i.outQty), 0);

            const rows = group.map(i => {
                const stock = i.inQty - i.outQty;
                const stockColor = stock <= 0
                    ? 'var(--accent-red)'
                    : stock < 50
                    ? 'var(--accent-orange)'
                    : 'var(--accent-green)';
                const keyEnc = encodeURIComponent(`${i.car}||${i.part}||${i.color}`);
                const asTag = isAsItem(i)
                    ? '<span style="font-size:0.58rem;background:#e2e8f0;color:#64748b;border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:middle;">A/S</span>'
                    : '';
                return `
                <tr onclick="ProductWarehouseModule._showHistory('${keyEnc}', event)"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;border-bottom:1px solid var(--border-color);line-height:1.28;white-space:normal;word-break:break-word;min-width:150px;max-width:220px;">
                        <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_escapeHtml(i.part)}">${i.part}</span>${asTag}
                    </td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">${i.color || ''}</td>
                    <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                        <span style="font-size:0.9rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                        <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                    </td>
                    <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;">${i.lastDate || ''}</td>
                </tr>`;
            }).join('');

            return `<div style="break-inside:avoid;margin-bottom:10px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="background:${headerColor};color:#fff;padding:7px 10px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                        ${car}
                        <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${group.length}종</span>
                    </span>
                    <div style="font-size:0.75rem;">재고 <strong>${UIUtils.formatNumber(groupTotal)}</strong> EA</div>
                </div>
                <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                    <thead><tr style="background:var(--bg-secondary);">
                        <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                        <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                        <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                        <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근일자</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        function sectionDivider(text, count, color) {
            return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
                <span class="material-symbols-outlined" style="font-size:15px;color:${color};">directions_car</span>
                <span style="font-size:0.76rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:0.5px;">${text}</span>
                <span style="font-size:0.7rem;color:var(--text-muted);font-weight:600;">${count}개 차종</span>
                <div style="flex:1;height:1px;background:#e2e8f0;"></div>
            </div>`;
        }

        let html = '';

        if (massanCars.length) {
            html += sectionDivider('양산품', massanCars.length, '#2563eb');
            html += '<div style="columns:280px;column-gap:10px;">';
            html += massanCars.map(car => renderCarBlock(car, false)).join('');
            html += '</div>';
        }

        if (asCars.length) {
            html += `<div style="margin-top:${massanCars.length ? '20px' : '0'};">`;
            html += sectionDivider('A/S 품목', asCars.length, '#64748b');
            html += '<div style="columns:280px;column-gap:10px;">';
            html += asCars.map(car => renderCarBlock(car, true)).join('');
            html += '</div></div>';
        }

        blocksEl.innerHTML = html;
    }

    // ── 이력 팝업 ─────────────────────────────────────────────────────
    function _showHistory(keyEnc, event) {
        const key   = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');

        const allData      = Storage.getAll(STORE);
        const shippingInsp = Storage.getAll(DB.STORES.SHIPPING_INSPECTIONS) || [];
        const paintInv     = Storage.getAll(DB.STORES.PAINT_INVENTORY)      || [];
        const paintMats    = Storage.getAll(DB.STORES.PAINT_MATERIALS)      || [];

        const records = allData
            .filter(d => {
                const dCar   = d.carModel || '';
                const dPart  = d.partName || '미분류';
                const dColor = d.color    || '';
                return dCar === car && dPart === part && dColor === color;
            })
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const inQty  = records.filter(r => r.type !== '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const outQty = records.filter(r => r.type === '출고').reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const stock  = inQty - outQty;
        const stockColor = stock <= 0 ? 'var(--accent-red)' : 'var(--accent-green)';

        // ── LOT 조회 헬퍼 ──────────────────────────────────────────────
        // 검사 LOT: SHIPPING_INSPECTIONS에서 동일 차종/품명/컬러/사출LOT/도장일 매칭
        function _getInspLot(r) {
            const found = shippingInsp.find(s =>
                (s.carModel || '') === car &&
                (s.partName || '') === part &&
                (s.color    || '') === (color || '') &&
                (s.lotNo    || '') === (r.lotNo || '') &&
                (s.paintingDate || '') === (r.paintingDate || '')
            );
            return found ? found.date : '-';
        }

        // 도료 LOT: 도장일에 출고된 도료 LOT 목록 (주제 우선)
        function _getPaintLots(paintingDate) {
            if (!paintingDate) return '-';
            const used = paintInv.filter(p => p.date === paintingDate && p.type === '출고' && p.materialId);
            if (!used.length) return '-';
            // 중복 제거 (materialId+lot 기준)
            const seen = new Set();
            const lines = [];
            used.forEach(p => {
                const mat  = paintMats.find(m => m.id === p.materialId);
                const lot  = p.prodLot || p.lotNo || '';
                const key  = (p.materialId || '') + '||' + lot;
                if (seen.has(key) || !lot) return;
                seen.add(key);
                const name = mat ? (mat.name || mat.paintName || '') : '';
                lines.push(name ? `<span style="color:var(--text-muted)">${name}</span> ${lot}` : lot);
            });
            return lines.length ? lines.join('<br>') : '-';
        }

        // LOT 셀 공통 스타일
        const lotCell = (content, mono) =>
            `<td style="padding:5px 8px;font-size:0.75rem;vertical-align:top;border-bottom:1px solid var(--border-color);${mono ? 'font-family:monospace;' : ''}">${content}</td>`;

        // ── 행 렌더 ────────────────────────────────────────────────────
        const popupId = 'pwHistoryPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            width:900px; max-width:96vw; max-height:82vh;
            overflow:auto; font-size:0.88rem;
        `;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        const TH = txt => `<th style="padding:6px 8px;text-align:left;font-size:0.7rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap;">${txt}</th>`;

        const rowsHtml = records.length
            ? records.map(r => {
                const isOut = r.type === '출고';
                const injLot   = r.lotNo        || '-';
                const paintLot = r.paintingDate  || '-';
                const inspLot  = isOut ? '-' : _getInspLot(r);
                const matLot   = isOut ? '-' : _getPaintLots(r.paintingDate);
                return `
                <tr onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="white-space:nowrap;padding:5px 8px;border-bottom:1px solid var(--border-color);font-size:0.8rem;">${r.date || '-'}</td>
                    <td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border-color);">
                        <span style="font-size:0.72rem;font-weight:600;
                            color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};
                            border:1px solid ${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};
                            border-radius:4px;padding:1px 5px;">${r.type || '입고'}</span>
                    </td>
                    <td style="text-align:right;font-weight:700;padding:5px 8px;border-bottom:1px solid var(--border-color);
                        color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${isOut ? '-' : '+'}${UIUtils.formatNumber(r.quantity || 0)}
                    </td>
                    ${lotCell(injLot, true)}
                    ${lotCell(paintLot, true)}
                    ${lotCell(matLot, false)}
                    ${lotCell(inspLot, true)}
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">${r.source || '-'}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">이력 없음</td></tr>`;

        popup.innerHTML = `
            <div style="padding:14px 18px;border-bottom:1px solid var(--border);
                        display:flex;align-items:center;justify-content:space-between;
                        position:sticky;top:0;background:var(--bg-primary);z-index:1;">
                <div>
                    <div style="font-weight:700;font-size:1rem;">${part}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">
                        ${car || '차종 미지정'}${color ? ' · ' + color : ''}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="text-align:right;">
                        <div style="font-size:0.68rem;color:var(--text-muted);">현재 재고</div>
                        <div style="font-size:1.4rem;font-weight:800;color:${stockColor};line-height:1.1;">
                            ${UIUtils.formatNumber(stock)} <span style="font-size:0.7rem;font-weight:400;">EA</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('${popupId}').remove()"
                        style="background:none;border:none;cursor:pointer;color:var(--text-muted);
                               font-size:1.3rem;line-height:1;padding:2px 4px;">✕</button>
                </div>
            </div>

            <!-- 요약 바 -->
            <div style="display:flex;gap:0;border-bottom:1px solid var(--border);">
                <div style="flex:1;padding:8px 12px;text-align:center;border-right:1px solid var(--border);">
                    <div style="font-size:0.65rem;color:var(--text-muted);">총 입고</div>
                    <div style="font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(inQty)}</div>
                </div>
                <div style="flex:1;padding:8px 12px;text-align:center;border-right:1px solid var(--border);">
                    <div style="font-size:0.65rem;color:var(--text-muted);">총 출고</div>
                    <div style="font-weight:700;color:var(--accent-red);">${UIUtils.formatNumber(outQty)}</div>
                </div>
                <div style="flex:1;padding:8px 12px;text-align:center;">
                    <div style="font-size:0.65rem;color:var(--text-muted);">이력 건수</div>
                    <div style="font-weight:700;">${records.length}</div>
                </div>
            </div>

            <!-- LOT 범례 -->
            <div style="padding:8px 14px;background:#f8fafc;border-bottom:1px solid var(--border);
                        display:flex;gap:16px;font-size:0.72rem;color:var(--text-muted);flex-wrap:wrap;">
                <span><strong style="color:#1d4ed8;">사출 LOT</strong> 사출 수입검사 LOT 번호</span>
                <span><strong style="color:#059669;">도장 LOT</strong> 도장 작업 날짜</span>
                <span><strong style="color:#d97706;">도료 LOT</strong> 해당 도장일 도료 출고 LOT</span>
                <span><strong style="color:#7c3aed;">검사 LOT</strong> 출하검사 날짜</span>
            </div>

            <!-- 이력 테이블 -->
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        ${TH('날짜')}${TH('유형')}${TH('수량')}
                        <th style="padding:6px 8px;font-size:0.7rem;font-weight:700;color:#1d4ed8;border-bottom:1px solid var(--border);white-space:nowrap;">사출 LOT</th>
                        <th style="padding:6px 8px;font-size:0.7rem;font-weight:700;color:#059669;border-bottom:1px solid var(--border);white-space:nowrap;">도장 LOT</th>
                        <th style="padding:6px 8px;font-size:0.7rem;font-weight:700;color:#d97706;border-bottom:1px solid var(--border);white-space:nowrap;">도료 LOT</th>
                        <th style="padding:6px 8px;font-size:0.7rem;font-weight:700;color:#7c3aed;border-bottom:1px solid var(--border);white-space:nowrap;">검사 LOT</th>
                        ${TH('출처/행선지')}
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;

        document.body.appendChild(popup);

        // 화면 밖 보정
        requestAnimationFrame(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const rect = popup.getBoundingClientRect();
            if (rect.right  > vw - 8) popup.style.left = (vw - rect.width  - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 외부 클릭 닫기
        setTimeout(() => {
            document.addEventListener('click', function _c(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _c);
                }
            });
        }, 50);
    }

    function _escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function _normalizeText(value) {
        return String(value ?? '').replace(/\u00a0/g, ' ').trim();
    }

    function _parseQty(value) {
        const text = _normalizeText(value);
        if (!text || text === '-' || text === '－') return 0;
        const cleaned = text.replace(/,/g, '').replace(/[^\d.-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function _isQtyLike(value) {
        const text = _normalizeText(value);
        if (text === '-' || text === '－') return true;
        return /^-?[\d,]+(\.\d+)?$/.test(text);
    }

    function _isAdminUser() {
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return false;
        const user = AuthModule.getCurrentUser();
        return !!(user && user.role === 'admin');
    }

    function _requireProductAdmin(onPass, message) {
        if (_isAdminUser()) {
            onPass();
            return;
        }
        if (typeof AuthModule !== 'undefined' && AuthModule.checkSettingsAuth) {
            AuthModule.checkSettingsAuth(function() {
                if (_isAdminUser()) onPass();
                else UIUtils.toast(message || '제품 창고 재고 등록과 수정은 관리자만 가능합니다.', 'warning');
            });
            return;
        }
        UIUtils.toast(message || '제품 창고 재고 등록과 수정은 관리자만 가능합니다.', 'warning');
    }

    function _requireBulkAdmin(onPass) {
        _requireProductAdmin(onPass, '제품 창고 일괄 등록 및 수정은 관리자만 가능합니다.');
    }

    function _getCurrentStockMap() {
        const map = {};
        (Storage.getAll(STORE) || []).forEach(d => {
            const key = `${d.carModel || ''}||${d.partName || '미분류'}||${d.color || ''}`;
            if (!map[key]) map[key] = 0;
            const qty = Number(d.quantity) || 0;
            map[key] += d.type === '출고' ? -qty : qty;
        });
        return map;
    }

    function _parseBulkRows(text) {
        const rows = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.split('\t').map(_normalizeText))
            .filter(row => row.some(Boolean));

        return rows
            .filter(row => row.length >= 3)
            .filter(row => _isQtyLike(row.length >= 4 ? row[3] : row[2]))
            .map(row => ({
                carModel: row[0] || '',
                partName: row[1] || '',
                color: row.length >= 4 ? row[2] || '' : '',
                quantity: row.length >= 4 ? _parseQty(row[3]) : _parseQty(row[2])
            }))
            .filter(r => r.carModel && r.partName);
    }

    function _bulkKey(row) {
        return [
            _normalizeText(row.carModel).toUpperCase(),
            _normalizeText(row.partName).toUpperCase(),
            _normalizeText(row.color).toUpperCase()
        ].join('||');
    }

    function _bulkDuplicateCounts(records) {
        const counts = {};
        (records || []).forEach(row => {
            const key = _bulkKey(row);
            if (!key.replace(/\|/g, '')) return;
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }

    function _bulkDuplicateLabels(records, counts) {
        const seen = new Set();
        const labels = [];
        (records || []).forEach(row => {
            const key = _bulkKey(row);
            if ((counts[key] || 0) <= 1 || seen.has(key)) return;
            seen.add(key);
            labels.push(`${row.carModel} / ${row.partName}${row.color ? ' / ' + row.color : ''}`);
        });
        return labels;
    }

    // ── 일괄 등록 (엑셀 복사·붙여넣기) ──────────────────────────────
    function openBulkModal() {
        _requireBulkAdmin(_showBulkModal);
    }

    function _showBulkModal() {
        ProductWarehouseModule._bulkRecords = [];
        const container = document.getElementById('contentArea');
        if (!container) return;
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="mes-apple-menu-hero">
                    ${ProdAppleMenu.strip([
                        { label: '재고 현황',    icon: 'inventory_2',         subtitle: '현재 재고 조회',   accent: '#2563eb', active: false, onClick: "ProductWarehouseModule.render(document.getElementById('contentArea'))" },
                        { label: '입고 기록',    icon: 'login',               subtitle: '입고 이력 조회',   accent: '#10b981', active: false, onClick: "ProductWarehouseModule._switchTabOutside('incoming')" },
                        { label: '출고 기록',    icon: 'logout',              subtitle: '출고 이력 조회',   accent: '#f59e0b', active: false, onClick: "ProductWarehouseModule._switchTabOutside('outgoing')" },
                        { label: '일괄 등록/수정', icon: 'admin_panel_settings', subtitle: '관리자 재고 보정', accent: '#ef4444', active: true,  onClick: 'ProductWarehouseModule.openBulkModal()' }
                    ])}
                </div>
                <div class="card" style="margin-top:16px;">
                    <div class="card-body">
                        <div style="margin-bottom:10px;padding:10px 14px;background:rgba(59,130,246,0.07);
                                    border:1px solid rgba(59,130,246,0.25);border-radius:8px;font-size:0.82rem;
                                    color:var(--text-secondary);line-height:1.7;">
                            <b style="color:var(--accent-blue);">붙여넣기 방법</b><br>
                            엑셀에서 <b>차종 / 품명 / 컬러 / 재고</b> 4열을 복사(Ctrl+C) →
                            아래 입력창에 붙여넣기(Ctrl+V) → <b>미리보기</b> 클릭<br>
                            <span style="font-size:0.78rem;color:var(--text-muted);">
                            • 헤더가 있어도 됩니다: <b>차종 / 품명 / 컬러 / 재고</b><br>
                            • 컬러가 없는 예전 3열 양식(<b>차종 / 품명 / 재고</b>)도 계속 인식합니다<br>
                            • <b>-</b>는 목표 재고 0으로 인식합니다<br>
                            • 같은 <b>차종+품명+컬러</b>가 중복되면 저장할 수 없습니다<br>
                            • 저장 시 기존 제품창고 재고를 모두 삭제하고, 붙여넣은 목록으로 새로 등록합니다
                            </span>
                        </div>
                        <div style="margin-bottom:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;
                                    font-family:Consolas,monospace;font-size:0.78rem;line-height:1.45;color:var(--text-secondary);">
                            차종&nbsp;&nbsp;&nbsp;&nbsp;품명&nbsp;&nbsp;&nbsp;&nbsp;컬러&nbsp;&nbsp;&nbsp;&nbsp;재고<br>
                            GOLF-7&nbsp;&nbsp;&nbsp;&nbsp;KNOB- DOOR [DYS (LASER)]&nbsp;&nbsp;&nbsp;&nbsp;DYS&nbsp;&nbsp;&nbsp;&nbsp;1,500<br>
                            A3&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;KNOB [DOOR LOW] 6PS 레이저인쇄&nbsp;&nbsp;&nbsp;&nbsp;6PS&nbsp;&nbsp;&nbsp;&nbsp;1,000<br>
                            T1XX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PARK&nbsp;&nbsp;&nbsp;&nbsp;BK&nbsp;&nbsp;&nbsp;&nbsp;-
                        </div>
                        <div class="form-row" style="margin-bottom:12px;">
                            <div class="form-group">
                                <label class="form-label">기준일자</label>
                                <input type="date" class="form-input" id="bulkInvDate" value="${UIUtils.today()}">
                            </div>
                            <div class="form-group" style="align-self:flex-end;">
                                <button class="btn btn-outline" onclick="ProductWarehouseModule._bulkParse()">
                                    <span class="material-symbols-outlined">preview</span> 미리보기
                                </button>
                            </div>
                        </div>
                        <textarea id="bulkPasteArea" class="form-textarea"
                            placeholder="엑셀에서 복사한 내용을 여기에 붙여넣으세요 (Ctrl+V)"
                            style="height:180px;font-family:monospace;font-size:0.78rem;resize:vertical;"
                            oninput="document.getElementById('bulkPreviewWrap').innerHTML='';
                                     var s=document.getElementById('bulkSaveBtn');if(s)s.disabled=true;"></textarea>
                        <div id="bulkPreviewWrap" style="margin-top:12px;"></div>
                        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                            <button class="btn btn-secondary"
                                onclick="ProductWarehouseModule.render(document.getElementById('contentArea'))">
                                취소
                            </button>
                            <button class="btn btn-primary" id="bulkSaveBtn" disabled
                                title="미리보기로 데이터를 확인하면 등록할 수 있습니다."
                                onclick="ProductWarehouseModule._bulkSave()">
                                <span class="material-symbols-outlined">save</span> 등록 실행
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // 엑셀 텍스트 파싱
    function _bulkParse() {
        const raw = (document.getElementById('bulkPasteArea') || {}).value || '';
        const wrap = document.getElementById('bulkPreviewWrap');
        const saveBtn = document.getElementById('bulkSaveBtn');
        if (!wrap) return;

        const records = _parseBulkRows(raw);
        if (!records.length) {
            wrap.innerHTML = '<p style="color:var(--accent-red);font-size:0.83rem;">붙여넣은 내용이 없습니다.</p>';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        // 미리보기 테이블
        const currentMap = _getCurrentStockMap();
        const duplicateCounts = _bulkDuplicateCounts(records);
        const duplicateLabels = _bulkDuplicateLabels(records, duplicateCounts);
        const hasDuplicates = duplicateLabels.length > 0;
        let changed = 0;
        const rowsHtml = records.map((r, idx) => {
            const key = `${r.carModel}||${r.partName}||${r.color || ''}`;
            const current = currentMap[key] || 0;
            const diff = r.quantity - current;
            if (diff !== 0) changed++;
            const isDup = (duplicateCounts[_bulkKey(r)] || 0) > 1;
            const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = diff > 0 ? `+${UIUtils.formatNumber(diff)}` : UIUtils.formatNumber(diff);
            return `
            <tr style="${isDup ? 'background:rgba(239,68,68,0.06);' : ''}">
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.carModel)}" data-idx="${idx}" data-field="carModel"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.partName)}" data-idx="${idx}" data-field="partName"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.color)}" data-idx="${idx}" data-field="color"></td>
                <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                <td><input type="number" min="0" class="form-input pw-bulk-cell" value="${r.quantity}" data-idx="${idx}" data-field="quantity" style="text-align:right;"></td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                <td style="padding:4px 8px;text-align:center;">
                    ${isDup ? '<span style="display:inline-block;margin-right:4px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.12);color:var(--accent-red);font-size:0.7rem;font-weight:700;">중복</span>' : ''}
                    <button class="btn btn-sm btn-outline" onclick="ProductWarehouseModule._bulkRemoveRow(${idx})">제외</button>
                </td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);font-size:18px;">check_circle</span>
                <span style="font-size:0.85rem;font-weight:600;color:var(--accent-green);">
                    ${records.length}건 인식됨 / 기존 재고와 차이 ${changed}건
                </span>
            </div>
            ${hasDuplicates ? `
            <div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>중복 품목 ${duplicateLabels.length}개가 있습니다.</strong>
                같은 차종+품명+컬러는 1개만 남기거나 값을 수정해야 저장할 수 있습니다.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 5).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 5 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차종</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">품명</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">컬러</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">현재고</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">목표수량</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차이</th>
                            <th style="padding:5px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;

        ProductWarehouseModule._bulkRecords = records;
        wrap.querySelectorAll('.pw-bulk-cell').forEach(input => {
            input.addEventListener('input', function() {
                const idx = Number(this.dataset.idx);
                const field = this.dataset.field;
                if (!ProductWarehouseModule._bulkRecords || !ProductWarehouseModule._bulkRecords[idx]) return;
                ProductWarehouseModule._bulkRecords[idx][field] = field === 'quantity'
                    ? Math.max(0, Math.round(Number(this.value) || 0))
                    : _normalizeText(this.value);
            });
            input.addEventListener('change', _bulkRenderPreview);
        });
        if (saveBtn) {
            saveBtn.disabled = hasDuplicates;
            saveBtn.title = hasDuplicates
                ? '중복 항목을 수정하거나 제외한 뒤 등록할 수 있습니다.'
                : '미리보기 내용으로 제품창고 재고를 등록합니다.';
        }
    }

    function _bulkRenderPreview() {
        const textArea = document.getElementById('bulkPasteArea');
        if (textArea) textArea.value = '';
        const records = ProductWarehouseModule._bulkRecords || [];
        const wrap = document.getElementById('bulkPreviewWrap');
        const saveBtn = document.getElementById('bulkSaveBtn');
        if (!wrap) return;
        if (!records.length) {
            wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.83rem;">미리보기 데이터가 없습니다.</p>';
            if (saveBtn) saveBtn.disabled = true;
            return;
        }
        const currentMap = _getCurrentStockMap();
        const duplicateCounts = _bulkDuplicateCounts(records);
        const duplicateLabels = _bulkDuplicateLabels(records, duplicateCounts);
        const hasDuplicates = duplicateLabels.length > 0;
        let changed = 0;
        const rowsHtml = records.map((r, idx) => {
            const key = `${r.carModel}||${r.partName}||${r.color || ''}`;
            const current = currentMap[key] || 0;
            const diff = (Number(r.quantity) || 0) - current;
            if (diff !== 0) changed++;
            const isDup = (duplicateCounts[_bulkKey(r)] || 0) > 1;
            const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = diff > 0 ? `+${UIUtils.formatNumber(diff)}` : UIUtils.formatNumber(diff);
            return `
            <tr style="${isDup ? 'background:rgba(239,68,68,0.06);' : ''}">
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.carModel)}" data-idx="${idx}" data-field="carModel"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.partName)}" data-idx="${idx}" data-field="partName"></td>
                <td><input class="form-input pw-bulk-cell" value="${_escapeHtml(r.color)}" data-idx="${idx}" data-field="color"></td>
                <td style="padding:4px 8px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                <td><input type="number" min="0" class="form-input pw-bulk-cell" value="${r.quantity}" data-idx="${idx}" data-field="quantity" style="text-align:right;"></td>
                <td style="padding:4px 8px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                <td style="padding:4px 8px;text-align:center;">
                    ${isDup ? '<span style="display:inline-block;margin-right:4px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.12);color:var(--accent-red);font-size:0.7rem;font-weight:700;">중복</span>' : ''}
                    <button class="btn btn-sm btn-outline" onclick="ProductWarehouseModule._bulkRemoveRow(${idx})">제외</button>
                </td>
            </tr>`;
        }).join('');
        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);font-size:18px;">check_circle</span>
                <span style="font-size:0.85rem;font-weight:600;color:var(--accent-green);">
                    ${records.length}건 인식됨 / 기존 재고와 차이 ${changed}건
                </span>
            </div>
            ${hasDuplicates ? `
            <div style="margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,0.35);border-radius:6px;background:rgba(239,68,68,0.06);color:var(--accent-red);font-size:0.8rem;line-height:1.55;">
                <strong>중복 품목 ${duplicateLabels.length}개가 있습니다.</strong>
                같은 차종+품명+컬러는 1개만 남기거나 값을 수정해야 저장할 수 있습니다.
                <div style="margin-top:3px;color:var(--text-secondary);">${duplicateLabels.slice(0, 5).map(_escapeHtml).join('<br>')}${duplicateLabels.length > 5 ? '<br>...' : ''}</div>
            </div>` : ''}
            <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차종</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">품명</th>
                            <th style="padding:5px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">컬러</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">현재고</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">목표수량</th>
                            <th style="padding:5px 8px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">차이</th>
                            <th style="padding:5px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">작업</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
        wrap.querySelectorAll('.pw-bulk-cell').forEach(input => {
            input.addEventListener('input', function() {
                const idx = Number(this.dataset.idx);
                const field = this.dataset.field;
                if (!ProductWarehouseModule._bulkRecords || !ProductWarehouseModule._bulkRecords[idx]) return;
                ProductWarehouseModule._bulkRecords[idx][field] = field === 'quantity'
                    ? Math.max(0, Math.round(Number(this.value) || 0))
                    : _normalizeText(this.value);
            });
            input.addEventListener('change', _bulkRenderPreview);
        });
        if (saveBtn) {
            saveBtn.disabled = hasDuplicates;
            saveBtn.title = hasDuplicates
                ? '중복 항목을 수정하거나 제외한 뒤 등록할 수 있습니다.'
                : '미리보기 내용으로 제품창고 재고를 등록합니다.';
        }
    }

    function _bulkRemoveRow(idx) {
        if (!ProductWarehouseModule._bulkRecords) return;
        ProductWarehouseModule._bulkRecords.splice(idx, 1);
        _bulkRenderPreview();
    }

    function _showBulkSaveResult(rows, date) {
        const increased = rows.filter(row => row.diff > 0).length;
        const decreased = rows.filter(row => row.diff < 0).length;
        const unchanged = rows.filter(row => row.diff === 0).length;
        const totalQty = rows.reduce((sum, row) => sum + row.targetQty, 0);
        const rowsHtml = rows.map(row => {
            const diffColor = row.diff > 0
                ? 'var(--accent-green)'
                : row.diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = row.diff > 0
                ? `+${UIUtils.formatNumber(row.diff)}`
                : UIUtils.formatNumber(row.diff);
            return `
                <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:7px 9px;">${_escapeHtml(row.carModel)}</td>
                    <td style="padding:7px 9px;">${_escapeHtml(row.partName)}</td>
                    <td style="padding:7px 9px;">${_escapeHtml(row.color || '-')}</td>
                    <td style="padding:7px 9px;text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(row.currentQty)}</td>
                    <td style="padding:7px 9px;text-align:right;font-weight:700;">${UIUtils.formatNumber(row.targetQty)}</td>
                    <td style="padding:7px 9px;text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                </tr>`;
        }).join('');

        UIUtils.showModal('제품창고 일괄 등록 결과', `
            <div style="padding:12px 14px;margin-bottom:14px;border:1px solid rgba(34,197,94,0.3);
                        border-radius:8px;background:rgba(34,197,94,0.07);display:flex;align-items:center;gap:9px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);">check_circle</span>
                <div>
                    <div style="font-weight:700;color:var(--accent-green);">등록이 완료되었습니다.</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">기준일자 ${_escapeHtml(date)}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px;">
                ${[
                    ['등록 품목', `${rows.length}건`, 'var(--accent-blue)'],
                    ['총 재고', `${UIUtils.formatNumber(totalQty)}개`, 'var(--text-primary)'],
                    ['증가', `${increased}건`, 'var(--accent-green)'],
                    ['감소', `${decreased}건`, 'var(--accent-red)'],
                    ['동일', `${unchanged}건`, 'var(--text-muted)']
                ].map(item => `
                    <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;text-align:center;background:var(--bg-secondary);">
                        <div style="font-size:0.72rem;color:var(--text-muted);">${item[0]}</div>
                        <div style="margin-top:3px;font-size:1rem;font-weight:800;color:${item[2]};">${item[1]}</div>
                    </div>`).join('')}
            </div>
            <div style="max-height:320px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:7px 9px;text-align:left;">차종</th>
                            <th style="padding:7px 9px;text-align:left;">품명</th>
                            <th style="padding:7px 9px;text-align:left;">컬러</th>
                            <th style="padding:7px 9px;text-align:right;">기존 재고</th>
                            <th style="padding:7px 9px;text-align:right;">등록 재고</th>
                            <th style="padding:7px 9px;text-align:right;">변경</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary"
                onclick="UIUtils.closeModal();ProductWarehouseModule.render(document.getElementById('contentArea'))">
                재고 현황 보기
            </button>
        `, 'lg');
    }

    async function _bulkSave() {
        if (!_isAdminUser()) {
            UIUtils.toast('제품 창고 일괄 등록 및 수정은 관리자만 가능합니다.', 'warning');
            return;
        }
        const records = ProductWarehouseModule._bulkRecords;
        if (!records || !records.length) {
            UIUtils.toast('저장할 데이터가 없습니다.', 'warning');
            return;
        }
        const duplicateLabels = _bulkDuplicateLabels(records, _bulkDuplicateCounts(records));
        if (duplicateLabels.length) {
            UIUtils.toast('중복 품목이 있어 저장할 수 없습니다. 중복 행을 제외하거나 수정하세요.', 'warning');
            _bulkRenderPreview();
            return;
        }
        const date = (document.getElementById('bulkInvDate') || {}).value || UIUtils.today();
        const nowIso = new Date().toISOString();
        const currentMap = _getCurrentStockMap();
        const newItems = [];
        const resultRows = [];

        for (const r of records) {
            const carModel = _normalizeText(r.carModel);
            const partName = _normalizeText(r.partName);
            const color = _normalizeText(r.color);
            const targetQty = Math.max(0, Math.round(Number(r.quantity) || 0));
            if (!carModel || !partName) continue;
            const currentQty = currentMap[`${carModel}||${partName}||${color}`] || 0;

            newItems.push({
                id: Storage.generateId ? Storage.generateId() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
                createdAt: nowIso,
                date,
                type: '입고',
                carModel,
                partName,
                color,
                quantity: targetQty,
                source: '일괄 등록 및 수정'
            });
            resultRows.push({
                carModel,
                partName,
                color,
                currentQty,
                targetQty,
                diff: targetQty - currentQty
            });
        }

        if (!newItems.length) {
            UIUtils.toast('등록할 유효한 데이터가 없습니다.', 'warning');
            return;
        }

        await Storage.saveAll(STORE, newItems);
        ProductWarehouseModule._bulkRecords = [];
        UIUtils.toast(`기존 제품창고 재고 삭제 후 ${newItems.length}건 등록 완료`, 'success');
        _showBulkSaveResult(resultRows, date);
    }

    function openAddModal() {
        _requireProductAdmin(() => {
            UIUtils.showModal('현재고 등록과 수정', _stockAdjustHtml(), `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="ProductWarehouseModule.saveStockAdjustment()">보정 저장</button>
            `);
        });
    }

    function _itemKeyOf(r) {
        return `${r.carModel || ''}||${r.partName || ''}||${r.color || ''}`;
    }

    function _stockAdjustHtml() {
        const records = Storage.getAll(STORE) || [];
        const itemMap = {};
        records.forEach(r => {
            const key = _itemKeyOf(r);
            if (!itemMap[key]) itemMap[key] = { carModel: r.carModel || '', partName: r.partName || '', color: r.color || '', qty: 0 };
            itemMap[key].qty += (r.type === '출고' ? -1 : 1) * (Number(r.quantity) || 0);
        });
        const carOptions = [...new Set(Object.values(itemMap).map(item => item.carModel || ''))]
            .sort((a, b) => a.localeCompare(b, 'ko'))
            .map(car => `<option value="${_escapeHtml(car)}">${_escapeHtml(car || '차종 미지정')}</option>`)
            .join('');
        return `
            <div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(59,130,246,0.25);border-radius:8px;background:rgba(59,130,246,0.06);font-size:0.82rem;color:var(--text-secondary);line-height:1.6;">
                현장 실재고와 시스템 현재고가 맞지 않을 때 사용하는 관리자 보정 기능입니다. 입고/출고 처리가 아니라 선택한 제품 LOT의 수량과 LOT 정보를 직접 보정하며, 수정 사유는 필수입니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 선택</label>
                    <select class="form-select" id="pwAdjustCar" onchange="ProductWarehouseModule.renderAdjustPartOptions()">
                        <option value="">-- 차종 선택 --</option>
                        ${carOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 선택</label>
                    <select class="form-select" id="pwAdjustItem" onchange="ProductWarehouseModule.renderAdjustRows()" disabled>
                        <option value="">-- 차종을 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 사유 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="pwAdjustReason" placeholder="예: 현장 실사 재고 보정">
                </div>
            </div>
            <div id="pwAdjustRows" style="margin-top:12px;"></div>
        `;
    }

    function _currentProductStockItems() {
        const itemMap = {};
        (Storage.getAll(STORE) || []).forEach(r => {
            const key = _itemKeyOf(r);
            if (!itemMap[key]) itemMap[key] = { carModel: r.carModel || '', partName: r.partName || '', color: r.color || '', qty: 0 };
            itemMap[key].qty += (r.type === '출고' ? -1 : 1) * (Number(r.quantity) || 0);
        });
        return itemMap;
    }

    function renderAdjustPartOptions() {
        const car = (document.getElementById('pwAdjustCar') || {}).value || '';
        const partSelect = document.getElementById('pwAdjustItem');
        const wrap = document.getElementById('pwAdjustRows');
        if (wrap) wrap.innerHTML = '';
        if (!partSelect) return;
        if (!car) {
            partSelect.disabled = true;
            partSelect.innerHTML = '<option value="">-- 차종을 먼저 선택 --</option>';
            return;
        }
        const options = Object.entries(_currentProductStockItems())
            .filter(([, item]) => (item.carModel || '') === car)
            .sort((a, b) => `${a[1].partName} ${a[1].color}`.localeCompare(`${b[1].partName} ${b[1].color}`, 'ko'))
            .map(([key, item]) => `<option value="${_escapeHtml(key)}">${_escapeHtml(item.partName || '-')} / ${_escapeHtml(item.color || '-')} (${UIUtils.formatNumber(item.qty)} EA)</option>`)
            .join('');
        partSelect.disabled = false;
        partSelect.innerHTML = `<option value="">-- 품명 / 컬러 선택 --</option>${options}`;
    }

    function renderAdjustRows() {
        const key = (document.getElementById('pwAdjustItem') || {}).value || '';
        const wrap = document.getElementById('pwAdjustRows');
        if (!wrap) return;
        if (!key) {
            wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">제품을 선택하면 LOT별 현재고가 표시됩니다.</div>';
            return;
        }
        const rows = (Storage.getAll(STORE) || []).filter(r => _itemKeyOf(r) === key);
        const html = rows.map(r => `
            <tr>
                <td style="padding:6px 8px;">${_escapeHtml(r.date || '-')}</td>
                <td style="padding:6px 8px;">${_escapeHtml(r.type || '입고')}</td>
                <td style="padding:6px 8px;"><input class="form-input pw-adjust-row" data-id="${r.id}" data-field="lotNo" value="${_escapeHtml(r.lotNo || '')}" placeholder="LOT"></td>
                <td style="padding:6px 8px;"><input class="form-input pw-adjust-row" data-id="${r.id}" data-field="paintingDate" value="${_escapeHtml(r.paintingDate || '')}" placeholder="도장 LOT"></td>
                <td style="padding:6px 8px;"><input type="number" min="0" class="form-input pw-adjust-row" data-id="${r.id}" data-field="quantity" value="${Number(r.quantity) || 0}" style="text-align:right;"></td>
                <td style="padding:6px 8px;color:var(--text-muted);font-size:0.78rem;">${_escapeHtml(r.source || '-')}</td>
            </tr>
        `).join('');
        wrap.innerHTML = `
            <div style="max-height:340px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
                        <tr>
                            <th style="padding:7px 8px;text-align:left;">날짜</th>
                            <th style="padding:7px 8px;text-align:left;">유형</th>
                            <th style="padding:7px 8px;text-align:left;">LOT</th>
                            <th style="padding:7px 8px;text-align:left;">도장 LOT</th>
                            <th style="padding:7px 8px;text-align:right;">수량</th>
                            <th style="padding:7px 8px;text-align:left;">출처</th>
                        </tr>
                    </thead>
                    <tbody>${html || `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted);">대상 재고 기록이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `;
    }

    async function saveStockAdjustment() {
        if (!_isAdminUser()) {
            UIUtils.toast('제품 창고 현재고 보정은 관리자만 가능합니다.', 'warning');
            return;
        }
        const reason = _normalizeText((document.getElementById('pwAdjustReason') || {}).value);
        if (!reason) {
            UIUtils.toast('수정 사유를 입력하세요.', 'warning');
            return;
        }
        const inputs = Array.from(document.querySelectorAll('.pw-adjust-row'));
        if (!inputs.length) {
            UIUtils.toast('보정할 제품을 선택하세요.', 'warning');
            return;
        }
        const byId = {};
        inputs.forEach(input => {
            const id = input.dataset.id;
            const field = input.dataset.field;
            if (!byId[id]) byId[id] = {};
            byId[id][field] = field === 'quantity'
                ? Math.max(0, Math.round(Number(input.value) || 0))
                : _normalizeText(input.value);
        });

        const all = Storage.getAll(STORE) || [];
        const user = typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        const logs = [];
        for (const [id, changes] of Object.entries(byId)) {
            const old = all.find(r => r.id === id);
            if (!old) continue;
            const changed = ['lotNo', 'paintingDate', 'quantity'].some(field => String(old[field] ?? '') !== String(changes[field] ?? ''));
            if (!changed) continue;
            await Storage.update(STORE, id, changes);
            logs.push({
                id: Storage.generateId ? Storage.generateId() : `${Date.now()}_${Math.random()}`,
                date: UIUtils.today(),
                at: new Date().toISOString(),
                user: user ? (user.name || user.username || user.id || '') : '',
                reason,
                item: { carModel: old.carModel || '', partName: old.partName || '', color: old.color || '' },
                before: { lotNo: old.lotNo || '', paintingDate: old.paintingDate || '', quantity: Number(old.quantity) || 0 },
                after: { lotNo: changes.lotNo || '', paintingDate: changes.paintingDate || '', quantity: Number(changes.quantity) || 0 }
            });
        }
        if (!logs.length) {
            UIUtils.toast('변경된 내용이 없습니다.', 'info');
            return;
        }
        const prev = (await Storage.getConfigValue('product_inventory_adjust_logs').catch(() => [])) || [];
        await Storage.setConfigValue('product_inventory_adjust_logs', [...logs, ...prev].slice(0, 200));
        UIUtils.closeModal();
        UIUtils.toast(`현재고 보정 ${logs.length}건이 저장되었습니다.`, 'success');
        loadData();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['날짜', '차종', '품명', '컬러', '수량', '유형', '출처'];
        const rows = data.map(d => [d.date, d.carModel||'', d.partName, d.color||'', d.quantity, d.type, d.source || '']);
        Storage.exportToCSV(headers, rows, '제품창고_재고');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        loadData,
        _switchTab,
        _switchTabOutside,
        _loadIncoming,
        _loadOutgoing,
        _showHistory,
        openBulkModal,
        _bulkParse,
        _bulkRemoveRow,
        _bulkSave,
        _bulkRecords: [],
        openAddModal,
        renderAdjustPartOptions,
        renderAdjustRows,
        saveStockAdjustment,
        exportData
    };
})();


// ===================================================================
// 제품 출고
// ===================================================================
const ProductOutgoingModule = (function() {
    const STORE = DB.STORES.PRODUCT_OUTGOING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="ProductOutgoingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 출고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="prodOutStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="prodOutEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="ProductOutgoingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="prodOutStats"></div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>출고일</th>
                                        <th>품명</th>
                                        <th>수량</th>
                                        <th>거래처</th>
                                        <th>납품처</th>
                                        <th>차량번호</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="prodOutTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('prodOutStart').value;
        const end = document.getElementById('prodOutEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const totalQty = data.reduce((s, d) => s + (Number(d.quantity) || 0), 0);

        document.getElementById('prodOutStats').innerHTML = `
            <div class="stat-card green">
                <div class="stat-card-value">${data.length}</div>
                <div class="stat-card-label">출고 건수</div>
            </div>
            <div class="stat-card blue">
                <div class="stat-card-value">${UIUtils.formatNumber(totalQty)}</div>
                <div class="stat-card-label">총 출고량 (EA)</div>
            </div>
        `;

        const tbody = document.getElementById('prodOutTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.customer || '-'}</td>
                <td>${d.deliveryTo || '-'}</td>
                <td>${d.vehicleNo || '-'}</td>
                <td>${d.note || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="ProductOutgoingModule.edit('${d.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="ProductOutgoingModule.remove('${d.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('제품 출고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="addProdOutDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addProdOutPart" placeholder="품명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addProdOutQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">거래처</label>
                    <input type="text" class="form-input" id="addProdOutCustomer" placeholder="거래처명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="addProdOutDelivery" placeholder="납품처">
                </div>
                <div class="form-group">
                    <label class="form-label">차량번호</label>
                    <input type="text" class="form-input" id="addProdOutVehicle" placeholder="차량번호">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="addProdOutNote" placeholder="비고"></textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductOutgoingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addProdOutDate').value,
            partName: document.getElementById('addProdOutPart').value.trim(),
            quantity: Number(document.getElementById('addProdOutQty').value) || 0,
            customer: document.getElementById('addProdOutCustomer').value.trim(),
            deliveryTo: document.getElementById('addProdOutDelivery').value.trim(),
            vehicleNo: document.getElementById('addProdOutVehicle').value.trim(),
            note: document.getElementById('addProdOutNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 제품 창고에서 출고 처리
        await Storage.add(DB.STORES.PRODUCT_INVENTORY, {
            date: data.date,
            partName: data.partName,
            quantity: data.quantity,
            type: '출고',
            source: `${data.customer || ''} 납품`
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('제품 출고가 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        UIUtils.showModal('제품 출고 수정', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="editProdOutDate" value="${d.date}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="editProdOutPart" value="${d.partName || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="editProdOutQty" value="${d.quantity || 0}">
                </div>
                <div class="form-group">
                    <label class="form-label">거래처</label>
                    <input type="text" class="form-input" id="editProdOutCustomer" value="${d.customer || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="editProdOutDelivery" value="${d.deliveryTo || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">차량번호</label>
                    <input type="text" class="form-input" id="editProdOutVehicle" value="${d.vehicleNo || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="editProdOutNote">${d.note || ''}</textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductOutgoingModule.saveEdit('${id}')">저장</button>
        `);
    }

    async function saveEdit(id) {
        await Storage.update(STORE, id, {
            date: document.getElementById('editProdOutDate').value,
            partName: document.getElementById('editProdOutPart').value.trim(),
            quantity: Number(document.getElementById('editProdOutQty').value) || 0,
            customer: document.getElementById('editProdOutCustomer').value.trim(),
            deliveryTo: document.getElementById('editProdOutDelivery').value.trim(),
            vehicleNo: document.getElementById('editProdOutVehicle').value.trim(),
            note: document.getElementById('editProdOutNote').value.trim()
        });
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
        const headers = ['출고일', '품명', '수량', '거래처', '납품처', '차량번호', '비고'];
        const rows = data.map(d => [d.date, d.partName, d.quantity, d.customer || '', d.deliveryTo || '', d.vehicleNo || '', d.note || '']);
        Storage.exportToCSV(headers, rows, '제품출고');
        UIUtils.toast('내보내기 완료', 'success');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();
