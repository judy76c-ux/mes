/**
 * 레이져 공정 메인 / 소메뉴 허브
 * - 레이져 작업일지
 * - 외관 검사 일지
 * - 레이져 지그대장
 * - 지그 세척일지
 * - 레이져대기품현황
 * - 레이져 장비 점검/수리 내역
 */

var LaserProcessUI = (function () {
    const MENUS = [
        { id: 'laser-process',     label: '메인',              subtitle: '공정 현황 대시보드',  icon: 'dashboard',     accent: '#2563eb' },
        { id: 'laser-work',        label: '레이져 작업일지',   subtitle: '작업 실적 기록',       icon: 'history',       accent: '#10b981' },
        { id: 'laser-inspection',  label: '외관 검사 일지',    subtitle: '검사 대기·결과 관리',  icon: 'fact_check',    accent: '#f59e0b', onclick: "LaserInspectionModule.showInspectionPage()" },
        { id: 'laser-wip-standby', label: '레이져 대기품',     subtitle: '도장 완료 후 대기',    icon: 'hourglass_top', accent: '#f97316', onclick: "LaserWipModule.openTab('standby')" },
        { id: 'laser-wip-after',   label: '레이져 후 재공품',  subtitle: '레이져 완료 재공품',   icon: 'bolt',          accent: '#8b5cf6', onclick: "LaserWipModule.openTab('after-laser')" },
        { id: 'laser-wip-residual',label: '레이져 잔량',       subtitle: '포장 미만 잔량',       icon: 'inventory_2',   accent: '#06b6d4', onclick: "LaserWipModule.openTab('after-laser-residual')" },
        { id: 'laser-jig-master',  label: '레이져 지그대장',   subtitle: '지그 기본 정보',       icon: 'view_list',     accent: '#ef4444' },
    ];

    const JIG_SUB_MENUS = [
        { id: 'laser-jig-master',   label: '레이져 지그대장', icon: 'view_list' },
        { id: 'laser-jig-disposal', label: '폐기 대장',       icon: 'delete_sweep' },
        { id: 'laser-jig-cleaning', label: '지그 세척일지',   icon: 'cleaning_services' }
    ];

    function renderJigSubNav(activePage, extraHtml) {
        return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
            ${JIG_SUB_MENUS.map(function(m) {
                const active = m.id === activePage;
                return `<button type="button" onclick="Router.navigate('${m.id}')"
                    class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}"
                    style="display:flex;align-items:center;gap:6px;${active ? '' : 'background:#fff;'}">
                    <span class="material-symbols-outlined" style="font-size:16px;">${m.icon}</span>${m.label}
                </button>`;
            }).join('')}
            ${extraHtml ? `<div style="margin-left:auto;">${extraHtml}</div>` : ''}
        </div>`;
    }

    function backBtn() {
        return '<button type="button" onclick="Router.navigate(\'laser-process\')"' +
            ' style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;' +
            'border:none;background:none;cursor:pointer;font-size:0.85rem;' +
            'color:var(--text-muted);border-radius:8px;transition:background 0.15s;margin-bottom:10px;"' +
            ' onmouseover="this.style.background=\'var(--bg-secondary)\'"' +
            ' onmouseout="this.style.background=\'none\'">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">arrow_back</span>' +
            '레이져 공정으로 돌아가기</button>';
    }

    function renderSection(activePage, _title, _desc, actionsHtml) {
        const items = MENUS.map(function (menu) {
            let active = menu.id === activePage;
            if (!active && menu.id.startsWith('laser-wip-') && activePage.startsWith('laser-wip-')) {
                try {
                    const tab = LaserWipModule._activeTabId ? LaserWipModule._activeTabId() : '';
                    if (menu.id === 'laser-wip-standby'  && tab === 'standby')              active = true;
                    if (menu.id === 'laser-wip-after'    && tab === 'after-laser')          active = true;
                    if (menu.id === 'laser-wip-residual' && tab === 'after-laser-residual') active = true;
                } catch(e) {}
            }
            const onClick = menu.onclick || "Router.navigate('" + menu.id + "')";
            return { label: menu.label, icon: menu.icon, subtitle: menu.subtitle, accent: menu.accent, active: active, onClick: onClick };
        });
        return '<div class="mes-apple-menu-hero" style="margin-bottom:' + (actionsHtml ? '8px' : '16px') + ';">' +
            ProdAppleMenu.strip(items) +
            '</div>' +
            (actionsHtml ? '<div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px;">' + actionsHtml + '</div>' : '');
    }

    return {
        backBtn: backBtn,
        renderSection: renderSection,
        renderJigSubNav: renderJigSubNav
    };
})();

var LaserHubModule = (function () {
    const JIG_KEY = 'laser_jig_master_v2';
    const DISPOSAL_KEY = 'laser_jig_disposal_v1';
    const CLEAN_KEY = 'laser_jig_cleaning_v1';
    const EQUIP_KEY = 'laser_equipment_history_v1';

    function _today() {
        return (typeof UIUtils !== 'undefined' && UIUtils.today)
            ? UIUtils.today()
            : new Date().toISOString().slice(0, 10);
    }

    function _fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }

    function _numValue(value) {
        const n = Number(String(value == null ? '' : value).replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _loadList(key) {
        try {
            const rows = await Storage.getConfigValue(key);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserHub] config load failed:', key, e);
            return [];
        }
    }

    async function _saveList(key, rows) {
        await Storage.setConfigValue(key, Array.isArray(rows) ? rows : []);
    }

    // ── 대시보드 KPI 카드 ────────────────────────────────────────────────
    function _kpiCard(icon, color, bgColor, label, value, sub) {
        return `
            <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:18px 20px;
                        box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <span class="material-symbols-outlined"
                        style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;
                               justify-content:center;background:${bgColor};color:${color};font-size:20px;">${icon}</span>
                    <span style="font-size:0.76rem;font-weight:700;color:var(--text-muted);">${label}</span>
                </div>
                <div style="font-size:1.55rem;font-weight:800;color:var(--text-primary);line-height:1.2;">${value}</div>
                <div style="font-size:0.73rem;color:var(--text-muted);margin-top:4px;">${sub}</div>
            </div>`;
    }

    function _wipCard(icon, color, label, qty, sub, onClick) {
        return `
            <button type="button" onclick="${onClick}"
                onmouseenter="this.style.boxShadow='0 6px 16px rgba(0,0,0,0.10)';this.style.transform='translateY(-1px)';"
                onmouseleave="this.style.boxShadow='none';this.style.transform='';"
                style="text-align:left;background:#fff;border:1px solid #e2e8f0;border-top:3px solid ${color};
                       border-radius:12px;padding:14px 14px 12px;cursor:pointer;transition:all 0.15s;width:100%;">
                <span class="material-symbols-outlined" style="font-size:20px;color:${color};margin-bottom:8px;display:block;">${icon}</span>
                <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${qty}</div>
                <div style="font-size:0.72rem;font-weight:700;color:${color};margin-top:3px;">${label}</div>
                <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">${sub}</div>
            </button>`;
    }

    function _issueCard(severity, icon, label, desc, onClick) {
        const C = severity === 'critical'
            ? { bg:'#fef2f2', border:'#ef4444', icon:'#ef4444', text:'#b91c1c' }
            : severity === 'warning'
            ? { bg:'#fffbeb', border:'#f59e0b', icon:'#d97706', text:'#92400e' }
            : { bg:'#f0fdf4', border:'#10b981', icon:'#10b981', text:'#065f46' };
        const clickAttr = onClick
            ? `onclick="${onClick}" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'" style="cursor:pointer;"`
            : '';
        return `
            <div ${clickAttr}
                style="padding:10px 12px;border-radius:10px;background:${C.bg};border-left:3px solid ${C.border};
                       display:flex;align-items:center;gap:10px;${onClick ? 'cursor:pointer;' : ''}">
                <span class="material-symbols-outlined" style="font-size:20px;color:${C.icon};flex-shrink:0;">${icon}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.82rem;font-weight:800;color:${C.text};">${label}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">${desc}</div>
                </div>
                ${onClick ? `<span class="material-symbols-outlined" style="font-size:16px;color:${C.icon};flex-shrink:0;">chevron_right</span>` : ''}
            </div>`;
    }

    function _shortcutBtn(icon, color, label, onClick) {
        return `
            <button type="button" onclick="${onClick}"
                onmouseover="this.style.background='#f8fafc'"
                onmouseout="this.style.background='#fff'"
                style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;
                       border-radius:8px;background:#fff;cursor:pointer;width:100%;font-size:0.84rem;
                       font-weight:700;color:var(--text-primary);transition:background 0.15s;font-family:inherit;text-align:left;">
                <span class="material-symbols-outlined" style="font-size:18px;color:${color};">${icon}</span>
                ${label}
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-muted);margin-left:auto;">chevron_right</span>
            </button>`;
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-process')}
                <div id="laserDashKpi" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;"></div>
                <div id="laserDashMain" style="display:grid;grid-template-columns:1fr 340px;gap:16px;"></div>
            </div>`;

        // ── 데이터 수집 ────────────────────────────────────────────────────
        const today    = _today();
        const thisMonth = today.slice(0, 7);
        const works     = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const insps     = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const paintWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const equipRows = await _loadList(EQUIP_KEY);
        const cleanRows = await _loadList(CLEAN_KEY);

        // ── 금일 KPI ──────────────────────────────────────────────────────
        const todayWorks = works.filter(function(w) { return String(w.date || '').slice(0,10) === today; });
        const todayInsps = insps.filter(function(i) { return String(i.date || '').slice(0,10) === today; });
        const inspectedIds = new Set(todayInsps.map(function(i) { return i.workLogId; }).filter(Boolean));

        const workQtyToday   = todayWorks.reduce(function(s,w){ return s + (Number(w.quantity)||0); }, 0);
        const inspQtyToday   = todayInsps.reduce(function(s,i){ return s + (Number(i.inspQty)||0); }, 0);
        const defectQtyToday = todayInsps.reduce(function(s,i){ return s + (Number(i.failQty)||0); }, 0);
        const defectRate     = inspQtyToday > 0 ? (defectQtyToday / inspQtyToday * 100).toFixed(1) : '0.0';
        const qcMissing      = todayWorks.filter(function(w){ return !(w.qcFirst && w.qcMiddle && w.qcLast); }).length;
        const waitInsp       = todayWorks.filter(function(w){ return w.id && !inspectedIds.has(w.id); }).length;

        // ── 7일 추이 ──────────────────────────────────────────────────────
        var trend7 = [];
        for (var i = 6; i >= 0; i--) {
            var d = new Date(); d.setDate(d.getDate() - i);
            var ds = d.toISOString().slice(0, 10);
            var dw = works.filter(function(w){ return String(w.date||'').slice(0,10) === ds; });
            var di = insps.filter(function(ii){ return String(ii.date||'').slice(0,10) === ds; });
            var wq = dw.reduce(function(s,w){ return s+(Number(w.quantity)||0); }, 0);
            var iq = di.reduce(function(s,ii){ return s+(Number(ii.inspQty)||0); }, 0);
            var fq = di.reduce(function(s,ii){ return s+(Number(ii.failQty)||0); }, 0);
            trend7.push({ date: ds, wq: wq, iq: iq, fq: fq,
                rate: iq > 0 ? (fq/iq*100).toFixed(1) : '-',
                isToday: ds === today });
        }
        var maxWq = Math.max.apply(null, [1].concat(trend7.map(function(r){ return r.wq; })));

        // ── 장비 이슈 ─────────────────────────────────────────────────────
        var equipOpen = equipRows.filter(function(r){ return String(r.status||'') === '진행중'; });
        var cleanThisMonth = cleanRows.filter(function(r){ return String(r.date||'').slice(0,7) === thisMonth; }).length;

        // ── 재공품 대기 근사값 ────────────────────────────────────────────
        var paintMap = {}, laserMap = {};
        paintWorks.forEach(function(w){
            var key = (w.carModel||'') + '||' + (w.partName||'') + '||' + (w.color||'');
            paintMap[key] = (paintMap[key]||0) + (Number(w.productionQty)||0);
        });
        works.filter(function(w){ return !w.isManualOut; }).forEach(function(w){
            var key = (w.carModel||'') + '||' + (w.partName||'') + '||' + (w.color||'');
            laserMap[key] = (laserMap[key]||0) + (Number(w.quantity)||0);
        });
        var standbyCount = 0, standbyQty = 0;
        Object.keys(paintMap).forEach(function(key){
            var lq = laserMap[key] || 0;
            if (paintMap[key] > lq) { standbyCount++; standbyQty += paintMap[key] - lq; }
        });

        // ── KPI 렌더 ──────────────────────────────────────────────────────
        var kpiEl = document.getElementById('laserDashKpi');
        if (kpiEl) {
            kpiEl.innerHTML = [
                _kpiCard('bolt', '#2563eb', '#eff6ff', '금일 작업량', _fmt(workQtyToday) + ' EA', todayWorks.length + '건 작업'),
                _kpiCard('fact_check', '#10b981', '#ecfdf5', '금일 검사량', _fmt(inspQtyToday) + ' EA', todayInsps.length + '건 검사'),
                _kpiCard('report_problem',
                    defectQtyToday > 0 ? '#ef4444' : '#64748b',
                    defectQtyToday > 0 ? '#fef2f2' : '#f8fafc',
                    '금일 불량', _fmt(defectQtyToday) + ' EA', '불량률 ' + defectRate + '%'),
                _kpiCard('edit_note',
                    qcMissing > 0 ? '#f59e0b' : '#64748b',
                    qcMissing > 0 ? '#fffbeb' : '#f8fafc',
                    '초중종물 누락', qcMissing + '건', '검사 대기 ' + waitInsp + '건')
            ].join('');
        }

        // ── 메인 대시보드 렌더 ────────────────────────────────────────────
        var mainEl = document.getElementById('laserDashMain');
        if (!mainEl) return;

        var trendRows = trend7.map(function(r) {
            var barW = Math.round(r.wq / maxWq * 100);
            var dayLabel = new Date(r.date + 'T00:00:00').toLocaleDateString('ko-KR', {month:'numeric', day:'numeric', weekday:'short'});
            var rowBg   = r.isToday ? 'background:#eff6ff;' : '';
            var dateSt  = r.isToday ? 'font-weight:800;color:#2563eb;' : 'color:var(--text-primary);';
            var defSt   = r.fq > 0 ? 'color:#ef4444;font-weight:700;' : 'color:var(--text-muted);';
            return '<tr style="border-bottom:1px solid #e2e8f0;' + rowBg + '">' +
                '<td style="padding:9px 12px;font-size:0.82rem;' + dateSt + 'white-space:nowrap;">' +
                    dayLabel + (r.isToday ? ' <span style="font-size:0.62rem;background:#2563eb;color:#fff;border-radius:4px;padding:1px 4px;vertical-align:middle;">오늘</span>' : '') +
                '</td>' +
                '<td style="padding:9px 12px;text-align:right;font-size:0.84rem;font-weight:700;color:var(--text-primary);">' +
                    (r.wq > 0 ? _fmt(r.wq) : '<span style="color:var(--text-muted);">-</span>') + '</td>' +
                '<td style="padding:9px 12px;text-align:right;font-size:0.84rem;font-weight:700;color:#10b981;">' +
                    (r.iq > 0 ? _fmt(r.iq) : '<span style="color:var(--text-muted);">-</span>') + '</td>' +
                '<td style="padding:9px 12px;text-align:right;font-size:0.84rem;' + defSt + '">' +
                    (r.fq > 0 ? _fmt(r.fq) : '-') + '</td>' +
                '<td style="padding:9px 12px;text-align:right;font-size:0.8rem;' + (r.fq>0?'color:#ef4444;font-weight:700;':'color:var(--text-muted);') + '">' +
                    (r.rate !== '-' ? r.rate + '%' : '-') + '</td>' +
                '<td style="padding:9px 12px;">' +
                    '<div style="background:#e2e8f0;border-radius:999px;height:8px;overflow:hidden;">' +
                        '<div style="height:100%;border-radius:999px;background:' + (r.wq>0?'#2563eb':'transparent') + ';width:' + barW + '%;"></div>' +
                    '</div></td>' +
            '</tr>';
        }).join('');

        var equipIssueDesc = equipOpen.length > 0
            ? equipOpen.length + '건 진행중' + (equipOpen[0] && equipOpen[0].equipmentName ? ': ' + _esc(equipOpen[0].equipmentName) : '')
            : '진행중인 이슈 없음';

        mainEl.innerHTML = `
            <!-- 좌측: 공정 현황 -->
            <div>
                <div class="card" style="margin-bottom:14px;">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;">show_chart</span>
                            최근 7일 작업 추이
                        </h4>
                        <span style="font-size:0.76rem;color:var(--text-muted);">${trend7[0].date} ~ ${today}</span>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr style="background:#f8fafc;">
                                    <th style="padding:9px 12px;text-align:left;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;">날짜</th>
                                    <th style="padding:9px 12px;text-align:right;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;">작업량(EA)</th>
                                    <th style="padding:9px 12px;text-align:right;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;">검사량(EA)</th>
                                    <th style="padding:9px 12px;text-align:right;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;">불량(EA)</th>
                                    <th style="padding:9px 12px;text-align:right;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;">불량률</th>
                                    <th style="padding:9px 12px;font-size:0.73rem;font-weight:700;color:var(--text-muted);border-bottom:1px solid #e2e8f0;min-width:120px;">작업량 추이</th>
                                </tr>
                            </thead>
                            <tbody>${trendRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:#f97316;">inventory</span>
                            재공품 현황
                        </h4>
                        <button class="btn btn-sm btn-outline" onclick="LaserWipModule.openTab('standby')">자세히 보기</button>
                    </div>
                    <div class="card-body">
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                            ${_wipCard('hourglass_top','#f97316','레이져 대기품',
                                standbyQty > 0 ? _fmt(standbyQty) + ' EA' : '-',
                                standbyCount > 0 ? standbyCount + '개 품목' : '대기 없음',
                                "LaserWipModule.openTab('standby')")}
                            ${_wipCard('bolt','#8b5cf6','레이져 후 재공품','-','상세 확인',
                                "LaserWipModule.openTab('after-laser')")}
                            ${_wipCard('inventory_2','#06b6d4','레이져 잔량','-','상세 확인',
                                "LaserWipModule.openTab('after-laser-residual')")}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 우측: 문제점·이슈 + 바로가기 -->
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div class="card">
                    <div class="card-header">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:#ef4444;">warning</span>
                            문제점 · 이슈
                        </h4>
                    </div>
                    <div class="card-body" style="display:flex;flex-direction:column;gap:8px;">
                        ${_issueCard(
                            qcMissing > 0 ? 'critical' : 'ok',
                            'edit_note',
                            '초중종물 미작성',
                            qcMissing > 0 ? '오늘 ' + qcMissing + '건 미작성' : '금일 모두 작성됨',
                            qcMissing > 0 ? "Router.navigate('laser-work')" : null
                        )}
                        ${_issueCard(
                            waitInsp > 0 ? 'warning' : 'ok',
                            'fact_check',
                            '검사 대기',
                            waitInsp > 0 ? waitInsp + '건 검사 미완료' : '검사 대기 없음',
                            waitInsp > 0 ? "LaserInspectionModule.showInspectionPage()" : null
                        )}
                        ${_issueCard(
                            defectQtyToday > 0 ? 'warning' : 'ok',
                            'report_problem',
                            '금일 불량 발생',
                            defectQtyToday > 0 ? _fmt(defectQtyToday) + ' EA · 불량률 ' + defectRate + '%' : '금일 불량 없음',
                            defectQtyToday > 0 ? "LaserInspectionModule.showInspectionPage()" : null
                        )}
                        ${_issueCard(
                            equipOpen.length > 0 ? 'critical' : 'ok',
                            'build_circle',
                            '장비 이슈',
                            equipIssueDesc,
                            equipOpen.length > 0 ? "Router.navigate('laser-equipment-history')" : null
                        )}
                        <div style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:2px;">
                            <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:0.5px;text-transform:uppercase;">이달 현황</div>
                            <div style="display:flex;align-items:center;justify-content:space-between;
                                        padding:9px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                                <span style="font-size:0.82rem;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
                                    <span class="material-symbols-outlined" style="font-size:16px;color:#0891b2;">cleaning_services</span>지그 세척
                                </span>
                                <span style="font-size:0.95rem;font-weight:800;color:#0891b2;">${cleanThisMonth}회</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h4 style="margin:0;">바로가기</h4>
                    </div>
                    <div class="card-body" style="display:flex;flex-direction:column;gap:6px;">
                        ${_shortcutBtn('history',    '#10b981', '레이져 작업일지 등록',   "Router.navigate('laser-work')")}
                        ${_shortcutBtn('fact_check', '#f59e0b', '외관 검사 일지',          "LaserInspectionModule.showInspectionPage()")}
                        ${_shortcutBtn('view_list',  '#ef4444', '레이져 지그대장',          "Router.navigate('laser-jig-master')")}
                        ${_shortcutBtn('build_circle','#64748b','장비 점검/수리 내역',     "Router.navigate('laser-equipment-history')")}
                    </div>
                </div>
            </div>
        `;
    }

    return {
        render: render,
        init: render
    };
})();

var LaserJigMasterModule = (function () {
    const CONFIG_KEY = 'laser_jig_master_v2';
    const DISPOSAL_KEY = 'laser_jig_disposal_v1';
    const LEGACY_CONFIG_KEY = 'laser_jig_master_v1';
    let _legacyCleared = false;

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _js(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
    }

    function _fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }

    async function _load() {
        try {
            const rows = await Storage.getConfigValue(CONFIG_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserJigMaster] config load failed:', e);
            return [];
        }
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, Array.isArray(rows) ? rows : []);
    }

    async function _clearLegacyList() {
        if (_legacyCleared) return;
        _legacyCleared = true;
        try {
            await Storage.setConfigValue(LEGACY_CONFIG_KEY, []);
        } catch (e) {
            console.warn('[LaserJigMaster] legacy clear skipped:', e);
        }
    }

    function _hasLaserProcess(product) {
        const text = [
            product.process1, product.process2, product.process3,
            product.process4, product.process5, product.process6,
            product.processFlow, product.route
        ].join(' ');
        return /레이저|레이져|laser/i.test(text);
    }

    function _productKey(product) {
        return [
            String(product.id || '').trim(),
            String(product.carModel || '').trim(),
            String(product.partName || '').trim(),
            String(product.color || product.paintColor || '').trim()
        ].join('||');
    }

    function _laserProducts() {
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(_hasLaserProcess);
        const seen = new Set();
        return products.filter(function (product) {
            const carModel = String(product.carModel || '').trim();
            const partName = String(product.partName || '').trim();
            if (!carModel && !partName) return false;
            const key = _productKey(product);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort(function (a, b) {
            return String(a.carModel || '').localeCompare(String(b.carModel || ''), 'ko') ||
                   String(a.partName || '').localeCompare(String(b.partName || ''), 'ko') ||
                   String(a.color || a.paintColor || '').localeCompare(String(b.color || b.paintColor || ''), 'ko');
        });
    }

    function _selectedProducts(row) {
        return Array.isArray(row && row.products) ? row.products : [];
    }

    // 숫자만 추출해 "YYYY년 MM월 DD일" 형식으로 반환
    function _formatKoreanDate(val) {
        const d = String(val || '').replace(/[^0-9]/g, '').slice(0, 8);
        let result = '';
        if (d.length >= 1) result += d.slice(0, 4);
        if (d.length >= 4) result += '년 ';
        if (d.length >= 5) result += d.slice(4, 6);
        if (d.length >= 6) result += '월 ';
        if (d.length >= 7) result += d.slice(6, 8);
        if (d.length >= 8) result += '일';
        return result;
    }

    function _onMadeDateInput(el) {
        const pos = el.selectionStart;
        const prev = el.value;
        const formatted = _formatKoreanDate(prev);
        el.value = formatted;
        // 커서 위치 보정: 숫자 입력 위치에 맞게 이동
        const numsBefore = prev.slice(0, pos).replace(/[^0-9]/g, '').length;
        let cursor = 0, count = 0;
        for (let i = 0; i < formatted.length; i++) {
            if (/[0-9]/.test(formatted[i])) { count++; if (count === numsBefore) { cursor = i + 1; } }
        }
        if (numsBefore === 0) cursor = 0;
        el.setSelectionRange(cursor, cursor);
    }

    function _productLabel(product) {
        const color = product.color || '';
        return `[${product.carModel || '-'}] ${product.partName || '-'}${color ? ' / ' + color : ''}`;
    }

    // "YYYY년 MM월 DD일" 문자열 → Date 파싱
    function _parseKoreanDate(str) {
        const m = String(str || '').match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
        if (!m) return null;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    // 제작일 → 오늘까지 "X년 X개월" 계산
    function _ageDisplay(madeDateStr) {
        const d = _parseKoreanDate(madeDateStr);
        if (!d || isNaN(d.getTime())) return '<span style="color:var(--text-muted);">-</span>';
        const now = new Date();
        let years  = now.getFullYear() - d.getFullYear();
        let months = now.getMonth()    - d.getMonth();
        if (now.getDate() < d.getDate()) months--;
        if (months < 0) { years--; months += 12; }
        if (years < 0)  { years = 0; months = 0; }
        return `<span style="font-weight:600;color:var(--text-primary);">${years}년 ${months}개월</span>`;
    }

    // 품목구분 배지
    function _itemTypeBadge(type) {
        const map = {
            '양산품': { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
            'A/S':   { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
            '개발품': { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' }
        };
        const s = map[type] || { bg: 'var(--bg-secondary)', color: 'var(--text-muted)', border: 'var(--border-color)' };
        return type
            ? `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:0.76rem;font-weight:700;background:${s.bg};color:${s.color};border:1px solid ${s.border};">${_esc(type)}</span>`
            : '<span style="color:var(--text-muted);">-</span>';
    }

    async function render(container) {
        await _clearLegacyList();
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-jig-master', '', '',
                    '<button class="btn btn-primary btn-sm" onclick="LaserJigMasterModule.openModal()"><span class="material-symbols-outlined">add</span> 지그 등록</button>')}
                ${LaserProcessUI.renderJigSubNav('laser-jig-master')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="width:15%;">지그명</th>
                                        <th>공용 사용 제품</th>
                                        <th style="width:7%;text-align:right;">제품수</th>
                                        <th style="width:6%;text-align:right;">수량</th>
                                        <th style="width:8%;">품목구분</th>
                                        <th style="width:7%;">재질</th>
                                        <th style="width:9%;">제작일</th>
                                        <th style="width:10%;">수명</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserJigMasterBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserJigMasterBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(a.jigName || '').localeCompare(String(b.jigName || ''), 'ko');
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 레이져 지그가 없습니다. 레이져 지그 등록에서 제품을 체크 선택하세요.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            const products = _selectedProducts(row);
            return `
                <tr>
                    <td><strong>${_esc(row.jigName || '-')}</strong></td>
                    <td>
                        <div style="display:flex;flex-wrap:wrap;gap:3px;">
                            ${products.length ? products.map(function (product) {
                                return `<span style="display:inline-flex;align-items:center;padding:1px 5px;border-radius:999px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:0.64rem;line-height:1.35;">${_esc(_productLabel(product))}</span>`;
                            }).join('') : '<span style="color:var(--text-muted);">선택 제품 없음</span>'}
                        </div>
                    </td>
                    <td style="text-align:right;font-weight:700;">${_fmt(products.length)}</td>
                    <td style="text-align:right;">${_fmt(row.qty || 0)}</td>
                    <td>${_itemTypeBadge(row.itemType || '')}</td>
                    <td>${_esc(row.material || '-')}</td>
                    <td style="font-size:0.82rem;">${_esc(row.madeDate || '-')}</td>
                    <td>${_ageDisplay(row.madeDate || '')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserJigMasterModule.openModal('${_js(row.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserJigMasterModule.openDisposeModal('${_js(row.id)}')">폐기</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function _productChecklistHtml(row, allRows) {
        const selectedIds = new Set(_selectedProducts(row).map(function (product) {
            return String(product.productId || product.id || '').trim();
        }));

        // 다른 지그에 이미 등록된 제품 ID 수집
        const currentId = row ? String(row.id || '') : '';
        const usedElsewhere = new Set();
        (allRows || []).forEach(function (jig) {
            if (String(jig.id || '') === currentId) return; // 현재 편집 중인 지그는 제외
            (jig.productIds || []).forEach(function (pid) {
                usedElsewhere.add(String(pid).trim());
            });
        });

        const allProducts = _laserProducts();
        // 다른 지그에 등록된 제품은 표시하지 않음 (현재 지그에 선택된 것은 유지)
        const products = allProducts.filter(function (product) {
            const pid = String(product.id || _productKey(product)).trim();
            return !usedElsewhere.has(pid) || selectedIds.has(pid);
        });

        if (!products.length) {
            return `<div style="padding:28px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">등록 가능한 제품이 없습니다. (레이져 공정이 포함된 제품이 없거나 모두 다른 지그에 등록됨)</div>`;
        }

        const groups = {};
        products.forEach(function (product) {
            const car = product.carModel || '미지정';
            if (!groups[car]) groups[car] = [];
            groups[car].push(product);
        });

        return Object.entries(groups).map(function ([car, items]) {
            return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:#fff;margin-bottom:10px;">
                    <div style="padding:8px 12px;background:var(--bg-secondary);font-weight:800;color:var(--text-primary);display:flex;justify-content:space-between;">
                        <span>${_esc(car)}</span><span style="color:var(--text-muted);font-size:0.78rem;">${items.length}개</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;">
                        ${items.map(function (product) {
                            const productId = String(product.id || _productKey(product)).trim();
                            const checked = selectedIds.has(productId) ? 'checked' : '';
                            return `
                                <label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-top:1px solid var(--border-color);cursor:pointer;font-size:0.82rem;">
                                    <input type="checkbox" data-ljm-product value="${_esc(productId)}" ${checked}
                                        data-car="${_esc(product.carModel || '')}"
                                        data-part="${_esc(product.partName || '')}"
                                        data-color="${_esc(product.color || product.paintColor || '')}">
                                    <span>
                                        <span style="display:block;font-weight:700;color:var(--text-primary);">${_esc(product.partName || '-')}</span>
                                        <span style="display:block;color:var(--text-muted);font-size:0.75rem;">${_esc(product.color || product.paintColor || '-')}</span>
                                    </span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function openModal(id) {
        if (id && !_requireAdmin()) return;
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;

        UIUtils.showModal(
            row ? '레이져 지그 수정' : '레이져 지그 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">지그명 <span style="color:var(--accent-red)">*</span></label><input class="form-input" id="ljmName" value="${_esc(row && row.jigName || '')}" placeholder="예: T1XX LENS JIG" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9\s\-_.\/]/g,'')"></div>
                    <div class="form-group"><label class="form-label">제작일</label><input class="form-input" id="ljmMadeDate" type="text" value="${_esc(_formatKoreanDate(row && row.madeDate || ''))}" placeholder="예: 2024년 01월 15일" oninput="LaserJigMasterModule.onMadeDateInput(this)" maxlength="13"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">수량</label><input class="form-input" id="ljmQty" type="number" min="0" value="${_esc(_numValue(row && row.qty || 0))}"></div>
                    <div class="form-group"><label class="form-label">품목구분</label>
                        <select class="form-select" id="ljmItemType">
                            ${['', '양산품', 'A/S', '개발품'].map(function (t) {
                                const sel = ((row && row.itemType) || '') === t ? 'selected' : '';
                                return `<option value="${t}" ${sel}>${t || '— 선택 —'}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">재질</label><input class="form-input" id="ljmMaterial" value="${_esc(row && row.material || '')}" placeholder="예: AL, SUS"></div>
                <div style="margin:12px 0 8px;font-weight:800;color:var(--text-primary);">공용 사용 제품 선택</div>
                <div style="max-height:52vh;overflow:auto;padding-right:4px;">${_productChecklistHtml(row, rows)}</div>
            `,
            `
                ${row ? `<button class="btn btn-danger" onclick="LaserJigMasterModule.openDisposeModal('${_js(row.id)}')">폐기</button>` : ''}
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserJigMasterModule.save('${id || ''}')">저장</button>
            `,
            'xl'
        );
    }

    function _collectSelectedProducts() {
        return Array.from(document.querySelectorAll('[data-ljm-product]:checked')).map(function (input) {
            return {
                productId: input.value,
                carModel: input.dataset.car || '',
                partName: input.dataset.part || '',
                color: input.dataset.color || ''
            };
        });
    }

    async function save(id) {
        if (id && !_requireAdmin()) return;
        const rows = await _load();
        const products = _collectSelectedProducts();
        const payload = {
            jigName: document.getElementById('ljmName').value.trim(),
            qty: Number(document.getElementById('ljmQty').value) || 0,
            itemType: document.getElementById('ljmItemType').value,
            material: document.getElementById('ljmMaterial').value.trim(),
            madeDate: document.getElementById('ljmMadeDate').value,
            products: products,
            productIds: products.map(function (product) { return product.productId; })
        };

        if (!payload.jigName) {
            UIUtils.toast('지그명을 입력하세요.', 'warning');
            return;
        }
        if (!products.length) {
            UIUtils.toast('공용으로 사용할 제품을 1개 이상 선택하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('레이져 지그대장이 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function openDisposeModal(id) {
        if (!_requireAdmin()) return;
        const rows = await _load();
        const row = rows.find(function (item) { return item.id === id; });
        if (!row) {
            UIUtils.toast('폐기할 지그를 찾을 수 없습니다.', 'warning');
            return;
        }
        UIUtils.showModal(
            '레이져 지그 폐기',
            `
                <div style="padding:4px 0 10px;color:var(--text-secondary);font-size:0.9rem;">
                    폐기 처리하면 지그대장에서 제외되고 폐기 대장에 이력이 남습니다.
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">지그명</label><input class="form-input" value="${_esc(row.jigName || '-')}" disabled></div>
                    <div class="form-group"><label class="form-label">폐기일</label><input class="form-input" id="ljmDisposeDate" type="date" value="${UIUtils.today()}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">폐기 수량</label><input class="form-input" id="ljmDisposeQty" type="number" min="0" value="${_esc(_numValue(row.qty || 0))}"></div>
                    <div class="form-group"><label class="form-label">폐기자</label><input class="form-input" id="ljmDisposeWorker" placeholder="작업자명"></div>
                </div>
                <div class="form-group"><label class="form-label">폐기 사유</label><textarea class="form-textarea" id="ljmDisposeReason" rows="3" placeholder="예: 수명 초과, 파손, 제품 단종 등"></textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-danger" onclick="LaserJigMasterModule.dispose('${_js(id)}')">폐기</button>
            `,
            'lg'
        );
    }

    async function dispose(id) {
        if (!_requireAdmin()) return;
        const rows = await _load();
        const index = rows.findIndex(function (item) { return item.id === id; });
        if (index < 0) {
            UIUtils.toast('폐기할 지그를 찾을 수 없습니다.', 'warning');
            return;
        }
        const row = rows[index];
        const disposalRows = await _loadDisposals();
        const user = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        disposalRows.unshift({
            id: Storage.generateId(),
            jigId: row.id,
            jigName: row.jigName || '',
            qty: Number(document.getElementById('ljmDisposeQty')?.value) || Number(row.qty) || 0,
            itemType: row.itemType || '',
            material: row.material || '',
            madeDate: row.madeDate || '',
            products: row.products || [],
            productIds: row.productIds || [],
            disposedDate: document.getElementById('ljmDisposeDate')?.value || UIUtils.today(),
            disposedBy: (document.getElementById('ljmDisposeWorker')?.value || '').trim(),
            reason: (document.getElementById('ljmDisposeReason')?.value || '').trim(),
            adminUser: user ? (user.displayName || user.username || '') : '',
            createdAt: new Date().toISOString()
        });
        rows.splice(index, 1);
        await _save(rows);
        await _saveDisposals(disposalRows);
        UIUtils.closeModal();
        UIUtils.toast('폐기 대장에 이력이 등록되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        return openDisposeModal(id);
    }

    async function resetAll() {
        if (!_requireAdmin()) return;
        UIUtils.confirm('레이져 지그대장에 등록된 지그를 모두 삭제하시겠습니까?', async function () {
            await _save([]);
            UIUtils.toast('레이져 지그대장을 초기화했습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        openDisposeModal: openDisposeModal,
        dispose: dispose,
        remove: remove,
        resetAll: resetAll,
        onMadeDateInput: _onMadeDateInput,
        _onMadeDateInput: _onMadeDateInput
    };
})();

var LaserJigDisposalModule = (function () {
    const CONFIG_KEY = 'laser_jig_disposal_v1';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }

    function _productLabel(product) {
        return [product.carModel, product.partName, product.color || product.paintColor]
            .filter(Boolean).join(' ');
    }

    async function _load() {
        try {
            const rows = await Storage.getConfigValue(CONFIG_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserJigDisposal] config load failed:', e);
            return [];
        }
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-jig-disposal')}
                ${LaserProcessUI.renderJigSubNav('laser-jig-disposal')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="width:9%;">폐기일</th>
                                        <th style="width:14%;">지그명</th>
                                        <th>공용 사용 제품</th>
                                        <th style="width:7%;text-align:right;">폐기수량</th>
                                        <th style="width:8%;">품목구분</th>
                                        <th style="width:7%;">재질</th>
                                        <th style="width:9%;">제작일</th>
                                        <th style="width:8%;">폐기자</th>
                                        <th style="width:14%;">폐기 사유</th>
                                    </tr>
                                </thead>
                                <tbody id="laserJigDisposalBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserJigDisposalBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.disposedDate || '').localeCompare(String(a.disposedDate || ''));
        });
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">폐기 이력이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (row) {
            const products = row.products || [];
            return `
                <tr>
                    <td>${_esc(row.disposedDate || '-')}</td>
                    <td><strong>${_esc(row.jigName || '-')}</strong></td>
                    <td>
                        <div style="display:flex;flex-wrap:wrap;gap:3px;">
                            ${products.length ? products.map(function (product) {
                                return `<span style="display:inline-flex;align-items:center;padding:1px 5px;border-radius:999px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:0.64rem;line-height:1.35;">${_esc(_productLabel(product))}</span>`;
                            }).join('') : '<span style="color:var(--text-muted);">-</span>'}
                        </div>
                    </td>
                    <td style="text-align:right;font-weight:700;">${_fmt(row.qty || 0)}</td>
                    <td>${_esc(row.itemType || '-')}</td>
                    <td>${_esc(row.material || '-')}</td>
                    <td>${_esc(row.madeDate || '-')}</td>
                    <td>${_esc(row.disposedBy || row.adminUser || '-')}</td>
                    <td>${_esc(row.reason || '-')}</td>
                </tr>
            `;
        }).join('');
    }

    return {
        render: render,
        init: render
    };
})();

var LaserJigCleaningModule = (function () {
    const CONFIG_KEY = 'laser_jig_cleaning_v1';
    const JIG_KEY = 'laser_jig_master_v2';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _load() {
        try {
            const rows = await Storage.getConfigValue(CONFIG_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserJigCleaning] config load failed:', e);
            return [];
        }
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, rows);
    }

    async function _loadDisposals() {
        try {
            const rows = await Storage.getConfigValue(DISPOSAL_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserJigMaster] disposal config load failed:', e);
            return [];
        }
    }

    async function _saveDisposals(rows) {
        await Storage.setConfigValue(DISPOSAL_KEY, Array.isArray(rows) ? rows : []);
    }

    function _isAdmin() {
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser()
            : null;
        return !!(user && user.role === 'admin');
    }

    function _requireAdmin() {
        if (_isAdmin()) return true;
        UIUtils.toast('관리자만 접근할 수 있습니다.', 'warning');
        return false;
    }

    async function _jigs() {
        try {
            const rows = await Storage.getConfigValue(JIG_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserJigCleaning] jig config load failed:', e);
            return [];
        }
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-jig-cleaning', '', '',
                    '<button class="btn btn-primary btn-sm" onclick="LaserJigCleaningModule.openModal()"><span class="material-symbols-outlined">add</span> 세척 기록 등록</button>')}
                ${LaserProcessUI.renderJigSubNav('laser-jig-cleaning')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>세척일</th>
                                        <th>지그명</th>
                                        <th>세척수량</th>
                                        <th>세척자</th>
                                        <th>세척방법</th>
                                        <th>결과</th>
                                        <th>다음 세척일</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserJigCleaningBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserJigCleaningBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 지그 세척일지가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            return `
                <tr>
                    <td>${_esc(row.date || '-')}</td>
                    <td><strong>${_esc(row.jigName || '-')}</strong></td>
                    <td style="text-align:right;">${_esc(row.cleanQty || 0)}</td>
                    <td>${_esc(row.cleaner || '-')}</td>
                    <td>${_esc(row.method || '-')}</td>
                    <td>${UIUtils.badge(row.result || '완료', (row.result || '') === '이상' ? 'danger' : 'success')}</td>
                    <td>${_esc(row.nextDate || '-')}</td>
                    <td>${_esc(row.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserJigCleaningModule.openModal('${row.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserJigCleaningModule.remove('${row.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function openModal(id) {
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;
        const jigs = await _jigs();

        UIUtils.showModal(
            row ? '지그 세척일지 수정' : '지그 세척일지 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척일</label><input class="form-input" id="ljcDate" type="date" value="${_esc((row && row.date) || UIUtils.today())}"></div>
                    <div class="form-group"><label class="form-label">지그명</label>
                        <select class="form-select" id="ljcName">
                            <option value="">선택</option>
                            ${jigs.map(function (jig) {
                                const selected = ((row && row.jigName) || '') === jig.jigName ? 'selected' : '';
                                return `<option value="${_esc(jig.jigName)}" ${selected}>${_esc(jig.jigName)}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척수량</label><input class="form-input" id="ljcQty" type="number" min="0" value="${_esc(_numValue((row && row.cleanQty) || 0))}"></div>
                    <div class="form-group"><label class="form-label">세척자</label><input class="form-input" id="ljcCleaner" value="${_esc((row && row.cleaner) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척방법</label><input class="form-input" id="ljcMethod" value="${_esc((row && row.method) || '에어/세척포')}" ></div>
                    <div class="form-group"><label class="form-label">결과</label>
                        <select class="form-select" id="ljcResult">
                            ${['완료','이상','보류'].map(function (result) {
                                return `<option value="${result}" ${((row && row.result) || '완료') === result ? 'selected' : ''}>${result}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">다음 세척일</label><input class="form-input" id="ljcNextDate" type="date" value="${_esc((row && row.nextDate) || '')}"></div>
                <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="ljcNote" rows="3">${_esc((row && row.note) || '')}</textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserJigCleaningModule.save('${id || ''}')">저장</button>
            `
        );
    }

    async function save(id) {
        const rows = await _load();
        const payload = {
            date: document.getElementById('ljcDate').value,
            jigName: document.getElementById('ljcName').value,
            cleanQty: Number(document.getElementById('ljcQty').value) || 0,
            cleaner: document.getElementById('ljcCleaner').value.trim(),
            method: document.getElementById('ljcMethod').value.trim(),
            result: document.getElementById('ljcResult').value,
            nextDate: document.getElementById('ljcNextDate').value,
            note: document.getElementById('ljcNote').value.trim()
        };

        if (!payload.jigName) {
            UIUtils.toast('지그명을 선택하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('지그 세척일지가 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 세척 기록을 삭제하시겠습니까?', async function () {
            const rows = await _load();
            await _save(rows.filter(function (item) { return item.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        remove: remove
    };
})();

if (typeof window !== 'undefined') {
    window._onMadeDateInput = function (el) {
        if (window.LaserJigMasterModule && typeof window.LaserJigMasterModule.onMadeDateInput === 'function') {
            return window.LaserJigMasterModule.onMadeDateInput(el);
        }
        return null;
    };
}

var LaserEquipmentHistoryModule = (function () {
    const CONFIG_KEY = 'laser_equipment_history_v1';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _load() {
        try {
            const rows = await Storage.getConfigValue(CONFIG_KEY);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserEquipmentHistory] config load failed:', e);
            return [];
        }
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, rows);
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-equipment-history', '', '',
                    '<button class="btn btn-primary btn-sm" onclick="LaserEquipmentHistoryModule.openModal()"><span class="material-symbols-outlined">add</span> 점검/수리 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>일자</th>
                                        <th>장비명</th>
                                        <th>구분</th>
                                        <th>상태</th>
                                        <th>담당자</th>
                                        <th>이상 내용</th>
                                        <th>조치 내용</th>
                                        <th>비가동시간(h)</th>
                                        <th>비용</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserEquipHistoryBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserEquipHistoryBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 레이져 장비 점검/수리 내역이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            const statusType = row.status === '진행중' ? 'warning' : (row.status === '보류' ? 'secondary' : 'success');
            return `
                <tr>
                    <td>${_esc(row.date || '-')}</td>
                    <td><strong>${_esc(row.equipmentName || '-')}</strong></td>
                    <td>${_esc(row.category || '-')}</td>
                    <td>${UIUtils.badge(row.status || '완료', statusType)}</td>
                    <td>${_esc(row.worker || '-')}</td>
                    <td>${_esc(row.issue || '-')}</td>
                    <td>${_esc(row.actionTaken || '-')}</td>
                    <td style="text-align:right;">${_esc(row.downHours || 0)}</td>
                    <td style="text-align:right;">${_esc(row.cost || 0)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserEquipmentHistoryModule.openModal('${row.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserEquipmentHistoryModule.remove('${row.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function openModal(id) {
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;

        UIUtils.showModal(
            row ? '레이져 장비 점검/수리 수정' : '레이져 장비 점검/수리 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">일자</label><input class="form-input" id="lehDate" type="date" value="${_esc((row && row.date) || UIUtils.today())}"></div>
                    <div class="form-group"><label class="form-label">장비명</label><input class="form-input" id="lehName" value="${_esc((row && row.equipmentName) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">구분</label>
                        <select class="form-select" id="lehCategory">
                            ${['정기점검','수리','이상조치','교체'].map(function (category) {
                                return `<option value="${category}" ${((row && row.category) || '정기점검') === category ? 'selected' : ''}>${category}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="lehStatus">
                            ${['완료','진행중','보류'].map(function (status) {
                                return `<option value="${status}" ${((row && row.status) || '완료') === status ? 'selected' : ''}>${status}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">담당자</label><input class="form-input" id="lehWorker" value="${_esc((row && row.worker) || '')}"></div>
                    <div class="form-group"><label class="form-label">비가동시간(h)</label><input class="form-input" id="lehDownHours" type="number" min="0" step="0.1" value="${_esc(_numValue((row && row.downHours) || 0))}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">비용</label><input class="form-input" id="lehCost" type="number" min="0" step="1000" value="${_esc(_numValue((row && row.cost) || 0))}"></div>
                    <div class="form-group"><label class="form-label">이상 내용</label><input class="form-input" id="lehIssue" value="${_esc((row && row.issue) || '')}"></div>
                </div>
                <div class="form-group"><label class="form-label">조치 내용</label><textarea class="form-textarea" id="lehAction" rows="3">${_esc((row && row.actionTaken) || '')}</textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserEquipmentHistoryModule.save('${id || ''}')">저장</button>
            `
        );
    }

    async function save(id) {
        const rows = await _load();
        const payload = {
            date: document.getElementById('lehDate').value,
            equipmentName: document.getElementById('lehName').value.trim(),
            category: document.getElementById('lehCategory').value,
            status: document.getElementById('lehStatus').value,
            worker: document.getElementById('lehWorker').value.trim(),
            downHours: Number(document.getElementById('lehDownHours').value) || 0,
            cost: Number(document.getElementById('lehCost').value) || 0,
            issue: document.getElementById('lehIssue').value.trim(),
            actionTaken: document.getElementById('lehAction').value.trim()
        };

        if (!payload.equipmentName) {
            UIUtils.toast('장비명을 입력하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('장비 점검/수리 내역이 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 장비 이력을 삭제하시겠습니까?', async function () {
            const rows = await _load();
            await _save(rows.filter(function (item) { return item.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        remove: remove
    };
})();
