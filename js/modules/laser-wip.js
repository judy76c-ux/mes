/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기, 도장-B 공정 제품만)
 */

var LaserWipModule = (function() {
    const STORE_LASER = DB.STORES.LASER_WORK_LOG;
    const STORE_PAINT = DB.STORES.PAINTING_WORK;

    let _activeTab = 'standby'; // 'standby' | 'after-laser'

    const TABS = [
        { id: 'standby',     label: '레이져 대기품 현황',    icon: 'hourglass_top' },
        { id: 'after-laser', label: '레이져 후 재공품 현황', icon: 'bolt' }
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
            ${_actionBtn('입고', 'arrow_downward', "LaserWipModule.openManualInput()", 'var(--accent-green)')}
            ${_actionBtn('출고', 'arrow_upward',   "LaserStandbyModule.openStandbyOutModal()", 'var(--accent-red)')}
            ${_actionBtn('일괄 등록', 'table_rows', "LaserStandbyModule.openBulkModal()", 'var(--accent-blue)')}`;
        const afterActions = `
            ${_actionBtn('입고', 'arrow_downward', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
            ${_actionBtn('출고', 'arrow_upward',   "LaserWipModule.openAfterLaserOut()", 'var(--accent-red)')}`;
        return `
        <div style="margin-bottom:18px;">
            <div style="display:flex;gap:8px;margin-bottom:10px;">
                ${TABS.map(t => `
                    <button type="button" id="wipTab-${t.id}"
                        onclick="LaserWipModule.switchTab('${t.id}')"
                        class="btn ${_activeTab === t.id ? 'btn-primary' : 'btn-outline'}"
                        style="display:flex;align-items:center;gap:6px;${_activeTab === t.id ? '' : 'background:#fff;'}">
                        <span class="material-symbols-outlined" style="font-size:18px;">${t.icon}</span>
                        ${t.label}
                    </button>`).join('')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                ${_activeTab === 'standby' ? standbyActions : afterActions}
            </div>
        </div>`;
    }

    // ── 페이지 전체 렌더 ──────────────────────────────────────────────────
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
        _activeTab = tab === 'after-laser' ? 'after-laser' : 'standby';
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
        } else {
            _renderAfterLaserTab(el);
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
        const rows    = _calcWip();
        // 섹션 헤더를 포함해 렌더
        const _sectionHeader = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;
                        background:rgba(139,92,246,0.07);border-left:3px solid var(--accent-purple);border-radius:0 8px 8px 0;">
                <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-purple);">bolt</span>
                <div>
                    <div style="font-size:0.92rem;font-weight:700;color:var(--accent-purple);">레이져 후 재공품 현황</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);">레이져 완료 후 도장(A/B) 투입 대기 재공품</div>
                </div>
            </div>`;
        const hasStock = rows.some(r => r.wip > 0);

        el.innerHTML = _sectionHeader + `
            <!-- 요약 카드 -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:20px;">
                ${_summaryCard('레이져 완료',  rows.reduce((s,r)=>s+r.laserQty,0),              'bolt',      'var(--accent-purple)')}
                ${_summaryCard('도장-B 투입',  rows.reduce((s,r)=>s+r.paintBQty,0),             'format_paint','var(--accent-blue)')}
                ${_summaryCard('현재 재공품',  rows.reduce((s,r)=>s+(r.wip>0?r.wip:0),0),      'inventory', hasStock ? 'var(--accent-green)' : 'var(--text-muted)')}
                ${_summaryCard('대기 품종 수', rows.filter(r=>r.wip>0).length,                  'category',  'var(--accent-orange)')}
            </div>

            <p style="margin:0 0 10px;font-size:0.8rem;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">info</span>
                제조공정에서 레이져 직후 다시 <strong>도장(A/B)</strong>으로 이어지는 제품만 표시됩니다.
            </p>

            <!-- 재공품 테이블 -->
            <div style="border-radius:10px;overflow:hidden;border:1px solid var(--border-color);">
                <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
                    <thead>
                        <tr style="background:linear-gradient(180deg,#f1f5f9,#e8ecf1);">
                            <th style="padding:10px 14px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                            <th style="padding:10px 14px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                            <th style="padding:10px 14px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장 컬러</th>
                            <th style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-purple);white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">bolt</span>레이져 완료
                            </th>
                            <th style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-blue);white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">format_paint</span>도장-B 투입
                            </th>
                            <th style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">inventory</span>재공품 현재고
                            </th>
                            <th style="padding:10px 14px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length === 0
                            ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
                                <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">inbox</span>
                                도장-B 공정이 있는 제품의 레이져 작업 이력이 없습니다.
                                <div style="font-size:0.78rem;margin-top:6px;">제품 설정에서 process에 '도장-B'가 등록된 제품의 레이져 작업 등록 시 표시됩니다.</div>
                               </td></tr>`
                            : rows.map(r => _afterLaserRow(r)).join('')
                        }
                    </tbody>
                </table>
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

    function _afterLaserRow(r) {
        const wip = r.wip;
        const wipColor = wip > 0 ? 'var(--accent-green)' : (wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
        let statusBadge;
        if (wip > 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.12);color:var(--accent-green);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">hourglass_empty</span> 대기중
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
                laserQty: 0, paintBQty: 0, drainLine: drainMap[prodKey]
            };
            if (w.isManualOut) {
                laserMap[key].paintBQty += Number(w.quantity) || 0;
            } else {
                laserMap[key].laserQty  += Number(w.quantity) || 0;
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
    function getWipStock(carModel, partName, color) {
        const drainMap  = _buildAfterLaserDrainMap();
        const drainLine = drainMap[`${carModel||''}||${partName||''}`] || '도장-B';
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const _match = w => {
            const cmOk = !carModel || (w.carModel||'') === carModel;
            const pnOk = !partName || (w.partName||'') === partName;
            const clOk = !color    || !w.color || (w.color||'') === color;
            return cmOk && pnOk && clOk;
        };
        const laserQty  = laserWorks.filter(w => !w.isManualOut && _match(w)).reduce((s,w) => s + (Number(w.quantity)||0), 0);
        const manualOut = laserWorks.filter(w =>  w.isManualOut && _match(w)).reduce((s,w) => s + (Number(w.quantity)||0), 0);
        const drainQty  = paintWorks.filter(w => (w.line||'').trim() === drainLine && _match(w))
                                    .reduce((s,w) => s + (Number(w.productionQty)||0), 0);
        return Math.max(0, laserQty - drainQty - manualOut);
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

    return { init, render, refresh, switchTab, openTab, openManualInput,
             openAfterLaserInput, onAfterCarChange, onAfterPartChange, saveAfterLaserInput,
             openAfterLaserOut, onOutCarChange, onOutPartChange, saveAfterLaserOut,
             getWipStock, _calcWip };
})();
