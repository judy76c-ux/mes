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

    // ── 페이지 렌더 ───────────────────────────────────────────────────
    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-secondary" onclick="ShippingStandbyModule.exportHistory()"
                            style="font-size:0.85rem;">
                            <span class="material-symbols-outlined">download</span> 이력 내보내기
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
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="date" class="form-input" id="ssHistStart"
                                value="${UIUtils.monthAgo()}" style="width:130px;font-size:0.82rem;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="ssHistEnd"
                                value="${UIUtils.today()}" style="width:130px;font-size:0.82rem;">
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
                                        <th>도장 LOT</th>
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
        loadHistory();
    }

    // ── 대기 목록 ────────────────────────────────────────────────────
    function loadData() {
        const sbData  = Storage.getAll(SB_STORE);
        sbData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
            waitingBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">
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
                <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(d.inspectionQty || 0)}</td>
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
    function loadHistory() {
        const start = document.getElementById('ssHistStart')?.value || '';
        const end   = document.getElementById('ssHistEnd')?.value   || '';
        const data  = Storage.getByDateRange(SI_STORE, start, end)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const tbody = document.getElementById('ssHistoryBody');
        if (!tbody) return;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">해당 기간의 검사 이력이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            return `
            <tr style="cursor:pointer;" onclick="ShippingStandbyModule._showDetail('${d.id}', event)">
                <td style="white-space:nowrap;">${d.date || '-'}</td>
                <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${d.paintingDate || '-'}</td>
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
        UIUtils.confirm('대기 항목을 삭제하시겠습니까?', async () => {
            await Storage.remove(SB_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
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
        const data = Storage.getAll(SI_STORE);
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

    return {
        render, loadData, loadHistory,
        _showDetail,
        removeStandby, removeHistory, exportHistory,
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
                        <div style="font-family:monospace;font-size:0.82rem;">${sb.paintingDate || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">사출 LOT</div>
                        <div style="font-family:monospace;font-size:0.82rem;">${sb.lotNo || '-'}</div>
                    </div>
                </div>
                <input type="hidden" id="siStandbyId"  value="${sb.id    || ''}">
                <input type="hidden" id="siCarModel"   value="${sb.carModel   || ''}">
                <input type="hidden" id="siPartName"   value="${sb.partName   || ''}">
                <input type="hidden" id="siColor"      value="${sb.color      || ''}">
                <input type="hidden" id="siPaintingDate" value="${sb.paintingDate || ''}">
                <input type="hidden" id="siLotNoHidden"  value="${sb.lotNo    || ''}">
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
                        <input type="number" class="form-input" id="siLotSize" value="${sb.inspectionQty || 0}"
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
                        <button class="btn btn-secondary" onclick="ShippingInspectionModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
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
                                        <th>도장 LOT</th>
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
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">검사 실적이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => {
            const badge = d.result === '합격' ? 'success' : d.result === '불합격' ? 'danger' : 'warning';
            return `
                <tr>
                    <td style="white-space:nowrap;">${d.date || '-'}</td>
                    <td style="font-size:0.85rem;">${d.customer || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td>${d.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.8rem;">${d.paintingDate || '-'}</td>
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
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="Router.navigate('injection-layout')"
                            title="1층 소재/완제품 보관창고 배치 레이아웃을 시각적으로 편집합니다.">
                            <span class="material-symbols-outlined">map</span> 레이아웃
                        </button>
                        <button class="btn btn-primary" onclick="ProductWarehouseModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 재고 등록
                        </button>
                        <button class="btn btn-secondary" onclick="ProductWarehouseModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="pwStats"></div>
                <div id="pwBlocks"></div>
            </div>
        `;
        loadData();
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

        const carModels = Object.keys(byCarModel).sort();

        const cards = carModels.map(car => {
            const group = byCarModel[car].sort((a, b) =>
                (a.part || '').localeCompare(b.part, 'ko') || (a.color || '').localeCompare(b.color, 'ko'));

            const groupTotal = group.reduce((s, i) => s + (i.inQty - i.outQty), 0);

            const rows = group.map(i => {
                const stock = i.inQty - i.outQty;
                const stockColor = stock <= 0
                    ? 'var(--accent-red)'
                    : stock < 50
                    ? 'var(--accent-orange)'
                    : 'var(--accent-green)';
                const keyEnc = encodeURIComponent(`${i.car}||${i.part}||${i.color}`);
                return `
                <tr onclick="ProductWarehouseModule._showHistory('${keyEnc}', event)"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;border-bottom:1px solid var(--border-color);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${i.part}
                    </td>
                    <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">
                        ${i.color || ''}
                    </td>
                    <td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-color);white-space:nowrap;">
                        <span style="font-size:0.9rem;font-weight:800;color:${stockColor};">${UIUtils.formatNumber(stock)}</span>
                        <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                    </td>
                    <td style="padding:5px 8px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);white-space:nowrap;">
                        ${i.lastDate || ''}
                    </td>
                </tr>`;
            }).join('');

            return `
            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="background:var(--accent-blue);color:#fff;padding:7px 10px;
                            display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                        ${car}
                        <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${group.length}종</span>
                    </span>
                    <div style="font-size:0.75rem;">
                        재고 <strong>${UIUtils.formatNumber(groupTotal)}</strong> EA
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                    <thead>
                        <tr style="background:var(--bg-secondary);">
                            <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                            <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                            <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재고</th>
                            <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">최근일자</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        });

        blocksEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${cards.join('')}</div>`;
    }

    // ── 이력 팝업 ─────────────────────────────────────────────────────
    function _showHistory(keyEnc, event) {
        const key   = decodeURIComponent(keyEnc);
        const [car, part, color] = key.split('||');

        const allData = Storage.getAll(STORE);
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

        const popupId = 'pwHistoryPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            width:620px; max-width:96vw; max-height:80vh;
            overflow:auto; font-size:0.88rem;
        `;
        popup.style.left = (event.clientX + 14) + 'px';
        popup.style.top  = (event.clientY - 10) + 'px';

        const rowsHtml = records.length
            ? records.map(r => {
                const isOut = r.type === '출고';
                return `
                <tr>
                    <td style="white-space:nowrap;padding:6px 10px;">${r.date || '-'}</td>
                    <td style="padding:6px 10px;text-align:center;">
                        <span style="font-size:0.75rem;font-weight:600;
                            color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};
                            border:1px solid ${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};
                            border-radius:4px;padding:1px 6px;">${r.type || '입고'}</span>
                    </td>
                    <td style="text-align:right;font-weight:600;padding:6px 10px;
                        color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${isOut ? '-' : '+'}${UIUtils.formatNumber(r.quantity || 0)}
                    </td>
                    <td style="padding:6px 10px;font-size:0.78rem;font-family:monospace;white-space:nowrap;">
                        ${r.lotNo || '-'}
                    </td>
                    <td style="padding:6px 10px;font-size:0.78rem;font-family:monospace;white-space:nowrap;color:var(--text-muted);">
                        ${r.paintingDate || '-'}
                    </td>
                    <td style="padding:6px 10px;font-size:0.78rem;color:var(--text-muted);">${r.source || '-'}</td>
                    <td style="padding:6px 10px;text-align:center;">
                        <button onclick="event.stopPropagation();ProductWarehouseModule.remove('${r.id}')"
                            style="background:none;border:none;cursor:pointer;color:var(--accent-red);font-size:0.78rem;padding:2px 6px;">삭제</button>
                    </td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">이력 없음</td></tr>`;

        popup.innerHTML = `
            <div style="padding:16px 18px;border-bottom:1px solid var(--border);
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

            <!-- 이력 테이블 -->
            <table style="width:100%;min-width:580px;border-collapse:collapse;font-size:0.82rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:6px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">날짜</th>
                        <th style="padding:6px 10px;text-align:center;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">유형</th>
                        <th style="padding:6px 10px;text-align:right;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">수량</th>
                        <th style="padding:6px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">생산 LOT</th>
                        <th style="padding:6px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">도장일자</th>
                        <th style="padding:6px 10px;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);">출처/행선지</th>
                        <th style="border-bottom:1px solid var(--border);"></th>
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

    function openAddModal() {
        UIUtils.showModal('재고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="addProdInvDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">유형</label>
                    <select class="form-select" id="addProdInvType">
                        <option value="입고">입고</option>
                        <option value="출고">출고</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addProdInvPart" placeholder="품명">
                </div>
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addProdInvQty" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">출처/행선지</label>
                <input type="text" class="form-input" id="addProdInvSource" placeholder="출처 또는 행선지">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductWarehouseModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addProdInvDate').value,
            type: document.getElementById('addProdInvType').value,
            partName: document.getElementById('addProdInvPart').value.trim(),
            quantity: Number(document.getElementById('addProdInvQty').value) || 0,
            source: document.getElementById('addProdInvSource').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('등록되었습니다.', 'success');
        loadData();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            // 팝업 열려있으면 닫기
            const popup = document.getElementById('pwHistoryPopup');
            if (popup) popup.remove();
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
        });
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
        _showHistory,
        openAddModal,
        saveNew,
        remove,
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
                        <button class="btn btn-secondary" onclick="ProductOutgoingModule.exportData()">
                            <span class="material-symbols-outlined">download</span> 내보내기
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
