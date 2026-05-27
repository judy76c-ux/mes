/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기, 도장-B 공정 제품만)
 */

var LaserWipModule = (function() {
    const STORE_LASER = DB.STORES.LASER_WORK_LOG;
    const STORE_PAINT = DB.STORES.PAINTING_WORK;

    let _activeTab = 'standby'; // 'standby' | 'after-laser'

    // ── 페이지 전체 렌더 ──────────────────────────────────────────────────
    function render(container) {
        container.innerHTML = `
        <div style="padding:20px;">

            <!-- 페이지 헤더 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px;">
                <div>
                    <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-blue);">inventory</span>
                        재공품 현황
                    </h3>
                    <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-secondary);">
                        도장 공정 전·후 재공품 재고를 한 곳에서 확인합니다.
                    </p>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" style="display:flex;align-items:center;gap:4px;font-size:0.85rem;"
                        onclick="LaserWipModule.refresh()">
                        <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span> 새로고침
                    </button>
                </div>
            </div>

            <!-- 탭 버튼 -->
            <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border-color);">
                <button id="wipTab-standby"
                    onclick="LaserWipModule.switchTab('standby')"
                    style="padding:9px 20px;font-size:0.88rem;font-weight:600;border:none;border-bottom:3px solid transparent;
                           background:none;cursor:pointer;display:flex;align-items:center;gap:6px;
                           color:${_activeTab==='standby'?'var(--accent-blue)':'var(--text-secondary)'};
                           border-bottom-color:${_activeTab==='standby'?'var(--accent-blue)':'transparent'};
                           margin-bottom:-2px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">hourglass_top</span>
                    레이져 대기품 현황
                </button>
                <button id="wipTab-after-laser"
                    onclick="LaserWipModule.switchTab('after-laser')"
                    style="padding:9px 20px;font-size:0.88rem;font-weight:600;border:none;border-bottom:3px solid transparent;
                           background:none;cursor:pointer;display:flex;align-items:center;gap:6px;
                           color:${_activeTab==='after-laser'?'var(--accent-purple)':'var(--text-secondary)'};
                           border-bottom-color:${_activeTab==='after-laser'?'var(--accent-purple)':'transparent'};
                           margin-bottom:-2px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">bolt</span>
                    레이져 후 재공품 현황
                </button>
            </div>

            <!-- 탭 컨텐츠 -->
            <div id="wipTabContent"></div>
        </div>`;

        _renderTabContent();
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;

        // 탭 버튼 스타일 업데이트
        const tabs = {
            'standby':     { color: 'var(--accent-blue)',   el: 'wipTab-standby' },
            'after-laser': { color: 'var(--accent-purple)', el: 'wipTab-after-laser' }
        };
        Object.entries(tabs).forEach(([id, t]) => {
            const btn = document.getElementById(t.el);
            if (!btn) return;
            const isActive = id === tab;
            btn.style.color            = isActive ? t.color : 'var(--text-secondary)';
            btn.style.borderBottomColor = isActive ? t.color : 'transparent';
        });

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
    // LaserStandbyModule.renderContentOnly()에 위임
    function _renderStandbyTab(el) {
        // 레이아웃 보기 버튼 포함 헤더 영역
        el.innerHTML = `
            <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
                <button class="btn btn-secondary" style="font-size:0.85rem;display:flex;align-items:center;gap:4px;"
                    onclick="Router.navigate('laser-layout')">
                    <span class="material-symbols-outlined" style="font-size:1rem;">map</span> 레이아웃 보기
                </button>
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
        const hasStock = rows.some(r => r.wip > 0);

        el.innerHTML = `
            <!-- 요약 카드 -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:20px;">
                ${_summaryCard('레이져 완료',  rows.reduce((s,r)=>s+r.laserQty,0),              'bolt',      'var(--accent-purple)')}
                ${_summaryCard('도장-B 투입',  rows.reduce((s,r)=>s+r.paintBQty,0),             'format_paint','var(--accent-blue)')}
                ${_summaryCard('현재 재공품',  rows.reduce((s,r)=>s+(r.wip>0?r.wip:0),0),      'inventory', hasStock ? 'var(--accent-green)' : 'var(--text-muted)')}
                ${_summaryCard('대기 품종 수', rows.filter(r=>r.wip>0).length,                  'category',  'var(--accent-orange)')}
            </div>

            <p style="margin:0 0 10px;font-size:0.8rem;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">info</span>
                도장-A → 레이져 → <strong>도장-B</strong> 공정 제품만 표시됩니다. 레이져 후 출하검사 진행 제품은 제외.
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

    // ── 도장-B 공정 제품 Set 구성 ─────────────────────────────────────────
    function _buildPaintBProductSet() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const set = new Set();
        products.forEach(p => {
            const hasPaintB = ['process1','process2','process3','process4']
                .some(k => (p[k]||'').trim() === '도장-B');
            if (hasPaintB) set.add(`${p.carModel||''}||${p.partName||''}`);
        });
        return set;
    }

    // ── 레이져 후 WIP 계산 ────────────────────────────────────────────────
    function _calcWip() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const paintBSet  = _buildPaintBProductSet();
        const laserMap   = {};

        laserWorks.forEach(w => {
            const prodKey = `${w.carModel||''}||${w.partName||''}`;
            if (!paintBSet.has(prodKey)) return; // 도장-B 없는 제품 제외
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) laserMap[key] = { carModel: w.carModel||'', partName: w.partName||'', color: w.color||'', laserQty: 0, paintBQty: 0 };
            laserMap[key].laserQty += Number(w.quantity) || 0;
        });

        paintWorks.filter(w => (w.line||'').trim() === '도장-B').forEach(w => {
            const key = `${w.carModel||''}||${w.partName||''}||${w.color||''}`;
            if (!laserMap[key]) laserMap[key] = { carModel: w.carModel||'', partName: w.partName||'', color: w.color||'', laserQty: 0, paintBQty: 0 };
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
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const _match = w => {
            const cmOk = !carModel || (w.carModel||'') === carModel;
            const pnOk = !partName || (w.partName||'') === partName;
            const clOk = !color    || !w.color || (w.color||'') === color;
            return cmOk && pnOk && clOk;
        };
        const laserQty  = laserWorks.filter(_match).reduce((s,w) => s + (Number(w.quantity)||0), 0);
        const paintBQty = paintWorks.filter(w => (w.line||'').trim()==='도장-B' && _match(w))
                                    .reduce((s,w) => s + (Number(w.productionQty)||0), 0);
        return Math.max(0, laserQty - paintBQty);
    }

    function refresh() {
        _renderTabContent();
        UIUtils.toast('재공품 현황을 새로고침했습니다.', 'info');
    }

    function init(container) {
        render(container);
    }

    return { init, render, refresh, switchTab, getWipStock, _calcWip };
})();
