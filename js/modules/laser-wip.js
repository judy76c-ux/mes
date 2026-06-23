/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기, 도장-B 공정 제품만)
 */

var LaserWipModule = (function() {
    const STORE_LASER = DB.STORES.LASER_WORK_LOG;
    const STORE_PAINT = DB.STORES.PAINTING_WORK;

    let _activeTab = 'standby'; // 'standby' | 'after-laser' | 'after-laser-residual'

    const TABS = [
        { id: 'standby',     label: '레이져 대기품 현황',    icon: 'hourglass_top' },
        { id: 'after-laser', label: '레이져 후 재공품 현황', icon: 'bolt' },
        { id: 'after-laser-residual', label: '레이져 후 잔량 현황', icon: 'inventory_2' }
    ];

    function _actionBtn(label, icon, onclick, color) {
        const col = color || 'var(--text-primary)';
        return `<button type="button" onclick="${onclick}"
            style="display:flex;align-items:center;gap:5px;padding:6px 13px;border:1px solid var(--border-color);
                   border-radius:7px;background:#fff;cursor:pointer;font-size:0.84rem;color:${col};
                   font-family:inherit;white-space:nowrap;transition:background 0.15s;"
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='#fff'">
            <span class="material-symbols-outlined" style="font-size:16px;color:${col};">${icon}</span>${label}
        </button>`;
    }

    function _tabNav() {
        const standbyActions = `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openManualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserStandbyModule.openStandbyOutModal()", 'var(--accent-red)')}
            ${_actionBtn('일괄등록', 'table_rows', "LaserStandbyModule.openBulkModal()", 'var(--accent-blue)')}`;
        const afterActions = `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openAfterLaserOut()", 'var(--accent-red)')}`;
        const residualActions = `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openResidualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openResidualOut()", 'var(--accent-red)')}`;
        return `
        <div style="margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${TABS.map(t => `
                        <button type="button" id="wipTab-${t.id}"
                            onclick="LaserWipModule.switchTab('${t.id}')"
                            class="btn ${_activeTab === t.id ? 'btn-primary' : 'btn-outline'}"
                            style="display:flex;align-items:center;gap:6px;${_activeTab === t.id ? '' : 'background:#fff;'}">
                            <span class="material-symbols-outlined" style="font-size:18px;">${t.icon}</span>
                            ${t.label}
                        </button>`).join('')}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:flex-end;">
                    ${_activeTab === 'standby'
                        ? standbyActions
                        : (_activeTab === 'after-laser' ? afterActions : residualActions)}
                </div>
            </div>
        </div>`;
    }
    function render(container) {
        container.innerHTML = `
        <div style="padding:20px;">
            <div id="wipTabNav">${_tabNav()}</div>
            <div id="wipTabContent"></div>
        </div>`;
        _renderTabContent();
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    function openTab(tab) {
        _activeTab = TABS.some(t => t.id === tab) ? tab : 'standby';
        if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate('laser-wip');
            return;
        }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    // ── 탭 컨텐츠 렌더 ───────────────────────────────────────────────────
    function _renderTabContent() {
        const el = document.getElementById('wipTabContent');
        if (!el) return;
        if (_activeTab === 'standby') {
            _renderStandbyTab(el);
        } else if (_activeTab === 'after-laser') {
            _renderAfterLaserTab(el);
        } else {
            _renderAfterLaserResidualTab(el);
        }
    }

    // ── 탭 1: 레이져 대기품 현황 ─────────────────────────────────────────
    function _renderStandbyTab(el) {
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;
                        background:rgba(245,158,11,0.07);border-left:3px solid var(--accent-orange);border-radius:0 8px 8px 0;">
                <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-orange);">hourglass_top</span>
                <div>
                    <div style="font-size:0.92rem;font-weight:700;color:var(--accent-orange);">레이져 대기품 현황</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);">도장 완료 후 레이져 공정 대기 재공품</div>
                </div>
            </div>
            <div id="lsbContentWrapper"></div>`;

        const wrapper = document.getElementById('lsbContentWrapper');
        if (wrapper && typeof LaserStandbyModule !== 'undefined') {
            LaserStandbyModule.renderContentOnly(wrapper);
        }
    }

    // ── 탭 2: 레이져 후 재공품 현황 ──────────────────────────────────────
    function _renderAfterLaserTab(el) {
        const rows       = _calcWip();
        const totalLaser = rows.reduce((s,r) => s + r.laserQty, 0);
        const totalPaint = rows.reduce((s,r) => s + r.paintBQty, 0);
        const totalWip   = rows.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
        const waitCount  = rows.filter(r => r.wip > 0).length;

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carWip = items.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => {
                        const wipColor   = r.wip > 0 ? 'var(--accent-green)' : (r.wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
                        const statusText = r.wip > 0 ? '도장 투입 대기' : (r.wip < 0 ? '오류' : '소진');
                        return `<tr style="border-bottom:1px solid var(--border-color);"
                                    onmouseover="this.style.background='var(--bg-secondary)'"
                                    onmouseout="this.style.background=''">
                            <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:160px;max-width:220px;">
                                <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.color && r.color !== '-' ? _esc(r.color) : ''}</td>
                            <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                                <span style="font-size:0.9rem;font-weight:800;color:${wipColor};">${UIUtils.formatNumber(Math.abs(r.wip))}</span>
                                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:${wipColor};white-space:nowrap;">${statusText}</td>
                        </tr>`;
                    }).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-purple,#7c3aed);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">재공 <strong>${UIUtils.formatNumber(carWip)}</strong> EA</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">재공품</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">상태</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="4" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 레이져 후 재공품이 없습니다.
               </div>`;

        el.innerHTML = `
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card purple">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalLaser)}</div>
                    <div class="stat-card-label">레이져 완료 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalPaint)}</div>
                    <div class="stat-card-label">도장 투입 (EA)</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalWip)}</div>
                    <div class="stat-card-label">현재 재공품 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${waitCount}</div>
                    <div class="stat-card-label">대기 품종 수</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 완료 − 도장 투입 = 재공품 (레이져→도장 공정 제품만)</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 분출 현황 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 완료 / 도장 투입 내역</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">레이져작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-purple);white-space:nowrap;">레이져 완료</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-blue);white-space:nowrap;">도장 투입</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">재공품</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length === 0
                                ? `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">
                                    <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">inbox</span>
                                    레이져 후 도장 공정이 있는 제품의 작업 이력이 없습니다.
                                   </td></tr>`
                                : rows.map(r => _afterLaserRow(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function _summaryCard(label, value, icon, color) {
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:1.1rem;color:${color};">${icon}</span>
                <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:500;">${label}</span>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:${color};">${UIUtils.formatNumber(value)}
                <span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">EA</span>
            </div>
        </div>`;
    }

    function _renderAfterLaserResidualTab(el) {
        const rows          = _calcLaserResidualWip();
        const totalResidual = rows.reduce((s,r) => s + r.residualQty, 0);
        const totalGood     = rows.reduce((s,r) => s + r.goodQty, 0);
        const totalShip     = rows.reduce((s,r) => s + r.fullBoxQty, 0);

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carResidual = items.reduce((s,r) => s + r.residualQty, 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => `
                    <tr style="border-bottom:1px solid var(--border-color);"
                        onmouseover="this.style.background='var(--bg-secondary)'"
                        onmouseout="this.style.background=''">
                        <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:160px;max-width:220px;">
                            <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                        </td>
                        <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.color && r.color !== '-' ? _esc(r.color) : ''}</td>
                        <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                            <span style="font-size:0.9rem;font-weight:800;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(r.residualQty)}</span>
                            <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                        </td>
                        <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</td>
                    </tr>`).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <div style="background:var(--accent-orange,#f59e0b);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">잔량 <strong>${UIUtils.formatNumber(carResidual)}</strong> EA</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;background:var(--bg-primary);">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--accent-orange,#f59e0b);font-weight:600;border-bottom:1px solid var(--border-color);">잔량</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">포장단위</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="4" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 잔량이 없습니다.
               </div>`;

        el.innerHTML = `
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card orange">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalResidual)}</div>
                    <div class="stat-card-label">총 잔량 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${rows.length}</div>
                    <div class="stat-card-label">잔량 품목 수</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalShip)}</div>
                    <div class="stat-card-label">출하가능 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalGood)}</div>
                    <div class="stat-card-label">총 양품 (EA)</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 잔량 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">포장단위 미달로 출하 제외된 잔량</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 잔량 상세 내역 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 작업 기준 잔량 발생 내역</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">레이져작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">양품</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">출하가능</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">포장단위</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-orange,#f59e0b);white-space:nowrap;">잔량</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length === 0
                                ? `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted);">
                                    <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">check_circle</span>
                                    레이져 후 잔량 입고 대상이 없습니다.
                                   </td></tr>`
                                : rows.map(r => _laserResidualRow(r)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function _calcLaserResidualWip() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const residualMap = {};

        laserWorks
            .filter(w => !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut)
            .forEach(w => {
                const packUnit = _num(w.packUnit);
                const goodQty = _num(w.inspectionGoodQty) || _num(w.completedQty) || _num(w.quantity);
                const fullBoxQty = _num(w.shippingEligibleQty) || (packUnit > 0 ? Math.floor(goodQty / packUnit) * packUnit : goodQty);
                const residualQty = _num(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - fullBoxQty) : 0);
                const paintLots = Array.isArray(w.paintLots) ? w.paintLots : [];
                const key = `${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`;
                if (!residualMap[key]) {
                    residualMap[key] = {
                        carModel: w.carModel || '',
                        partName: w.partName || '',
                        color: w.color || '',
                        laserDates: [],
                        paintDates: [],
                        injectionLots: [],
                        goodQty: 0,
                        fullBoxQty: 0,
                        packUnit,
                        residualQty: 0
                    };
                }
                residualMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                (paintLots.length ? paintLots.map(l => l && l.paintDate) : [w.paintDate || '']).forEach(v => residualMap[key].paintDates.push(v));
                (paintLots.length ? paintLots.map(l => l && l.lotNo) : [w.paintLot || w.lotNo || '']).forEach(v => residualMap[key].injectionLots.push(v));
                residualMap[key].goodQty += goodQty;
                residualMap[key].fullBoxQty += fullBoxQty;
                residualMap[key].packUnit = residualMap[key].packUnit || packUnit;
                residualMap[key].residualQty += residualQty;
            });

        laserWorks
            .filter(w => w.isResidualManualIn || w.isResidualManualOut)
            .forEach(w => {
                const key = `${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`;
                if (!residualMap[key]) {
                    residualMap[key] = {
                        carModel: w.carModel || '',
                        partName: w.partName || '',
                        color: w.color || '',
                        laserDates: [],
                        paintDates: [],
                        injectionLots: [],
                        goodQty: 0,
                        fullBoxQty: 0,
                        packUnit: _num(w.packUnit),
                        residualQty: 0
                    };
                }
                residualMap[key].packUnit = residualMap[key].packUnit || _num(w.packUnit);
                residualMap[key].residualQty += w.isResidualManualIn ? _num(w.quantity) : -_num(w.quantity);
                residualMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (w.paintDate) residualMap[key].paintDates.push(w.paintDate);
                if (w.lotNo) residualMap[key].injectionLots.push(w.lotNo);
            });

        return Object.values(residualMap)
            .map(r => ({
                ...r,
                residualQty: Math.max(0, _num(r.residualQty))
            }))
            .filter(r => r.residualQty > 0)
            .sort((a, b) => {
                const d = String(b.laserDates[0] || '').localeCompare(String(a.laserDates[0] || ''));
                if (d !== 0) return d;
                const cm = (a.carModel || '').localeCompare(b.carModel || '');
                return cm !== 0 ? cm : (a.partName || '').localeCompare(b.partName || '');
            });
    }

    function _getResidualProducts() {
        return _getPaintBProducts();
    }

    function openResidualInput() {
        const products = _getResidualProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 잔량 수기 등록', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text-secondary);">
                포장단위 미달 잔량을 수동으로 추가 등록합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualInDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualInCarModel" onchange="LaserWipModule.onResidualInCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualInPartName" onchange="LaserWipModule.onResidualInPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualInColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">잔량 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwResidualInQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualInNote" placeholder="수기 잔량입고">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveResidualInput()">등록</button>
        `, 'lg');
    }

    function onResidualInCarChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const products = _getResidualProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualInPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onResidualInPartChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const products = _getResidualProducts().filter(p => (!carModel || p.carModel === carModel) && (!partName || p.partName === partName));
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function saveResidualInput() {
        const date = (document.getElementById('lwResidualInDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualInColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualInQty') || {}).value || '0', 10);
        const note = (document.getElementById('lwResidualInNote') || {}).value.trim() || '수기 잔량입고';
        const prod = _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName && (!color || p.color === color))
            || _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName);
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 잔량 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, note, packUnit, isManual: true, isResidualManualIn: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 잔량 수기 등록 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function openResidualOut() {
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 잔량 수동출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);">
                잔량 재고를 수동으로 출고 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualOutCarModel" onchange="LaserWipModule.onResidualOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualOutPartName" onchange="LaserWipModule.onResidualOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwResidualOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualOutNote" placeholder="수기 잔량출고">
                </div>
            </div>
            <div id="lwResidualOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);" onclick="LaserWipModule.saveResidualOut()">출고 등록</button>
        `, 'lg');
    }

    function onResidualOutCarChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualOutPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        const info = document.getElementById('lwResidualOutStockInfo');
        if (info) info.textContent = '';
    }

    function onResidualOutPartChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
        const match = rows.find(r => r.partName === partName);
        const info = document.getElementById('lwResidualOutStockInfo');
        if (info && match) info.innerHTML = `현재 잔량 재고 <strong style="color:var(--accent-orange);">${UIUtils.formatNumber(match.residualQty)} EA</strong>`;
    }

    async function saveResidualOut() {
        const date = (document.getElementById('lwResidualOutDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualOutColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualOutQty') || {}).value || '0', 10);
        const note = (document.getElementById('lwResidualOutNote') || {}).value.trim() || '수기 잔량출고';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 출고 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const residual = _calcLaserResidualWip().find(r => r.carModel === carModel && r.partName === partName && (!color || r.color === color));
        if (residual && quantity > residual.residualQty) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 잔량(${residual.residualQty})을 초과합니다.`, 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, note, packUnit: residual ? residual.packUnit : 0, isManual: true, isResidualManualOut: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 잔량 출고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function _num(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _laserResidualRow(r) {
        return `<tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:10px 14px;font-weight:600;">${_esc(r.carModel || '-')}</td>
            <td style="padding:10px 14px;">${_esc(r.partName || '-')}</td>
            <td style="padding:10px 14px;">${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${_esc(r.color)}</span>` : '-'}</td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;">${UIUtils.formatNumber(r.goodQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)}</td>
            <td style="padding:10px 14px;text-align:right;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:800;color:var(--accent-orange);">${UIUtils.formatNumber(r.residualQty)}</td>
            <td style="padding:10px 14px;text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:rgba(245,158,11,0.12);color:var(--accent-orange);">
                    <span class="material-symbols-outlined" style="font-size:0.85rem;">move_to_inbox</span> 잔량입고
                </span>
            </td>
        </tr>`;
    }

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _dateTime(dateValue, timeValue) {
        const date = String(dateValue || '').trim();
        const time = String(timeValue || '').trim();
        if (!date && !time) return '';
        const dateMatch = date.match(/\d{4}-\d{2}-\d{2}/);
        const timeMatch = (date.match(/[ T](\d{2}:\d{2})/) || time.match(/(\d{2}:\d{2})/));
        return [dateMatch ? dateMatch[0] : date, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' ');
    }

    function _uniqueList(values) {
        return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
    }

    function _listCell(values) {
        const list = _uniqueList(values);
        if (!list.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
            ${list.slice(0, 3).map(v => `<span style="font-size:0.74rem;color:var(--text-secondary);white-space:nowrap;">${_esc(v)}</span>`).join('')}
            ${list.length > 3 ? `<span style="font-size:0.7rem;color:var(--text-muted);">+${list.length - 3}</span>` : ''}
        </div>`;
    }

    function _afterLaserRow(r) {
        const wip = r.wip;
        const wipColor = wip > 0 ? 'var(--accent-green)' : (wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
        let statusBadge;
        if (wip > 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.12);color:var(--accent-green);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">hourglass_empty</span> 도장 투입 대기
            </span>`;
        } else if (wip < 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.12);color:var(--accent-red);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">error</span> 수량 오류
            </span>`;
        } else {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:var(--bg-secondary);color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">check_circle</span> 소진완료
            </span>`;
        }
        const rowBg = wip > 0 ? '' : (wip < 0 ? 'background:rgba(239,68,68,0.04);' : 'background:var(--bg-secondary);opacity:0.7;');
        return `<tr style="border-bottom:1px solid var(--border-color);${rowBg}"
                    onmouseover="this.style.background='rgba(66,133,244,0.05)'"
                    onmouseout="this.style.background='${wip > 0 ? '' : (wip < 0 ? 'rgba(239,68,68,0.04)' : 'var(--bg-secondary)')}'">
            <td style="padding:10px 14px;font-weight:600;">${r.carModel || '-'}</td>
            <td style="padding:10px 14px;">${r.partName || '-'}</td>
            <td style="padding:10px 14px;">
                ${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${r.color}</span>` : '-'}
            </td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-purple);">${UIUtils.formatNumber(r.laserQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-blue);">${UIUtils.formatNumber(r.paintBQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:700;color:${wipColor};">${UIUtils.formatNumber(wip)}</td>
            <td style="padding:10px 14px;text-align:center;">${statusBadge}</td>
        </tr>`;
    }

    // ── 공정명 정규화 ────────────────────────────────────────────────────
    function _normProc(v) {
        const s = (v || '').trim();
        if (/^도장.?A$/i.test(s)) return '도장-A';
        if (/^도장.?B$/i.test(s)) return '도장-B';
        if (/^레이[져저]$/i.test(s)) return '레이져';
        return s;
    }

    // ── 레이져 직후 공정이 도장(A/B)인 제품 맵 구성 ─────────────────────
    // 반환: { 'carModel||partName': '도장-A' | '도장-B' }
    function _buildAfterLaserDrainMap() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const map = {};
        products.forEach(p => {
            const seq = ['process1','process2','process3','process4']
                .map(k => _normProc(p[k] || '')).filter(Boolean);
            const idxLaser = seq.findIndex(v => v === '레이져');
            if (idxLaser < 0 || idxLaser === seq.length - 1) return;
            const next = seq[idxLaser + 1];
            if (next === '도장-A' || next === '도장-B') {
                map[`${p.carModel||''}||${p.partName||''}`] = next;
            }
        });
        return map;
    }

    // ── 레이져 후 WIP 계산 ────────────────────────────────────────────────
    function _calcWip() {
        const laserWorks   = Storage.getAll(STORE_LASER) || [];
        const paintWorks   = Storage.getAll(STORE_PAINT) || [];
        const drainMap     = _buildAfterLaserDrainMap();
        const laserMap     = {};

        laserWorks.forEach(w => {
            const prodKey = `${w.carModel||''}||${w.partName||''}`;
            if (!drainMap[prodKey]) return; // 레이져→도장 구조 아닌 제품 제외
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) laserMap[key] = {
                carModel: w.carModel||'', partName: w.partName||'', color: w.color||'',
                laserQty: 0, paintBQty: 0, drainLine: drainMap[prodKey],
                laserDates: [], paintDates: [], injectionLots: []
            };
            if (w.isManualOut) {
                laserMap[key].paintBQty += Number(w.quantity) || 0;
            } else {
                laserMap[key].laserQty  += Number(w.quantity) || 0;
                laserMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
                    w.paintLots.forEach(lot => {
                        laserMap[key].paintDates.push(lot && lot.paintDate ? lot.paintDate : '');
                        laserMap[key].injectionLots.push(lot && lot.lotNo ? lot.lotNo : '');
                    });
                } else {
                    laserMap[key].paintDates.push(w.paintDate || '');
                    laserMap[key].injectionLots.push(w.paintLot || w.lotNo || '');
                }
            }
        });

        paintWorks.forEach(w => {
            const prodKey   = `${w.carModel||''}||${w.partName||''}`;
            const drainLine = drainMap[prodKey];
            if (!drainLine) return;
            if ((w.line||'').trim() !== drainLine) return; // 해당 제품의 drain 공정과 일치하는 것만
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) return;
            laserMap[key].paintBQty += Number(w.productionQty) || 0;
        });

        return Object.values(laserMap)
            .map(r => ({ ...r, wip: r.laserQty - r.paintBQty }))
            .filter(r => r.laserQty > 0)
            .sort((a, b) => {
                const cm = (a.carModel||'').localeCompare(b.carModel||'');
                return cm !== 0 ? cm : (a.partName||'').localeCompare(b.partName||'');
            });
    }

    // ── 외부 공개 API ─────────────────────────────────────────────────────

    /**
     * 차종+품명+컬러 기준 레이져 후 재공 재고 조회
     * production-plan.js 도장-B 모달에서 호출용
     */
    function getWipStock(carModel, partName) {
        // 도장 컬러와 무관하게 차종+품명 기준으로 합산
        return _calcWip()
            .filter(r => {
                const cmOk = !carModel || r.carModel === carModel;
                const pnOk = !partName || r.partName === partName;
                return cmOk && pnOk;
            })
            .reduce((s, r) => s + Math.max(0, r.wip), 0);
    }

    function refresh() {
        _renderTabContent();
        UIUtils.toast('재공품 현황을 새로고침했습니다.', 'info');
    }

    function openManualInput() {
        if (typeof LaserStandbyModule === 'undefined' || typeof LaserStandbyModule.openAdjustModal !== 'function') {
            UIUtils.toast('레이저 대기 재공품 추가 화면을 열 수 없습니다.', 'warning');
            return;
        }
        LaserStandbyModule.openAdjustModal('', true);
    }

    // ── 레이져 후 재공품 수기 등록 ──────────────────────────────────────

    function _getPaintBProducts() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => {
            const seq = ['process1','process2','process3','process4']
                .map(k => _normProc(p[k]||'')).filter(Boolean);
            const idx = seq.findIndex(v => v === '레이져');
            if (idx < 0 || idx === seq.length - 1) return false;
            const next = seq[idx + 1];
            return next === '도장-A' || next === '도장-B';
        });
    }

    function openAfterLaserInput() {
        const products  = _getPaintBProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 수기 등록', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">info</span>
                레이져 완료 수량을 수기로 등록합니다. 도장-B 공정이 있는 제품만 선택 가능합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwAfterDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwAfterCarModel" onchange="LaserWipModule.onAfterCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwAfterPartName" onchange="LaserWipModule.onAfterPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwAfterColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAfterQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwAfterNote" placeholder="수기등록">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAfterLaserInput()">등록</button>
        `, 'lg');
    }

    function onAfterCarChange() {
        const carModel  = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const products  = _getPaintBProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwAfterColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onAfterPartChange() {
        const carModel = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const products = _getPaintBProducts().filter(p =>
            (!carModel || p.carModel === carModel) && (!partName || p.partName === partName)
        );
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function saveAfterLaserInput() {
        const date     = (document.getElementById('lwAfterDate')     || {}).value || '';
        const carModel = (document.getElementById('lwAfterCarModel') || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const color    = (document.getElementById('lwAfterColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwAfterQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwAfterNote')     || {}).value.trim() || '수기등록';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, machine: '', note, isManual: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 수기 등록 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    // ── 레이져 후 재공품 출고 ───────────────────────────────────────────

    function openAfterLaserOut() {
        const rows      = _calcWip().filter(r => r.wip > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);display:flex;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:1rem;flex-shrink:0;">arrow_upward</span>
                레이져 완료 재공품을 도장-B 투입 전에 수동으로 출고 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwOutCarModel" onchange="LaserWipModule.onOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwOutPartName" onchange="LaserWipModule.onOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwOutNote" placeholder="수기 출고">
                </div>
            </div>
            <div id="lwOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);"
                onclick="LaserWipModule.saveAfterLaserOut()">출고 등록</button>
        `, 'lg');
    }

    function onOutCarChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwOutColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        const info = document.getElementById('lwOutStockInfo');
        if (info) info.textContent = '';
    }

    function onOutPartChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors   = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
        const match = rows.find(r => r.partName === partName);
        const info  = document.getElementById('lwOutStockInfo');
        if (info && match) info.innerHTML = `현재 재공품: <strong style="color:var(--accent-purple);">${UIUtils.formatNumber(match.wip)} EA</strong>`;
    }

    async function saveAfterLaserOut() {
        const date     = (document.getElementById('lwOutDate')     || {}).value || '';
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const color    = (document.getElementById('lwOutColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwOutQty')  || {}).value || '0', 10);
        const note     = (document.getElementById('lwOutNote')     || {}).value.trim() || '수기 출고';

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName && (!color || r.color === color));
        if (wip && quantity > wip.wip) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 재공품(${wip.wip})을 초과합니다.`, 'warning');
            return;
        }

        await Storage.add(STORE_LASER, { date, carModel, partName, color, quantity, machine: '', note, isManual: true, isManualOut: true });
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 출고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function init(container) {
        render(container);
    }

    function _activeTabId() { return _activeTab; }

    // 레이져 후 다음 공정이 도장(A/B)인 제품 여부 — laser.js에서 출하대기 유입 차단용
    function isAfterLaserDrainProduct(carModel, partName) {
        return !!_buildAfterLaserDrainMap()[`${carModel||''}||${partName||''}`];
    }

    return { init, render, refresh, switchTab, openTab, _activeTabId, isAfterLaserDrainProduct, openManualInput,
             openAfterLaserInput, onAfterCarChange, onAfterPartChange, saveAfterLaserInput,
             openAfterLaserOut, onOutCarChange, onOutPartChange, saveAfterLaserOut,
             openResidualInput, onResidualInCarChange, onResidualInPartChange, saveResidualInput,
             openResidualOut, onResidualOutCarChange, onResidualOutPartChange, saveResidualOut,
             getWipStock, _calcWip };
})();
