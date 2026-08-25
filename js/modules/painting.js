/**
 * 도장 공정 모듈
 * - 도장 입고
 * - 도장 작업일지 (생산 투입)
 * - 도장 검사 (불량 집계) - 생산계획 연동
 * - 도장품 출고
 */

// ===================================================================
// 도장 공정 공유 내비게이션
// ===================================================================
var PaintingNavUI = (function() {
    // page: 라우터 페이지 ID, tab: PaintingInspectionModule 내부 탭 key (없으면 기본)
    var MENUS = [
        { id: 'painting-process',      tab: '',                    icon: 'dashboard',       label: '도장 작업 메인',       sub: '현황·바로가기' },
        { id: 'painting-work-a',       tab: '',                    icon: 'format_paint',    label: '도장-A 작업현황',       sub: '도장-A 작업일지 입력·조회' },
        { id: 'painting-work-b',       tab: '',                    icon: 'format_paint',    label: '도장-B 작업현황',       sub: '도장-B 작업일지 입력·조회' },
        { id: 'painting-inspection',   tab: 'inspection',          icon: 'done_all',        label: '외관 검사',             sub: '도장 완료품 외관 검사 진행' },
        { id: 'painting-inspection',   tab: 'completion',          icon: 'task_alt',        label: '검사완료 실적',          sub: '외관 검사 완료 이력 조회' },
        { id: 'painting-rework-wip',   tab: '',                    icon: 'autorenew',       label: '재사용 자재',         sub: '재사용 자재 관리' },
        { id: 'painting-inspection',   tab: 'nonconform-standard', icon: 'description',     label: '부적합품 처리 기준서',   sub: '기준서 업로드 및 인쇄' }
    ];

    function _navigate(m) {
        if (m.tab) sessionStorage.setItem('paintingInspectionTab', m.tab);
        Router.navigate(m.id);
    }

    function render(activePage, activeTab) {
        return '<div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">' +
            MENUS.map(function(m, i) {
                var active = m.id === activePage && (m.tab ? m.tab === activeTab : (!activeTab || !m.tab));
                return '<button type="button" onclick="PaintingNavUI._navigate(' + i + ')"' +
                    ' style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;' +
                    'border:' + (active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)') + ';' +
                    'background:var(--bg-primary);color:var(--text-primary);' +
                    'cursor:pointer;min-width:150px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">' +
                    '<span style="display:inline-flex;align-items:center;justify-content:center;' +
                    'width:42px;height:42px;border-radius:10px;flex-shrink:0;' +
                    'background:' + (active ? 'var(--accent-blue)' : 'var(--bg-secondary)') + ';">' +
                    '<span class="material-symbols-outlined" style="font-size:24px;color:' + (active ? '#fff' : 'var(--text-muted)') + ';">' + m.icon + '</span>' +
                    '</span>' +
                    '<span style="display:flex;flex-direction:column;gap:2px;">' +
                    '<span style="font-size:0.92rem;font-weight:700;">' + m.label + '</span>' +
                    '<span style="font-size:0.73rem;color:var(--text-muted);">' + m.sub + '</span>' +
                    '</span></button>';
            }).join('') + '</div>';
    }

    function navigateByIndex(idx) {
        var m = MENUS[idx];
        if (!m) return;
        _navigate(m);
    }

    return { render: render, _navigate: navigateByIndex };
})();

/** 도장 작업 메인 허브 — 투입 자재 · 금일 입고 · 실적 입력/미입력 */
var PaintingProcessModule = (function () {
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _fmt(n) {
        if (typeof UIUtils !== 'undefined' && UIUtils.formatNumber) return UIUtils.formatNumber(n || 0);
        return Number(n || 0).toLocaleString('ko-KR');
    }
    function _normLine(line) {
        var s = String(line || '').trim();
        if (/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(s)) return '도장-B';
        return '도장-A';
    }
    function _dateKey(d) {
        return String(d || '').trim().slice(0, 10);
    }
    function _stockSummary(line) {
        try {
            if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.groupStock) {
                return { items: [], total: 0, count: 0 };
            }
            var items = PaintingInputModule.groupStock(line) || [];
            var total = items.reduce(function (s, g) { return s + (Number(g.stock) || 0); }, 0);
            return { items: items, total: total, count: items.length };
        } catch (e) {
            return { items: [], total: 0, count: 0 };
        }
    }
    function _todayIncomingList() {
        var today = UIUtils.today();
        var store = DB.STORES.PAINTING_INPUT_INVENTORY;
        return (Storage.getAll(store) || []).filter(function (r) {
            if (String(r.type || '') !== '입고') return false;
            return _dateKey(r.date) === today;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
    }
    function _dedupePlansByStart(plans) {
        var bySlot = {};
        var noSlot = [];
        (plans || []).forEach(function (p) {
            var key = String((p && (p.startTime || p.slot)) || '').trim();
            if (!key) { noSlot.push(p); return; }
            var prev = bySlot[key];
            if (!prev) { bySlot[key] = p; return; }
            var newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
            if (newer) bySlot[key] = p;
        });
        return Object.keys(bySlot).map(function (k) { return bySlot[k]; }).concat(noSlot);
    }

    function _planDashForLine(line, today, plans, works) {
        var want = _normLine(line);
        var linePlans = _dedupePlansByStart(plans.filter(function (p) {
            return _dateKey(p.date) === today && _normLine(p.line) === want && (p.carModel || p.partName);
        }));
        var entered = 0;
        var unentered = 0;
        var planQty = 0;
        linePlans.forEach(function (p) {
            planQty += Number(p.planQty) || 0;
            if (works.some(function (w) { return w.planId === p.id; })) entered += 1;
            else unentered += 1;
        });
        var workToday = works.filter(function (w) {
            return _dateKey(w.date) === today && _normLine(w.line) === want;
        });
        var prodQty = workToday.reduce(function (s, w) {
            return s + (Number(w.productionQty) || Number(w.inputQty) || 0);
        }, 0);
        return {
            planCount: linePlans.length,
            entered: entered,
            unentered: unentered,
            workCount: workToday.length,
            planQty: planQty,
            prodQty: prodQty
        };
    }

    function _workProdQty(w) {
        return Number(w && w.productionQty) || Number(w && w.inputQty) || 0;
    }

    /** 금일 라인별 생산계획 목록 행 */
    function _todayPlanRowsHtml(line, today, plans, works) {
        var want = _normLine(line);
        var pageId = want === '도장-B' ? 'painting-work-b' : 'painting-work-a';
        var linePlans = _dedupePlansByStart(plans.filter(function (p) {
            return _dateKey(p.date) === today && _normLine(p.line) === want && (p.carModel || p.partName);
        })).sort(function (a, b) {
            return String(a.startTime || a.slot || '').localeCompare(String(b.startTime || b.slot || ''));
        });
        var dayWorks = works.filter(function (w) {
            return _dateKey(w.date) === today && _normLine(w.line) === want;
        });

        if (!linePlans.length) {
            return '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-muted);font-size:0.82rem;">금일 등록된 계획이 없습니다.</td></tr>';
        }

        var now = new Date();
        var nowHm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        return linePlans.map(function (plan) {
            var planQty = Number(plan.planQty) || 0;
            var achieved = dayWorks.filter(function (w) {
                return w.carModel === plan.carModel
                    && w.partName === plan.partName
                    && (w.color || '') === (plan.color || '');
            }).reduce(function (s, w) { return s + _workProdQty(w); }, 0);
            var rate = planQty > 0 ? Math.min(100, Math.round(achieved / planQty * 100)) : 0;
            var rateColor = rate >= 100 ? '#16a34a' : (rate >= 70 ? '#2563eb' : (rate > 0 ? '#ea580c' : 'var(--text-muted)'));
            var timeStr = plan.startTime
                ? (plan.startTime + '~' + (plan.endTime || ''))
                : (plan.slot || '-');
            var isCompleted = dayWorks.some(function (w) { return w.planId === plan.id; });
            var planStart = plan.startTime || plan.slot || '';
            var isFuture = !isCompleted && !!planStart && planStart > nowHm;
            var statusHtml = isCompleted
                ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.12);color:#16a34a;">입력완료</span>'
                : (isFuture
                    ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,0.18);color:#64748b;">대기</span>'
                    : '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.12);color:#ea580c;">미입력</span>');
            var actionHtml = isCompleted
                ? '<span style="font-size:0.75rem;color:var(--text-muted);">—</span>'
                : ('<button type="button" class="btn btn-sm btn-primary" style="padding:3px 8px;font-size:0.75rem;white-space:nowrap;"'
                    + ' onclick="event.stopPropagation();PaintingProcessModule.openPlanWork(\'' + _esc(pageId) + '\',\'' + _esc(plan.id) + '\')">'
                    + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit_note</span> 실적'
                    + '</button>');

            return '<tr style="cursor:default;">'
                + '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(timeStr) + '</td>'
                + '<td style="padding:8px 10px;line-height:1.25;">'
                    + '<strong style="white-space:nowrap;">' + _esc(plan.carModel || '-') + '</strong>'
                    + '<div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">'
                        + _esc(plan.partName || '-') + ' · ' + _esc(plan.color || '-')
                    + '</div>'
                + '</td>'
                + '<td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:700;">' + _fmt(planQty) + '</td>'
                + '<td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:700;color:' + rateColor + ';">' + _fmt(achieved) + '</td>'
                + '<td style="padding:8px 10px;min-width:72px;">'
                    + '<div style="display:flex;align-items:center;gap:4px;">'
                        + '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">'
                            + '<div style="width:' + rate + '%;height:100%;background:' + rateColor + ';"></div>'
                        + '</div>'
                        + '<span style="font-size:0.72rem;min-width:28px;text-align:right;">' + rate + '%</span>'
                    + '</div>'
                + '</td>'
                + '<td style="white-space:nowrap;padding:8px 10px;">' + statusHtml + ' ' + actionHtml + '</td>'
                + '</tr>';
        }).join('');
    }

    function _planSectionHtml(line, accent, pageId, today, plans, works) {
        var d = _planDashForLine(line, today, plans, works);
        var suffix = line === '도장-B' ? 'B' : 'A';
        var summary = !d.planCount
            ? '계획 없음'
            : (d.planCount + '건 · 계획 ' + _fmt(d.planQty) + ' EA · 실적 ' + _fmt(d.prodQty) + ' EA'
                + (d.unentered ? ' · 미입력 ' + d.unentered : '')
                + (d.entered ? ' · 입력 ' + d.entered : ''));
        return '' +
            '<div class="card" style="margin:0;min-width:0;" id="ppPlanCard' + suffix + '">' +
                '<div class="card-header" style="padding:8px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">' +
                    '<h4 style="margin:0;font-size:0.95rem;">' +
                        '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">assignment</span>' +
                        _esc(line) + ' 계획' +
                        '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;color:#fff;background:' + accent + ';">' + _esc(line) + '</span>' +
                        '<span id="ppPlanSummary' + suffix + '" style="font-size:0.72rem;color:var(--text-muted);font-weight:500;margin-left:6px;">' + _esc(summary) + '</span>' +
                    '</h4>' +
                    '<button type="button" class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.75rem;" onclick="Router.navigate(\'' + pageId + '\')">' +
                        '작업현황 <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">chevron_right</span>' +
                    '</button>' +
                '</div>' +
                '<div class="card-body" style="padding:10px;">' +
                    '<div class="data-table-wrapper" style="border:1px solid var(--border);border-radius:4px;overflow-x:auto;max-height:280px;overflow-y:auto;">' +
                        '<table class="data-table compact" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">' +
                            '<thead style="position:sticky;top:0;z-index:1;background:var(--bg-secondary);"><tr>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">시간대</th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">차종/품명</th>' +
                                '<th style="text-align:right;white-space:nowrap;padding:8px 10px;">계획</th>' +
                                '<th style="text-align:right;white-space:nowrap;padding:8px 10px;">실적</th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">달성</th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">상태</th>' +
                            '</tr></thead>' +
                            '<tbody id="ppPlanBody' + suffix + '">' + _todayPlanRowsHtml(line, today, plans, works) + '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function openPlanWork(pageId, planId) {
        if (!pageId) return;
        Router.navigate(pageId);
        if (!planId) return;
        setTimeout(function () {
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.openAddModalFromPlan === 'function') {
                PaintingWorkModule.openAddModalFromPlan(planId);
            }
        }, 280);
    }

    function _dashCard(title, accent, pageId, d) {
        var rate = d.planCount > 0 ? Math.round(d.entered / d.planCount * 100) : 0;
        return '' +
            '<div class="card" style="cursor:pointer;border-top:3px solid ' + accent + ';" onclick="Router.navigate(\'' + pageId + '\')">' +
                '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;">' +
                    '<h4 style="margin:0;color:' + accent + ';">' + _esc(title) + '</h4>' +
                    '<span class="material-symbols-outlined" style="color:' + accent + ';">chevron_right</span>' +
                '</div>' +
                '<div class="card-body" style="padding:14px;">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
                        '<div style="padding:12px;border-radius:10px;background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.2);">' +
                            '<div style="font-size:0.72rem;color:#15803d;font-weight:700;">실적 입력</div>' +
                            '<div style="font-size:1.55rem;font-weight:800;color:#16a34a;line-height:1.2;">' + d.entered +
                                '<span style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-left:4px;">/ ' + d.planCount + '건</span></div>' +
                        '</div>' +
                        '<div style="padding:12px;border-radius:10px;background:rgba(234,88,12,0.08);border:1px solid rgba(234,88,12,0.2);">' +
                            '<div style="font-size:0.72rem;color:#c2410c;font-weight:700;">미입력</div>' +
                            '<div style="font-size:1.55rem;font-weight:800;color:#ea580c;line-height:1.2;">' + d.unentered +
                                '<span style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-left:4px;">건</span></div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                        '<div style="flex:1;height:8px;background:var(--border);border-radius:999px;overflow:hidden;">' +
                            '<div style="width:' + rate + '%;height:100%;background:' + accent + ';"></div>' +
                        '</div>' +
                        '<span style="font-size:0.78rem;font-weight:700;color:' + accent + ';min-width:36px;text-align:right;">' + rate + '%</span>' +
                    '</div>' +
                    '<div style="font-size:0.78rem;color:var(--text-muted);">' +
                        '계획 ' + _fmt(d.planQty) + ' EA · 실적 ' + _fmt(d.prodQty) + ' EA · 작업 ' + d.workCount + '건' +
                    '</div>' +
                '</div>' +
            '</div>';
    }
    function _stockCard(line, accent, pageId) {
        var s = _stockSummary(line);
        return '' +
            '<div class="card" style="cursor:pointer;" onclick="Router.navigate(\'' + pageId + '\')">' +
                '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;">' +
                    '<h4 style="margin:0;color:' + accent + ';">' + _esc(line) + ' 자재</h4>' +
                    '<span class="material-symbols-outlined" style="color:' + accent + ';">chevron_right</span>' +
                '</div>' +
                '<div class="card-body" style="padding:14px;">' +
                    '<div style="font-size:1.6rem;font-weight:800;color:' + accent + ';">' + _fmt(s.total) + ' EA</div>' +
                    '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">' + s.count + '종 · 현장 투입 대기</div>' +
                '</div>' +
            '</div>';
    }
    function _incomingRowsHtml(list) {
        if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.renderTodayReceiptRows) {
            return PaintingInputModule.renderTodayReceiptRows(list).html;
        }
        if (!list.length) {
            return '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">금일 현장 입고 자재가 없습니다.</td></tr>';
        }
        return list.map(function (r) {
            var dt = String(r.receivedAt || r.date || '');
            return '<tr>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(dt.slice(0, 10) || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(dt.length > 11 ? dt.slice(11, 16) : '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;"><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.partName || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.color || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-family:monospace;">' + _esc(r.lotNo || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">-</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">' + _fmt(r.quantity) + '</td>' +
                '</tr>';
        }).join('');
    }

    function _shipmentSectionHtml(line, accent) {
        var result = (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.renderTodayShipmentTable)
            ? PaintingInputModule.renderTodayShipmentTable(line, { compact: true })
            : { itemCount: 0, pendingCount: 0, doneCount: 0, total: 0, html: '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">모듈을 불러올 수 없습니다.</td></tr>' };
        var summary = !result.itemCount
            ? '출고 없음'
            : (result.itemCount + '건 · ' + _fmt(result.total) + ' EA'
                + (result.pendingCount ? ' · 미입고 ' + result.pendingCount : '')
                + (result.doneCount ? ' · 입고 ' + result.doneCount : ''));
        var suffix = line === '도장-B' ? 'B' : 'A';
        return '' +
            '<div class="card" style="margin:0;min-width:0;" id="ppShipCard' + suffix + '">' +
                '<div class="card-header" style="padding:8px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">' +
                    '<h4 style="margin:0;font-size:0.95rem;">' +
                        '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">inventory_2</span>' +
                        _esc(line) + ' 자재' +
                        '<span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;color:#fff;background:' + accent + ';">' + _esc(line) + '</span>' +
                        '<span id="ppShipSummary' + suffix + '" style="font-size:0.72rem;color:var(--text-muted);font-weight:500;margin-left:6px;">' + _esc(summary) + '</span>' +
                    '</h4>' +
                '</div>' +
                '<div class="card-body" style="padding:10px;">' +
                    '<div class="data-table-wrapper" style="border:1px solid var(--border);border-radius:4px;overflow-x:auto;">' +
                        '<table class="data-table compact" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">' +
                            '<thead><tr>' +
                                '<th style="white-space:nowrap;padding:8px 4px;width:34px;"></th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">입고시간</th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">차종</th>' +
                                '<th style="white-space:nowrap;padding:8px 10px;">품명</th>' +
                                '<th style="text-align:right;white-space:nowrap;padding:8px 10px;">수량</th>' +
                            '</tr></thead>' +
                            '<tbody id="ppShipBody' + suffix + '">' + result.html + '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function refreshShipments() {
        ['도장-A', '도장-B'].forEach(function (line) {
            var suffix = line === '도장-B' ? 'B' : 'A';
            var body = document.getElementById('ppShipBody' + suffix);
            var summary = document.getElementById('ppShipSummary' + suffix);
            if (!body || typeof PaintingInputModule === 'undefined' || !PaintingInputModule.renderTodayShipmentTable) return;
            var result = PaintingInputModule.renderTodayShipmentTable(line, { compact: true });
            body.innerHTML = result.html;
            if (summary) {
                summary.textContent = !result.itemCount
                    ? '출고 없음'
                    : (result.itemCount + '건 · ' + _fmt(result.total) + ' EA'
                        + (result.pendingCount ? ' · 미입고 ' + result.pendingCount : '')
                        + (result.doneCount ? ' · 입고 ' + result.doneCount : ''));
            }
        });
        _bindShipmentDnD();
    }

    /** 도장-A ↔ 도장-B 출고 자재 드래그 이동 (핸들 기반 — tr 드래그는 Chrome에서 불가) */
    function _bindShipmentDnD() {
        ['A', 'B'].forEach(function (suffix) {
            var card = document.getElementById('ppShipCard' + suffix);
            if (!card || card.dataset.dndBound === '1') return;
            card.dataset.dndBound = '1';
            var toLine = suffix === 'B' ? '도장-B' : '도장-A';
            var accent = suffix === 'B' ? '#ea580c' : '#2563eb';

            card.addEventListener('dragstart', function (e) {
                var handle = e.target && e.target.closest
                    ? e.target.closest('.pp-ship-drag-handle[data-ship-out-id]')
                    : null;
                if (!handle) {
                    // tr 자체 드래그는 브라우저마다 무시됨 — 핸들만 허용
                    var badTr = e.target && e.target.closest ? e.target.closest('tr[data-ship-out-id]') : null;
                    if (badTr) e.preventDefault();
                    return;
                }
                var id = handle.getAttribute('data-ship-out-id') || '';
                var from = handle.getAttribute('data-ship-from') || '';
                if (!id) { e.preventDefault(); return; }
                try {
                    e.dataTransfer.setData('text/plain', id);
                    e.dataTransfer.setData('text', id);
                    e.dataTransfer.setData('application/x-paint-ship-from', from);
                    e.dataTransfer.effectAllowed = 'move';
                } catch (err) { /* IE 등 */ }
                handle.style.opacity = '0.45';
                handle.style.cursor = 'grabbing';
                var tr = handle.closest('tr');
                if (tr) tr.style.opacity = '0.45';
            });

            card.addEventListener('dragend', function (e) {
                card.querySelectorAll('.pp-ship-drag-handle, tr[data-ship-out-id]').forEach(function (el) {
                    el.style.opacity = '';
                    if (el.classList && el.classList.contains('pp-ship-drag-handle')) el.style.cursor = 'grab';
                });
                card.style.outline = '';
                card.style.boxShadow = '';
                ['A', 'B'].forEach(function (s) {
                    var c = document.getElementById('ppShipCard' + s);
                    if (c) { c.style.outline = ''; c.style.boxShadow = ''; }
                });
            });

            card.addEventListener('dragover', function (e) {
                if (!e.dataTransfer) return;
                e.preventDefault();
                e.stopPropagation();
                try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
                card.style.outline = '2px dashed ' + accent;
                card.style.boxShadow = '0 0 0 3px ' + accent + '22';
            });

            card.addEventListener('dragleave', function (e) {
                if (e.relatedTarget && card.contains(e.relatedTarget)) return;
                card.style.outline = '';
                card.style.boxShadow = '';
            });

            card.addEventListener('drop', function (e) {
                e.preventDefault();
                e.stopPropagation();
                card.style.outline = '';
                card.style.boxShadow = '';
                var outId = '';
                var from = '';
                try {
                    outId = (e.dataTransfer && (e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'))) || '';
                    from = (e.dataTransfer && e.dataTransfer.getData('application/x-paint-ship-from')) || '';
                } catch (err) { outId = ''; }
                if (!outId) {
                    UIUtils.toast('이동할 항목을 인식하지 못했습니다. ⋮⋮ 핸들로 다시 드래그해 주세요.', 'warning');
                    return;
                }
                if (from && typeof PaintingInputModule !== 'undefined'
                    && PaintingInputModule.normLine(from) === toLine) {
                    UIUtils.toast('이미 ' + toLine + ' 목록입니다.', 'info');
                    return;
                }
                moveShipmentToLine(outId, toLine);
            });
        });
    }

    async function moveShipmentToLine(outId, toLine) {
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.moveShipmentLine) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        var updated = await PaintingInputModule.moveShipmentLine(outId, toLine);
        if (updated) refreshShipments();
    }

    async function confirmInputInbound(outId, line) {
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.confirmSiteInbound) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        PaintingInputModule.confirmSiteInbound(outId, line || '도장-A');
    }

    function render(container) {
        var today = UIUtils.today();
        var plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];
        var works = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        var dashA = _planDashForLine('도장-A', today, plans, works);
        var dashB = _planDashForLine('도장-B', today, plans, works);

        container.innerHTML =
            '<div class="fade-in-up">' +
                (typeof PaintingNavUI !== 'undefined' ? PaintingNavUI.render('painting-process', '') : '') +

                '<div style="margin:4px 0 10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">' +
                    '<h3 style="margin:0;font-size:1rem;">금일 생산계획</h3>' +
                    '<span style="font-size:0.8rem;color:var(--text-muted);">' + _esc(today) + ' · 라인별 리스트 · 좌 A / 우 B</span>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;align-items:start;">' +
                    _planSectionHtml('도장-A', '#2563eb', 'painting-work-a', today, plans, works) +
                    _planSectionHtml('도장-B', '#ea580c', 'painting-work-b', today, plans, works) +
                '</div>' +

                '<div style="margin:4px 0 10px;display:flex;align-items:baseline;gap:8px;">' +
                    '<h3 style="margin:0;font-size:1rem;">금일 실적 입력 현황</h3>' +
                    '<span style="font-size:0.8rem;color:var(--text-muted);">' + _esc(today) + ' · 생산계획 대비</span>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">' +
                    _dashCard('도장-A', '#2563eb', 'painting-work-a', dashA) +
                    _dashCard('도장-B', '#ea580c', 'painting-work-b', dashB) +
                '</div>' +

                '<div style="margin:4px 0 10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">' +
                    '<h3 style="margin:0;font-size:1rem;">금일 현장 입고 자재 목록</h3>' +
                    '<span style="font-size:0.8rem;color:var(--text-muted);">자재 창고 출고 시간 기준 · 좌 A / 우 B · <strong style="color:var(--text-secondary);">⋮⋮ 핸들 드래그로 라인 이동</strong>(입고 완료 건 제외)</span>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;">' +
                    _shipmentSectionHtml('도장-A', '#2563eb') +
                    _shipmentSectionHtml('도장-B', '#ea580c') +
                '</div>' +
            '</div>';

        _bindShipmentDnD();
    }

    return {
        render: render,
        init: render,
        confirmInputInbound: confirmInputInbound,
        moveShipmentToLine: moveShipmentToLine,
        openPlanWork: openPlanWork,
        refreshShipments: refreshShipments
    };
})();

// ===================================================================
// 도장 입고
// ===================================================================
const PaintingIncomingModule = (function() {
    const STORE = DB.STORES.PAINTING_INCOMING;

    function _getNotifyUsersByRole() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce(function(map, role) {
            map[role.key] = role;
            return map;
        }, {});
        return users
            .filter(function(user) { return user && user.active !== false; })
            .map(function(user) {
                const role = roleMap[user.role] || null;
                return {
                    id: String(user.id || ''),
                    name: String(user.displayName || user.username || user.id || ''),
                    role: String(user.role || ''),
                    roleLabel: role ? role.label : String(user.role || '미지정'),
                    roleColor: role ? role.color : 'var(--text-muted)'
                };
            });
    }

    function _buildNotifySelectorHtml(prefix, helpText) {
        const isPlanNotify = (prefix === 'plan' || prefix === 'editPlan');
        let users = _getNotifyUsersByRole();
        if (isPlanNotify) users = users.filter(function(u) { return u.role === 'prod_manager'; });
        if (!users.length) {
            return '<div style="margin-top:10px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 통보 대상 사용자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(function(user) {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(function(key) {
            const group = groups[key];
            return '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<div style="font-size:0.72rem;font-weight:700;color:' + group.color + ';">' + group.label + '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:5px;">' +
                group.items.map(function(user) {
                    return '<label style="display:flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(239,68,68,0.18);border-radius:6px;background:#fff;cursor:pointer;">' +
                        '<input type="checkbox" class="' + prefix + '-notify-user" value="' + user.id + '" style="width:13px;height:13px;accent-color:#dc2626;flex-shrink:0;">' +
                        '<span style="font-size:0.76rem;color:var(--text-primary);font-weight:600;">' + user.name + '</span>' +
                        '</label>';
                }).join('') +
                '</div>' +
                '</div>';
        }).join('');
        return '<div style="margin-top:8px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:7px 8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">' +
            '<div style="font-size:0.76rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.toggleNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:5px;">' + helpText + '</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;">' + roleBlocks + '</div>' +
            '</div>';
    }

    function _getSelectedNotifyUsers(prefix) {
        return Array.from(document.querySelectorAll('.' + prefix + '-notify-user:checked'))
            .map(function(el) { return String(el.value || '').trim(); })
            .filter(Boolean);
    }

    function toggleNotifyUsers(prefix, forceCheck) {
        const checks = Array.from(document.querySelectorAll('.' + prefix + '-notify-user'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(function(check) { return !check.checked; });
        checks.forEach(function(check) { check.checked = shouldCheck; });
    }

    function _sendManagerNotification(title, body, recipientIds) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return;
        AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: title,
            body: body,
            category: 'manager_notice',
            priority: 'high'
        });
        if (typeof AuthModule.saveProdNotifyRecipients === 'function') {
            AuthModule.saveProdNotifyRecipients(recipientIds);
        }
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingIncomingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 입고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="piStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="piEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingIncomingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>입고일</th>
                                        <th>품명</th>
                                        <th>LOT번호</th>
                                        <th>수량</th>
                                        <th>비고</th>
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

    function search() {
        const start = document.getElementById('piStart').value;
        const end = document.getElementById('piEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('piTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td>${d.lotNo || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.note || '-'}</td>
                <td></td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장 입고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고일</label>
                    <input type="date" class="form-input" id="addPiDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">LOT번호</label>
                    <input type="text" class="form-input" id="addPiLot" placeholder="LOT번호">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPiPart" placeholder="품명">
                </div>
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPiQty" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPiNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingIncomingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPiDate').value,
            lotNo: document.getElementById('addPiLot').value.trim(),
            partName: document.getElementById('addPiPart').value.trim(),
            quantity: Number(document.getElementById('addPiQty').value) || 0,
            note: document.getElementById('addPiNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 사출 창고에서 출고 처리 — 원본 입고를 찾아 차종·컬러를 그대로 승계한다.
        // (차종/컬러 없이 기록하면 사출창고에 정체불명의 품목이 생긴다)
        const _injAll = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const _origIn = _injAll.find(function(r) {
            if (r.type === '출고' || r.partName !== data.partName) return false;
            if (r.lotNo === data.lotNo) return true;
            return Array.isArray(r.lots) && r.lots.some(function(l) { return String(l && l.lotNo) === String(data.lotNo); });
        });

        if (!_origIn) {
            UIUtils.toast(
                `사출창고에 입고되지 않은 LOT입니다: ${data.partName} / LOT ${data.lotNo}\n` +
                `사출 입고를 먼저 등록하세요.`,
                'error'
            );
            return;
        }

        await Storage.add(DB.STORES.INJECTION_INVENTORY, {
            date: InvCalc.stampFor(data.date),
            lotNo: data.lotNo,
            partName: data.partName,
            carModel: _origIn.carModel || '',
            color: _origIn.color || '',
            quantity: data.quantity,
            lots: [{ lotNo: data.lotNo, qty: data.quantity }],
            type: '출고',
            source: '도장 입고'
        });

        // 계보 확정 — 사출 LOT·수입검사일을 이 시점 값으로 레코드에 박아 저장한다.
        // 이후 수입검사 기록이 삭제·수정돼도 이 도장 입고 건의 이력은 바뀌지 않는다.
        // (매번 품명+LOT으로 조회하면 LOT 재사용 오매칭·소급 변경·이력 끊김이 발생)
        if (typeof Trace !== 'undefined') {
            data.trace = Trace.merge(_origIn && _origIn.trace, Trace.buildInjStage({
                partName: data.partName,
                lotNo: data.lotNo,
                carModel: _origIn.carModel || '',
                color: _origIn.color || '',
                invRecord: _origIn
            }));
            // 화면·조회 호환용 평면 필드 (기존 폴백 로직이 그대로 읽을 수 있게)
            const _injTrace = (data.trace && data.trace.inj) || {};
            if (_injTrace.inspDate) data.inspDate = _injTrace.inspDate;
            if (_injTrace.inspId) data.inspId = _injTrace.inspId;
        }

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장 입고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    // 제품 마스터의 process1~4 중 실제 작업 라인(도장-A/도장-B)과 정확히 일치하는 슬롯의 CVT를 우선 조회.
    // 일치하는 슬롯이 없으면(구버전 데이터 등) 기존 방식대로 '도장'이 포함된 첫 슬롯 → cvt1 순으로 폴백한다.
    function _getProductCvtForLine(prod, lineName) {
        if (!prod) return 0;
        if (lineName) {
            for (let i = 1; i <= 4; i++) {
                if ((prod['process' + i] || '') === lineName) {
                    const v = Number(prod['cvt' + i]) || 0;
                    if (v) return v;
                }
            }
        }
        for (let i = 1; i <= 4; i++) {
            if ((prod['process' + i] || '').includes('도장')) {
                const v = Number(prod['cvt' + i]) || 0;
                if (v) return v;
            }
        }
        return Number(prod.cvt1) || 0;
    }

    function renderWorkList() {
        let data = Storage.getByDateRange(
            STORE,
            (document.getElementById('pwStart') || {}).value || _currentDate,
            (document.getElementById('pwEnd') || {}).value || _currentDate
        ).sort((a, b) => {
            const aReg = a.registeredAt || '', bReg = b.registeredAt || '';
            if (bReg && aReg) return bReg.localeCompare(aReg);
            const dc = b.date.localeCompare(a.date);
            return dc !== 0 ? dc : (b.startTime || '').localeCompare(a.startTime || '');
        });

        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');
        const filterCarModel = carModelSel ? carModelSel.value : '';
        const filterPartName = partNameSel ? partNameSel.value : '';
        if (filterCarModel) data = data.filter(d => d.carModel === filterCarModel);
        if (filterPartName) data = data.filter(d => d.partName === filterPartName);

        const totalInput = data.reduce((s, d) => s + _workQtys(d).inputQty, 0);
        const totalProd = data.reduce((s, d) => s + _workQtys(d).productionQty, 0);
        const totalLoss = data.reduce((s, d) => {
            const q = _workQtys(d);
            return s + (q.inputQty - q.productionQty);
        }, 0);
        const totalReports = data.reduce((s, d) => s + ((d.planReason || d.qtyDiffReason) ? 1 : 0), 0);

        const statsEl = document.getElementById('pwStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalInput)}</div>
                    <div class="stat-card-label">투입 수량</div>
                </div>
                <div class="stat-card cyan">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalProd)}</div>
                    <div class="stat-card-label">산출 수량</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalLoss)}</div>
                    <div class="stat-card-label">공정 LOSS 수량</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalReports)}</div>
                    <div class="stat-card-label">이상보고 건수</div>
                </div>`;
        }

        const tbody = document.getElementById('pwTableBody');
        if (!tbody) return;

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:36px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        const users = (typeof AuthModule !== 'undefined' && typeof AuthModule.getUsers === 'function')
            ? (AuthModule.getUsers() || [])
            : [];

        tbody.innerHTML = data.map(d => {
            const lotDisplay = (() => {
                if (d.lots && d.lots.length > 0) {
                    return d.lots.map(l =>
                        '<span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;display:inline-block;margin:1px 2px 1px 0;">' +
                        l.lotNo +
                        (l.qty ? '<span style="color:var(--text-muted);margin-left:3px;">(' + UIUtils.formatNumber(l.qty) + ')</span>' : '') +
                        '</span>'
                    ).join('');
                }
                return d.lotNo
                    ? '<span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:0.78rem;font-family:monospace;">' + d.lotNo + '</span>'
                    : '-';
            })();

            const timeStr = d.startTime ? d.startTime + (d.endTime ? '~' + d.endTime : '') : '-';
            const ctStr = d.avgCT > 0
                ? '<span style="color:var(--accent-blue);font-size:0.82rem;">' + d.avgCT.toFixed(1) + '초</span>'
                : '-';

            const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            const _prod = _products.find(p => p.carModel === d.carModel && p.partName === d.partName);
            const _cvt = _getProductCvtForLine(_prod, d.line);

            const inputQty = _workQtys(d).inputQty;
            const productionQty = _workQtys(d).productionQty;
            const processLoss = inputQty - productionQty;
            const _spindle = (_cvt > 0 && inputQty > 0) ? Math.ceil(inputQty / _cvt) : 0;
            const cvtStr = _cvt > 0
                ? '<span style="font-weight:700;color:var(--accent-blue);">' + _cvt + '</span>'
                : '<span style="color:var(--text-muted);">-</span>';
            const spindleStr = _spindle > 0
                ? '<span style="font-weight:700;color:var(--accent-green);">' + UIUtils.formatNumber(_spindle) + '</span>' +
                  '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' + UIUtils.formatNumber(inputQty) + '첨' + _cvt + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            const recipientNames = function(ids) {
                return (ids || []).map(function(id) {
                    const user = users.find(function(row) { return String(row.id) === String(id); });
                    return user ? (user.displayName || user.username || user.id) : String(id || '');
                }).filter(Boolean).join(', ');
            };
            const reportItems = [];
            if (d.planReason || d.planReasonDetail) {
                reportItems.push(
                    '<div style="display:flex;flex-direction:column;gap:2px;">' +
                    '<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;width:max-content;">계획 미달</span>' +
                    '<div style="font-size:0.76rem;color:var(--text-primary);">' + (d.planReason || '-') + (d.planReasonDetail ? ' / ' + d.planReasonDetail : '') + '</div>' +
                    (d.planManagerRecipients && d.planManagerRecipients.length ? '<div style="font-size:0.68rem;color:var(--text-muted);">통보: ' + recipientNames(d.planManagerRecipients) + '</div>' : '') +
                    '</div>'
                );
            }
            if (d.qtyDiffReason || d.qtyDiffDetail) {
                reportItems.push(
                    '<div style="display:flex;flex-direction:column;gap:2px;">' +
                    '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;padding:2px 7px;border-radius:999px;font-size:0.68rem;font-weight:700;width:max-content;">투입/산출 차이</span>' +
                    '<div style="font-size:0.76rem;color:var(--text-primary);">' + (d.qtyDiffReason || '-') + (d.qtyDiffDetail ? ' / ' + d.qtyDiffDetail : '') + '</div>' +
                    (d.qtyDiffManagerRecipients && d.qtyDiffManagerRecipients.length ? '<div style="font-size:0.68rem;color:var(--text-muted);">통보: ' + recipientNames(d.qtyDiffManagerRecipients) + '</div>' : '') +
                    '</div>'
                );
            }
            const reportHistory = reportItems.length
                ? '<div style="display:flex;flex-direction:column;gap:6px;min-width:180px;">' + reportItems.join('') + '</div>'
                : '<span style="color:var(--text-muted);">-</span>';

            const isInspectionCompleted = d.inspectionStatus === 'completed';
            const statusBadge = isInspectionCompleted
                ? '<span style="display:inline-block;background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;margin-right:4px;">검사완료</span>'
                : '';
            const overPlanBadge = d.overPlanQty
                ? '<span style="display:inline-block;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="계획수량 초과 등록">초과</span>'
                : '';
            const timeChangeBadge = d.timeReason
                ? '<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="시간변경 ' + (d.timeReason || '') + (d.timeReasonDetail ? ' / ' + d.timeReasonDetail : '') + '">시간변경</span>'
                : '';
            const actionButtons = '<button type="button" class="btn btn-sm btn-outline" onclick="PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">보기</button>';

            const regDate = d.registeredAt ? d.registeredAt.slice(0, 10) : '-';
            const wdParts = (d.date || '').split('-');
            const lotShortInc = d.lots && d.lots.length > 0
                ? d.lots.map(l => l.lotNo).join(' / ')
                : (d.lotNo || '');
            const workDateHtml = wdParts.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + wdParts[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + wdParts[1] + '-' + wdParts[2] + '</span>' +
                  (lotShortInc ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;font-family:monospace;">' + lotShortInc + '</div>' : '')
                : (d.date || '-');

            return '<tr style="' + (isInspectionCompleted ? 'background:rgba(22,163,74,0.05);' : '') + '">' +
                '<td style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">' + regDate + '</td>' +
                '<td style="line-height:1.3;">' + workDateHtml + '</td>' +
                '<td>' + (d.line || '-') + '</td>' +
                '<td>' + (d.carModel || '-') + '</td>' +
                '<td>' + (d.partName || '-') + '</td>' +
                '<td>' + (d.color || '-') + '</td>' +
                '<td style="text-align:right;">' + UIUtils.formatNumber(inputQty) + '</td>' +
                '<td style="text-align:right;font-weight:600;">' + UIUtils.formatNumber(productionQty) + '</td>' +
                '<td style="text-align:right;color:' + (processLoss > 0 ? 'var(--accent-red)' : (processLoss < 0 ? 'var(--accent-blue)' : 'var(--text-primary)')) + ';font-weight:700;">' + UIUtils.formatNumber(processLoss) + '</td>' +
                '<td>' + reportHistory + '</td>' +
                '<td style="font-size:0.82rem;white-space:nowrap;">' + timeStr + '</td>' +
                '<td style="text-align:right;">' + ctStr + '</td>' +
                '<td style="text-align:center;">' + cvtStr + '</td>' +
                '<td style="text-align:right;">' + spindleStr + '</td>' +
                '<td style="white-space:nowrap;">' + overPlanBadge + timeChangeBadge + statusBadge + actionButtons + '</td></tr>';
        }).join('');
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('?곗씠?곌? ?놁뒿?덈떎.', 'warning');
            return;
        }
        const headers = ['작업일', '라인', '차종', '품명', '컬러', '사출LOT', '투입수량', '산출 수량', '공정 LOSS 수량', '이상보고 이력', '투입인원', '시작시간', '완료시간', '평균CT(초)', '비고'];
        const rows = data.map(d => {
            const lotStr = (d.lots && d.lots.length > 0)
                ? d.lots.map(l => l.lotNo + (l.qty ? '(' + l.qty + ')' : '')).join(' / ')
                : (d.lotNo || '');
            const reportHistory = [
                d.planReason ? ('계획 미달: ' + d.planReason + (d.planReasonDetail ? ' / ' + d.planReasonDetail : '')) : '',
                d.qtyDiffReason ? ('투입/산출 차이: ' + d.qtyDiffReason + (d.qtyDiffDetail ? ' / ' + d.qtyDiffDetail : '')) : ''
            ].filter(Boolean).join(' | ');
            return [d.date, d.line, d.carModel, d.partName, d.color, lotStr, d.inputQty, d.productionQty, (Number(d.inputQty) || 0) - (Number(d.productionQty) || 0), reportHistory, d.workers || 0, d.startTime || '', d.endTime || '', d.avgCT || 0, d.note || ''];
        });
        Storage.exportToCSV(headers, rows, '?꾩옣?묒뾽?쇱?');
        UIUtils.toast('?대낫?닿린 ?꾨즺', 'success');
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();


// ===================================================================
// 도장 작업일지
// ===================================================================
const PaintingWorkModule = (function() {
    const STORE = DB.STORES.PAINTING_WORK;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const INJ_INV_STORE = DB.STORES.INJECTION_INVENTORY;
    const INJECTMAT_STORE = DB.STORES.INJECTION_MATERIALS;

    // 현재 선택된 날짜/라인 (모듈 내 상태)
    let _currentDate = '';
    let _currentLine = '도장-A';
    let _autoInboundTimer = null;
    let _qualityIssueWatchTimer = null;
    let _qualityIssueWatchLoading = false;

    function _normalizePaintLine(line) {
        var s = String(line || '').trim();
        if (!s) return '';
        if (/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(s)) return '도장-B';
        if (/도장[-\s]?A|\(A\)|A\s*라인|^A$/i.test(s)) return '도장-A';
        return s;
    }

    function _resolvePaintLine(line) {
        return _normalizePaintLine(line) === '도장-B' ? '도장-B' : '도장-A';
    }

    function _pageIdForLine(line) {
        return _resolvePaintLine(line) === '도장-B' ? 'painting-work-b' : 'painting-work-a';
    }

    function _lineAccent(line) {
        return _resolvePaintLine(line) === '도장-B' ? 'var(--accent-orange)' : 'var(--accent-blue)';
    }

    function _lineDomSuffix(line) {
        return _resolvePaintLine(line) === '도장-B' ? 'B' : 'A';
    }

    function _matchesCurrentLine(rawLine) {
        var normalized = _normalizePaintLine(rawLine);
        if (_currentLine === '도장-B') return normalized === '도장-B';
        // A 페이지: 명시적 B가 아니면 A(또는 미지정)로 취급
        return normalized !== '도장-B';
    }

    function _isPaintAdmin() {
        return typeof AuthModule !== 'undefined'
            && typeof AuthModule.isAdminUser === 'function'
            && AuthModule.isAdminUser();
    }

    const UNENTERED_NOTIFY_SENT_KEY = 'unentered_work_notify_sent_v1';
    let _unenteredNotifySent = null;
    let _unenteredNotifySentLoading = null;
    let _unenteredNotifyTimer = null;
    let _unenteredNotifyVisitSent = {};

    function _unenteredNotifyKind() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.unenteredWorkNotifyKindForLine === 'function') {
            return AuthModule.unenteredWorkNotifyKindForLine(_currentLine);
        }
        return _currentLine === '도장-B' ? 'unentered_work_b' : 'unentered_work_a';
    }

    function _overdueInboundNotifyKind() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.overdueInboundNotifyKindForLine === 'function') {
            return AuthModule.overdueInboundNotifyKindForLine(_currentLine);
        }
        return _currentLine === '도장-B' ? 'overdue_inbound_b' : 'overdue_inbound_a';
    }

    function _loadUnenteredNotifySent() {
        if (_unenteredNotifySent) return Promise.resolve(_unenteredNotifySent);
        if (_unenteredNotifySentLoading) return _unenteredNotifySentLoading;
        if (typeof Storage === 'undefined' || !Storage.getConfigValue) {
            _unenteredNotifySent = {};
            return Promise.resolve(_unenteredNotifySent);
        }
        _unenteredNotifySentLoading = Promise.resolve(Storage.getConfigValue(UNENTERED_NOTIFY_SENT_KEY))
            .then(function (raw) {
                _unenteredNotifySent = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
                return _unenteredNotifySent;
            })
            .catch(function () {
                _unenteredNotifySent = {};
                return _unenteredNotifySent;
            })
            .then(function (map) {
                _unenteredNotifySentLoading = null;
                return map;
            });
        return _unenteredNotifySentLoading;
    }

    function _sendPeriodicNotify(kind, list, opts) {
        opts = opts || {};
        const rows = Array.isArray(list) ? list.filter(Boolean) : [];
        if (!rows.length) return;
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        if (!kind) return;
        const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
            ? AuthModule.getIncomingInspNotifyRecipientIds(kind)
            : [];
        if (!recipients.length) return;
        const today = UIUtils.today();
        const interval = (typeof AuthModule.getIncomingInspNotifyInterval === 'function')
            ? AuthModule.getIncomingInspNotifyInterval(kind)
            : { mode: 'daily', hours: 4 };
        const mode = interval && interval.mode ? interval.mode : 'daily';
        const idOf = typeof opts.idOf === 'function'
            ? opts.idOf
            : function (r) { return String((r && r.id) || '').trim(); };
        if (mode === 'every_open' && _unenteredNotifyVisitSent[kind]) return;
        const logLabel = opts.logLabel || '주기 알림';
        _loadUnenteredNotifySent().then(function () {
            const sentMap = _unenteredNotifySent && typeof _unenteredNotifySent === 'object' ? _unenteredNotifySent : {};
            const byKind = (sentMap[kind] && typeof sentMap[kind] === 'object') ? sentMap[kind] : {};
            const due = function (id) {
                if (typeof AuthModule.shouldRepeatIncomingInspNotify === 'function') {
                    return AuthModule.shouldRepeatIncomingInspNotify(kind, byKind[id]);
                }
                return String(byKind[id] || '').slice(0, 10) !== today;
            };
            const fresh = rows.filter(function (r) {
                const id = idOf(r);
                if (!id) return false;
                return due(id);
            });
            if (!fresh.length) {
                if (mode === 'every_open') _unenteredNotifyVisitSent[kind] = true;
                return;
            }
            const next = sentMap;
            const nextKind = Object.assign({}, byKind);
            const liveIds = {};
            rows.forEach(function (r) {
                const id = idOf(r);
                if (id) liveIds[id] = true;
            });
            Object.keys(nextKind).forEach(function (id) {
                if (liveIds[id]) return;
                const ts = Date.parse(nextKind[id]);
                if (!isFinite(ts) || (Date.now() - ts) > 48 * 3600000) delete nextKind[id];
            });
            const sentAt = new Date().toISOString();
            fresh.forEach(function (r) {
                const id = idOf(r);
                if (id) nextKind[id] = sentAt;
            });
            next[kind] = nextKind;
            _unenteredNotifySent = next;
            if (mode === 'every_open') _unenteredNotifyVisitSent[kind] = true;
            const lines = fresh.map(opts.formatLine).filter(Boolean);
            try {
                AuthModule.sendInternalMessage({
                    targetType: 'user',
                    targetIds: recipients,
                    title: opts.title,
                    body: [opts.intro, '', lines.join('\n')].filter(Boolean).join('\n'),
                    category: kind,
                    priority: 'high'
                });
            } catch (e) {
                console.warn('[PaintingWork] ' + logLabel + ' 통보 실패:', e);
                return;
            }
            if (typeof Storage !== 'undefined' && Storage.setConfigValue) {
                Storage.setConfigValue(UNENTERED_NOTIFY_SENT_KEY, next).catch(function (e) {
                    console.warn('[PaintingWork] ' + logLabel + ' 통보 기록 저장 실패:', e);
                });
            }
        }).catch(function (e) {
            console.warn('[PaintingWork] ' + logLabel + ' 통보 실패:', e);
        });
    }

    function _notifyUnenteredPlans(unentered) {
        _sendPeriodicNotify(_unenteredNotifyKind(), unentered, {
            logLabel: '실적 미입력',
            title: _currentLine + ' 실적 미입력 계획',
            intro: '하루 이상 지난 계획 중 도장 작업실적이 없는 항목입니다. ' + _currentLine + ' 작업에서 확인해 주세요.',
            formatLine: function (p) {
                const day = _planDayKey(p);
                const timeStr = p.startTime ? (p.startTime + '~' + (p.endTime || '')) : (p.slot || '-');
                const hasInbound = _hasConfirmedSiteInboundForPlan(p, day);
                return '- ' + day + ' ' + timeStr +
                    ' · ' + (p.carModel || '-') + ' / ' + (p.partName || '-') +
                    (p.color ? ' / ' + p.color : '') +
                    ' · ' + (hasInbound ? '미입력 실적' : '소재 입고 필요') +
                    ' · 계획 ' + UIUtils.formatNumber(p.planQty || 0);
            }
        });
    }

    function _notifyOverdueInbound(pending) {
        _sendPeriodicNotify(_overdueInboundNotifyKind(), pending, {
            logLabel: '이전 날짜 미입고',
            title: _currentLine + ' 이전 날짜 미입고 대기',
            intro: '이전에 출고됐지만 아직 현장 입고 확인이 안 된 건입니다. ' + _currentLine + ' 작업에서 「입고 처리」해 주세요.',
            formatLine: function (r) {
                const lotsTxt = (Array.isArray(r.lots) && r.lots.length)
                    ? r.lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean).join(', ')
                    : String(r.lotNo || '').trim();
                return '- ' + String(r.date || '').slice(0, 10) +
                    ' · ' + (r.carModel || '-') + ' / ' + (r.partName || '-') +
                    (r.color ? ' / ' + r.color : '') +
                    (lotsTxt ? ' · LOT ' + lotsTxt : '') +
                    ' · ' + UIUtils.formatNumber(r.quantity || r.qty || 0) + ' EA';
            }
        });
    }

    /** 이미 현장에 확인된(사용일만 잘못 잡힌) 입고를 지난 계획일로 재연결하는 권한.
     *  관리자보다 낮은 문턱 — 실물이 이미 도착·확인된 재고의 사용일 메타데이터만 바꾸는
     *  것이라(새 재고를 만드는 "관리자 수기 입고"와 달리) 도장 실적을 입력할 수 있는
     *  사람이면 누구나 처리할 수 있어야 한다. 그렇지 않으면 "실적 미입력 계획" 목록에서
     *  자재가 이미 도착해 있어도 관리자가 없으면 아무도 실적을 입력할 방법이 없다. */
    function _canCorrectPastInbound() {
        if (_isPaintAdmin()) return true;
        return typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function' &&
            (AuthModule.canWritePage('painting-work-a') ||
             AuthModule.canWritePage('painting-work-b') ||
             AuthModule.canWritePage('painting-work'));
    }

    function _workActorLabel(user) {
        if (!user) return '';
        return String(user.displayName || user.name || user.username || user.id || '').trim();
    }

    function _workActorId(user) {
        if (!user) return '';
        return String(user.id || user.username || '').trim();
    }

    /** 작업 실적 등록자 표시명 (createdBy / registeredBy 호환) */
    function _workRegisteredByName(rec) {
        if (!rec) return '';
        var named = String(rec.registeredByName || rec.createdByName || '').trim();
        if (named) return named;
        var by = rec.registeredBy || rec.createdBy || rec.updatedBy || null;
        if (typeof by === 'string') return by.trim();
        if (by && typeof by === 'object') {
            return String(by.name || by.displayName || by.username || by.id || '').trim();
        }
        return '';
    }

    // 수량 파싱: 콤마/공백 제거 후 정수화 (문자열 연결 방지)
    function _toQty(value) {
        if (value == null || value === '') return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
        const cleaned = String(value).replace(/,/g, '').replace(/\s+/g, '').trim();
        if (!cleaned) return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
    }

    /**
     * 깨진 완료수량 복구
     * - "10949"+"17882" → 1094917882 같은 문자열 연결
     * - 잘못 잘린 17882처럼 LOT/투입과 불일치하는 값
     * 원칙: 사출 LOT 합계·투입수량이 일치하면 완료수량은 그 값을 우선한다.
     */
    function _lotTotalOf(work) {
        if (!work) return 0;
        if (Array.isArray(work.lots) && work.lots.length) {
            return work.lots.reduce((s, l) => s + _toQty(l.qty), 0);
        }
        return 0;
    }

    function _repairProductionQty(inputQty, productionQty, lotTotal) {
        const input = _toQty(inputQty);
        let prod = _toQty(productionQty);
        const lots = _toQty(lotTotal);
        if (!prod) {
            // 완료수량 없으면 LOT/투입으로 채우지 않음 (미입력 유지)
            return 0;
        }
        if (!input && !lots) return prod;

        // 1) 문자열 연결 감지: 완료수량이 투입수량으로 시작하는 비정상 거대값
        //    → 접미사(17882)가 아니라 투입수량으로 복구
        if (input && prod > input * 3) {
            const inputStr = String(input);
            const prodStr = String(prod);
            if (prodStr.length > inputStr.length && prodStr.startsWith(inputStr)) {
                return lots > 0 ? lots : input;
            }
            if (prod > input * 10) {
                return lots > 0 ? lots : input;
            }
        }

        // 2) LOT 합계 = 투입수량인데 완료수량만 다른 경우 (이미 잘못 복구된 17882 등)
        if (lots > 0 && input > 0 && lots === input && prod !== input) {
            if (prod > input || Math.abs(prod - input) / input > 0.2) {
                return input;
            }
        }

        // 3) LOT만 있고 완료가 LOT와 크게 다르며 투입과도 불일치
        if (lots > 0 && prod > lots * 3 && (!input || prod > input * 3)) {
            return lots;
        }

        return prod;
    }

    function _workQtys(work) {
        const inputQty = _toQty(work && work.inputQty);
        const lotTotal = _lotTotalOf(work);
        const productionQty = _repairProductionQty(inputQty, work && work.productionQty, lotTotal);
        return { inputQty, productionQty, lotTotal };
    }

    // 제품 마스터의 process1~4 중 실제 작업 라인(도장-A/도장-B)과 정확히 일치하는 슬롯의 CVT를 우선 조회.
    // 일치하는 슬롯이 없으면(구버전 데이터 등) 기존 방식대로 '도장'이 포함된 첫 슬롯 → cvt1 순으로 폴백한다.
    function _getProductCvtForLine(prod, lineName) {
        if (!prod) return 0;
        if (lineName) {
            for (let i = 1; i <= 4; i++) {
                if ((prod['process' + i] || '') === lineName) {
                    const v = Number(prod['cvt' + i]) || 0;
                    if (v) return v;
                }
            }
        }
        for (let i = 1; i <= 4; i++) {
            if ((prod['process' + i] || '').includes('도장')) {
                const v = Number(prod['cvt' + i]) || 0;
                if (v) return v;
            }
        }
        return Number(prod.cvt1) || 0;
    }

    function _getNotifyUsersByRole() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce(function(map, role) {
            map[role.key] = role;
            return map;
        }, {});
        return users
            .filter(function(user) { return user && user.active !== false; })
            .map(function(user) {
                const role = roleMap[user.role] || null;
                return {
                    id: String(user.id || ''),
                    name: String(user.displayName || user.username || user.id || ''),
                    role: String(user.role || ''),
                    roleLabel: role ? role.label : String(user.role || ''),
                    roleColor: role ? role.color : 'var(--text-muted)'
                };
            });
    }

    function _buildNotifySelectorHtml(prefix, helpText, selectedIds) {
        const isPlanNotify = (prefix === 'plan' || prefix === 'editPlan');
        let users = _getNotifyUsersByRole();
        if (isPlanNotify) users = users.filter(function(u) { return u.role === 'prod_manager'; });
        if (!users.length) {
            return '<div style="margin-top:10px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">선택 가능한 통보 대상 사용자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(function(user) {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(function(key) {
            const group = groups[key];
            return '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<div style="font-size:0.72rem;font-weight:700;color:' + group.color + ';">' + group.label + '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:5px;">' +
                group.items.map(function(user) {
                    const checked = (typeof AuthModule !== 'undefined' && AuthModule.shouldPrecheckProdNotify)
                        ? AuthModule.shouldPrecheckProdNotify(user.id, { explicitIds: selectedIds, defaultChecked: false })
                        : false;
                    return '<label style="display:flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(239,68,68,0.18);border-radius:6px;background:#fff;cursor:pointer;">' +
                        '<input type="checkbox" class="' + prefix + '-notify-user" value="' + user.id + '"' +
                        (checked ? ' checked' : '') +
                        ' style="width:13px;height:13px;accent-color:#dc2626;flex-shrink:0;">' +
                        '<span style="font-size:0.76rem;color:var(--text-primary);font-weight:600;">' + user.name + '</span>' +
                        '</label>';
                }).join('') +
                '</div>' +
                '</div>';
        }).join('');
        return '<div style="margin-top:8px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:7px 8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">' +
            '<div style="font-size:0.76rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.toggleNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:5px;">' + helpText +
            ' 선택한 담당자는 저장되어 다음에도 미리 선택됩니다.</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;">' + roleBlocks + '</div>' +
            '</div>';
    }

    function _getSelectedNotifyUsers(prefix) {
        return Array.from(document.querySelectorAll('.' + prefix + '-notify-user:checked'))
            .map(function(el) { return String(el.value || '').trim(); })
            .filter(Boolean);
    }

    function toggleNotifyUsers(prefix, forceCheck) {
        const checks = Array.from(document.querySelectorAll('.' + prefix + '-notify-user'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(function(check) { return !check.checked; });
        checks.forEach(function(check) { check.checked = shouldCheck; });
    }

    function _sendManagerNotification(title, body, recipientIds) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return;
        AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: title,
            body: body,
            category: 'manager_notice',
            priority: 'high'
        });
        if (typeof AuthModule.saveProdNotifyRecipients === 'function') {
            AuthModule.saveProdNotifyRecipients(recipientIds);
        }
    }

    /** 도장 실적 신규 등록 → 해당 라인 도료사용 미등록 수신자에게 쪽지 */
    function _notifyPaintMixUnregistered(work) {
        if (!work) return;
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        const kind = (typeof AuthModule.paintMixNotifyKindForLine === 'function')
            ? AuthModule.paintMixNotifyKindForLine(work.line)
            : '';
        if (!kind) return;
        const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
            ? AuthModule.getIncomingInspNotifyRecipientIds(kind)
            : [];
        if (!recipients.length) return;
        const line = String(work.line || '-');
        const lotsTxt = (Array.isArray(work.lots) && work.lots.length)
            ? work.lots.map(function (l) { return String((l && l.lotNo) || '').trim(); }).filter(Boolean).join(', ')
            : String(work.lotNo || '').trim();
        try {
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: '도료 사용 미등록 (' + line + ')',
                body: [
                    '도장 작업 실적이 등록되어 도료사용등록이 필요합니다.',
                    '배합작업 → 도료사용등록에서 확인해 주세요.',
                    '',
                    '- ' + line + ' · ' + (work.carModel || '-') + ' / ' + (work.partName || '-') +
                        (work.color ? ' / ' + work.color : '') +
                        ' · ' + UIUtils.formatNumber(work.productionQty || 0) + ' EA' +
                        (lotsTxt ? ' · LOT ' + lotsTxt : '') +
                        (work.date ? ' · ' + String(work.date).slice(0, 10) : '')
                ].join('\n'),
                category: kind,
                priority: 'high'
            });
        } catch (e) {
            console.warn('[PaintingWork] 도료 사용 미등록 통보 실패:', e);
        }
    }

    function _findWorkProduct(work) {
        if (!work || typeof Storage === 'undefined' || !DB.STORES || !DB.STORES.PRODUCTS) return null;
        const prods = Storage.getAll(DB.STORES.PRODUCTS) || [];
        if (work.productId) {
            const byId = prods.find(function (p) { return String(p.id || '') === String(work.productId); });
            if (byId) return byId;
        }
        return prods.find(function (p) {
            return String(p.carModel || '').trim() === String(work.carModel || '').trim()
                && String(p.partName || '').trim() === String(work.partName || '').trim()
                && (!String(work.color || '').trim()
                    || String(p.color || '').trim() === String(work.color || '').trim());
        }) || null;
    }

    function _workGoesToInspectionWaiting(work) {
        if (!work) return false;
        if (!(Number(work.productionQty) > 0)) return false;
        const prod = _findWorkProduct(work);
        if (!prod) return false;
        if (typeof LaserStandbyModule !== 'undefined'
            && typeof LaserStandbyModule.isPaintingWorkLaserStandbyInbound === 'function') {
            if (LaserStandbyModule.isPaintingWorkLaserStandbyInbound(work, prod)) return false;
        }
        return true;
    }

    /** 도장 실적 신규 등록 → 외관 검사 대기품 수신자에게 쪽지 */
    function _notifyInspectionWaiting(work) {
        if (!_workGoesToInspectionWaiting(work)) return;
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
            ? AuthModule.getIncomingInspNotifyRecipientIds('insp_waiting')
            : [];
        if (!recipients.length) return;
        const lotsTxt = (Array.isArray(work.lots) && work.lots.length)
            ? work.lots.map(function (l) { return String((l && l.lotNo) || '').trim(); }).filter(Boolean).join(', ')
            : String(work.lotNo || '').trim();
        try {
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: '외관 검사 대기품 등록',
                body: [
                    '도장 작업 실적이 등록되어 외관 검사 대기품에 올랐습니다. 도장 검사에서 확인해 주세요.',
                    '',
                    '- ' + (work.line || '-') + ' · ' + (work.carModel || '-') + ' / ' + (work.partName || '-') +
                        (work.color ? ' / ' + work.color : '') +
                        ' · ' + UIUtils.formatNumber(work.productionQty || 0) + ' EA' +
                        (lotsTxt ? ' · LOT ' + lotsTxt : '') +
                        (work.date ? ' · ' + String(work.date).slice(0, 10) : '')
                ].join('\n'),
                category: 'insp_waiting',
                priority: 'high'
            });
        } catch (e) {
            console.warn('[PaintingWork] 외관 검사 대기품 통보 실패:', e);
        }
    }

    function renderForLine(container, line) {
        _currentDate = UIUtils.today();
        _currentLine = _resolvePaintLine(line);
        const accent = _lineAccent(_currentLine);
        const suffix = _lineDomSuffix(_currentLine);
        const pageId = _pageIdForLine(_currentLine);

        container.innerHTML = `
            <div class="fade-in-up">
                ${PaintingNavUI.render(pageId)}
                <!-- 페이지 목적 안내 -->
                <div style="margin-bottom:0.75rem;padding:8px 14px;background:rgba(37,99,235,0.05);border-left:3px solid ${accent};border-radius:0 6px 6px 0;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:${accent};margin-right:4px;">info</span>
                    <span style="font-size:0.82rem;color:var(--text-secondary);">
                        <strong style="color:${accent};">${_currentLine}</strong> 완료 작업의 실적을 계획 대비 기록하고 공정 효율을 추적합니다.
                    </span>
                </div>
                <!-- 섹션 1: 생산계획 현황 -->
                <div class="card" style="margin-bottom:1rem;">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">assignment</span>
                            생산계획 현황
                            <span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;color:#fff;background:${accent};">${_currentLine}</span>
                            <span id="pwPlanDateLabel" style="color:var(--text-muted);font-size:0.88rem;margin-left:8px;font-weight:400;"></span>
                        </h4>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                                ? AuthModule.incomingInspNotifyAdminButtonHtml(
                                    (typeof AuthModule.missingInboundNotifyKindForLine === 'function'
                                        ? AuthModule.missingInboundNotifyKindForLine(_currentLine)
                                        : (_currentLine === '도장-B' ? 'missing_inbound_b' : 'missing_inbound_a')),
                                    { small: true, label: '사출 입고 필요 알림 수신자' }
                                  )
                                : ''}
                            <span style="font-size:0.78rem;color:var(--text-muted);">계획 행의 [실적입력]을 클릭하면 해당 계획이 자동 반영됩니다.</span>
                            <button class="btn btn-outline btn-sm" style="font-size:0.78rem;padding:4px 10px;"
                                onclick="PaintingWorkModule.openQuickAddPlanModal('${_currentLine}')">
                                <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 생산계획 추가
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:12px;">
                        <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px;">
                            <table class="data-table compact">
                                <thead>
                                    <tr>
                                        <th style="width:100px;">시간대</th>
                                        <th style="width:90px;">차종</th>
                                        <th>품명</th>
                                        <th style="width:150px;">생산 진행 상황</th>
                                        <th style="text-align:right;width:70px;">계획</th>
                                        <th style="text-align:right;width:70px;">실적</th>
                                        <th style="width:85px;">입력</th>
                                        <th style="width:130px;">입력자 · 시간</th>
                                    </tr>
                                </thead>
                                <tbody id="pwPlanBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 섹션 1.5: 금일 자재창고 출고 → 현장 입고 -->
                <div class="card" style="margin-bottom:1rem;" id="pwInputStockCard${suffix}">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">inventory_2</span>
                            ${_currentLine} 현장 사출 입고 : 금일 현장으로 입고된 사출품
                            <span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;color:#fff;background:${accent};">${_currentLine}</span>
                            <span id="pwInputStockSummary${suffix}" style="font-size:0.75rem;color:var(--text-muted);font-weight:500;margin-left:6px;"></span>
                        </h4>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                                ? AuthModule.incomingInspNotifyAdminButtonHtml(
                                    (typeof AuthModule.siteInboundNotifyKindForLine === 'function'
                                        ? AuthModule.siteInboundNotifyKindForLine(_currentLine)
                                        : (_currentLine === '도장-B' ? 'site_inbound_b' : 'site_inbound_a')),
                                    { small: true }
                                  )
                                : ''}
                            <span style="font-size:0.78rem;color:var(--text-muted);">금일 현장으로 입고된 사출품입니다. 계획 대비 오차를 확인하세요.</span>
                            <button type="button" class="btn btn-sm btn-outline" style="padding:3px 10px;font-size:0.75rem;white-space:nowrap;"
                                onclick="PaintingWorkModule.openMaterialHistory('${_currentLine}')">
                                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">history</span>과거 사출 자재 입고/반납 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:12px;">
                        <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; overflow-x:auto;">
                            <table class="data-table compact" style="width:100%;table-layout:auto;border-collapse:collapse;">
                                <thead>
                                    <tr>
                                        <th style="white-space:nowrap;padding:8px 10px;">입고일</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">시간</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">차종</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">사출명</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">컬러</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">사출LOT</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">수입검사일</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">수량</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">계획수량</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">오차</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">완료시간</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">상태</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwInputStockBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 섹션 1.6: 이전 미입고 대기 (오늘자 표는 "금일"만 보여줘서, 확인 안 하고 지나간
                     날짜의 출고가 화면에서 영영 사라져 보이는 문제를 막기 위한 별도 섹션) -->
                <div class="card" style="margin-bottom:1rem;display:none;border-top:3px solid #ea580c;" id="pwOverdueInputCard${suffix}">
                    <div class="card-header" style="padding:8px 16px;background:rgba(234,88,12,0.06);
                        border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;color:#ea580c;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">warning</span>
                            이전 날짜 미입고 대기 (최근 14일)
                            <span id="pwOverdueInputSummary${suffix}" style="font-size:0.75rem;color:var(--text-muted);font-weight:500;margin-left:6px;"></span>
                        </h4>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                                ? AuthModule.incomingInspNotifyAdminButtonHtml(
                                    (typeof AuthModule.overdueInboundNotifyKindForLine === 'function'
                                        ? AuthModule.overdueInboundNotifyKindForLine(_currentLine)
                                        : (_currentLine === '도장-B' ? 'overdue_inbound_b' : 'overdue_inbound_a')),
                                    { small: true, label: '이전 날짜 미입고 알림' }
                                  )
                                : ''}
                            <span style="font-size:0.78rem;color:var(--text-muted);">"금일 현장 사출 입고" 표는 오늘 날짜만 보여줍니다. 아래는 이전에 출고됐지만 아직 현장 입고 확인이 안 된 건입니다.</span>
                        </div>
                    </div>
                    <div class="card-body" style="padding:12px;">
                        <div class="data-table-wrapper" style="border:1px solid var(--border);border-radius:4px;overflow-x:auto;">
                            <table class="data-table compact" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                                <thead>
                                    <tr>
                                        <th style="white-space:nowrap;padding:8px 10px;">출고일</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">차종</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">사출명</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">컬러</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">사출LOT</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">수량</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwOverdueInputBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 섹션 2: 실적 미입력 계획 -->
                <div id="pwUnenteredSection" class="card" style="margin-bottom:1rem; border-top:3px solid var(--accent-orange); display:none;">
                    <div class="card-header" style="padding:8px 16px; background:rgba(255,152,0,0.05);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0; color:#e65100;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">warning</span>
                            실적 미입력 계획
                            <span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;color:#fff;background:${accent};">${_currentLine}</span>
                        </h4>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                                ? AuthModule.incomingInspNotifyAdminButtonHtml(
                                    (typeof AuthModule.unenteredWorkNotifyKindForLine === 'function'
                                        ? AuthModule.unenteredWorkNotifyKindForLine(_currentLine)
                                        : (_currentLine === '도장-B' ? 'unentered_work_b' : 'unentered_work_a')),
                                    { small: true, label: '실적 미입력 알림' }
                                  )
                                : ''}
                            <span style="font-size:0.75rem;color:var(--text-muted);">하루 이상 지난 계획 중 도장 작업실적이 없는 항목입니다. (당일 미입력은 표시하지 않음 · 계획「완료」≠ 실적 입력)</span>
                        </div>
                    </div>
                    <div class="card-body" style="padding:12px;">
                        <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow-y:auto;">
                            <table class="data-table compact">
                                <thead style="position:sticky; top:0; z-index:1;">
                                    <tr>
                                        <th style="width:90px;">도장 작업일</th>
                                        <th style="width:95px;">시간대</th>
                                        <th>차종/품명</th>
                                        <th style="text-align:right;width:65px;">계획</th>
                                        <th style="width:150px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwUnenteredBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 섹션 2.5: 후공정(레이저) 수량 재확인 필요 -->
                <div id="pwLaserQtyIssueSection" class="card" style="margin-bottom:1rem; border-top:3px solid #dc2626; display:none;">
                    <div class="card-header" style="padding:8px 16px; background:rgba(220,38,38,0.05);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0; color:#dc2626;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">report_problem</span>
                            후공정 수량 재확인 필요
                            <span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;color:#fff;background:${accent};">${_currentLine}</span>
                            <span id="pwLaserQtyIssueCount${suffix}" style="font-size:0.75rem;color:var(--text-muted);font-weight:500;margin-left:6px;"></span>
                        </h4>
                        <span style="font-size:0.78rem;color:var(--text-muted);">레이저 입고 확인 시 실입고수량이 도장 산출수량과 달라 실적 확인이 필요합니다.</span>
                    </div>
                    <div class="card-body" style="padding:8px;">
                        <div class="data-table-wrapper" style="border:1px solid var(--border); border-radius:4px; max-height:280px; overflow:auto;">
                            <table class="data-table data-table--content compact" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:0.8rem;">
                                <thead style="position:sticky; top:0; z-index:1;">
                                    <tr>
                                        <th style="white-space:nowrap;padding:4px 6px;">도장 작업일</th>
                                        <th style="white-space:nowrap;padding:4px 6px;">차종/품명/컬러</th>
                                        <th style="text-align:right;white-space:nowrap;padding:4px 6px;">도장 계획</th>
                                        <th style="text-align:right;white-space:nowrap;padding:4px 6px;">투입</th>
                                        <th style="text-align:right;white-space:nowrap;padding:4px 6px;">완료</th>
                                        <th style="text-align:right;white-space:nowrap;padding:4px 6px;">레이저 대기 실입고 수량</th>
                                        <th style="text-align:right;white-space:nowrap;padding:4px 6px;">오차 발생수</th>
                                        <th style="white-space:nowrap;padding:4px 6px;">실수량 확인자</th>
                                        <th style="white-space:nowrap;padding:4px 6px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwLaserQtyIssueBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 섹션 3: 작업 실적 목록 -->
                <div class="card">
                    <div class="card-header" style="padding:8px 16px; background:var(--bg-secondary);
                        border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;font-size:18px;">format_paint</span>
                            작업 실적 목록
                            <span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;color:#fff;background:${accent};">${_currentLine}</span>
                            <span id="pwWorkCount${suffix}" style="font-size:0.75rem;color:var(--text-muted);font-weight:500;margin-left:6px;">0건</span>
                        </h4>
                        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                            <label class="form-label" style="margin:0; font-size:0.82rem; white-space:nowrap;">기간</label>
                            <input type="date" class="form-input" id="pwStart" value="${UIUtils.daysAgo(7)}" style="width:130px;">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" class="form-input" id="pwEnd" value="${UIUtils.daysAgo(0)}" style="width:130px;">
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">차종</label>
                            <select class="form-select" id="pwFilterCarModel" onchange="PaintingWorkModule.updateWorkPartFilter(true)" style="width:120px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <label class="form-label" style="margin:0 0 0 8px; font-size:0.82rem; white-space:nowrap;">품명</label>
                            <select class="form-select" id="pwFilterPartName" style="width:150px; font-size:0.82rem;">
                                <option value="">전체</option>
                            </select>
                            <button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.renderWorkList()">
                                <span class="material-symbols-outlined" style="font-size:15px;">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:14px;">
                        <div class="data-table-wrapper" style="overflow-x:auto;">
                            <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                                <thead>
                                    <tr>
                                        <th style="white-space:nowrap;padding:8px 10px;">도장작업일</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">실적등록일</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">차종</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">품명</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">컬러</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">계획수량</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">현장입고사출</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">자재 반납</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">자재과잉/유실</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">도장투입수</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">도장완료수</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">후공정입고수</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">오차 수량</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">도장유실수</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">작업시간</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">작업C.T</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">효율</th>
                                        <th style="text-align:center;white-space:nowrap;padding:8px 10px;display:none;">CVT</th>
                                        <th style="text-align:right;white-space:nowrap;padding:8px 10px;">Spindle 수</th>
                                        <th style="white-space:nowrap;padding:8px 10px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pwTableBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        _unenteredNotifyVisitSent = {};
        loadAll();
        _startAutoInboundTimer();
        _startUnenteredNotifyTimer();
        startQualityIssueWatch();
    }

    function _stopAutoInboundTimer() {
        if (_autoInboundTimer) {
            clearInterval(_autoInboundTimer);
            _autoInboundTimer = null;
        }
    }

    function _startAutoInboundTimer() {
        _stopAutoInboundTimer();
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.runAutoSiteInbound) return;
        PaintingInputModule.runAutoSiteInbound(_currentLine);
        _autoInboundTimer = setInterval(function () {
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.runAutoSiteInbound) {
                PaintingInputModule.runAutoSiteInbound(_currentLine);
            }
        }, 30000);
    }

    function _stopUnenteredNotifyTimer() {
        if (_unenteredNotifyTimer) {
            clearInterval(_unenteredNotifyTimer);
            _unenteredNotifyTimer = null;
        }
    }

    function _startUnenteredNotifyTimer() {
        _stopUnenteredNotifyTimer();
        _unenteredNotifyTimer = setInterval(function () {
            const skipIfEveryOpen = function (kind) {
                if (typeof AuthModule === 'undefined' || typeof AuthModule.getIncomingInspNotifyInterval !== 'function') return false;
                const iv = AuthModule.getIncomingInspNotifyInterval(kind);
                return !!(iv && iv.mode === 'every_open');
            };
            if (!skipIfEveryOpen(_unenteredNotifyKind())) {
                const unentered = _collectUnenteredPlans();
                if (unentered.length) _notifyUnenteredPlans(unentered);
            }
            if (!skipIfEveryOpen(_overdueInboundNotifyKind())) {
                const overdue = _collectOverdueInbound();
                if (overdue.length) _notifyOverdueInbound(overdue);
            }
        }, 60000);
    }

    function _ymdShift(ymd, days) {
        var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return '';
        var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        d.setDate(d.getDate() + Number(days || 0));
        var p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function _planStartMsForQuality(plan) {
        var date = String((plan && plan.date) || '');
        var time = String((plan && (plan.startTime || plan.slot)) || '');
        var dm = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        var tm = time.match(/^(\d{1,2}):(\d{2})/);
        if (!dm || !tm) return null;
        var dt = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0);
        var ms = dt.getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    function _hasDueQualityPlansWithoutIssue() {
        var Q_STORE = DB.STORES.PROD_QUALITY_CHECK;
        if (!PLAN_STORE || !Q_STORE) return false;
        var now = Date.now();
        var delayMs = 5 * 60 * 1000;
        var today = UIUtils.today();
        var fromDate = _ymdShift(today, -1);
        var issues = (Storage.getAll(Q_STORE) || []).filter(function (d) {
            return d && (d._docKind || 'quality_issue') === 'quality_issue';
        });
        var issuedPlan = {};
        var issuedWork = {};
        issues.forEach(function (i) {
            if (i.planId) issuedPlan[String(i.planId)] = true;
            if (i.workId) issuedWork[String(i.workId)] = true;
        });
        var workByPlan = {};
        (Storage.getAll(STORE) || []).forEach(function (w) {
            if (w && w.planId) workByPlan[String(w.planId)] = w;
        });
        var plans = Storage.getAll(PLAN_STORE) || [];
        for (var i = 0; i < plans.length; i++) {
            var p = plans[i];
            if (!p || !p.id) continue;
            if (!/도장/.test(String(p.line || ''))) continue;
            if (!(p.carModel || p.partName)) continue;
            if (String(p.status || '') === '취소') continue;
            if (fromDate && p.date && p.date < fromDate) continue;
            var startMs = _planStartMsForQuality(p);
            if (startMs == null || now < startMs + delayMs) continue;
            if (issuedPlan[String(p.id)]) continue;
            var work = workByPlan[String(p.id)];
            if (work && issuedWork[String(work.id)]) continue;
            return true;
        }
        return false;
    }

    function _tickQualityIssueFromPlans() {
        if (typeof ProdQualityModule !== 'undefined' && typeof ProdQualityModule.syncFromStartedPlans === 'function') {
            ProdQualityModule.syncFromStartedPlans();
            return;
        }
        if (!_hasDueQualityPlansWithoutIssue()) return;
        if (_qualityIssueWatchLoading) return;
        if (typeof Router === 'undefined' || typeof Router.ensureLazyLoaded !== 'function') return;
        _qualityIssueWatchLoading = true;
        Router.ensureLazyLoaded('prod-quality').then(function () {
            _qualityIssueWatchLoading = false;
            if (typeof ProdQualityModule !== 'undefined' && typeof ProdQualityModule.syncFromStartedPlans === 'function') {
                ProdQualityModule.syncFromStartedPlans();
            }
        }).catch(function (err) {
            _qualityIssueWatchLoading = false;
            console.warn('[PaintingWork] 초중종물 모듈 로드 실패:', err);
        });
    }

    function startQualityIssueWatch() {
        _tickQualityIssueFromPlans();
        if (_qualityIssueWatchTimer) return;
        _qualityIssueWatchTimer = setInterval(_tickQualityIssueFromPlans, 30000);
    }

    function _attachQualityIssueToWork(work) {
        if (!work || !work.id) return;
        if (typeof ProdQualityModule !== 'undefined' && typeof ProdQualityModule.attachWorkToPlanIssue === 'function') {
            ProdQualityModule.attachWorkToPlanIssue(work).catch(function (e) {
                console.warn('[PaintingWork] 초중종물 실적 연결 실패:', e);
            });
        }
    }

    // 라인 탭 전환
    function setLine(line) {
        _currentLine = _resolvePaintLine(line);
        loadAll();
    }

    function onDateChange() {
        const el = document.getElementById('pwDate');
        if (el) _currentDate = el.value;
        loadAll();
    }

    function loadAll() {
        renderPlanSummary();
        renderInputStockSection();
        renderOverdueInputStockSection();
        renderLaserQtyIssueSection();
        renderUnenteredPlans();
        renderWorkList();
    }

    // 레이저 입고 확인 시 산출-실입고 오차가 발견된 작업일지를 "실적 미입력 계획"과 같은
    // 자리에 별도 섹션으로 모아 보여준다. 표 안에 배지로 끼워 넣는 대신, 여기서 한눈에 보고
    // 바로 재확인 모달로 들어갈 수 있게 한다.
    function renderLaserQtyIssueSection() {
        const suffix = _lineDomSuffix(_currentLine);
        const section = document.getElementById('pwLaserQtyIssueSection');
        const body = document.getElementById('pwLaserQtyIssueBody' + suffix);
        const countEl = document.getElementById('pwLaserQtyIssueCount' + suffix);
        if (!section || !body) return;

        if (typeof LaserStandbyModule === 'undefined' || typeof LaserStandbyModule.getInboundConfirmDiffInfo !== 'function') {
            section.style.display = 'none';
            return;
        }

        const allWorks = Storage.getAll(STORE) || [];
        const flagged = allWorks
            .filter(function (w) { return _matchesCurrentLine(w.line); })
            .map(function (w) { return { work: w, issue: LaserStandbyModule.getInboundConfirmDiffInfo(w.id) }; })
            .filter(function (row) { return !!row.issue; })
            .sort(function (a, b) { return String(b.work.date || '').localeCompare(String(a.work.date || '')); });

        if (!flagged.length) {
            section.style.display = 'none';
            body.innerHTML = '';
            return;
        }
        section.style.display = '';
        if (countEl) countEl.textContent = flagged.length + '건';

        const canWrite = (typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function')
            ? (AuthModule.canWritePage('painting-work-a') ||
               AuthModule.canWritePage('painting-work-b') ||
               AuthModule.canWritePage('painting-work'))
            : true;

        body.innerHTML = flagged.map(function (row) {
            const w = row.work, issue = row.issue;
            const qtys = _workQtys(w);
            const plan = w.planId ? Storage.getById(PLAN_STORE, w.planId) : null;
            const planQty = plan ? (Number(plan.planQty) || 0) : 0;
            const inputQty = Number(qtys.inputQty) || 0;
            const completedQty = Number(qtys.productionQty) || 0;
            const laserInboundQty = Number(issue.actualQty) || 0;
            const diff = (Number(issue.paintQty) || 0) - laserInboundQty;
            const diffColor = diff === 0 ? 'var(--text-muted)' : '#dc2626';
            const diffText = diff === 0 ? '0' : ((diff > 0 ? '-' : '+') + UIUtils.formatNumber(Math.abs(diff)));
            const editBtn = canWrite
                ? '<button type="button" class="btn btn-sm btn-primary" style="padding:2px 6px;font-size:0.72rem;line-height:1.2;white-space:nowrap;"' +
                  ' onclick="PaintingWorkModule.openWorkEditPage(\'' + w.id + '\')">' +
                  '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">edit</span> 수정</button>'
                : '';
            return '<tr>' +
                '<td style="white-space:nowrap;padding:3px 6px;font-size:0.78rem;">' + (w.date || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:3px 6px;"><strong>' + (w.carModel || '-') + '</strong>' +
                  ' <span style="font-size:0.72rem;color:var(--text-muted);">' + (w.partName || '-') + (w.color ? ' / ' + w.color : '') + '</span></td>' +
                '<td style="text-align:right;white-space:nowrap;padding:3px 6px;font-weight:700;">' + UIUtils.formatNumber(planQty) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:3px 6px;font-weight:700;">' + UIUtils.formatNumber(inputQty) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:3px 6px;font-weight:700;">' + UIUtils.formatNumber(completedQty) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:3px 6px;font-weight:700;color:#2563eb;">' + UIUtils.formatNumber(laserInboundQty) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:3px 6px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
                '<td style="white-space:nowrap;padding:3px 6px;font-size:0.78rem;">' + (issue.operator || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:3px 6px;">' +
                  '<div style="display:flex;gap:3px;align-items:center;flex-wrap:nowrap;">' +
                    editBtn +
                    '<button type="button" class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:0.72rem;line-height:1.2;white-space:nowrap;"' +
                    ' onclick="PaintingWorkModule.openLaserQtyIssueReviewModal(\'' + w.id + '\')">재확인</button>' +
                  '</div></td>' +
                '</tr>';
        }).join('');
    }

    // 오늘자 표("금일 현장 사출 입고")는 date===오늘 인 것만 보여준다. 그래서 확인을 놓친 채
    // 날짜가 지나버린 출고는 그 표에서 조용히 사라져 버리고, "작업일지 등록" 모달의 LOT 부족
    // 진단에 들어가지 않는 한 다시 보이지 않는다. 최근 14일 미입고를 여기서 상시 노출한다.
    function _collectOverdueInbound() {
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.listPendingWarehouseShipments) return [];
        const today = UIUtils.today ? UIUtils.today() : '';
        return (PaintingInputModule.listPendingWarehouseShipments(_currentLine, { days: 14 }) || [])
            .filter(function (r) { return String(r.date || '').slice(0, 10) !== today; });
    }

    function renderOverdueInputStockSection() {
        // PaintingWorkModule 스코프에는 공통 _esc가 없음 — 로컬 정의 필수 (openMaterialHistory와 동일 패턴)
        function _esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        const suffix = _lineDomSuffix(_currentLine);
        const card = document.getElementById('pwOverdueInputCard' + suffix);
        const body = document.getElementById('pwOverdueInputBody' + suffix);
        const summary = document.getElementById('pwOverdueInputSummary' + suffix);
        if (!card || !body) return;

        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.listPendingWarehouseShipments) {
            card.style.display = 'none';
            return;
        }

        const pending = _collectOverdueInbound();

        if (!pending.length) {
            if (_isPaintAdmin()) {
                card.style.display = '';
                body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">이전 날짜 미입고 대기가 없습니다.</td></tr>';
                if (summary) summary.textContent = '';
            } else {
                card.style.display = 'none';
                body.innerHTML = '';
                if (summary) summary.textContent = '';
            }
            return;
        }

        card.style.display = '';
        const totalQty = pending.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
        if (summary) summary.textContent = pending.length + '건 · ' + UIUtils.formatNumber(totalQty) + ' EA';

        const canWrite = (typeof AuthModule !== 'undefined' && AuthModule.canWritePage)
            ? AuthModule.canWritePage('painting-process')
            : true;

        body.innerHTML = pending.map(function (r) {
            const lotNo = (Array.isArray(r.lots) && r.lots.length) ? r.lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean).join(', ') : (r.lotNo || '-');
            const actionHtml = canWrite
                ? `<button type="button" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:0.78rem;white-space:nowrap;"
                    onclick="PaintingWorkModule.confirmInputInbound('${_esc(r.id)}','${_esc(_currentLine)}')">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 입고 처리
                   </button>`
                : '<span style="font-size:0.75rem;color:var(--text-muted);">입력 권한 필요</span>';
            return `<tr>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(String(r.date || '').slice(0, 10))}</td>
                <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(r.carModel || '-')}</strong></td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.partName || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.color || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">${_esc(lotNo)}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">${UIUtils.formatNumber(r.quantity)}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${actionHtml}</td>
            </tr>`;
        }).join('');
        _notifyOverdueInbound(pending);
    }

    // ──────────────────────────────────────────────
    // 도장 투입 자재 (생산계획 현황 아래)
    // ──────────────────────────────────────────────
    function renderInputStockSection() {
        const suffix = _lineDomSuffix(_currentLine);
        const body = document.getElementById('pwInputStockBody' + suffix);
        const summary = document.getElementById('pwInputStockSummary' + suffix);
        if (!body) return;

        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.renderTodayShipmentTable) {
            body.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text-muted);">투입 자재 모듈을 불러올 수 없습니다.</td></tr>`;
            if (summary) summary.textContent = '';
            return;
        }

        const result = PaintingInputModule.renderTodayShipmentTable(_currentLine);
        body.innerHTML = result.html;
        if (summary) {
            if (!result.itemCount) {
                const planTxt = result.planTotal ? ' · 계획 ' + UIUtils.formatNumber(result.planTotal) + ' EA' : '';
                summary.textContent = '출고 없음' + planTxt;
            } else {
                let txt = result.itemCount + '건 · 출고 ' + UIUtils.formatNumber(result.total) + ' EA';
                if (result.planTotal) {
                    txt += ' · 계획 ' + UIUtils.formatNumber(result.planTotal) + ' EA';
                    const diff = Number(result.varianceTotal) || 0;
                    if (diff === 0) txt += ' · 오차 0';
                    else txt += ' · 오차 ' + (diff > 0 ? '+' : '') + UIUtils.formatNumber(diff);
                }
                if (result.pendingCount) txt += ' · 미입고 ' + result.pendingCount;
                if (result.doneCount) txt += ' · 입고 ' + result.doneCount;
                summary.textContent = txt;
            }
        }

        // 생산 진행 중인데 현장 입고 확인이 없으면 입고 카드 바탕도 깜빡임
        const card = document.getElementById('pwInputStockCard' + suffix);
        if (card) {
            const todayDate = UIUtils.today();
            const linePlans = (Storage.getAll(PLAN_STORE) || []).filter(function (p) {
                return String(p.date || '').slice(0, 10) === todayDate
                    && _resolvePaintLine(p.line) === _resolvePaintLine(_currentLine)
                    && (p.carModel || p.partName);
            });
            const needBlink = linePlans.some(function (p) {
                const tp = _estimateTimeProgress(p, todayDate);
                if (tp != null && tp <= 0) return false;
                if (tp == null) {
                    const start = p.startTime || p.slot || '';
                    const now = new Date();
                    const nowHm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
                    if (start && start > nowHm) return false;
                }
                return !_hasConfirmedSiteInboundForPlan(p, todayDate);
            });
            card.classList.toggle('pw-missing-inbound-card', needBlink);
        }
    }

    async function confirmInputInbound(outId, line) {
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.confirmSiteInbound) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        PaintingInputModule.confirmSiteInbound(outId, line || _currentLine);
    }

    // ──────────────────────────────────────────────
    // 실적 미입력 계획 렌더링
    // ──────────────────────────────────────────────
    function _planDayKey(p) {
        return String((p && p.date) || '').trim().slice(0, 10);
    }

    function _workHasPlanId(work, planId) {
        if (!work || planId == null || planId === '') return false;
        return String(work.planId) === String(planId);
    }

    /** 실적으로 인정: planId 연동 + 투입/완료/LOT 수량 있음 (0수량 스텁은 미입력으로 유지) */
    function _workFulfillsPlan(work, planId) {
        if (!_workHasPlanId(work, planId)) return false;
        var input = Number(work.inputQty) || 0;
        var prod = Number(work.productionQty) || 0;
        var lotSum = 0;
        if (Array.isArray(work.lots)) {
            lotSum = work.lots.reduce(function (s, l) { return s + (Number(l && l.qty) || 0); }, 0);
        }
        return (input + prod + lotSum) > 0;
    }

    /**
     * 수정으로 대체된 구 계획 문서 제거 — 일자+라인+시작시각이 같으면 최신 1건만 남긴다.
     * (생산계획 수정이 새 문서를 만들고 옛 문서를 지우지 않아, 같은 시간대 계획이 중복 존재한다)
     */
    function _dedupePlanDocs(plans) {
        const byKey = {};
        const noKey = [];
        (plans || []).forEach(function (p) {
            if (!p) return;
            const slot = String(p.startTime || p.slot || '').trim();
            if (!slot) { noKey.push(p); return; }
            const key = String(p.date || '').slice(0, 10) + '||' + _resolvePaintLine(p.line) + '||' + slot;
            const prev = byKey[key];
            if (!prev) { byKey[key] = p; return; }
            const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
            if (newer) byKey[key] = p;
        });
        return Object.values(byKey).concat(noKey);
    }

    // 실적 미입력 경고는 "하루가 지났는데도 실적이 없다"는 누락 알림이다.
    // 당일 계획은 아직 입력 중일 수 있으므로 목록에 넣지 않는다.
    /** 미입력 대상 일자: 하루 이상 지난 계획만 (당일·미래 제외) */
    function _isUnenteredCandidateDate(plan, today) {
        var day = _planDayKey(plan);
        if (!day || day >= today) return false;
        return true;
    }

    function _collectUnenteredPlans() {
        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];
        const today = UIUtils.today();
        const livePlans = _dedupePlanDocs(allPlans);
        return livePlans.filter(function (p) {
            if (!_isUnenteredCandidateDate(p, today)) return false;
            if (!(p.carModel || p.partName)) return false;
            if (!(Number(p.planQty) > 0)) return false;
            if (!_matchesCurrentLine(p.line)) return false;
            return !allWorks.some(function (w) { return _workFulfillsPlan(w, p.id); });
        }).sort(function (a, b) {
            return _planDayKey(b).localeCompare(_planDayKey(a))
                || String(a.startTime || '').localeCompare(String(b.startTime || ''));
        });
    }

    function renderUnenteredPlans() {
        const section = document.getElementById('pwUnenteredSection');
        const suffix = _lineDomSuffix(_currentLine);
        const body = document.getElementById('pwUnenteredBody' + suffix)
            || document.getElementById('pwUnenteredBodyA')
            || document.getElementById('pwUnenteredBodyB');
        if (!section || !body) return;

        const unentered = _collectUnenteredPlans();

        if (unentered.length === 0) {
            if (_isPaintAdmin()) {
                section.style.display = 'block';
                body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">하루 이상 지난 미입력 계획이 없습니다.</td></tr>';
            } else {
                section.style.display = 'none';
                body.innerHTML = '';
            }
            return;
        }

        const makeRow = function (p) {
            const timeStr = p.startTime ? (p.startTime + '~' + (p.endTime || '')) : (p.slot || '-');
            const day = _planDayKey(p);
            const hasInbound = _hasConfirmedSiteInboundForPlan(p, day);
            const statusHint = !hasInbound
                ? '<span style="font-size:0.68rem;font-weight:700;color:#dc2626;background:rgba(220,38,38,.1);padding:1px 6px;border-radius:8px;margin-left:4px;">사출 입고 필요</span>'
                : '<span style="font-size:0.68rem;font-weight:700;color:#dc2626;background:rgba(220,38,38,.1);padding:1px 6px;border-radius:8px;margin-left:4px;">미입력 실적</span>';
            const infoStr = '<strong>' + (p.carModel || '') + '</strong><br>' +
                '<span style="font-size:0.75rem;color:var(--text-muted);">' + (p.partName || '') +
                (p.color ? ' / ' + p.color : '') + '</span>' + statusHint;
            const rowAccent = '#dc2626';
            const inputBtn = hasInbound
                ? ('<button class="btn btn-xs"' +
                    ' style="padding:6px 12px; font-size:0.82rem; background:var(--accent-blue); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; height:32px; min-width:90px; justify-content:center;"' +
                    ' onclick="PaintingWorkModule.openAddModalFromPlan(\'' + p.id + '\')">' +
                    '<span class="material-symbols-outlined" style="font-size:16px;">edit_note</span>' +
                    '<span>입력</span>' +
                    '</button>')
                : ('<button class="btn btn-xs"' +
                    ' style="padding:6px 12px; font-size:0.82rem; background:#dc2626; color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; height:32px; min-width:90px; justify-content:center;"' +
                    ' onclick="PaintingWorkModule.openMissingInboundForPlan(\'' + p.id + '\')">' +
                    '<span class="material-symbols-outlined" style="font-size:16px;">inventory_2</span>' +
                    '<span>소재입고 필요</span>' +
                    '</button>');
            return '' +
                '<tr style="border-left:3px solid ' + rowAccent + ';"' + (!hasInbound ? ' class="pw-missing-inbound-row"' : '') + '>' +
                    '<td style="font-size:0.82rem;">' + day + '</td>' +
                    '<td style="font-size:0.82rem;">' + timeStr + '</td>' +
                    '<td style="line-height:1.2;">' + infoStr + '</td>' +
                    '<td style="text-align:right; font-weight:600;">' + UIUtils.formatNumber(p.planQty) + '</td>' +
                    '<td style="display:flex; gap:4px; align-items:center;">' +
                        inputBtn +
                        '<button class="btn btn-xs"' +
                            ' style="padding:6px 12px; font-size:0.82rem; background:var(--accent-red); color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; height:32px; min-width:90px; justify-content:center;"' +
                            ' onclick="PaintingWorkModule.deletePlan(\'' + p.id + '\', \'' + day + '\', \'' + String(p.line || '').replace(/'/g, "\\'") + '\', \'' + (p.startTime || p.slot || '') + '\')">' +
                            '<span class="material-symbols-outlined" style="font-size:16px;">delete</span>' +
                            '<span>삭제</span>' +
                        '</button>' +
                    '</td>' +
                '</tr>';
        };

        section.style.display = 'block';
        body.innerHTML = unentered.map(makeRow).join('');
        _notifyUnenteredPlans(unentered);
    }

    function _partMatchesPlanInbound(plan, rPart) {
        var planPart = String((plan && plan.partName) || '').trim();
        var p = String(rPart || '').trim();
        if (!p) return true;
        if (p === planPart) return true;
        var candidates = _injPartCandidatesForPlan(plan);
        if (candidates[p]) return true;
        var pl = p.toLowerCase();
        if (Object.keys(candidates).some(function (k) { return String(k).toLowerCase() === pl; })) return true;
        return _partsLooselyRelated(planPart, p);
    }

    function _pendingShipmentsForPlan(plan) {
        if (!plan || typeof PaintingInputModule === 'undefined'
            || typeof PaintingInputModule.listPendingWarehouseShipments !== 'function') return [];
        var line = _resolvePaintLine(plan.line);
        var car = String(plan.carModel || '').trim();
        var list = PaintingInputModule.listPendingWarehouseShipments(line, { days: 30 }) || [];
        return list.filter(function (r) {
            if (car && String(r.carModel || '').trim() !== car) return false;
            return _partMatchesPlanInbound(plan, r.partName);
        });
    }

    function _existingInboundForPlan(plan) {
        if (!plan || typeof Storage === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return [];
        var line = _resolvePaintLine(plan.line);
        var car = String(plan.carModel || '').trim();
        return (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).filter(function (r) {
            if (!r || String(r.type || '') !== '입고') return false;
            if (_resolvePaintLine(r.line || r.paintLine) !== line) return false;
            if (car && String(r.carModel || '').trim() !== car) return false;
            return _partMatchesPlanInbound(plan, r.partName);
        }).sort(function (a, b) {
            return String(b.useDate || b.date || '').localeCompare(String(a.useDate || a.date || ''));
        }).slice(0, 12);
    }

    function _inboundUseDay(r) {
        return String((r && (r.useDate || r.date)) || '').slice(0, 10);
    }

    function _injSelectOpts(list, selected, emptyLabel) {
        var sel = String(selected || '').trim();
        var items = (list || []).slice();
        var extra = '';
        if (sel && items.indexOf(sel) < 0) {
            extra = '<option value="' + _pwEsc(sel) + '" selected>' + _pwEsc(sel) + ' (기존)</option>';
        }
        return '<option value="">' + emptyLabel + '</option>' + extra +
            items.map(function (v) {
                return '<option value="' + _pwEsc(v) + '"' + (v === sel ? ' selected' : '') + '>' + _pwEsc(v) + '</option>';
            }).join('');
    }

    function _injCarsForPastInbound() {
        var mats = Storage.getAll(INJECTMAT_STORE) || [];
        var cars = mats.map(function (m) { return m.carModel; });
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.sortCarModels === 'function') {
            return UIUtils.sortCarModels(cars, mats);
        }
        return [...new Set(cars.map(function (c) { return String(c || '').trim(); }).filter(Boolean))]
            .sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    }

    function _injPartsForPastInbound(car) {
        car = String(car || '').trim();
        if (!car) return [];
        return [...new Set((Storage.getAll(INJECTMAT_STORE) || [])
            .filter(function (m) { return m.carModel === car; })
            .map(function (m) { return String(m.injPartName || '').trim(); })
            .filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    }

    function _injColorsForPastInbound(car, part) {
        car = String(car || '').trim();
        part = String(part || '').trim();
        if (!car || !part) return [];
        return [...new Set((Storage.getAll(INJECTMAT_STORE) || [])
            .filter(function (m) { return m.carModel === car && m.injPartName === part; })
            .map(function (m) { return String(m.injColor || '').trim(); })
            .filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    }

    function onPastInboundCarChange() {
        var car = ((document.getElementById('pwPastInCar') || {}).value || '').trim();
        var partEl = document.getElementById('pwPastInPart');
        var colorEl = document.getElementById('pwPastInColor');
        var parts = _injPartsForPastInbound(car);
        if (partEl) {
            partEl.innerHTML = car
                ? _injSelectOpts(parts, parts.length === 1 ? parts[0] : '', '-- 사출명 선택 --')
                : '<option value="">-- 차종 먼저 선택 --</option>';
        }
        var part = partEl ? String(partEl.value || '').trim() : '';
        if (colorEl) {
            colorEl.innerHTML = (car && part)
                ? _injSelectOpts(_injColorsForPastInbound(car, part), '', '-- 선택 --')
                : '<option value="">-- 사출명 먼저 선택 --</option>';
        }
        if (car && part) onPastInboundPartChange();
    }

    function onPastInboundPartChange() {
        var car = ((document.getElementById('pwPastInCar') || {}).value || '').trim();
        var part = ((document.getElementById('pwPastInPart') || {}).value || '').trim();
        var colorEl = document.getElementById('pwPastInColor');
        if (!colorEl) return;
        if (!car || !part) {
            colorEl.innerHTML = '<option value="">-- 사출명 먼저 선택 --</option>';
            return;
        }
        var colors = _injColorsForPastInbound(car, part);
        colorEl.innerHTML = _injSelectOpts(colors, colors.length === 1 ? colors[0] : '', '-- 선택 --');
    }

    /**
     * 실적 미입력 계획의 「소재입고 필요」— 미입고 출고 확인, 기존 입고 사용일 수정,
     * 관리자 수기 입고를 한 화면에서 처리한다.
     */
    function openMissingInboundForPlan(planId) {
        var plan = Storage.getById(PLAN_STORE, planId);
        if (!plan) {
            UIUtils.toast('계획 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        var day = _planDayKey(plan);
        var line = _resolvePaintLine(plan.line);
        var isAdmin = _isPaintAdmin();
        var canRetarget = _canCorrectPastInbound();
        var pending = _pendingShipmentsForPlan(plan);
        var existing = _existingInboundForPlan(plan);
        var injPart = '';
        try { injPart = _resolveInjPartNameForWork(plan.carModel, plan.partName, plan.color) || ''; } catch (e) { injPart = ''; }
        if (!injPart) injPart = String(plan.partName || '').trim();

        var pendingHtml = pending.length
            ? ('<table class="data-table compact" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;font-size:0.82rem;">' +
                '<thead><tr>' +
                '<th style="white-space:nowrap;padding:6px 8px;">출고일</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">사출명</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">컬러</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">LOT</th>' +
                '<th style="text-align:right;white-space:nowrap;padding:6px 8px;">수량</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">작업</th>' +
                '</tr></thead><tbody>' +
                pending.map(function (r) {
                    var lot = (Array.isArray(r.lots) && r.lots.length)
                        ? r.lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean).join(', ')
                        : (r.lotNo || '-');
                    return '<tr>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(String(r.date || '').slice(0, 10)) + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(r.partName || '-') + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(r.color || '-') + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;font-family:monospace;">' + _pwEsc(lot) + '</td>' +
                        '<td style="text-align:right;white-space:nowrap;padding:6px 8px;font-weight:700;">' + UIUtils.formatNumber(r.quantity) + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' +
                            '<button type="button" class="btn btn-sm btn-primary" style="padding:3px 8px;font-size:0.75rem;"' +
                            ' onclick="PaintingWorkModule.confirmPendingInboundForPlan(\'' + _pwJs(r.id) + '\',\'' + _pwJs(line) + '\',\'' + _pwJs(day) + '\')">' +
                            '입고 처리</button></td></tr>';
                }).join('') +
                '</tbody></table>')
            : '<p style="margin:0;font-size:0.82rem;color:var(--text-muted);">이 품목에 대해 현장 미확인 창고/재사용 자재 출고가 없습니다.</p>';

        var existingHtml = existing.length
            ? ('<table class="data-table compact" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;font-size:0.82rem;">' +
                '<thead><tr>' +
                '<th style="white-space:nowrap;padding:6px 8px;">사용일</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">사출명</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">컬러</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">LOT</th>' +
                '<th style="text-align:right;white-space:nowrap;padding:6px 8px;">수량</th>' +
                '<th style="white-space:nowrap;padding:6px 8px;">작업</th>' +
                '</tr></thead><tbody>' +
                existing.map(function (r) {
                    var useDay = _inboundUseDay(r);
                    var lot = (Array.isArray(r.lots) && r.lots.length)
                        ? r.lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean).join(', ')
                        : (r.lotNo || '-');
                    var rawLotNo = (Array.isArray(r.lots) && r.lots.length === 1)
                        ? String(r.lots[0].lotNo || '').trim()
                        : String(r.lotNo || '').trim();
                    var lotIsGeneric = !rawLotNo || rawLotNo === '무표기';
                    var sameDay = useDay === day;
                    var action = sameDay
                        ? ('<span style="font-size:0.75rem;color:#16a34a;font-weight:700;">이 계획일 입고</span>' +
                            (lotIsGeneric && canRetarget
                                ? (' <button type="button" class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.72rem;margin-left:4px;"' +
                                    ' title="LOT 번호가 없는 입고라 다른 무표기 건과 뒤섞여 ②투입에서 선택이 안 될 수 있습니다. 눌러서 이 건만의 고유 LOT을 부여하세요."' +
                                    ' onclick="PaintingWorkModule.reassignInboundLot(\'' + _pwJs(r.id) + '\',\'' + _pwJs(plan.id) + '\')">' +
                                    'LOT 재발급</button>')
                                : ''))
                        : (canRetarget
                            ? ('<button type="button" class="btn btn-sm btn-outline" style="padding:3px 8px;font-size:0.75rem;"' +
                                ' onclick="PaintingWorkModule.applyInboundUseDate(\'' + _pwJs(r.id) + '\',\'' + _pwJs(day) + '\',\'' + _pwJs(plan.id) + '\')">' +
                                '사용일을 ' + _pwEsc(day) + '로</button>')
                            : '<span style="font-size:0.75rem;color:var(--text-muted);">다른 날짜</span>');
                    return '<tr>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(useDay || '-') + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(r.partName || '-') + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + _pwEsc(r.color || '-') + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;font-family:monospace;">' + _pwEsc(lot) + '</td>' +
                        '<td style="text-align:right;white-space:nowrap;padding:6px 8px;font-weight:700;">' + UIUtils.formatNumber(r.quantity) + '</td>' +
                        '<td style="white-space:nowrap;padding:6px 8px;">' + action + '</td></tr>';
                }).join('') +
                '</tbody></table>')
            : '<p style="margin:0;font-size:0.82rem;color:var(--text-muted);">이 품목의 현장 입고 이력이 없습니다.</p>';

        var cars = _injCarsForPastInbound();
        var parts = _injPartsForPastInbound(plan.carModel);
        var colors = _injColorsForPastInbound(plan.carModel, injPart);
        var manualHtml = isAdmin
            ? ('<div style="margin-top:14px;padding:12px;border-radius:8px;border:1px solid rgba(37,99,235,.25);background:rgba(37,99,235,.04);">' +
                '<div style="font-size:0.82rem;font-weight:700;color:var(--accent-blue);margin-bottom:8px;">관리자 수기 입고 (지난 실적 보정)</div>' +
                '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;line-height:1.45;">창고 출고가 없어도 계획일 기준으로 현장 입고를 등록할 수 있습니다. 이후 실적 입력 시 이 LOT이 사용됩니다.</div>' +
                '<input type="hidden" id="pwPastInPlanId" value="' + _pwEsc(plan.id) + '">' +
                '<input type="hidden" id="pwPastInLine" value="' + _pwEsc(line) + '">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div><label class="form-label">사용일 *</label>' +
                    '<input type="date" class="form-input" id="pwPastInDate" value="' + _pwEsc(day) + '"></div>' +
                    '<div><label class="form-label">수량 (EA) *</label>' +
                    '<input type="number" class="form-input" id="pwPastInQty" min="1" value="' + (Number(plan.planQty) || '') + '"></div>' +
                    '<div><label class="form-label">차종 *</label>' +
                    '<select class="form-input" id="pwPastInCar" onchange="PaintingWorkModule.onPastInboundCarChange()">' +
                    _injSelectOpts(cars, plan.carModel || '', '-- 차종 선택 --') + '</select></div>' +
                    '<div><label class="form-label">사출명 *</label>' +
                    '<select class="form-input" id="pwPastInPart" onchange="PaintingWorkModule.onPastInboundPartChange()">' +
                    (plan.carModel ? _injSelectOpts(parts, injPart, '-- 사출명 선택 --') : '<option value="">-- 차종 먼저 선택 --</option>') +
                    '</select></div>' +
                    '<div><label class="form-label">색상</label>' +
                    '<select class="form-input" id="pwPastInColor">' +
                    (plan.carModel && injPart ? _injSelectOpts(colors, plan.color || '', '-- 선택 --') : '<option value="">-- 사출명 먼저 선택 --</option>') +
                    '</select></div>' +
                    '<div><label class="form-label">사출LOT</label>' +
                    '<input type="text" class="form-input" id="pwPastInLot" placeholder="예: 260811" style="font-family:monospace;"></div>' +
                    '<div style="grid-column:1/-1;"><label class="form-label">비고</label>' +
                    '<input type="text" class="form-input" id="pwPastInNote" placeholder="지난 실적 소재입고 보정"></div>' +
                '</div>' +
                '<div style="margin-top:10px;text-align:right;">' +
                    '<button type="button" class="btn btn-primary" onclick="PaintingWorkModule.saveManualPastInbound()">' +
                    '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 수기 입고 저장</button>' +
                '</div></div>')
            : '<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--bg-secondary);font-size:0.8rem;color:var(--text-muted);line-height:1.5;">미입고 출고가 없으면 사출 창고에서 해당 일자 생산출고 후 현장 입고 확인이 필요합니다. 지난 실적 수기 입고는 관리자만 등록할 수 있습니다.</div>';

        UIUtils.showModal(
            '소재입고 — ' + (plan.carModel || '-') + ' · ' + (plan.partName || '-'),
            '<div style="padding:2px 0;">' +
                '<div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.84rem;line-height:1.55;margin-bottom:12px;">' +
                    '<div><strong>' + _pwEsc(line) + '</strong> · 도장 작업일 <strong>' + _pwEsc(day) + '</strong>' +
                    (plan.startTime ? ' · ' + _pwEsc(plan.startTime) + '~' + _pwEsc(plan.endTime || '') : '') + '</div>' +
                    '<div style="color:var(--text-muted);">' + _pwEsc(plan.carModel || '-') + ' / ' + _pwEsc(plan.partName || '-') +
                    (plan.color ? ' / ' + _pwEsc(plan.color) : '') +
                    ' · 계획 ' + UIUtils.formatNumber(plan.planQty) + ' EA</div>' +
                '</div>' +
                '<div style="font-size:0.82rem;font-weight:700;margin-bottom:6px;">미입고 출고 (확인 후 사용일=' + _pwEsc(day) + ')</div>' +
                '<div style="overflow-x:auto;margin-bottom:14px;">' + pendingHtml + '</div>' +
                '<div style="font-size:0.82rem;font-weight:700;margin-bottom:6px;">기존 현장 입고</div>' +
                '<div style="overflow-x:auto;">' + existingHtml + '</div>' +
                manualHtml +
            '</div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'lg'
        );
    }

    function confirmPendingInboundForPlan(outId, line, planDate) {
        UIUtils.closeModal();
        setTimeout(function () {
            if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.confirmSiteInbound) {
                UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
                return;
            }
            PaintingInputModule.confirmSiteInbound(outId, line, { useDate: planDate });
        }, 80);
    }

    async function applyInboundUseDate(inboundId, planDate, planId) {
        if (!_canCorrectPastInbound()) {
            UIUtils.toast('도장 작업 입력 권한이 있어야 입고 사용일을 수정할 수 있습니다.', 'warning');
            return;
        }
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.updateSiteInbound) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        UIUtils.confirm(
            '이 입고의 사용일을 ' + planDate + '로 바꾸면 해당 날짜 실적 입력에 사용됩니다.\n' +
            '오늘 입고로 잡혀 있던 건이면 오늘 계획 매칭이 달라질 수 있습니다.\n계속할까요?',
            async function () {
                try {
                    var rec = await PaintingInputModule.updateSiteInbound(inboundId, { useDate: planDate });
                    if (!rec) return;
                    UIUtils.toast('사용일을 ' + planDate + '로 수정했습니다. 실적을 입력하세요.', 'success');
                } catch (e) {
                    UIUtils.toast('수정 실패: ' + (e && e.message ? e.message : e), 'error');
                } finally {
                    if (planId) openMissingInboundForPlan(planId);
                }
            },
            function () {
                if (planId) openMissingInboundForPlan(planId);
            }
        );
    }

    /** LOT 번호가 없는("무표기") 입고 건에 고유 임시 LOT을 부여한다. 같은 차종·사출명·컬러의
     *  다른 무표기 건과 하나의 잔량 버킷으로 묶여, ②투입 LOT 드롭다운에서 선택할 항목이
     *  안 보이는(실제로는 방금 도착한 자재인데 잔량 0으로 계산되는) 경우를 되돌리는 용도. */
    async function reassignInboundLot(inboundId, planId) {
        if (!_canCorrectPastInbound()) {
            UIUtils.toast('도장 작업 입력 권한이 있어야 처리할 수 있습니다.', 'warning');
            return;
        }
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.updateSiteInbound) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        try {
            var rec = await PaintingInputModule.updateSiteInbound(inboundId, { reassignLot: true });
            if (!rec) return;
            UIUtils.toast('이 입고에 고유 LOT을 부여했습니다. 이제 ②투입에서 선택할 수 있습니다.', 'success');
        } catch (e) {
            UIUtils.toast('처리 실패: ' + (e && e.message ? e.message : e), 'error');
        } finally {
            if (planId) openMissingInboundForPlan(planId);
        }
    }

    async function saveManualPastInbound() {
        if (!_isPaintAdmin()) {
            UIUtils.toast('관리자만 과거 소재입고를 수기 등록할 수 있습니다.', 'warning');
            return;
        }
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.registerManualSiteInbound) {
            UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        var planId = ((document.getElementById('pwPastInPlanId') || {}).value || '').trim();
        var line = ((document.getElementById('pwPastInLine') || {}).value || '').trim();
        var useDate = ((document.getElementById('pwPastInDate') || {}).value || '').trim();
        var carModel = ((document.getElementById('pwPastInCar') || {}).value || '').trim();
        var partName = ((document.getElementById('pwPastInPart') || {}).value || '').trim();
        var color = ((document.getElementById('pwPastInColor') || {}).value || '').trim();
        var qty = parseInt((document.getElementById('pwPastInQty') || {}).value, 10);
        var lotNo = ((document.getElementById('pwPastInLot') || {}).value || '').trim();
        var note = ((document.getElementById('pwPastInNote') || {}).value || '').trim();
        if (!carModel || !partName || !useDate || !(qty > 0)) {
            UIUtils.toast('차종, 사출명, 사용일, 수량은 필수입니다.', 'warning');
            return;
        }
        try {
            var rec = await PaintingInputModule.registerManualSiteInbound({
                line: line,
                carModel: carModel,
                partName: partName,
                color: color,
                useDate: useDate,
                quantity: qty,
                lotNo: lotNo,
                note: note,
                planId: planId
            });
            if (!rec) return;
            UIUtils.closeModal();
            UIUtils.toast('수기 입고가 등록되었습니다. 실적을 입력하세요.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    // ──────────────────────────────────────────────
    // 생산계획 현황 렌더링
    // ──────────────────────────────────────────────

    function _normPartKey(s) {
        return String(s || '').toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '');
    }

    /** 1SPOT / 3SPOT처럼 숫자+SPOT 구분값. 둘 다 있으면 숫자가 같아야 같은 품목이다. */
    function _partSpotNumber(s) {
        var m = _normPartKey(s).match(/(\d+)spot/);
        return m ? m[1] : '';
    }

    /** 품명 느슨 비교 — 공백·괄호 무시, 한쪽이 다른 쪽에 포함되면 동일 계열로 본다.
     *  예: 계획 "KNOB [LED] BK 1spot" ↔ 입고 사출명 "1SPOT"
     *  1SPOT과 3SPOT은 포함 관계로 묶지 않는다.
     *  "KNOB [LED] BK" 가 "KNOB [LED] BK SEESAW"에 포함된다고 같은 품목으로 보지 않는다. */
    function _partsLooselyRelated(a, b) {
        var na = _normPartKey(a);
        var nb = _normPartKey(b);
        if (!na || !nb) return false;
        var sa = _partSpotNumber(a);
        var sb = _partSpotNumber(b);
        if (sa && sb && sa !== sb) return false;
        if (na === nb) return true;
        if (na.length < 3 || nb.length < 3) return false;
        if (na.indexOf(nb) < 0 && nb.indexOf(na) < 0) return false;
        var longer = na.length >= nb.length ? a : b;
        var shorter = na.length >= nb.length ? b : a;
        var longSpot = _partSpotNumber(longer);
        var shortSpot = _partSpotNumber(shorter);
        if (longSpot && shortSpot && longSpot !== shortSpot) return false;
        if (longSpot && !shortSpot) return false;
        if (!longSpot && shortSpot) return false;
        if (_hasExtraPartDiscriminator(longer, shorter)) return false;
        return true;
    }

    function _hasExtraPartDiscriminator(longer, shorter) {
        var noise = /^(black|white|gray|grey|clear|knob|door|cover|led|and|the)$/;
        var longTok = String(longer || '').toLowerCase().split(/[\s\[\]\(\)\{\}\-_\/·.]+/).filter(function (t) {
            return t.length >= 4 && !noise.test(t);
        });
        var shortTok = String(shorter || '').toLowerCase().split(/[\s\[\]\(\)\{\}\-_\/·.]+/).filter(function (t) {
            return t.length >= 4 && !noise.test(t);
        });
        return longTok.some(function (t) { return shortTok.indexOf(t) < 0; });
    }

    /** 이 차종·제작품명에 연결된 사출명만. 같은 차종의 다른 품(1SPOT↔3SPOT)은 넣지 않는다. */
    function _allowedInjPartsForWork(carModel, planPartName) {
        var names = {};
        var plan = String(planPartName || '').trim();
        var car = String(carModel || '').trim();
        if (!plan) return names;
        names[plan] = true;
        var prodId = '';
        try {
            var products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            var prod = products.find(function (p) {
                if (!p || String(p.partName || '').trim() !== plan) return false;
                return !car || !p.carModel || String(p.carModel).trim() === car;
            });
            if (prod && prod.id) prodId = prod.id;
        } catch (eProd) { /* ignore */ }
        try {
            (Storage.getAll(INJECTMAT_STORE) || []).forEach(function (m) {
                if (!m || !m.injPartName) return;
                if (car && m.carModel && String(m.carModel).trim() !== car) return;
                var inj = String(m.injPartName).trim();
                var linked = false;
                if (prodId && Array.isArray(m.productIds) && m.productIds.indexOf(prodId) >= 0) linked = true;
                if (String(m.mfgProductName || '').trim() === plan || String(m.mfgProductName2 || '').trim() === plan) linked = true;
                if (_normPartKey(inj) === _normPartKey(plan)) linked = true;
                // 제작품명에 N-SPOT이 있을 때만 느슨 매칭 (1spot ↔ 1SPOT).
                // SEESAW처럼 SPOT이 없는 품명은 마스터 정확 연결만 인정 — 같은 차종 1SPOT이 섞이지 않게.
                if (!linked && _partSpotNumber(plan) && (
                    _partsLooselyRelated(m.mfgProductName, plan) || _partsLooselyRelated(m.mfgProductName2, plan)
                )) {
                    linked = true;
                }
                if (!linked) return;
                var planSpot = _partSpotNumber(plan);
                var injSpot = _partSpotNumber(inj);
                if (planSpot && injSpot && planSpot !== injSpot) return;
                names[inj] = true;
            });
        } catch (eMat) { /* ignore */ }
        var masterNames = {};
        Object.keys(names).forEach(function (k) { masterNames[k] = true; });
        function _histOk(raw) {
            var n = String(raw || '').trim();
            if (!n) return false;
            if (masterNames[n] || names[n]) return true;
            if (_normPartKey(n) === _normPartKey(plan)) return true;
            if (!_partsLooselyRelated(n, plan)) return false;
            var planSpot = _partSpotNumber(plan);
            var injSpot = _partSpotNumber(n);
            if (planSpot && injSpot && planSpot !== injSpot) return false;
            return true;
        }
        try {
            (Storage.getAll(STORE) || []).forEach(function (w) {
                if (!w) return;
                if (car && String(w.carModel || '').trim() !== car) return;
                if (String(w.partName || '').trim() !== plan) return;
                if (_histOk(w.injPartName)) names[String(w.injPartName).trim()] = true;
                (Array.isArray(w.lots) ? w.lots : []).forEach(function (l) {
                    if (l && _histOk(l.partName)) names[String(l.partName).trim()] = true;
                });
            });
        } catch (eWork) { /* ignore */ }
        var wantSpot = _partSpotNumber(plan);
        if (wantSpot) {
            Object.keys(names).forEach(function (k) {
                var ks = _partSpotNumber(k);
                if (ks && ks !== wantSpot) delete names[k];
            });
        }
        return names;
    }

    function _injNameAllowed(injName, carModel, planPartName) {
        var p = String(injName || '').trim();
        if (!p) return false;
        var allowed = _allowedInjPartsForWork(carModel, planPartName);
        if (allowed[p]) return true;
        var pKey = _normPartKey(p);
        return Object.keys(allowed).some(function (k) { return _normPartKey(k) === pKey; });
    }

    /** 사출명 후보 중 작업 품명과 유일하게 맞는 것만 고른다. 1SPOT/3SPOT이 같이 있으면 추측하지 않는다. */
    function _pickInjPartNameFromList(names, want) {
        names = (names || []).filter(Boolean);
        if (!names.length) return '';
        var wantKey = _normPartKey(want);
        var exact = names.filter(function (n) { return _normPartKey(n) === wantKey; });
        if (exact.length) return exact[0];
        var wantSpot = _partSpotNumber(want);
        if (wantSpot) {
            var bySpot = names.filter(function (n) { return _partSpotNumber(n) === wantSpot; });
            return bySpot.length === 1 ? bySpot[0] : '';
        }
        return names.length === 1 ? names[0] : '';
    }

    function _workInjPartName(d) {
        var work = String((d && d.partName) || '').trim();
        var car = String((d && d.carModel) || '').trim();
        var explicit = String((d && d.injPartName) || '').trim();
        var allowed = _allowedInjPartsForWork(car, work);
        var allowedList = Object.keys(allowed).filter(function (n) {
            return n && _normPartKey(n) !== _normPartKey(work);
        });
        if (explicit && _injNameAllowed(explicit, car, work) && _normPartKey(explicit) !== _normPartKey(work)) {
            return explicit;
        }
        var picked = _pickInjPartNameFromList(Object.keys(allowed), work);
        if (picked && _normPartKey(picked) !== _normPartKey(work)) return picked;
        if (allowedList.length === 1) return allowedList[0];
        var resolved = _resolveInjPartNameForWork(car, work, (d && d.color) || '') || '';
        if (resolved && _injNameAllowed(resolved, car, work) && _normPartKey(resolved) !== _normPartKey(work)) {
            return resolved;
        }
        return '';
    }

    function _inboundLineOf(r) {
        return _resolvePaintLine((r && (r.line || r.paintLine || r.toLine)) || '');
    }

    function _inboundDayHits(r, day) {
        var want = String(day || '').slice(0, 10);
        if (!want) return false;
        var fields = [r && r.shipDate, r && r.matchedPaintDate, r && r.useDate, r && r.receivedAt, r && r.date, r && r.createdAt];
        try { fields.push(_resolveInboundStamp(r)); } catch (e) { /* ignore */ }
        if (fields.some(function (v) {
            return String(v || '').replace('T', ' ').trim().slice(0, 10) === want;
        })) return true;
        try {
            var outId = (r && (r.refOutId || r.refReworkOutId)) || '';
            if (outId && typeof Storage !== 'undefined' && Storage.getById && typeof DB !== 'undefined' && DB.STORES) {
                var out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
                if (!out && DB.STORES.REWORK_WIP) out = Storage.getById(DB.STORES.REWORK_WIP, outId);
                if (out && String(out.date || '').replace('T', ' ').trim().slice(0, 10) === want) return true;
            }
        } catch (e2) { /* ignore */ }
        return false;
    }

    /** 입고 기록의 LOT별 수량. lots[].qty가 비어 있으면 quantity로 되돌린다.
     *  같은 LOT이 배열에 두 번 있으면 합치고, lots 합이 헤더 quantity와 어긋나면 quantity에 맞춘다.
     *  (LOT 복제·중복 입고로 잔량이 부풀어 반납수량이 실제보다 커지는 사고를 막는다) */
    function _inboundRecordLots(r) {
        var recQty = Number((r && r.quantity) || 0);
        var lots = (Array.isArray(r && r.lots) && r.lots.length)
            ? r.lots.map(function (l) {
                return {
                    lotNo: String((l && l.lotNo) || '').trim(),
                    qty: Number(l && l.qty) || 0
                };
            }).filter(function (l) { return l.lotNo; })
            : [];
        if (!lots.length && r && r.lotNo) {
            lots = [{ lotNo: String(r.lotNo).trim(), qty: recQty }];
        }
        var merged = [];
        var idx = {};
        lots.forEach(function (l) {
            var i = idx[l.lotNo];
            if (i == null) {
                idx[l.lotNo] = merged.length;
                merged.push({ lotNo: l.lotNo, qty: l.qty });
            } else {
                merged[i].qty += l.qty;
            }
        });
        lots = merged;
        var sum = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        if (sum <= 0 && recQty > 0 && lots.length === 1) lots[0].qty = recQty;
        else if (sum <= 0 && recQty > 0 && lots.length > 1) {
            var each = Math.floor(recQty / lots.length);
            lots.forEach(function (l, i) {
                l.qty = (i === lots.length - 1) ? (recQty - each * (lots.length - 1)) : each;
            });
        } else if (lots.length === 1 && recQty > lots[0].qty) {
            lots[0].qty = recQty;
        } else if (recQty > 0 && sum > 0 && sum !== recQty) {
            var allocated = 0;
            lots = lots.map(function (l, i) {
                if (i === lots.length - 1) return { lotNo: l.lotNo, qty: Math.max(0, recQty - allocated) };
                var q = Math.floor(l.qty * recQty / sum);
                allocated += q;
                return { lotNo: l.lotNo, qty: q };
            }).filter(function (l) { return l.qty > 0; });
        }
        return lots.filter(function (l) { return l.qty > 0; });
    }

    /** 이 작업일·차종·라인에 실제로 현장 입고된 사출명. 제작품명(SEESAW)과 창고 사출명(3SPOT)이 다를 때 연결용. */
    function _siteInboundInjParts(line, carModel, day, workPartName) {
        var names = [];
        var seen = {};
        var lineKey = _resolvePaintLine(line);
        var dayStr = String(day || '').slice(0, 10);
        var car = String(carModel || '').trim();
        var wantSpot = _partSpotNumber(workPartName);
        if (!lineKey || !car || !dayStr || typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) {
            return names;
        }
        (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            if (_inboundLineOf(r) !== lineKey) return;
            if (String(r.carModel || '').trim() !== car) return;
            if (!_inboundDayHits(r, dayStr)) return;
            var p = String(r.partName || '').trim();
            if (!p || seen[p]) return;
            var rSpot = _partSpotNumber(p);
            if (wantSpot && rSpot && wantSpot !== rSpot) return;
            if (workPartName && !_injNameAllowed(p, car, workPartName)) return;
            seen[p] = true;
            names.push(p);
        });
        return names;
    }

    /** 현장 입고 기록의 사출명이 이 작업(해석된 사출명·제작품명)과 같은 품목인지. */
    function _inboundInjPartMatches(rPartName, injPartName, workPartName, carModel) {
        var rPart = String(rPartName || '').trim();
        var wantInj = String(injPartName || '').trim();
        var wantWork = String(workPartName || '').trim();
        if (!wantInj && !wantWork) return false;
        if (!rPart) return false;
        if (wantWork) return _injNameAllowed(rPart, carModel, wantWork);
        if (_normPartKey(rPart) === _normPartKey(wantInj)) return true;
        var wantSpot = _partSpotNumber(wantInj);
        var rSpot = _partSpotNumber(rPart);
        if (wantSpot && rSpot && wantSpot !== rSpot) return false;
        return _partsLooselyRelated(rPart, wantInj);
    }

    /** 계획 품목에 대응하는 사출명 후보 집합 (마스터·직접 해석·느슨 매칭용) */
    function _injPartCandidatesForPlan(plan) {
        var set = {};
        var carModel = String((plan && plan.carModel) || '').trim();
        var planPart = String((plan && plan.partName) || '').trim();
        var planColor = String((plan && plan.color) || '').trim();
        if (planPart) set[planPart] = true;
        var allowed = _allowedInjPartsForWork(carModel, planPart);
        Object.keys(allowed).forEach(function (k) { if (k) set[k] = true; });

        var wantSpot = _partSpotNumber(planPart);
        if (wantSpot) {
            Object.keys(set).forEach(function (k) {
                var ks = _partSpotNumber(k);
                if (ks && ks !== wantSpot) delete set[k];
            });
        }
        return set;
    }

    /**
     * 계획 품목의 당일 현장 사출 입고(확인 완료) 여부.
     * 레이져 후 도장(재공품)은 사출창고→현장 입고 경로가 아니므로 통과로 본다.
     * 주의: 계획.partName은 제작품명(예: KNOB [SD] BK 1spot)이고 현장 입고.partName은
     * 사출명(예: 1SPOT)이라 문자열이 다르다 — 사출자재 마스터·느슨 매칭으로 연결한다.
     *
     * 날짜: shipDate(창고출고일)만 보면 전날 출고·당일 자동입고 건이 "미입고"로 오판된다.
     * useDate·receivedAt·date 중 하나라도 계획일과 같으면 당일 입고로 인정한다.
     * 최종 폴백: 화면 「현장 사출 입고」표와 동일 소스(금일 출고+입고완료).
     */
    function _hasConfirmedSiteInboundForPlan(plan, day) {
        if (!plan) return false;
        try {
            if (_isLaserWipWork({
                line: plan.line,
                partName: plan.partName,
                carModel: plan.carModel
            })) return true;
        } catch (e) { /* ignore */ }

        if (typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) {
            return false;
        }
        var line = _resolvePaintLine(plan.line);
        var carModel = String(plan.carModel || '').trim();
        var dayStr = String(day || plan.date || '').slice(0, 10);
        if (!line || !dayStr) return false;

        var planPart = String(plan.partName || '').trim();
        var candidates = _injPartCandidatesForPlan(plan);

        function _partMatchesInbound(rPart) {
            var p = String(rPart || '').trim();
            if (!p) return false;
            if (p === planPart) return true;
            if (candidates[p]) return true;
            var pl = p.toLowerCase();
            if (Object.keys(candidates).some(function (k) { return String(k).toLowerCase() === pl; })) return true;
            return _partsLooselyRelated(planPart, p);
        }

        function _dayHitsPlan(r) {
            var fields = [
                r && r.shipDate,
                r && r.matchedPaintDate,
                r && r.useDate,
                r && r.receivedAt,
                r && r.date
            ];
            try { fields.push(_resolveInboundStamp(r)); } catch (e2) { /* ignore */ }
            return fields.some(function (v) {
                var d = String(v || '').trim().slice(0, 10);
                return d === dayStr;
            });
        }

        var hit = (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).some(function (r) {
            if (!r || String(r.type || '') !== '입고') return false;
            if (_resolvePaintLine(r.line || r.paintLine) !== line) return false;
            if (carModel && String(r.carModel || '').trim() !== carModel) return false;
            if (!_partMatchesInbound(r.partName)) return false;
            return _dayHitsPlan(r);
        });
        if (hit) return true;

        // 화면 「현장 사출 입고」표와 동일 소스 — 표에 입고완료로 보이는데
        // 소재입고 필요로 막히는 UI 모순을 없앤다.
        // 제작품명(KNOB…) vs 사출명(1SPOT)·색상(BK vs WHITE) 표기 차이로
        // 품명 매칭이 실패해도, 동일 라인·일자·차종 입고완료면 통과한다.
        try {
            if (typeof PaintingInputModule !== 'undefined'
                && typeof PaintingInputModule.listTodayWarehouseShipments === 'function') {
                var ships = PaintingInputModule.listTodayWarehouseShipments(line, dayStr) || [];
                var receivedForModel = ships.filter(function (r) {
                    if (!r || !r.received) return false;
                    if (carModel && String(r.carModel || '').trim() !== carModel) return false;
                    return true;
                });
                if (!receivedForModel.length) return false;
                if (receivedForModel.some(function (r) { return _partMatchesInbound(r.partName); })) return true;
                return false;
            }
        } catch (e3) { /* ignore */ }

        return false;
    }

    function renderPlanSummary() {
        const bodyA = document.getElementById('pwPlanBodyA');
        const bodyB = document.getElementById('pwPlanBodyB');
        const label = document.getElementById('pwPlanDateLabel');
        if (!bodyA && !bodyB) return;

        const todayDate = UIUtils.today();  // 생산계획 현황은 항상 당일 고정
        if (label) label.textContent = `(${todayDate})`;

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const allWorks = Storage.getAll(STORE) || [];

        // 현재 페이지에 있는 라인만 렌더
        if (bodyA) bodyA.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-A', todayDate);
        if (bodyB) bodyB.innerHTML = _renderLinePlanData(allPlans, allWorks, '도장-B', todayDate);
    }

    // 계획 시간대(startTime~endTime) 대비 "현재 시각이 몇 % 지점"인지 추정 — 실적과 무관한
    // 시간 진행률이다. 과거 날짜는 100%, 미래 날짜는 0%, 오늘은 현재 시각으로 보간한다.
    function _estimateTimeProgress(plan, targetDate) {
        const start = plan.startTime || plan.slot || '';
        const end = plan.endTime || '';
        if (!start || !end) return null;
        const toMin = function(t) {
            const m = String(t).match(/^(\d{1,2}):(\d{2})/);
            if (!m) return null;
            return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        };
        let startMin = toMin(start);
        let endMin = toMin(end);
        if (startMin == null || endMin == null) return null;
        if (endMin <= startMin) endMin += 24 * 60; // 자정을 넘어가는 슬롯(예: 20:00~02:00) 보정

        const today = UIUtils.today();
        if (targetDate < today) return 100;
        if (targetDate > today) return 0;

        const now = new Date();
        let nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin < startMin - 12 * 60) nowMin += 24 * 60; // 자정 넘어 진행 중인 슬롯 보정
        if (nowMin <= startMin) return 0;
        if (nowMin >= endMin) return 100;
        return Math.round(((nowMin - startMin) / (endMin - startMin)) * 100);
    }

    // 라인별 계획 데이터 HTML 생성 헬퍼
    function _renderLinePlanData(allPlans, allWorks, line, targetDate) {
        if (!targetDate) targetDate = UIUtils.today();
        const targetLine = _resolvePaintLine(line);
        const plansRaw = allPlans.filter(p =>
            p.date === targetDate &&
            _resolvePaintLine(p.line) === targetLine &&
            (p.carModel || p.partName)
        ).sort((a, b) =>
            (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || '')
        );
        // 동일 시작시각 중복은 최신만 표시 (생산계획 수정 시 구 문서 잔존 대응)
        const bySlot = {};
        const noSlot = [];
        plansRaw.forEach(p => {
            const key = String(p.startTime || p.slot || '').trim();
            if (!key) { noSlot.push(p); return; }
            const prev = bySlot[key];
            if (!prev) { bySlot[key] = p; return; }
            const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
            if (newer) bySlot[key] = p;
        });
        const plans = Object.values(bySlot).concat(noSlot)
            .sort((a, b) => (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || ''));

        const dayWorks = allWorks.filter(w =>
            w.date === targetDate && _resolvePaintLine(w.line) === targetLine
        );

        if (plans.length === 0) {
            return `
                <tr>
                    <td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem;">
                        등록된 계획 없음
                    </td>
                </tr>`;
        }

        return plans.map(plan => {
            const planQty = Number(plan.planQty) || 0;
            const achieved = dayWorks.filter(w =>
                w.carModel === plan.carModel &&
                w.partName === plan.partName &&
                w.color === plan.color
            ).reduce((s, w) => s + _workQtys(w).productionQty, 0);

            const rate = planQty > 0 ? Math.min(100, Math.round(achieved / planQty * 100)) : 0;
            const rateColor = rate >= 100 ? 'var(--accent-green)' : (rate >= 70 ? 'var(--accent-blue)' : (rate > 0 ? 'var(--accent-orange)' : 'var(--text-muted)'));

            const timeStr = plan.startTime ? `${plan.startTime}~${plan.endTime || ''}` : (plan.slot || '-');
            const timeProgress = _estimateTimeProgress(plan, targetDate);
            const tpColor = timeProgress == null ? 'var(--text-muted)'
                : timeProgress >= 100 ? 'var(--accent-green)'
                : timeProgress >= 50 ? 'var(--accent-blue)'
                : timeProgress > 0 ? 'var(--accent-orange)' : 'var(--text-muted)';
            const timeProgressHtml = timeProgress == null
                ? '<span style="font-size:0.75rem;color:var(--text-muted);">-</span>'
                : `
                <div style="display:flex;align-items:center;gap:6px;">
                    <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden;" title="시간대 기준 예상 진행률(실적과 무관)">
                        <div style="width:${timeProgress}%;height:100%;background:${tpColor};"></div>
                    </div>
                    <span style="font-size:0.75rem;min-width:30px;text-align:right;color:${tpColor};font-weight:600;">${timeProgress}%</span>
                </div>`;

            const matchedWork = dayWorks.find(w => w.planId === plan.id);
            const isCompleted = !!matchedWork;
            // 누가, 언제 실적을 입력했는지 — "입력 완료" 배지만으로는 시비가 생겼을 때 확인할 방법이 없었다.
            const completedByName = isCompleted ? (_workRegisteredByName(matchedWork) || '-') : '';
            const completedAtRaw = isCompleted ? String(matchedWork.registeredAt || matchedWork.createdAt || '') : '';
            const completedAtLabel = completedAtRaw
                ? completedAtRaw.slice(0, 16).replace('T', ' ').slice(5)
                : '';

            // 오늘 계획이고 시작시간이 현재보다 미래면 → 대기 상태 (실적 없는 경우에만)
            const _nowD = new Date();
            const _nowTimeStr = _nowD.getHours().toString().padStart(2,'0') + ':' + _nowD.getMinutes().toString().padStart(2,'0');
            const _planStart = plan.startTime || plan.slot || '';
            const isFuture = !isCompleted && (targetDate === UIUtils.today()) && !!_planStart && _planStart > _nowTimeStr;

            // 생산 시간대가 시작됐는데 현장 사출 입고 확인이 없으면 경고 + 실적입력 차단
            const hasInbound = _hasConfirmedSiteInboundForPlan(plan, targetDate);
            const missingInbound = !hasInbound && (timeProgress == null ? !isFuture : timeProgress > 0);
            const blockByInbound = !isCompleted && !isFuture && !hasInbound;

            let btnText, btnIcon, btnBg, btnShadow, btnOpacity, btnDisabled, btnOnclick;
            if (isCompleted) {
                btnText = '입력 완료';
                btnIcon = 'check_circle';
                btnBg = 'var(--accent-green)';
                btnShadow = 'rgba(76,175,80,0.2)';
                btnOpacity = '0.85';
                btnDisabled = true;
                btnOnclick = `UIUtils.toast('이미 실적이 등록된 계획입니다.', 'info')`;
            } else if (isFuture) {
                btnText = '대기';
                btnIcon = 'schedule';
                btnBg = '#94a3b8';
                btnShadow = 'rgba(0,0,0,0.06)';
                btnOpacity = '0.65';
                btnDisabled = true;
                btnOnclick = `UIUtils.toast('아직 시작되지 않은 계획입니다.', 'info')`;
            } else if (blockByInbound) {
                btnText = '소재입고 필요';
                btnIcon = 'inventory_2';
                btnBg = '#dc2626';
                btnShadow = 'rgba(220,38,38,0.25)';
                btnOpacity = '0.95';
                btnDisabled = false;
                btnOnclick = `PaintingWorkModule.openMissingInboundForPlan('${plan.id}')`;
            } else {
                btnText = '실적입력';
                btnIcon = 'edit_note';
                btnBg = 'var(--accent-blue)';
                btnShadow = 'rgba(66,133,244,0.2)';
                btnOpacity = '1';
                btnDisabled = false;
                btnOnclick = `PaintingWorkModule.openAddModalFromPlan('${plan.id}')`;
            }

            const rowClass = missingInbound ? ' class="pw-missing-inbound-row"' : '';
            const missingHint = missingInbound
                ? '<div style="margin-top:3px;font-size:0.68rem;font-weight:700;color:#dc2626;">⚠ 사출 입고 미입력</div>'
                : '';

            return `
                <tr${rowClass} title="${missingInbound ? '생산 진행 중인데 현장 사출 입고 확인이 없습니다' : ''}">
                    <td style="font-size:0.82rem; white-space:nowrap;">${timeStr}</td>
                    <td style="font-weight:600;white-space:nowrap;">${plan.carModel || ''}</td>
                    <td style="line-height:1.2;">
                        <span style="font-size:0.78rem;color:var(--text-muted);">${plan.partName || ''} (${plan.color || '-'})</span>
                        ${missingHint}
                    </td>
                    <td>${timeProgressHtml}</td>
                    <td style="text-align:right; font-weight:600;">${UIUtils.formatNumber(planQty)}</td>
                    <td style="text-align:right; font-weight:600; color:${rateColor};">${UIUtils.formatNumber(achieved)}</td>
                    <td>
                        <button class="btn btn-xs"
                            style="padding:6px 12px; font-size:0.8rem; background:${btnBg}; color:#fff; border:none; border-radius:4px; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s; box-shadow:0 2px 4px ${btnShadow}; white-space:nowrap; width:max-content; opacity:${btnOpacity}; cursor:${btnDisabled ? 'default' : 'pointer'};"
                            onclick="${btnOnclick}"
                            ${!btnDisabled ? `onmouseover="this.style.filter='brightness(1.1)';this.style.transform='translateY(-1px)';" onmouseout="this.style.filter='none';this.style.transform='none';"` : ''}>
                            <span class="material-symbols-outlined" style="font-size:16px;">${btnIcon}</span>
                            ${btnText}
                        </button>
                    </td>
                    <td style="font-size:0.76rem;color:var(--text-muted);white-space:nowrap;line-height:1.3;">
                        ${isCompleted ? `<div>${completedByName}</div><div>${completedAtLabel || '-'}</div>` : '-'}
                    </td>
                </tr>`;
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 작업 실적 목록 렌더링
    // ──────────────────────────────────────────────
    function _getWorkListBaseData() {
        const startEl = document.getElementById('pwStart');
        const endEl = document.getElementById('pwEnd');
        // 기본: 오늘 포함 과거 7일 (오늘 입력분도 바로 보이게)
        const start = (startEl && startEl.value) ? startEl.value : UIUtils.daysAgo(7);
        const end = (endEl && endEl.value) ? endEl.value : UIUtils.daysAgo(0);

        return Storage.getAll(STORE)
            .filter(d => {
                // 도장작업일(date) 또는 등록일(registeredAt) 중 하나라도 기간에 들어가면 표시
                // (예전엔 registeredAt만 봐서 작업일은 7/30인데 등록이 7/31이면 목록에서 사라짐)
                const workDay = String(d.date || '').trim().slice(0, 10);
                const regDay = d.registeredAt ? String(d.registeredAt).slice(0, 10) : '';
                const dayOk = (workDay && workDay >= start && workDay <= end)
                    || (regDay && regDay >= start && regDay <= end);
                if (!dayOk) return false;
                return _matchesCurrentLine(d.line);
            })
            .sort((a, b) => {
                const aReg = a.registeredAt || '';
                const bReg = b.registeredAt || '';
                if (aReg && bReg) return bReg.localeCompare(aReg);
                if (bReg) return 1;
                if (aReg) return -1;
                const dc = (b.date || '').localeCompare(a.date || '');
                return dc !== 0 ? dc : (b.startTime || '').localeCompare(a.startTime || '');
            });
    }

    function updateWorkPartFilter(shouldRenderList) {
        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');
        if (!partNameSel) {
            if (shouldRenderList) renderWorkList();
            return;
        }

        const allData = _getWorkListBaseData();
        const selectedCarModel = carModelSel ? carModelSel.value : '';
        const currentPartName = partNameSel.value;
        const filteredForPart = selectedCarModel
            ? allData.filter(d => d.carModel === selectedCarModel)
            : allData;
        const uniquePartNames = [...new Set(filteredForPart.map(d => d.partName).filter(Boolean))].sort();

        partNameSel.innerHTML = '<option value="">전체</option>' +
            uniquePartNames.map(p => `<option value="${p}" ${currentPartName === p ? 'selected' : ''}>${p}</option>`).join('');

        if (currentPartName && !uniquePartNames.includes(currentPartName)) {
            partNameSel.value = '';
        }

        if (shouldRenderList) renderWorkList();
    }

    function _buildWorkListRowHtml(d) {
        // 사출 LOT은 더 이상 별도 칸에 늘어놓지 않고 "사출현장입고수(LOT수)" 칸에 개수만
        // 보여준다 — 대신 상세 LOT·수량 목록은 그 칸에 마우스를 올리면 볼 수 있게 툴팁으로 남긴다.
        const lotTooltip = (d.lots && d.lots.length > 0)
            ? d.lots.map(l => l.lotNo + (l.qty ? '(' + UIUtils.formatNumber(l.qty) + ')' : '')).join(', ')
            : (d.lotNo || '');

        const timeStr = d.startTime
            ? '<div style="font-size:0.7rem;line-height:1.3;">' + d.startTime + '</div>' +
              (d.endTime ? '<div style="font-size:0.7rem;line-height:1.3;color:var(--text-muted);">' + d.endTime + '</div>' : '')
            : '-';
        const _plan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        let _baseCT = 0;
        if (_plan && _plan.startTime && _plan.endTime && Number(_plan.planQty) > 0) {
            const _bsh = parseInt(_plan.startTime.split(':')[0]);
            const _bsm = parseInt(_plan.startTime.split(':')[1]);
            const _beh = parseInt(_plan.endTime.split(':')[0]);
            const _bem = parseInt(_plan.endTime.split(':')[1]);
            const _pm = (_beh * 60 + _bem) - (_bsh * 60 + _bsm);
            if (_pm > 0) _baseCT = (_pm * 60) / Number(_plan.planQty);
        }

        const ctStr = d.avgCT > 0
            ? '<span style="color:var(--accent-blue);font-size:0.84rem;font-weight:600;">' + d.avgCT.toFixed(1) + '초</span>' +
              (_baseCT > 0 ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:1px;">기본 ' + _baseCT.toFixed(1) + '초</div>' : '')
            : '-';

        const effStr = (() => {
            if (!d.avgCT || !_baseCT) return '<span style="color:var(--text-muted);">-</span>';
            const eff = Math.round(_baseCT / d.avgCT * 100);
            const color = eff >= 100 ? '#16a34a' : eff >= 85 ? '#d97706' : '#dc2626';
            return '<span style="font-weight:700;color:' + color + ';">' + eff + '%</span>';
        })();

        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _prod = _products.find(p => p.carModel === d.carModel && p.partName === d.partName);
        const _cvt = _getProductCvtForLine(_prod, d.line);
        const _inputQty  = _workQtys(d).inputQty;
        const _spindle   = (_cvt > 0 && _inputQty > 0) ? Math.ceil(_inputQty / _cvt) : 0;
        const cvtStr     = _cvt > 0
            ? '<span style="font-weight:700;color:var(--accent-blue);">' + _cvt + '</span>'
            : '<span style="color:var(--text-muted);">-</span>';
        const spindleStr = _spindle > 0
            ? '<span style="font-weight:700;color:var(--accent-green);">' + UIUtils.formatNumber(_spindle) + '</span>' +
              '<div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">' +
              UIUtils.formatNumber(_inputQty) + '÷' + _cvt + '</div>'
            : '<span style="color:var(--text-muted);">-</span>';

        const isInspectionCompleted = d.inspectionStatus === 'completed';
        // 도장-A → 레이저로 이어지는 품목은 도장검사 없이 레이저대기로 넘어가므로 inspectionStatus가 남지 않는다.
        // 그 대신 레이저대기 입고처리(LaserStandbyModule 확인 기록)가 완료되면 같은 자리에 녹색으로 표시한다.
        const isLaserInboundConfirmed = (!isInspectionCompleted &&
            typeof LaserStandbyModule !== 'undefined' && typeof LaserStandbyModule.isLaserInboundConfirmed === 'function')
            ? LaserStandbyModule.isLaserInboundConfirmed(d.id)
            : false;
        const statusBadge = isInspectionCompleted
            ? '<span style="display:inline-block; background:var(--accent-green); color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; margin-right:4px;">✓ 검사완료</span>'
            : (isLaserInboundConfirmed
                ? '<span style="display:inline-block; background:var(--accent-green); color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; margin-right:4px;">✓ 입고완료</span>'
                : '');
        // 레이저 입고 확인 시 산출-실입고 오차가 발견된 실적은 이 목록에 배지로 끼워 넣지 않고
        // "후공정 수량 재확인 필요" 섹션에서 별도로 모아 보여준다(renderLaserQtyIssueSection).
        // 계획수량 초과/부족 여부는 배지 대신 도장투입수 앞에 작은 ▲/▼ 표시로 옮겨 보여준다(아래 inputMarkHtml).
        const timeChangeBadge = d.timeReason
            ? '<span style="display:inline-block;background:#ef4444;color:#fff;padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;margin-right:3px;" title="시간변동: ' + (d.timeReason || '') + (d.timeReasonDetail ? ' / ' + d.timeReasonDetail : '') + '">⏱ 시간변동</span>'
            : '';

        const _cu = AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        const _isAdmin = _cu && _cu.role === 'admin';
        const deleteBtn = _isAdmin
            ? '<button type="button" class="btn btn-sm btn-danger" onclick="PaintingWorkModule.removeWork(\'' + d.id + '\')" style="margin-left:4px;">삭제</button>'
            : '';
        const actionButtons = '<button type="button" class="btn btn-sm btn-outline" onclick="PaintingWorkModule.openWorkViewPage(\'' + d.id + '\')">보기</button>' + deleteBtn;

        const regDateRaw = d.registeredAt ? d.registeredAt.slice(0, 10) : '';
        const regParts = regDateRaw.split('-');
        const regTimeRaw = d.registeredAt && d.registeredAt.length >= 16 ? d.registeredAt.slice(11, 16) : '';
        const regDate = regParts.length === 3
            ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + regParts[0] + '</span>' +
              '<span style="font-weight:600;white-space:nowrap;">' + regParts[1] + '-' + regParts[2] + '</span>' +
              (regTimeRaw ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + regTimeRaw + '</span>' : '')
            : '<span style="color:var(--text-muted);">-</span>';
        const workDateParts = (d.date || '').split('-');
        const workStartTime = (d.startTime || '').slice(0, 5);
        const workDateHtml = workDateParts.length === 3
            ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + workDateParts[0] + '</span>' +
              '<span style="font-weight:600;white-space:nowrap;">' + workDateParts[1] + '-' + workDateParts[2] + '</span>' +
              (workStartTime ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + workStartTime + '</span>' : '')
            : (d.date || '-');

        const _qtys = _workQtys(d);
        const _inQ = Number(_qtys.inputQty) || 0;
        const _prodQ = Number(_qtys.productionQty) || 0;
        // 계획수량 대비 초과/부족 — 도장투입수 앞에 작게 ▲(초과)/▼(부족)로 표시
        const _planQtyNum = (_plan && Number(_plan.planQty) > 0) ? Number(_plan.planQty) : 0;
        const inputMarkHtml = d.overPlanQty
            ? '<span style="color:#d97706;font-weight:700;font-size:0.72rem;" title="계획수량 초과 등록됨">▲</span> '
            : (_planQtyNum > 0 && _inQ < _planQtyNum
                ? '<span style="color:#dc2626;font-weight:700;font-size:0.72rem;" title="계획수량 대비 부족">▼</span> '
                : '');
        const _issuedOpts = {
            carModel: d.carModel,
            partName: d.partName,
            color: d.color,
            date: d.date,
            lots: d.lots,
            lotNo: d.lotNo,
            injPartName: d.injPartName,
            workId: d.id,
            planId: d.planId,
            inputQty: _inQ
        };
        // 반납분은 유실이 아니다 — 사출창고로 되돌린 수량을 빼야 실제 미정산분만 남는다.
        // 행 하나에서 예외가 나도 목록 전체 렌더가 멈추지 않도록 반드시 감싼다.
        var _returned = 0;
        try {
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getReturnedQtyForWork) {
                _returned = Number(PaintingInputModule.getReturnedQtyForWork(d.line || _currentLine, _issuedOpts)) || 0;
            }
        } catch (e) { console.warn('[PaintingWorkModule] getReturnedQtyForWork 실패:', d.id, e); }
        var _issued = 0;
        var _issuedLotCount = 0;
        try {
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getIssuedQtyForWork) {
                _issued = Number(PaintingInputModule.getIssuedQtyForWork(d.line || _currentLine, _issuedOpts)) || 0;
            }
            _issuedLotCount = (d.lots && d.lots.length) ? d.lots.length : (d.lotNo ? 1 : 0);
            // 현장입고사출은 현장 입고 원장 합계만 표시한다. 투입+반납으로 하한을 올리면
            // 반납이 과다 기록된 경우(또는 중복 입고 정리 전 잔량으로 반납한 경우) 창고 출고
            // 20,400인데 목록만 22,800처럼 "없는 입고 수량"이 새로 생긴다. 상세보기의
            // _actualInputMaterialQty와 어긋난다. 반납이 입고보다 많으면 과잉/유실·반납 열에서
            // 드러나게 두고, 입고 숫자는 원장을 따른다.
        } catch (e) { console.warn('[PaintingWorkModule] getIssuedQtyForWork 실패:', d.id, e); }
        const _xl = _issued - _inQ - _returned;
        const _miss = _inQ - _prodQ;
        // 현장 입고(분출) 없으면 과잉/유실 비교 불가 → "-"
        const issuedHtml = _issued > 0
            ? UIUtils.formatNumber(_issued)
            : '<span style="color:var(--text-muted);">-</span>';
        // 자재 반납 열 — 이 실적 조건으로 사출창고에 되돌린 수량.
        // 반납 대기(창고 미확인)가 섞여 있으면 함께 표시해 "반납했는데 재고에 안 잡힘"을 구분한다.
        const _retPending = (function () {
            try {
                if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.listPendingReturns) return 0;
                const day = String(d.date || '').slice(0, 10);
                const injPart = String(_issuedOpts.injPartName || _issuedOpts.partName || '').trim();
                return (PaintingInputModule.listPendingReturns({ line: d.line || _currentLine }) || [])
                    .filter(function (r) {
                        if (String(r.date || '').slice(0, 10) !== day) return false;
                        if (d.carModel && r.carModel && String(r.carModel) !== String(d.carModel)) return false;
                        if (injPart && r.partName && String(r.partName).trim() !== injPart) return false;
                        return true;
                    })
                    .reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
            } catch (e) { return 0; }
        })();
        const returnedHtml = _returned > 0
            ? '<span style="font-weight:700;color:#0891b2;" title="사출창고로 반납한 수량">'
                + UIUtils.formatNumber(_returned) + '</span>'
                + (_retPending > 0
                    ? '<div style="font-size:0.68rem;font-weight:700;color:#b45309;" title="반납했지만 사출창고에서 아직 「입고 처리」하지 않은 수량입니다.">대기 '
                        + UIUtils.formatNumber(_retPending) + '</div>'
                    : '')
            : '<span style="color:var(--text-muted);">-</span>';

        const _retNote = '';   // 반납 수량은 별도 '자재 반납' 열에서 표시한다
        const _xlTitle = '분출 ' + UIUtils.formatNumber(_issued)
            + ' − 투입 ' + UIUtils.formatNumber(_inQ)
            + (_returned > 0 ? ' − 반납 ' + UIUtils.formatNumber(_returned) : '')
            + ' = ' + UIUtils.formatNumber(_xl);
        const xlHtml = _issued <= 0
            ? '<span style="color:var(--text-muted);">-</span>'
            : (Math.abs(_xl) < 0.001
                ? '<span style="color:#16a34a;font-weight:600;" title="' + _xlTitle + '">0</span>' + _retNote
                : (_xl > 0
                    // 분출 > 투입 + 반납 → 아직 정산되지 않은 자재 (현장 잔량이거나 실제 유실)
                    ? '<span style="color:#dc2626;font-weight:700;" title="' + _xlTitle + ' — 현장에 남아 있거나 유실된 미정산 수량입니다. 남은 자재는 반납 처리하세요.">유실 ' + UIUtils.formatNumber(_xl) + '</span>' + _retNote
                    // 투입 > 분출 → 공식 분출량보다 더 많이 투입 기록됨 = 과잉
                    : '<span style="color:#d97706;font-weight:700;" title="' + _xlTitle + '">과잉 ' + UIUtils.formatNumber(Math.abs(_xl)) + '</span>' + _retNote));
        const missHtml = Math.abs(_miss) < 0.001
            ? '<span style="color:#16a34a;font-weight:600;">0</span>'
            : (_miss > 0
                ? '<span style="color:#dc2626;font-weight:700;">' + UIUtils.formatNumber(_miss) + '</span>'
                : '<span style="color:#d97706;font-weight:600;">' + UIUtils.formatNumber(_miss) + '</span>');

        // 후공정(레이저) 입고 확인수 · 오차 수량 — 레이저 쪽에서 실제로 확인 처리한 실입고수량과
        // 도장 산출수량(=완료수량) 차이를 매 행에 보여준다. 아직 레이저 입고 확인 자체가 안 됐으면 "-".
        const _laserConfirm = (typeof LaserStandbyModule !== 'undefined' && typeof LaserStandbyModule.getInboundConfirmRecord === 'function')
            ? LaserStandbyModule.getInboundConfirmRecord(d.id)
            : null;
        const laserConfirmedHtml = _laserConfirm
            ? UIUtils.formatNumber(_laserConfirm.actualQty)
            : '<span style="color:var(--text-muted);">-</span>';
        const laserDiffHtml = (() => {
            if (!_laserConfirm) return '<span style="color:var(--text-muted);">-</span>';
            const diff = Number(_laserConfirm.diff) || 0;
            if (Math.abs(diff) < 0.001) return '<span style="color:#16a34a;font-weight:600;">0</span>';
            return '<span style="color:#dc2626;font-weight:700;">' + (diff > 0 ? '-' : '+') + UIUtils.formatNumber(Math.abs(diff)) + '</span>';
        })();

        const planQtyHtml = _plan && Number(_plan.planQty) > 0
            ? UIUtils.formatNumber(_plan.planQty)
            : '<span style="color:var(--text-muted);">-</span>';
        // 사출현장입고수(LOT수) — 자재 분출 수량 + 이 실적에 반영된 LOT 개수를 한 칸에 표시.
        // "-"로 뜨거나(매칭 실패) 이 실적 자신의 투입+반납보다 훨씬 크게 뜨면(중복/타 실적 혼입
        // 의심) 왜 그 값이 나왔는지 마우스 오버로 바로 확인할 수 있게 합산 근거를 붙인다.
        const _lotCount = _issuedLotCount;
        const _issuedSuspicious = _issued > 0.001 && Math.abs(_issued - (_inQ + _returned)) > 0.001;
        const issuedWithLotHtml = (_issued > 0 && !_issuedSuspicious)
            ? UIUtils.formatNumber(_issued) + (_lotCount > 0 ? '<div style="font-size:0.66rem;color:var(--text-muted);">' + _lotCount + '개 LOT</div>' : '')
            : (function () {
                const reason = (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.debugIssuedQtyInfo)
                    ? PaintingInputModule.debugIssuedQtyInfo(d.line || _currentLine, _issuedOpts)
                    : '';
                const label = _issued > 0 ? UIUtils.formatNumber(_issued) : '-';
                return '<span style="color:' + (_issued > 0 ? '#dc2626' : 'var(--text-muted)') + ';cursor:help;border-bottom:1px dotted currentColor;font-weight:' + (_issued > 0 ? '700' : '400') + ';" title="' + _pwEsc(reason) + '">' + label + '</span>';
            })();

        const td = 'padding:8px 10px;';
        const rowBg = isInspectionCompleted ? 'background:rgba(22,163,74,0.05);' : '';
        return '<tr style="' + rowBg + '">' +
            '<td style="' + td + 'line-height:1.3;">' + workDateHtml + '</td>' +
            '<td style="' + td + 'line-height:1.3;">' + regDate + '</td>' +
            '<td style="' + td + 'white-space:nowrap;">' + (d.carModel || '-') + '</td>' +
            '<td style="' + td + 'white-space:nowrap;">' + (d.partName || '-') + '</td>' +
            '<td style="' + td + 'white-space:nowrap;">' + (d.color || '-') + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + planQtyHtml + '</td>' +
            '<td style="' + td + 'text-align:right;font-weight:700;color:var(--accent-blue);white-space:nowrap;" title="' + _pwEsc(lotTooltip) + '">' + issuedWithLotHtml + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + returnedHtml + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + xlHtml + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + inputMarkHtml + UIUtils.formatNumber(_inQ) + '</td>' +
            '<td style="' + td + 'text-align:right;font-weight:600;white-space:nowrap;">' + UIUtils.formatNumber(_prodQ) + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + laserConfirmedHtml + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + laserDiffHtml + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + missHtml + '</td>' +
            '<td style="' + td + 'white-space:nowrap;">' + timeStr + '</td>' +
            '<td style="' + td + 'text-align:right;line-height:1.4;white-space:nowrap;">' + ctStr + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + effStr + '</td>' +
            '<td style="' + td + 'text-align:center;white-space:nowrap;display:none;">' + cvtStr + '</td>' +
            '<td style="' + td + 'text-align:right;white-space:nowrap;">' + spindleStr + '</td>' +
            '<td style="' + td + 'white-space:nowrap;">' + actionButtons + ' ' + timeChangeBadge + statusBadge + '</td></tr>';
    }

    async function renderWorkList() {
        // "레이져대기입고" 배지 판정에 필요한 확인 캐시를 먼저 채워둔다(없으면 항상 미확인으로 보임).
        if (typeof LaserStandbyModule !== 'undefined' && typeof LaserStandbyModule.ensureInboundConfirmLoaded === 'function') {
            try { await LaserStandbyModule.ensureInboundConfirmLoaded(); } catch (e) { console.warn('[PaintingWorkModule] laser inbound confirm preload failed:', e); }
        }
        if (typeof PaintingInputModule !== 'undefined' && typeof PaintingInputModule.alignInflatedSiteReturns === 'function') {
            try { await PaintingInputModule.alignInflatedSiteReturns(); } catch (eRet) { console.warn('[PaintingWorkModule] 반납수량 정리 실패:', eRet); }
        }

        let data = _getWorkListBaseData();

        const uniqueCarModels = UIUtils.sortCarModels(data.map(d => d.carModel));
        const carModelSel = document.getElementById('pwFilterCarModel');
        const partNameSel = document.getElementById('pwFilterPartName');

        if (carModelSel) {
            const currentCarModel = carModelSel.value;
            carModelSel.innerHTML = '<option value="">전체</option>' +
                uniqueCarModels.map(m => `<option value="${m}" ${currentCarModel === m ? 'selected' : ''}>${m}</option>`).join('');
        }

        updateWorkPartFilter(false);

        const filterCarModel = carModelSel ? carModelSel.value : '';
        const filterPartName = partNameSel ? partNameSel.value : '';

        if (filterCarModel) {
            data = data.filter(d => d.carModel === filterCarModel);
        }
        if (filterPartName) {
            data = data.filter(d => d.partName === filterPartName);
        }

        const listA = data.filter(d => _normalizePaintLine(d.line) !== '도장-B');
        const listB = data.filter(d => _normalizePaintLine(d.line) === '도장-B');

        const emptyRow = '<tr><td colspan="20" style="text-align:center;padding:28px;color:var(--text-muted);">데이터가 없습니다.</td></tr>';
        const bodyA = document.getElementById('pwTableBodyA');
        const bodyB = document.getElementById('pwTableBodyB');
        const countA = document.getElementById('pwWorkCountA');
        const countB = document.getElementById('pwWorkCountB');
        // 구버전 DOM 호환
        const legacyBody = document.getElementById('pwTableBody');

        if (bodyA) bodyA.innerHTML = listA.length ? listA.map(_buildWorkListRowHtml).join('') : emptyRow;
        if (bodyB) bodyB.innerHTML = listB.length ? listB.map(_buildWorkListRowHtml).join('') : emptyRow;
        if (countA) countA.textContent = listA.length + '건';
        if (countB) countB.textContent = listB.length + '건';
        if (legacyBody && !bodyA && !bodyB) {
            legacyBody.innerHTML = data.length
                ? data.map(_buildWorkListRowHtml).join('')
                : emptyRow;
        }
    }

    // ──────────────────────────────────────────────
    // 사출 LOT 목록 (잔량 계산)
    // ──────────────────────────────────────────────
    function getInjectionLots(carModel, partName, planDate) {
        var lots;
        if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getLotsByCarPart) {
            lots = PaintingInputModule.getLotsByCarPart(_currentLine, carModel, partName);
        } else {
            const all = Storage.getAll(INJ_INV_STORE) || [];
            const lotMap = {};
            all.forEach(item => {
                if (!item.lotNo) return;
                const matchModel = !carModel || item.carModel === carModel;
                const matchPart = !partName || item.partName === partName;
                // ★ AND 조건: carModel과 partName 모두 일치해야 함 (OR 조건으로 인한 다른 제품 로트 혼입 방지)
                if (!matchModel || !matchPart) return;
                const key = item.lotNo;
                if (!lotMap[key]) {
                    lotMap[key] = {
                        lotNo: item.lotNo,
                        carModel: item.carModel || '',
                        partName: item.partName || '',
                        supplier: item.supplier || '',
                        balance: 0
                    };
                }
                if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
                else lotMap[key].balance += Number(item.quantity) || 0;
            });
            lots = Object.values(lotMap).filter(l => l.balance > 0)
                .sort((a, b) => a.lotNo.localeCompare(b.lotNo)); // 선입선출: 오래된 LOT 먼저
        }
        // 계획일(도장작업일)이 있으면 그날 현장입고된 LOT만 — 사출명 미지정이어도
        // 옛 잔여 LOT이 자동 투입되는 사고를 막는다.
        return _filterLotsToPlanDay(lots, planDate, carModel, partName);
    }

    /** 계획일(=도장작업일)에 현장 입고된 LOT만 남긴다. planDate 없으면 그대로 반환. */
    function _filterLotsToPlanDay(lots, planDate, carModel, injPartName) {
        if (!planDate || !lots || !lots.length) return lots || [];
        var targetDay = String(planDate).slice(0, 10);
        var rows = [];
        try { rows = Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []; }
        catch (e) { rows = []; }
        return lots.filter(function (l) {
            var lotNo = String((l && l.lotNo) || '').trim();
            if (!lotNo) return false;
            var hit = rows.some(function (r) {
                if (String(r.type || '') !== '입고') return false;
                if (carModel && String(r.carModel || '').trim() !== String(carModel).trim()) return false;
                if (injPartName && !_inboundInjPartMatches(r.partName, injPartName, injPartName, carModel)) return false;
                var recLots = _inboundRecordLots(r);
                if (!recLots.some(function (x) { return String(x.lotNo || '').trim() === lotNo; })) return false;
                return _inboundDayHits(r, targetDay);
            });
            if (hit) return true;
            var stamp = _findSiteInboundDateForLotScoped(l.lotNo, carModel, injPartName);
            return !!stamp && String(stamp).replace('T', ' ').slice(0, 10) === targetDay;
        });
    }

    function buildLotOptionsHtml(carModel, partName, planDate) {
        const lots = getInjectionLots(carModel, partName, planDate);
        if (lots.length === 0) {
            return planDate
                ? '<option value="" data-balance="">-- 오늘(' + String(planDate).slice(0, 10) + ') 현장입고 LOT 없음 --</option>'
                : '<option value="" data-balance="">-- 해당 LOT 없음 --</option>';
        }
        return lots.map((l, i) => {
            return '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') +
            ' data-balance="' + l.balance + '"' +
            ' data-part-name="' + String(l.partName || '').replace(/"/g, '&quot;') + '"' +
            ' data-color="' + String(l.color || '').replace(/"/g, '&quot;') + '">' +
            _lotOptionLabel(l, l.partName || '', { withColor: false }) + '</option>';
        }).join('');
    }

    // ──────────────────────────────────────────────
    // 레이져 후 재공품 LOT 잔량 (레이져→도장-B 전용)
    // LASER_WORK_LOG.paintLots (사출 LOT 정보) 기준으로 WIP 잔량 계산
    // 같은 사출 LOT이 재공·현장리워크에 동시에 있으면 option value를 분리한다.
    // ──────────────────────────────────────────────
    function _lotOptionKey(l) {
        if (!l) return '';
        if (l.optionKey) return String(l.optionKey);
        if (l.lotSource === 'site_rework') return 'rework:' + String(l.lotNo || '');
        var paint = String(l.paintLot || '').trim();
        if (paint && paint !== '-') return 'wip:' + paint + ':' + String(l.lotNo || '');
        return 'wip:' + String(l.lotNo || '');
    }

    function _lotNoFromOptionValue(val) {
        var s = String(val || '').trim();
        if (s.indexOf('rework:') === 0) return s.slice(7);
        if (s.indexOf('wip:') === 0) {
            var rest = s.slice(4);
            var i = rest.lastIndexOf(':');
            return i >= 0 ? rest.slice(i + 1) : rest;
        }
        return s;
    }

    function _laserWipLotOptionHtml(l, selected) {
        var key = _lotOptionKey(l);
        var paint = (l.paintLot && l.paintLot !== '-') ? l.paintLot : '';
        var isRework = l.lotSource === 'site_rework';
        var label = isRework
            ? '현장 재사용 자재 / 사출 ' + l.lotNo + (l.color ? ' │ ' + l.color : '') +
              ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA'
            : '도장 ' + (paint || '미지정') + ' / 사출 ' + l.lotNo +
              (l.color ? ' │ ' + l.color : '') +
              ' │ 잔량 ' + UIUtils.formatNumber(l.balance) + ' EA';
        return '<option value="' + _pwEsc(key) + '"' + (selected ? ' selected' : '') +
            ' data-balance="' + l.balance + '"' +
            ' data-lot-no="' + _pwEsc(l.lotNo || '') + '"' +
            ' data-lot-source="' + (isRework ? 'site_rework' : 'laser_wip') + '"' +
            ' data-paint-lot="' + _pwEsc(paint) + '"' +
            ' data-part-name="' + _pwEsc(l.partName || '') + '"' +
            ' data-color="' + _pwEsc(l.color || '') + '">' +
            label + '</option>';
    }

    function _getSiteReworkLotsForLaserWip(carModel, partName, opts) {
        if (typeof PaintingInputModule === 'undefined') return [];
        opts = opts || {};
        var color = String(opts.color || '').trim()
            || ((document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '').trim();
        var inj = '';
        try { inj = _resolveInjPartNameForWork(carModel, partName, color) || ''; } catch (e) { inj = ''; }
        var line = String(opts.line || '').trim()
            || ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value || '').trim()
            || (typeof _currentLine !== 'undefined' ? _currentLine : '');
        var names = [];
        if (inj) names.push(inj);
        if (partName && names.indexOf(partName) < 0) names.push(partName);
        var lines = line ? [line] : ['도장-B', '도장-A'];
        if (line && lines.indexOf('도장-B') < 0) lines.push('도장-B');
        var seen = {};
        var out = [];
        function absorb(lots, nm) {
            (lots || []).forEach(function (l) {
                var k = 'rework:' + String(l.lotNo || '');
                if (!l.lotNo || seen[k]) return;
                seen[k] = true;
                out.push({
                    lotNo: l.lotNo,
                    paintLot: '',
                    color: l.color || color || '',
                    balance: Math.max(0, Number(l.balance) || 0),
                    partName: l.partName || nm,
                    lotSource: 'site_rework',
                    optionKey: k
                });
            });
        }
        names.forEach(function (nm) {
            lines.forEach(function (ln) {
                if (typeof PaintingInputModule.getSiteReworkLots === 'function') {
                    absorb(PaintingInputModule.getSiteReworkLots(ln, carModel, nm, color), nm);
                }
                if (typeof PaintingInputModule.getLotsByInjPart === 'function') {
                    absorb(PaintingInputModule.getLotsByInjPart(ln, nm, color, carModel), nm);
                }
                if (typeof PaintingInputModule.getLotsByCarPart === 'function') {
                    absorb((PaintingInputModule.getLotsByCarPart(ln, carModel, nm) || []).filter(function (l) {
                        if (!color) return true;
                        if (!l.color) return false;
                        return typeof PaintingInputModule.colorLooseMatch === 'function'
                            ? PaintingInputModule.colorLooseMatch(l.color, color)
                            : String(l.color).toLowerCase() === String(color).toLowerCase();
                    }), nm);
                }
            });
        });
        return out.filter(function (l) { return l.balance > 0; });
    }

    function getLaserWipLots(carModel, partName, opts) {
        opts = opts || {};
        var wip = [];
        if (typeof LaserWipModule !== 'undefined' && typeof LaserWipModule.getWipLotDetail === 'function') {
            wip = (LaserWipModule.getWipLotDetail(carModel, partName) || [])
                .map(function(l) {
                    var row = {
                        lotNo: l.lotNo || '-',
                        paintLot: l.paintLot || '-',
                        color: l.color || '',
                        balance: Math.max(0, Number(l.balance) || 0),
                        partName: l.partName || partName || '',
                        lotSource: 'laser_wip'
                    };
                    row.optionKey = _lotOptionKey(row);
                    return row;
                })
                .filter(function(l) { return l.balance > 0 && l.lotNo && l.lotNo !== '-'; })
                .sort(function(a, b) {
                    return String(a.paintLot).localeCompare(String(b.paintLot))
                        || String(a.lotNo).localeCompare(String(b.lotNo));
                });
        }
        return wip.concat(_getSiteReworkLotsForLaserWip(carModel, partName, opts));
    }

    function buildLaserWipLotOptionsHtml(carModel, partName, opts) {
        var lots = getLaserWipLots(carModel, partName, opts);
        if (lots.length === 0) return '<option value="" data-balance="">-- 재공품·현장 재사용 자재 LOT 없음 --</option>';
        var wipLots = lots.filter(function (l) { return l.lotSource !== 'site_rework'; });
        var reworkLots = lots.filter(function (l) { return l.lotSource === 'site_rework'; });
        var html = '<option value="" data-balance="">-- LOT 선택 --</option>';
        if (wipLots.length) {
            html += '<optgroup label="▶ 레이져 후 재공품 LOT">';
            html += wipLots.map(function (l, i) { return _laserWipLotOptionHtml(l, i === 0 && !reworkLots.length); }).join('');
            html += '</optgroup>';
        }
        if (reworkLots.length) {
            html += '<optgroup label="▶ 현장입고 재사용 자재 (레이져 생략)">';
            html += reworkLots.map(function (l, i) { return _laserWipLotOptionHtml(l, !wipLots.length && i === 0); }).join('');
            html += '</optgroup>';
        }
        return html;
    }

    // ──────────────────────────────────────────────
    // 사출 컬러 매칭 헬퍼 (대소문자 무시, 복합색 지원)
    // matColor: 자재의 injColor ("BLACK" / "BLACK,GRAY" 등)
    // planColor: 생산계획의 color ("BLACK" / "6PS" 등)
    // ──────────────────────────────────────────────
    function _injColorMatches(matColor, planColor) {
        if (!matColor || !planColor) return true; // 한쪽이라도 없으면 허용
        var mc = matColor.trim().toLowerCase().replace(/\s+/g, '');
        var pc = planColor.trim().toLowerCase().replace(/\s+/g, '');
        if (mc === pc) return true;
        return mc.split(/[,，\/]/).map(function(c) { return c.trim(); })
            .some(function(c) { return c === pc; });
    }

    // ──────────────────────────────────────────────
    // 사출자재 마스터 기반 사출명 조회 헬퍼
    // ──────────────────────────────────────────────
    // 생산계획 품명(planPartName) + 차종 + 컬러 → 사출자재 제작품명1/2 매칭 → injPartName 목록 반환
    function getInjPartNamesForProduct(planPartName, carModel, planColor) {
        if (!planPartName) return [];
        var allowed = _allowedInjPartsForWork(carModel, planPartName);
        var materials = Storage.getAll(INJECTMAT_STORE) || [];
        var seen = {};
        var fromMaster = materials.filter(function(m) {
            var inj = String((m && m.injPartName) || '').trim();
            if (!inj || seen[inj]) return false;
            if (!_injNameAllowed(inj, carModel, planPartName)) return false;
            var colorMatch = _injColorMatches(m.injColor, planColor || '');
            if (!colorMatch) return false;
            seen[inj] = true;
            return true;
        });
        if (fromMaster.length) return fromMaster;
        return Object.keys(allowed).filter(function (n) {
            return n && _normPartKey(n) !== _normPartKey(planPartName);
        }).map(function (n) { return { injPartName: n }; });
    }

    // 사출자재 마스터 미등록 시 사출 창고 partName에서 직접 후보 탐색
    // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 필터 없이 품명 포함만 검색
    function getInjPartNamesFromInventory(planPartName) {
        if (!planPartName) return [];
        var lower = planPartName.toLowerCase();
        var all = Storage.getAll(INJ_INV_STORE) || [];
        var seen = {};
        return all.filter(function(item) {
            if (!item.partName) return false;
            var nameMatch = item.partName.toLowerCase().indexOf(lower) !== -1
                         || item.partName.toLowerCase() === lower;
            return nameMatch && !seen[item.partName] && (seen[item.partName] = true);
        }).map(function(item) {
            return { injPartName: item.partName };
        });
    }

    // 사출명 <option> HTML 빌드 (단일 매칭 시 자동 selected)
    function buildInjPartOptionsHtml(planPartName, carModel, planColor, opts) {
        opts = opts || {};
        // ① 컬러 + 차종 일치 우선
        var parts = getInjPartNamesForProduct(planPartName, carModel, planColor);
        // ② 차종 무관 (컬러 유지)
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', planColor);
        }
        // ③ 도장 컬러 ≠ 사출 소재 컬러인 경우를 위한 폴백 — 컬러 필터 없이 품명+차종만 매칭
        //    예: 도장 DYS → 사출 소재 GRAY (컬러가 달라도 품명 연결로 매칭)
        if (parts.length === 0) {
            parts = getInjPartNamesForProduct(planPartName, carModel, '');
        }
        if (parts.length === 0 && carModel) {
            parts = getInjPartNamesForProduct(planPartName, '', '');
        }
        // ④ 사출자재 마스터 미등록 시 사출 창고에서 직접 탐색
        if (parts.length === 0) {
            parts = getInjPartNamesFromInventory(planPartName);
        }
        // ⑤ 제작품명 표기가 마스터와 살짝 달라도(공백·괄호) 사출명으로 연결
        //    — 여기까지 실패하면 "-- 사출자재 미등록 (전체 LOT)"로 떨어져 당일 입고와
        //    무관한 옛 잔여 LOT이 FIFO로 자동 선택되는 사고가 난다.
        if (parts.length === 0 && typeof _resolveInjPartNameForWork === 'function') {
            var resolved = _resolveInjPartNameForWork(carModel, planPartName, planColor);
            if (resolved) parts = [{ injPartName: resolved }];
        }
        var dayParts = [];
        try {
            dayParts = _siteInboundInjParts((opts && opts.line) || _currentLine, carModel, (opts && opts.date) || '', planPartName)
                .filter(function (n) { return _injNameAllowed(n, carModel, planPartName); });
        } catch (eDayParts) { dayParts = []; }
        dayParts.forEach(function (n) {
            if (!n) return;
            if (parts.some(function (m) { return String(m.injPartName) === n; })) return;
            parts.push({ injPartName: n });
        });
        if (dayParts.length) {
            parts = parts.filter(function (m) {
                var n = String(m.injPartName || '').trim();
                if (!n) return false;
                if (_normPartKey(n) === _normPartKey(planPartName) && dayParts.indexOf(n) < 0) return false;
                return true;
            });
            if (!parts.length) {
                parts = dayParts.map(function (n) { return { injPartName: n }; });
            }
        }
        if (parts.length === 0) {
            return '<option value="">-- 사출자재 미등록 (당일 현장입고 LOT만) --</option>';
        }
        var prefer = (dayParts.length === 1) ? dayParts[0] : '';
        var autoSelect = parts.length === 1;
        var optsHtml = parts.map(function(m) {
            var sel = autoSelect || (prefer && m.injPartName === prefer);
            return '<option value="' + m.injPartName + '"' + (sel ? ' selected' : '') + '>' +
                m.injPartName + '</option>';
        }).join('');
        return (parts.length > 1 && !prefer ? '<option value="">-- 사출명 선택 --</option>' : '') + optsHtml;
    }

    function _getMatchedInjectionColors(carModel, partName, planColor) {
        if (!partName) return [];
        var materials = Storage.getAll(INJECTMAT_STORE) || [];
        var seen = {};
        var colors = [];
        materials.forEach(function(m) {
            if (!m) return;
            var nameMatch = m.mfgProductName === partName || m.mfgProductName2 === partName;
            var modelMatch = !carModel || !m.carModel || m.carModel === carModel;
            var colorMatch = _injColorMatches(m.injColor, planColor || '');
            if (!nameMatch || !modelMatch || !colorMatch || !m.injColor) return;
            String(m.injColor || '')
                .split(/[,，、\/|]/)
                .map(function(c) { return c.trim(); })
                .filter(Boolean)
                .forEach(function(color) {
                    var key = color.toLowerCase();
                    if (seen[key]) return;
                    seen[key] = true;
                    colors.push(color);
                });
        });
        return colors;
    }

    function _isPlatingInjectionColor(carModel, partName, planColor) {
        var colors = _getMatchedInjectionColors(carModel, partName, planColor);
        if (!colors.length && planColor) colors = [String(planColor)];
        return colors.some(function(color) {
            return /(crom|chrom|chrome|도금)/i.test(String(color || '').trim());
        });
    }

    // injPartName으로 현장 투입(도장 투입 자재) LOT 조회 — 레이져→B는 재공품 경로 유지
    // planColor: 사출 소재 컬러와 일치하는 LOT 우선 — 불일치 시 전체 반환 (폴백)
    // planDate 지정 시: "당일 계획 자재는 당일 사출 입고" 원칙에 따라 그 날 현장입고된
    // LOT만 남긴다. 예전 배치가 계산 오류 등으로 잔량이 남아 있어도, 오늘 계획과 무관한 옛
    // LOT이 조용히 섞여 들어가는 사고를 막는 게 우선이다 — 원인(왜 옛 LOT 잔량이 0이 아닌지)은
    // 별도로 조사해야 하지만, 그 전까지 화면에서 후보로 안 뜨게 막아야 오사용을 방지한다.
    function getInjectionLotsByInjPart(injPartName, planColor, carModel, planDate) {
        var lots;
        if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getLotsByInjPart) {
            lots = PaintingInputModule.getLotsByInjPart(_currentLine, injPartName, planColor, carModel);
        } else {
            // 폴백(구버전): 사출 창고 직접 조회
            var all = Storage.getAll(INJ_INV_STORE) || [];
            var lotMap = {};
            all.forEach(function(item) {
                if (!item.lotNo) return;
                if (injPartName && item.partName !== injPartName) return;
                if (carModel && item.carModel !== carModel) return;
                var key = item.lotNo;
                if (!lotMap[key]) {
                    lotMap[key] = {
                        lotNo:     item.lotNo,
                        partName:  item.partName  || '',
                        carModel:  item.carModel  || '',
                        color:     item.color     || '',
                        balance:   0
                    };
                }
                if (item.type === '출고') lotMap[key].balance -= Number(item.quantity) || 0;
                else                      lotMap[key].balance += Number(item.quantity) || 0;
            });
            var allLots = Object.values(lotMap).filter(function(l) {
                return l.balance > 0;
            }).sort(function(a, b) {
                return a.lotNo.localeCompare(b.lotNo);
            });
            lots = allLots;
            if (planColor) {
                var filtered = allLots.filter(function(l) {
                    if (!l.color) return true;
                    return _injColorMatches(l.color, planColor);
                });
                if (filtered.length > 0) lots = filtered;
            }
        }
        if (planDate) {
            lots = _filterLotsToPlanDay(lots, planDate, carModel, injPartName);
        }
        return lots || [];
    }

    /** 차종+제작품명에 연결된 사출명의 LOT만. 사출명 미선택 때 차종 전체(1SPOT 혼입)를 쓰지 않는다. */
    function _lotsForPlanPart(carModel, planPartName, planColor, planDate) {
        var cm = String(carModel || '').trim();
        var pn = String(planPartName || '').trim();
        if (!cm || !pn) return [];
        var inj = '';
        try { inj = _resolveInjPartNameForWork(cm, pn, planColor) || ''; } catch (e) { inj = ''; }
        if (inj && _injNameAllowed(inj, cm, pn) && _normPartKey(inj) !== _normPartKey(pn)) {
            return getInjectionLotsByInjPart(inj, planColor, cm, planDate) || [];
        }
        var allowed = _allowedInjPartsForWork(cm, pn);
        var names = Object.keys(allowed).filter(function (n) {
            return n && _normPartKey(n) !== _normPartKey(pn);
        });
        if (!names.length) names = Object.keys(allowed).filter(Boolean);
        var seen = {};
        var out = [];
        names.forEach(function (n) {
            (getInjectionLotsByInjPart(n, planColor, cm, planDate) || []).forEach(function (l) {
                var k = String(l.lotNo || '') + '|' + String(l.partName || n);
                if (!l.lotNo || seen[k]) return;
                seen[k] = true;
                out.push(l);
            });
        });
        return out;
    }

    function _lotOptionsHtmlFromList(lots, injPartName, planDate) {
        lots = lots || [];
        if (!lots.length) {
            return planDate
                ? '<option value="" data-balance="">-- 오늘(' + String(planDate).slice(0, 10) + ') 입고된 LOT 없음 --</option>'
                : '<option value="" data-balance="">-- 해당 LOT 없음 --</option>';
        }
        return '<option value="" data-balance="">-- LOT 선택 --</option>' + lots.map(function (l) {
            return '<option value="' + l.lotNo + '"' +
                ' data-balance="' + l.balance + '"' +
                ' data-part-name="' + String(l.partName || '').replace(/"/g, '&quot;') + '"' +
                ' data-color="' + String(l.color || '').replace(/"/g, '&quot;') + '">' +
                _lotOptionLabel(l, injPartName || l.partName) + '</option>';
        }).join('');
    }

    // injPartName 기반 LOT <option> HTML 빌드 (컬러 필터 + 컬러 표시)
    function buildLotOptionsHtmlByInjPart(injPartName, planColor, carModel, planDate) {
        var lots = getInjectionLotsByInjPart(injPartName, planColor, carModel, planDate);
        if (lots.length === 0) {
            return planDate
                ? '<option value="" data-balance="">-- 오늘(' + String(planDate).slice(0, 10) + ') 입고된 LOT 없음 --</option>'
                : '<option value="" data-balance="">-- 해당 LOT 없음 --</option>';
        }
        return lots.map(function(l, i) {
            return '<option value="' + l.lotNo + '"' + (i === 0 ? ' selected' : '') +
                ' data-balance="' + l.balance + '"' +
                ' data-part-name="' + String(l.partName || '').replace(/"/g, '&quot;') + '"' +
                ' data-color="' + String(l.color || '').replace(/"/g, '&quot;') + '">' +
                _lotOptionLabel(l, injPartName) + '</option>';
        }).join('');
    }

    // 사출명 드롭다운 변경 → 모든 LOT 행 드롭다운 갱신 + LOT 추가 버튼 활성화 제어
    function onInjPartSelect(sel) {
        var injPartName = sel ? sel.value : '';
        var planColor   = (document.getElementById('addPwColorHidden') || {}).value || '';
        var cmForLot = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var dateForLot = (document.getElementById('addPwDateHidden') || {}).value || '';
        var lotsHtml;
        var lotCount;
        if (injPartName) {
            var lots = getInjectionLotsByInjPart(injPartName, planColor, cmForLot, dateForLot);
            lotCount = lots.length;
            lotsHtml = lotCount === 0 ?
                (dateForLot
                    ? '<option value="" data-balance="">-- 오늘(' + dateForLot.slice(0, 10) + ') 입고된 LOT 없음 --</option>'
                    : '<option value="" data-balance="">-- 해당 LOT 없음 --</option>') :
                '<option value="" data-balance="">-- LOT 선택 --</option>' + lots.map(function(l) {
                    return '<option value="' + l.lotNo + '"' +
                        ' data-balance="' + l.balance + '"' +
                        ' data-part-name="' + String(l.partName || '').replace(/"/g, '&quot;') + '"' +
                        ' data-color="' + String(l.color || '').replace(/"/g, '&quot;') + '">' +
                        _lotOptionLabel(l, injPartName) + '</option>';
                }).join('');
        } else {
            var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
            var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
            var planLots = _lotsForPlanPart(cm, pn, planColor, dateForLot);
            lotCount = planLots.length;
            lotsHtml = _lotOptionsHtmlFromList(planLots, '', dateForLot);
        }
        document.querySelectorAll('#pwLotRows .pw-lot-sel').forEach(function(s) {
            s.innerHTML = lotsHtml;
            // 선입선출: 첫 유효 LOT 자동 선택 + 텍스트 동기화
            if (!s.value) {
                for (var oi = 0; oi < s.options.length; oi++) {
                    if (s.options[oi].value) { s.selectedIndex = oi; break; }
                }
            }
            if (s.value) {
                var row = s.closest('.pw-lot-row');
                if (row) {
                    var inp = row.querySelector('.pw-lot-no');
                    if (inp) inp.value = s.value;
                    _updateLotQtyMax(row, s.value);
                }
            }
        });
        // LOT 추가 버튼 활성화 여부 갱신
        var btn = document.getElementById('pwAddLotBtn');
        if (btn) {
            btn.disabled = lotCount <= 1;
            btn.title = lotCount <= 1 ? '현장 투입 LOT가 1개 이하여서 추가할 수 없습니다' : '';
        }
        _refreshUnmatchedInboundWarn();
        // 투입수량이 있으면 FIFO로 LOT 행 재배분
        setTimeout(function () { _execAutoFill(); }, 50);
    }

    // ──────────────────────────────────────────────
    // LOT 다중 행 헬퍼
    // ──────────────────────────────────────────────

    // 현재 선택된 LOT 번호 목록 (excludeRow 제외)
    function _getSelectedLotNos(excludeRow) {
        var selected = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (excludeRow && row === excludeRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (sel && sel.value) selected.push(sel.value);
        });
        return selected;
    }

    // 선택 제외 목록을 반영한 LOT 옵션 HTML 생성 (데이터-balance 포함, 컬러 필터)
    // ★ 사출명 지정 시: 해당 사출명 LOT만 표시 (다른 부품 LOT 혼입 방지)
    // ★ 사출명 미지정 시: carModel 전체 창고 재고 표시
    // ★ 레이져→도장-B 제품: 재공품 LOT 표시
    function _buildFilteredLotOptions(injPartName, carModel, partName, excludeLotNos) {
        var planColor = (document.getElementById('addPwColorHidden') || {}).value || '';
        var planDate = (document.getElementById('addPwDateHidden') || {}).value || '';

        // 레이져→도장-B 제품: 사출 창고 대신 재공품 LOT 사용
        var isLaserWip = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        if (isLaserWip) {
            var wipLots = getLaserWipLots(carModel, partName, { color: planColor });
            if (!_reworkUseOn()) {
                wipLots = wipLots.filter(function (l) { return l.lotSource !== 'site_rework'; });
            }
            var wipFiltered = excludeLotNos && excludeLotNos.length > 0
                ? wipLots.filter(function(l) {
                    var key = _lotOptionKey(l);
                    // 재공(wip:…)과 재사용(rework:…)은 같은 사출 LOT이어도 다른 행이다.
                    return excludeLotNos.indexOf(key) < 0;
                })
                : wipLots;
            if (wipFiltered.length === 0) return '<option value="" data-balance="">-- 재공품·현장 재사용 자재 LOT 없음 --</option>';
            var laserHtml = '<option value="" data-balance="">-- LOT 선택 --</option>';
            var wipOnly = wipFiltered.filter(function (l) { return l.lotSource !== 'site_rework'; });
            var reworkOnly = wipFiltered.filter(function (l) { return l.lotSource === 'site_rework'; });
            if (wipOnly.length) {
                laserHtml += '<optgroup label="▶ 레이져 후 재공품 LOT (선입선출)">';
                laserHtml += wipOnly.map(function (l) { return _laserWipLotOptionHtml(l, false); }).join('');
                laserHtml += '</optgroup>';
            }
            if (reworkOnly.length) {
                laserHtml += '<optgroup label="▶ 현장입고 재사용 자재 (레이져 생략)">';
                laserHtml += reworkOnly.map(function (l) { return _laserWipLotOptionHtml(l, false); }).join('');
                laserHtml += '</optgroup>';
            }
            return laserHtml;
        }

        var primaryLots, otherLots;

        if (injPartName) {
            // 사출명 지정: 해당 사출명 LOT만 표시, 다른 사출명(1SPOT↔3SPOT 등) 혼입 없음
            // planDate가 있으면 그날 현장입고분만 (옛 잔여 LOT 자동선택 방지)
            primaryLots = getInjectionLotsByInjPart(injPartName, planColor, carModel, planDate);
            otherLots   = []; // 물리적으로 다른 부품이므로 표시 안 함
        } else {
            // 사출명 미지정: 차종 기준이되, 계획일이 있으면 당일 현장입고분만
            // (예전엔 날짜 필터 없이 전체 잔량을 뿌려 옛 LOT이 FIFO로 잡혔다)
            primaryLots = [];
            otherLots = _lotsForPlanPart(carModel || '', partName || '', planColor, planDate);
        }

        // excludeLotNos 제거
        function applyExclude(arr) {
            if (!excludeLotNos || excludeLotNos.length === 0) return arr;
            return arr.filter(function(l) { return excludeLotNos.indexOf(l.lotNo) < 0; });
        }
        var filteredPrimary = applyExclude(primaryLots);
        var filteredOther   = applyExclude(otherLots);

        if (filteredPrimary.length === 0 && filteredOther.length === 0)
            return planDate
                ? '<option value="">-- 오늘(' + String(planDate).slice(0, 10) + ') 현장입고 LOT 없음 --</option>'
                : '<option value="">-- 현장 입고 재고 없음 --</option>';

        function lotOptionHtml(l) {
            return '<option value="' + l.lotNo + '"' +
                ' data-balance="' + l.balance + '"' +
                ' data-part-name="' + String(l.partName || '').replace(/"/g, '&quot;') + '"' +
                ' data-color="' + String(l.color || '').replace(/"/g, '&quot;') + '">' +
                _lotOptionLabel(l, injPartName) + '</option>';
        }

        var html = '<option value="" data-balance="">-- LOT 선택 --</option>';

        if (filteredPrimary.length > 0) {
            html += '<optgroup label="▶ 사출명 일치 LOT">';
            html += filteredPrimary.map(lotOptionHtml).join('');
            html += '</optgroup>';
        }
        if (filteredOther.length > 0) {
            html += '<optgroup label="▶ 당일 현장입고 LOT">';
            html += filteredOther.map(lotOptionHtml).join('');
            html += '</optgroup>';
        }
        return html;
    }

    // 선택된 LOT의 재고 잔량을 qty 입력의 max로 설정
    function _updateLotQtyMax(row, lotNo) {
        if (!row) return;
        var qtyInp = row.querySelector('.pw-lot-qty');
        if (!qtyInp) return;
        if (!lotNo) { qtyInp.removeAttribute('max'); return; }
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
        var planDate = (document.getElementById('addPwDateHidden') || {}).value || '';
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var planColor = (document.getElementById('addPwColorHidden') || {}).value || '';
        var isLaserWip = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        var allLots;
        if (isLaserWip) {
            allLots = getLaserWipLots(cm, pn);
        } else if (injPartName) {
            allLots = getInjectionLotsByInjPart(injPartName, planColor, cm, planDate);
        } else {
            allLots = _lotsForPlanPart(cm, pn, planColor, planDate);
        }
        var lot = allLots.find(function(l) { return (_lotOptionKey(l) === lotNo) || l.lotNo === lotNo; });
        // 당일 필터로 못 찾으면(수정 화면의 기존 LOT 등) 잔량만 전체에서 조회
        if (!lot && !isLaserWip) {
            allLots = injPartName
                ? getInjectionLotsByInjPart(injPartName, planColor, cm)
                : _lotsForPlanPart(cm, pn);
            lot = allLots.find(function(l) { return l.lotNo === lotNo; });
        }
        if (lot) {
            qtyInp.max = lot.balance;
            qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(lot.balance);
        }
    }

    // 다른 LOT 행 드롭다운 갱신 (currentRow 제외)
    function _refreshOtherLotDropdowns(currentRow) {
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            if (row === currentRow) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (!sel) return;
            var curVal = sel.value;
            var excludeLots = _getSelectedLotNos(row);
            sel.innerHTML = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
            if (curVal && sel.querySelector('option[value="' + curVal + '"]'))
                sel.value = curVal;
        });
    }

    // LOT 수량 재고 초과 방지 — 입력 즉시 차단
    function _validateLotQty(input) {
        var max = parseInt(input.max);
        if (isNaN(max) || max < 0) {
            _updateLotSummary();
            return;
        }
        var val = Number(input.value);
        if (val > max) {
            input.value = max;
            // 입력 커서가 끝으로 가게 강제
            input.dispatchEvent(new Event('input', { bubbles: false }));
            // 인라인 경고 표시 (토스트 대신 필드 옆에 표시)
            var row = input.closest('.pw-lot-row');
            if (row) {
                var warn = row.querySelector('.pw-qty-warn');
                if (!warn) {
                    warn = document.createElement('div');
                    warn.className = 'pw-qty-warn';
                    warn.style.cssText = 'font-size:0.72rem;color:#dc2626;margin-top:2px;';
                    input.parentNode.appendChild(warn);
                }
                warn.textContent = '최대 ' + UIUtils.formatNumber(max) + ' EA (재고 초과)';
                clearTimeout(input._warnTimer);
                input._warnTimer = setTimeout(function() { warn.textContent = ''; }, 2500);
            }
        }
        _updateLotSummary();
    }

    // "선택된 사출 정보" 요약 패널 — 각 LOT 행에 이미 사출명/LOT/수량이 다 보이고, 여기선
    // 차종·컬러를 채울 방법이 없어 "- | - | LOT | 수량"처럼 빈 정보만 중복 표시되던 문제로
    // 폐지했다. 대신 각 LOT 행 자체에 선택됨/일부 반영 상태를 바로 표시한다(_updateLotSummary).
    function _renderSelectedInjectionMeta() {
        var infoEl = document.getElementById('pwSelectedInjectionMeta');
        if (infoEl) { infoEl.style.display = 'none'; infoEl.innerHTML = ''; }
    }

    // ── 실시간 LOT 합계 vs 투입수량 표시 (+ 현장 부족 시 물류 통보) ──
    var _pendingLogisticsShortageQty = 0;

    function _getLogisticsNotifyUsers() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        return (AuthModule.getUsers() || []).filter(function (u) {
            if (!u || u.active === false) return false;
            var roles = [];
            if (Array.isArray(u.roles)) roles = roles.concat(u.roles);
            if (u.role) roles.push(u.role);
            return roles.some(function (r) {
                var k = String(r || '');
                return k === 'logistics_worker' || k.indexOf('물류') >= 0;
            });
        });
    }

    function _logisticsUserNamesText() {
        var names = _getLogisticsNotifyUsers().map(function (u) {
            return String(u.displayName || u.username || u.id || '').trim();
        }).filter(Boolean);
        return names.length ? names.join(', ') : '물류작업자';
    }

    function _buildLogisticsSupplyMessage(shortageQty) {
        var line = ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value
            || (typeof _currentLine !== 'undefined' ? _currentLine : '') || '도장').trim();
        var car = ((document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '').trim();
        var part = ((document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '').trim();
        var color = ((document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '').trim();
        var date = ((document.getElementById('addPwDateHidden') || {}).value || (typeof _currentDate !== 'undefined' ? _currentDate : '') || '').trim();
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var inputQty = inputQtyEl ? (Number(inputQtyEl.value) || 0) : 0;
        var lots = _collectLots();
        var lotTotal = lots.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
        var actor = '';
        try {
            var cu = AuthModule.getCurrentUser && AuthModule.getCurrentUser();
            actor = cu ? String(cu.displayName || cu.username || '') : '';
        } catch (e) { /* ignore */ }

        return {
            title: '[' + line + '] 현장 자재 공급 요청 — ' + (part || car || '자재'),
            body: [
                '도장 현장 LOT(입고) 수량이 투입수량보다 부족합니다.',
                '현장 입고 등록이 안 되었거나 자재 공급이 필요합니다.',
                '',
                '라인: ' + (line || '-'),
                '작업일: ' + (date || '-'),
                '차종: ' + (car || '-'),
                '품명: ' + (part || '-'),
                '컬러: ' + (color || '-'),
                '투입수량: ' + UIUtils.formatNumber(inputQty) + ' EA',
                '현장 LOT 합계: ' + UIUtils.formatNumber(lotTotal) + ' EA',
                '공급 요청 수량: ' + UIUtils.formatNumber(shortageQty) + ' EA',
                actor ? ('요청자: ' + actor) : '',
                '',
                '해당 수량을 현장으로 출고·공급해 주세요.'
            ].filter(Boolean).join('\n')
        };
    }

    function promptLogisticsSupplyNotify(shortageQty) {
        var qty = Number(shortageQty) || 0;
        if (qty <= 0) {
            // 배너 버튼에서 호출 시 현재 차이 재계산
            var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
            var inputQty = inputQtyEl ? (Number(inputQtyEl.value) || 0) : 0;
            var lotTotal = _collectLots().reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
            qty = Math.max(0, inputQty - lotTotal);
        }
        if (qty <= 0) {
            UIUtils.toast('공급 요청할 부족 수량이 없습니다.', 'info');
            return;
        }
        _pendingLogisticsShortageQty = qty;
        var nameText = _logisticsUserNamesText();
        var qtyFmt = UIUtils.formatNumber(qty);
        var guide = '물류 담당자 사용자 <strong>' + nameText + '</strong> 에게 '
            + '<strong style="color:#dc2626;">' + qtyFmt + '개</strong>를 현장으로 공급 요청을 하세요.';
        var body =
            '<div style="padding:4px 2px;font-size:0.9rem;line-height:1.55;color:var(--text-primary);">' +
            '<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);">' +
            guide +
            '</div>' +
            '<p style="margin:0;font-weight:700;">통보 하시겠습니까?</p>' +
            '<p style="margin:8px 0 0;font-size:0.8rem;color:var(--text-muted);">확인 시 물류작업자 역할 담당자에게 쪽지가 발송됩니다.</p>' +
            '</div>';

        if (typeof UIUtils.showChildModal === 'function') {
            UIUtils.showChildModal(
                '현장 자재 공급 요청',
                body,
                '<button type="button" class="btn btn-secondary" onclick="UIUtils.closeChildModal()">취소</button>' +
                '<button type="button" class="btn btn-primary" onclick="PaintingWorkModule.confirmLogisticsSupplyNotify()">' +
                '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">send</span> 통보</button>',
                'md'
            );
        } else {
            UIUtils.confirm(
                '물류 담당자 사용자 ' + nameText + ' 에게 ' + qtyFmt + '개를 현장으로 공급 요청을 하세요.\n\n통보 하시겠습니까?',
                function () { confirmLogisticsSupplyNotify(); }
            );
        }
    }

    function confirmLogisticsSupplyNotify() {
        var qty = Number(_pendingLogisticsShortageQty) || 0;
        if (qty <= 0) {
            if (typeof UIUtils.closeChildModal === 'function') UIUtils.closeChildModal();
            return;
        }
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') {
            UIUtils.toast('쪽지 기능을 사용할 수 없습니다.', 'error');
            return;
        }
        var msg = _buildLogisticsSupplyMessage(qty);
        var users = _getLogisticsNotifyUsers();
        var ok = false;
        try {
            if (users.length) {
                ok = AuthModule.sendInternalMessage({
                    targetType: 'user',
                    targetIds: users.map(function (u) { return u.id; }),
                    title: msg.title,
                    body: msg.body,
                    category: 'painting-site-supply',
                    priority: 'high'
                });
            } else {
                ok = AuthModule.sendInternalMessage({
                    targetType: 'role',
                    targetIds: ['logistics_worker'],
                    title: msg.title,
                    body: msg.body,
                    category: 'painting-site-supply',
                    priority: 'high'
                });
            }
        } catch (e) {
            console.warn('[PaintingWork] 물류 공급 통보 실패:', e);
            ok = false;
        }
        if (typeof UIUtils.closeChildModal === 'function') UIUtils.closeChildModal();
        if (ok) {
            UIUtils.toast('물류 담당자에게 현장 공급 요청 쪽지를 보냈습니다.', 'success');
            var btn = document.getElementById('pwLogisticsNotifyBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '통보 완료';
            }
        } else {
            UIUtils.toast('쪽지 발송에 실패했습니다. 로그인·물류 담당자 계정을 확인하세요.', 'error');
        }
    }

    function openPastInboundPicker() {
        var line = ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value || '').trim()
            || (typeof _currentLine !== 'undefined' ? _currentLine : '') || '도장-A';
        var date = ((document.getElementById('addPwDateHidden') || {}).value || '').slice(0, 10);
        var car = ((document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '').trim();
        var part = ((document.getElementById('pwInjPartSelect') || {}).value || '').trim()
            || ((document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '').trim();
        var color = ((document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '').trim();
        openMaterialHistory(line, {
            pickMode: true,
            date: date,
            carModel: car,
            partName: part,
            color: color
        });
    }

    function openMaterialHistory(line, opts) {
        opts = opts || {};
        const want = line || _currentLine || '도장-A';
        const pickMode = !!opts.pickMode;
        const prefCar = String(opts.carModel || '').trim();
        const prefPart = String(opts.partName || '').trim();
        const prefColor = String(opts.color || '').trim();
        const prefDate = String(opts.date || '').slice(0, 10);
        const STORE_INV = DB.STORES.PAINTING_INPUT_INVENTORY;
        const today = UIUtils.today();
        const isAdmin = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
        // 선택 모드: 실적일부터 오늘까지(입고가 하루 늦는 경우 포함). 조회 모드는 최근 30일.
        const defaultStart = prefDate || ((typeof UIUtils.daysAgo === 'function') ? UIUtils.daysAgo(30) : (function () {
            const d = new Date(today + 'T00:00:00');
            d.setDate(d.getDate() - 30);
            return d.toISOString().slice(0, 10);
        })());
        const defaultEnd = today;

        // PaintingWorkModule 스코프에는 공통 _esc/_fmt가 없음 — 로컬 정의 필수
        function _esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function _fmt(n) {
            if (typeof UIUtils !== 'undefined' && UIUtils.formatNumber) return UIUtils.formatNumber(n || 0);
            return Number(n || 0).toLocaleString('ko-KR');
        }

        function _normLineLocal(v) {
            return String(v || '').replace(/\s/g, '');
        }
        // shipDate = 실제 창고 출고(=실질 입고) 일시. 확인 처리를 늦게(자동 캐치업 등) 하면
        // date/useDate는 확인 처리 시각으로 뭉쳐 보이므로, "실제 입고일" 표시는 shipDate를 우선한다.
        // shipDate가 없는 과거 기록은 refOutId로 원본 창고 출고 기록을 찾아 그 일시로 대체한다.
        function _resolveShipStamp(r) {
            if (r.shipDate) return String(r.shipDate);
            const outId = r.refOutId || '';
            if (outId && typeof Storage !== 'undefined' && Storage.getById) {
                try {
                    const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
                    if (out && out.date) return String(out.date);
                } catch (e) { /* 무시 */ }
            }
            return String(r.useDate || r.date || '');
        }
        function _dayOf(r) {
            return _resolveShipStamp(r).slice(0, 10);
        }
        function _timeOf(r) {
            const t = _resolveShipStamp(r);
            return t.length > 11 ? t.slice(11, 16) : '-';
        }
        function _lotsLabel(r) {
            if (Array.isArray(r.lots) && r.lots.length) {
                return r.lots.map(function (l) { return l.lotNo || ''; }).filter(Boolean).join(', ') || '-';
            }
            return r.lotNo || '-';
        }
        function _primaryLot(r) {
            if (Array.isArray(r.lots) && r.lots[0] && r.lots[0].lotNo) return String(r.lots[0].lotNo).trim();
            return String(r.lotNo || '').trim();
        }
        function _partHit(recPart, wantPart) {
            var a = String(recPart || '').trim();
            var b = String(wantPart || '').trim();
            if (!b) return true;
            if (!a) return false;
            if (a === b) return true;
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.partNamesMatch) {
                try { if (PaintingInputModule.partNamesMatch(a, b, prefCar)) return true; } catch (e0) { /* ignore */ }
            }
            try { return typeof _partsLooselyRelated === 'function' && _partsLooselyRelated(a, b); }
            catch (e) { return a.toLowerCase() === b.toLowerCase(); }
        }
        function _displayHistPart(r) {
            var raw = String((r && r.partName) || '').trim();
            if (typeof ReworkWipModule !== 'undefined' && ReworkWipModule.toInjPartName) {
                try {
                    var inj = ReworkWipModule.toInjPartName(r && r.carModel, raw);
                    if (inj) return inj;
                } catch (e) { /* ignore */ }
            }
            var resolved = _resolveInjPartNameForWork(r && r.carModel, raw, r && r.color);
            return resolved || raw || '-';
        }
        function _colorHit(recColor, wantColor) {
            if (!wantColor) return true;
            var rec = String(recColor || '').trim();
            if (!rec) return false;
            if (typeof PaintingInputModule !== 'undefined' && typeof PaintingInputModule.colorLooseMatch === 'function') {
                try { return !!PaintingInputModule.colorLooseMatch(rec, wantColor); } catch (e) { /* ignore */ }
            }
            return rec.toLowerCase().replace(/\s+/g, '') === String(wantColor).toLowerCase().replace(/\s+/g, '');
        }
        function _lotUsage(r) {
            var lotNo = _primaryLot(r);
            var inboundQty = Number(r.quantity) || 0;
            var received = inboundQty;
            var consumed = 0;
            var balance = inboundQty;
            if (lotNo && typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getExactLotLedger) {
                // 이 행의 입고일(day)부터만 집계 — 같은 LOT번호가 이전에 다른(이미 끝난) 배치로
                // 쓰였다면, 그 옛 사용/반납량까지 오늘 이 배치의 사용량인 것처럼 섞여 보이는
                // 문제가 있었다(예: 오늘 입고 2,000 옆에 몇 주 전 배치의 사용 9,354가 붙어 표시).
                var led = PaintingInputModule.getExactLotLedger(want, r.carModel, r.partName, lotNo, _dayOf(r)) || {};
                received = Number(led.received) || inboundQty;
                consumed = Number(led.consumed) || 0;
                balance = Number(led.balance);
                if (!Number.isFinite(balance)) balance = Math.max(0, received - consumed);
            }
            var workHits = [];
            if (lotNo && typeof DB !== 'undefined' && DB.STORES && DB.STORES.PAINTING_WORK) {
                (Storage.getAll(DB.STORES.PAINTING_WORK) || []).forEach(function (w) {
                    if (!w) return;
                    if (r.carModel && w.carModel && String(w.carModel) !== String(r.carModel)) return;
                    var used = 0;
                    (Array.isArray(w.lots) ? w.lots : []).forEach(function (l) {
                        if (String((l && l.lotNo) || '').trim() === lotNo) used += Number(l && l.qty) || 0;
                    });
                    if (used > 0) {
                        workHits.push(String(w.date || '').slice(0, 10) + ' ' + UIUtils.formatNumber(used) + 'EA');
                    }
                });
            }
            var status = 'unused';
            if (consumed > 0.001 && balance > 0.001) status = 'partial';
            else if (balance <= 0.001 || consumed >= received - 0.001) status = 'used';
            return {
                lotNo: lotNo,
                inboundQty: inboundQty,
                received: received,
                consumed: consumed,
                balance: Math.max(0, balance),
                status: status,
                workHits: workHits
            };
        }
        function _statusBadge(u) {
            if (u.status === 'unused') {
                return '<span style="color:#16a34a;font-weight:700;white-space:nowrap;">미사용</span>';
            }
            if (u.status === 'partial') {
                return '<span style="color:#d97706;font-weight:700;white-space:nowrap;" title="' + _esc(u.workHits.join(', ')) + '">일부사용</span>';
            }
            return '<span style="color:var(--text-muted);font-weight:700;white-space:nowrap;" title="' + _esc(u.workHits.join(', ')) + '">전량사용</span>';
        }

        function _loadRows(start, end) {
            const s = String(start || '').slice(0, 10);
            const e = String(end || today).slice(0, 10);
            return (Storage.getAll(STORE_INV) || []).filter(function (r) {
                if (_normLineLocal(r.line || r.paintLine) !== _normLineLocal(want)) return false;
                if (String(r.type || '') !== '입고') return false;
                const d = _dayOf(r);
                if (!d) return false;
                if (s && d < s) return false;
                if (e && d > e) return false;
                return true;
            }).sort(function (a, b) {
                return _dayOf(b).localeCompare(_dayOf(a))
                    || String(b.receivedAt || b.date || '').localeCompare(String(a.receivedAt || a.date || ''));
            });
        }

        // 현장에서 사출창고로 되돌린 반납 이력 — 입고와 같은 목록에서 "구분" 열로 구별해 보여준다.
        function _loadReturnRows(start, end) {
            const s = String(start || '').slice(0, 10);
            const e = String(end || today).slice(0, 10);
            return (Storage.getAll(STORE_INV) || []).filter(function (r) {
                if (!r || !r.isSiteReturn) return false;
                if (_normLineLocal(r.line || r.paintLine) !== _normLineLocal(want)) return false;
                const d = _dayOf(r);
                if (!d) return false;
                if (s && d < s) return false;
                if (e && d > e) return false;
                return true;
            }).sort(function (a, b) {
                return _dayOf(b).localeCompare(_dayOf(a))
                    || String(b.date || '').localeCompare(String(a.date || ''));
            });
        }
        function _returnStatusBadge(r) {
            var reason = String(r.returnReason || '').trim();
            if (r.returnStatus === 'confirmed') {
                return '<span style="color:#16a34a;font-weight:700;white-space:nowrap;" title="' + _esc(reason) + '">반납확정</span>';
            }
            return '<span style="color:#d97706;font-weight:700;white-space:nowrap;" title="' + _esc(reason) + '">반납대기</span>';
        }

        function _fillSelect(sel, values, preferred, emptyLabel) {
            if (!sel) return;
            var list = values.slice();
            if (preferred && list.indexOf(preferred) < 0) list.unshift(preferred);
            var cur;
            if (!sel.getAttribute('data-inited')) {
                cur = preferred || '';
                sel.setAttribute('data-inited', '1');
            } else {
                cur = sel.value;
            }
            var opts = '<option value="">' + _esc(emptyLabel) + '</option>';
            list.forEach(function (v) {
                opts += '<option value="' + _esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + _esc(v) + '</option>';
            });
            sel.innerHTML = opts;
            sel.value = cur;
        }

        function _render() {
            const startEl = document.getElementById('pwMatHistStart');
            const endEl = document.getElementById('pwMatHistEnd');
            const carEl = document.getElementById('pwMatHistCar');
            const partEl = document.getElementById('pwMatHistPart');
            const colorEl = document.getElementById('pwMatHistColor');
            const usedEl = document.getElementById('pwMatHistUsed');
            const start = startEl ? startEl.value : defaultStart;
            const end = endEl ? endEl.value : defaultEnd;
            const allRows = _loadRows(start, end);
            // 반납 이력은 선택(pickMode) 화면에서는 의미가 없다 — 실적에 넣을 잔량이 아니므로 조회 전용 화면에만 섞는다.
            const allReturnRows = pickMode ? [] : _loadReturnRows(start, end);
            const cars = [];
            const parts = [];
            const colors = [];
            allRows.concat(allReturnRows).forEach(function (r) {
                var c = String(r.carModel || '').trim();
                var p = String(r.partName || '').trim();
                var col = String(r.color || '').trim();
                if (c && cars.indexOf(c) < 0) cars.push(c);
                if (p && parts.indexOf(p) < 0) parts.push(p);
                if (col && colors.indexOf(col) < 0) colors.push(col);
            });
            cars.sort();
            parts.sort();
            colors.sort();
            _fillSelect(carEl, cars, prefCar, '차종 전체');
            _fillSelect(partEl, parts, prefPart, '품명 전체');
            _fillSelect(colorEl, colors, prefColor, '컬러 전체');
            if (pickMode && prefCar && carEl) carEl.disabled = true;
            if (pickMode && prefPart && partEl) partEl.disabled = true;
            if (pickMode && prefColor && colorEl) colorEl.disabled = true;
            const wantCar = carEl ? carEl.value : prefCar;
            const wantPart = partEl ? partEl.value : prefPart;
            const wantColor = colorEl ? colorEl.value : prefColor;
            const usedFilter = usedEl ? usedEl.value : '';
            const filterFn = function (r) {
                if (wantCar && String(r.carModel || '').trim() !== wantCar) return false;
                if (wantPart && !_partHit(r.partName, wantPart)) return false;
                if (wantColor && !_colorHit(r.color, wantColor)) return false;
                return true;
            };
            const rows = allRows.filter(filterFn);
            const returnRows = allReturnRows.filter(filterFn);
            const tbody = document.getElementById('pwMatHistBody');
            const countEl = document.getElementById('pwMatHistCount');
            const needCarPart = pickMode && (!wantCar || !wantPart);
            // 실적 폼은 이 조회 모달이 덮어써서 #pwLotRows가 잠시 없다.
            // 선택 열을 그 존재에 묶으면 헤더만 남고 관리(수정) 버튼이 선택 칸으로 밀린다.
            const canPick = pickMode && !needCarPart;
            const colCount = 11 + (pickMode ? 1 : 0) + (isAdmin ? 1 : 0);
            if (!tbody) return;
            const decorated = rows.map(function (r) {
                return { rec: r, kind: 'inbound', usage: _lotUsage(r) };
            }).filter(function (row) {
                if (usedFilter === 'unused') return row.usage.status === 'unused';
                if (usedFilter === 'partial') return row.usage.status === 'partial';
                if (usedFilter === 'used') return row.usage.status === 'used';
                return true;
            });
            // 반납 이력은 사용여부(미사용/일부사용/전량사용) 개념이 없으므로, 그 필터를 걸었을 때는 섞지 않는다.
            const decoratedReturns = usedFilter ? [] : returnRows.map(function (r) {
                return { rec: r, kind: 'return' };
            });
            const combined = decorated.concat(decoratedReturns).sort(function (a, b) {
                var da = _dayOf(a.rec) + ' ' + _timeOf(a.rec);
                var db = _dayOf(b.rec) + ' ' + _timeOf(b.rec);
                return db.localeCompare(da);
            });
            if (countEl) countEl.textContent = combined.length + '건';
            var pickAllEl = document.getElementById('pwMatHistPickAll');
            if (pickAllEl) pickAllEl.checked = false;
            if (needCarPart) {
                tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="text-align:center;padding:30px;color:var(--text-muted);">' +
                    '차종과 품명을 먼저 고른 뒤 조회하세요. 전체 입고를 한 번에 선택할 수 없습니다.</td></tr>';
                return;
            }
            if (!combined.length) {
                tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="text-align:center;padding:30px;color:var(--text-muted);">' +
                    '같은 입고일·차종·품명·컬러의 현장 입고/반납 이력이 없습니다. 입고일이 실적일과 다르면 날짜 범위를 넓혀 보세요.</td></tr>';
                return;
            }
            tbody.innerHTML = combined.map(function (row) {
                const r = row.rec;
                const pad = 'white-space:nowrap;padding:4px 6px;width:auto;';
                const tight = 'white-space:nowrap;padding:4px 5px;width:auto;';
                if (row.kind === 'return') {
                    return '<tr style="background:rgba(8,145,178,0.05);">' +
                        '<td style="' + pad + 'font-size:0.82rem;">' + _esc(_dayOf(r)) + '</td>' +
                        '<td style="' + pad + 'font-size:0.82rem;">' + _esc(_timeOf(r)) + '</td>' +
                        '<td style="' + pad + '"><span style="color:#0891b2;font-weight:700;white-space:nowrap;">↩ 반납</span></td>' +
                        '<td class="pw-hist-tight" style="' + tight + '"><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                        '<td class="pw-hist-tight" style="' + tight + '">' + _esc(_displayHistPart(r)) + '</td>' +
                        '<td class="pw-hist-tight" style="' + tight + '">' + _esc(r.color || '-') + '</td>' +
                        '<td class="pw-hist-tight" style="' + tight + 'font-family:monospace;font-size:0.8rem;">' + _esc(_lotsLabel(r)) + '</td>' +
                        '<td style="text-align:right;' + pad + 'color:var(--text-muted);">-</td>' +
                        '<td style="text-align:right;' + pad + 'font-weight:700;color:#0891b2;">' + _fmt(Number(r.quantity) || 0) + '</td>' +
                        '<td style="text-align:right;' + pad + 'color:var(--text-muted);">-</td>' +
                        '<td style="' + pad + '">' + _returnStatusBadge(r) +
                            (r.returnedBy ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;">' + _esc(r.returnedBy) + '</div>' : '') +
                        '</td>' +
                        (pickMode ? '<td style="' + pad + '"></td>' : '') +
                        (isAdmin ? (
                            '<td style="' + pad + 'text-align:center;">' +
                                '<button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;" ' +
                                    'onclick="PaintingWorkModule._matHistEdit(\'' + _esc(r.id) + '\')" title="반납 수량 수정">' +
                                    '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span>' +
                                '</button>' +
                            '</td>'
                        ) : '') +
                    '</tr>';
                }
                const u = row.usage;
                const pickable = canPick && u.balance > 0.001;
                const pickTd = canPick
                    ? ('<td style="' + pad + 'text-align:center;">' +
                        '<input type="checkbox" class="pw-mat-hist-pick" data-id="' + _esc(r.id) + '"' +
                        ' data-lot="' + _esc(u.lotNo || '') + '" data-qty="' + Math.floor(u.balance) + '"' +
                        (pickable ? '' : ' disabled') +
                        ' style="width:16px;height:16px;accent-color:#2563eb;vertical-align:middle;cursor:' +
                        (pickable ? 'pointer' : 'not-allowed') + ';"' +
                        (pickable ? ' title="실적에 넣을 LOT"' : ' title="잔량이 없어 선택할 수 없습니다"') + '>' +
                        (pickable ? '' : '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;">잔량없음</div>') +
                      '</td>')
                    : '';
                return '<tr>' +
                    '<td style="' + pad + 'font-size:0.82rem;">' + _esc(_dayOf(r)) + '</td>' +
                    '<td style="' + pad + 'font-size:0.82rem;">' + _esc(_timeOf(r)) + '</td>' +
                    '<td style="' + pad + 'color:var(--text-muted);">입고</td>' +
                    '<td class="pw-hist-tight" style="' + tight + '"><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                    '<td class="pw-hist-tight" style="' + tight + '">' + _esc(_displayHistPart(r)) + '</td>' +
                    '<td class="pw-hist-tight" style="' + tight + '">' + _esc(r.color || '-') + '</td>' +
                    '<td class="pw-hist-tight" style="' + tight + 'font-family:monospace;font-size:0.8rem;">' + _esc(_lotsLabel(r)) + '</td>' +
                    '<td style="text-align:right;' + pad + 'font-weight:700;">' + _fmt(u.inboundQty) + '</td>' +
                    '<td style="text-align:right;' + pad + '">' + _fmt(u.consumed) + '</td>' +
                    '<td style="text-align:right;' + pad + 'font-weight:700;color:' +
                        (u.balance > 0 ? '#16a34a' : 'var(--text-muted)') + ';">' + _fmt(u.balance) + '</td>' +
                    '<td style="' + pad + '">' + _statusBadge(u) +
                        (u.workHits.length ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;">' + _esc(u.workHits[0]) +
                            (u.workHits.length > 1 ? ' 외 ' + (u.workHits.length - 1) : '') + '</div>' : '') +
                    '</td>' +
                    pickTd +
                    (isAdmin ? (
                        '<td style="' + pad + 'text-align:center;">' +
                            '<button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;margin-right:4px;" ' +
                                'onclick="PaintingWorkModule._matHistEdit(\'' + _esc(r.id) + '\')" title="사용일·수량 수정">' +
                                '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span>' +
                            '</button>' +
                            '<button type="button" class="btn btn-sm btn-danger" style="padding:2px 8px;font-size:0.72rem;" ' +
                                'onclick="PaintingWorkModule._matHistDelete(\'' + _esc(r.id) + '\')" title="이 이력 삭제">' +
                                '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span>' +
                            '</button>' +
                        '</td>'
                    ) : '') +
                '</tr>';
            }).join('');
        }

        function _payloadFromId(id) {
            const rec = Storage.getById(STORE_INV, id);
            if (!rec) return { error: '입고 이력을 찾을 수 없습니다.', kind: 'error' };
            if (prefCar && String(rec.carModel || '').trim() !== prefCar) {
                return { error: '이 실적의 차종과 다른 입고입니다.', kind: 'warning' };
            }
            if (prefPart && !_partHit(rec.partName, prefPart)) {
                return { error: '이 실적의 품명과 다른 입고입니다.', kind: 'warning' };
            }
            if (prefColor && !_colorHit(rec.color, prefColor)) {
                return { error: '이 실적의 컬러와 다른 입고입니다.', kind: 'warning' };
            }
            const u = _lotUsage(rec);
            var qty = Math.floor(Math.min(u.inboundQty || u.balance, u.balance));
            if (!(qty > 0)) {
                return { error: '이 LOT은 이미 사용되어 잔량이 없습니다.', kind: 'warning' };
            }
            return { lotNo: u.lotNo, qty: qty };
        }

        function _putPicks(picks) {
            if (!document.getElementById('pwLotRows')) {
                UIUtils.toast('실적 입력 화면이 열려 있을 때만 LOT을 선택할 수 있습니다.', 'warning');
                return;
            }
            var flag = document.getElementById('pwUseReworkMaterial');
            if (flag) {
                flag.checked = true;
                toggleReworkUseBox(flag);
            }
            var added = 0;
            picks.forEach(function (p) {
                var before = document.querySelectorAll('#pwLotRows .pw-lot-row').length;
                addMissingLotRow({
                    dataset: {
                        lot: p.lotNo,
                        qty: String(p.qty),
                        forceRework: '1',
                        source: 'site_rework'
                    }
                });
                if (document.querySelectorAll('#pwLotRows .pw-lot-row').length > before) added++;
            });
            if (added > 0) {
                UIUtils.toast(added + '개 재사용 LOT을 도장 투입에 추가했습니다.', 'success');
                var rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
                var last = rows[rows.length - 1];
                if (last && last.scrollIntoView) {
                    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    last.style.outline = '2px solid #7c3aed';
                    setTimeout(function () { last.style.outline = ''; }, 1800);
                }
            }
        }

        function _applyAfterFormRestore(picks) {
            var hasForm = !!document.getElementById('pwLotRows');
            if (hasForm) {
                _putPicks(picks);
                if (typeof UIUtils.closeChildModal === 'function' && typeof UIUtils.isChildModalOpen === 'function'
                    && UIUtils.isChildModalOpen()) {
                    UIUtils.closeChildModal();
                }
                return;
            }
            UIUtils.closeModal();
            setTimeout(function () { _putPicks(picks); }, 0);
        }

        function _pick(id) {
            const p = _payloadFromId(id);
            if (p.error) {
                UIUtils.toast(p.error, p.kind || 'warning');
                return;
            }
            _applyAfterFormRestore([p]);
        }

        function _toggleAll(el) {
            document.querySelectorAll('#pwMatHistBody input.pw-mat-hist-pick:not([disabled])').forEach(function (cb) {
                cb.checked = !!(el && el.checked);
            });
        }

        function _applySelected() {
            const boxes = document.querySelectorAll('#pwMatHistBody input.pw-mat-hist-pick:checked:not([disabled])');
            if (!boxes.length) {
                UIUtils.toast('선택한 LOT이 없습니다. 잔량이 있는 행의 체크를 켜 주세요.', 'warning');
                return;
            }
            const picks = [];
            var firstErr = '';
            boxes.forEach(function (cb) {
                var lotNo = String(cb.getAttribute('data-lot') || '').trim();
                var qty = Math.floor(Number(cb.getAttribute('data-qty')) || 0);
                if (lotNo && qty > 0) {
                    picks.push({ lotNo: lotNo, qty: qty });
                    return;
                }
                const p = _payloadFromId(cb.getAttribute('data-id') || cb.value);
                if (p.error) {
                    if (!firstErr) firstErr = p.error;
                    return;
                }
                picks.push(p);
            });
            if (!picks.length) {
                UIUtils.toast(firstErr || '선택한 LOT을 넣을 수 없습니다.', 'warning');
                return;
            }
            _applyAfterFormRestore(picks);
        }

        function _delete(id) {
            const adminNow = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
            if (!adminNow) {
                UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning');
                return;
            }
            const rec = Storage.getById(STORE_INV, id);
            if (!rec) {
                UIUtils.toast('이력을 찾을 수 없습니다.', 'error');
                return;
            }
            const label = (rec.carModel || '-') + ' / ' + (rec.partName || '-') + ' / ' +
                _fmt(Number(rec.quantity) || 0) + ' EA (' + _dayOf(rec) + ' ' + _timeOf(rec) + ')';
            UIUtils.confirm(
                '다음 현장 입고 이력을 삭제하시겠습니까?\n\n' + label +
                '\n\n이 기록은 현장 자재 재고·LOT 잔량 계산에 쓰입니다. 삭제하면 관련 수량 계산이 달라질 수 있으며, 삭제 후 복구할 수 없습니다.',
                async function () {
                    try {
                        await Storage.remove(STORE_INV, id);
                        UIUtils.toast('이력이 삭제되었습니다.', 'success');
                        _render();
                    } catch (e) {
                        console.error('[PaintingWork] 입고 이력 삭제 실패:', e);
                        UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
                    }
                }
            );
        }

        function _edit(id) {
            const adminNow = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
            if (!adminNow) {
                UIUtils.toast('관리자만 입고 이력을 수정할 수 있습니다.', 'warning');
                return;
            }
            const rec = Storage.getById(STORE_INV, id);
            if (!rec) {
                UIUtils.toast('이력을 찾을 수 없습니다.', 'error');
                return;
            }
            if (rec.isSiteReturn) {
                const openFn = (typeof UIUtils.showChildModal === 'function') ? UIUtils.showChildModal : UIUtils.showModal;
                openFn(
                    '반납 수량 수정',
                    '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">' +
                        _esc(rec.carModel || '-') + ' / ' + _esc(rec.partName || '-') +
                        (rec.color ? ' / ' + _esc(rec.color) : '') +
                        ' · 현재 ' + _fmt(Number(rec.quantity) || 0) + ' EA' +
                    '</div>' +
                    '<input type="hidden" id="pwMatHistEditId" value="' + _esc(id) + '">' +
                    '<input type="hidden" id="pwMatHistEditKind" value="return">' +
                    '<div class="form-group"><label class="form-label">반납 수량 (EA) *</label>' +
                    '<input type="number" class="form-input" id="pwMatHistEditQty" min="1" value="' + (Number(rec.quantity) || 0) + '"></div>' +
                    (rec.returnStatus === 'confirmed'
                        ? '<div style="font-size:0.78rem;color:#b45309;margin-top:6px;">이미 사출창고 입고 처리된 반납입니다. 여기 수량을 고치면 현장 이력만 바뀌고, 창고 재고는 따로 맞춰야 합니다.</div>'
                        : '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">LOT별 수량은 합계 비율로 다시 맞춥니다.</div>'),
                    '<button class="btn btn-secondary" onclick="' +
                        (typeof UIUtils.closeChildModal === 'function' ? 'UIUtils.closeChildModal()' : 'UIUtils.closeModal()') +
                        '">취소</button>' +
                    '<button class="btn btn-primary" onclick="PaintingWorkModule._matHistSaveEdit()">저장</button>'
                );
                return;
            }
            const useDay = String(rec.useDate || rec.date || '').slice(0, 10);
            const lotNo = (Array.isArray(rec.lots) && rec.lots[0] && rec.lots[0].lotNo) ? rec.lots[0].lotNo : (rec.lotNo || '');
            const openFn = (typeof UIUtils.showChildModal === 'function') ? UIUtils.showChildModal : UIUtils.showModal;
            openFn(
                '현장 입고 수정',
                '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">' +
                    _esc(rec.carModel || '-') + ' / ' + _esc(rec.partName || '-') +
                    (rec.color ? ' / ' + _esc(rec.color) : '') +
                '</div>' +
                '<input type="hidden" id="pwMatHistEditId" value="' + _esc(id) + '">' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">사용일 *</label>' +
                    '<input type="date" class="form-input" id="pwMatHistEditDate" value="' + _esc(useDay) + '"></div>' +
                    '<div class="form-group"><label class="form-label">수량 (EA) *</label>' +
                    '<input type="number" class="form-input" id="pwMatHistEditQty" min="1" value="' + (Number(rec.quantity) || 0) + '"></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">사출LOT</label>' +
                '<input type="text" class="form-input" id="pwMatHistEditLot" value="' + _esc(lotNo) + '" style="font-family:monospace;"></div>' +
                '<div class="form-group"><label class="form-label">비고</label>' +
                '<input type="text" class="form-input" id="pwMatHistEditNote" value="' + _esc(rec.note || '') + '"></div>',
                '<button class="btn btn-secondary" onclick="' +
                    (typeof UIUtils.closeChildModal === 'function' ? 'UIUtils.closeChildModal()' : 'UIUtils.closeModal()') +
                    '">취소</button>' +
                '<button class="btn btn-primary" onclick="PaintingWorkModule._matHistSaveEdit()">저장</button>'
            );
        }

        async function _saveEdit() {
            const adminNow = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
            if (!adminNow) {
                UIUtils.toast('관리자만 입고 이력을 수정할 수 있습니다.', 'warning');
                return;
            }
            const id = ((document.getElementById('pwMatHistEditId') || {}).value || '').trim();
            const kind = ((document.getElementById('pwMatHistEditKind') || {}).value || '').trim();
            const useDate = ((document.getElementById('pwMatHistEditDate') || {}).value || '').trim();
            const qty = parseInt((document.getElementById('pwMatHistEditQty') || {}).value, 10);
            const lotNo = ((document.getElementById('pwMatHistEditLot') || {}).value || '').trim();
            const note = ((document.getElementById('pwMatHistEditNote') || {}).value || '').trim();
            if (!id) {
                UIUtils.toast('이력을 찾을 수 없습니다.', 'warning');
                return;
            }
            if (kind === 'return') {
                if (!(qty > 0)) {
                    UIUtils.toast('반납 수량은 1 이상이어야 합니다.', 'warning');
                    return;
                }
                if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.updateSiteReturn) {
                    UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
                    return;
                }
                try {
                    const rec = await PaintingInputModule.updateSiteReturn(id, { quantity: qty });
                    if (!rec) return;
                    if (typeof UIUtils.closeChildModal === 'function') UIUtils.closeChildModal();
                    UIUtils.toast('반납 수량을 ' + _fmt(qty) + ' EA로 수정했습니다.', 'success');
                    _render();
                } catch (e) {
                    UIUtils.toast('수정 실패: ' + (e && e.message ? e.message : e), 'error');
                }
                return;
            }
            if (!useDate || !(qty > 0)) {
                UIUtils.toast('사용일, 수량은 필수입니다.', 'warning');
                return;
            }
            if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.updateSiteInbound) {
                UIUtils.toast('투입 자재 모듈을 불러올 수 없습니다.', 'error');
                return;
            }
            try {
                const rec = await PaintingInputModule.updateSiteInbound(id, {
                    useDate: useDate,
                    quantity: qty,
                    lotNo: lotNo,
                    note: note
                });
                if (!rec) return;
                if (typeof UIUtils.closeChildModal === 'function') UIUtils.closeChildModal();
                UIUtils.toast('입고 이력이 수정되었습니다.', 'success');
                _render();
            } catch (e) {
                UIUtils.toast('수정 실패: ' + (e && e.message ? e.message : e), 'error');
            }
        }

        var openHist = (pickMode && typeof UIUtils.showChildModal === 'function')
            ? UIUtils.showChildModal
            : UIUtils.showModal;
        var closeHist = (pickMode && typeof UIUtils.closeChildModal === 'function')
            ? 'UIUtils.closeChildModal()'
            : 'UIUtils.closeModal()';
        openHist(
            _esc(want) + (pickMode ? ' 과거 입고 LOT 선택' : ' 과거 사출 자재 입고/반납 조회'),
            '<div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">입고일(시작)</label>' +
                    '<input type="date" id="pwMatHistStart" class="form-input" style="width:auto;min-width:9em;padding:4px 8px;" value="' + defaultStart + '" max="' + today + '">' +
                '</div>' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">입고일(종료)</label>' +
                    '<input type="date" id="pwMatHistEnd" class="form-input" style="width:auto;min-width:9em;padding:4px 8px;" value="' + defaultEnd + '" max="' + today + '">' +
                '</div>' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">차종</label>' +
                    '<select id="pwMatHistCar" class="form-select" style="width:auto;min-width:8em;padding:4px 8px;" onchange="PaintingWorkModule._matHistRender()">' +
                        '<option value="">차종 전체</option></select>' +
                '</div>' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">품명(사출명)</label>' +
                    '<select id="pwMatHistPart" class="form-select" style="width:auto;min-width:10em;padding:4px 8px;" onchange="PaintingWorkModule._matHistRender()">' +
                        '<option value="">품명 전체</option></select>' +
                '</div>' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">컬러</label>' +
                    '<select id="pwMatHistColor" class="form-select" style="width:auto;min-width:8em;padding:4px 8px;" onchange="PaintingWorkModule._matHistRender()">' +
                        '<option value="">컬러 전체</option></select>' +
                '</div>' +
                '<div class="form-group" style="margin:0;">' +
                    '<label class="form-label" style="font-size:0.75rem;">사용여부</label>' +
                    '<select id="pwMatHistUsed" class="form-select" style="width:auto;min-width:7em;padding:4px 8px;" onchange="PaintingWorkModule._matHistRender()">' +
                        '<option value="">전체</option>' +
                        '<option value="unused"' + (pickMode ? ' selected' : '') + '>미사용</option>' +
                        '<option value="partial">일부사용</option>' +
                        '<option value="used">전량사용</option>' +
                    '</select>' +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-primary" onclick="PaintingWorkModule._matHistRender()">' +
                    '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">search</span> 조회</button>' +
                '<button type="button" class="btn btn-sm btn-outline" onclick="' +
                    'document.getElementById(\'pwMatHistStart\').value=\'' + defaultStart + '\';' +
                    'document.getElementById(\'pwMatHistEnd\').value=\'' + defaultEnd + '\';' +
                    'PaintingWorkModule._matHistRender();">' + (prefDate ? '작업일~오늘' : '최근 30일') + '</button>' +
                '<span id="pwMatHistCount" style="font-size:0.78rem;color:var(--text-muted);margin-left:auto;white-space:nowrap;">0건</span>' +
            '</div>' +
            '<div style="margin-bottom:8px;padding:8px 10px;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);font-size:0.78rem;color:var(--text-secondary);">' +
                '같은 <strong>차종 · 사출명 · 컬러</strong>의 도장현장 입고만 고르세요. 사용수량/잔량은 해당 사출 LOT 전체 기준입니다.' +
                (pickMode ? ' 실적일과 입고일이 하루 어긋나면 종료일을 넓히세요. 잔량이 있는 행의 <strong>체크</strong>를 켠 뒤 아래 <strong>도장 투입에 추가</strong>를 누르면 ② 투입 LOT에 행이 생깁니다.' : '') +
                (prefCar || prefPart || prefColor ? ' 현재 실적: <strong>' + _esc(prefCar || '-') + ' / ' + _esc(prefPart || '-') + (prefColor ? ' / ' + _esc(prefColor) : '') + '</strong>.' : '') +
                ' 사출 창고 생산출고만 있고 현장 입고 확인이 안 된 건은 여기에 없습니다.' +
                (!pickMode ? ' <strong>구분</strong> 열의 <span style="color:#0891b2;font-weight:700;">↩ 반납</span> 행은 현장에서 사출창고로 되돌려보낸 이력입니다.' : '') +
            '</div>' +
            '<div class="data-table-wrapper" style="max-height:420px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;">' +
                '<table class="data-table data-table--content compact pw-mat-hist-table" style="width:max-content;table-layout:auto;border-collapse:collapse;">' +
                    '<thead><tr>' +
                        '<th style="white-space:nowrap;padding:4px 6px;width:auto;">입고일</th>' +
                        '<th style="white-space:nowrap;padding:4px 6px;width:auto;">시간</th>' +
                        '<th style="white-space:nowrap;padding:4px 6px;width:auto;">구분</th>' +
                        '<th class="pw-hist-tight" style="white-space:nowrap;padding:4px 5px;width:auto;">차종</th>' +
                        '<th class="pw-hist-tight" style="white-space:nowrap;padding:4px 5px;width:auto;">품명</th>' +
                        '<th class="pw-hist-tight" style="white-space:nowrap;padding:4px 5px;width:auto;">컬러</th>' +
                        '<th class="pw-hist-tight" style="white-space:nowrap;padding:4px 5px;width:auto;">사출LOT</th>' +
                        '<th style="text-align:right;white-space:nowrap;padding:4px 6px;width:auto;">입고수량</th>' +
                        '<th style="text-align:right;white-space:nowrap;padding:4px 6px;width:auto;">사용/반납수량</th>' +
                        '<th style="text-align:right;white-space:nowrap;padding:4px 6px;width:auto;">잔량</th>' +
                        '<th style="white-space:nowrap;padding:4px 6px;width:auto;">상태</th>' +
                        (pickMode
                            ? '<th style="white-space:nowrap;padding:4px 6px;width:auto;text-align:center;">' +
                                '<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;margin:0;">' +
                                '<input type="checkbox" id="pwMatHistPickAll" style="width:16px;height:16px;accent-color:#2563eb;" ' +
                                'onchange="PaintingWorkModule._matHistToggleAll(this)">' +
                                '선택</label></th>'
                            : '') +
                        (isAdmin ? '<th style="white-space:nowrap;padding:4px 6px;width:auto;text-align:center;">관리</th>' : '') +
                    '</tr></thead>' +
                    '<tbody id="pwMatHistBody"></tbody>' +
                '</table>' +
            '</div>',
            (pickMode
                ? '<button class="btn btn-primary" type="button" onclick="PaintingWorkModule._matHistApplySelected()">' +
                    '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">playlist_add</span> 도장 투입에 추가</button>'
                : '') +
            '<button class="btn btn-secondary" type="button" onclick="' + closeHist + '">닫기</button>',
            'xl'
        );

        PaintingWorkModule._matHistRender = _render;
        PaintingWorkModule._matHistDelete = _delete;
        PaintingWorkModule._matHistEdit = _edit;
        PaintingWorkModule._matHistSaveEdit = _saveEdit;
        PaintingWorkModule._matHistPick = _pick;
        PaintingWorkModule._matHistToggleAll = _toggleAll;
        PaintingWorkModule._matHistApplySelected = _applySelected;
        var _startHist = function () { setTimeout(_render, 0); };
        if (typeof PaintingInputModule !== 'undefined'
            && typeof PaintingInputModule.dedupeDuplicateSiteInbounds === 'function') {
            Promise.resolve(PaintingInputModule.dedupeDuplicateSiteInbounds())
                .then(_startHist)
                .catch(_startHist);
        } else {
            _startHist();
        }
    }

    function _updateLotSummary() {
        var container = document.getElementById('pwLotRows');
        if (!container) return;

        // 행별 선택됨/일부 반영 상태를 최신 잔량·수량으로 갱신
        container.querySelectorAll('.pw-lot-row').forEach(function (row) {
            var sel = row.querySelector('.pw-lot-sel');
            var qtyInput = row.querySelector('.pw-lot-qty');
            var statusEl = row.querySelector('.pw-lot-status');
            if (!sel || !qtyInput || !statusEl) return;
            var opt = sel.options[sel.selectedIndex];
            var bal = opt ? Number(opt.getAttribute('data-balance')) : NaN;
            statusEl.innerHTML = _lotRowStatusHtml(bal, qtyInput.value);
        });
        // LOT 행이 바뀔 때마다 남은 자재 반납 후보도 같이 재계산(자동 반영)
        if (document.getElementById('pwSiteReturnLotRows')) _renderSiteReturnRows();

        var lots = _collectLots();
        var totalLotQty = lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);

        // ②에서 LOT을 고르거나 수량을 바꿀 때마다 ①번 "미반영" 표를 즉시 재계산한다.
        // 그전까지는 저장된 실적 기준으로만 계산돼, 방금 화면에서 선택했는데도 여전히
        // "미반영"으로 남아 있는 것처럼 보였다(실제로는 저장 시 반영됨).
        _refreshUnmatchedInboundWarn(lots);

        // ★ 투입수량 기준 비교 (LOT = 사출부품 투입량 = IN PUT)
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var inputQty = inputQtyEl ? (Number(inputQtyEl.value) || 0) : 0;

        // 요약 요소 찾기 또는 생성 (LOT 행 컨테이너 바로 뒤에 삽입)
        var summaryEl = document.getElementById('pwLotQtySummary');
        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.id = 'pwLotQtySummary';
            summaryEl.style.cssText = 'margin-top:7px;padding:6px 10px;border-radius:6px;font-size:0.81rem;font-weight:600;display:flex;flex-direction:column;gap:8px;transition:all 0.2s;';
            container.parentNode.insertBefore(summaryEl, container.nextSibling);
        }

        if (inputQty === 0) {
            summaryEl.style.display = 'none';
            return;
        }
        summaryEl.style.display = 'flex';

        var isMatch = totalLotQty === inputQty;
        var isShort = totalLotQty < inputQty;
        var shortage = Math.max(0, inputQty - totalLotQty);
        summaryEl.style.background   = isMatch ? 'rgba(76,175,80,0.1)'  : 'rgba(239,68,68,0.08)';
        summaryEl.style.border       = isMatch ? '1px solid rgba(76,175,80,0.35)' : '1px solid rgba(239,68,68,0.35)';
        summaryEl.style.color        = isMatch ? '#16a34a' : '#dc2626';

        var icon    = isMatch ? '✅' : '⚠️';
        var diffMsg = isMatch ? ' (투입수량 일치)' : (' — 차이: ' + (totalLotQty > inputQty ? '+' : '') + UIUtils.formatNumber(totalLotQty - inputQty) + ' EA');
        var rowHtml =
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            icon + ' LOT 수량 합계: <strong>' + UIUtils.formatNumber(totalLotQty) + ' EA</strong>' +
            ' / 투입수량: <strong>' + UIUtils.formatNumber(inputQty) + ' EA</strong>' +
            '<span style="font-size:0.76rem;font-weight:400;">' + diffMsg + '</span>' +
            '</div>';

        if (isShort) {
            var nameText = _logisticsUserNamesText();
            var lineWant = ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value
                || (typeof _currentLine !== 'undefined' ? _currentLine : '') || '').trim();
            var carWant = ((document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '').trim();
            var partWant = ((document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '').trim();
            var injPartSel = document.getElementById('pwInjPartSelect');
            var injPartName = injPartSel ? String(injPartSel.value || '').trim() : '';
            var matchPart = injPartName || partWant;

            // ── 이미 선택/표시된 LOT에 아직 다 안 쓴 잔량이 있는지부터 확인한다 ──────────
            // "LOT 수량 합계 < 투입수량"은 사용자가 잔량 중 일부만 입력했을 때도 뜬다.
            // 이 경우는 실제 현장 재고 부족이 아니라 단순 미입력이므로, 물류 담당자에게
            // 추가 공급을 요청하라는 안내는 잘못된 메시지다 — 선택한 LOT의 balance부터 본다.
            var selectedBalanceTotal = 0;
            var selectedLotNosForCheck = [];
            container.querySelectorAll('.pw-lot-sel').forEach(function (sel) {
                var opt = sel.options[sel.selectedIndex];
                var lotNoSel = opt ? opt.value : '';
                if (lotNoSel) selectedLotNosForCheck.push(lotNoSel);
                var bal = opt ? Number(opt.getAttribute('data-balance')) : NaN;
                if (!isNaN(bal) && bal > 0) selectedBalanceTotal += bal;
            });
            var headroomInSelected = Math.max(0, selectedBalanceTotal - totalLotQty);
            var extraAvailable = headroomInSelected;
            if (extraAvailable < shortage - 0.001) {
                // 선택한 LOT만으로 부족하면, 아직 행에 추가하지 않은 다른 현장 재고 LOT도 있는지 본다.
                try {
                    var otherOptsHtml = _buildFilteredLotOptions(injPartName, carWant, partWant, selectedLotNosForCheck);
                    var balRe = /data-balance="([\d.]+)"/g;
                    var m;
                    while ((m = balRe.exec(otherOptsHtml))) {
                        var v = Number(m[1]);
                        if (!isNaN(v) && v > 0) extraAvailable += v;
                    }
                } catch (e) { /* ignore */ }
            }

            if (extraAvailable >= shortage - 0.001) {
                rowHtml +=
                    '<div style="padding:8px 10px;border-radius:6px;background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.35);color:#166534;font-size:0.8rem;font-weight:600;line-height:1.45;">' +
                    '이미 창고→현장 입고된 LOT에 사용 가능한 잔량이 남아 있습니다 ' +
                    '(선택한 LOT 잔량 <strong>' + UIUtils.formatNumber(selectedBalanceTotal) + ' EA</strong>' +
                    (extraAvailable > headroomInSelected ? ', 미선택 LOT 포함 총 <strong>' + UIUtils.formatNumber(extraAvailable + totalLotQty) + ' EA</strong>' : '') + ').<br>' +
                    '물류 담당자에게 추가 공급을 요청할 필요 없이, 위 ①번 <strong>미반영 LOT</strong>를 클릭해 추가하거나 아래 LOT 수량을 늘려 투입하세요.' +
                    '</div>';
                summaryEl.innerHTML = rowHtml;
                _renderSelectedInjectionMeta();
                return;
            }

            // 생산계획 일자(이 작업의 도장작업일)에 실제로 출고된 건만 본다 — 14일 롤링
            // 합계를 보여주면 지금 투입수량과 규모가 안 맞아 혼동을 준다(예: 224 vs 1,066).
            var pendingWorkDate = (document.getElementById('addPwDateHidden') || {}).value || '';
            if (!pendingWorkDate && _workViewId) {
                var pendingSavedWork = Storage.getById(STORE, _workViewId);
                if (pendingSavedWork) pendingWorkDate = pendingSavedWork.date || '';
            }

            var pending = [];
            var hasInboundHist = false;
            try {
                if (typeof PaintingInputModule !== 'undefined') {
                    if (PaintingInputModule.listPendingWarehouseShipments) {
                        // ★ 차종만으로 재조회하는 폴백은 절대 쓰지 않는다 — 같은 차종의 전혀 다른
                        // 사출품(예: RAIL COVER BEZEL)까지 이 작업(A/REST)의 "현장 입고 확인" 대상인
                        // 것처럼 잘못 보여줘서, 사용자가 엉뚱한 자재를 이 작업 걸로 확인 처리해버릴
                        // 위험이 있었다. 사출명이 정확히 일치하는 건만 후보로 삼는다.
                        pending = PaintingInputModule.listPendingWarehouseShipments(lineWant, {
                            date: pendingWorkDate || undefined,
                            days: 1,
                            carModel: carWant || undefined,
                            partName: matchPart || undefined
                        }) || [];
                    }
                    if (PaintingInputModule.hasSiteInboundHistory) {
                        hasInboundHist = PaintingInputModule.hasSiteInboundHistory(lineWant, {
                            carModel: carWant || undefined,
                            partName: matchPart || undefined
                        });
                        if (!hasInboundHist && partWant && injPartName && partWant !== injPartName) {
                            hasInboundHist = PaintingInputModule.hasSiteInboundHistory(lineWant, {
                                carModel: carWant || undefined,
                                partName: partWant
                            });
                        }
                    }
                }
            } catch (e) { /* ignore */ }

            var pendingQty = pending.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
            var guideHtml = '';
            var actionHtml = '';

            if (pending.length && pendingQty > 0) {
                // 사출창고 생산출고는 됐지만 현장 입고 확인이 안 된 경우 — 이 작업의 생산계획
                // 일자(pendingWorkDate)에 출고된 건만 보여준다(14일 롤링 합계 아님).
                guideHtml =
                    '아직 <strong>현장 입고 확인</strong>을 안 해서 선택할 LOT가 없습니다. ' +
                    '사출 창고에서 이 사출명으로 ' + (pendingWorkDate ? '<strong>' + _pwEsc(pendingWorkDate) + '</strong>에 ' : '') +
                    '<strong>생산출고</strong>된 자재 중 미확인분이 ' +
                    '<strong style="color:#dc2626;">' + UIUtils.formatNumber(pendingQty) + ' EA</strong> (' + pending.length + '건) 있습니다.<br>' +
                    '아래 <strong>현장 입고 확인</strong>을 눌러 실제로 받은 만큼 확인하면 그중에서 LOT를 선택할 수 있습니다.';
                var firstPendingId = pending[0] && pending[0].id ? String(pending[0].id) : '';
                if (firstPendingId && typeof PaintingInputModule !== 'undefined' && PaintingInputModule.confirmSiteInbound) {
                    var inboundLock = (typeof PaintingInputModule.getManualInboundLock === 'function')
                        ? PaintingInputModule.getManualInboundLock(pending[0], lineWant)
                        : { locked: false };
                    actionHtml = (inboundLock && inboundLock.locked)
                        ? '<span style="font-size:0.78rem;font-weight:800;color:#b45309;margin-right:8px;white-space:nowrap;" title="' +
                          _pwEsc((inboundLock && inboundLock.title) || '자동입고5분전') + '">자동입고5분전</span>'
                        : ('<button type="button" class="btn btn-sm btn-primary" style="font-size:0.78rem;margin-right:6px;"' +
                        ' onclick="PaintingInputModule.confirmSiteInbound(\'' + firstPendingId.replace(/'/g, "\\'") + '\',\'' +
                        String(lineWant).replace(/'/g, "\\'") + '\')">' +
                        '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 현장 입고 확인' +
                        '</button>');
                }
                actionHtml +=
                    '<button type="button" id="pwLogisticsNotifyBtn" class="btn btn-sm btn-outline" style="font-size:0.78rem;"' +
                    ' onclick="PaintingWorkModule.promptLogisticsSupplyNotify(' + shortage + ')">' +
                    '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">mail</span> 물류 담당자 통보' +
                    '</button>';
            } else if (hasInboundHist) {
                var isLaserWipSummary = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
                guideHtml = isLaserWipSummary
                    ? '레이져 후 재공품과 현장입고 재사용 자재를 함께 선택할 수 있습니다. 재사용 자재는 레이져를 거치지 않아도 됩니다.<br>' +
                      '위 LOT 목록에서 <strong>현장입고 재사용 자재</strong>를 추가하거나, 재공품 잔량을 늘려 투입하세요.'
                    : ('현장 입고 이력은 있으나 <strong>사용 가능 잔량이 없습니다</strong>. ' +
                      '추가 투입을 위해 사출 창고 생산출고 → 현장 입고가 필요합니다.<br>' +
                      '물류 담당자 사용자 <strong>' + nameText + '</strong> 에게 ' +
                      '<strong style="color:#dc2626;">' + UIUtils.formatNumber(shortage) + '개</strong> 공급을 요청하세요.');
                actionHtml =
                    '<button type="button" id="pwLogisticsNotifyBtn" class="btn btn-sm btn-primary" style="font-size:0.78rem;"' +
                    ' onclick="PaintingWorkModule.promptLogisticsSupplyNotify(' + shortage + ')">' +
                    '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">mail</span> 물류 담당자 통보' +
                    '</button>';
            } else {
                guideHtml =
                    '현장 투입 LOT 재고가 없습니다. 사출 창고 생산출고 후 <strong>현장 입고 확인</strong>이 필요합니다.<br>' +
                    '물류 담당자 사용자 <strong>' + nameText + '</strong> 에게 ' +
                    '<strong style="color:#dc2626;">' + UIUtils.formatNumber(shortage) + '개</strong>를 현장으로 공급 요청하세요.';
                actionHtml =
                    '<button type="button" id="pwLogisticsNotifyBtn" class="btn btn-sm btn-primary" style="font-size:0.78rem;"' +
                    ' onclick="PaintingWorkModule.promptLogisticsSupplyNotify(' + shortage + ')">' +
                    '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">mail</span> 물류 담당자 통보' +
                    '</button>';
            }

            rowHtml +=
                '<div style="padding:8px 10px;border-radius:6px;background:rgba(234,88,12,0.08);border:1px solid rgba(234,88,12,0.35);color:#9a3412;font-size:0.8rem;font-weight:600;line-height:1.45;">' +
                guideHtml +
                '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' + actionHtml + '</div></div>';
        }

        summaryEl.innerHTML = rowHtml;
        _renderSelectedInjectionMeta();
    }

    // LOT 행의 "선택됨"(전량 사용) / "일부 반영"(잔량 일부만 사용) 상태 라벨.
    // 전량을 안 쓰면 남은 잔량은 아래 "사출 반납" 섹션의 후보가 된다는 신호이기도 하다.
    function _lotRowStatusHtml(balance, qty) {
        var q = Number(qty) || 0;
        if (q <= 0) return '';
        if (!isNaN(balance) && balance > 0 && q < balance - 0.001) {
            return '<span style="color:#b45309;">일부 반영</span>';
        }
        return '<span style="color:#16a34a;">✓ 선택됨</span>';
    }

    function _buildLotRow(lotsHtml, lotNo, qty) {
        // 선입선출: lotNo 미지정 시 첫 번째 유효 LOT 자동 사용
        var autoLotNo = lotNo ? String(lotNo) : '';
        if (!autoLotNo) {
            var m = lotsHtml.match(/<option value="([^"]+)"[^>]*selected/);
            if (!m) {
                var all = lotsHtml.match(/<option[^>]+value="([^"]+)"/g) || [];
                for (var _i = 0; _i < all.length; _i++) {
                    var _vm = all[_i].match(/value="([^"]+)"/);
                    if (_vm && _vm[1]) { m = _vm; break; }
                }
            }
            if (m && m[1]) autoLotNo = m[1];
        }
        // 선택 LOT를 select 옵션에 selected 반영 (화면·값 동기화)
        if (autoLotNo) {
            var escLot = autoLotNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            lotsHtml = lotsHtml
                .replace(/\sselected(?=[\s>])/g, '')
                .replace(new RegExp('(<option[^>]*value="' + escLot + '")'), '$1 selected');
        }
        // 자동 선택 LOT의 잔량을 max로 설정
        var autoBalance = NaN;
        if (autoLotNo) {
            var bm = lotsHtml.match(new RegExp('value="' + autoLotNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*data-balance="(\\d+)"'));
            if (!bm) {
                bm = lotsHtml.match(new RegExp('data-balance="(\\d+)"[^>]*value="' + autoLotNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
            }
            if (bm) autoBalance = parseInt(bm[1], 10);
        }
        const actualLotNo = _lotNoFromOptionValue(autoLotNo) || autoLotNo;
        const noVal = actualLotNo ? ' value="' + actualLotNo + '"' : '';
        const qtyVal = (qty !== '' && qty != null && Number(qty) > 0) ? ' value="' + qty + '"' : '';
        const maxAttr = (!isNaN(autoBalance) && autoBalance >= 0)
            ? ' max="' + autoBalance + '" placeholder="최대 ' + UIUtils.formatNumber(autoBalance) + '"'
            : ' placeholder="수량"';
        // 도장 현장 입고 일시(사출창고→도장라인 이동 시점) — 수입검사 입고일(사출창고에 외부
        // 입고·검사받은 시점, 별개 개념)과 헷갈리지 않도록 라벨을 명시하고 툴팁으로도 구분한다.
        // 같은 LOT번호가 다른 시각에 나눠 입고될 수 있어 날짜 + 시간을 같이 보여준다.
        const inboundStamp = actualLotNo ? _findSiteInboundDateForLot(actualLotNo) : '';
        const inspStamp = actualLotNo ? _findIncomingInspectionDateForLot('', actualLotNo) : '';
        const inboundDateHtml = (function() {
            const title = '현장입고(사출→도장 이동): ' + (inboundStamp || '기록 없음') +
                (inspStamp ? ' / 수입검사입고(사출창고 입고): ' + inspStamp : '');
            if (!inboundStamp) {
                return '<div class="pw-lot-inbound-date" title="' + _pwEsc(title) + '" style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;text-align:center;">-</div>';
            }
            const day = inboundStamp.slice(5, 10);
            const time = inboundStamp.length > 11 ? inboundStamp.slice(11, 16) : '';
            return '<div class="pw-lot-inbound-date" title="' + _pwEsc(title) + '" style="font-size:0.66rem;color:var(--text-muted);white-space:nowrap;text-align:center;line-height:1.25;">' +
                '<div style="font-weight:700;color:var(--accent-blue,#2563eb);">현장</div>' +
                '<div>' + day + '</div>' + (time ? '<div>' + time + '</div>' : '') + '</div>';
        })();
        return '<div class="pw-lot-row" style="margin-bottom:6px;">' +
            '<div style="display:grid;grid-template-columns:56px 3.2fr 1.1fr 34px;gap:8px;align-items:center;">' +
            inboundDateHtml +
            '<select class="form-select pw-lot-sel" style="font-size:0.84rem;"' +
            ' onchange="PaintingWorkModule.onLotRowSelect(this)">' +
            lotsHtml + '</select>' +
            '<input type="hidden" class="pw-lot-no"' + noVal + '>' +
            '<input type="number" class="form-input pw-lot-qty"' + qtyVal + maxAttr +
            ' min="0" style="font-size:0.84rem;text-align:right;"' +
            ' oninput="PaintingWorkModule._validateLotQty(this)">' +
            '<button class="btn btn-sm" title="삭제" onclick="PaintingWorkModule.removeLotRow(this)"' +
            ' style="background:transparent;color:var(--text-muted);border:1px solid var(--border);' +
            'border-radius:6px;padding:4px 6px;min-width:34px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;display:block;">remove</span>' +
            '</button>' +
            '<div class="pw-lot-status" style="grid-column:3;text-align:right;font-size:0.68rem;font-weight:700;margin-top:1px;">' +
            _lotRowStatusHtml(autoBalance, qty) + '</div>' +
            '</div>' +
            '<div class="pw-fifo-warn" style="display:none;margin-top:5px;padding:8px 12px;' +
            'background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.55);border-radius:6px;">' +
            '<div style="display:flex;align-items:center;gap:5px;color:#b45309;font-weight:700;margin-bottom:7px;font-size:0.78rem;">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">priority_high</span>' +
            '<span class="pw-fifo-warn-msg"></span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<label style="font-size:0.76rem;color:#b45309;white-space:nowrap;font-weight:700;">' +
            '미준수 사유&nbsp;<span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select pw-fifo-reason" style="font-size:0.8rem;flex:1;border-color:rgba(245,158,11,0.7);background:#fffbeb;">' +
            '<option value="">-- 사유 선택 필수 --</option>' +
            '<option value="자재 불량">자재 불량 (이전 LOT 사용 불가)</option>' +
            '<option value="자재수량 부족">자재수량 부족 (이전 LOT 잔량 부족)</option>' +
            '<option value="색상 불일치">색상 불일치</option>' +
            '<option value="긴급 생산">긴급 생산 지시</option>' +
            '<option value="기타">기타 (비고 입력)</option>' +
            '</select></div>' +
            '</div>' +
            '</div>';
    }

    // LOT 행 추가 버튼
    function addLotRow() {
        var container = document.getElementById('pwLotRows');
        if (!container) return;
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var excludeLots = _getSelectedLotNos(null);
        var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
        container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, '', ''));
        setTimeout(_updateLotSummary, 60);
    }

    // ── 투입수량 입력 시 LOT 행 자동 채우기 (디바운스 400ms) ──
    var _autoFillTimer = null;
    function _autoFillLotQtys() {
        _updateLotSummary();
        clearTimeout(_autoFillTimer);
        _autoFillTimer = setTimeout(_execAutoFill, 400);
    }

    function _reworkUseOn() {
        var el = document.getElementById('pwUseReworkMaterial');
        return !!(el && el.checked);
    }

    /** 현장 투입(또는 재공) LOT 목록 — 당일 현장입고분 우선, lotNo 오름차순 = FIFO.
     *  「재사용 자재 사용」이 켜져 있으면 현장입고 재사용 LOT을 뒤에 이어 붙인다. */
    function _getAvailableLotsFifo() {
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var planColor = (document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '';
        var planDate = (document.getElementById('addPwDateHidden') || {}).value || '';
        var isLaserWip = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        var useRework = _reworkUseOn();
        // 사출명 미선택이면 ①번과 동일하게 느슨 매칭으로 복구 — 없으면 당일 필터만 적용
        if (!isLaserWip && !injPartName && pn) {
            injPartName = _resolveInjPartNameForWork(cm, pn, planColor) || '';
        }
        var lots;
        if (isLaserWip) {
            var all = getLaserWipLots(cm, pn, { color: planColor }) || [];
            var wip = all.filter(function (l) { return l.lotSource !== 'site_rework'; });
            var rew = useRework ? all.filter(function (l) { return l.lotSource === 'site_rework'; }) : [];
            lots = wip.concat(rew);
        } else if (injPartName) {
            lots = getInjectionLotsByInjPart(injPartName, planColor, cm, planDate) || [];
            if (useRework && typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getLotsByInjPart) {
                var line = ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value || '').trim()
                    || (typeof _currentLine !== 'undefined' ? _currentLine : '');
                var extra = PaintingInputModule.getLotsByInjPart(line, injPartName, planColor, cm) || [];
                var seen = {};
                lots.forEach(function (l) { seen[String(l.lotNo || '')] = true; });
                extra.forEach(function (l) {
                    var no = String(l.lotNo || '');
                    if (!no || seen[no] || !(Number(l.balance) > 0)) return;
                    seen[no] = true;
                    lots.push({
                        lotNo: no,
                        color: l.color || planColor || '',
                        balance: Number(l.balance) || 0,
                        partName: l.partName || injPartName,
                        lotSource: 'site_rework',
                        optionKey: 'rework:' + no
                    });
                });
            }
        } else {
            lots = _lotsForPlanPart(cm, pn, planColor, planDate) || [];
        }
        return lots
            .filter(function (l) { return l && l.lotNo && (Number(l.balance) || 0) > 0; })
            .slice()
            .sort(function (a, b) {
                var ar = a.lotSource === 'site_rework' ? 1 : 0;
                var br = b.lotSource === 'site_rework' ? 1 : 0;
                if (ar !== br) return ar - br;
                return String(a.paintLot || a.lotNo).localeCompare(String(b.paintLot || b.lotNo))
                    || String(a.lotNo).localeCompare(String(b.lotNo));
            });
    }

    /** 이 LOT이 실제로 현장 입고 확인(또는 재공품 편입) 기록이 있는 LOT인지 확인.
     *  "LOT번호" 칸에 아무 번호나 타이핑해도 그대로 저장되던 구멍을 막기
     *  위함이다 — 현장에 도착 확인된 적 없는 LOT로 실적을 등록하면 자재과잉/유실 계산이
     *  비교할 대상이 없어 무의미해진다. 잔량이 아니라 "입고된 적 있는지"만 본다(이 저장으로
     *  잔량이 소진되는 정상적인 경우까지 막으면 안 되므로). */
    function _isLotConfirmedReceived(lotNo, carModel, injPartName, isLaserWipProduct, partName) {
        var lot = String(lotNo || '').trim();
        if (!lot) return false;
        if (isLaserWipProduct) {
            var wipLots = getLaserWipLots(carModel, partName);
            if (wipLots.some(function (l) {
                return l.lotNo === lot || _lotOptionKey(l) === lot;
            })) return true;
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getExactLotLedger) {
                var inj = injPartName;
                try { inj = inj || _resolveInjPartNameForWork(carModel, partName, '') || partName; } catch (e1) { inj = injPartName || partName; }
                var ledger = PaintingInputModule.getExactLotLedger(_currentLine, carModel, inj, lot);
                if ((ledger.received || 0) > 0.001) return true;
            }
            return false;
        }
        if (!injPartName) return true; // 사출명이 특정 안 되면(마스터 미등록 등) 기존 동작 유지
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.getExactLotLedger) return true;
        var ledger = PaintingInputModule.getExactLotLedger(_currentLine, carModel, injPartName, lot);
        return (ledger.received || 0) > 0.001;
    }

    /** 저장 직전 LOT 목록을 검증 — 미확인 LOT이 있으면 관리자만 예외적으로 계속할 수 있다.
     *  반환: true면 저장 진행, false면 저장 중단(이미 안내는 표시했음). */
    async function _confirmUnverifiedLots(lots, carModel, injPartName, isLaserWipProduct, partName) {
        var unverified = lots.filter(function (l) {
            return !_isLotConfirmedReceived(l.lotNo, carModel, injPartName, isLaserWipProduct, partName);
        });
        if (!unverified.length) return true;

        var isAdmin = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
        var lotList = unverified.map(function (l) { return l.lotNo; }).join(', ');
        if (!isAdmin) {
            UIUtils.toast('LOT ' + lotList + '은(는) 현장 입고 확인 기록이 없습니다. 실제 입고 확인된 LOT만 사용할 수 있습니다.', 'error');
            return false;
        }
        return new Promise(function (resolve) {
            UIUtils.confirm(
                'LOT ' + lotList + '은(는) 현장 입고 확인 기록이 없습니다.\n' +
                '이 상태로 저장하면 이후 자재과잉/유실 계산이 부정확해집니다.\n' +
                '관리자 권한으로 예외적으로 계속 저장하시겠습니까?',
                function () { resolve(true); },
                function () { resolve(false); }
            );
        });
    }

    function _execAutoFill() {
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var needed = Number(inputQtyEl ? inputQtyEl.value : 0) || 0;
        var container = document.getElementById('pwLotRows');
        if (!container) return;
        if (needed <= 0) { _updateLotSummary(); return; }

        var fifoLots = _getAvailableLotsFifo();
        var useRework = _reworkUseOn();
        var keptRework = [];
        if (useRework && (document.getElementById('addPwIsLaserWip') || {}).value === '1') {
            container.querySelectorAll('.pw-lot-row').forEach(function (row) {
                var sel = row.querySelector('.pw-lot-sel');
                var opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
                if (!opt || String(opt.getAttribute('data-lot-source') || '') !== 'site_rework') return;
                var qty = Number((row.querySelector('.pw-lot-qty') || {}).value) || 0;
                var lotNo = String(opt.getAttribute('data-lot-no') || _lotNoFromOptionValue(sel.value) || '').trim();
                if (!lotNo || qty <= 0) return;
                keptRework.push({
                    lotNo: lotNo,
                    optionKey: sel.value,
                    qty: qty,
                    balance: Number(opt.getAttribute('data-balance')) || qty
                });
            });
        }
        if (!fifoLots.length && !keptRework.length) {
            _updateLotSummary();
            return;
        }

        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var planColor = (document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '';

        var allocations = [];
        var reworkTaken = keptRework.reduce(function (s, a) { return s + (Number(a.qty) || 0); }, 0);
        var remain = Math.max(0, needed - reworkTaken);
        var fifoWip = fifoLots.filter(function (l) { return l.lotSource !== 'site_rework'; });
        var fifoRework = useRework ? fifoLots.filter(function (l) { return l.lotSource === 'site_rework'; }) : [];
        for (var i = 0; i < fifoWip.length && remain > 0; i++) {
            var bal = Number(fifoWip[i].balance) || 0;
            if (bal <= 0) continue;
            var take = Math.min(bal, remain);
            allocations.push({
                lotNo: fifoWip[i].lotNo,
                optionKey: _lotOptionKey(fifoWip[i]) || fifoWip[i].lotNo,
                qty: take,
                balance: bal
            });
            remain -= take;
        }
        if (useRework && remain > 0.001) {
            var keptKeys = {};
            keptRework.forEach(function (k) { keptKeys[String(k.optionKey || k.lotNo)] = true; });
            fifoRework.forEach(function (l) {
                if (remain <= 0) return;
                var key = _lotOptionKey(l) || ('rework:' + l.lotNo);
                if (keptKeys[key]) return;
                var rBal = Number(l.balance) || 0;
                if (rBal <= 0) return;
                var rTake = Math.min(rBal, remain);
                allocations.push({
                    lotNo: l.lotNo,
                    optionKey: key,
                    qty: rTake,
                    balance: rBal
                });
                remain -= rTake;
            });
        }
        allocations = allocations.concat(keptRework);
        if (!allocations.length) { _updateLotSummary(); return; }

        // 행 전체 재구성 — 드롭다운·LOT번호·수량 동기화
        container.innerHTML = '';
        allocations.forEach(function (a, idx) {
            var excludeOthers = allocations
                .filter(function (_, j) { return j !== idx; })
                .map(function (x) { return x.optionKey || x.lotNo; });
            var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeOthers);
            var selectVal = a.optionKey || a.lotNo;
            var wantRework = String(selectVal).indexOf('rework:') === 0;
            var lotOptRe = new RegExp('value="' + String(selectVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
            if (wantRework && !lotOptRe.test(lotsHtml)) {
                lotsHtml = '<option value="' + _pwEsc(selectVal) + '" data-lot-no="' + _pwEsc(a.lotNo) +
                    '" data-lot-source="site_rework" data-balance="' + a.balance + '" selected>' +
                    '현장 재사용 자재 / 사출 ' + _pwEsc(a.lotNo) + ' │ ' + UIUtils.formatNumber(a.balance) + ' EA</option>' +
                    lotsHtml;
            }
            container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, selectVal, a.qty));
            var row = container.querySelectorAll('.pw-lot-row')[idx];
            if (!row) return;
            var sel = row.querySelector('.pw-lot-sel');
            if (sel) {
                sel.value = selectVal;
                if (sel.value !== selectVal) {
                    for (var k = 0; k < sel.options.length; k++) {
                        if (sel.options[k].value === selectVal) {
                            sel.selectedIndex = k;
                            break;
                        }
                        // 재사용 행은 같은 사출 LOT의 재공 옵션으로 떨어지면 안 된다
                        if (!wantRework && sel.options[k].getAttribute('data-lot-no') === a.lotNo) {
                            sel.selectedIndex = k;
                            break;
                        }
                    }
                }
            }
            var noInp = row.querySelector('.pw-lot-no');
            if (noInp) noInp.value = a.lotNo;
            var qtyInp = row.querySelector('.pw-lot-qty');
            if (qtyInp) {
                qtyInp.max = a.balance;
                qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(a.balance);
                qtyInp.value = a.qty;
            }
        });

        _refreshAddLotBtn(injPartName, cm, pn);
        _updateLotSummary();
    }

    // LOT 추가 버튼 활성화 상태 갱신 (행 추가/삭제/선택 변경 후 공통 호출)
    function _refreshAddLotBtn(injPartName, cm, pn) {
        if (injPartName === undefined) {
            var injPartSel = document.getElementById('pwInjPartSelect');
            injPartName = injPartSel ? injPartSel.value : '';
        }
        if (cm === undefined) {
            cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        }
        if (pn === undefined) {
            pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        }
        var excludeAll = _getSelectedLotNos(null);
        var moreHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeAll);
        var tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = moreHtml;
        var hasMore = !!(tmpDiv.querySelector('optgroup option[value]:not([value=""]), option[value]:not([value=""])'));
        var btn = document.getElementById('pwAddLotBtn');
        if (btn) {
            btn.disabled = !hasMore;
            btn.title = !hasMore ? '현장 투입 LOT가 더 이상 없습니다' : '';
        }
    }

    // LOT 행 제거
    function removeLotRow(btn) {
        const row = btn.closest('.pw-lot-row');
        const container = document.getElementById('pwLotRows');
        if (!row || !container) return;
        if (container.querySelectorAll('.pw-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
        _updateLotSummary();
        _refreshAddLotBtn(); // 삭제 후 버튼 활성화 재확인
    }

    // LOT 드롭다운 → 직접입력 자동 채우기 + 선입선출 경고 체크
    function onLotRowSelect(sel) {
        if (!sel) return;
        const row = sel.closest('.pw-lot-row');
        if (!row) return;
        const inp = row.querySelector('.pw-lot-no');
        const selectedOpt = sel.options[sel.selectedIndex];
        const actualLotNo = selectedOpt
            ? (selectedOpt.getAttribute('data-lot-no') || _lotNoFromOptionValue(sel.value) || sel.value)
            : sel.value;
        if (inp && actualLotNo) inp.value = actualLotNo;
        checkFifoWarning(row, sel);

        // data-balance에서 직접 max 설정 (DB 조회 불필요)
        const qtyInp = row.querySelector('.pw-lot-qty');
        if (qtyInp) {
            const selectedOpt = sel.options[sel.selectedIndex];
            const balance = selectedOpt ? parseInt(selectedOpt.getAttribute('data-balance')) : NaN;
            if (!isNaN(balance) && balance >= 0) {
                qtyInp.max = balance;
                qtyInp.placeholder = '최대 ' + UIUtils.formatNumber(balance);
                // 현재 입력값이 max 초과면 즉시 차단
                if (Number(qtyInp.value) > balance) {
                    qtyInp.value = balance;
                }
            } else {
                qtyInp.removeAttribute('max');
                qtyInp.placeholder = '수량';
            }
        }

        _refreshOtherLotDropdowns(row);      // 다른 행 드롭다운 갱신
        _refreshAddLotBtn();                 // 버튼 활성화 재확인
        _updateLotSummary();
    }

    // ── 선입선출(FIFO) 경고 표시/숨김 ──────────────────────────────────
    // 규칙:
    //  1) 같은 사출명(injPartName) 내 → 더 오래된 LOT(숫자 작음)가 잔량 있으면 위반
    //  2) "창고 전체 재고" 그룹에서 선택 + "사출명 일치" 그룹에 잔량 있음 → 위반
    function checkFifoWarning(row, sel) {
        var warnEl = row.querySelector('.pw-fifo-warn');
        var msgEl  = row.querySelector('.pw-fifo-warn-msg');
        if (!warnEl || !msgEl) return;

        var selectedLotNo = sel.value;
        if (!selectedLotNo) {
            warnEl.style.display = 'none';
            return;
        }

        // optgroup 구조에서 각 그룹 옵션 추출
        var primaryOpts = [];   // 사출명 일치 LOT
        var otherOpts   = [];   // 창고 전체 재고
        var optgroups = sel.getElementsByTagName('optgroup');

        if (optgroups.length >= 1) {
            primaryOpts = Array.from(optgroups[0].getElementsByTagName('option'))
                              .filter(function(o) { return o.value; });
        }
        if (optgroups.length >= 2) {
            otherOpts = Array.from(optgroups[1].getElementsByTagName('option'))
                            .filter(function(o) { return o.value; });
        }
        // optgroup 없는 경우(이전 버전 호환)
        if (optgroups.length === 0) {
            primaryOpts = Array.from(sel.options).filter(function(o) { return o.value; });
        }

        // 현재 선택이 어느 그룹인지 판별
        var isInPrimary = primaryOpts.some(function(o) { return o.value === selectedLotNo; });
        var isInOther   = otherOpts.some(function(o)   { return o.value === selectedLotNo; });

        // Case 1: "창고 전체 재고"에서 선택했는데 "사출명 일치" 그룹에 잔량 있음
        if (isInOther && primaryOpts.length > 0) {
            var oldestPrimary = primaryOpts.reduce(function(min, o) {
                return o.value < min ? o.value : min;
            }, primaryOpts[0].value);
            msgEl.textContent = '선입선출 위반 — LOT ' + oldestPrimary +
                ' (사출명 일치 재고)를 먼저 소진해야 합니다.';
            warnEl.style.display = 'flex';
            return;
        }

        // Case 2: 같은 사출명 그룹 내 — 더 오래된 LOT가 존재
        var searchPool = isInPrimary ? primaryOpts : Array.from(sel.options).filter(function(o) { return o.value; });
        var olderLots  = searchPool.filter(function(o) { return o.value < selectedLotNo; });

        if (olderLots.length === 0) {
            warnEl.style.display = 'none';
            return;
        }

        var oldestLotNo = olderLots.reduce(function(min, o) {
            return o.value < min ? o.value : min;
        }, olderLots[0].value);
        msgEl.textContent = '선입선출 위반 — LOT ' + oldestLotNo + ' 재고가 먼저 소진되어야 합니다.';
        warnEl.style.display = 'flex';
    }

    // LOT 행 데이터 수집
    function _collectLots() {
        const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
        const lots = [];
        rows.forEach(function(row) {
            const sel = row.querySelector('.pw-lot-sel');
            const opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
            const actualFromOpt = opt ? String(opt.getAttribute('data-lot-no') || '').trim() : '';
            const lotNo = actualFromOpt
                || _lotNoFromOptionValue(sel && sel.value)
                || (row.querySelector('.pw-lot-no') ? row.querySelector('.pw-lot-no').value : '').trim();
            const qty = Number(row.querySelector('.pw-lot-qty') ? row.querySelector('.pw-lot-qty').value : 0) || 0;
            const partName = opt ? String(opt.getAttribute('data-part-name') || '').trim() : '';
            const color = opt ? String(opt.getAttribute('data-color') || '').trim() : '';
            const paintLot = opt ? String(opt.getAttribute('data-paint-lot') || '').trim() : '';
            const lotSource = opt ? String(opt.getAttribute('data-lot-source') || '').trim() : '';
            const warnEl = row.querySelector('.pw-fifo-warn');
            const isFifoViolated = warnEl && warnEl.style.display !== 'none';
            const fifoReason = isFifoViolated
                ? ((row.querySelector('.pw-fifo-reason') || {}).value || '')
                : '';
            if (lotNo) {
                const rowData = { lotNo, qty, fifoReason, partName, color };
                if (paintLot) {
                    rowData.paintLot = paintLot;
                    rowData.paintDate = paintLot;
                }
                if (lotSource) rowData.lotSource = lotSource;
                if (sel && sel.value && sel.value !== lotNo) rowData.optionKey = sel.value;
                lots.push(rowData);
            }
        });
        return lots;
    }

    // 평균 CT 계산·표시
    function calcCT() {
        const startEl = document.getElementById('addPwStartTime');
        const endEl = document.getElementById('addPwEndTime');
        const prodEl = document.getElementById('addPwProdQty');
        const ctEl = document.getElementById('pwCtInfo');
        if (!ctEl) return;
        const start = startEl ? startEl.value : '';
        const end = endEl ? endEl.value : '';
        const qty = Number(prodEl ? prodEl.value : 0) || 0;
        if (start && end && qty > 0) {
            const sh = parseInt(start.split(':')[0]),
                sm = parseInt(start.split(':')[1]);
            const eh = parseInt(end.split(':')[0]),
                em = parseInt(end.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin <= 0) {
                ctEl.innerHTML = '<span style="color:var(--accent-red);font-size:0.82rem;">시간 오류 확인</span>';
                return;
            }
            const ctSec = (totalMin * 60 / qty).toFixed(1);
            ctEl.innerHTML =
                '<span style="color:var(--accent-blue);font-weight:700;font-size:1.05rem;">' + ctSec + '초/EA</span>' +
                '<span style="color:var(--text-muted);font-size:0.76rem;margin-left:6px;">' +
                '(총 ' + totalMin + '분 / ' + UIUtils.formatNumber(qty) + ' EA)</span>';
        } else {
            ctEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">완료수량·시간 입력 시 자동계산</span>';
        }
    }

    // 계획 시간 변경 감지 → 사유 섹션 표시/숨김 (10분 이내 차이는 무시)
    function _timeToMin(t) {
        if (!t) return NaN;
        var parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    function onTimeChange() {
        var section = document.getElementById('pwTimeReasonSection');
        if (!section) return;
        var planStart = section.getAttribute('data-plan-start') || '';
        var planEnd = section.getAttribute('data-plan-end') || '';
        if (!planStart && !planEnd) return;
        var actualStart = (document.getElementById('addPwStartTime') || {}).value || '';
        var actualEnd = (document.getElementById('addPwEndTime') || {}).value || '';
        var diffStart = (planStart && actualStart) ? Math.abs(_timeToMin(actualStart) - _timeToMin(planStart)) : 0;
        var diffEnd   = (planEnd   && actualEnd)   ? Math.abs(_timeToMin(actualEnd)   - _timeToMin(planEnd))   : 0;
        var differs = diffStart > 10 || diffEnd > 10;
        section.style.display = differs ? 'block' : 'none';
    }

    // IN/OUT 수량 1% 초과 차이 감지 → 경고 표시 / 비고 필수 표시
    function checkQtyDiff() {
        var inQtyEl  = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var outQtyEl = document.getElementById('addPwProdQty')  || document.getElementById('editPwProdQty');
        var inQty  = Number((inQtyEl || {}).value) || 0;
        var outQty = Number((outQtyEl || {}).value) || 0;
        var warn   = document.getElementById('qtyDiffWarning');
        var req    = document.getElementById('addPwNoteRequired');
        if (!warn) return;
        var exceed = inQty > 0 && outQty > 0 && Math.abs(inQty - outQty) / inQty > 0.01;
        warn.style.display = exceed ? 'block' : 'none';
        if (req) req.style.display = exceed ? 'inline' : 'none';
        // 실제 수량 레이블 업데이트
        var inLabel  = document.getElementById('pwDiffInQty');
        var outLabel = document.getElementById('pwDiffOutQty');
        if (inLabel)  inLabel.textContent  = exceed ? UIUtils.formatNumber(inQty)  : '-';
        if (outLabel) outLabel.textContent = exceed ? UIUtils.formatNumber(outQty) : '-';
    }

    // 계획 미달로 남는 소재 처리 섹션. 두 가지 완전히 다른 물류 경로가 있다:
    //   1) 일반 제품(사출 LOT) — 사출창고에서 도장현장으로 물리적으로 이미 이동해 온 자재라
    //      실물이 현장에 남는다. 그래서 사출창고 물류담당자가 실물을 확인해야 하는 "반납" 절차가 필요.
    //   2) 레이져→도장-B 재공품 제품(isLaserWipProduct) — 애초에 사출창고를 거치지 않고
    //      LaserWipModule의 재공품 풀에서 LOT을 바로 끌어 쓴다. 저장되는 LOT 행 합계 = 실제
    //      투입수량뿐이므로, 못 쓴 나머지는 "체크아웃"된 적이 없어 자동으로 재공품 잔량에
    //      그대로 남는다 — 여기서 반납 액션을 만들면 있지도 않은 이동을 만드는 이중 처리가 된다.
    //      대신 지금 이 LOT이 어느 도장 LOT·사출 LOT에서 왔는지(출처)만 눈으로 보여준다.
    // ── 실적 저장 시 현장 잔량 정산 강제 ─────────────────────────────
    var _pendingWorkSave = null;
    // 정산 선택 결과는 data 객체가 아니라 모듈 변수에 둔다 — saveNew()를 다시 호출하면
    // 폼에서 data를 새로 만들기 때문에, data에 표시를 붙이면 그 표시가 사라져 모달이 무한 반복된다.
    var _siteRemainDecl = null;

    /** 이미 정산 방법을 선택했는가 */
    function _siteRemainDeclared() {
        return !!_siteRemainDecl;
    }

    /** 이 실적 저장 뒤 현장에 남게 될 LOT별 잔량.
     *  주의: 이 차종·사출명의 "역대 전체" 미정산 잔량이 아니라, 이 실적과 같은 날짜에
     *  현장 입고된 LOT(오늘 이 배치)만 대상으로 한다 — _computeSiteInboundLotMaps와
     *  동일한 날짜 스코프를 재사용한다.
     *  예전에는 PaintingInputModule.getLotsByCarPart로 날짜·색상 구분 없이 전체 이력을
     *  긁어와, 이 실적을 저장할 때 몇 주 전 다른 배치의 미정산 잔량까지 한꺼번에
     *  "반납하시겠습니까?"로 강제했다. 그 상태로 "반납"을 고르면 오늘 이 작업과 무관한
     *  옛날 LOT까지 하나의 반납 건으로 묶여 나가 실제 사고가 났다(예: 800 EA만 반납할
     *  생각이었는데 몇 주치 잔량까지 27,200 EA로 한꺼번에 반납됨). */
    function _siteRemainLotsFor(data) {
        try {
            var maps = _computeSiteInboundLotMaps(data);
            if (!maps.ok) return [];
            var lots = [];
            Object.keys(maps.receivedQtyByLot).forEach(function (lotNo) {
                var received = maps.receivedQtyByLot[lotNo] || 0;
                var used = maps.usedQtyByLot[lotNo] || 0;      // 이번에 저장할 data.lots 포함
                var returned = maps.returnedQtyByLot[lotNo] || 0;
                var balance = received - used - returned;
                if (balance > 0.001) lots.push({
                    lotNo: lotNo,
                    partName: (maps.receivedPartByLot && maps.receivedPartByLot[lotNo])
                        || maps.injPartName || (data && data.injPartName) || (data && data.partName) || '',
                    color: (data.injColor || data.color || ''),
                    balance: balance
                });
            });
            return lots.sort(function (a, b) { return String(a.lotNo).localeCompare(String(b.lotNo)); });
        } catch (e) { return []; }
    }

    function _showSiteRemainModal() {
        var ctx = _pendingWorkSave;
        if (!ctx) return;
        var rows = ctx.remainLots.map(function (l) {
            var name = String(l.partName || '').trim();
            return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 2px;font-size:0.8rem;border-bottom:1px dashed var(--border);">' +
                '<span style="white-space:nowrap;"><span style="font-weight:700;">' + _pwEsc(name || '-') + '</span>' +
                ' · <span style="font-family:monospace;">' + _pwEsc(l.lotNo || '-') + '</span>' +
                (l.color ? ' · ' + _pwEsc(l.color) : '') + '</span>' +
                '<span style="font-weight:700;white-space:nowrap;">' + UIUtils.formatNumber(l.balance) + ' EA</span></div>';
        }).join('');

        UIUtils.showModal('현장에 남는 자재 처리',
            '<div style="padding:4px 0;">' +
            '<div style="padding:11px 13px;border-radius:8px;border:1px solid rgba(180,83,9,.35);background:rgba(180,83,9,.07);font-size:0.85rem;line-height:1.6;">' +
            '이 도장작업일 입고분 기준으로 현장에 <strong style="color:#b45309;">' + UIUtils.formatNumber(ctx.remainQty) + ' EA</strong>가 남습니다. ' +
            '처리 방법을 정하지 않으면 나중에 <strong>유실</strong>로 잡히고 사출창고 재고와 실물이 어긋납니다.' +
            '<div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted);">지난 도장일의 사출 LOT 잔량은 0 처리되며 이 목록에 포함되지 않습니다.</div>' +
            '</div>' +
            '<div style="margin-top:10px;background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">' + rows + '</div>' +
            '<div style="margin-top:12px;">' +
            '<label style="display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border:1px solid var(--border-color);border-radius:8px;cursor:pointer;font-size:0.85rem;">' +
            '<input type="radio" name="pwRemainAction" value="carryover" checked style="margin-top:3px;">' +
            '<span><strong>이어서 사용 (이월)</strong><div style="color:var(--text-muted);font-size:0.78rem;">다음 작업에 그대로 씁니다. 현장 잔량으로 남습니다.</div></span></label>' +
            '<label style="display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border:1px solid var(--border-color);border-radius:8px;cursor:pointer;font-size:0.85rem;margin-top:6px;">' +
            '<input type="radio" name="pwRemainAction" value="return" style="margin-top:3px;">' +
            '<span><strong>사출창고로 반납</strong><div style="color:var(--text-muted);font-size:0.78rem;">반납 대기로 기록되고, 사출창고에서 「입고 처리」하면 재고에 편입됩니다.</div></span></label>' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
            '<label class="form-label">사유</label>' +
            '<input type="text" class="form-input" id="pwRemainReason" placeholder="예: 다음 차수에 이어 사용 / 계획 축소로 반납">' +
            '</div></div>',
            '<button class="btn btn-secondary" onclick="PaintingWorkModule._cancelSiteRemain()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule._confirmSiteRemain()">확인하고 저장</button>',
            '560px');
    }

    function _cancelSiteRemain() {
        _pendingWorkSave = null;
        _siteRemainDecl = null;
        UIUtils.closeModal();
    }

    async function _confirmSiteRemain() {
        var ctx = _pendingWorkSave;
        if (!ctx) { UIUtils.toast('요청이 만료되었습니다. 다시 저장하세요.', 'error'); return; }
        var actionEl = document.querySelector('input[name="pwRemainAction"]:checked');
        var action = actionEl ? String(actionEl.value) : 'carryover';
        var reason = ((document.getElementById('pwRemainReason') || {}).value || '').trim();
        if (action === 'return' && !reason) {
            UIUtils.toast('반납 사유를 입력하세요.', 'warning');
            return;
        }
        _pendingWorkSave = null;
        UIUtils.closeModal();

        _siteRemainDecl = { action: action, qty: ctx.remainQty, reason: reason };

        if (action === 'return') {
            try {
                var user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
                await PaintingInputModule.createSiteReturn({
                    line: ctx.data.line,
                    carModel: ctx.data.carModel,
                    partName: (ctx.remainLots[0] && ctx.remainLots[0].partName)
                        || ctx.data.injPartName || ctx.data.partName,
                    color: ctx.data.injColor || ctx.data.color,
                    lots: ctx.remainLots.map(function (l) { return { lotNo: l.lotNo, qty: l.balance }; }),
                    reason: reason,
                    returnedBy: (user && (user.displayName || user.username)) || '',
                    workId: ctx.data && ctx.data.id
                });
                UIUtils.toast('반납 대기로 등록했습니다. 사출창고에서 입고 처리하면 재고에 반영됩니다.', 'success');
            } catch (e) {
                _siteRemainDecl = null;
                UIUtils.toast('반납 등록 실패: ' + (e && e.message ? e.message : e), 'error');
                return;
            }
        }
        saveNew();   // 정산 표시가 붙은 상태로 재시도 → 이번엔 통과
    }

    function _siteReturnSectionHtml(isLaserWipProduct, carModel, partName) {
        if (isLaserWipProduct) {
            var wipLots = getLaserWipLots(carModel, partName);
            var wipRowsHtml = wipLots.length
                ? wipLots.map(function (l) {
                    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 2px;' +
                        'font-size:0.8rem;border-bottom:1px dashed var(--border);">' +
                        '<span style="font-family:monospace;">도장 ' + _pwEsc(l.paintLot || '-') + ' / 사출 ' + _pwEsc(l.lotNo || '-') +
                        (l.color ? ' <span style="font-family:var(--font-family-base);color:var(--text-muted);">· ' + _pwEsc(l.color) + '</span>' : '') +
                        '</span>' +
                        '<span style="font-weight:700;">' + UIUtils.formatNumber(l.balance) + ' EA</span>' +
                        '</div>';
                }).join('')
                : '<div style="font-size:0.8rem;color:var(--text-muted);">현재 재공품 잔량이 없습니다.</div>';
            return '<div style="margin-top:12px;padding-top:12px;border-top:1px dashed rgba(220,38,38,0.3);">' +
                '<div style="font-size:0.82rem;font-weight:700;color:#7c2d12;margin-bottom:6px;">' +
                '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">bolt</span>' +
                '레이져 후 재공품 — 별도 반납 불필요' +
                '</div>' +
                '<div style="font-size:0.76rem;color:var(--text-secondary);margin-bottom:8px;">' +
                '이 제품은 사출창고를 거치지 않고 <strong>레이져 후 재공품</strong>에서 바로 LOT을 끌어 씁니다. ' +
                '투입수량만큼만 LOT에서 차감되므로 못 쓴 나머지는 <strong>자동으로 재공품 잔량에 그대로 남습니다</strong> — 반납 조작이 필요 없습니다.' +
                '</div>' +
                '<div style="font-size:0.76rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">현재 재공품 LOT 잔량 (도장 LOT / 사출 LOT 출처)</div>' +
                '<div style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">' + wipRowsHtml + '</div>' +
                '</div>';
        }
        return '<div id="pwSiteReturnSection" style="margin-top:12px;padding-top:12px;border-top:1px dashed rgba(220,38,38,0.3);">' +
            '<div style="font-size:0.82rem;font-weight:700;color:#7c2d12;margin-bottom:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">undo</span>' +
            '남은 사출 소재 — 사출창고로 반납' +
            '</div>' +
            '<div id="pwSiteReturnLotRows" style="font-size:0.82rem;color:var(--text-muted);">위 사출 LOT 목록에서 LOT을 선택하면 이 작업 기준 잔량이 표시됩니다.</div>' +
            '<button type="button" class="btn btn-sm btn-outline" style="margin-top:8px;" onclick="PaintingWorkModule.processSiteReturn()">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">undo</span> 반납 처리' +
            '</button>' +
            '<div id="pwSiteReturnStatus" style="margin-top:8px;font-size:0.8rem;"></div>' +
            '</div>';
    }

    /** 잔여 자재 반납 섹션의 LOT별 잔량+반납수량 입력 행을 (재)렌더.
     *  반납 후보를 별도 "배치 기준일" 풀 조회로 다시 계산하지 않고, 화면에 이미 보이는
     *  값에서 그대로 뽑는다 — 훨씬 단순하고, 위에 보이는 잔량/투입수량과 항상 일치한다.
     *  (a) ②투입 목록의 각 행: 선택한 LOT의 잔량(data-balance) − 이 행에 입력한 수량 = 남는 만큼
     *  (b) ②투입 목록에 아예 추가하지 않은, 이 도장작업일에 현장입고된 다른 LOT 전량
     *      (①번 미반영 경고 박스와 같은 계산을 재사용, 행으로 이미 잡힌 LOT은 제외해 중복 방지) */
    function _renderSiteReturnRows() {
        var wrap = document.getElementById('pwSiteReturnLotRows');
        if (!wrap) return;
        var lotContainer = document.getElementById('pwLotRows');
        if (!lotContainer) return;
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var carModel = ((document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '').trim();
        if (!injPartName || !carModel) {
            wrap.innerHTML = '<span style="color:var(--text-muted);">해당 사출명을 선택하면 현재 도장현장 잔량이 표시됩니다.</span>';
            return;
        }

        // 이번 도장작업일 입고 − 투입 − 반납 만 반납 후보. 드롭다운 잔량(역대 누적)을
        // 그대로 빼면 지난 도장일 LOT까지 반납 가능 수량으로 잡힌다.
        var productPart = ((document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '').trim();
        var workColor = ((document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '').trim();
        var workDate = (document.getElementById('addPwDateHidden') || {}).value || '';
        if (!workDate && _workViewId) {
            var savedWork = Storage.getById(STORE, _workViewId);
            if (savedWork) workDate = savedWork.date || '';
        }
        if (!workDate) workDate = _currentDate || '';

        var liveLots = [];
        var colorByLot = {};
        lotContainer.querySelectorAll('.pw-lot-row').forEach(function (row) {
            var sel = row.querySelector('.pw-lot-sel');
            var qtyInput = row.querySelector('.pw-lot-qty');
            if (!sel || !qtyInput) return;
            var opt = sel.options[sel.selectedIndex];
            var lotNo = opt ? opt.value : '';
            if (!lotNo) return;
            liveLots.push({ lotNo: lotNo, qty: Number(qtyInput.value) || 0 });
            var rowColor = opt ? (opt.getAttribute('data-color') || '') : '';
            if (rowColor) colorByLot[lotNo] = rowColor;
        });

        var maps = _computeSiteInboundLotMaps({
            line: _currentLine,
            carModel: carModel,
            partName: productPart || injPartName,
            color: workColor,
            date: workDate,
            lots: liveLots
        });
        var candidates = [];
        if (maps.ok) {
            Object.keys(maps.receivedQtyByLot || {}).forEach(function (lotNo) {
                var leftover = (Number(maps.receivedQtyByLot[lotNo]) || 0)
                    - (Number(maps.usedQtyByLot[lotNo]) || 0)
                    - (Number((maps.returnedQtyByLot || {})[lotNo]) || 0);
                if (leftover > 0.001) {
                    candidates.push({ lotNo: lotNo, color: colorByLot[lotNo] || '', leftover: leftover });
                }
            });
        }

        if (!candidates.length) {
            wrap.innerHTML = '<span style="color:var(--text-muted);">현재 반납할 자재가 없습니다.</span>';
            return;
        }
        var headerRow = '<div style="display:grid;grid-template-columns:1.8fr 1fr 1fr 1fr;gap:8px;font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;padding:0 2px;">' +
            '<div>사출명 / 컬러</div><div>LOT</div><div style="text-align:right;">반납 가능 수량</div><div style="text-align:right;">반납 수량</div></div>';
        var rows = candidates.map(function (l) {
            l.partName = injPartName;
            return '<div class="pw-return-lot-row" data-lot="' + _pwEsc(l.lotNo) + '" data-max="' + l.leftover + '"' +
                ' style="display:grid;grid-template-columns:1.8fr 1fr 1fr 1fr;gap:8px;align-items:center;margin-bottom:5px;">' +
                '<div style="font-size:0.8rem;">' + _pwEsc(l.partName || '-') + (l.color ? ' <span style="color:var(--text-muted);">(' + _pwEsc(l.color) + ')</span>' : '') + '</div>' +
                '<div style="font-family:monospace;font-size:0.82rem;">' + _pwEsc(l.lotNo) + '</div>' +
                '<div style="text-align:right;font-weight:600;">' + UIUtils.formatNumber(l.leftover) + '</div>' +
                '<input type="number" class="form-input pw-return-qty-input" min="0" max="' + l.leftover + '" value="0"' +
                ' style="text-align:right;padding:4px 8px;font-size:0.82rem;">' +
                '</div>';
        }).join('');
        wrap.innerHTML = headerRow + rows;
    }

    /** 반납 처리 실행 — 사유(계획 미달 사유 섹션 값 재사용)와 LOT별 반납수량으로 반납 기록 생성 */
    async function processSiteReturn() {
        var statusEl = document.getElementById('pwSiteReturnStatus');
        var setStatus = function (html, color) {
            if (statusEl) statusEl.innerHTML = '<span style="color:' + (color || 'var(--text-secondary)') + ';">' + html + '</span>';
        };
        var rows = document.querySelectorAll('#pwSiteReturnLotRows .pw-return-lot-row');
        var lots = [];
        rows.forEach(function (row) {
            var qtyInput = row.querySelector('.pw-return-qty-input');
            var qty = Number((qtyInput || {}).value) || 0;
            var max = Number(row.getAttribute('data-max')) || 0;
            if (qty > max) qty = max;
            if (qty > 0) lots.push({ lotNo: row.getAttribute('data-lot') || '', qty: qty });
        });
        if (!lots.length) {
            UIUtils.toast('반납할 LOT의 수량을 입력해 주세요.', 'warning');
            return;
        }
        var reasonEl = document.getElementById('addPwPlanReason') || document.getElementById('editPwPlanReason');
        var reasonDetailEl = document.getElementById('addPwPlanReasonDetail') || document.getElementById('editPwPlanReasonDetail');
        var reason = ((reasonEl || {}).value || '').trim();
        var reasonDetail = ((reasonDetailEl || {}).value || '').trim();
        if (!reason || !reasonDetail) {
            UIUtils.toast('반납 처리 전에 위 계획 미달 사유를 먼저 입력해 주세요.', 'warning');
            if (reasonEl && !reason) reasonEl.focus();
            else if (reasonDetailEl) reasonDetailEl.focus();
            return;
        }
        if (typeof PaintingInputModule === 'undefined' || !PaintingInputModule.createSiteReturn) {
            UIUtils.toast('반납 기능을 불러올 수 없습니다.', 'error');
            return;
        }
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var carModel = ((document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '').trim();
        var totalQty = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        // 사출 창고는 차종+품명+"컬러"까지 별도 품목으로 관리한다 — 컬러를 안 넘기면 반납
        // 입고가 원래 품목(예: CROM)이 아니라 컬러 없는 별도 항목으로 잘못 쌓여, 물류담당자가
        // 「입고 처리」를 눌러도 사용자가 보고 있던 재고 화면엔 반영된 것처럼 안 보인다.
        var injColorForReturn = (_collectLots().find(function (l) { return l.color; }) || {}).color || '';

        try {
            await PaintingInputModule.createSiteReturn({
                line: _currentLine,
                carModel: carModel,
                partName: injPartName,
                color: injColorForReturn,
                lots: lots,
                reason: reason + ' · ' + reasonDetail,
                returnedBy: (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? (AuthModule.getCurrentUser() || {}).displayName || '' : '',
                // _workViewId — 이 반납 섹션이 열려 있는 실적(수정/보기 화면)의 id. 이걸 안 넘기면
                // 반납이 어느 실적 몫인지 refWorkId로 확정되지 않아, 투입 LOT과 다른 LOT을 반납했을 때
                // 유실/반납 열 계산이 LOT 매칭에만 의존하게 되고 어긋나면 '유실'로 잘못 잡힌다.
                workId: _workViewId || undefined
            });
            setStatus('✓ 반납 처리 완료 (' + UIUtils.formatNumber(totalQty) + ' EA) — 사출창고 물류담당자 확인 대기 중', '#16a34a');
            UIUtils.toast('반납 처리되었습니다. 사출창고 물류담당자 확인을 기다려 주세요.', 'success');
            _renderSiteReturnRows();
        } catch (e) {
            console.error('[PaintingWorkModule] 반납 처리 실패:', e);
            setStatus('반납 처리 실패: ' + (e && e.message ? e.message : e), '#dc2626');
        }
    }

    // 투입수량이 계획수량 대비 -5% 초과 미달일 때만 사유 섹션 표시
    function checkPlanQtyDiff() {
        var section = document.getElementById('pwPlanQtyReasonSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var inputQty = Number((inputQtyEl || {}).value) || 0;
        // 투입수량이 계획수량의 95% 미만일 때만 사유 섹션 표시 (5% 초과 미달)
        var threshold = planQty * 0.95;
        var show = inputQty > 0 && inputQty < threshold;
        section.style.display = show ? 'block' : 'none';
        var label = document.getElementById('pwPlanInputQtyLabel');
        if (label) label.textContent = show ? UIUtils.formatNumber(inputQty) : '-';
        if (show) _renderSiteReturnRows();

        // 계획 미달 시: 자동 재계산 안 함 — 실제 완료시간 직접 입력 유도
        var hint = document.getElementById('pwEndTimeHint');
        var endEl = document.getElementById('addPwEndTime') || document.getElementById('editPwEndTime');
        if (hint && endEl) {
            if (show) {
                hint.innerHTML =
                    '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;color:#b45309;">warning</span>' +
                    ' 투입 미달 — 설비고장·품질문제 등 정지 시간 포함 가능.' +
                    ' <strong>실제 완료시간을 직접 확인·수정하세요.</strong>';
                hint.style.display = 'block';
                hint.style.color = '#b45309';
                endEl.style.outline = '2px solid rgba(245,158,11,0.7)';
            } else {
                hint.style.display = 'none';
                endEl.style.outline = '';
            }
        }
    }

    // 초과 수량 비례로 작업 완료시간 재계산 (계획 CT 기준)
    function _recalcEndTimeForOverQty(actualQty, planQty) {
        var planStart = ((document.getElementById('addPwPlanStartHidden') || {}).value) || '';
        var planEnd   = ((document.getElementById('addPwPlanEndHidden')   || {}).value) || '';
        if (!planStart || !planEnd) return;

        var planStartMin = _timeToMin(planStart);
        var planEndMin   = _timeToMin(planEnd);
        var planDuration = planEndMin - planStartMin;  // 계획 총 작업시간(분)
        if (planDuration <= 0 || planQty <= 0) return;

        // 계획 CT(초) = 총시간(초) / 계획수량
        var planCT = (planDuration * 60) / planQty;
        // 예상 소요시간(분) = CT × 실제수량 / 60
        var newDuration = Math.round(planCT * actualQty / 60);

        // 실제 시작 시간 (사용자가 변경했을 수 있으므로 폼에서 읽음)
        var startEl  = document.getElementById('addPwStartTime');
        var startMin = startEl && startEl.value ? _timeToMin(startEl.value) : planStartMin;
        if (isNaN(startMin)) return;

        var newEndMin    = startMin + newDuration;
        var newEndHour   = Math.floor(newEndMin / 60) % 24;
        var newEndMinute = newEndMin % 60;
        var newEndTime   = String(newEndHour).padStart(2, '0') + ':' + String(newEndMinute).padStart(2, '0');

        var endEl = document.getElementById('addPwEndTime');
        if (endEl && endEl.value !== newEndTime) {
            endEl.value = newEndTime;
            calcCT();
        }
    }

    // 투입/산출 수량이 계획수량 초과 시 경고 섹션 표시 + 완료시간 자동 재계산
    function checkOverPlanQty() {
        var section = document.getElementById('pwOverPlanSection');
        if (!section) return;
        var planQty = Number(section.getAttribute('data-plan-qty')) || 0;
        if (planQty <= 0) return;
        var inputQtyEl = document.getElementById('addPwInputQty') || document.getElementById('editPwInputQty');
        var outQtyEl   = document.getElementById('addPwProdQty')  || document.getElementById('editPwProdQty');
        var inputQty = Number((inputQtyEl || {}).value) || 0;
        var outQty   = Number((outQtyEl  || {}).value) || 0;
        var maxQty   = Math.max(inputQty, outQty);
        var overAmt  = maxQty - planQty;
        var show     = maxQty > planQty;
        section.style.display = show ? 'block' : 'none';
        if (show) {
            var msgEl = document.getElementById('pwOverPlanMsg');
            if (msgEl) {
                var which = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                            (inputQty > planQty ? '투입수량' : '산출수량');

                // 재계산된 완료시간 표시용
                var endEl = document.getElementById('addPwEndTime') || document.getElementById('editPwEndTime');
                var recalcNote = '';
                if (endEl) {
                    var planEndVal = ((document.getElementById('addPwPlanEndHidden') || {}).value) || '';
                    if (planEndVal && endEl.value && endEl.value !== planEndVal) {
                        recalcNote = '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                            '<strong>' + endEl.value + '</strong>으로 자동 재계산되었습니다.' +
                            ' (계획 CT 기준, 계획 완료: ' + planEndVal + ')</span>';
                    }
                }
                msgEl.innerHTML =
                    which + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote;
            }
            // 완료시간 자동 재계산
            _recalcEndTimeForOverQty(maxQty, planQty);
            // 재계산 후 msg 업데이트 (endEl.value가 바뀐 뒤)
            if (msgEl) {
                var endEl2 = document.getElementById('addPwEndTime');
                var planEnd2 = ((document.getElementById('addPwPlanEndHidden') || {}).value) || '';
                var which2 = (inputQty > planQty && outQty > planQty) ? '투입·산출 수량' :
                             (inputQty > planQty ? '투입수량' : '산출수량');
                var recalcNote2 = (endEl2 && planEnd2 && endEl2.value !== planEnd2)
                    ? '<br><span style="color:#6b7280;font-size:0.78rem;">▶ 작업 완료시간이 ' +
                      '<strong>' + endEl2.value + '</strong>으로 자동 재계산되었습니다.' +
                      ' (계획 CT 기준, 계획 완료: ' + planEnd2 + ')</span>'
                    : '';
                msgEl.innerHTML =
                    which2 + '이 계획수량 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong> 대비 ' +
                    '<strong style="color:#b45309;">' + UIUtils.formatNumber(overAmt) + ' EA</strong> 초과입니다.' +
                    recalcNote2;
            }
            // 체크 초기화
            var ck = document.getElementById('addPwOverPlanConfirm');
            if (ck) ck.checked = false;
        }
    }

    // ──────────────────────────────────────────────
    // 작업 등록 모달 (lg 크기, 계획 연동)
    // ──────────────────────────────────────────────
    // 실적 입력 가능 역할 (도장라인운영자=paint_line_op, 생산관리자=prod_manager, 관리자=admin)
    var WORK_INPUT_ROLES = ['admin', 'prod_manager', 'paint_line_op'];

    function _checkWorkAuth() {
        var user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        if (!user) {
            UIUtils.toast('로그인 후 실적을 입력할 수 있습니다.', 'warning');
            return false;
        }
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function' &&
            (AuthModule.canWritePage('painting-work-a') ||
             AuthModule.canWritePage('painting-work-b') ||
             AuthModule.canWritePage('painting-work'))) {
            return user;
        }
        UIUtils.toast('도장 작업 입력 권한이 없습니다.', 'warning');
        return false;
    }

    function openAddModal(prefill) {
        var _modalAuthUser = _checkWorkAuth();
        if (!_modalAuthUser) return;
        _suppressSelectedMetaPanel = false;
        var p = prefill || {};
        var carModel = p.carModel || '';
        var partName = p.partName || '';
        var color = p.color || '';
        var planQty = Number(p.planQty) || 0;
        var planId = p.planId || '';
        var planStartTime = p.planStartTime || '';
        var planEndTime = p.planEndTime || '';
        var achievedQty = Number(p.achievedQty) || 0;
        var effectiveLine = p.line || _currentLine;

        // 레이져→현재라인 여부 감지:
        // 제품 공정 순서에서 레이져 공정 바로 다음에 오는 도장 공정이 현재 라인과 일치하면 재공품 LOT 사용
        // 예) 도장-A → 레이져 → 도장-B : 도장-A 실적 입력 시 false, 도장-B 실적 입력 시 true
        // ※ effectiveLine 을 먼저 확정해야 함 (뒤에 두면 var 호이스팅으로 '' → startsWith('') 항상 true)
        var _prods4Laser = Storage.getAll(DB.STORES.PRODUCTS) || [];
        var _prod4Laser = _prods4Laser.find(function(mp) {
            return mp.carModel === carModel && mp.partName === partName;
        });
        var isLaserWipProduct = (function() {
            if (!_prod4Laser) return false;
            var lineLow = String(effectiveLine || '').toLowerCase().replace(/\s+/g, '');
            if (!lineLow) return false;
            var seenLaser = false;
            for (var _pi = 1; _pi <= 4; _pi++) {
                var _pv = String(_prod4Laser['process' + _pi] || '').toLowerCase().replace(/\s+/g, '');
                if (!_pv) break;
                if (_pv.includes('레이') || _pv.includes('laser')) { seenLaser = true; continue; }
                if (seenLaser && _pv.includes('도장')) {
                    // 레이져 다음 도장 공정이 현재 라인과 일치할 때만 true (빈 lineLow / 단순 '도장' 매칭 금지)
                    if (_pv === lineLow) return true;
                    if (lineLow.startsWith(_pv) || (_pv.length > 2 && _pv.startsWith(lineLow))) return true;
                    if (_pv.includes('-b') && lineLow.includes('-b')) return true;
                    if (_pv.includes('-a') && lineLow.includes('-a')) return true;
                    return false;
                }
            }
            return false;
        })();

        // 사출자재 마스터에서 제작품명1/2 + 컬러 매칭 → 사출명 자동 결정
        // 도장 컬러와 사출 소재 컬러가 다를 수 있으므로 컬러 무관 폴백 포함
        var injParts = (!isLaserWipProduct && partName) ? getInjPartNamesForProduct(partName, carModel, color) : [];
        if (!isLaserWipProduct && injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', color);
        if (!isLaserWipProduct && injParts.length === 0 && partName) injParts = getInjPartNamesForProduct(partName, carModel, '');
        if (!isLaserWipProduct && injParts.length === 0 && partName && carModel) injParts = getInjPartNamesForProduct(partName, '', '');
        var autoInjPartName = (!isLaserWipProduct && injParts.length === 1) ? injParts[0].injPartName : '';
        // 마스터에 사출명이 여러 개(1SPOT·3SPOT)면 첫 건을 집어 넣지 않는다.
        // 잘못 고른 사출명이 당일 현장 입고를 통째로 숨긴다.
        if (!isLaserWipProduct && !autoInjPartName && partName) {
            var _resolvedInj = _resolveInjPartNameForWork(carModel, partName, color);
            if (_resolvedInj) {
                if (injParts.length > 1) {
                    var _wantSpot = _partSpotNumber(partName);
                    var _spotHits = injParts.map(function (m) { return m.injPartName; })
                        .filter(function (n) { return !_wantSpot || _partSpotNumber(n) === _wantSpot; });
                    autoInjPartName = _pickInjPartNameFromList(_spotHits, partName);
                } else {
                    autoInjPartName = _resolvedInj;
                }
            }
        }
        var laserInjPartName = '';
        if (isLaserWipProduct && partName) {
            try { laserInjPartName = _resolveInjPartNameForWork(carModel, partName, color) || partName; }
            catch (eLaserInj) { laserInjPartName = partName; }
        }
        var _lotPlanDate = p.planDate || _currentDate;
        var dayInj = [];
        try {
            dayInj = _siteInboundInjParts(effectiveLine, carModel, _lotPlanDate, partName)
                .filter(function (n) { return _injNameAllowed(n, carModel, partName); });
        } catch (eDayInj) { dayInj = []; }
        if (!isLaserWipProduct && !autoInjPartName && dayInj.length === 1) autoInjPartName = dayInj[0];
        else if (!isLaserWipProduct && !autoInjPartName && dayInj.length > 1) {
            autoInjPartName = _pickInjPartNameFromList(dayInj, partName);
        }
        var injPartOptsHtml = isLaserWipProduct ? '' : buildInjPartOptionsHtml(partName, carModel, color, {
            line: effectiveLine,
            date: _lotPlanDate
        });
        // 레이져 다음 도장 라인: 재공품 LOT / 그 외(도장-A 등): 당일 현장 입고 LOT
        var lotsHtml = isLaserWipProduct
            ? buildLaserWipLotOptionsHtml(carModel, partName, { color: color, line: effectiveLine })
            : (autoInjPartName
                ? buildLotOptionsHtmlByInjPart(autoInjPartName, color, carModel, _lotPlanDate)
                : _lotOptionsHtmlFromList(_lotsForPlanPart(carModel, partName, color, _lotPlanDate), '', _lotPlanDate));
        // LOT 추가 버튼 활성화 여부
        var initialLotCount = isLaserWipProduct
            ? getLaserWipLots(carModel, partName, { color: color, line: effectiveLine }).length
            : (autoInjPartName
                ? getInjectionLotsByInjPart(autoInjPartName, color, carModel, _lotPlanDate).length
                : _lotsForPlanPart(carModel, partName, color, _lotPlanDate).length);
        // 선택 가능한 LOT가 하나도 없으면 "선택 불가" 행을 기본으로 깔지 않는다 — 위 ①단계
        // "미반영 +N EA" 버튼으로 추가하거나 사출명을 다시 선택하면 그때 실제 옵션으로 채워진다.
        var initialLotRow = initialLotCount > 0 ? _buildLotRow(lotsHtml, '', '') : '';

        var planQtyFmt = UIUtils.formatNumber(planQty);
        var achFmt = UIUtils.formatNumber(achievedQty);
        var achRate = planQty > 0 ? Math.min(100, Math.round(achievedQty / planQty * 100)) : 0;
        var achColor = achRate >= 100 ? 'var(--accent-green)' :
            achRate >= 70 ? 'var(--accent-blue)' :
            achRate > 0 ? 'var(--accent-orange)' :
            'var(--text-muted)';
        var planTimeLabel = planStartTime ?
            planStartTime + (planEndTime ? ' ~ ' + planEndTime : '') :
            '';

        // ① 배너: 차종/품명(2.2fr) | 컬러(0.7fr) | 계획·달성(1.1fr)
        var bannerHtml =
            '<div style="background:linear-gradient(135deg,rgba(66,133,244,0.09) 0%,rgba(66,133,244,0.03) 100%);' +
            'border:1px solid rgba(66,133,244,0.22);border-radius:10px;padding:14px 18px;margin-bottom:16px;">' +
            '<div style="display:grid;grid-template-columns:2.2fr 0.7fr 1.1fr;gap:16px;margin-bottom:9px;align-items:start;">' +

            // 차종/품명 (넓게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">차종 / 품명</div>' +
            '<div style="font-weight:700;font-size:1.02rem;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            (carModel || '-') + ' <span style="color:var(--text-muted);font-weight:400;">/</span> ' + (partName || '-') + '</div></div>' +

            // 컬러 (좁게)
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">컬러</div>' +
            '<div style="font-weight:600;font-size:0.92rem;">' + (color || '-') + '</div></div>' +

            // 계획수량 + 달성현황
            '<div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">계획수량 / 달성현황</div>' +
            '<div style="font-weight:700;font-size:1.15rem;color:var(--accent-blue);line-height:1.2;">' + planQtyFmt + ' <span style="font-size:0.75rem;font-weight:400;">EA</span></div>' +
            (planId ?
                '<div style="margin-top:5px;">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + achRate + '%;height:100%;background:' + achColor + ';border-radius:3px;"></div></div>' +
                '<span style="color:' + achColor + ';font-weight:700;font-size:0.82rem;min-width:36px;text-align:right;">' + achRate + '%</span></div>' +
                '<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">달성: ' + achFmt + ' EA</div>' +
                '</div>' :
                '') +
            '</div>' +

            '</div>' +
            '<div style="font-size:0.79rem;color:var(--text-secondary);border-top:1px solid rgba(66,133,244,0.15);padding-top:7px;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">event</span>' +
            (p.planDate || _currentDate) + ' &nbsp;·&nbsp; ' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">factory</span>' +
            effectiveLine +
            (planTimeLabel ? ' &nbsp;·&nbsp; <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px;">schedule</span>계획: ' + planTimeLabel : '') +
            (planId ? ' &nbsp;<span style="background:rgba(66,133,244,0.12);color:var(--accent-blue);border-radius:4px;padding:1px 7px;font-size:0.73rem;margin-left:4px;">계획 연동</span>' : '') +
            '</div></div>';

        // ② 수량 행
        var qtyRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입수량 (IN PUT) <span style="color:var(--accent-red)">*</span>' +
            '<span style="color:var(--text-muted);font-size:0.75rem;"> 계획: ' + planQtyFmt + '</span></label>' +
            '<input type="number" class="form-input" id="addPwInputQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkPlanQtyDiff(); PaintingWorkModule.checkOverPlanQty(); PaintingWorkModule._autoFillLotQtys();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">산출 수량 (OUT PUT) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwProdQty" min="0" placeholder="0"' +
            ' oninput="PaintingWorkModule.calcCT(); PaintingWorkModule.checkQtyDiff(); PaintingWorkModule.checkOverPlanQty(); PaintingWorkModule._updateLotSummary();"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">투입인원 (명) <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="number" class="form-input" id="addPwWorkers" min="0" placeholder="0"' +
            ' style="font-size:1.05rem;font-weight:600;text-align:right;"></div>' +
            '</div>';

        // ③-0 기본 CT 계산 (계획 시간·수량 기준)
        var baseCTSec = 0;
        if (planStartTime && planEndTime && planQty > 0) {
            var _bsh = parseInt(planStartTime.split(':')[0]);
            var _bsm = parseInt(planStartTime.split(':')[1]);
            var _beh = parseInt(planEndTime.split(':')[0]);
            var _bem = parseInt(planEndTime.split(':')[1]);
            var _planMin = (_beh * 60 + _bem) - (_bsh * 60 + _bsm);
            if (_planMin > 0) baseCTSec = (_planMin * 60) / planQty;
        }
        var baseCTLabel = baseCTSec > 0
            ? '<span style="color:var(--accent-blue);font-weight:700;">' + baseCTSec.toFixed(1) + '초/EA</span>'
            : '<span style="color:var(--text-muted);">-</span>';

        // ③-1 CVT 조회 (제품 마스터 → 실제 작업 라인과 일치하는 도장 공정 슬롯)
        var _masterProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
        var _masterProd = _masterProds.find(function(mp) {
            return mp.carModel === carModel && mp.partName === partName;
        });
        var _planCvt = _getProductCvtForLine(_masterProd, effectiveLine);
        var cvtInfoLabel = _planCvt > 0
            ? '<span style="color:var(--accent-green);font-weight:700;">' + _planCvt + ' EA</span>'
            : '<span style="color:var(--text-muted);">-</span>';

        // ③ 시간 행 — 계획시간 자동 반영, 힌트 표시
        var timeRowHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:12px;margin-bottom:10px;' +
            'background:var(--bg-secondary);border-radius:8px;padding:12px;">' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">play_arrow</span> ' +
            '작업 시작시간</label>' +
            '<input type="time" class="form-input" id="addPwStartTime"' +
            ' value="' + planStartTime + '"' +
            ' oninput="PaintingWorkModule.calcCT();">' +
            (planStartTime ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planStartTime + '</div>' : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">stop</span> ' +
            '작업 완료시간</label>' +
            '<input type="time" class="form-input" id="addPwEndTime"' +
            ' value="' + planEndTime + '"' +
            ' oninput="PaintingWorkModule.calcCT();">' +
            (planEndTime
                ? '<div style="font-size:0.72rem;color:var(--accent-blue);margin-top:3px;">계획: ' + planEndTime + '</div>'
                : '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">선택 입력</div>') +
            '<div id="pwEndTimeHint" style="display:none;font-size:0.71rem;margin-top:4px;' +
            'color:#b45309;background:rgba(245,158,11,0.09);border:1px solid rgba(245,158,11,0.4);' +
            'border-radius:5px;padding:3px 8px;line-height:1.4;"></div>' +
            '</div>' +

            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">timer</span> ' +
            '작업 C.T (자동계산)</label>' +
            '<div id="pwCtInfo" style="height:36px;display:flex;align-items:center;">' +
            '<span style="color:var(--text-muted);font-size:0.8rem;">완료수량·시간 입력 시 자동계산</span></div>' +
            '<div style="display:flex;gap:14px;margin-top:5px;flex-wrap:wrap;">' +
            '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">' +
            '<span style="font-weight:600;color:var(--text-secondary);">기본 CT</span>&nbsp;' + baseCTLabel +
            '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">' +
            '<span style="font-weight:600;color:var(--text-secondary);">CVT</span>&nbsp;' + cvtInfoLabel +
            '</div>' +
            '</div>' +
            '</div>' +

            '</div>';

        // ④ 계획 시간 변경 사유 섹션 (초기 hidden, 시간 변경 시 표시)
        // ④ 계획 시간 변경 사유 섹션 — 삭제 (투입수량 미달/차이 섹션으로 통합)
        var reasonHtml = '';

        // ⑤ LOT 섹션 (레이져→도장-B 제품은 재공품 LOT, 일반 제품은 당일 현장 입고 LOT)
        var _lotSectionIcon = isLaserWipProduct ? 'bolt' : 'inventory_2';
        var _lotSectionTitle = isLaserWipProduct ? '재공품 LOT' : '사출 LOT';
        var _lotSectionDesc  = isLaserWipProduct
            ? '(레이져 후 재공품 + 현장입고 재사용 자재 · 재사용 자재는 레이져 생략)'
            : '(당일 도장 현장 입고 잔량 · 복수 LOT 입력 가능)';
        var _lotColHeader = isLaserWipProduct ? '재공·재사용 자재 LOT 선택' : '현장 투입 LOT 선택';
        var _lotAddBtnDisabled = initialLotCount <= 1
            ? ' disabled title="' + (isLaserWipProduct ? '재공품 LOT가 1개 이하여서 추가할 수 없습니다' : '현장 투입 LOT가 1개 이하여서 추가할 수 없습니다') + '"'
            : '';

        // 이 계획일에 창고→현장으로 입고됐지만 아직 어느 LOT 행에도 안 잡힌 사출자재가 있으면
        // 여기서 바로 보여준다. 이게 없으면, 예전에 확인 처리해 둔 오래된 잔여 LOT이 FIFO상
        // 먼저 걸려서 자동으로 채워지고, 정작 오늘 들어온(아직 미입고 처리 중인) 새 LOT은
        // 화면에 안 보인 채 조용히 묻혀버리는 사고로 이어진다.
        var unmatchedInboundHtml = (carModel && partName)
            ? (_lotFlowStepHeaderHtml('1', '#2563eb', '창고 → 도장현장 입고', '(사출 창고·재사용 자재에서 이 라인으로 실제 입고된 LOT·수량)') +
               _buildUnmatchedInboundWarningHtml({
                   carModel: carModel,
                   partName: isLaserWipProduct ? (laserInjPartName || partName) : partName,
                   injPartName: isLaserWipProduct ? (laserInjPartName || '') : autoInjPartName,
                   color: color,
                   line: effectiveLine,
                   date: (p.planDate || _currentDate)
               }))
            : '';

        // 위 배너는 "이미 입고 처리(현장 확인) 끝난" 자재만 본다 — 사출창고에서 방금 출고됐지만
        // 아직 「입고 처리」 버튼을 안 눌러 확인 대기 중인 자재는 그 목록에 안 잡힌다. 이걸 놓치면
        // 방금 도착한 새 LOT은 아예 선택 목록에 안 뜨고, 예전에 확인해 둔 옛 잔여 LOT만 조용히
        // 선택돼 버리는 사고가 난다 — 따로 확인해서 "먼저 입고 처리하라"고 안내한다.
        var pendingShipmentHtml = '';
        if (carModel && typeof PaintingInputModule !== 'undefined'
            && typeof PaintingInputModule.listPendingWarehouseShipments === 'function') {
            var _pendingShips = PaintingInputModule.listPendingWarehouseShipments(effectiveLine, {
                carModel: carModel,
                partName: (isLaserWipProduct ? laserInjPartName : autoInjPartName) || undefined,
                date: (p.planDate || _currentDate)
            });
            if (_pendingShips.length) {
                var _pendingTotal = _pendingShips.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
                pendingShipmentHtml = '<div style="margin-bottom:10px;padding:10px 12px;border-radius:8px;' +
                    'border:1px solid rgba(220,38,38,.4);background:rgba(220,38,38,.07);font-size:0.82rem;line-height:1.5;">' +
                    '<strong style="color:#dc2626;">' +
                    '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:3px;">error</span>' +
                    '아직 입고 처리 안 된 사출자재가 ' + _pendingShips.length + '건 · ' + UIUtils.formatNumber(_pendingTotal) + ' EA 있습니다.</strong>' +
                    '<div style="margin-top:4px;color:var(--text-secondary);">아래 LOT 목록에는 이미 현장 입고 확인된 자재만 뜹니다 — ' +
                    '방금 온 자재를 쓰려면 <strong>「도장 현장 사출 입고」</strong> 화면에서 먼저 「입고 처리」를 눌러 확인하세요. ' +
                    '그 전까지는 예전 잔여 LOT만 자동 선택됩니다.</div>' +
                    '</div>';
            }
        }

        // 리워크 사용 — 체크하면 리워크 재공 창고가 아니라 도장현장 입고에서
        // 같은 차종·사출명·컬러 LOT을 고른다.
        var reworkUseHtml = '';
        if (carModel && partName) {
            var _rwInjName = (isLaserWipProduct ? (laserInjPartName || partName) : (autoInjPartName || partName)) || '';
            var _siteRwQty = 0;
            try {
                if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getLotsByInjPart) {
                    var _siteLots = PaintingInputModule.getLotsByInjPart(effectiveLine, _rwInjName, color, carModel) || [];
                    _siteRwQty = _siteLots.reduce(function (s, l) { return s + (Number(l.balance) || 0); }, 0);
                }
            } catch (eRwSite) { _siteRwQty = 0; }
            reworkUseHtml =
                '<div id="pwReworkUseBox" style="margin-bottom:12px;padding:12px 14px;border-radius:8px;' +
                'border:1px solid rgba(124,58,237,.3);background:rgba(124,58,237,.05);">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.86rem;font-weight:700;color:#7c3aed;cursor:pointer;">' +
                '<input type="checkbox" id="pwUseReworkMaterial" onchange="PaintingWorkModule.toggleReworkUseBox(this)" style="width:16px;height:16px;accent-color:#7c3aed;">' +
                '<span class="material-symbols-outlined" style="font-size:17px;">autorenew</span>' +
                '재사용 자재 사용' +
                '</label>' +
                '<div id="pwReworkUseExtras" style="display:none;margin-top:8px;">' +
                '<button type="button" class="btn btn-sm" style="background:#7c3aed;color:#fff;border:none;padding:4px 10px;white-space:nowrap;" ' +
                'onclick="PaintingWorkModule.openPastInboundPicker()">' +
                '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">history</span> 도장현장 입고에서 선택</button>' +
                '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;line-height:1.45;">' +
                '같은 <strong>차종 · 사출명 · 컬러</strong>의 도장현장 입고 LOT만 고릅니다. 재사용 자재 창고에서 바로 빼지 않습니다.' +
                (_siteRwQty > 0
                    ? '<br>현재 현장 잔량 <strong style="color:#7c3aed;">' + UIUtils.formatNumber(_siteRwQty) + ' EA</strong>' +
                      (color ? ' (' + _pwEsc(color) + ')' : '')
                    : '') +
                '</div>' +
                '</div>' +
                '</div>';
        }

        var lotSectionHtml =
            pendingShipmentHtml +
            (unmatchedInboundHtml ? '<div style="margin-bottom:12px;">' + unmatchedInboundHtml + '</div>' : '') +
            reworkUseHtml +
            '<div class="form-group" style="margin-bottom:14px;">' +
            (unmatchedInboundHtml ? _lotFlowStepHeaderHtml('2', '#7c3aed', '도장 투입', '(이 작업에 실제 투입할 LOT·수량)') : '') +
            '<label class="form-label" style="font-size:0.84rem;display:flex;align-items:center;gap:6px;">' +
            '<span class="material-symbols-outlined" style="font-size:16px;">' + _lotSectionIcon + '</span>' +
            _lotSectionTitle +
            '<span style="background:var(--accent-blue);color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:10px;font-weight:600;">선입선출</span>' +
            '<span style="color:var(--text-muted);font-size:0.74rem;">' + _lotSectionDesc + '</span></label>' +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            // 사출명 선택 행 (레이져 제품은 숨김)
            (isLaserWipProduct
                ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--border);font-size:0.82rem;color:var(--accent-blue);">' +
                  '<span class="material-symbols-outlined" style="font-size:16px;">bolt</span>' +
                  '<strong>레이져 후 재공품</strong>과 <strong>현장입고 재사용 자재</strong>를 함께 선택할 수 있습니다. 재사용 자재는 레이져를 거치지 않아도 됩니다.' +
                  '<input type="hidden" id="pwInjPartSelect" value="' + _pwEsc(laserInjPartName || '') + '">' +
                  '</div>'
                : '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:9px;' +
                  'border-bottom:1px solid var(--border);">' +
                  '<label style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;font-weight:600;">' +
                  '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">conveyor_belt</span>' +
                  '사출명</label>' +
                  '<select id="pwInjPartSelect" class="form-select" style="font-size:0.84rem;flex:1;"' +
                  ' onchange="PaintingWorkModule.onInjPartSelect(this)">' +
                  injPartOptsHtml + '</select>' +
                  '</div>') +
            // LOT 행 헤더
            '<div style="display:grid;grid-template-columns:56px 3.2fr 1.1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div style="text-align:center;">현장입고</div><div>' + _lotColHeader + '</div>' +
            '<div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRow + '</div>' +
            '<button id="pwAddLotBtn" class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;"' + _lotAddBtnDisabled + '>' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>';

        // ⑥-A 계획수량 초과 경고 섹션 (투입/산출 > 계획수량 시 표시)
        var overPlanHtml = planQty > 0
            ? '<div id="pwOverPlanSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.55);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.84rem;color:#b45309;font-weight:700;margin-bottom:8px;">' +
              '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">warning</span>' +
              '⚠ 계획수량 초과 경고' +
              '</div>' +
              '<div id="pwOverPlanMsg" style="font-size:0.83rem;color:#92400e;margin-bottom:12px;line-height:1.55;"></div>' +
              '<div style="background:rgba(245,158,11,0.13);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<input type="checkbox" id="addPwOverPlanConfirm" style="width:18px;height:18px;accent-color:#d97706;flex-shrink:0;">' +
              '<label for="addPwOverPlanConfirm" style="font-size:0.83rem;color:#92400e;cursor:pointer;font-weight:600;line-height:1.4;">' +
              '계획수량 초과 내용을 확인하였으며, 담당 관리자에게 보고하였습니다' +
              '</label>' +
              '</div>' +
              '</div>'
            : '';

        // ⑥ 계획 미달 사유 섹션 (산출수량 < 계획수량일 때 표시)
        var planQtyReasonHtml = planQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + planQty + '"' +
              ' style="display:none;margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);' +
              'border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">trending_down</span>' +
              '투입수량 (<strong id="pwPlanInputQtyLabel">-</strong> EA) 이 계획수량(<strong>' + planQtyFmt + ' EA</strong>) 대비 5% 이상 미달 — 사유를 입력해 주세요' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
              '<select class="form-select" id="addPwPlanReason" style="font-size:0.85rem;">' +
              '<option value="">-- 선택 --</option>' +
              '<option value="계획변경">계획변경</option>' +
              '<option value="순간정지(공정문제)">순간정지(공정문제)</option>' +
              '<option value="설비 속도저하">설비 속도저하</option>' +
              '<option value="설비고장">설비고장</option>' +
              '<option value="품질문제">품질문제</option>' +
              '<option value="자재결품">자재결품</option>' +
              '</select></div>' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
              '<input type="text" class="form-input" id="addPwPlanReasonDetail"' +
              ' placeholder="구체적인 내용을 입력하세요"' +
              ' style="font-size:0.85rem;"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
              '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
              '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 계획 미달 내용을 작업 관리자에게 즉시 보고해 주세요.' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
              '<input type="checkbox" id="addPwPlanManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;">' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
              '</label>' +
              '</div>' +
              _buildNotifySelectorHtml('plan', '메시지를 받을 담당자를 여러 명 선택하세요. 역할별로 묶어서 표시합니다.') +
              _siteReturnSectionHtml(isLaserWipProduct, carModel, partName) +
              '</div>'
            : '';

        // ⑦ 비고
        var noteHtml =
            // 투입/산출 차이 사유 섹션 (1% 이상 차이 시 표시)
            '<div id="qtyDiffWarning" style="display:none;margin-bottom:12px;' +
            'background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">warning</span>' +
            '투입수량(<strong id="pwDiffInQty">-</strong> EA) ≠ 산출수량(<strong id="pwDiffOutQty">-</strong> EA) — 차이 사유를 입력해 주세요.' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select" id="addPwQtyDiffReason" style="font-size:0.85rem;">' +
            '<option value="">-- 선택 --</option>' +
            '<option value="자재 불량">자재 불량</option>' +
            '<option value="설비 고장">설비 고장</option>' +
            '<option value="생산조건 NG">생산조건 NG</option>' +
            '<option value="작업 불량">작업 불량</option>' +
            '<option value="기타">기타</option>' +
            '</select></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="addPwQtyDiffDetail"' +
            ' placeholder="구체적인 내용을 입력하세요" style="font-size:0.85rem;"></div>' +
            '</div>' +
            '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
            '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
            '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 투입/산출 수량 차이 내용을 작업 관리자에게 즉시 보고해 주세요.' +
            '</div>' +
             '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
             '<input type="checkbox" id="addPwQtyDiffManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;">' +
             '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
             '</label>' +
             '</div>' +
             _buildNotifySelectorHtml('qtyDiff', '투입/산출 차이 통보를 받을 담당자를 여러 명 선택하세요.') +
             '</div>' +
             // 비고
            '<div class="form-group" style="margin-bottom:8px;">' +
            '<label class="form-label" style="font-size:0.84rem;">비고 <span id="addPwNoteRequired" style="display:none;color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="addPwNote" placeholder="특이사항 / 변동 사항"></div>' +
            // 작성자
            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.84rem;">작성자</label>' +
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">person</span>' +
            '<span style="font-weight:600;color:var(--text-primary);">' + (function() { var roleMap = (AuthModule.ROLES || []).reduce(function(m,r){m[r.key]=r;return m;},{}); var r = roleMap[_modalAuthUser.role]; return r ? r.label : (_modalAuthUser.role || _modalAuthUser.name || ''); })() + '</span>' +
            '</div>' +
            '</div>';

        // ⑦ 숨김 필드
        var hiddenHtml =
            '<input type="hidden" id="addPwCarModelHidden"   value="' + carModel + '">' +
            '<input type="hidden" id="addPwPartNameHidden"   value="' + partName + '">' +
            '<input type="hidden" id="addPwColorHidden"      value="' + color + '">' +
            '<input type="hidden" id="addPwDateHidden"       value="' + (p.planDate || _currentDate) + '">' +
            '<input type="hidden" id="addPwLineHidden"       value="' + effectiveLine + '">' +
            '<input type="hidden" id="addPwPlanId"           value="' + planId + '">' +
            '<input type="hidden" id="addPwPlanStartHidden"  value="' + planStartTime + '">' +
            '<input type="hidden" id="addPwPlanEndHidden"    value="' + planEndTime + '">' +
            '<input type="hidden" id="addPwIsLaserWip"       value="' + (isLaserWipProduct ? '1' : '0') + '">';

        UIUtils.showModal('도장 작업 실적 등록',
            bannerHtml + hiddenHtml + qtyRowHtml + timeRowHtml + reasonHtml + lotSectionHtml + overPlanHtml + planQtyReasonHtml + noteHtml,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveNew()">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 등록</button>',
            'lg');

        // 계획 CT 자동계산 + 투입수량 있으면 FIFO LOT 자동 배분
        setTimeout(function() {
            if (planStartTime && planEndTime) PaintingWorkModule.calcCT();
            var remainQty = Math.max(0, planQty - achievedQty);
            var qtyEl = document.getElementById('addPwInputQty');
            if (qtyEl && remainQty > 0 && !(Number(qtyEl.value) > 0)) {
                qtyEl.value = remainQty;
                if (typeof PaintingWorkModule.checkQtyDiff === 'function') PaintingWorkModule.checkQtyDiff();
                if (typeof PaintingWorkModule.checkPlanQtyDiff === 'function') PaintingWorkModule.checkPlanQtyDiff();
            }
            _execAutoFill();
        }, 80);
    }

    // 계획에서 실적 등록 모달 열기
    function openAddModalFromPlan(planId) {
        var plan = Storage.getById(PLAN_STORE, planId);
        if (!plan) {
            UIUtils.toast('계획 정보를 찾을 수 없습니다.', 'warning');
            return;
        }

        // 현장 사출 입고 확인 없이는 실적 입력 진행 불가
        if (!_hasConfirmedSiteInboundForPlan(plan, plan.date || UIUtils.today())) {
            UIUtils.toast('현장 사출 입고 확인이 없습니다. 「현장 사출 입고」에서 먼저 입고 처리한 뒤 실적을 입력하세요.', 'warning');
            return;
        }

        // ⚠️ 이미 이 계획에 실적이 있는지 확인 (중복 등록 방지)
        var existingWorks = (Storage.getAll(STORE) || []).filter(function(w) {
            return _workFulfillsPlan(w, planId);
        });
        if (existingWorks.length > 0) {
            UIUtils.toast('이 계획에는 이미 실적이 등록되어 있습니다.', 'warning');
            return;
        }

        // 이미 달성된 수량 계산 (같은 날짜·라인·품목)
        var allWorks = Storage.getAll(STORE) || [];
        var achievedQty = allWorks.filter(function(w) {
            return w.date === plan.date && w.line === plan.line &&
                w.carModel === plan.carModel && w.partName === plan.partName &&
                w.color === plan.color;
        }).reduce(function(s, w) {
            return s + _workQtys(w).productionQty;
        }, 0);

        openAddModal({
            line: plan.line || '',
            carModel: plan.carModel || '',
            partName: plan.partName || '',
            color: plan.color || '',
            planQty: plan.planQty || 0,
            planId: plan.id,
            planDate: plan.date || '',
            planStartTime: plan.startTime || '',
            planEndTime: plan.endTime || '',
            achievedQty: achievedQty
        });
    }

    /**
     * 외부(사출 창고 예약 뱃지 등)에서 해당 계획의 도장 실적입력 화면으로 이동한다.
     * 라인에 맞는 도장-A/B 작업 페이지로 이동 → 계획일 선택 → 실적입력 모달 오픈.
     */
    function goToWorkFromPlan(planId) {
        const plan = Storage.getById(PLAN_STORE, planId);
        if (!plan) {
            UIUtils.toast('계획 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        const pageId = _pageIdForLine(plan.line);
        const planDate = plan.date || '';
        if (typeof Router !== 'undefined') {
            Router.navigate(pageId);
        }
        setTimeout(function() {
            if (planDate) {
                const dateEl = document.getElementById('pwDate');
                if (dateEl) {
                    dateEl.value = planDate;
                    _currentDate = planDate;
                }
                if (typeof onDateChange === 'function') onDateChange();
                else loadAll();
            }
            setTimeout(function() {
                openAddModalFromPlan(planId);
            }, 200);
        }, 350);
    }

    // 신규 저장
    async function saveNew() {
        var _authUser = _checkWorkAuth();
        if (!_authUser) return;

        // 투입수량 / 산출수량 / 투입인원 필수 검증
        var _inputQtyEl  = document.getElementById('addPwInputQty');
        var _prodQtyEl   = document.getElementById('addPwProdQty');
        var _workersEl   = document.getElementById('addPwWorkers');
        var _inputQtyV   = _toQty((_inputQtyEl  || {}).value);
        var _prodQtyV    = _toQty((_prodQtyEl   || {}).value);
        var _workersV    = Number((_workersEl   || {}).value) || 0;
        if (!_inputQtyV) {
            UIUtils.toast('투입수량(IN PUT)을 입력해 주세요.', 'warning');
            if (_inputQtyEl) _inputQtyEl.focus();
            return;
        }
        if (!_prodQtyV) {
            UIUtils.toast('산출수량(OUT PUT)을 입력해 주세요.', 'warning');
            if (_prodQtyEl) _prodQtyEl.focus();
            return;
        }
        if (!_workersV) {
            UIUtils.toast('투입인원(명)을 입력해 주세요.', 'warning');
            if (_workersEl) _workersEl.focus();
            return;
        }

        var lots = _collectLots();

        // 사출 LOT 필수 검증
        if (lots.length === 0) {
            UIUtils.toast('사출 LOT를 선택해 주세요.', 'warning');
            var firstLotNo = document.querySelector('#pwLotRows .pw-lot-sel');
            if (firstLotNo) firstLotNo.focus();
            return;
        }
        var hasInvalidLot = lots.some(function(l) { return !l.qty || l.qty <= 0; });
        if (hasInvalidLot) {
            UIUtils.toast('사출 LOT 수량을 입력해 주세요.', 'warning');
            var firstLotQty = document.querySelector('#pwLotRows .pw-lot-qty');
            if (firstLotQty) firstLotQty.focus();
            return;
        }

        // 현장 입고 확인 안 된 LOT 차단 (관리자만 예외 허용)
        var _lotCarModel = (document.getElementById('addPwCarModelHidden') || {}).value || '';
        var _lotPartName = (document.getElementById('addPwPartNameHidden') || {}).value || '';
        var _lotInjPartName = (document.getElementById('pwInjPartSelect') || {}).value || '';
        var _lotIsWip = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        var _lotsOk = await _confirmUnverifiedLots(lots, _lotCarModel, _lotInjPartName, _lotIsWip, _lotPartName);
        if (!_lotsOk) return;

        // 선입선출 위반 시 사유 필수 검증
        var fifoViolatedRows = [];
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function(row) {
            var warnEl = row.querySelector('.pw-fifo-warn');
            if (warnEl && warnEl.style.display !== 'none') {
                var reasonSel = row.querySelector('.pw-fifo-reason');
                if (!reasonSel || !reasonSel.value) fifoViolatedRows.push(reasonSel);
            }
        });
        if (fifoViolatedRows.length > 0) {
            UIUtils.toast('선입선출 미준수 사유를 선택해 주세요.', 'warning');
            if (fifoViolatedRows[0]) fifoViolatedRows[0].focus();
            return;
        }

        var lotNo = lots[0].lotNo;
        var startTime = (document.getElementById('addPwStartTime') || {}).value || '';
        var endTime = (document.getElementById('addPwEndTime') || {}).value || '';
        var prodQty = _toQty((document.getElementById('addPwProdQty') || {}).value);
        // ★ LOT 합계는 투입수량(IN PUT)과 일치해야 함
        var _saveInputQty = _toQty((document.getElementById('addPwInputQty') || {}).value);

        // ── 사출 LOT 합계 ≠ 투입수량 → 저장 차단 ──
        var _lotTotalForSave = lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (_lotTotalForSave !== _saveInputQty) {
            UIUtils.toast(
                '사출 LOT 수량 합계(' + UIUtils.formatNumber(_lotTotalForSave) + ' EA)와 투입수량(' + UIUtils.formatNumber(_saveInputQty) + ' EA)이 일치하지 않습니다.',
                'warning'
            );
            var lotSection = document.getElementById('pwLotRows');
            if (lotSection) lotSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // ── 완료시간 확인 팝업 ──
        var _planEndVal   = (document.getElementById('addPwPlanEndHidden')   || {}).value || '';
        var _planStartVal = (document.getElementById('addPwPlanStartHidden') || {}).value || '';
        if (_planEndVal && endTime && _planStartVal && startTime) {
            var _planEndMin   = _timeToMin(_planEndVal);
            var _actualEndMin = _timeToMin(endTime);
            var _timeDiffMin  = _actualEndMin - _planEndMin;   // + 초과 / - 미달

            // 계획 미달 여부 확인
            var _planQtySection = document.getElementById('pwPlanQtyReasonSection');
            var _planQtyBase = _planQtySection ? (Number(_planQtySection.getAttribute('data-plan-qty')) || 0) : 0;
            var _isPlanShortfall = _planQtyBase > 0 && _saveInputQty > 0 && _saveInputQty < _planQtyBase;

            if (_isPlanShortfall && Math.abs(_timeDiffMin) <= 5) {
                // 계획 미달인데 완료시간이 계획 그대로 — 직접 입력 유도 팝업
                var _shortMsg =
                    '⚠  완료시간을 직접 확인해 주세요.\n\n' +
                    '  투입수량이 계획보다 부족합니다.\n' +
                    '  설비 고장 · 품질 문제 등으로 라인이 정지된 경우\n' +
                    '  완료시간이 계획(' + _planEndVal + ')과 달라집니다.\n\n' +
                    '  현재 입력된 완료시간 : ' + endTime + '\n\n' +
                    '[확인] 이 시간으로 저장   [취소] 시간 수정';
                if (!window.confirm(_shortMsg)) {
                    var _etEl = document.getElementById('addPwEndTime');
                    if (_etEl) { _etEl.focus(); _etEl.select(); }
                    return;
                }
            } else if (Math.abs(_timeDiffMin) > 5) {
                // 계획 완료시간과 5분 이상 차이 나면 일반 확인 팝업
                var _sign = _timeDiffMin > 0 ? '+' : '';
                var _msg =
                    '⏱  작업 완료시간을 확인해 주세요.\n\n' +
                    '  계획 완료시간 :  ' + _planEndVal + '\n' +
                    '  실제 완료시간 :  ' + endTime + '\n' +
                    '  차       이 :  ' + _sign + _timeDiffMin + '분\n\n' +
                    '이 시간으로 저장하시겠습니까?\n' +
                    '(수정하려면 [취소] 후 완료시간을 변경해 주세요.)';
                if (!window.confirm(_msg)) {
                    var _endTimeEl = document.getElementById('addPwEndTime');
                    if (_endTimeEl) { _endTimeEl.focus(); _endTimeEl.select(); }
                    return;
                }
            }
        }

        var avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            var sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            var eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            var totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        // 계획수량 초과 → 확인 체크 필수
        var overPlanSection = document.getElementById('pwOverPlanSection');
        var overPlanVisible = overPlanSection && overPlanSection.style.display !== 'none';
        if (overPlanVisible) {
            var overPlanConfirm = document.getElementById('addPwOverPlanConfirm');
            if (!overPlanConfirm || !overPlanConfirm.checked) {
                UIUtils.toast('계획수량 초과 내용을 확인하고 관리자 보고 체크박스를 선택해 주세요.', 'warning');
                if (overPlanConfirm) overPlanConfirm.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // IN/OUT 1% 초과 차이 → 사유구분 + 세부사유 필수
        var inputQtyVal  = Number((document.getElementById('addPwInputQty') || {}).value) || 0;
        var hasQtyDiff = inputQtyVal > 0 && prodQty > 0 && Math.abs(inputQtyVal - prodQty) / inputQtyVal > 0.01;
        var qtyDiffReason = ((document.getElementById('addPwQtyDiffReason') || {}).value || '').trim();
        var qtyDiffDetail = ((document.getElementById('addPwQtyDiffDetail') || {}).value || '').trim();
        if (hasQtyDiff && !qtyDiffReason) {
            UIUtils.toast('투입/산출 수량 차이 사유구분을 선택해 주세요.', 'warning');
            var qdrEl = document.getElementById('addPwQtyDiffReason');
            if (qdrEl) qdrEl.focus();
            return;
        }
        if (hasQtyDiff && !qtyDiffDetail) {
            UIUtils.toast('투입/산출 수량 차이 세부 사유를 입력해 주세요.', 'warning');
            var qddEl = document.getElementById('addPwQtyDiffDetail');
            if (qddEl) qddEl.focus();
            return;
        }
        // 투입/산출 차이 → 통보 대상을 한 명 이상 선택했으면 "통보 완료"는 등록 시 자동 체크
        if (hasQtyDiff) {
            var qtyDiffNotifyUsersCheck = _getSelectedNotifyUsers('qtyDiff');
            if (!qtyDiffNotifyUsersCheck.length) {
                UIUtils.toast('투입/산출 차이 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                var qtyDiffNotifyWrap = document.getElementById('qtyDiffNotifyUserWrap');
                if (qtyDiffNotifyWrap) qtyDiffNotifyWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            var qtyDiffMgrChk = document.getElementById('addPwQtyDiffManagerNotified');
            if (qtyDiffMgrChk) qtyDiffMgrChk.checked = true;
        }

        // 계획 미달 사유 필수 검증
        var planReasonSection = document.getElementById('pwPlanQtyReasonSection');
        var planReasonVisible = planReasonSection && planReasonSection.style.display !== 'none';
        var planReason = ((document.getElementById('addPwPlanReason') || {}).value || '').trim();
        var planReasonDetail = ((document.getElementById('addPwPlanReasonDetail') || {}).value || '').trim();
        if (planReasonVisible && !planReason) {
            UIUtils.toast('계획 미달 사유구분을 선택해 주세요.', 'warning');
            var prEl = document.getElementById('addPwPlanReason');
            if (prEl) prEl.focus();
            return;
        }
        if (planReasonVisible && !planReasonDetail) {
            UIUtils.toast('계획 미달 세부 사유를 입력해 주세요.', 'warning');
            var prdEl = document.getElementById('addPwPlanReasonDetail');
            if (prdEl) prdEl.focus();
            return;
        }
        // 계획 미달 → 통보 대상을 한 명 이상 선택했으면 "통보 완료"는 등록 시 자동 체크
        if (planReasonVisible) {
            var planNotifyUsersCheck = _getSelectedNotifyUsers('plan');
            if (!planNotifyUsersCheck.length) {
                UIUtils.toast('계획 미달 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                var planNotifyWrap = document.getElementById('planNotifyUserWrap');
                if (planNotifyWrap) planNotifyWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            var planMgrChk = document.getElementById('addPwPlanManagerNotified');
            if (planMgrChk) planMgrChk.checked = true;
        }

        var qtyDiffNotifyUsers = hasQtyDiff ? _getSelectedNotifyUsers('qtyDiff') : [];
        var planNotifyUsers = planReasonVisible ? _getSelectedNotifyUsers('plan') : [];

        var data = {
            date: (document.getElementById('addPwDateHidden') || {}).value || _currentDate,
            line: (document.getElementById('addPwLineHidden') || {}).value || _currentLine,
            carModel: (document.getElementById('addPwCarModelHidden') || {}).value || '',
            partName: (document.getElementById('addPwPartNameHidden') || {}).value || '',
            color: (document.getElementById('addPwColorHidden') || {}).value || '',
            planId: (document.getElementById('addPwPlanId') || {}).value || '',
            lotNo: lotNo,
            lots: lots,
            inputQty: _toQty((document.getElementById('addPwInputQty') || {}).value),
            productionQty: _toQty(prodQty),
            goodQty: 0,
            defectQty: 0,
            workers: Number((document.getElementById('addPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            overPlanQty: overPlanVisible ? true : false,
            planReason: planReasonVisible ? planReason : '',
            planReasonDetail: planReasonVisible ? planReasonDetail : '',
            planManagerNotified: planReasonVisible ? true : false,
            planManagerRecipients: planNotifyUsers,
            qtyDiffReason: hasQtyDiff ? qtyDiffReason : '',
            qtyDiffDetail: hasQtyDiff ? qtyDiffDetail : '',
            qtyDiffManagerNotified: hasQtyDiff ? true : false,
            qtyDiffManagerRecipients: qtyDiffNotifyUsers,
            note: ((document.getElementById('addPwNote') || {}).value || '').trim(),
            registeredAt: new Date().toISOString(),
            createdBy: _authUser ? {
                id: _workActorId(_authUser),
                name: _workActorLabel(_authUser),
                role: _authUser.role
            } : null,
            registeredByName: _authUser ? _workActorLabel(_authUser) : ''
        };

        if (!data.date) {
            UIUtils.toast('날짜 정보가 없습니다.', 'warning');
            return;
        }

        // 사출 재고 초과 여부 최종 검증
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = data.carModel, pn = data.partName;

        // injPartName 미선택 시 사출자재 마스터에서 자동 탐색
        // 컬러 일치 우선, 없으면 컬러 무관 폴백 (도장 컬러 ≠ 사출 소재 컬러 대응)
        var _saveColor = data.color || '';
        if (!injPartName) {
            var _mats = Storage.getAll(INJECTMAT_STORE) || [];
            var _found = _mats.find(function(m) {
                var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                var modelMatch = !cm || m.carModel === cm;
                var colorMatch = _injColorMatches(m.injColor, _saveColor);
                return nameMatch && modelMatch && colorMatch && m.injPartName;
            });
            // 폴백: 컬러 불일치 시 품명+차종만으로 매칭 (DYS→GRAY 등)
            if (!_found) {
                _found = _mats.find(function(m) {
                    var nameMatch  = m.mfgProductName === pn || m.mfgProductName2 === pn;
                    var modelMatch = !cm || m.carModel === cm;
                    return nameMatch && modelMatch && m.injPartName;
                });
            }
            if (_found) {
                injPartName = _found.injPartName;
            }
        }

        var _isLaserWipSave = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        var allLots = _isLaserWipSave
            ? getLaserWipLots(cm, pn)
            : (injPartName ? getInjectionLotsByInjPart(injPartName, _saveColor, cm) : getInjectionLots(cm, pn));
        var injPartSeen = {};
        var injPartNames = [];
        var injColorSeen = {};
        var injColors = [];
        (data.lots || []).forEach(function(l) {
            var partName = String(l.partName || injPartName || '').trim();
            if (partName) {
                var partKey = partName.toLowerCase();
                if (!injPartSeen[partKey]) {
                    injPartSeen[partKey] = true;
                    injPartNames.push(partName);
                }
            }
            String(l.color || '')
                .split(/[,，、\/|]/)
                .map(function(entry) { return entry.trim(); })
                .filter(Boolean)
                .forEach(function(entry) {
                    var key = entry.toLowerCase();
                    if (injColorSeen[key]) return;
                    injColorSeen[key] = true;
                    injColors.push(entry);
                });
        });
        data.injPartName = injPartNames.join(', ') || injPartName || '';
        data.injColor = injColors.join(', ');

        for (var vi = 0; vi < data.lots.length; vi++) {
            var vl = data.lots[vi];
            if (!vl.lotNo || !vl.qty) continue;
            var vLotInfo = allLots.find(function(l) {
                if (vl.optionKey && _lotOptionKey(l) === vl.optionKey) return true;
                if (vl.lotSource && l.lotSource === vl.lotSource && l.lotNo === vl.lotNo) return true;
                return l.lotNo === vl.lotNo;
            });
            if (vLotInfo && vl.qty > vLotInfo.balance) {
                vl.qty = vLotInfo.balance; // 초과분 조용히 잔량으로 대체
            }
        }

        // 현장 잔량 정산 확인 — 이번 도장작업일 입고분만. 지난 도장일 LOT 잔량은 저장 시 0 처리.
        if (!_isLaserWipSave && !_siteRemainDeclared()) {
            var _remainLots = _siteRemainLotsFor(data);
            var _remainQty = _remainLots.reduce(function (s, l) { return s + (Number(l.balance) || 0); }, 0);
            if (_remainQty > 0) {
                _pendingWorkSave = { data: data, remainLots: _remainLots, remainQty: _remainQty };
                _showSiteRemainModal();
                return;
            }
        }
        if (_siteRemainDecl) {
            data.siteRemainAction = _siteRemainDecl.action;
            data.siteRemainQty = _siteRemainDecl.qty;
            data.siteRemainReason = _siteRemainDecl.reason;
            _siteRemainDecl = null;   // 1회성 — 다음 저장에 이월되지 않게 즉시 비운다
        }

        // 계보 승계 — 투입한 사출 LOT별 수입검사일을 이 실적에 확정 저장한다.
        // 도장 입고 단계에서 확정된 trace 가 있으면 그대로 물려받고, 없을 때만 조회로 채운다.
        if (typeof Trace !== 'undefined') {
            data.trace = Trace.merge(data.trace, Trace.buildInjLotsStage(data.lots, {
                partName: data.injPartName || injPartName || '',
                carModel: cm,
                color: data.injColor || _saveColor || ''
            }));
        }

        // 현장 투입 자재에서 LOT 차감 (사출 창고 생산출고 → 도장 투입 → 실적 차감)
        var savedWork = await Storage.add(STORE, data);
        var isLaserWipSave = ((document.getElementById('addPwIsLaserWip') || {}).value || '') === '1';
        if (!isLaserWipSave && typeof PaintingInputModule !== 'undefined' && PaintingInputModule.deductForWork) {
            try { await PaintingInputModule.deductForWork(savedWork || data); }
            catch (eDeduct) { console.warn('[PaintingWork] 투입 자재 차감 실패:', eDeduct); }
        } else if (isLaserWipSave && typeof PaintingInputModule !== 'undefined' && PaintingInputModule.deductForWork) {
            var reworkLots = (data.lots || []).filter(function (l) {
                return l && (l.lotSource === 'site_rework' || String(l.optionKey || '').indexOf('rework:') === 0);
            });
            if (reworkLots.length) {
                try {
                    var reworkQty = reworkLots.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
                    await PaintingInputModule.deductForWork(Object.assign({}, savedWork || data, {
                        lots: reworkLots,
                        inputQty: reworkQty
                    }));
                } catch (eRwDeduct) { console.warn('[PaintingWork] 리워크 현장 LOT 차감 실패:', eRwDeduct); }
            }
        }
        if (!isLaserWipSave && typeof PaintingInputModule !== 'undefined'
            && typeof PaintingInputModule.writeOffExpiredSiteLots === 'function') {
            try {
                var keepLots = _siteRemainLotsFor(Object.assign({}, data, { id: savedWork && savedWork.id }));
                var keepByLot = {};
                keepLots.forEach(function (l) {
                    keepByLot[String(l.lotNo || '').trim()] = Number(l.balance) || 0;
                });
                var offParts = {};
                if (injPartName) offParts[String(injPartName).trim()] = true;
                (data.lots || []).forEach(function (l) {
                    var p = String((l && l.partName) || '').trim();
                    if (p) offParts[p] = true;
                });
                var offPartList = Object.keys(offParts);
                if (!offPartList.length && data.partName) offPartList = [data.partName];
                for (var opi = 0; opi < offPartList.length; opi++) {
                    await PaintingInputModule.writeOffExpiredSiteLots({
                        line: data.line,
                        carModel: data.carModel,
                        partName: offPartList[opi],
                        color: data.injColor || data.color,
                        workDate: data.date,
                        keepByLot: keepByLot,
                        workId: savedWork && savedWork.id
                    });
                }
            } catch (eOff) { console.warn('[PaintingWork] 경과 LOT 0 처리 실패:', eOff); }
        }

        UIUtils.closeModal();

        // ⚠️ 계획 상태를 '완료'로 변경 (중복 실적 입력 방지)
        if (data.planId) {
            var plan = Storage.getById(PLAN_STORE, data.planId);
            if (plan) {
                plan.status = '완료';
                await Storage.update(PLAN_STORE, data.planId, plan);
            }
        }

        // JIG 사용 자동 기록
        if (typeof JigModule !== 'undefined' && JigModule.addUsageFromWork) {
            JigModule.addUsageFromWork(savedWork);
        }
        _attachQualityIssueToWork(savedWork || data);
        if (planReasonVisible && planNotifyUsers.length) {
            var planQtyBase = Number((planReasonSection && planReasonSection.dataset && planReasonSection.dataset.planQty) || 0) || 0;
            _sendManagerNotification(
                '도장 작업 계획 미달 통보',
                '[' + (data.line || '-') + '] ' + (data.carModel || '-') + ' / ' + (data.partName || '-') + '\n' +
                '계획수량: ' + UIUtils.formatNumber(planQtyBase) + ' EA\n' +
                '투입수량: ' + UIUtils.formatNumber(data.inputQty) + ' EA\n' +
                '사유구분: ' + data.planReason + '\n' +
                '세부사유: ' + data.planReasonDetail,
                planNotifyUsers
            );
        }
        if (hasQtyDiff && qtyDiffNotifyUsers.length) {
            _sendManagerNotification(
                '도장 작업 투입/산출 차이 통보',
                '[' + (data.line || '-') + '] ' + (data.carModel || '-') + ' / ' + (data.partName || '-') + '\n' +
                '투입수량: ' + UIUtils.formatNumber(data.inputQty) + ' EA\n' +
                '산출수량: ' + UIUtils.formatNumber(data.productionQty) + ' EA\n' +
                '사유구분: ' + data.qtyDiffReason + '\n' +
                '세부사유: ' + data.qtyDiffDetail,
                qtyDiffNotifyUsers
            );
        }

        UIUtils.toast('작업 실적이 등록되었습니다.', 'success');
        if (!isLaserWipSave && typeof LaserStandbyModule !== 'undefined'
            && typeof LaserStandbyModule.notifyInboundPending === 'function') {
            try {
                var _lw = savedWork || data;
                var _prods = Storage.getAll(DB.STORES.PRODUCTS) || [];
                var _prod = (_lw.productId && _prods.find(function (p) {
                    return String(p.id || '') === String(_lw.productId);
                })) || _prods.find(function (p) {
                    return String(p.carModel || '').trim() === String(_lw.carModel || '').trim()
                        && String(p.partName || '').trim() === String(_lw.partName || '').trim()
                        && (!String(_lw.color || '').trim()
                            || String(p.color || '').trim() === String(_lw.color || '').trim());
                }) || null;
                if (typeof LaserStandbyModule.isPaintingWorkLaserStandbyInbound === 'function'
                    ? LaserStandbyModule.isPaintingWorkLaserStandbyInbound(_lw, _prod)
                    : false) {
                    LaserStandbyModule.notifyInboundPending([{
                        carModel: _lw.carModel,
                        partName: _lw.partName,
                        color: _lw.color,
                        qty: _lw.productionQty,
                        line: _lw.line,
                        date: _lw.date,
                        startTime: _lw.startTime,
                        endTime: _lw.endTime,
                        createdAt: _lw.createdAt,
                        lots: _lw.lots,
                        lotNo: _lw.lotNo,
                        source: '도장 작업 실적'
                    }]);
                }
            } catch (eLaserN) {
                console.warn('[PaintingWork] 레이저 입고 대기 통보 실패:', eLaserN);
            }
        }
        try { _notifyPaintMixUnregistered(savedWork || data); } catch (eMixN) {
            console.warn('[PaintingWork] 도료 사용 미등록 통보 실패:', eMixN);
        }
        if (!isLaserWipSave) {
            try { _notifyInspectionWaiting(savedWork || data); } catch (eInspW) {
                console.warn('[PaintingWork] 외관 검사 대기품 통보 실패:', eInspW);
            }
        }
        loadAll();
    }

    // ──────────────────────────────────────────────
    // 보기 페이지 (읽기 전용) + 수정 페이지
    // ──────────────────────────────────────────────
    var _workViewId = null;
    // 수정 화면은 LOT 행마다 이미 사출명/컬러/LOT/입고일시를 다 보여주므로, 아래에 똑같은
    // 정보를 중복으로 다시 나열하는 "선택된 사출 정보" 패널은 굳이 필요 없다(신규 등록에서만 표시).
    var _suppressSelectedMetaPanel = false;

    // shipDate = 실제 창고 출고(=실질 입고) 일시. 확인 처리를 늦게(자동 캐치업 등) 하면
    // date/useDate는 확인 처리 시각(예: 배치 처리한 오늘)으로 뭉쳐 보인다. shipDate가 없는
    // 과거 기록은 refOutId로 원본 창고 출고 기록을 찾아 그 일시로 대체한다.
    // openMaterialHistory·매칭 누락 LOT 조회 등 "실제 입고일"이 필요한 모든 곳에서 공용으로 쓴다.
    function _resolveInboundStamp(r) {
        if (r.shipDate) return String(r.shipDate);
        var outId = r.refOutId || '';
        if (outId && typeof Storage !== 'undefined' && Storage.getById) {
            try {
                var out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
                if (out && out.date) return String(out.date);
            } catch (e) { /* 무시 */ }
        }
        return String(r.useDate || r.date || '');
    }

    function _inboundDateTimeParts(stamp) {
        var s = String(stamp || '').replace('T', ' ').trim();
        if (!s) return { date: '', time: '' };
        return {
            date: s.length >= 10 ? s.slice(0, 10) : '',
            time: s.length > 11 ? s.slice(11, 16) : ''
        };
    }

    // 이 작업일지의 도장작업일에 실제로 현장 입고된 사출자재(painting_input_inventory) 합계.
    // 계획은 다 채워졌는데 실적만 적게 등록된 휴먼 에러(예: 후속 입고분을 실적에 반영 안 함)를
    // 자동으로 잡아내기 위해 매번 실데이터로 다시 계산한다(저장된 값이 아니라 조회 시점 계산).
    function _actualInputMaterialQty(d) {
        if (typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return 0;
        var line = String((d && d.line) || '').replace(/\s/g, '');
        var carModel = String((d && d.carModel) || '').trim();
        var day = String((d && d.date) || '').slice(0, 10);
        if (!line || !carModel || !day) return 0;
        // painting_input_inventory의 partName은 사출명(예: P-button)이지 도장 대상 부품명
        // (예: PARK)이 아니다 — 그대로 비교하면 항상 불일치해 0으로 계산된다.
        var injPartName = _workInjPartName({
            carModel: carModel,
            partName: d && d.partName,
            color: d && d.color,
            injPartName: d && d.injPartName,
            line: d && d.line,
            date: d && d.date
        });
        var workPartName = String((d && d.partName) || '').trim();
        var lineKey = _resolvePaintLine(d && d.line);
        var rows = Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || [];
        var seenOut = {};
        return rows.reduce(function (sum, r) {
            if (String(r.type || '') !== '입고') return sum;
            if (_inboundLineOf(r) !== lineKey) return sum;
            if (String(r.carModel || '').trim() !== carModel) return sum;
            if ((injPartName || workPartName)
                && !_inboundInjPartMatches(r.partName, injPartName, workPartName, carModel)) return sum;
            if (!_inboundDayHits(r, day)) return sum;
            var outKey = r.refReworkOutId
                ? ('rw:' + String(r.refReworkOutId))
                : (r.refOutId ? ('inj:' + String(r.refOutId)) : ('id:' + String(r.id || '')));
            if (seenOut[outKey]) return sum;
            seenOut[outKey] = true;
            return sum + _inboundRecordLots(r).reduce(function (s, l) { return s + l.qty; }, 0);
        }, 0);
    }

    // 같은 날짜·차종·라인·사출자재로 등록된 작업일지가 여러 건일 수 있다(교대/배치 분리 등).
    // 이 실적 하나의 투입수량만 실제 입고 총량과 비교하면, 다른 실적이 이미 정상 소진한 몫까지
    // "이 실적의 실적 오류"로 잘못 잡힌다. 그래서 같은 날 같은 조건의 실적 전체 투입수량 합으로
    // 비교해야 한다.
    function _siblingLoggedInputQty(d) {
        var line = String((d && d.line) || '').replace(/\s/g, '');
        var carModel = String((d && d.carModel) || '').trim();
        var day = String((d && d.date) || '').slice(0, 10);
        if (!line || !carModel || !day) return Number(d && d.inputQty || 0);
        var injPartName = _workInjPartName({ carModel: carModel, partName: d && d.partName, color: d && d.color, injPartName: d && d.injPartName });
        var workPartName = String((d && d.partName) || '').trim();
        return (Storage.getAll(STORE) || []).reduce(function (sum, w) {
            if (String(w.date || '').slice(0, 10) !== day) return sum;
            if (String(w.line || '').replace(/\s/g, '') !== line) return sum;
            if (String(w.carModel || '') !== carModel) return sum;
            if ((injPartName || workPartName) && !_inboundInjPartMatches(w.partName, injPartName, workPartName, carModel)
                && !_inboundInjPartMatches(_resolveInjPartNameForWork(carModel, w.partName, w.color) || w.injPartName, injPartName, workPartName, carModel)) return sum;
            return sum + (Number(w.inputQty) || 0);
        }, 0);
    }

    /**
     * 현장 자재 원장(PAINTING_INPUT_INVENTORY)에서 이 작업 조건의 입고·투입·반납 합계를 낸다.
     * 입고 − 투입 − 반납 = 현장에 남아 있는 잔량. 이 값을 보지 않고 "실적 오류"로 단정하면,
     * 실제로는 현장에 소재가 남아 있는(= 반납·이월 처리가 필요한) 상황을 실적 문제로 오진한다.
     */
    /**
     * 레이져 후 도장 제품인가 — 이런 제품은 사출창고를 거치지 않고 레이저 재공품에서 LOT을
     * 끌어 쓰므로 현장 원장에 '작업 투입' 기록이 남지 않는다(deductForWork 자체를 건너뜀).
     * 그래서 잔량을 그대로 계산하면 투입분이 0으로 잡혀 잔량이 과다 계산되고,
     * 반납할 필요가 없는 수량을 반납하라고 권하게 된다.
     */
    function _isLaserWipWork(d) {
        try {
            var line = String((d && d.line) || '').toLowerCase().replace(/\s+/g, '');
            var partName = String((d && d.partName) || '').trim();
            var carModel = String((d && d.carModel) || '').trim();
            if (!line || !partName) return false;
            var products = Storage.getAll(DB.STORES.PRODUCTS) || [];
            var prod = products.find(function (p) {
                if (String(p.partName || '').trim() !== partName) return false;
                return !carModel || !p.carModel || String(p.carModel).trim() === carModel;
            });
            if (!prod) return false;
            var seenLaser = false;
            for (var i = 1; i <= 4; i++) {
                var pv = String(prod['process' + i] || '').toLowerCase().replace(/\s+/g, '');
                if (!pv) break;
                if (pv.indexOf('레이') > -1 || pv.indexOf('laser') > -1) { seenLaser = true; continue; }
                if (seenLaser && pv.indexOf('도장') > -1) {
                    if (pv === line) return true;
                    if (line.indexOf(pv) === 0 || (pv.length > 2 && pv.indexOf(line) === 0)) return true;
                    if (pv.indexOf('-b') > -1 && line.indexOf('-b') > -1) return true;
                    if (pv.indexOf('-a') > -1 && line.indexOf('-a') > -1) return true;
                    return false;
                }
            }
            return false;
        } catch (e) { return false; }
    }

    function _siteMaterialBalance(d) {
        var res = { inQty: 0, usedQty: 0, returnQty: 0, remain: 0, hasLedger: false, laserWip: false };
        // 레이져 후 재공품은 현장 원장 기반 잔량 계산이 성립하지 않는다 → 반납 대상 아님
        if (_isLaserWipWork(d)) { res.laserWip = true; return res; }
        try {
            if (typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return res;
            var line = String((d && d.line) || '').replace(/\s/g, '');
            var carModel = String((d && d.carModel) || '').trim();
            var day = String((d && d.date) || '').slice(0, 10);
            if (!line || !day) return res;
            var injPartName = _resolveInjPartNameForWork(carModel, d && d.partName, d && d.color)
                || String((d && d.injPartName) || '').trim();
            var workPartName = String((d && d.partName) || '').trim();
            var rows = Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || [];

            // ① 당일 입고 LOT 집합 — 반납은 다음날 처리되는 게 정상이라 날짜로 걸러내면
            // 이미 반납한 수량도 "미반납 잔량"으로 남는다. LOT으로만 연결한다.
            var inboundLots = {};
            rows.forEach(function (r) {
                if (!r || String(r.type || '') !== '입고') return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() && String(r.carModel || '').trim() !== carModel) return;
                if ((injPartName || workPartName) && !_inboundInjPartMatches(r.partName, injPartName, workPartName, carModel)) return;
                var rday = '';
                try { rday = String(_resolveInboundStamp(r) || r.date || '').slice(0, 10); }
                catch (e1) { rday = String(r.date || '').slice(0, 10); }
                if (rday !== day) return;
                var qty = Number(r.quantity) || 0;
                if (qty <= 0) return;
                res.hasLedger = true;
                res.inQty += qty;
                var lotRows = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo, qty: qty }] : []);
                lotRows.forEach(function (l) {
                    var n = String((l && l.lotNo) || '').trim();
                    if (n) inboundLots[n] = true;
                });
            });

            rows.forEach(function (r) {
                if (!r || String(r.type || '') === '입고') return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() && String(r.carModel || '').trim() !== carModel) return;
                var qty = Number(r.quantity) || 0;
                if (qty <= 0) return;
                if (/반납/.test(String(r.source || ''))) {
                    var lotRows2 = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo, qty: qty }] : []);
                    var matched = 0;
                    var hasLot = false;
                    lotRows2.forEach(function (l) {
                        var n = String((l && l.lotNo) || '').trim();
                        if (!n) return;
                        hasLot = true;
                        if (inboundLots[n]) matched += Number(l.qty) || 0;
                    });
                    // LOT이 없는 구 반납: 사출명·당일(또는 refWorkId)로만 폴백
                    if (!hasLot) {
                        if ((injPartName || workPartName) && !_inboundInjPartMatches(r.partName, injPartName, workPartName, carModel)) return;
                        if (String(r.date || '').slice(0, 10) !== day && String(r.refWorkId || '') !== String(d.id || '')) return;
                        matched = qty;
                    }
                    if (matched > 0) {
                        res.hasLedger = true;
                        res.returnQty += matched;
                    }
                    return;
                }
                // 작업 투입 등 출고 — 당일 원장만
                if (String(r.date || '').slice(0, 10) !== day) return;
                if ((injPartName || workPartName) && !_inboundInjPartMatches(r.partName, injPartName, workPartName, carModel)) return;
                res.hasLedger = true;
                res.usedQty += qty;
            });
            res.remain = res.inQty - res.usedQty - res.returnQty;
        } catch (e) { /* 원장 조회 실패 시 경고는 기존대로 */ }
        return res;
    }

    /** 이 실적(당일 입고 LOT)과 연결된 반납 이력 — 보기 화면에 표시 */
    function _listReturnsForWorkView(d) {
        var out = [];
        try {
            if (typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return out;
            var line = String((d && d.line) || '').replace(/\s/g, '');
            var carModel = String((d && d.carModel) || '').trim();
            var day = String((d && d.date) || '').slice(0, 10);
            if (!line || !day) return out;
            var injPart = _resolveInjPartNameForWork(carModel, d && d.partName, d && d.color);
            var inboundLots = {};
            (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
                if (!r || String(r.type || '') !== '입고') return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() !== carModel) return;
                if (injPart && String(r.partName || '').trim() !== injPart) return;
                var rday = '';
                try { rday = String(_resolveInboundStamp(r) || '').slice(0, 10); }
                catch (e2) { rday = String(r.date || '').slice(0, 10); }
                if (rday !== day) return;
                var rows = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
                rows.forEach(function (l) {
                    var n = String((l && l.lotNo) || '').trim();
                    if (n) inboundLots[n] = true;
                });
            });
            (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
                if (!r || String(r.type || '') === '입고') return;
                if (!/반납/.test(String(r.source || ''))) return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() !== carModel) return;
                var byWork = r.refWorkId && String(r.refWorkId) === String(d.id || '');
                var lots = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo, qty: r.quantity }] : []);
                var hitLots = lots.filter(function (l) {
                    var n = String((l && l.lotNo) || '').trim();
                    return n && inboundLots[n];
                });
                if (!byWork && !hitLots.length) return;
                var qty = byWork
                    ? (Number(r.quantity) || 0)
                    : hitLots.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
                if (!(qty > 0)) return;
                out.push({
                    id: r.id,
                    date: String(r.date || '').slice(0, 16).replace('T', ' '),
                    qty: qty,
                    lots: byWork ? lots : hitLots,
                    reason: r.returnReason || r.note || '',
                    status: r.returnStatus || (r.isSiteReturn ? 'pending' : ''),
                    by: r.returnedBy || '',
                    refWorkId: r.refWorkId || ''
                });
            });
            out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        } catch (e3) { /* ignore */ }
        return out;
    }

    function _buildReturnHistoryAlertHtml(d, returns) {
        returns = returns || _listReturnsForWorkView(d);
        if (!returns.length) return '';
        var total = returns.reduce(function (s, r) { return s + (Number(r.qty) || 0); }, 0);
        var rows = returns.map(function (r) {
            var lotTxt = (r.lots || []).map(function (l) {
                return String(l.lotNo || '') + '(' + UIUtils.formatNumber(l.qty) + ')';
            }).filter(Boolean).join(', ') || '-';
            var st = r.status === 'confirmed'
                ? '<span style="color:#16a34a;font-weight:700;">창고확정</span>'
                : (r.status === 'pending'
                    ? '<span style="color:#b45309;font-weight:700;">창고대기</span>'
                    : '<span style="color:var(--text-muted);">기록</span>');
            return '<tr>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.date || '-') + '</td>' +
                '<td style="padding:5px 8px;font-family:monospace;white-space:nowrap;">' + _pwEsc(lotTxt) + '</td>' +
                '<td style="padding:5px 8px;text-align:right;font-weight:700;white-space:nowrap;">' + UIUtils.formatNumber(r.qty) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + st + '</td>' +
                '<td style="padding:5px 8px;font-size:0.78rem;color:var(--text-muted);">' + _pwEsc(r.reason || r.by || '-') + '</td>' +
                '</tr>';
        }).join('');
        return '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(8,145,178,.06);' +
            'border:1px solid rgba(8,145,178,.35);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
            '<span class="material-symbols-outlined" style="color:#0891b2;font-size:22px;flex-shrink:0;margin-top:1px;">undo</span>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;color:#0e7490;margin-bottom:4px;">↩ 자재 반납 이력 · 합계 ' +
            UIUtils.formatNumber(total) + ' EA</div>' +
            '<div style="overflow-x:auto;border:1px solid rgba(8,145,178,.2);border-radius:6px;background:#fff;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">' +
            '<thead><tr style="background:rgba(8,145,178,.06);color:var(--text-muted);text-align:left;">' +
            '<th style="padding:4px 8px;white-space:nowrap;">반납일시</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">사출LOT</th>' +
            '<th style="padding:4px 8px;text-align:right;white-space:nowrap;">수량</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">상태</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">사유/담당</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
    }

    /**
     * 그날 이 품목(차종·사출자재)으로 현장에 입고된 LOT 번호 집합.
     * 반납 범위를 이 집합으로 한정한다 — 다른 날 들어온 LOT까지 섞이면 오래된 생산분을
     * 임의로 반납하게 되어 오류의 원인이 되고, 반대로 실적에 적힌 LOT만 보면 같은 입고로
     * 함께 들어온 나머지 LOT(현장에 실제로 남아 있는 자재)을 반납할 수 없게 된다.
     */
    /**
     * LOT별 반납 가능 내역 — 각 LOT의 "입고 − 그날 실제 투입(모든 실적) − 기반납"을 직접 계산한다.
     *
     * getLotsByCarPart의 계산된 잔량에 기대지 않는다. 그 값은 반납/투입 원장 레코드의
     * partName·color가 조금이라도 다르게 저장되면(예: 사출컬러 vs 도장컬러 표기 차이) 서로
     * 다른 그룹으로 갈라져 상쇄가 안 되고, 이미 다 쓴 LOT이 그대로 잔량으로 보이는 사고가 났다.
     * 대신 "얼마가 입고됐고 얼마가 실제 작업 실적(work.lots)에 쓰였는지"를 원장에서 직접
     * 합산한다 — 실적 레코드 자체가 실제 투입의 1차 근거라 매칭 오류에 흔들리지 않는다.
     */
    function _scaleWorkLotsToQty(lots, target) {
        var list = (lots || []).map(function (l) {
            return { lotNo: String((l && l.lotNo) || '').trim(), qty: Math.max(0, Number(l && l.qty) || 0) };
        }).filter(function (l) { return l.lotNo && l.qty > 0; });
        var t = Math.max(0, Math.floor(Number(target) || 0));
        if (!list.length || t <= 0) return [];
        if (list.length === 1) return [{ lotNo: list[0].lotNo, qty: t }];
        var old = list.reduce(function (s, l) { return s + l.qty; }, 0);
        if (old <= 0) return [{ lotNo: list[0].lotNo, qty: t }];
        var allocated = 0;
        return list.map(function (l, i) {
            if (i === list.length - 1) return { lotNo: l.lotNo, qty: Math.max(0, t - allocated) };
            var q = Math.floor(l.qty * t / old);
            allocated += q;
            return { lotNo: l.lotNo, qty: q };
        }).filter(function (l) { return l.qty > 0; });
    }

    /** 실적의 LOT 사용량을 맵에 더한다. LOT 합 < 도장투입수이면 투입수량으로 올린다. */
    function _applyWorkUsageToLotMap(usedByLot, w, lotOk) {
        if (!usedByLot || !w) return;
        var raw = [];
        (Array.isArray(w.lots) ? w.lots : []).forEach(function (l) {
            if (!l || !l.lotNo) return;
            if (lotOk && !lotOk(l, w)) return;
            raw.push({ lotNo: String(l.lotNo).trim(), qty: Number(l.qty) || 0 });
        });
        var inputQty = Number(w.inputQty) || 0;
        try {
            if (typeof _workQtys === 'function') inputQty = Number(_workQtys(w).inputQty) || inputQty;
        } catch (e) { /* ignore */ }
        var lotSum = raw.reduce(function (s, l) { return s + l.qty; }, 0);
        var lots = raw;
        if (inputQty > lotSum && lotSum > 0) lots = _scaleWorkLotsToQty(raw, inputQty);
        else if ((!raw.length || lotSum <= 0) && inputQty > 0) {
            var solo = String(w.lotNo || '').trim();
            if (solo && (!lotOk || lotOk({ lotNo: solo, partName: w.injPartName || w.partName }, w))) {
                usedByLot[solo] = (usedByLot[solo] || 0) + inputQty;
            }
            return;
        }
        lots.forEach(function (l) {
            if (!l.lotNo) return;
            usedByLot[l.lotNo] = (usedByLot[l.lotNo] || 0) + l.qty;
        });
    }

    function _lotReturnBreakdown(d) {
        var res = { issued: 0, used: 0, returned: 0, returnable: 0, lots: [] };
        try {
            if (typeof PaintingInputModule === 'undefined') return res;
            if (_isLaserWipWork(d)) return res;   // 레이저 재공품은 반납 대상 아님
            var line = String((d && d.line) || '').replace(/\s/g, '');
            var carModel = String((d && d.carModel) || '').trim();
            var day = String((d && d.date) || '').slice(0, 10);
            if (!line || !day) return res;
            var injPart = _resolveInjPartNameForWork(carModel, d && d.partName, d && d.color);

            // ① 그날 이 품목으로 현장에 입고된 LOT별 수량 + 최초 입고 일시
            var inbound = {};   // lotNo -> { qty, date }
            var seenInboundOut = {};
            (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
                if (!r || String(r.type || '') !== '입고') return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() !== carModel) return;
                if (injPart && String(r.partName || '').trim() !== injPart) return;
                if (_resolveInboundStamp(r).slice(0, 10) !== day) return;
                var outKey = r.refReworkOutId
                    ? ('rw:' + String(r.refReworkOutId))
                    : (r.refOutId ? ('inj:' + String(r.refOutId)) : ('id:' + String(r.id || '')));
                if (seenInboundOut[outKey]) return;
                seenInboundOut[outKey] = true;
                var stamp = _resolveInboundStamp(r);
                var rows = _inboundRecordLots(r);
                rows.forEach(function (l) {
                    var n = String((l && l.lotNo) || '').trim();
                    if (!n) return;
                    var q = Number(l.qty) || 0;
                    if (!inbound[n]) inbound[n] = { qty: 0, date: stamp };
                    inbound[n].qty += q;
                    if (stamp && (!inbound[n].date || stamp < inbound[n].date)) inbound[n].date = stamp;
                });
            });

            // ② 같은 날 같은 조건의 실적 투입. lots[] 합이 도장투입수(inputQty)보다 작으면
            // 투입수량으로 맞춘다 — LOT 합만 빼면 잔량이 부풀어 반납이 입고−투입보다 커진다.
            var usedByLot = {};
            (Storage.getAll(STORE) || []).forEach(function (w) {
                if (!w || String(w.date || '').slice(0, 10) !== day) return;
                if (String(w.line || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(w.carModel || '') !== carModel) return;
                var wInjPart = _resolveInjPartNameForWork(w.carModel, w.partName, w.color) || w.injPartName;
                if (injPart && wInjPart && wInjPart !== injPart) return;
                _applyWorkUsageToLotMap(usedByLot, w);
            });

            // ③ 이미 반납된 LOT별 수량 — 반납은 실적 작성일보다 늦게(다음날 등) 처리되는 게
            // 정상이므로 날짜 상한으로 제한하면 안 된다. 대신 ①에서 확정한 "이 입고분 LOT 집합"과,
            // "이 입고일(day) 이후에 일어난 반납"으로만 한정한다. LOT번호는 생산일자(YYMMDD) 문자열이라
            // 같은 번호가 전혀 다른 시점의 배치에서 재사용될 수 있는데, 하한(day) 없이 이름만 맞춰
            // 반납을 합산하면 오늘 막 들어온 새 배치에 과거의(오늘 이전) 무관한 반납이 합산돼
            // "반납했다"고 오판하는 사고가 있었다(반납은 입고보다 먼저 있을 수 없으므로 하한은 안전하다).
            var returnedByLot = {};
            (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
                if (!r || String(r.type || '') === '입고') return;
                if (!/반납/.test(String(r.source || ''))) return;
                if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return;
                if (carModel && String(r.carModel || '').trim() !== carModel) return;
                if (String(r.date || '').slice(0, 10) < day) return;   // 이 입고일 이전의 반납은 무관한 과거 배치
                var rows = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo, qty: r.quantity }] : []);
                rows.forEach(function (l) {
                    var n = String((l && l.lotNo) || '').trim();
                    if (!n || !inbound[n]) return;   // 이 입고분 LOT이 아니면 무관한 반납이므로 제외
                    returnedByLot[n] = (returnedByLot[n] || 0) + (Number(l.qty) || 0);
                });
            });

            Object.keys(inbound).forEach(function (lotNo) {
                var inQty = inbound[lotNo].qty;
                var usedQty = usedByLot[lotNo] || 0;
                var returnedQty = returnedByLot[lotNo] || 0;
                var remaining = Math.max(0, inQty - usedQty - returnedQty);
                if (returnedQty > Math.max(0, inQty - usedQty)) {
                    returnedQty = Math.max(0, inQty - usedQty);
                    remaining = 0;
                }
                res.issued += inQty;
                res.used += usedQty;
                res.returned += returnedQty;
                if (remaining > 0) {
                    res.lots.push({ lotNo: lotNo, inQty: inQty, usedQty: usedQty, remaining: remaining, inboundDate: inbound[lotNo].date });
                }
            });
            res.lots.sort(function (a, b) { return String(a.inboundDate || '').localeCompare(String(b.inboundDate || '')); });
            res.returnable = res.lots.reduce(function (s, l) { return s + l.remaining; }, 0);
        } catch (e) { /* 계산 실패 시 반납 버튼을 내보내지 않는다 */ }
        return res;
    }

    /** 실적 보기 → 이 실적 몫 반납 모달 — LOT별로 입고일·잔량을 보여주고 수량을 개별 수정할 수 있다 */
    function openWorkReturnModal(workId) {
        var d = Storage.getById(STORE, workId);
        if (!d) { UIUtils.toast('실적을 찾을 수 없습니다.', 'error'); return; }
        var r = _lotReturnBreakdown(d);
        if (r.returnable <= 0) { UIUtils.toast('이 실적으로 반납할 수 있는 잔량이 없습니다.', 'info'); return; }

        // 표 형태로 입고량/사용량/반납수량을 나란히 두어 "얼마가 들어왔고 얼마를 썼고
        // 얼마가 남았는지"가 한눈에 비교되게 한다. 이전엔 입고−투입을 작은 보조문구로만
        // 보여줘서, LOT이 여러 개일 때 입고와 사용 관계를 파악하기 어려웠다.
        var lotRows = r.lots.map(function (l) {
            var dt = String(l.inboundDate || '').replace('T', ' ');
            var dateHtml = dt ? dt.slice(0, 16) : '-';
            return '<tr>' +
                '<td style="padding:7px 8px;font-family:monospace;font-weight:700;white-space:nowrap;">' + _pwEsc(l.lotNo || '-') + '</td>' +
                '<td style="padding:7px 8px;font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">' + _pwEsc(dateHtml) + '</td>' +
                '<td style="padding:7px 8px;text-align:right;white-space:nowrap;">' + UIUtils.formatNumber(l.inQty) + '</td>' +
                '<td style="padding:7px 8px;text-align:right;white-space:nowrap;color:' + (l.usedQty > 0 ? 'var(--text-primary)' : 'var(--text-muted)') + ';">' +
                UIUtils.formatNumber(l.usedQty) + '</td>' +
                '<td style="padding:7px 8px;text-align:right;font-weight:700;color:#b45309;white-space:nowrap;">' + UIUtils.formatNumber(l.remaining) + '</td>' +
                '<td style="padding:7px 8px;white-space:nowrap;">' +
                '<input type="number" class="pw-wr-lot-qty" data-lot="' + _pwEsc(l.lotNo || '') + '" data-max="' + l.remaining + '"' +
                ' value="0" min="0" max="' + l.remaining + '"' +
                ' placeholder="' + UIUtils.formatNumber(l.remaining) + '"' +
                ' onchange="PaintingWorkModule._recalcWorkReturnTotal()"' +
                ' style="width:100px;text-align:right;font-weight:700;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;">' +
                '</td></tr>';
        }).join('');

        UIUtils.showModal('이 실적 몫 자재 반납',
            '<div style="padding:4px 0;">' +
            '<div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.6;">' +
            '<div><strong>' + _pwEsc(d.carModel || '') + ' · ' + _pwEsc(d.partName || '') + '</strong>' +
            (d.color ? ' · ' + _pwEsc(d.color) : '') + ' · ' + _pwEsc(d.line || '') + '</div>' +
            '<div style="color:var(--text-muted);margin-top:3px;">' +
            '입고 <strong>' + UIUtils.formatNumber(r.issued) + '</strong> − 투입 <strong>' + UIUtils.formatNumber(r.used) + '</strong>' +
            (r.returned > 0 ? ' − 기반납 <strong>' + UIUtils.formatNumber(r.returned) + '</strong>' : '') +
            ' = <strong style="color:#b45309;">반납 가능 ' + UIUtils.formatNumber(r.returnable) + ' EA</strong></div></div>' +
            '<div style="margin-top:9px;font-size:0.78rem;color:var(--text-muted);">LOT별 반납 대상 — 기본값은 0입니다. 현장에 실제로 돌려보낸 수량만 입력하세요. 잔량을 그대로 넣으면 장부 잔량 전부가 반납됩니다.</div>' +
            '<div style="margin-top:5px;overflow-x:auto;border:1px solid var(--border-color);border-radius:8px;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">' +
            '<thead><tr style="background:var(--bg-secondary);">' +
            '<th style="padding:6px 8px;text-align:left;white-space:nowrap;">사출LOT</th>' +
            '<th style="padding:6px 8px;text-align:left;white-space:nowrap;">현장입고일시</th>' +
            '<th style="padding:6px 8px;text-align:right;white-space:nowrap;">입고량</th>' +
            '<th style="padding:6px 8px;text-align:right;white-space:nowrap;">사용량</th>' +
            '<th style="padding:6px 8px;text-align:right;white-space:nowrap;">잔량</th>' +
            '<th style="padding:6px 8px;text-align:left;white-space:nowrap;">반납수량</th>' +
            '</tr></thead>' +
            '<tbody>' + (lotRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--text-muted);">-</td></tr>') + '</tbody>' +
            '</table></div>' +
            '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(220,38,38,.35);' +
            'background:rgba(220,38,38,.06);font-size:0.82rem;line-height:1.55;">' +
            '남은 수량이 <strong>실제로 현장에 있는지</strong> 확인하세요. 실적 투입수량을 적게 등록해 장부에만 남은 것이라면, ' +
            '반납이 아니라 <strong>「수정」으로 투입수량을 바로잡아야</strong> 합니다. ' +
            '실물 없이 반납하면 사출창고에 <strong>없는 재고가 생깁니다.</strong></div>' +
            '<div style="margin-top:12px;padding:9px 11px;background:var(--bg-secondary);border-radius:8px;' +
            'display:flex;justify-content:space-between;align-items:center;font-size:0.86rem;">' +
            '<span>반납 합계</span>' +
            '<strong id="pwWrTotal" style="font-size:1.05rem;color:#7c2d12;">0 EA</strong></div>' +
            '<div class="form-group" style="margin-top:10px;">' +
            '<label class="form-label">반납 사유 <span style="color:var(--accent-red)">*</span></label>' +
            '<input type="text" class="form-input" id="pwWrReason" placeholder="사유 입력">' +
            '<div style="margin-top:4px;font-size:0.76rem;color:var(--text-muted);">적절한 예: 계획 축소로 잔량 반납 / 작업 종료 후 잔여</div></div>' +
            '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:9px 11px;' +
            'border:1px solid var(--border-color);border-radius:8px;cursor:pointer;font-size:0.83rem;">' +
            '<input type="checkbox" id="pwWrVerified" style="margin-top:3px;">' +
            '<span><strong>실물을 직접 확인했습니다</strong>' +
            '<div style="color:var(--text-muted);font-size:0.77rem;">각 LOT의 반납 수량이 현장 실물과 일치함을 확인한 경우에만 체크하세요.</div></span></label>' +
            '</div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" style="background:#7c2d12;border-color:#7c2d12;"' +
            ' onclick="PaintingWorkModule.submitWorkReturn(\'' + _pwJs(workId) + '\')">반납 처리</button>',
            'min(760px, calc(100vw - 32px))');
    }

    /** LOT별 수량 입력이 바뀔 때마다 합계를 다시 계산해 보여준다 */
    function _recalcWorkReturnTotal() {
        var total = 0;
        document.querySelectorAll('.pw-wr-lot-qty').forEach(function (el) {
            var max = Number(el.getAttribute('data-max')) || 0;
            var v = Math.max(0, Math.floor(Number(el.value) || 0));
            if (v > max) { v = max; el.value = max; }
            total += v;
        });
        var totalEl = document.getElementById('pwWrTotal');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total) + ' EA';
    }

    async function submitWorkReturn(workId) {
        var d = Storage.getById(STORE, workId);
        if (!d) { UIUtils.toast('실적을 찾을 수 없습니다.', 'error'); return; }
        var reason = String((document.getElementById('pwWrReason') || {}).value || '').trim();
        var verified = !!(document.getElementById('pwWrVerified') || {}).checked;

        // LOT별 입력 수량을 그대로 반납 목록으로 쓴다 (사용자가 실물 확인 후 직접 수정 가능)
        var lots = [];
        document.querySelectorAll('.pw-wr-lot-qty').forEach(function (el) {
            var lotNo = el.getAttribute('data-lot') || '';
            var max = Number(el.getAttribute('data-max')) || 0;
            var qty = Math.max(0, Math.floor(Number(el.value) || 0));
            if (qty > max) qty = max;
            if (lotNo && qty > 0) lots.push({ lotNo: lotNo, qty: qty });
        });
        var qty = lots.reduce(function (s, l) { return s + l.qty; }, 0);

        if (!lots.length || !(qty > 0)) { UIUtils.toast('반납 수량을 입력하세요.', 'warning'); return; }
        if (!reason) { UIUtils.toast('반납 사유를 입력하세요.', 'warning'); return; }
        if (!verified) { UIUtils.toast('현장 실물을 확인한 뒤 확인란에 체크하세요.', 'warning'); return; }

        var user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
        try {
            await PaintingInputModule.createSiteReturn({
                line: d.line,
                carModel: d.carModel,
                partName: _resolveInjPartNameForWork(d.carModel, d.partName, d.color) || d.injPartName || d.partName,
                color: d.injColor || d.color,
                lots: lots,
                reason: reason,
                returnedBy: (user && (user.displayName || user.username)) || '',
                workId: d.id,
                physicalVerified: true,
                verifiedAt: new Date().toISOString()
            });
        } catch (e) {
            UIUtils.toast('반납 실패: ' + (e && e.message ? e.message : e), 'error');
            return;
        }
        UIUtils.closeModal();
        UIUtils.toast(UIUtils.formatNumber(qty) + ' EA 반납 처리했습니다. 사출창고에서 입고 처리하면 재고에 반영됩니다.', 'success');
        search();
    }

    function _buildWorkAlerts(d, opts) {
        // 이 함수는 여러 계산(계획 조회·현장 원장 집계·반납 가능량 등)을 엮어 실적 「보기」
        // 알림을 만든다. 어느 한 계산이 특정 데이터 조합(예: 삭제된 계획을 가리키는 planId)에서
        // 예외를 던지면, 감싸지 않을 경우 모달 전체가 렌더링되지 않고 화면이 깨진다.
        // 알림 하나를 못 만드는 것과 실적 보기 자체가 안 열리는 것은 전혀 다른 문제이므로 반드시 감싼다.
        try {
            return _buildWorkAlertsInner(d, opts);
        } catch (e) {
            console.error('[PaintingWorkModule] _buildWorkAlerts 실패:', d && d.id, e);
            return '<div style="display:flex;align-items:center;gap:10px;background:rgba(220,38,38,.07);' +
                'border:1px solid rgba(220,38,38,.4);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;">error</span>' +
                '<span style="font-size:0.86rem;color:var(--text-secondary);">상태 알림을 불러오는 중 오류가 발생했습니다. ' +
                '실적 데이터는 정상이며, 이 알림 표시만 실패했습니다.</span></div>';
        }
    }

    function _buildWorkAlertsInner(d, opts) {
        var includeDayLots = !!(opts && opts.includeDayLots);
        var alerts = [];
        var actualInput = _actualInputMaterialQty(d);   // 현장에 실제 입고된 사출자재 합계
        var loggedInput = _siblingLoggedInputQty(d);
        var site = _siteMaterialBalance(d);
        var rb = _lotReturnBreakdown(d);
        var returns = _listReturnsForWorkView(d);
        var returnedQty = Math.max(Number(rb.returned) || 0, Number(site.returnQty) || 0);
        // 미정산 잔량 = 당일 입고 − 투입 − 반납 (반납을 빼지 않으면 이미 돌려보낸 수량까지
        // "남은 소재"로 오진한다)
        var unsettled = Math.max(0, Number(rb.returnable) || 0);
        if (!(unsettled > 0) && site.hasLedger) {
            unsettled = Math.max(0, Number(site.remain) || 0);
        }
        // 이 실적에 연동된 생산계획 수량 — "계획 대비 얼마나 더 들어왔나"가 현장에서 가장
        // 바로 와닿는 비교 기준이다(작업일지 투입수량 합계보다 계획수량이 직관적).
        var _linkedPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        var planQty = _linkedPlan ? Number(_linkedPlan.planQty || 0) : Number(d.planQty || 0);
        var shortfallRaw = actualInput - loggedInput;
        var shortfall = Math.max(0, shortfallRaw - returnedQty);

        if (returns.length) {
            alerts.push(_buildReturnHistoryAlertHtml(d, returns));
        }

        if (actualInput > 0 && unsettled > Math.max(1, actualInput * 0.01)) {
            var estRemain = unsettled;
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(220,38,38,.07);' +
                'border:1px solid rgba(220,38,38,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#dc2626;font-size:22px;flex-shrink:0;margin-top:1px;">report_problem</span>' +
                '<div style="flex:1;"><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">⚠ 실적 오류 의심 — 실제 입고 자재가 실적보다 많습니다</div>' +
                '<div style="font-size:0.86rem;line-height:1.7;">' +
                (planQty > 0
                    ? '생산 계획은 <strong>' + UIUtils.formatNumber(planQty) + ' EA</strong>인데 현장 투입자재는 <strong>' + UIUtils.formatNumber(actualInput) + ' EA</strong>임.' +
                      (returnedQty > 0 ? ' (반납 <strong>' + UIUtils.formatNumber(returnedQty) + ' EA</strong> 반영)' : '') + '<br>'
                    : '작업일지 투입수량 합계 <strong>' + UIUtils.formatNumber(loggedInput) + ' EA</strong> · 현장 투입자재 <strong>' + UIUtils.formatNumber(actualInput) + ' EA</strong>임.' +
                      (returnedQty > 0 ? ' (반납 <strong>' + UIUtils.formatNumber(returnedQty) + ' EA</strong> 반영)' : '') + '<br>') +
                (site.laserWip
                    ? '이 제품은 레이져 후 도장 제품이라 레이저 재공품에서 자동 관리됩니다. <strong>반납 조작이 필요 없습니다.</strong>'
                    : '아직 정산되지 않은 잔량은 <strong style="color:#b45309;">' + UIUtils.formatNumber(estRemain) + ' EA</strong>입니다.<br>' +
                      (returns.length
                        ? '일부 반납 이력이 있으나 잔량이 남아 있습니다. '
                        : '<strong style="color:#dc2626;">반납 이력이 없습니다.</strong> ') +
                      (rb.returnable > 0
                        ? '<strong style="color:var(--accent-red);">창고로 반납 하셔야 합니다.</strong>'
                        : '아래 <strong>사출LOT</strong>에서 미반영 LOT을 확인해 <strong>실제 사용한 실적에 반영</strong>하거나 반납하세요.')) +
                '</div>' +
                (rb.returnable > 0
                    ? '<div style="margin-top:9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                        '<button type="button" class="btn btn-sm" style="background:#7c2d12;color:#fff;border-color:#7c2d12;"' +
                        ' onclick="PaintingWorkModule.openWorkReturnModal(\'' + _pwJs(d.id) + '\')">' +
                        '<span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:-3px;">undo</span> 이 실적 몫 반납' +
                        '</button>' +
                        '<span style="font-size:0.78rem;color:var(--text-muted);">반납 가능 <strong>' +
                        UIUtils.formatNumber(rb.returnable) + ' EA</strong> (입고 ' + UIUtils.formatNumber(rb.issued) +
                        ' − 투입 ' + UIUtils.formatNumber(rb.used) +
                        (rb.returned > 0 ? ' − 기반납 ' + UIUtils.formatNumber(rb.returned) : '') + ')</span></div>'
                    : (returns.length === 0
                        ? '<div style="margin-top:8px;font-size:0.78rem;color:#7c2d12;font-weight:600;">남은 자재를 사출창고로 반납하면 이곳에 반납 이력이 표시됩니다.</div>'
                        : '')) +
                '</div></div>'
            );
        } else if (actualInput > 0 && returnedQty > 0 && shortfallRaw > Math.max(1, actualInput * 0.01)) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(22,163,74,.07);' +
                'border:1px solid rgba(22,163,74,.35);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#16a34a;font-size:22px;flex-shrink:0;margin-top:1px;">check_circle</span>' +
                '<div style="flex:1;font-size:0.86rem;line-height:1.7;">' +
                '<div style="font-weight:700;color:#15803d;margin-bottom:4px;">입고·실적 차이는 반납으로 정산되었습니다</div>' +
                '현장 입고 <strong>' + UIUtils.formatNumber(actualInput) + ' EA</strong> · ' +
                '실적 투입 <strong>' + UIUtils.formatNumber(loggedInput) + ' EA</strong> · ' +
                '반납 <strong>' + UIUtils.formatNumber(returnedQty) + ' EA</strong>' +
                (unsettled > 0 ? ' · 잔여 <strong style="color:#b45309;">' + UIUtils.formatNumber(unsettled) + ' EA</strong>' : '') +
                '</div></div>'
            );
        } else if (actualInput > 0 && shortfall > Math.max(1, actualInput * 0.01) && unsettled <= 0 && returns.length === 0) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(245,158,11,.08);' +
                'border:1px solid rgba(245,158,11,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#f59e0b;font-size:22px;flex-shrink:0;margin-top:1px;">info</span>' +
                '<div style="flex:1;font-size:0.86rem;line-height:1.7;">' +
                '<div style="font-weight:700;color:#b45309;margin-bottom:4px;">입고 수량과 이 실적 투입이 다릅니다</div>' +
                '현장 입고 <strong>' + UIUtils.formatNumber(actualInput) + ' EA</strong> · ' +
                '관련 실적 투입 합계 <strong>' + UIUtils.formatNumber(loggedInput) + ' EA</strong>. ' +
                '현재 미정산 잔량/반납 이력은 없습니다(다른 실적에서 소진됐을 수 있음).' +
                '</div></div>'
            );
        }
        if (d.overPlanQty) {
            var _overPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
            var _planQty = _overPlan ? Number(_overPlan.planQty || 0) : Number(d.planQty || 0);
            var _inputQty = Number(d.inputQty || 0);
            var _overAmt = _planQty > 0 ? _inputQty - _planQty : 0;
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(245,158,11,.08);' +
                'border:1px solid rgba(245,158,11,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#f59e0b;font-size:22px;flex-shrink:0;margin-top:1px;">warning</span>' +
                '<div style="flex:1;"><div style="font-weight:700;color:#b45309;margin-bottom:6px;">⚠ 계획수량 초과 등록</div>' +
                '<div style="display:flex;gap:20px;font-size:0.84rem;margin-bottom:4px;">' +
                '<span>계획수량: <strong>' + UIUtils.formatNumber(_planQty) + ' EA</strong></span>' +
                '<span>투입수량: <strong style="color:#b45309;">' + UIUtils.formatNumber(_inputQty) + ' EA</strong></span>' +
                (_overAmt > 0 ? '<span style="color:#dc2626;font-weight:700;">+' + UIUtils.formatNumber(_overAmt) + ' EA 초과</span>' : '') +
                '</div></div></div>'
            );
        }
        if (d.planReason || d.planManagerNotified !== undefined && (d.planReason)) {
            // 계획수량 미달 사유
        }
        if (d.timeReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,.07);' +
                'border:1px solid rgba(239,68,68,.35);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ef4444;font-size:22px;flex-shrink:0;margin-top:1px;">schedule</span>' +
                '<div><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">⏱ 시간 변동</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + (d.timeReason || '') + '</strong>' + (d.timeReasonDetail ? ' — ' + d.timeReasonDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.timeManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.qtyDiffReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(234,179,8,.08);' +
                'border:1px solid rgba(234,179,8,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ca8a04;font-size:22px;flex-shrink:0;margin-top:1px;">swap_vert</span>' +
                '<div><div style="font-weight:700;color:#a16207;margin-bottom:4px;">↕ 투입/산출 수량 차이</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + (d.qtyDiffReason || '') + '</strong>' + (d.qtyDiffDetail ? ' — ' + d.qtyDiffDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.qtyDiffManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.planReason) {
            alerts.push(
                '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,.06);' +
                'border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#ef4444;font-size:22px;flex-shrink:0;margin-top:1px;">trending_down</span>' +
                '<div><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">↓ 계획수량 미달</div>' +
                '<div style="font-size:0.84rem;">사유: <strong>' + d.planReason + '</strong>' + (d.planReasonDetail ? ' — ' + d.planReasonDetail : '') + '</div>' +
                '<div style="font-size:0.82rem;margin-top:3px;">' + (d.planManagerNotified ? '<span style="color:#16a34a;font-weight:600;">✓ 관리자 통보 완료</span>' : '<span style="color:#dc2626;font-weight:600;">✗ 관리자 미통보</span>') + '</div></div></div>'
            );
        }
        if (d.inspectionStatus === 'completed') {
            alerts.push(
                '<div style="display:flex;align-items:center;gap:10px;background:rgba(22,163,74,.07);' +
                'border:1px solid rgba(22,163,74,.35);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:#16a34a;font-size:22px;flex-shrink:0;">verified</span>' +
                '<div style="font-weight:600;color:#15803d;">✓ 도장 검사 완료</div></div>'
            );
        }
        // 보기 화면: 당일 미반영 LOT 상세 표는 아래 「사출LOT」 통합 표로 옮겼다.
        // 상태/알림에는 미반영 요약만 남겨 중복을 피한다.
        if (includeDayLots) {
            var unmatchedLots = _findUnmatchedSiteInboundLots(d);
            var unmatchedTotal = unmatchedLots.reduce(function (s, u) { return s + (Number(u.qty) || 0); }, 0);
            if (unmatchedTotal > 0.001) {
                alerts.push(
                    '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(220,38,38,.07);' +
                    'border:1px solid rgba(220,38,38,.4);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
                    '<span class="material-symbols-outlined" style="color:#dc2626;font-size:22px;flex-shrink:0;margin-top:1px;">report_problem</span>' +
                    '<div style="flex:1;">' +
                    '<div style="font-weight:700;color:#dc2626;margin-bottom:4px;">당일 현장 입고 LOT — 미반영 ' +
                    UIUtils.formatNumber(unmatchedTotal) + ' EA</div>' +
                    '<div style="font-size:0.84rem;color:var(--text-secondary);line-height:1.55;">' +
                    '아래 <strong>사출LOT</strong> 표에서 생산 반영분과 미반영분을 함께 확인하세요. 반영이 필요하면 「수정」에서 LOT을 추가하세요.' +
                    '</div></div></div>'
                );
            } else if (!alerts.length) {
                alerts.push(
                    '<div style="display:flex;align-items:center;gap:10px;background:var(--bg-secondary);' +
                    'border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                    '<span class="material-symbols-outlined" style="color:var(--accent-green);font-size:20px;">check_circle</span>' +
                    '<span style="font-size:0.88rem;color:var(--text-muted);">특이사항 없음</span></div>'
                );
            }
        } else if (!alerts.length) {
            alerts.push(
                '<div style="display:flex;align-items:center;gap:10px;background:var(--bg-secondary);' +
                'border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
                '<span class="material-symbols-outlined" style="color:var(--accent-green);font-size:20px;">check_circle</span>' +
                '<span style="font-size:0.88rem;color:var(--text-muted);">특이사항 없음</span></div>'
            );
        }
        return alerts.join('');
    }

    function removeWork(id) {
        UIUtils.confirm('이 도장 작업 실적을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderWorkList();
        });
    }

    // "재확인" 버튼 — 클릭 즉시 배지를 해제하지 않고, 먼저 이 작업일지의 LOT·투입수량이
    // 실제 현장 입고 수량과 맞는지 재확인 화면을 보여준다.
    // 수정 없이 「확인 완료」하면 오차는 유실로 확정되고 목록에서 사라진다.
    function openLaserQtyIssueReviewModal(workId) {
        const d = Storage.getById(STORE, workId);
        if (!d) { UIUtils.toast('작업 실적을 찾을 수 없습니다.', 'error'); return; }
        const laserQtyIssue = (typeof LaserStandbyModule !== 'undefined' && typeof LaserStandbyModule.getInboundConfirmDiffInfo === 'function')
            ? LaserStandbyModule.getInboundConfirmDiffInfo(workId)
            : null;
        const unmatched = _findUnmatchedSiteInboundLots(d);
        const stillMismatch = unmatched.length > 0;
        const unmatchedTotal = unmatched.reduce(function (s, u) { return s + u.qty; }, 0);
        const lossQty = laserQtyIssue ? Math.abs(Number(laserQtyIssue.diff) || 0) : 0;

        const issueSummaryHtml = laserQtyIssue
            ? '<div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;font-size:0.84rem;margin-bottom:12px;">' +
                '레이저 입고 확인 시 발견된 오차: 산출수량 <strong>' + UIUtils.formatNumber(laserQtyIssue.paintQty) + ' EA</strong> → ' +
                '실입고수량 <strong>' + UIUtils.formatNumber(laserQtyIssue.actualQty) + ' EA</strong>' +
                '<span style="color:#dc2626;font-weight:700;"> (차이 ' + UIUtils.formatNumber(lossQty) + ' EA)</span>' +
                '</div>'
            : '';

        const statusHtml = stillMismatch
            ? '<div style="padding:12px 14px;border-radius:8px;border:1px solid rgba(220,38,38,0.4);background:rgba(220,38,38,0.07);font-size:0.84rem;">' +
                '<div style="font-weight:700;color:#dc2626;margin-bottom:6px;">⚠ 아직 반영 안 된 사출 LOT이 ' + unmatched.length + '건 · ' + UIUtils.formatNumber(unmatchedTotal) + ' EA 있습니다.</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' + unmatched.map(function (u) {
                    return '<span style="padding:3px 9px;border-radius:999px;font-size:0.78rem;font-weight:700;background:#fff;border:1px solid rgba(220,38,38,0.35);color:#dc2626;">' +
                        _pwEsc(u.lotNo) + ' (' + UIUtils.formatNumber(u.qty) + ' EA)</span>';
                }).join('') + '</div>' +
                '<div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.55;">' +
                '실적에 LOT·수량을 맞추려면 「수정하러 가기」를 사용하세요.<br>' +
                '<strong style="color:#b45309;">수정 없이 「확인 완료」하면 오차 ' +
                UIUtils.formatNumber(lossQty) + ' EA는 유실로 확정</strong>되고 이 항목은 목록에서 사라집니다.' +
                '</div></div>'
            : '<div style="padding:12px 14px;border-radius:8px;border:1px solid rgba(22,163,74,0.4);background:rgba(22,163,74,0.07);font-size:0.84rem;">' +
                '<div style="font-weight:700;color:#16a34a;">✓ 현재 입력된 LOT·투입수량이 실제 현장 입고 수량과 일치합니다.</div>' +
                '<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">「확인 완료」를 누르면 재확인 목록에서 사라집니다.' +
                (lossQty > 0
                    ? ' (레이저 입고 오차 <strong style="color:#b45309;">' + UIUtils.formatNumber(lossQty) + ' EA</strong>는 유실로 확정)'
                    : '') +
                '</div></div>';

        const footerHtml = '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>' +
            '<button class="btn btn-outline" onclick="UIUtils.closeModal();setTimeout(function(){PaintingWorkModule.openWorkEditPage(\'' + workId + '\');},80);">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">edit</span> 수정하러 가기</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.resolveLaserQtyIssue(\'' + workId + '\')" title="수정 없이 완료하면 오차는 유실로 확정됩니다">' +
            '✓ 확인 완료</button>';

        UIUtils.showModal(
            '레이저 후공정 수량 오류 재확인',
            issueSummaryHtml + statusHtml,
            footerHtml,
            'md'
        );
    }

    // 레이저 입고 확인 중 발견된 산출-실입고 오차 배지를 해제한다.
    // 실적을 수정하지 않은 채 확인하면 오차는 유실로 확정되고 재확인 목록에서 제거된다.
    async function resolveLaserQtyIssue(workId) {
        if (typeof LaserStandbyModule === 'undefined' || typeof LaserStandbyModule.resolveInboundConfirmDiff !== 'function') return;
        var issue = (typeof LaserStandbyModule.getInboundConfirmDiffInfo === 'function')
            ? LaserStandbyModule.getInboundConfirmDiffInfo(workId)
            : null;
        var lossQty = issue ? Math.abs(Number(issue.diff) || 0) : 0;
        var ok = await LaserStandbyModule.resolveInboundConfirmDiff(workId, {
            asLoss: lossQty > 0,
            lossQty: lossQty,
            note: lossQty > 0 ? '도장 실적 미수정 — 오차를 유실로 확정' : ''
        });
        if (ok) {
            UIUtils.toast(
                lossQty > 0
                    ? '확인 완료 — 오차 ' + UIUtils.formatNumber(lossQty) + ' EA를 유실로 확정했습니다.'
                    : '수량 오류 확인을 완료 처리했습니다.',
                'success'
            );
            UIUtils.closeModal();
            renderLaserQtyIssueSection();
            renderWorkList();
        }
    }

    // 작업 실적에서 사출명/사출컬러 메타 추출 (보기·수정 화면용)
    function _getInjectionMetaForWork(work) {
        if (!work) {
            return { partNames: [], colors: [], partNameText: '-', colorText: '-' };
        }
        var partSeen = {};
        var colorSeen = {};
        var partNames = [];
        var colors = [];

        if (Array.isArray(work.lots) && work.lots.length > 0) {
            work.lots.forEach(function(lot) {
                if (!lot) return;
                var partName = String(lot.partName || '').trim();
                var color = String(lot.color || '').trim();
                if (partName) {
                    var partKey = partName.toLowerCase();
                    if (!partSeen[partKey]) {
                        partSeen[partKey] = true;
                        partNames.push(partName);
                    }
                }
                if (color) {
                    String(color)
                        .split(/[,，、\/|]/)
                        .map(function(entry) { return entry.trim(); })
                        .filter(Boolean)
                        .forEach(function(entry) {
                            var colorKey = entry.toLowerCase();
                            if (colorSeen[colorKey]) return;
                            colorSeen[colorKey] = true;
                            colors.push(entry);
                        });
                }
            });
        }

        if (!partNames.length && work.injPartName) {
            partNames = String(work.injPartName).split(',').map(function(name) { return name.trim(); }).filter(Boolean);
        }
        if (!colors.length && work.injColor) {
            colors = String(work.injColor).split(',').map(function(color) { return color.trim(); }).filter(Boolean);
        }

        if (!partNames.length || !colors.length) {
            var inventory = Storage.getAll(INJ_INV_STORE) || [];
            var injectionPartCandidates = [];
            var lotNos = [];
            if (Array.isArray(work.lots) && work.lots.length > 0) {
                lotNos = work.lots.map(function(lot) { return String(lot && lot.lotNo || '').trim(); }).filter(Boolean);
            } else if (work.lotNo) {
                lotNos = String(work.lotNo).split(',').map(function(lotNo) { return lotNo.trim(); }).filter(Boolean);
            }
            if (work.injPartName) {
                injectionPartCandidates = String(work.injPartName)
                    .split(',')
                    .map(function(name) { return name.trim(); })
                    .filter(Boolean);
            } else {
                var materialCandidates = Storage.getAll(INJECTMAT_STORE) || [];
                injectionPartCandidates = materialCandidates
                    .filter(function(item) {
                        if (!item) return false;
                        var nameMatch = item.mfgProductName === (work.partName || '') || item.mfgProductName2 === (work.partName || '');
                        var modelMatch = !work.carModel || !item.carModel || item.carModel === work.carModel;
                        return nameMatch && modelMatch && item.injPartName;
                    })
                    .map(function(item) { return String(item.injPartName || '').trim(); })
                    .filter(Boolean);
            }
            var candidateKeySet = {};
            injectionPartCandidates.forEach(function(name) {
                candidateKeySet[String(name).toLowerCase()] = true;
            });
            inventory.forEach(function(item) {
                if (!item || !item.lotNo) return;
                if (lotNos.indexOf(String(item.lotNo).trim()) < 0) return;
                var partName = String(item.partName || item.injPartName || '').trim();
                if (injectionPartCandidates.length && (!partName || !candidateKeySet[String(partName).toLowerCase()])) return;
                var color = String(item.color || item.injColor || '').trim();
                if (partName && !partSeen[partName.toLowerCase()]) {
                    partSeen[partName.toLowerCase()] = true;
                    partNames.push(partName);
                }
                if (color) {
                    String(color)
                        .split(/[,，、\/|]/)
                        .map(function(entry) { return entry.trim(); })
                        .filter(Boolean)
                        .forEach(function(entry) {
                            var colorKey = entry.toLowerCase();
                            if (colorSeen[colorKey]) return;
                            colorSeen[colorKey] = true;
                            colors.push(entry);
                        });
                }
            });
        }

        return {
            partNames: partNames,
            colors: colors,
            partNameText: partNames.length ? partNames.join(', ') : '-',
            colorText: colors.length ? colors.join(', ') : '-'
        };
    }

    // 보기 페이지 진입점: 부모창이면 팝업 열기, 팝업창이면 contentArea에 바로 렌더링
    function openWorkViewPage(id) {
        try {
            _renderWorkView(id);
        } catch (error) {
            console.error('[PaintingWorkModule] openWorkViewPage failed:', error);
            UIUtils.toast('작업 실적 보기를 여는 중 오류가 발생했습니다.', 'error');
        }
    }


    function _renderWorkView(id) {
        var d = Storage.getById(STORE, id);
        if (!d) return;
        _workViewId = id;

        // 깨진 완료수량이면 즉시 보정 후 화면에 반영
        (function _autoFixCorruptQty() {
            var q = _workQtys(d);
            var rawProd = _toQty(d.productionQty);
            if (rawProd !== q.productionQty) {
                d.productionQty = q.productionQty;
                Storage.update(STORE, id, { productionQty: q.productionQty }).catch(function() {});
            }
        })();

        var alertsHtml = _buildWorkAlerts(d, { includeDayLots: true });

        var lotMeta = _getInjectionMetaForWork(d);
        var lotDisplayHtml = _buildWorkInjectionLotUnifiedTableHtml(d);

        function _fmtDate(dateStr, timeStr) {
            var p = (dateStr || '').split('-');
            if (p.length !== 3) return dateStr || '-';
            var t = (timeStr || '').slice(0, 5);
            return '<span style="font-size:0.72rem;color:var(--text-muted);display:block;line-height:1.2;">' + p[0] + '</span>' +
                   '<span style="font-size:0.95rem;font-weight:600;">' + p[1] + '-' + p[2] + '</span>' +
                   (t ? '<span style="font-size:0.72rem;color:var(--text-muted);display:block;line-height:1.4;">' + t + '</span>' : '');
        }

        var workDateDisplay = _fmtDate(d.date, d.startTime);
        var regDateDisplay  = _fmtDate(
            d.registeredAt ? d.registeredAt.slice(0, 10) : '',
            d.registeredAt && d.registeredAt.length >= 16 ? d.registeredAt.slice(11, 16) : ''
        );
        var regUserDisplay = _workRegisteredByName(d) || '-';

        function vf(label, value, color) {
            return '<div style="min-width:110px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">' + label + '</div>' +
                '<div style="font-size:0.95rem;font-weight:600;color:' + (color || 'var(--text-primary)') + ';">' + value + '</div>' +
                '</div>';
        }

        var processLoss = (function() {
            var q = _workQtys(d);
            return q.inputQty - q.productionQty;
        })();

        // 생산 계획 지시 정보
        var plan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        var planHtml = '';
        if (plan) {
            var planTimeStr = (plan.startTime || plan.slot || '')
                ? ((plan.startTime || plan.slot || '') + (plan.endTime ? ' ~ ' + plan.endTime : ''))
                : '-';
            var planStatus = plan.status || '-';
            var planStatusColor = planStatus === '완료' ? 'var(--accent-green)'
                : (planStatus === '진행중' ? 'var(--accent-blue)' : 'var(--text-primary)');
            var planQtyNum = Number(plan.planQty) || 0;
            var workQtys = _workQtys(d);
            var planAchRate = planQtyNum > 0
                ? Math.min(999, Math.round(workQtys.productionQty / planQtyNum * 100))
                : 0;
            var planAchColor = planAchRate >= 100 ? 'var(--accent-green)'
                : (planAchRate >= 70 ? 'var(--accent-blue)'
                : (planAchRate > 0 ? 'var(--accent-orange)' : 'var(--text-muted)'));
            var itemTypeBadge = (typeof UIUtils.itemTypeBadge === 'function' && plan.carModel)
                ? UIUtils.itemTypeBadge(plan.carModel, plan.partName, plan.color)
                : '';
            planHtml =
                '<div class="card" style="margin-bottom:14px;border:1px solid rgba(37,99,235,0.25);">' +
                '<div class="card-header" style="padding:10px 16px;background:rgba(37,99,235,0.06);display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
                '<h4 style="margin:0;font-size:0.9rem;display:flex;align-items:center;gap:6px;">' +
                '<span class="material-symbols-outlined" style="font-size:1.05rem;color:var(--accent-blue);">assignment</span>' +
                '생산 계획 지시 정보</h4>' +
                '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;' +
                'background:rgba(37,99,235,0.12);color:var(--accent-blue);">계획 연동</span>' +
                '</div>' +
                '<div class="card-body" style="padding:16px 20px;">' +
                '<div style="display:flex;flex-wrap:wrap;gap:18px 36px;margin-bottom:12px;">' +
                vf('계획일', plan.date || '-') +
                vf('라인', plan.line || d.line || '-') +
                vf('계획 시간', planTimeStr) +
                vf('상태', '<span style="color:' + planStatusColor + ';">' + planStatus + '</span>') +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:18px 36px;margin-bottom:12px;">' +
                vf('차종', plan.carModel || d.carModel || '-') +
                vf('품명', plan.partName || d.partName || '-') +
                vf('컬러', plan.color || d.color || '-') +
                (itemTypeBadge ? vf('구분', itemTypeBadge) : '') +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:18px 36px;align-items:flex-end;">' +
                vf('계획수량', UIUtils.formatNumber(planQtyNum) + ' EA', 'var(--accent-blue)') +
                vf('실적(완료)', UIUtils.formatNumber(workQtys.productionQty) + ' EA', 'var(--accent-green)') +
                vf('투입', UIUtils.formatNumber(workQtys.inputQty) + ' EA') +
                '<div style="min-width:140px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">달성률</div>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;min-width:70px;">' +
                '<div style="width:' + Math.min(100, planAchRate) + '%;height:100%;background:' + planAchColor + ';"></div></div>' +
                '<span style="font-weight:700;font-size:0.95rem;color:' + planAchColor + ';">' + planAchRate + '%</span>' +
                '</div></div>' +
                '</div>' +
                '</div></div>';
        } else {
            planHtml =
                '<div class="card" style="margin-bottom:14px;">' +
                '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;display:flex;align-items:center;gap:6px;">' +
                '<span class="material-symbols-outlined" style="font-size:1.05rem;">assignment</span>' +
                '생산 계획 지시 정보</h4></div>' +
                '<div class="card-body" style="padding:14px 20px;">' +
                '<div style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:0.88rem;">' +
                '<span class="material-symbols-outlined" style="font-size:1.1rem;">link_off</span>' +
                '연동된 생산 계획 지시서가 없습니다. (수기 등록 실적)' +
                '</div></div></div>';
        }

        var bodyHtml =
            '<div class="fade-in-up">' +
            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>상태 / 알림</h4></div>' +
            '<div class="card-body" style="padding:12px 14px;">' + alertsHtml + '</div></div>' +

            planHtml +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">기본 정보</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 40px;">' +
            vf('등록일', regDateDisplay) +
            vf('등록자', regUserDisplay) +
            vf('도장 작업일', workDateDisplay) +
            vf('라인', d.line || '-') +
            vf('차종', d.carModel || '-') +
            vf('품명', d.partName || '-') +
            vf('컬러', d.color || '-') +
            '</div></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">작업 수량</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 36px;">' +
            vf('투입수량', UIUtils.formatNumber(_workQtys(d).inputQty), 'var(--accent-blue)') +
            vf('완료수량', UIUtils.formatNumber(_workQtys(d).productionQty), 'var(--accent-green)') +
            vf('공정 LOSS', UIUtils.formatNumber(processLoss), processLoss > 0 ? 'var(--accent-red)' : 'var(--text-muted)') +
            vf('불량수량', UIUtils.formatNumber(Number(d.defectQty) || 0), (Number(d.defectQty) || 0) > 0 ? 'var(--accent-red)' : 'var(--text-muted)') +
            vf('투입인원', (d.workers || 0) + '명') +
            '</div></div></div>' +
            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">작업 시간</h4></div>' +
            '<div class="card-body" style="padding:18px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:20px 36px;">' +
            vf('시작시간', d.startTime || '-') +
            vf('완료시간', d.endTime || '-') +
            vf('작업C.T', (Number(d.avgCT) || 0) > 0 ? Number(d.avgCT).toFixed(1) + '초' : '-', 'var(--accent-blue)') +
            '</div></div></div>' +
            '</div>' +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<h4 style="margin:0;font-size:0.9rem;">사출LOT</h4>' +
            '<span style="font-size:0.72rem;color:var(--text-muted);">생산 반영 · 미반영 통합</span>' +
            '</div>' +
            '<div class="card-body" style="padding:14px 20px;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:12px;">' +
            vf('사출명', lotMeta.partNameText) +
            vf('사출컬러', lotMeta.colorText) +
            '</div>' +
            lotDisplayHtml + '</div></div>' +

            (d.note ? '<div class="card" style="margin-bottom:0;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">비고</h4></div>' +
            '<div class="card-body" style="padding:14px 20px;font-size:0.9rem;">' + d.note + '</div></div>' : '') +
            '</div>';

        var footerHtml =
            '<button class="btn btn-secondary" onclick="PaintingWorkModule._closeWorkViewPage()">닫기</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.openWorkEditPage(\'' + id + '\')">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">edit</span> 수정</button>';

        UIUtils.showModal({ title: '도장 작업 실적 보기', body: bodyHtml, footer: footerHtml, size: 'lg' });
    }

    // d.partName은 "도장 대상 부품명"(예: PARK)이라 사출 LOT 잔량(사출명 "P-button" 등)과
    // 이름이 다른 경우가 흔하다. buildLotOptionsHtml(carModel, partName)을 그대로 쓰면 항상
    // "해당 LOT 없음"이 뜬다 — 신규 등록(saveNew)과 동일하게 사출자재 마스터에서 실제
    // 사출명(injPartName)을 먼저 찾아 그 기준으로 현장 입고 LOT을 조회해야 한다.
    function _resolveInjPartNameForWork(carModel, partName, color) {
        var want = String(partName || '').trim();
        if (!want) return '';
        if (typeof INJECTMAT_STORE === 'undefined') return want;
        var mats = Storage.getAll(INJECTMAT_STORE) || [];
        var buckets = [[], [], [], []];
        mats.forEach(function (m) {
            if (!m || !m.injPartName) return;
            var modelMatch = !carModel || !m.carModel || m.carModel === carModel;
            if (!modelMatch) return;
            if (_normPartKey(m.injPartName) === _normPartKey(want)) { buckets[0].push(m); return; }
            var mfgExact = m.mfgProductName === partName || m.mfgProductName2 === partName;
            var colorMatch = typeof _injColorMatches === 'function' ? _injColorMatches(m.injColor, color || '') : true;
            if (mfgExact && colorMatch) { buckets[1].push(m); return; }
            if (mfgExact) { buckets[2].push(m); return; }
            if (_partsLooselyRelated(m.mfgProductName, partName)
                || _partsLooselyRelated(m.mfgProductName2, partName)
                || _partsLooselyRelated(m.injPartName, partName)) {
                buckets[3].push(m);
            }
        });
        var names = [];
        var seen = {};
        function collect(list) {
            (list || []).forEach(function (m) {
                var n = String(m.injPartName || '').trim();
                if (!n || seen[n]) return;
                seen[n] = true;
                names.push(n);
            });
        }
        collect(buckets[0]);
        if (!names.length) collect(buckets[1]);
        if (!names.length) collect(buckets[2]);
        if (!names.length) collect(buckets[3]);
        var picked = _pickInjPartNameFromList(names, want);
        if (picked) return picked;
        if (names.length > 1) return '';
        if (typeof ReworkWipModule !== 'undefined' && typeof ReworkWipModule.toInjPartName === 'function') {
            try {
                var mapped = String(ReworkWipModule.toInjPartName(carModel, want) || '').trim();
                if (!mapped) return '';
                var mappedSpot = _partSpotNumber(mapped);
                var wantSpot = _partSpotNumber(want);
                if (wantSpot && mappedSpot && wantSpot !== mappedSpot) return '';
                return mapped;
            } catch (e) { /* ignore */ }
        }
        return '';
    }

    function _displayInjPartName(carModel, partName, color) {
        var raw = String(partName || '').trim();
        if (!raw) return '';
        if (typeof ReworkWipModule !== 'undefined' && typeof ReworkWipModule.toInjPartName === 'function') {
            try {
                var n = ReworkWipModule.toInjPartName(carModel, raw);
                if (n) return n;
            } catch (e) { /* ignore */ }
        }
        return _resolveInjPartNameForWork(carModel, raw, color) || raw;
    }

    function _buildEditLotOptionsHtml(d) {
        var injPartName = _resolveInjPartNameForWork(d.carModel, d.partName, d.color);
        if (injPartName && typeof buildLotOptionsHtmlByInjPart === 'function') {
            return buildLotOptionsHtmlByInjPart(injPartName, d.color, d.carModel);
        }
        return buildLotOptionsHtml(d.carModel, d.partName);
    }

    // LOT번호로 실제 "도장 현장 입고 일시"(날짜+시간)를 찾는다 — 사출 LOT 행 왼쪽 표시용.
    // 같은 LOT번호가 같은 날 여러 시각에 나눠 입고될 수 있어(예: 13:36 + 19:59), 시간까지
    // 보여줘야 서로 다른 입고 건인지 구분할 수 있다. 여러 건이면 가장 이른 시각을 보여준다.
    function _findSiteInboundDateForLot(lotNo) {
        var want = String(lotNo || '').trim();
        if (!want || typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return '';
        var rows = Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || [];
        var best = '';
        rows.forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            var hit = lots.some(function (l) { return String((l && l.lotNo) || '').trim() === want; });
            if (!hit) return;
            var stamp = _resolveInboundStamp(r).trim();
            if (!stamp) return;
            if (!best || stamp < best) best = stamp;
        });
        return best;
    }

    // _findSiteInboundDateForLot는 carModel·사출명으로 좁히지 않고 LOT번호 문자열만으로
    // 전역 검색한다(입고 라벨 표시용으로는 충분). 하지만 반납 후보의 "같은 배치" 판정처럼
    // 다른 차종·부품이 우연히 같은 LOT번호(예: 제조일자 기반 번호라 겹칠 수 있음)를 쓸 때
    // 엉뚱한 날짜를 집어오면 안 되는 곳에서는 이 스코프 버전을 쓴다.
    function _findSiteInboundDateForLotScoped(lotNo, carModel, injPartName) {
        var want = String(lotNo || '').trim();
        if (!want || typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return '';
        var rows = Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || [];
        var best = '';
        rows.forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            if (carModel && String(r.carModel || '') !== String(carModel)) return;
            if (injPartName && !_inboundInjPartMatches(r.partName, injPartName, injPartName, carModel)) return;
            var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            var hit = lots.some(function (l) { return String((l && l.lotNo) || '').trim() === want; });
            if (!hit) return;
            var stamp = _resolveInboundStamp(r).trim();
            if (!stamp) return;
            if (!best || stamp < best) best = stamp;
        });
        return best;
    }

    // LOT번호로 "사출 수입검사 입고 일시"를 찾는다 — 사출 창고에 외부에서 들어와 수입검사를
    // 받은 시점이며, "도장 현장 입고 일시"(_findSiteInboundDateForLot, 사출창고→도장라인 이동
    // 시점)와는 서로 다른 개념이다. 혼동하지 않도록 항상 구분해서 표시한다.
    function _findIncomingInspectionDateForLot(injPartName, lotNo) {
        var want = String(lotNo || '').trim();
        if (!want || typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES) return '';
        var best = '';
        if (DB.STORES.INJECTION_INSPECTIONS) {
            (Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || []).forEach(function (insp) {
                if (injPartName && String(insp.partName || '') !== injPartName) return;
                var lots = (insp.lots && insp.lots.length) ? insp.lots : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
                var hit = lots.some(function (l) { return String((l && l.lotNo) || '').trim() === want; });
                if (!hit) return;
                var stamp = String(insp.date || '').trim();
                if (!stamp) return;
                if (!best || stamp < best) best = stamp;
            });
        }
        if (!best && DB.STORES.INJECTION_INVENTORY) {
            (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).forEach(function (r) {
                if (String(r.type || '') === '출고') return;
                if (injPartName && String(r.partName || '') !== injPartName) return;
                if (String(r.lotNo || '').trim() !== want) return;
                if (!r.inspDate) return;
                var stamp = String(r.inspDate).trim();
                if (!best || stamp < best) best = stamp;
            });
        }
        return best;
    }

    // LOT 옵션 라벨에 붙일 "수입검사 입고"와 "현장 입고"를 서로 구분해서 만든다 — 같은 "입고"란
    // 단어라도 사출창고 수입검사 시점과 도장 현장 도착 시점은 완전히 다른 날짜/시간이라
    // 한 줄에 뭉뚱그리면 혼동을 준다.
    function _lotStampTags(injPartName, lotNo) {
        var inspStamp = _findIncomingInspectionDateForLot(injPartName, lotNo);
        var siteStamp = _findSiteInboundDateForLot(lotNo);
        var inspTag = inspStamp ? ' │ 수입검사입고 ' + inspStamp.slice(5, 10) : '';
        var siteTag = siteStamp
            ? ' │ 현장입고 ' + siteStamp.slice(5, 10) + (siteStamp.length > 11 ? ' ' + siteStamp.slice(11, 16) : '')
            : '';
        return inspTag + siteTag;
    }

    /**
     * LOT 선택 드롭다운의 표시 라벨.
     * 사출LOT 번호는 option의 value에만 있고 화면 텍스트에는 없어서, 어떤 LOT을 고르는지
     * 눈으로 확인할 수 없었다(같은 사출명·컬러 LOT이 여러 개면 구분 불가). 번호를 앞쪽에 넣는다.
     * 형식: 사출명 │ 컬러 │ 사출 LOT 260622 │ 수입검사입고 07-27 │ 현장입고 07-25 13:39
     */
    function _lotOptionLabel(l, injPartName, opts) {
        opts = opts || {};
        var name = String((l && (l.partName || l.carModel)) || '');
        var colorTag = (opts.withColor !== false && l && l.color) ? ' │ ' + l.color : '';
        var lotNo = String((l && l.lotNo) || '').trim();
        var lotTag = lotNo ? ' │ 사출 LOT ' + lotNo : '';
        return _pwEsc(name + colorTag + lotTag + _lotStampTags(injPartName, l && l.lotNo));
    }

    // 이 작업일지의 도장작업일(d.date)에 현장 입고됐지만, 현재 이 작업일지의 LOT 목록에는
    // 아직 반영 안 된 LOT/수량 — 후속 입고분을 실적에 반영하지 않은 휴먼 에러를 잡기 위함.
    // LOT번호는 같은 날 여러 번(예: 13:36 입고 + 19:59 추가 입고)에 걸쳐 나눠 들어올 수 있다.
    // 그래서 "이 LOT번호가 이미 목록에 있는지"(있음/없음)로만 판단하면 안 되고, LOT별로
    // "실제 입고 합계 − 이 작업일지에 이미 반영된 수량"의 차이(=아직 안 반영된 몫)를 봐야 한다.
    // LOT별 "실제 입고 합계"와 "이 도장작업일 전체 실적에 이미 반영된 수량"을 한 번에 계산.
    // _findUnmatchedSiteInboundLots(미반영만 필요한 곳)와 _buildUnmatchedInboundWarningHtml
    // (전체 LOT을 입고/투입 비교로 보여줘야 하는 곳)이 같은 계산을 공유한다.
    function _computeSiteInboundLotMaps(d) {
        var empty = { ok: false, receivedQtyByLot: {}, usedQtyByLot: {} };
        if (typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return empty;
        var line = _resolvePaintLine(d.line);
        var carModel = String(d.carModel || '').trim();
        var day = String(d.date || '').slice(0, 10);
        if (!line || !carModel || !day) return empty;
        var injPartName = _workInjPartName(d);
        var workPartName = String(d.partName || '').trim();
        function _rowPartOk(rPartName) {
            if (!workPartName && !injPartName) return false;
            if (workPartName) return _injNameAllowed(rPartName, carModel, workPartName);
            return _inboundInjPartMatches(rPartName, injPartName, '', carModel);
        }
        function _lotUsageBelongsToWork(lotPart, siblingWork) {
            var lp = String(lotPart || '').trim();
            var sp = String((siblingWork && siblingWork.partName) || '').trim();
            var si = String((siblingWork && siblingWork.injPartName) || '').trim();
            if (workPartName) {
                if (sp && _normPartKey(sp) === _normPartKey(workPartName)) return true;
                if (lp && _injNameAllowed(lp, carModel, workPartName)) return true;
                if (si && _injNameAllowed(si, carModel, workPartName)) return true;
                return false;
            }
            if (injPartName) {
                return _inboundInjPartMatches(lp || si || sp, injPartName, '', carModel);
            }
            return false;
        }

        // 같은 날짜·차종·라인·사출자재로 등록된 작업일지가 이 실적 하나뿐이라는 보장이 없다
        // (여러 교대/배치로 나눠 등록되는 경우가 흔하다). 지금 보는 이 실적의 LOT만 보고 "미반영"
        // 판단하면, 실제로는 "같은 날 다른 실적"이 이미 정상적으로 소진한 LOT까지 "이 실적에
        // 반영 안 됨"으로 잘못 표시된다. 그래서 같은 날 같은 조건의 작업일지 전체가 이미 사용한
        // 수량을 합산해서 빼야 진짜 미반영분만 남는다.
        // d.lots가 라이브(미저장) 폼 스냅샷으로 전달된 경우, 아래 루프가 이 실적을 저장된
        // 옛 lots로 다시 세면 방금 화면에서 고른 LOT이 반영되지 않은 것처럼 보인다.
        // 자기 자신(id 일치)은 루프에서 건너뛰고, 대신 전달받은 d.lots로 직접 합산한다.
        var selfId = d.id;
        var usedQtyByLot = {};
        (Storage.getAll(STORE) || []).forEach(function (w) {
            if (selfId != null && String(w.id) === String(selfId)) return;
            if (String(w.date || '').slice(0, 10) !== day) return;
            if (_resolvePaintLine(w.line) !== line) return;
            if (String(w.carModel || '') !== carModel) return;
            _applyWorkUsageToLotMap(usedQtyByLot, w, function (l, ww) {
                return _lotUsageBelongsToWork(l.partName, ww);
            });
        });
        _applyWorkUsageToLotMap(usedQtyByLot, d, function (l) {
            return !!(l && l.lotNo);
        });

        var receivedQtyByLot = {};
        var receivedPartByLot = {};
        var seenInboundOut = {};
        (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            if (_inboundLineOf(r) !== line) return;
            if (String(r.carModel || '').trim() !== carModel) return;
            if (!_rowPartOk(r.partName)) return;
            if (!_inboundDayHits(r, day)) return;
            var outKey = r.refReworkOutId
                ? ('rw:' + String(r.refReworkOutId))
                : (r.refOutId ? ('inj:' + String(r.refOutId)) : ('id:' + String(r.id || '')));
            if (seenInboundOut[outKey]) return;
            seenInboundOut[outKey] = true;
            var rPart = String(r.partName || '').trim();
            _inboundRecordLots(r).forEach(function (l) {
                var lotNo = String((l && l.lotNo) || '').trim();
                var qty = Number(l && l.qty) || 0;
                if (!lotNo || qty <= 0) return;
                receivedQtyByLot[lotNo] = (receivedQtyByLot[lotNo] || 0) + qty;
                if (rPart && !receivedPartByLot[lotNo]) receivedPartByLot[lotNo] = rPart;
            });
        });

        // 이 차종·품명 입고 LOT을 다른 실적(다른 제작품명이어도 같은 사출명)이 이미 썼으면 차감.
        // 품명 필터가 빠졌을 때 1SPOT이 목록에 섞여도, 이미 1SPOT 실적에 투입된 수량이
        // "미반영/현장 잔량"으로 다시 잡히지 않게 한다.
        (Storage.getAll(STORE) || []).forEach(function (w) {
            if (selfId != null && String(w.id) === String(selfId)) return;
            if (String(w.date || '').slice(0, 10) !== day) return;
            if (_resolvePaintLine(w.line) !== line) return;
            if (String(w.carModel || '') !== carModel) return;
            (w.lots || []).forEach(function (l) {
                if (!l || !l.lotNo) return;
                if (_lotUsageBelongsToWork(l.partName, w)) return;
                var lotNo = String(l.lotNo).trim();
                if (!receivedQtyByLot[lotNo]) return;
                var recPart = receivedPartByLot[lotNo] || '';
                var lotPart = String(l.partName || w.injPartName || '').trim();
                if (recPart && lotPart && (_normPartKey(recPart) === _normPartKey(lotPart) || _partsLooselyRelated(recPart, lotPart))) {
                    usedQtyByLot[lotNo] = (usedQtyByLot[lotNo] || 0) + (Number(l.qty) || 0);
                }
            });
        });

        // 반납된 LOT별 수량 — 반납 없이 입고−투입만 비교하면, 이미 사출창고로 돌려보낸 LOT도
        // "미반영"(아직 이 실적에 안 쓰임)으로 잘못 표시되어 마치 반영을 안 한 게 문제인 것처럼
        // 보인다. 실제로는 반영할 필요가 없어진 것(반납됨)과 아직 손을 안 댄 것(미반영)은
        // 전혀 다른 상태라 구분해야 한다. 반납은 다음날 처리되는 게 정상이라 날짜 상한으로
        // 제한하지 않지만, 하한(이 입고일 day 이전)은 반드시 걸러야 한다 — LOT번호(YYMMDD)는
        // 다른 시점의 배치에서 재사용될 수 있어서, 하한 없이 "이 입고분 LOT" 텍스트만 맞춰
        // 반납을 합산하면 오늘 막 들어온 새 배치에 과거의 무관한 대량 반납이 그대로 합산돼
        // "이미 반납됨"으로 오판하고, 정작 미반영 상태여야 할 LOT이 ②투입 후보에서 사라지는
        // 사고가 실제로 있었다(반납은 입고보다 먼저 있을 수 없으므로 하한 필터는 안전하다).
        var returnedQtyByLot = {};
        (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
            if (!r || String(r.type || '') === '입고') return;
            if (!/반납/.test(String(r.source || ''))) return;
            if (_inboundLineOf(r) !== line) return;
            if (String(r.carModel || '') !== carModel) return;
            if (!_rowPartOk(r.partName)) return;
            if (String(r.date || '').slice(0, 10) < day) return;   // 이 입고일 이전의 반납은 무관한 과거 배치
            var rLots = _inboundRecordLots(r);
            rLots.forEach(function (l) {
                var lotNo = String((l && l.lotNo) || '').trim();
                if (!lotNo || !receivedQtyByLot[lotNo]) return;   // 이 입고분 LOT이 아니면 제외
                returnedQtyByLot[lotNo] = (returnedQtyByLot[lotNo] || 0) + (Number(l.qty) || 0);
            });
        });
        Object.keys(returnedQtyByLot).forEach(function (lotNo) {
            var cap = Math.max(0, (receivedQtyByLot[lotNo] || 0) - (usedQtyByLot[lotNo] || 0));
            if ((returnedQtyByLot[lotNo] || 0) > cap) returnedQtyByLot[lotNo] = cap;
        });

        return { ok: true, receivedQtyByLot: receivedQtyByLot, usedQtyByLot: usedQtyByLot, returnedQtyByLot: returnedQtyByLot,
                 receivedPartByLot: receivedPartByLot,
                 day: day, line: line, carModel: carModel, injPartName: injPartName, workPartName: workPartName };
    }

    // 이 작업일지의 도장작업일(d.date)에 현장 입고됐지만, 현재 이 작업일지의 LOT 목록에는
    // 아직 반영 안 된 LOT/수량 — 후속 입고분을 실적에 반영하지 않은 휴먼 에러를 잡기 위함.
    // 이미 반납된 LOT은 반영할 필요가 없으므로 미반영 후보에서 제외한다.
    function _findUnmatchedSiteInboundLots(d) {
        var maps = _computeSiteInboundLotMaps(d);
        if (!maps.ok) return [];
        var result = [];
        Object.keys(maps.receivedQtyByLot).forEach(function (lotNo) {
            var diff = maps.receivedQtyByLot[lotNo] - (maps.usedQtyByLot[lotNo] || 0) - (maps.returnedQtyByLot[lotNo] || 0);
            if (diff > 0.001) result.push({ lotNo: lotNo, qty: diff });
        });
        return result.sort(function (a, b) { return a.lotNo.localeCompare(b.lotNo); });
    }

    // 이 도장작업일·차종·라인·사출명으로 실제 입고된 사출자재만 나열한다.
    // 1SPOT 작업에 3SPOT 이력이 섞이지 않게 사출명을 반드시 맞춘다.
    function _buildDayInboundListHtml(d) {
        if (typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return '';
        var line = String(d.line || '').replace(/\s/g, '');
        var carModel = String(d.carModel || '').trim();
        var day = String(d.date || '').slice(0, 10);
        if (!line || !carModel || !day) return '';
        var injPartName = _workInjPartName(d);
        var workPartName = String(d.partName || '').trim();
        var rows = (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).filter(function (r) {
            if (String(r.type || '') !== '입고') return false;
            if (String(r.line || r.paintLine || '').replace(/\s/g, '') !== line) return false;
            if (String(r.carModel || '') !== carModel) return false;
            if ((injPartName || workPartName) && !_inboundInjPartMatches(r.partName, injPartName, workPartName, carModel)) return false;
            return _resolveInboundStamp(r).slice(0, 10) === day;
        }).sort(function (a, b) { return _resolveInboundStamp(a).localeCompare(_resolveInboundStamp(b)); });

        if (!rows.length) {
            return '<div style="margin-top:8px;padding:8px 10px;background:#fff;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-muted);">' +
                '이 도장작업일(' + _pwEsc(day) + ')·' + _pwEsc(carModel) + '·' + _pwEsc(d.partName || '-') + '·' + _pwEsc(d.line || '-') + '에 현장 입고 이력이 없습니다.</div>';
        }
        // LOT별로 한 행씩(입고일|입고시간|입고 위치|차종|사출명|컬러|사출 LOT|수입검사일|수량)
        var lines = [];
        rows.forEach(function (r) {
            var stamp = _resolveInboundStamp(r);
            var dt = _inboundDateTimeParts(stamp);
            var isRework = _isReworkInbound(r);
            var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : [{ lotNo: r.lotNo || '-', qty: r.quantity }];
            lots.forEach(function (l) {
                var lotNo = String((l && l.lotNo) || '-');
                lines.push('<tr>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(dt.date || '-') + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(dt.time || '-') + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _inboundLocationCellHtml(isRework) + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(r.carModel || '-') + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(_displayInjPartName(r.carModel, r.partName, r.color) || r.partName || '-') + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(r.color || '-') + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;font-family:monospace;">' + _pwEsc(lotNo) + '</td>' +
                    '<td style="padding:4px 8px;white-space:nowrap;">' + _pwEsc(_inspDateTextForInboundLot(r.partName, lotNo, r)) + '</td>' +
                    '<td style="padding:4px 8px;text-align:right;font-weight:700;">' + UIUtils.formatNumber(l.qty) + '</td>' +
                    '</tr>');
            });
        });
        var totalReceived = rows.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
        return '<div style="margin-top:8px;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:8px;overflow-x:auto;">' +
            '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);margin-bottom:6px;">이 도장작업일(' + _pwEsc(day) + ')에 ' + _pwEsc(carModel) + '·' + _pwEsc(injPartName || d.partName || '-') + '·' + _pwEsc(d.line || '-') + '로 입고된 사출자재 (' + rows.length + '건, 같은 차종·품명만)</div>' +
            '<table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:0.76rem;">' +
            '<thead><tr style="color:var(--text-muted);">' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">입고일</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">입고시간</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">입고 위치</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">차종</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">사출명</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">컬러</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">사출 LOT</th>' +
            '<th style="text-align:left;padding:4px 8px;white-space:nowrap;">수입검사일</th>' +
            '<th style="text-align:right;padding:4px 8px;white-space:nowrap;">수량</th>' +
            '</tr></thead>' +
            '<tbody>' + lines.join('') + '</tbody>' +
            '<tfoot><tr style="border-top:1px solid var(--border);">' +
            '<td colspan="8" style="padding:5px 8px;font-weight:700;color:var(--text-primary);white-space:nowrap;">입고 합계</td>' +
            '<td style="padding:5px 8px;text-align:right;font-weight:800;color:var(--accent-blue);white-space:nowrap;">' + UIUtils.formatNumber(totalReceived) + ' EA</td>' +
            '</tr></tfoot>' +
            '</table></div>';
    }

    // "창고→현장 입고"와 "도장 투입"은 서로 다른 수량 흐름인데 한 카드에 뭉쳐 있으면 어느 쪽
    // 수치를 보고 있는지 헷갈린다. 번호 배지 + 제목으로 두 단계를 시각적으로 분리해 준다.
    function _lotFlowStepHeaderHtml(num, color, title, desc) {
        return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0 6px;">' +
            '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;' +
            'border-radius:50%;background:' + color + ';color:#fff;font-size:0.68rem;font-weight:800;flex-shrink:0;">' + num + '</span>' +
            '<strong style="font-size:0.82rem;color:var(--text-primary);">' + title + '</strong>' +
            (desc ? '<span style="color:var(--text-muted);font-size:0.72rem;">' + desc + '</span>' : '') +
            '</div>';
    }

    // 재사용 자재 → 도장현장 출고로 들어온 입고분(isReworkInbound)임을 표시하는 배지.
    // 창고 생산출고와 뒤섞여 보이면 이 LOT이 사출 창고 재고가 아니라 재사용 자재에서 온
    // 것을 놓쳐, 사출 창고 재고와 대조하며 혼란스러워하는 문제가 있었다.
    // 플래그(isReworkInbound)는 이 기능 이후 확인된 입고 건에만 붙어 있어, 그전 건이나 자동
    // 입고 경로 건은 리워크인데도 플래그가 없다 — 실제 리워크 출고 원장까지 대조해 판정한다.
    function _isReworkInbound(r) {
        if (!r) return false;
        if (r.isReworkInbound || r.refReworkOutId) return true;
        if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.isReworkSiteInbound) {
            try { return !!PaintingInputModule.isReworkSiteInbound(r); } catch (e) { /* ignore */ }
        }
        return false;
    }

    function _reworkInboundBadgeHtml() {
        return ' <span style="font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;' +
            'background:rgba(124,58,237,.12);color:#7c3aed;white-space:nowrap;">재사용 자재</span>';
    }

    /** 입고 위치 칸 — 사출 창고 / 리워크를 배지로 구분 */
    function _inboundLocationCellHtml(isRework) {
        return isRework
            ? '<span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;' +
              'background:rgba(124,58,237,.12);color:#7c3aed;white-space:nowrap;">재사용 자재</span>'
            : '<span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;' +
              'background:rgba(37,99,235,.10);color:#2563eb;white-space:nowrap;">사출 창고</span>';
    }

    /** 현장 입고 기록·LOT의 수입검사일 (YYYY-MM-DD). 없으면 '-' */
    function _inspDateTextForInboundLot(partName, lotNo, rec) {
        var raw = '';
        if (typeof Trace !== 'undefined' && rec) {
            try { raw = String(Trace.injInspDate(rec) || '').trim(); } catch (e) { /* ignore */ }
        }
        if (!raw && rec) {
            var wantLot = String(lotNo || '').trim();
            var lots = (Array.isArray(rec.lots) && rec.lots.length) ? rec.lots : [];
            lots.forEach(function (l) {
                if (raw) return;
                if (wantLot && String((l && l.lotNo) || '').trim() !== wantLot) return;
                if (l && l.inspDate) raw = String(l.inspDate).trim();
            });
            if (!raw && rec.inspDate) raw = String(rec.inspDate).trim();
        }
        if (!raw) raw = _findIncomingInspectionDateForLot(partName, lotNo) || '';
        if (!raw) return '-';
        return String(raw).replace('T', ' ').slice(0, 10);
    }

    function _siteInboundTableHeadHtml() {
        return '<thead><tr style="color:var(--text-muted);text-align:left;">' +
            '<th style="padding:4px 8px;white-space:nowrap;">입고일</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">입고시간</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;" title="사출 창고 또는 재사용 자재">입고 위치</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">차종</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">사출명</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">컬러</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">사출 LOT</th>' +
            '<th style="padding:4px 8px;white-space:nowrap;">수입검사일</th>' +
            '<th style="padding:4px 8px;text-align:right;white-space:nowrap;">수량</th>' +
            '<th style="padding:4px 8px;text-align:right;white-space:nowrap;">상태</th>' +
            '</tr></thead>';
    }

    // 이 도장작업일·차종·라인·사출명으로 실제 입고된 기록에서 LOT별 입고 시각·차종·사출명·컬러를
    // 뽑는다(같은 LOT이 여러 건 나뉘어 들어왔으면 가장 이른 시각을 대표값으로 쓴다).
    // _buildUnmatchedInboundWarningHtml의 요약 목록과 _buildDayInboundListHtml의 상세 표가
    // 같은 원본을 보게 해서 두 표시가 서로 어긋나지 않게 한다.
    function _dayInboundLotDetailMap(maps) {
        var out = {};
        if (typeof Storage === 'undefined' || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.PAINTING_INPUT_INVENTORY) return out;
        (Storage.getAll(DB.STORES.PAINTING_INPUT_INVENTORY) || []).forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            if (_inboundLineOf(r) !== maps.line) return;
            if (String(r.carModel || '').trim() !== String(maps.carModel || '').trim()) return;
            if (maps.workPartName) {
                if (!_injNameAllowed(r.partName, maps.carModel, maps.workPartName)) return;
            } else if (maps.injPartName) {
                if (!_inboundInjPartMatches(r.partName, maps.injPartName, '', maps.carModel)) return;
            } else {
                return;
            }
            if (!_inboundDayHits(r, maps.day)) return;
            var stamp = _resolveInboundStamp(r);
            var dt = _inboundDateTimeParts(stamp);
            var lots = _inboundRecordLots(r);
            lots.forEach(function (l) {
                var lotNo = String((l && l.lotNo) || '').trim();
                if (!lotNo) return;
                if (maps.receivedQtyByLot && maps.receivedQtyByLot[lotNo] == null) return;
                if (!out[lotNo] || stamp < (out[lotNo].stamp || '')) {
                    out[lotNo] = {
                        stamp: stamp,
                        date: dt.date || maps.day || '',
                        time: dt.time || '-',
                        carModel: r.carModel || '',
                        partName: r.partName || '',
                        color: r.color || '',
                        isRework: _isReworkInbound(r),
                        inspDate: _inspDateTextForInboundLot(r.partName, lotNo, r)
                    };
                }
            });
        });
        return out;
    }

    // 도장 작업 실적 「보기」용 — 이 실적에 생산 반영된 사출LOT와 당일 현장 입고 미반영
    // LOT을 한 표로 묶어, 위에서 알림 / 아래에서 사용 LOT로 나뉘어 보이던 정보를 한눈에 본다.
    function _buildWorkInjectionLotUnifiedTableHtml(d) {
        var lotMeta = _getInjectionMetaForWork(d);
        var maps = _computeSiteInboundLotMaps(d);
        var detailMap = maps.ok ? _dayInboundLotDetailMap(maps) : {};
        var unmatched = _findUnmatchedSiteInboundLots(d);
        var unmatchedByLot = {};
        unmatched.forEach(function (u) {
            unmatchedByLot[String(u.lotNo || '').trim()] = Number(u.qty) || 0;
        });

        var workLots = (d.lots && d.lots.length)
            ? d.lots
            : (d.lotNo ? [{ lotNo: d.lotNo, qty: Number(d.inputQty) || 0, partName: d.injPartName || '', color: d.injColor || '' }] : []);

        var rows = [];
        var seen = {};

        function _rowWhen(lotNo, detail) {
            if (detail && (detail.date || detail.time)) {
                return { date: detail.date || '-', time: detail.time || '-' };
            }
            var stamp = _findSiteInboundDateForLotScoped(lotNo, d.carModel, maps.injPartName || maps.workPartName || '')
                || _findSiteInboundDateForLot(lotNo);
            var p = _inboundDateTimeParts(stamp);
            return { date: p.date || '-', time: p.time || '-' };
        }

        workLots.forEach(function (l) {
            if (!l || !l.lotNo) return;
            var lotNo = String(l.lotNo).trim();
            if (!lotNo) return;
            seen[lotNo] = true;
            var detail = detailMap[lotNo] || {};
            var usedQty = Number(l.qty) || 0;
            var missQty = unmatchedByLot[lotNo] || 0;
            var partName = String(l.partName || detail.partName || maps.injPartName || lotMeta.partNameText || '-').trim() || '-';
            var color = String(l.color || detail.color || lotMeta.colorText || '-').trim() || '-';
            var statusKind = missQty > 0.001 ? 'partial' : 'reflected';
            var when = _rowWhen(lotNo, detail);
            rows.push({
                date: when.date,
                time: when.time,
                carModel: detail.carModel || d.carModel || '-',
                partName: partName,
                color: color,
                lotNo: lotNo,
                qty: usedQty,
                missQty: missQty,
                statusKind: statusKind,
                isRework: !!detail.isRework,
                inspDate: detail.inspDate || '-',
                sortKey: '0_' + lotNo
            });
        });

        unmatched.forEach(function (u) {
            var lotNo = String(u.lotNo || '').trim();
            if (!lotNo || seen[lotNo]) return;
            var detail = detailMap[lotNo] || {};
            var when = _rowWhen(lotNo, detail);
            rows.push({
                date: when.date,
                time: when.time,
                carModel: detail.carModel || maps.carModel || d.carModel || '-',
                partName: detail.partName || maps.injPartName || lotMeta.partNameText || '-',
                color: detail.color || '-',
                lotNo: lotNo,
                qty: Number(u.qty) || 0,
                missQty: Number(u.qty) || 0,
                statusKind: 'unmatched',
                isRework: !!detail.isRework,
                inspDate: detail.inspDate || '-',
                sortKey: '1_' + lotNo
            });
        });

        rows.sort(function (a, b) {
            if (a.sortKey < b.sortKey) return -1;
            if (a.sortKey > b.sortKey) return 1;
            return 0;
        });

        if (!rows.length) {
            return '<div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px;' +
                'font-size:0.84rem;color:var(--text-muted);">등록된 사출LOT가 없습니다.</div>';
        }

        var reflectedTotal = 0;
        var unmatchedTotal = 0;
        var bodyHtml = rows.map(function (r) {
            var statusCell;
            var rowBg;
            var rowBorder;
            if (r.statusKind === 'reflected') {
                reflectedTotal += r.qty;
                statusCell = '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.74rem;font-weight:700;color:#16a34a;white-space:nowrap;">' +
                    '✓ 생산 반영</span>';
                rowBg = 'rgba(22,163,74,0.05)';
                rowBorder = 'rgba(22,163,74,0.15)';
            } else if (r.statusKind === 'partial') {
                reflectedTotal += r.qty;
                unmatchedTotal += r.missQty;
                statusCell = '<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;color:#b45309;white-space:nowrap;flex-wrap:wrap;">' +
                    '<span>일부 반영 · 미반영 +' + UIUtils.formatNumber(r.missQty) + ' EA</span>' +
                    '<span style="font-size:0.68rem;font-weight:700;color:#0891b2;background:rgba(8,145,178,.08);' +
                    'border:1px solid rgba(8,145,178,.3);border-radius:4px;padding:1px 6px;">사용 ' +
                    UIUtils.formatNumber(r.qty) + ' EA</span></span>';
                rowBg = 'rgba(180,83,9,0.05)';
                rowBorder = 'rgba(180,83,9,0.2)';
            } else {
                unmatchedTotal += r.qty;
                statusCell = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.74rem;font-weight:700;color:#dc2626;white-space:nowrap;">' +
                    '미반영 +' + UIUtils.formatNumber(r.qty) + ' EA</span>';
                rowBg = 'rgba(220,38,38,0.04)';
                rowBorder = 'rgba(220,38,38,0.2)';
            }
            return '<tr style="background:' + rowBg + ';border-bottom:1px solid ' + rowBorder + ';">' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.date || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.time || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _inboundLocationCellHtml(!!r.isRework) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.carModel) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.partName) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.color) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;font-family:monospace;font-weight:700;">' + _pwEsc(r.lotNo) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(r.inspDate || '-') + '</td>' +
                '<td style="padding:5px 8px;text-align:right;font-weight:700;white-space:nowrap;">' +
                UIUtils.formatNumber(r.qty) + '</td>' +
                '<td style="padding:5px 8px;text-align:right;white-space:nowrap;">' + statusCell + '</td>' +
                '</tr>';
        }).join('');

        return '<div style="overflow-x:auto;">' +
            '<table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:0.78rem;">' +
            _siteInboundTableHeadHtml() +
            '<tbody>' + bodyHtml + '</tbody>' +
            '</table></div>' +
            '<div style="display:flex;justify-content:flex-end;gap:14px;padding-top:8px;margin-top:4px;border-top:1px solid var(--border);' +
            'font-size:0.8rem;font-weight:700;flex-wrap:wrap;">' +
            '<span style="color:#16a34a;">생산 반영 ' + UIUtils.formatNumber(reflectedTotal) + ' EA</span>' +
            (unmatchedTotal > 0.001
                ? '<span style="color:#dc2626;">미반영 ' + UIUtils.formatNumber(unmatchedTotal) + ' EA</span>'
                : '<span style="color:var(--text-muted);">미반영 없음</span>') +
            '</div>';
    }

    // 창고→현장 입고 LOT을 표로 보여준다
    // (입고일|입고시간|입고 위치|차종|사출명|컬러|사출 LOT|수입검사일|수량|상태).
    // opts.readOnly=true 이면 보기/알림용(클릭 추가 없음). 기본은 입력·수정 화면용 — 미반영 행
    // 클릭 시 그 차이만큼 ②투입 LOT에 자동 추가.
    function _buildUnmatchedInboundWarningHtml(d, opts) {
        var readOnly = !!(opts && opts.readOnly);
        var maps = _computeSiteInboundLotMaps(d);
        var lotNos = Object.keys(maps.receivedQtyByLot).sort(function (a, b) { return a.localeCompare(b); });
        var dayLabel = _pwEsc(maps.day || String(d.date || '').slice(0, 10));

        if (!lotNos.length) {
            if (readOnly) {
                return '<div style="margin-bottom:8px;padding:10px 12px;border-radius:8px;' +
                    'border:1px dashed var(--border);background:var(--bg-secondary);font-size:0.82rem;color:var(--text-muted);">' +
                    '당일(' + dayLabel + ') 현장 입고 LOT이 없습니다.</div>';
            }
            return '<div id="pwUnmatchedInboundWarn" style="margin-bottom:8px;padding:10px 12px;border-radius:8px;' +
                'border:1px dashed var(--border);background:#fff;font-size:0.82rem;color:var(--text-muted);">' +
                '이 도장작업일(' + dayLabel + ')에 현장 입고 이력이 없습니다.</div>';
        }

        var detailMap = _dayInboundLotDetailMap(maps);
        var totalReceived = 0;
        var totalUnmatched = 0;
        var totalReturned = 0;
        var rowsHtml = lotNos.map(function (lotNo) {
            var received = maps.receivedQtyByLot[lotNo] || 0;
            var used = maps.usedQtyByLot[lotNo] || 0;
            var returned = (maps.returnedQtyByLot && maps.returnedQtyByLot[lotNo]) || 0;
            // 반납된 만큼은 더 이상 "이 실적에 반영해야 할 몫"이 아니다. 반납 없이 입고−투입만
            // 비교하면, 도장에서 이미 사출창고로 돌려보낸 LOT까지 "미반영"으로 잘못 잡혀
            // 마치 실적 반영을 빠뜨린 것처럼 보인다(반납은 창고 확인 전 대기 상태여도 마찬가지).
            var diff = received - used - returned;
            var isMissing = diff > 0.001;
            totalReceived += received;
            totalReturned += returned;
            if (isMissing) totalUnmatched += diff;
            var detail = detailMap[lotNo] || {};

            // 네 상태로 나눠 명확히 보여준다: 전량 미반영(실적 누락 의심) / 일부 반영(정상 진행
            // 중 잔량) / 반납됨(도장에서 이미 사출창고로 돌려보냄) / 전량 반영(정상 소진).
            var isPartial = isMissing && used > 0.001;
            var isReturned = !isMissing && returned > 0.001;
            // 상태 오른쪽에 "사용 LOT"/"반납 LOT"을 명시한다 — 이 행의 사출LOT(lotNo)이 실제
            // 도장 투입 또는 반납에 쓰인 그 LOT이므로, 추상적인 "투입 N"이 아니라 사출LOT
            // 번호를 그대로 붙여 보여준다(작업 실적 상세의 "사출LOT" 카드와 같은 표기).
            var usedLotTag = used > 0.001
                ? '<span style="font-size:0.68rem;font-weight:700;color:#0891b2;background:rgba(8,145,178,.08);' +
                  'border:1px solid rgba(8,145,178,.3);border-radius:4px;padding:1px 6px;white-space:nowrap;">' +
                  '사용 LOT ' + _pwEsc(lotNo) + ' · ' + UIUtils.formatNumber(used) + ' EA</span>'
                : '';
            var returnedLotTag = returned > 0.001
                ? '<span style="font-size:0.68rem;font-weight:700;color:#7c2d12;background:rgba(124,45,18,.08);' +
                  'border:1px solid rgba(124,45,18,.3);border-radius:4px;padding:1px 6px;white-space:nowrap;">' +
                  '반납 LOT ' + _pwEsc(lotNo) + ' · ' + UIUtils.formatNumber(returned) + ' EA</span>'
                : '';
            var statusCell = isReturned
                ? '<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;color:#7c2d12;white-space:nowrap;">' +
                  '<span style="display:inline-flex;align-items:center;gap:3px;">↩ 반납됨' +
                  (used > 0.001 ? ' · 투입 ' + UIUtils.formatNumber(used) : '') + '</span>' +
                  usedLotTag + returnedLotTag + '</span>'
                : (isPartial
                ? '<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;color:#b45309;white-space:nowrap;">' +
                  '<span style="display:inline-flex;align-items:center;gap:3px;">' +
                  (readOnly ? '' : '<span class="material-symbols-outlined" style="font-size:14px;">add_circle</span>') +
                  '일부 반영 · 미반영 +' + UIUtils.formatNumber(diff) + ' EA</span>' + usedLotTag + returnedLotTag + '</span>'
                : (isMissing
                    ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.74rem;font-weight:700;color:#dc2626;white-space:nowrap;">' +
                      (readOnly ? '' : '<span class="material-symbols-outlined" style="font-size:14px;">add_circle</span>') +
                      '미반영 +' + UIUtils.formatNumber(diff) + ' EA</span>'
                    : '<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;color:#16a34a;white-space:nowrap;">' +
                      '✓ 반영됨</span>' + usedLotTag));

            var cells =
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(detail.date || maps.day || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(detail.time || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _inboundLocationCellHtml(!!detail.isRework) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(detail.carModel || maps.carModel || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(_displayInjPartName(detail.carModel || maps.carModel, detail.partName || maps.injPartName, detail.color) || detail.partName || maps.injPartName || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(detail.color || '-') + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;font-family:monospace;font-weight:700;">' + _pwEsc(lotNo) + '</td>' +
                '<td style="padding:5px 8px;white-space:nowrap;">' + _pwEsc(detail.inspDate || '-') + '</td>' +
                '<td style="padding:5px 8px;text-align:right;font-weight:700;white-space:nowrap;">' + UIUtils.formatNumber(received) + '</td>' +
                '<td style="padding:5px 8px;text-align:right;white-space:nowrap;">' + statusCell + '</td>';

            if (isMissing && !readOnly) {
                return '<tr class="pw-unmatched-lot-row" data-lot="' + _pwEsc(lotNo) + '" data-qty="' + diff + '"' +
                    ' onclick="PaintingWorkModule.addMissingLotRow(this)"' +
                    ' style="cursor:pointer;background:' + (isPartial ? 'rgba(180,83,9,0.04)' : '#fff') +
                    ';border-bottom:1px solid ' + (isPartial ? 'rgba(180,83,9,0.25)' : 'rgba(220,38,38,0.2)') + ';">' + cells + '</tr>';
            }
            if (isMissing) {
                return '<tr style="background:' + (isPartial ? 'rgba(180,83,9,0.05)' : 'rgba(220,38,38,0.04)') +
                    ';border-bottom:1px solid ' + (isPartial ? 'rgba(180,83,9,0.2)' : 'rgba(220,38,38,0.2)') + ';">' + cells + '</tr>';
            }
            if (isReturned) {
                return '<tr style="background:rgba(124,45,18,0.05);border-bottom:1px solid rgba(124,45,18,0.15);">' + cells + '</tr>';
            }
            return '<tr style="background:rgba(22,163,74,0.05);border-bottom:1px solid rgba(22,163,74,0.15);">' + cells + '</tr>';
        }).join('');

        var headerColor = totalUnmatched > 0.001 ? '#dc2626' : '#16a34a';
        var returnedSuffix = totalReturned > 0.001 ? ' · 반납 ' + UIUtils.formatNumber(totalReturned) + ' EA' : '';
        var headerText;
        if (readOnly) {
            headerText = totalUnmatched > 0.001
                ? '당일 현장 입고 LOT — 미반영 ' + UIUtils.formatNumber(totalUnmatched) + ' EA' + returnedSuffix
                : '당일 현장 입고 LOT — 모두 반영됨' + returnedSuffix;
        } else {
            headerText = totalUnmatched > 0.001
                ? '⚠ 아래 LOT 중 미반영 ' + UIUtils.formatNumber(totalUnmatched) + ' EA가 있습니다' + returnedSuffix + ' — 행을 클릭하면 ②투입 목록에 자동 추가됩니다.'
                : '✓ 이 도장작업일 입고 사출자재가 모두 ②투입에 반영되었습니다.' + returnedSuffix;
        }

        var tableHtml = '<div style="overflow-x:auto;">' +
            '<table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;font-size:0.78rem;">' +
            _siteInboundTableHeadHtml() +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table></div>';

        var wrapId = readOnly ? 'pwDayInboundLotsAlert' : 'pwUnmatchedInboundWarn';
        return '<div id="' + wrapId + '" style="margin-bottom:8px;padding:10px 12px;border-radius:8px;' +
            'border:1px solid ' + headerColor + '59;background:' + headerColor + '0f;font-size:0.82rem;">' +
            '<div style="font-weight:700;color:' + headerColor + ';margin-bottom:7px;">' + headerText + '</div>' +
            tableHtml +
            '<div style="display:flex;justify-content:flex-end;gap:14px;padding-top:5px;margin-top:2px;border-top:1px solid var(--border);' +
            'font-size:0.8rem;font-weight:700;">' +
            '<span style="color:var(--accent-blue);">입고 합계 ' + UIUtils.formatNumber(totalReceived) + ' EA</span>' +
            (totalReturned > 0.001 ? '<span style="color:#7c2d12;">반납 합계 ' + UIUtils.formatNumber(totalReturned) + ' EA</span>' : '') +
            '</div>' +
            (readOnly ? '' :
            '<details style="margin-top:7px;">' +
            '<summary style="cursor:pointer;font-size:0.74rem;color:var(--text-muted);">건별 입고 시각 상세 보기</summary>' +
            _buildDayInboundListHtml(d) +
            '</details>') +
            '</div>';
    }

    function _pwEsc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** onclick 인라인 문자열용 이스케이프 — 따옴표·역슬래시가 섞인 ID로 핸들러가 깨지지 않게 */
    function _pwJs(s) {
        return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // 매칭 누락 LOT 칩 클릭 → 해당 LOT·수량으로 새 행을 추가하고, 경고 박스를 다시 계산해
    // 방금 추가한 만큼 줄어든 상태로 갱신한다.
    function addMissingLotRow(btnEl) {
        var lotNo = btnEl && btnEl.dataset ? btnEl.dataset.lot : '';
        var qty = btnEl && btnEl.dataset ? Number(btnEl.dataset.qty) || 0 : 0;
        var forceRework = !!(btnEl && btnEl.dataset && (
            btnEl.dataset.forceRework === '1' || btnEl.dataset.source === 'site_rework'
        ));
        if (!lotNo) return;
        var container = document.getElementById('pwLotRows');
        if (!container) return;
        var reworkKey = 'rework:' + lotNo;
        var excludeLots = _getSelectedLotNos(null);
        var alreadySelected = false;
        container.querySelectorAll('.pw-lot-row').forEach(function (row) {
            var s = row.querySelector('.pw-lot-sel');
            if (!s) return;
            var opt = s.options[s.selectedIndex];
            var dataNo = opt ? String(opt.getAttribute('data-lot-no') || '').trim() : '';
            var src = opt ? String(opt.getAttribute('data-lot-source') || '').trim() : '';
            if (forceRework) {
                if (s.value === reworkKey || (src === 'site_rework' && dataNo === lotNo)) alreadySelected = true;
            } else if (s.value === lotNo || s.value === reworkKey || dataNo === lotNo) {
                alreadySelected = true;
            }
        });
        var isDup = forceRework
            ? (alreadySelected || excludeLots.indexOf(reworkKey) >= 0)
            : (alreadySelected || excludeLots.indexOf(lotNo) >= 0 || excludeLots.indexOf(reworkKey) >= 0);
        if (isDup) {
            var dupRow = null;
            container.querySelectorAll('.pw-lot-row').forEach(function (row) {
                if (dupRow) return;
                var s = row.querySelector('.pw-lot-sel');
                if (!s) return;
                var opt = s.options[s.selectedIndex];
                var dataNo = opt ? String(opt.getAttribute('data-lot-no') || '').trim() : '';
                var src = opt ? String(opt.getAttribute('data-lot-source') || '').trim() : '';
                if (forceRework) {
                    if (s.value === reworkKey || (src === 'site_rework' && dataNo === lotNo)) dupRow = row;
                } else if (s.value === lotNo || s.value === reworkKey || dataNo === lotNo) {
                    dupRow = row;
                }
            });
            if (dupRow && dupRow.scrollIntoView) {
                dupRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                dupRow.style.outline = '2px solid #dc2626';
                setTimeout(function () { dupRow.style.outline = ''; }, 1500);
            }
            UIUtils.toast('LOT ' + lotNo + '는 이미 투입 목록에 추가되어 있습니다. 필요하면 해당 행의 수량을 직접 수정하세요.', 'warning');
            return;
        }
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = injPartSel ? injPartSel.value : '';
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var lotsHtml = _buildFilteredLotOptions(injPartName, cm, pn, excludeLots);
        var selectVal = forceRework ? reworkKey : lotNo;
        var isLaser = (document.getElementById('addPwIsLaserWip') || {}).value === '1';
        if (!forceRework && isLaser && lotsHtml.indexOf('value="rework:' + lotNo + '"') >= 0) selectVal = reworkKey;
        var lotOptRe = new RegExp('value="' + selectVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
        if (!lotOptRe.test(lotsHtml)) {
            var missingLabel = forceRework || selectVal === reworkKey
                ? ('현장 재사용 자재 / 사출 ' + _pwEsc(lotNo) + ' │ ' + UIUtils.formatNumber(qty) + ' EA')
                : ('이 도장작업일 미반영분 │ LOT ' + _pwEsc(lotNo) + ' │ ' + UIUtils.formatNumber(qty) + ' EA');
            var missingOpt = '<option value="' + _pwEsc(selectVal) + '" data-lot-no="' + _pwEsc(lotNo) + '" data-lot-source="' +
                ((forceRework || isLaser) ? 'site_rework' : '') + '" data-balance="' + qty + '" selected>' +
                missingLabel + '</option>';
            lotsHtml = missingOpt + lotsHtml;
        }
        container.insertAdjacentHTML('beforeend', _buildLotRow(lotsHtml, selectVal, qty));
        var rows = container.querySelectorAll('.pw-lot-row');
        var newRow = rows[rows.length - 1];
        if (newRow) {
            var sel = newRow.querySelector('.pw-lot-sel');
            var noInput = newRow.querySelector('.pw-lot-no');
            var qtyInput = newRow.querySelector('.pw-lot-qty');
            if (sel) sel.value = selectVal;
            if (noInput) noInput.value = lotNo;
            if (qtyInput) qtyInput.value = qty;
        }
        // _updateLotSummary가 ①번 경고 박스도 함께 재계산한다(방금 추가한 만큼 반영 처리).
        setTimeout(_updateLotSummary, 60);
    }

    /** ①번 "창고→도장현장 입고" 경고 박스를 ②번 LOT 선택의 현재 화면 상태로 즉시 재계산한다.
     *  저장 전 폼 값 기준이라, 아직 저장하지 않았어도 선택한 만큼 "반영"/"일부 반영"으로 보인다. */
    function _refreshUnmatchedInboundWarn(liveLots) {
        var warnEl = document.getElementById('pwUnmatchedInboundWarn');
        if (!warnEl) return;
        var base = _workViewId ? Storage.getById(STORE, _workViewId) : null;
        if (!base) {
            var cm = (document.getElementById('addPwCarModelHidden') || {}).value || '';
            var pn = (document.getElementById('addPwPartNameHidden') || {}).value || '';
            var color = (document.getElementById('addPwColorHidden') || {}).value || '';
            var line = (document.getElementById('addPwLineHidden') || {}).value
                || (typeof _currentLine !== 'undefined' ? _currentLine : '') || '';
            var date = (document.getElementById('addPwDateHidden') || {}).value
                || (typeof _currentDate !== 'undefined' ? _currentDate : '') || '';
            if (!cm || !pn || !date) return;
            var injSel = ((document.getElementById('pwInjPartSelect') || {}).value || '').trim();
            base = { carModel: cm, partName: pn, color: color, line: line, date: date, injPartName: injSel };
        } else {
            var liveInj = ((document.getElementById('pwInjPartSelect') || {}).value || '').trim();
            if (liveInj) base = Object.assign({}, base, { injPartName: liveInj });
        }
        var dSnapshot = Object.assign({}, base, { lots: liveLots || _collectLots() });
        warnEl.outerHTML = _buildUnmatchedInboundWarningHtml(dSnapshot);
    }

    function toggleReworkUseBox(checkboxEl) {
        var extras = document.getElementById('pwReworkUseExtras');
        var on = !!(checkboxEl && checkboxEl.checked);
        if (extras) extras.style.display = on ? '' : 'none';
        // 체크하는 즉시 ② 도장 투입에 현장 재사용 LOT 행을 붙이고, 해제하면 재사용 행을 뺀다.
        _execAutoFill();
        if (on && !_reworkLotRowCount()) {
            UIUtils.toast('현장 재사용 자재 잔량이 없거나, 차종·사출명·컬러가 맞는 입고가 없습니다.', 'warning');
        }
    }

    function _reworkLotRowCount() {
        var n = 0;
        document.querySelectorAll('#pwLotRows .pw-lot-row').forEach(function (row) {
            var sel = row.querySelector('.pw-lot-sel');
            var opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
            if (opt && String(opt.getAttribute('data-lot-source') || '') === 'site_rework') n++;
            else if (sel && String(sel.value || '').indexOf('rework:') === 0) n++;
        });
        return n;
    }

    /** "재사용 자재 사용" 박스의 [리워크에서 투입 처리] 버튼 — 별도 화면 이동 없이 그 자리에서
     *  ① 재사용 자재 출고(즉시 차감) → ② 도장현장 입고 확정(자동) → ③ 사출 창고 「현장 사출
     *  요청」 취소(acked 반영)까지 한 번에 처리하고, 방금 확정된 LOT을 ②투입 목록에 자동
     *  추가한다. 기본 흐름(사출 창고에서 공급)은 이 박스를 쓰지 않으면 그대로 유지된다. */
    async function applyReworkMaterial(btnEl) {
        var cm = (document.getElementById('addPwCarModelHidden') || document.getElementById('editPwCarModel') || {}).value || '';
        var pn = (document.getElementById('addPwPartNameHidden') || document.getElementById('editPwPartName') || {}).value || '';
        var color = (document.getElementById('addPwColorHidden') || document.getElementById('editPwColor') || {}).value || '';
        var line = ((document.getElementById('addPwLineHidden') || document.getElementById('editPwLineHidden') || {}).value
            || (typeof _currentLine !== 'undefined' ? _currentLine : '') || '');
        var date = (document.getElementById('addPwDateHidden') || {}).value
            || (typeof _currentDate !== 'undefined' ? _currentDate : '');
        var injPartSel = document.getElementById('pwInjPartSelect');
        var injPartName = (injPartSel && injPartSel.value) || '';
        if (!injPartName && typeof _resolveInjPartNameForWork === 'function') {
            injPartName = _resolveInjPartNameForWork(cm, pn, color) || '';
        }
        injPartName = injPartName || pn;

        var qtyEl = document.getElementById('pwReworkUseQty');
        var qty = Math.floor(Number(qtyEl && qtyEl.value) || 0);
        var statusEl = document.getElementById('pwReworkUseStatus');
        if (!(qty > 0)) {
            UIUtils.toast('사용 수량을 입력하세요.', 'warning');
            if (qtyEl) qtyEl.focus();
            return;
        }
        if (typeof ReworkWipModule === 'undefined' || typeof ReworkWipModule.dispatchFromPaintingWork !== 'function') {
            UIUtils.toast('재사용 자재 모듈을 사용할 수 없습니다.', 'error');
            return;
        }

        if (btnEl) btnEl.disabled = true;
        try {
            var actor = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            var actorLabel = actor ? String(actor.displayName || actor.name || actor.username || actor.id || '') : '';

            var outRec = await ReworkWipModule.dispatchFromPaintingWork({
                carModel: cm, partName: injPartName, color: color, qty: qty, line: line,
                note: '도장 실적 입력 — 재사용 자재 사용'
            });
            if (!outRec) {
                UIUtils.toast('재사용 자재 출고 처리에 실패했습니다.', 'error');
                return;
            }

            if (typeof PaintingInputModule !== 'undefined' && typeof PaintingInputModule.receiveFromWarehouseOut === 'function') {
                await PaintingInputModule.receiveFromWarehouseOut(outRec, {
                    useDate: date, receivedBy: actorLabel, isAutoReceived: true
                });
            }

            if (typeof InjectionWarehouseModule !== 'undefined' && typeof InjectionWarehouseModule.ackReworkUsageFromWork === 'function') {
                await InjectionWarehouseModule.ackReworkUsageFromWork(cm, injPartName, color, qty, {
                    note: '도장 실적 입력 — 재사용 자재 사용 (' + line + ')'
                });
            }

            UIUtils.toast(UIUtils.formatNumber(qty) + ' EA를 재사용 자재에서 투입 처리했습니다. 사출 창고 요청도 취소됩니다.', 'success');

            var lotNo = outRec.lotNo || (Array.isArray(outRec.lots) && outRec.lots[0] && outRec.lots[0].lotNo) || '';
            if (lotNo) {
                addMissingLotRow({ dataset: { lot: lotNo, qty: String(qty) } });
            } else {
                _refreshUnmatchedInboundWarn();
            }

            if (statusEl) {
                statusEl.style.color = '#16a34a';
                statusEl.textContent = '✓ ' + UIUtils.formatNumber(qty) + ' EA 적용됨' +
                    (UIUtils.now ? ' (' + UIUtils.now() + ')' : '');
            }
            if (qtyEl) qtyEl.value = '';
        } catch (e) {
            UIUtils.toast('재사용 자재 적용 실패: ' + (e && e.message ? e.message : e), 'error');
        } finally {
            if (btnEl) btnEl.disabled = false;
        }
    }

    // 수정 페이지 (입력 폼)
    function openWorkEditPage(id) {
        try {
            _renderWorkEditPage(id);
        } catch (error) {
            console.error('[PaintingWorkModule] openWorkEditPage failed:', error);
            UIUtils.toast('수정 화면을 여는 중 오류가 발생했습니다: ' + (error && error.message ? error.message : error), 'error');
        }
    }

    function _renderWorkEditPage(id) {
        var d = Storage.getById(STORE, id);
        if (!d) return;
        _workViewId = id;
        _suppressSelectedMetaPanel = true;

        var alertsHtml = _buildWorkAlerts(d);
        var editPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        var editPlanQty = Number((editPlan && editPlan.planQty) || d.planQty || 0);
        var editPlanQtyFmt = UIUtils.formatNumber(editPlanQty || 0);
        var editPlanReasonVisible = !!(d.planReason || d.planReasonDetail || d.planManagerNotified);
        var editQtyDiffVisible = !!(d.qtyDiffReason || d.qtyDiffDetail || d.qtyDiffManagerNotified);
        var lotsHtml = _buildEditLotOptionsHtml(d);
        var _hasValidLotOpt = /<option value="[^"]/.test(lotsHtml);
        var existLots = (d.lots && d.lots.length > 0) ? d.lots
            : (d.lotNo ? [{ lotNo: d.lotNo, qty: 0 }] : (_hasValidLotOpt ? [{ lotNo: '', qty: 0 }] : []));
        var initialLotRows = existLots.map(function(l) { return _buildLotRow(lotsHtml, l.lotNo, l.qty); }).join('');

        var editPlanReasonHtml = editPlanQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + editPlanQty + '"' +
              ' style="display:' + (editPlanReasonVisible ? 'block' : 'none') + ';margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '투입수량 대비 계획수량(<strong>' + editPlanQtyFmt + ' EA</strong>) 미달 — 사유를 입력해 주세요.</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">사유구분</label>' +
              '<select class="form-select" id="editPwPlanReason">' +
              '<option value="">-- 선택 --</option>' +
              ['계획변경','시간정지(공정문제)','설비 이상정지','설비고장','원자재문제','자재결품'].map(function(v) {
                  return '<option value="' + v + '"' + (d.planReason === v ? ' selected' : '') + '>' + v + '</option>';
              }).join('') +
              '</select></div>' +
              '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">세부 사유</label>' +
              '<input type="text" class="form-input" id="editPwPlanReasonDetail" value="' + (d.planReasonDetail || '') + '"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
              '<input type="checkbox" id="editPwPlanManagerNotified" style="width:16px;height:16px;"' + (d.planManagerNotified ? ' checked' : '') + '>' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">관리자 통보 완료</span></label></div>' +
              _buildNotifySelectorHtml('editPlan', '계획 미달 통보를 받을 담당자', d.planManagerRecipients) +
              '</div>' : '';

        var editQtyDiffHtml =
            '<div id="qtyDiffWarning" style="display:' + (editQtyDiffVisible ? 'block' : 'none') + ';margin-bottom:12px;' +
            'background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">투입/산출 수량 차이 사유</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">사유구분</label>' +
            '<select class="form-select" id="editPwQtyDiffReason">' +
            '<option value="">-- 선택 --</option>' +
            ['자재 불량','설비 고장','생산조건 NG','작업 불량','기타'].map(function(v) {
                return '<option value="' + v + '"' + (d.qtyDiffReason === v ? ' selected' : '') + '>' + v + '</option>';
            }).join('') +
            '</select></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.82rem;">세부 사유</label>' +
            '<input type="text" class="form-input" id="editPwQtyDiffDetail" value="' + (d.qtyDiffDetail || '') + '"></div>' +
            '</div>' +
            '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;">' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
            '<input type="checkbox" id="editPwQtyDiffManagerNotified" style="width:16px;height:16px;"' + (d.qtyDiffManagerNotified ? ' checked' : '') + '>' +
            '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">관리자 통보 완료</span></label></div>' +
            _buildNotifySelectorHtml('editQtyDiff', '투입/산출 차이 통보 담당자', d.qtyDiffManagerRecipients) +
            '</div>';

        var wp = (d.date || '').split('-');
        var workDateDisplay = wp.length === 3
            ? wp[1] + '-' + wp[2] + ' <small style="color:var(--text-muted);">(' + wp[0] + ')</small>'
            : (d.date || '-');

        var bodyHtml2 =
            '<div class="fade-in-up">' +
            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>상태 / 알림</h4></div>' +
            '<div class="card-body" style="padding:12px 14px;">' + alertsHtml + '</div></div>' +

            '<div class="card" style="margin-bottom:14px;">' +
            '<div class="card-body" style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:0.9rem;">' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">도장 작업일</span><div style="font-weight:700;">' + workDateDisplay + '</div></div>' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">라인</span><div style="font-weight:600;">' + (d.line || '-') + '</div></div>' +
            '<div><span style="font-size:0.72rem;color:var(--text-muted);">차종/품명</span><div style="font-weight:600;">' + (d.carModel || '') + ' / ' + (d.partName || '') + '</div></div>' +
            '</div></div>' +

            '<div class="card">' +
            '<div class="card-header" style="padding:10px 16px;"><h4 style="margin:0;font-size:0.9rem;">' +
            '<span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;margin-right:4px;">edit</span>수정</h4></div>' +
            '<div class="card-body">' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label">차종</label>' +
            '<input type="text" class="form-input" id="editPwCarModel" value="' + (d.carModel || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">품명</label>' +
            '<input type="text" class="form-input" id="editPwPartName" value="' + (d.partName || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">컬러</label>' +
            '<input type="text" class="form-input" id="editPwColor" value="' + (d.color || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">투입인원 (명)</label>' +
            '<input type="number" class="form-input" id="editPwWorkers" value="' + (d.workers || 0) + '" style="text-align:right;"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label">투입수량</label>' +
            '<input type="number" class="form-input" id="editPwInputQty" value="' + _workQtys(d).inputQty + '"' +
            ' oninput="PaintingWorkModule.checkQtyDiff();PaintingWorkModule.checkPlanQtyDiff();PaintingWorkModule.checkOverPlanQty();PaintingWorkModule._autoFillLotQtys();"' +
            ' style="text-align:right;font-weight:600;"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">완료수량</label>' +
            '<input type="number" class="form-input" id="editPwProdQty" value="' + _workQtys(d).productionQty + '"' +
            ' oninput="PaintingWorkModule._updateLotSummary();" style="text-align:right;font-weight:600;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">작업 시작시간</label>' +
            '<input type="time" class="form-input" id="editPwStartTime" value="' + (d.startTime || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label">작업 완료시간</label>' +
            '<input type="time" class="form-input" id="editPwEndTime" value="' + (d.endTime || '') + '"></div></div>' +

            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label">사출LOT</label>' +
            '<input type="hidden" id="pwInjPartSelect" value="' + _resolveInjPartNameForWork(d.carModel, d.partName, d.color) + '">' +

            _lotFlowStepHeaderHtml('1', '#2563eb', '창고 → 도장현장 입고', '(사출 창고·재사용 자재에서 이 라인으로 실제 입고된 LOT·수량)') +
            _buildUnmatchedInboundWarningHtml(d) +

            '<div style="margin-top:14px;">' +
            _lotFlowStepHeaderHtml('2', '#7c3aed', '도장 투입', '(이 작업실적에 실제 투입한 LOT·수량)') +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            '<div style="display:grid;grid-template-columns:56px 3.2fr 1.1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div style="text-align:center;">현장입고</div><div>현장 투입 LOT 선택</div>' +
            '<div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRows + '</div>' +
            '<button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>' +
            '</div>' +

            editPlanReasonHtml +
            editQtyDiffHtml +

            '<div class="form-group" style="margin-bottom:0;"><label class="form-label">비고</label>' +
            '<input type="text" class="form-input" id="editPwNote" value="' + (d.note || '') + '"></div>' +
            '</div></div>' +
            '</div>';

        var footerHtml2 =
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveEdit(\'' + id + '\')">' +
            '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 저장</button>';

        UIUtils.openModal({ title: '도장 작업 실적 수정', body: bodyHtml2, footer: footerHtml2, size: 'lg' });

        setTimeout(function() {
            var rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
            existLots.forEach(function(l, i) {
                if (!l.lotNo || !rows[i]) return;
                var sel = rows[i].querySelector('.pw-lot-sel');
                if (!sel) return;
                for (var j = 0; j < sel.options.length; j++) {
                    if (sel.options[j].value === l.lotNo) { sel.value = l.lotNo; break; }
                }
            });
            _updateLotSummary();
            (d.planManagerRecipients || []).forEach(function(userId) {
                var chk = document.querySelector('.editPlan-notify-user[value="' + userId + '"]');
                if (chk) chk.checked = true;
            });
            (d.qtyDiffManagerRecipients || []).forEach(function(userId) {
                var chk = document.querySelector('.editQtyDiff-notify-user[value="' + userId + '"]');
                if (chk) chk.checked = true;
            });
            checkQtyDiff();
            checkPlanQtyDiff();
            checkOverPlanQty();
        }, 60);
    }

    function _closeWorkViewPage() {
        UIUtils.closeModal();
        _workViewId = null;
        loadAll();
    }

    // ──────────────────────────────────────────────
    // 수정 모달 (lg)
    // ──────────────────────────────────────────────
    function edit(id) {
        try {
            _renderEditModal(id);
        } catch (error) {
            console.error('[PaintingWorkModule] edit failed:', error);
            UIUtils.toast('수정 화면을 여는 중 오류가 발생했습니다: ' + (error && error.message ? error.message : error), 'error');
        }
    }

    function _renderEditModal(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        _suppressSelectedMetaPanel = true;
        const editPlan = d.planId ? Storage.getById(PLAN_STORE, d.planId) : null;
        const editPlanQty = Number((editPlan && editPlan.planQty) || d.planQty || 0);
        const editPlanQtyFmt = UIUtils.formatNumber(editPlanQty || 0);
        const editPlanReasonVisible = !!(d.planReason || d.planReasonDetail || d.planManagerNotified);
        const editQtyDiffVisible = !!(d.qtyDiffReason || d.qtyDiffDetail || d.qtyDiffManagerNotified);

        const lotsHtml = _buildEditLotOptionsHtml(d);
        const _hasValidLotOpt = /<option value="[^"]/.test(lotsHtml);
        const existLots = (d.lots && d.lots.length > 0) ?
            d.lots :
            (d.lotNo ? [{
                lotNo: d.lotNo,
                qty: 0
            }] : (_hasValidLotOpt ? [{
                lotNo: '',
                qty: 0
            }] : []));
        const initialLotRows = existLots.map(function(l) {
            return _buildLotRow(lotsHtml, l.lotNo, l.qty);
        }).join('');
        const editPlanReasonHtml = editPlanQty > 0
            ? '<div id="pwPlanQtyReasonSection" data-plan-qty="' + editPlanQty + '"' +
              ' style="display:' + (editPlanReasonVisible ? 'block' : 'none') + ';margin-bottom:14px;' +
              'background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:12px;">' +
              '<div style="font-size:0.82rem;color:#dc2626;font-weight:600;margin-bottom:10px;">' +
              '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">trending_down</span>' +
              '투입수량 (<strong id="pwPlanInputQtyLabel">' + (editPlanReasonVisible ? UIUtils.formatNumber(d.inputQty || 0) : '-') + '</strong> EA) 이 계획수량(<strong>' + editPlanQtyFmt + ' EA</strong>) 대비 5% 이상 미달 — 사유를 입력해 주세요.' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
              '<select class="form-select" id="editPwPlanReason" style="font-size:0.85rem;">' +
              '<option value="">-- 선택 --</option>' +
              '<option value="계획변경"' + (d.planReason === '계획변경' ? ' selected' : '') + '>계획변경</option>' +
              '<option value="시간정지(공정문제)"' + (d.planReason === '시간정지(공정문제)' ? ' selected' : '') + '>시간정지(공정문제)</option>' +
              '<option value="설비 이상정지"' + (d.planReason === '설비 이상정지' ? ' selected' : '') + '>설비 이상정지</option>' +
              '<option value="설비고장"' + (d.planReason === '설비고장' ? ' selected' : '') + '>설비고장</option>' +
              '<option value="원자재문제"' + (d.planReason === '원자재문제' ? ' selected' : '') + '>원자재문제</option>' +
              '<option value="자재결품"' + (d.planReason === '자재결품' ? ' selected' : '') + '>자재결품</option>' +
              '</select></div>' +
              '<div class="form-group" style="margin:0;">' +
              '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
              '<input type="text" class="form-input" id="editPwPlanReasonDetail" value="' + (d.planReasonDetail || '') + '" placeholder="구체적인 내용을 입력해 주세요." style="font-size:0.85rem;"></div>' +
              '</div>' +
              '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
              '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
              '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
              '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 계획 미달 내용을 작업 관리자에게 즉시 보고해 주세요.' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
              '<input type="checkbox" id="editPwPlanManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;"' + (d.planManagerNotified ? ' checked' : '') + '>' +
              '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
              '</label>' +
              '</div>' +
              _buildNotifySelectorHtml('editPlan', '계획 미달 통보를 받을 담당자를 여러 명 선택하세요.', d.planManagerRecipients) +
              '</div>'
            : '';
        const editQtyDiffHtml =
            '<div id="qtyDiffWarning" style="display:' + (editQtyDiffVisible ? 'block' : 'none') + ';margin-bottom:12px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.45);border-radius:8px;padding:12px;">' +
            '<div style="font-size:0.82rem;color:#dc2626;font-weight:700;margin-bottom:10px;">' +
            '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;margin-right:4px;">warning</span>' +
            '투입수량(<strong id="pwDiffInQty">' + (editQtyDiffVisible ? UIUtils.formatNumber(d.inputQty || 0) : '-') + '</strong> EA) 과 산출수량(<strong id="pwDiffOutQty">' + (editQtyDiffVisible ? UIUtils.formatNumber(d.productionQty || 0) : '-') + '</strong> EA) 차이 사유를 입력해 주세요.' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:10px;">' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">사유구분 <span style="color:var(--accent-red);">*</span></label>' +
            '<select class="form-select" id="editPwQtyDiffReason" style="font-size:0.85rem;">' +
            '<option value="">-- 선택 --</option>' +
            '<option value="자재 불량"' + (d.qtyDiffReason === '자재 불량' ? ' selected' : '') + '>자재 불량</option>' +
            '<option value="설비 고장"' + (d.qtyDiffReason === '설비 고장' ? ' selected' : '') + '>설비 고장</option>' +
            '<option value="생산조건 NG"' + (d.qtyDiffReason === '생산조건 NG' ? ' selected' : '') + '>생산조건 NG</option>' +
            '<option value="작업 불량"' + (d.qtyDiffReason === '작업 불량' ? ' selected' : '') + '>작업 불량</option>' +
            '<option value="기타"' + (d.qtyDiffReason === '기타' ? ' selected' : '') + '>기타</option>' +
            '</select></div>' +
            '<div class="form-group" style="margin:0;">' +
            '<label class="form-label" style="font-size:0.82rem;">세부 사유 <span style="color:var(--accent-red);">*</span></label>' +
            '<input type="text" class="form-input" id="editPwQtyDiffDetail" value="' + (d.qtyDiffDetail || '') + '" placeholder="구체적인 내용을 입력해 주세요." style="font-size:0.85rem;"></div>' +
            '</div>' +
            '<div style="margin-top:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;">' +
            '<span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;">campaign</span>' +
            '<div style="flex:1;font-size:0.82rem;color:var(--text-primary);line-height:1.45;">' +
            '<strong style="color:#dc2626;">관리자 통보 필요</strong> — 투입/산출 수량 차이 내용을 작업 관리자에게 즉시 보고해 주세요.' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
            '<input type="checkbox" id="editPwQtyDiffManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;"' + (d.qtyDiffManagerNotified ? ' checked' : '') + '>' +
            '<span style="font-size:0.82rem;font-weight:600;color:#dc2626;">통보 완료</span>' +
            '</label>' +
            '</div>' +
            _buildNotifySelectorHtml('editQtyDiff', '투입/산출 차이 통보를 받을 담당자를 여러 명 선택하세요.', d.qtyDiffManagerRecipients) +
            '</div>';

        UIUtils.showModal('도장 작업 수정',
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">차종</label>' +
            '<input type="text" class="form-input" id="editPwCarModel" value="' + (d.carModel || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">품명</label>' +
            '<input type="text" class="form-input" id="editPwPartName" value="' + (d.partName || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">컬러</label>' +
            '<input type="text" class="form-input" id="editPwColor" value="' + (d.color || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입인원 (명)</label>' +
            '<input type="number" class="form-input" id="editPwWorkers" value="' + (d.workers || 0) + '" style="text-align:right;font-weight:600;"></div></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:14px;">' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">투입수량 (IN PUT)</label>' +
            '<input type="number" class="form-input" id="editPwInputQty" value="' + _workQtys(d).inputQty + '"' +
            ' oninput="PaintingWorkModule.checkQtyDiff();PaintingWorkModule.checkPlanQtyDiff();PaintingWorkModule.checkOverPlanQty();PaintingWorkModule._autoFillLotQtys();"' +
            ' style="text-align:right;font-weight:600;"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">산출 수량 (OUT PUT)</label>' +
            '<input type="number" class="form-input" id="editPwProdQty" value="' + _workQtys(d).productionQty + '"' +
            ' oninput="PaintingWorkModule._updateLotSummary();"' +
            ' style="text-align:right;font-weight:600;color:var(--accent-green);"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 시작시간</label>' +
            '<input type="time" class="form-input" id="editPwStartTime" value="' + (d.startTime || '') + '"></div>' +
            '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.83rem;">작업 완료시간</label>' +
            '<input type="time" class="form-input" id="editPwEndTime" value="' + (d.endTime || '') + '"></div></div>' +

            '<div class="form-group" style="margin-bottom:14px;">' +
            '<label class="form-label" style="font-size:0.84rem;">사출LOT</label>' +
            '<input type="hidden" id="pwInjPartSelect" value="' + _resolveInjPartNameForWork(d.carModel, d.partName, d.color) + '">' +

            _lotFlowStepHeaderHtml('1', '#2563eb', '창고 → 도장현장 입고', '(사출 창고·재사용 자재에서 이 라인으로 실제 입고된 LOT·수량)') +
            _buildUnmatchedInboundWarningHtml(d) +

            '<div style="margin-top:14px;">' +
            _lotFlowStepHeaderHtml('2', '#7c3aed', '도장 투입', '(이 작업실적에 실제 투입한 LOT·수량)') +
            '<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;">' +
            '<div style="display:grid;grid-template-columns:56px 3.2fr 1.1fr 34px;gap:8px;' +
            'font-size:0.71rem;color:var(--text-muted);margin-bottom:5px;padding:0 4px;">' +
            '<div style="text-align:center;">현장입고</div><div>현장 투입 LOT 선택</div>' +
            '<div style="text-align:right;">수량(EA)</div><div></div></div>' +
            '<div id="pwLotRows">' + initialLotRows + '</div>' +
            '<button class="btn btn-outline btn-sm" onclick="PaintingWorkModule.addLotRow()"' +
            ' style="margin-top:7px;font-size:0.82rem;">' +
            '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span> LOT 추가</button>' +
            '</div></div>' +
            '</div>' +
            editPlanReasonHtml +
            editQtyDiffHtml +

            '<div class="form-group" style="margin-bottom:0;">' +
            '<label class="form-label" style="font-size:0.83rem;">비고</label>' +
            '<input type="text" class="form-input" id="editPwNote" value="' + (d.note || '') + '"></div>',

            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>' +
            '<button class="btn btn-primary" onclick="PaintingWorkModule.saveEdit(\'' + id + '\')">저장</button>',
            'lg');

        // 기존 LOT 드롭다운 매칭
        setTimeout(function() {
            const rows = document.querySelectorAll('#pwLotRows .pw-lot-row');
            existLots.forEach(function(l, i) {
                if (!l.lotNo || !rows[i]) return;
                const sel = rows[i].querySelector('.pw-lot-sel');
                if (!sel) return;
                for (var j = 0; j < sel.options.length; j++) {
                    if (sel.options[j].value === l.lotNo) {
                        sel.value = l.lotNo;
                        break;
                    }
                }
            });
            _updateLotSummary(); // 수정 모달 열릴 때 초기 합계 표시
            (d.planManagerRecipients || []).forEach(function(userId) {
                var check = document.querySelector('.editPlan-notify-user[value="' + userId + '"]');
                if (check) check.checked = true;
            });
            (d.qtyDiffManagerRecipients || []).forEach(function(userId) {
                var check = document.querySelector('.editQtyDiff-notify-user[value="' + userId + '"]');
                if (check) check.checked = true;
            });
            checkQtyDiff();
            checkPlanQtyDiff();
            checkOverPlanQty();
        }, 60);
    }

    async function saveEdit(id) {
        const lots = _collectLots();

        // 사출 LOT 필수 검증 (saveNew와 동일) — LOT 행을 모두 지운 채 저장하면
        // 레이저 대기 입고가 LOT 없이 들어가 "LOT 미지정" 재고가 생기므로 원천에서 막는다.
        if (lots.length === 0) {
            UIUtils.toast('사출 LOT를 선택해 주세요.', 'warning');
            const firstLotNo = document.querySelector('#pwLotRows .pw-lot-sel');
            if (firstLotNo) firstLotNo.focus();
            return;
        }
        const hasInvalidLot = lots.some(function(l) { return !l.qty || l.qty <= 0; });
        if (hasInvalidLot) {
            UIUtils.toast('사출 LOT 수량을 입력해 주세요.', 'warning');
            const firstLotQty = document.querySelector('#pwLotRows .pw-lot-qty');
            if (firstLotQty) firstLotQty.focus();
            return;
        }

        // 현장 입고 확인 안 된 LOT 차단 (관리자만 예외 허용)
        const _lotCarModel = (document.getElementById('editPwCarModel') || {}).value || '';
        const _lotPartName = (document.getElementById('editPwPartName') || {}).value || '';
        const _lotInjPartName = (document.getElementById('pwInjPartSelect') || {}).value || '';
        const _lotsOk = await _confirmUnverifiedLots(lots, _lotCarModel, _lotInjPartName, false, _lotPartName);
        if (!_lotsOk) return;

        const lotNo = lots.length > 0 ? lots[0].lotNo : '';
        const startTime = (document.getElementById('editPwStartTime') || {}).value || '';
        const endTime = (document.getElementById('editPwEndTime') || {}).value || '';
        const inputQty = _toQty((document.getElementById('editPwInputQty') || {}).value);
        const prodQty = _repairProductionQty(
            inputQty,
            (document.getElementById('editPwProdQty') || {}).value,
            lots.reduce((s, l) => s + _toQty(l.qty), 0)
        );
        const hasQtyDiff = inputQty > 0 && prodQty > 0 && Math.abs(inputQty - prodQty) / inputQty > 0.01;
        const qtyDiffReason = ((document.getElementById('editPwQtyDiffReason') || {}).value || '').trim();
        const qtyDiffDetail = ((document.getElementById('editPwQtyDiffDetail') || {}).value || '').trim();
        const planReasonSection = document.getElementById('pwPlanQtyReasonSection');
        const planReasonVisible = !!(planReasonSection && planReasonSection.style.display !== 'none');
        const planReason = ((document.getElementById('editPwPlanReason') || {}).value || '').trim();
        const planReasonDetail = ((document.getElementById('editPwPlanReasonDetail') || {}).value || '').trim();

        // ── 사출 LOT 합계 ≠ 투입수량 → 저장 차단 ──
        if (lots.length > 0) {
            const _lotTotalEdit = lots.reduce((s, l) => s + _toQty(l.qty), 0);
            if (_lotTotalEdit !== inputQty) {
                UIUtils.toast(
                    '사출 LOT 수량 합계(' + UIUtils.formatNumber(_lotTotalEdit) + ' EA)와 투입수량(' + UIUtils.formatNumber(inputQty) + ' EA)이 일치하지 않습니다.',
                    'warning'
                );
                const lotSection = document.getElementById('pwLotRows');
                if (lotSection) lotSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        if (hasQtyDiff && !qtyDiffReason) {
            UIUtils.toast('투입/산출 수량 차이 사유구분을 선택해 주세요.', 'warning');
            var eqdrEl = document.getElementById('editPwQtyDiffReason');
            if (eqdrEl) eqdrEl.focus();
            return;
        }
        if (hasQtyDiff && !qtyDiffDetail) {
            UIUtils.toast('투입/산출 수량 차이 세부 사유를 입력해 주세요.', 'warning');
            var eqddEl = document.getElementById('editPwQtyDiffDetail');
            if (eqddEl) eqddEl.focus();
            return;
        }
        if (hasQtyDiff) {
            if (!_getSelectedNotifyUsers('editQtyDiff').length) {
                UIUtils.toast('투입/산출 차이 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                return;
            }
            // 통보 대상을 선택했으면 "통보 완료"는 등록 시 자동 체크
            var editQtyDiffMgrChk = document.getElementById('editPwQtyDiffManagerNotified');
            if (editQtyDiffMgrChk) editQtyDiffMgrChk.checked = true;
        }
        if (planReasonVisible && !planReason) {
            UIUtils.toast('계획 미달 사유구분을 선택해 주세요.', 'warning');
            var eprEl = document.getElementById('editPwPlanReason');
            if (eprEl) eprEl.focus();
            return;
        }
        if (planReasonVisible && !planReasonDetail) {
            UIUtils.toast('계획 미달 세부 사유를 입력해 주세요.', 'warning');
            var eprdEl = document.getElementById('editPwPlanReasonDetail');
            if (eprdEl) eprdEl.focus();
            return;
        }
        if (planReasonVisible) {
            if (!_getSelectedNotifyUsers('editPlan').length) {
                UIUtils.toast('계획 미달 통보를 받을 사용자를 한 명 이상 선택해 주세요.', 'warning');
                return;
            }
            // 통보 대상을 선택했으면 "통보 완료"는 등록 시 자동 체크
            var editPlanMgrChk = document.getElementById('editPwPlanManagerNotified');
            if (editPlanMgrChk) editPlanMgrChk.checked = true;
        }

        const editPlanNotifyUsers = planReasonVisible ? _getSelectedNotifyUsers('editPlan') : [];
        const editQtyDiffNotifyUsers = hasQtyDiff ? _getSelectedNotifyUsers('editQtyDiff') : [];

        let avgCT = 0;
        if (startTime && endTime && prodQty > 0) {
            const sh = parseInt(startTime.split(':')[0]),
                sm = parseInt(startTime.split(':')[1]);
            const eh = parseInt(endTime.split(':')[0]),
                em = parseInt(endTime.split(':')[1]);
            const totalMin = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMin > 0) avgCT = Number((totalMin * 60 / prodQty).toFixed(2));
        }

        const editCarModel = ((document.getElementById('editPwCarModel') || {}).value || '').trim();
        const editPartName = ((document.getElementById('editPwPartName') || {}).value || '').trim();
        const editColor = ((document.getElementById('editPwColor') || {}).value || '').trim();
        const editLotNos = (lots || []).map(function(l) { return String(l.lotNo || '').trim(); }).filter(Boolean);
        const editPartSeen = {};
        const editColorSeen = {};
        const editInjPartNames = [];
        const editInjColors = [];
        (lots || []).forEach(function(item) {
            const partName = String(item.partName || '').trim();
            if (partName) {
                const key = partName.toLowerCase();
                if (!editPartSeen[key]) {
                    editPartSeen[key] = true;
                    editInjPartNames.push(partName);
                }
            }
            String(item.color || '')
                .split(/[,，、\/|]/)
                .map(function(entry) { return entry.trim(); })
                .filter(Boolean)
                .forEach(function(entry) {
                    const key = entry.toLowerCase();
                    if (editColorSeen[key]) return;
                    editColorSeen[key] = true;
                    editInjColors.push(entry);
                });
        });

        // ✓ Case 3: 수량 변경 감지 (수정 전 도장 작업 조회)
        const originalWork = Storage.getById(STORE, id) || {};
        const originalQty = originalWork.productionQty || 0;
        const qtyChanged = prodQty !== originalQty;
        const qtyDiff = prodQty - originalQty;

        await Storage.update(STORE, id, {
            carModel: editCarModel,
            partName: editPartName,
            color: editColor,
            lotNo: lotNo,
            lots: lots,
            injPartName: editInjPartNames.join(', '),
            injColor: editInjColors.join(', '),
            inputQty: inputQty,
            productionQty: prodQty,
            workers: Number((document.getElementById('editPwWorkers') || {}).value) || 0,
            startTime: startTime,
            endTime: endTime,
            avgCT: avgCT,
            planReason: planReasonVisible ? planReason : '',
            planReasonDetail: planReasonVisible ? planReasonDetail : '',
            planManagerNotified: planReasonVisible ? true : false,
            planManagerRecipients: editPlanNotifyUsers,
            qtyDiffReason: hasQtyDiff ? qtyDiffReason : '',
            qtyDiffDetail: hasQtyDiff ? qtyDiffDetail : '',
            qtyDiffManagerNotified: hasQtyDiff ? true : false,
            qtyDiffManagerRecipients: editQtyDiffNotifyUsers,
            note: ((document.getElementById('editPwNote') || {}).value || '').trim()
        });

        var rememberIds = []
            .concat(editPlanNotifyUsers || [])
            .concat(editQtyDiffNotifyUsers || []);
        if (rememberIds.length && typeof AuthModule !== 'undefined' && AuthModule.saveProdNotifyRecipients) {
            AuthModule.saveProdNotifyRecipients(rememberIds);
        }

        // ✓ Case 3: 수량 변경 시 검사 기록 동기화 처리
        if (qtyChanged) {
            const inspections = (Storage.getAll(PAINTING_INSPECTIONS_STORE) || []).filter(
                insp => insp.workId === id
            );
            if (inspections.length > 0) {
                // 검사 기록이 있으면 동기화 확인 모달 표시
                _showInspectionSyncModal(id, originalQty, prodQty, qtyDiff, inspections);
            }
        }

        UIUtils.toast('수정되었습니다.', 'success');
        _workViewId = null;
        UIUtils.closeModal();
        var editedWork = Storage.getById(STORE, id);
        _attachQualityIssueToWork(editedWork);
        loadAll();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            var work = Storage.getById(STORE, id);
            await Storage.remove(STORE, id);

            // 사출 창고 재고 복원: refWorkId로 연결된 (과거) 자동 출고 기록만 역처리한다.
            // 도장 작업실적 입력 시 자동 차감 기능은 폐지됐으므로, 이제부터 저장되는 실적은
            // refWorkId 연결 출고 기록이 없다 — 이 경우 work.lots 기반으로 되살리면(구버전 호환)
            // 실제로 차감된 적 없는 재고를 잘못 입고 처리하게 되므로 더 이상 되살리지 않는다.
            if (work) {
                var invAll = Storage.getAll(INJ_INV_STORE) || [];
                var deductions = invAll.filter(function(r) {
                    return r.source === '도장 작업 출고' && r.refWorkId === id;
                });
                for (var ri = 0; ri < deductions.length; ri++) {
                    var d = deductions[ri];
                    if (!d.lotNo || !d.quantity) continue;
                    // 되돌리는 출고 기록의 차종·컬러를 그대로 승계해야 같은 품목으로 복원된다.
                    // (컬러를 빠뜨리면 컬러 없는 별도 품목이 새로 생긴다)
                    await Storage.add(INJ_INV_STORE, {
                        date: InvCalc.stampFor(work.date),
                        lotNo: d.lotNo,
                        partName: d.partName || work.partName,
                        carModel: d.carModel || work.carModel,
                        color: (d.color !== undefined ? d.color : (work.color || '')),
                        quantity: d.quantity,
                        lots: [{ lotNo: d.lotNo, qty: d.quantity }],
                        type: '입고',
                        source: '도장 작업 삭제 복원',
                        refWorkId: id
                    });
                }
            }

            // ⚠️ 삭제된 실적의 계획 상태를 '대기'로 되돌림
            if (work && work.planId) {
                var plan = Storage.getById(PLAN_STORE, work.planId);
                if (plan) {
                    plan.status = '대기';
                    await Storage.update(PLAN_STORE, work.planId, plan);
                }
            }

            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function search() {
        loadAll();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['작업일', '라인', '차종', '품명', '컬러', '사출LOT', '투입수량', '완료수량', '양품수량', '불량수량', '투입인원', '시작시간', '완료시간', '평균CT(초)', '비고'];
        const rows = data.map(d => {
            const lotStr = (d.lots && d.lots.length > 0) ?
                d.lots.map(l => l.lotNo + (l.qty ? '(' + l.qty + ')' : '')).join(' / ') :
                (d.lotNo || '');
            return [d.date, d.line, d.carModel, d.partName, d.color, lotStr,
                d.inputQty, d.productionQty, d.goodQty, d.defectQty,
                d.workers || 0, d.startTime || '', d.endTime || '', d.avgCT || 0, d.note || ''
            ];
        });
        Storage.exportToCSV(headers, rows, '도장작업일지');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // 계획 삭제 함수 (사유 입력)
    function deletePlan(planId, date, line, time) {
        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);margin-right:4px;">delete_outline</span> 계획 삭제',
            `
                <div style="margin-bottom:16px;">
                    <p style="margin:0 0 8px 0; color:var(--text-secondary);">
                        <strong>${date}</strong> ${line} <strong>${time}</strong> 의 계획을 삭제하시겠습니까?
                    </p>
                    <p style="color:var(--accent-red); font-size:0.85rem; margin:0;">
                        ⚠️ 이 작업은 되돌릴 수 없습니다.
                    </p>
                </div>
                <div class="form-group">
                    <label class="form-label">삭제 사유</label>
                    <textarea class="form-input" id="deletePlanReason" placeholder="삭제 사유를 입력하세요 (예: 중복 등록, 계획 변경, 오입력 등)" style="resize:vertical; min-height:80px;"></textarea>
                </div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-danger" onclick="PaintingWorkModule.confirmDeletePlan('${planId}', '${date}', '${line}')">
                    <span class="material-symbols-outlined" style="vertical-align:middle;">delete</span> 삭제
                </button>
            `
        );

        // 포커스 설정
        setTimeout(() => {
            const reasonInput = document.getElementById('deletePlanReason');
            if (reasonInput) reasonInput.focus();
        }, 100);
    }

    // 계획 삭제 확인
    async function confirmDeletePlan(planId, date, line) {
        const reasonInput = document.getElementById('deletePlanReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!reason) {
            UIUtils.toast('삭제 사유를 입력해주세요.', 'warning');
            if (reasonInput) reasonInput.focus();
            return;
        }

        try {
            // 계획 삭제
            await Storage.remove(PLAN_STORE, planId);

            // 삭제 이력 기록 (로그)
            const logData = {
                date: UIUtils.today(),
                time: new Date().toLocaleTimeString('ko-KR'),
                type: '계획삭제',
                planDate: date,
                line: line,
                planId: planId,
                reason: reason
            };
            console.log('계획 삭제 이력:', logData);

            UIUtils.closeModal();
            UIUtils.toast('계획이 삭제되었습니다.', 'success');
            loadAll();
        } catch (error) {
            UIUtils.toast('삭제 중 오류가 발생했습니다.', 'error');
            console.error('계획 삭제 오류:', error);
        }
    }

    // ──────────────────────────────────────────────
    // 생산계획 추가 (생산지시서 외 계획 변동분을 당일 계획에 수기 반영)
    // ──────────────────────────────────────────────
    // 도장-A: product.paintColorA 있으면 사용, 없으면 product.color / 도장-B는 paintColorB
    function _qapPlanColorForLine(product, line) {
        if (!product) return '';
        if (line === '도장-A' && product.paintColorA) return product.paintColorA;
        if (line === '도장-B' && product.paintColorB) return product.paintColorB;
        return product.color || '';
    }

    function openQuickAddPlanModal(line) {
        if (!_checkWorkAuth()) return;
        line = line || _currentLine;

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const linkedTargetIds = new Set(products.map(p => p.linkedProductId).filter(Boolean));
        let lineProducts = products.filter(p =>
            !linkedTargetIds.has(p.id) &&
            (p.process1 === line || p.process2 === line || p.process3 === line || p.process4 === line)
        );
        if (lineProducts.length === 0) lineProducts = products.filter(p => !linkedTargetIds.has(p.id));
        const carModels = UIUtils.sortCarModels([...new Set(lineProducts.map(p => p.carModel).filter(Boolean))]);
        const lineColor = line === '도장-B' ? 'var(--accent-orange)' : 'var(--accent-blue)';
        const today = UIUtils.today();

        UIUtils.showModal(`생산계획 추가 · ${line}`, `
            <div style="margin-bottom:12px;padding:8px 12px;background:rgba(37,99,235,0.05);border-left:3px solid ${lineColor};border-radius:0 6px 6px 0;font-size:0.8rem;color:var(--text-secondary);">
                생산지시서에 없는 계획 변동분을 오늘(${today}) ${line} 계획에 추가합니다. 저장 후 '생산계획 현황' 목록에서 실적을 입력할 수 있습니다.
            </div>
            <input type="hidden" id="qapLine" value="${line}">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red);">*</span></label>
                    <select class="form-select" id="qapCarModel" onchange="PaintingWorkModule._qapOnCarModelChange()">
                        <option value="">선택</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red);">*</span></label>
                    <select class="form-select" id="qapPartName" onchange="PaintingWorkModule._qapOnPartNameChange()">
                        <option value="">차종 먼저 선택</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="qapColor">
                        <option value="">품명 먼저 선택</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">계획수량 (EA) <span style="color:var(--accent-red);">*</span></label>
                    <input type="number" class="form-input" id="qapPlanQty" min="1" placeholder="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">시작시간</label>
                    <input type="time" class="form-input" id="qapStartTime">
                </div>
                <div class="form-group">
                    <label class="form-label">종료시간</label>
                    <input type="time" class="form-input" id="qapEndTime">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingWorkModule.saveQuickAddPlan()">저장</button>
        `, 'md');
    }

    function _qapOnCarModelChange() {
        const line = (document.getElementById('qapLine') || {}).value || _currentLine;
        const carModel = (document.getElementById('qapCarModel') || {}).value || '';
        const partSel = document.getElementById('qapPartName');
        const colorSel = document.getElementById('qapColor');
        if (!partSel || !colorSel) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const parts = [...new Set(products.filter(p => p.carModel === carModel).map(p => p.partName).filter(Boolean))];
        partSel.innerHTML = '<option value="">선택</option>' + parts.map(pn => `<option value="${pn}">${pn}</option>`).join('');
        colorSel.innerHTML = '<option value="">품명 먼저 선택</option>';
    }

    function _qapOnPartNameChange() {
        const line = (document.getElementById('qapLine') || {}).value || _currentLine;
        const carModel = (document.getElementById('qapCarModel') || {}).value || '';
        const partName = (document.getElementById('qapPartName') || {}).value || '';
        const colorSel = document.getElementById('qapColor');
        if (!colorSel) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const colors = [...new Set(
            products.filter(p => p.carModel === carModel && p.partName === partName)
                .map(p => _qapPlanColorForLine(p, line))
                .filter(Boolean)
        )];
        colorSel.innerHTML = '<option value="">선택</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function saveQuickAddPlan() {
        const line = (document.getElementById('qapLine') || {}).value || _currentLine;
        const carModel = (document.getElementById('qapCarModel') || {}).value || '';
        const partName = (document.getElementById('qapPartName') || {}).value || '';
        const color = (document.getElementById('qapColor') || {}).value || '';
        const planQty = parseInt((document.getElementById('qapPlanQty') || {}).value || '0', 10) || 0;
        const startTime = (document.getElementById('qapStartTime') || {}).value || '';
        const endTime = (document.getElementById('qapEndTime') || {}).value || '';

        if (!carModel) { UIUtils.toast('차종을 선택해 주세요.', 'warning'); return; }
        if (!partName) { UIUtils.toast('품명을 선택해 주세요.', 'warning'); return; }
        if (planQty <= 0) { UIUtils.toast('계획수량을 입력해 주세요.', 'warning'); return; }
        if (!startTime) { UIUtils.toast('시작시간을 입력해 주세요.', 'warning'); return; }
        if (endTime && endTime <= startTime) {
            UIUtils.toast('종료시간은 시작시간보다 늦어야 합니다.', 'warning');
            return;
        }

        const today = UIUtils.today();
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const product = products.find(p => p.carModel === carModel && p.partName === partName &&
            (!color || p.color === color || _qapPlanColorForLine(p, line) === color));

        const allPlans = Storage.getAll(PLAN_STORE) || [];
        const sameSlot = allPlans.find(p =>
            p.date === today && p.line === line &&
            (p.startTime || p.slot || '') === startTime
        );
        const sameProductOthers = allPlans.filter(p =>
            p.date === today && p.line === line &&
            p.carModel === carModel && p.partName === partName &&
            (p.color || '') === color &&
            (!sameSlot || p.id !== sameSlot.id)
        );

        const payload = {
            date: today,
            line,
            slot: startTime,
            carModel,
            partName,
            color,
            itemType: product ? product.itemType : undefined,
            planQty,
            startTime,
            endTime,
            status: '대기',
            productId: product ? product.id : undefined,
            note: '도장 작업 현황에서 수기 추가 (지시서 외 계획 변동)'
        };

        const _commitQuickAdd = async (replaceOthers) => {
            try {
                if (replaceOthers && sameProductOthers.length) {
                    for (const p of sameProductOthers) {
                        await Storage.remove(PLAN_STORE, p.id);
                    }
                }
                if (sameSlot) {
                    await Storage.update(PLAN_STORE, sameSlot.id, payload);
                } else {
                    await Storage.add(PLAN_STORE, payload);
                }
            } catch (err) {
                console.error('[PaintingWork] saveQuickAddPlan failed:', err);
                UIUtils.toast('계획 저장에 실패했습니다.', 'error');
                return;
            }
            UIUtils.closeModal();
            UIUtils.toast(sameSlot ? '기존 시간대 계획을 수정했습니다.' : '생산계획이 추가되었습니다.', 'success');
            loadAll();
        };

        // 동일 품목이 다른 시간대에 있으면 교체 여부 확인 — 무조건 add 하면 구 계획이 현황에 남음
        if (sameProductOthers.length > 0) {
            const labels = sameProductOthers.map(p =>
                `${p.startTime || p.slot || '?'} ${UIUtils.formatNumber(Number(p.planQty) || 0)}EA`
            ).join(', ');
            UIUtils.confirm(
                `오늘 ${line}에 동일 품목 계획이 이미 있습니다.\n(${labels})\n\n기존 계획을 이 내용으로 교체할까요?\n(취소하면 기존 계획을 유지한 채 추가 등록합니다)`,
                () => { _commitQuickAdd(true); },
                () => { _commitQuickAdd(false); }
            );
            return;
        }

        await _commitQuickAdd(false);
    }

    return {
        renderForLine,
        search,
        setLine,
        onDateChange,
        loadAll,
        startQualityIssueWatch,
        renderPlanSummary,
        renderUnenteredPlans,
        renderWorkList,
        updateWorkPartFilter,
        openAddModal,
        openAddModalFromPlan,
        goToWorkFromPlan,
        addLotRow,
        addMissingLotRow,
        toggleReworkUseBox,
        applyReworkMaterial,
        removeLotRow,
        onLotRowSelect,
        checkFifoWarning,
        onInjPartSelect,
        calcCT,
        onTimeChange,
        checkQtyDiff,
        checkPlanQtyDiff,
        processSiteReturn,
        checkOverPlanQty,
        toggleNotifyUsers,
        saveNew,
        _confirmSiteRemain,
        _cancelSiteRemain,
        openWorkReturnModal,
        _recalcWorkReturnTotal,
        submitWorkReturn,
        edit,
        openWorkViewPage,
        openWorkEditPage,
        _closeWorkViewPage,
        saveEdit,
        removeWork,
        resolveLaserQtyIssue,
        openLaserQtyIssueReviewModal,
        remove,
        exportData,
        deletePlan,
        confirmDeletePlan,
        openQuickAddPlanModal,
        _qapOnCarModelChange,
        _qapOnPartNameChange,
        saveQuickAddPlan,
        confirmInputInbound,
        openMaterialHistory,
        openPastInboundPicker,
        openMissingInboundForPlan,
        confirmPendingInboundForPlan,
        applyInboundUseDate,
        reassignInboundLot,
        saveManualPastInbound,
        onPastInboundCarChange,
        onPastInboundPartChange,
        _matHistRender: function() {},
        _matHistDelete: function() {},
        _matHistEdit: function() {},
        _matHistSaveEdit: function() {},
        _matHistPick: function() {},
        _matHistToggleAll: function() {},
        _matHistApplySelected: function() {},
        renderInputStockSection,
        _validateLotQty,
        _updateLotSummary,
        _autoFillLotQtys,
        promptLogisticsSupplyNotify,
        confirmLogisticsSupplyNotify
    };
})();


// ===================================================================
// 도장 검사 (불량 집계) - 생산 계획 지시서 연동
// ===================================================================
const PaintingInspectionModule = (function() {
    const STORE = DB.STORES.PAINTING_INSPECTIONS;
    const DEFECT_STORE = DB.STORES.DEFECT_TYPES;
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;
    const PAINTING_WORK_STORE = DB.STORES.PAINTING_WORK;
    const INJ_INV_STORE = DB.STORES.INJECTION_INVENTORY;
    const INJECTMAT_STORE = DB.STORES.INJECTION_MATERIALS;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const STANDARD_UPLOAD_ROLES = ['admin', 'prod_manager', 'quality_manager', 'paint_line_op'];
    const NONCONFORM_STANDARD_IMAGE_KEY = 'painting_nonconform_standard_image_v1';
    // 외관 검사 중간 임시 저장 — 서버 config에 workId별로 보관
    const INSPECTION_DRAFT_KEY = 'painting_inspection_drafts';
    let _inspectionDraftCache = null;      // { [workId]: draftData }
    let _currentInspectionExpectedSec = 0; // 현재 검사 모달의 예상 검사 시간(초)
    let _piWorkId = null;
    let _piWorkInspectedQty = 0;

    // 현재 카운팅 상태
    let state = {
        selectedProduct: null,
        selectedPlan: null,
        selectedWork: null, // 도장 작업 완료에서 선택한 작업
        inspectionWaitingWorks: {},
        counts: {},
        currentTab: 'inspection' // 'inspection' | 'completion' | 'nonconform-standard'
    };
    let _nonconformStandardImage = null;

    function _injColorMatches(matColor, planColor) {
        if (!matColor || !planColor) return true;
        var mc = String(matColor).trim().toLowerCase().replace(/\s+/g, '');
        var pc = String(planColor).trim().toLowerCase().replace(/\s+/g, '');
        if (mc === pc) return true;
        return mc.split(/[,，\/]/).map(function(c) { return c.trim(); })
            .some(function(c) { return c === pc; });
    }

    function _getMatchedInjectionColors(carModel, partName, planColor) {
        if (!partName) return [];
        var materials = Storage.getAll(INJECTMAT_STORE) || [];
        var seen = {};
        var colors = [];
        materials.forEach(function(m) {
            if (!m) return;
            var nameMatch = m.mfgProductName === partName || m.mfgProductName2 === partName;
            var modelMatch = !carModel || !m.carModel || m.carModel === carModel;
            var colorMatch = _injColorMatches(m.injColor, planColor || '');
            if (!nameMatch || !modelMatch || !colorMatch || !m.injColor) return;
            String(m.injColor || '')
                .split(/[,，、\/|]/)
                .map(function(c) { return c.trim(); })
                .filter(Boolean)
                .forEach(function(color) {
                    var key = color.toLowerCase();
                    if (seen[key]) return;
                    seen[key] = true;
                    colors.push(color);
                });
        });
        return colors;
    }

    function _getInjectionLotColorsForWork(work) {
        if (!work) return [];
        var inventory = Storage.getAll(INJ_INV_STORE) || [];
        var lotNos = [];
        if (Array.isArray(work.lots) && work.lots.length > 0) {
            lotNos = work.lots.map(function(lot) { return String(lot && lot.lotNo || '').trim(); }).filter(Boolean);
        } else if (work.lotNo) {
            lotNos = String(work.lotNo)
                .split(',')
                .map(function(lotNo) { return lotNo.trim(); })
                .filter(Boolean);
        }
        if (!lotNos.length) return [];

        var seen = {};
        var colors = [];
        inventory.forEach(function(item) {
            if (!item || !item.lotNo) return;
            if (lotNos.indexOf(String(item.lotNo).trim()) < 0) return;
            var color = String(item.color || item.injColor || '').trim();
            if (!color) return;
            String(color)
                .split(/[,，、\/|]/)
                .map(function(c) { return c.trim(); })
                .filter(Boolean)
                .forEach(function(entry) {
                    var key = entry.toLowerCase();
                    if (seen[key]) return;
                    seen[key] = true;
                    colors.push(entry);
                });
        });
        return colors;
    }

    function _getInjectionMetaForWork(work) {
        if (!work) {
            return { partNames: [], colors: [], partNameText: '-', colorText: '-' };
        }
        var partSeen = {};
        var colorSeen = {};
        var partNames = [];
        var colors = [];

        if (Array.isArray(work.lots) && work.lots.length > 0) {
            work.lots.forEach(function(lot) {
                if (!lot) return;
                var partName = String(lot.partName || '').trim();
                var color = String(lot.color || '').trim();
                if (partName) {
                    var partKey = partName.toLowerCase();
                    if (!partSeen[partKey]) {
                        partSeen[partKey] = true;
                        partNames.push(partName);
                    }
                }
                if (color) {
                    String(color)
                        .split(/[,，、\/|]/)
                        .map(function(entry) { return entry.trim(); })
                        .filter(Boolean)
                        .forEach(function(entry) {
                            var colorKey = entry.toLowerCase();
                            if (colorSeen[colorKey]) return;
                            colorSeen[colorKey] = true;
                            colors.push(entry);
                        });
                }
            });
        }

        if (!partNames.length && work.injPartName) {
            partNames = String(work.injPartName).split(',').map(function(name) { return name.trim(); }).filter(Boolean);
        }
        if (!colors.length && work.injColor) {
            colors = String(work.injColor).split(',').map(function(color) { return color.trim(); }).filter(Boolean);
        }

        if (!partNames.length || !colors.length) {
            var inventory = Storage.getAll(INJ_INV_STORE) || [];
            var injectionPartCandidates = [];
            var lotNos = [];
            if (Array.isArray(work.lots) && work.lots.length > 0) {
                lotNos = work.lots.map(function(lot) { return String(lot && lot.lotNo || '').trim(); }).filter(Boolean);
            } else if (work.lotNo) {
                lotNos = String(work.lotNo).split(',').map(function(lotNo) { return lotNo.trim(); }).filter(Boolean);
            }
            if (work.injPartName) {
                injectionPartCandidates = String(work.injPartName)
                    .split(',')
                    .map(function(name) { return name.trim(); })
                    .filter(Boolean);
            } else {
                var materialCandidates = Storage.getAll(INJECTMAT_STORE) || [];
                injectionPartCandidates = materialCandidates
                    .filter(function(item) {
                        if (!item) return false;
                        var nameMatch = item.mfgProductName === (work.partName || '') || item.mfgProductName2 === (work.partName || '');
                        var modelMatch = !work.carModel || !item.carModel || item.carModel === work.carModel;
                        return nameMatch && modelMatch && item.injPartName;
                    })
                    .map(function(item) { return String(item.injPartName || '').trim(); })
                    .filter(Boolean);
            }
            var candidateKeySet = {};
            injectionPartCandidates.forEach(function(name) {
                candidateKeySet[String(name).toLowerCase()] = true;
            });
            inventory.forEach(function(item) {
                if (!item || !item.lotNo) return;
                if (lotNos.indexOf(String(item.lotNo).trim()) < 0) return;
                var partName = String(item.partName || item.injPartName || '').trim();
                if (injectionPartCandidates.length && (!partName || !candidateKeySet[String(partName).toLowerCase()])) return;
                var color = String(item.color || item.injColor || '').trim();
                if (partName && !partSeen[partName.toLowerCase()]) {
                    partSeen[partName.toLowerCase()] = true;
                    partNames.push(partName);
                }
                if (color) {
                    String(color)
                        .split(/[,，、\/|]/)
                        .map(function(entry) { return entry.trim(); })
                        .filter(Boolean)
                        .forEach(function(entry) {
                            var colorKey = entry.toLowerCase();
                            if (colorSeen[colorKey]) return;
                            colorSeen[colorKey] = true;
                            colors.push(entry);
                        });
                }
            });
        }

        return {
            partNames: partNames,
            colors: colors,
            partNameText: partNames.length ? partNames.join(', ') : '-',
            colorText: colors.length ? colors.join(', ') : '-'
        };
    }

    function _isPlatingInjectionColor(carModel, partName, planColor) {
        var colors = _getMatchedInjectionColors(carModel, partName, planColor);
        if (!colors.length && planColor) colors = [String(planColor)];
        return colors.some(function(color) {
            return /(crom|chrom|chrome|도금)/i.test(String(color || '').trim());
        });
    }

    function _isPlatingForWork(work) {
        if (!work) return false;
        var lotColors = _getInjectionLotColorsForWork(work);
        if (lotColors.length) {
            return lotColors.some(function(color) {
                return /(crom|chrom|chrome|도금)/i.test(String(color || '').trim());
            });
        }
        return _isPlatingInjectionColor(work.carModel, work.partName, work.color);
    }

    // 제품 공정 순서(process1~4)에 레이저 공정이 포함된 제품인지 판단
    function _isLaserForWork(work) {
        if (!work) return false;
        var products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        var product = products.find(function(p) {
            return p.carModel === work.carModel && p.partName === work.partName;
        });
        if (!product) return false;
        for (var i = 1; i <= 4; i++) {
            var proc = String(product['process' + i] || '');
            if (proc.includes('레이저') || proc.includes('레이져') || /laser/i.test(proc)) return true;
        }
        return false;
    }

    // 레이져 후 재공품(t1xx lens, park, p702 lens 등) — 도장-B 등 2차 도장 라인
    function _isLaserWipWork(work) {
        if (!work) return false;
        var products = Storage.getAll(PRODUCTS_STORE) || [];
        var product = products.find(function(p) {
            return p.carModel === work.carModel && p.partName === work.partName;
        });
        if (!product) {
            var hasOut = (Storage.getAll(INJ_INV_STORE) || []).some(function(r) {
                return r.source === '도장 작업 출고' && String(r.refWorkId || '') === String(work.id || '');
            });
            return !hasOut;
        }
        var lineLow = String(work.line || '').toLowerCase().replace(/\s+/g, '');
        if (!lineLow) return false;
        var seenLaser = false;
        for (var pi = 1; pi <= 4; pi++) {
            var pv = String(product['process' + pi] || '').toLowerCase().replace(/\s+/g, '');
            if (!pv) break;
            if (pv.includes('레이') || pv.includes('laser')) { seenLaser = true; continue; }
            if (seenLaser && pv.includes('도장')) {
                if (pv === lineLow) return true;
                if (lineLow.startsWith(pv) || (pv.length > 2 && pv.startsWith(lineLow))) return true;
                if (pv.includes('-b') && lineLow.includes('-b')) return true;
                if (pv.includes('-a') && lineLow.includes('-a')) return true;
                return false;
            }
        }
        return false;
    }

    function _getPaintingWorkByInspection(inspection) {
        if (!inspection) return null;
        const works = Storage.getAll(PAINTING_WORK_STORE) || [];
        if (inspection.workId) {
            const byId = Storage.getById(PAINTING_WORK_STORE, inspection.workId)
                || works.find(function(work) {
                    return String(work.id || '') === String(inspection.workId) || String(work.workId || '') === String(inspection.workId);
                });
            if (byId) return byId;
        }
        const inspectionLots = String(inspection.lotNo || '')
            .split(',')
            .map(function(lotNo) { return lotNo.trim(); })
            .filter(Boolean);
        return works.find(function(work) {
            const sameCar = String(work.carModel || '') === String(inspection.carModel || '');
            const samePart = String(work.partName || '') === String(inspection.partName || '');
            const sameColor = !inspection.color || !work.color || String(work.color || '') === String(inspection.color || '');
            if (!sameCar || !samePart || !sameColor) return false;
            const workLots = Array.isArray(work.lots) && work.lots.length
                ? work.lots.map(function(lot) { return String(lot && lot.lotNo || '').trim(); }).filter(Boolean)
                : String(work.lotNo || '').split(',').map(function(lotNo) { return lotNo.trim(); }).filter(Boolean);
            if (!inspectionLots.length) return true;
            return inspectionLots.some(function(lotNo) { return workLots.indexOf(lotNo) >= 0; });
        }) || null;
    }

    // 도장 작업 → 레이저 대기 입고 대상인지 판단 (LaserStandbyModule 과 동일 기준)
    // true  → 레이저 대기품으로 이동 (외관검사 대기 제외)
    // false → 도장 외관검사 → 출하대기
    // ※ 예전에는 "바로 다음 공정이 레이저"만 봐서, 마스터가 도장-B→레이저인데
    //   실적이 도장-A로 등록된 경우 외관검사에만 남고 레이저에도 안 잡히는 공백이 생겼다.
    function _laserAfterPaintLine(product, paintLineName) {
        if (!product) return false;
        if (typeof LaserStandbyModule !== 'undefined'
            && typeof LaserStandbyModule.isPaintingWorkLaserStandbyInbound === 'function') {
            return !!LaserStandbyModule.isPaintingWorkLaserStandbyInbound(
                { line: paintLineName || '' },
                product
            );
        }
        const norm = function (v) {
            return String(v || '').trim().replace(/\s+/g, '').replace(/[-_]/g, '');
        };
        const isLaserName = function (p) {
            const s = String(p || '');
            return s.includes('레이저') || s.includes('레이져') || /laser/i.test(s);
        };
        const alias = { '도장(A)': '도장-A', '도장(B)': '도장-B' };
        const paintLine = alias[String(paintLineName || '').trim()] || String(paintLineName || '').trim();
        const procs = [product.process1, product.process2, product.process3, product.process4]
            .map(function (p) { return (p || '').trim(); }).filter(Boolean);
        const paintKey = norm(paintLine);
        const paintIdx = paintKey ? procs.findIndex(function (p) { return norm(p) === paintKey; }) : -1;
        const laserIdx = procs.findIndex(isLaserName);
        if (laserIdx < 0) return false;
        // 라인 미기재·마스터 표기 불일치 → 레이저 대기로 (구데이터 호환)
        if (!paintLine || paintIdx < 0) return true;
        return laserIdx > paintIdx;
    }

    function _currentUser() {
        try {
            return (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
        } catch (e) {
            return null;
        }
    }

    function _canWriteInspection() {
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser()) return true;
        return typeof AuthModule !== 'undefined' &&
            typeof AuthModule.canWritePage === 'function' &&
            AuthModule.canWritePage('painting-inspection');
    }

    const _MANAGER_NOTIFY_ROLES = new Set(['admin', 'prod_manager', 'quality_manager']);

    function _currentUserDisplayName() {
        const user = _currentUser();
        if (!user) return '미확인 사용자';
        return String(user.displayName || user.username || user.id || '미확인 사용자');
    }

    /** 외관검사 등록 사용자 표시명 (목록·상세용) */
    function _registeredByName(rec) {
        if (!rec) return '-';
        const named = String(rec.registeredByName || rec.createdByName || '').trim();
        if (named) return named;
        const by = rec.registeredBy || rec.createdBy;
        if (by && typeof by === 'object') {
            const n = String(by.name || by.displayName || by.username || '').trim();
            if (n) return n;
        }
        if (typeof by === 'string' && by.trim()) return by.trim();
        return '-';
    }

    function _inspGood(rec) { return Number(rec && rec.goodQty) || 0; }
    function _inspRework(rec) { return Number(rec && rec.reworkQty) || 0; }
    function _inspDefectOnly(rec) { return Number(rec && rec.defectQty) || 0; }
    function _inspDefectTotal(rec) {
        const good = _inspGood(rec);
        const defect = _inspDefectOnly(rec);
        const rework = _inspRework(rec);
        const inspQty = Number(rec && rec.inspectionQty) || 0;
        if (inspQty > 0 && rework > 0) {
            if (good + defect === inspQty) return defect;
            if (good + defect + rework === inspQty) return defect + rework;
        }
        return defect;
    }
    function _inspInspectionQty(rec) {
        const stored = Number(rec && rec.inspectionQty) || 0;
        if (stored > 0) return stored;
        return _inspGood(rec) + _inspDefectTotal(rec);
    }

    function _getPartialInspectionQtys(work) {
        const productionQty = Number(work && work.productionQty) || 0;
        const workKey = work && (work.id || work.workId);
        const inspections = Storage.getAll(STORE) || [];
        const consumedFromHistory = inspections
            .filter(i => (i.workId || i.productId) === workKey)
            .reduce((s, i) => s + _inspInspectionQty(i), 0);
        const inspectedQty = Math.max(Number(work && work.inspectedQty) || 0, consumedFromHistory);
        const storedRemain = Number(work && work.remainingQty);
        const remainingQty = Number.isFinite(storedRemain) && storedRemain >= 0
            ? storedRemain
            : Math.max(0, productionQty - inspectedQty);
        return { productionQty, inspectedQty, remainingQty };
    }

    function _captureRegisteredBy() {
        const user = _currentUser();
        const name = _currentUserDisplayName();
        return {
            registeredByName: name,
            registeredBy: user ? {
                id: String(user.id || user.username || ''),
                name: name,
                role: user.role || ''
            } : { id: '', name: name, role: '' }
        };
    }

    function _getManagerNotifyUsers() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        const users = AuthModule.getUsers() || [];
        const roleMap = (AuthModule.ROLES || []).reduce(function(map, role) {
            map[role.key] = role;
            return map;
        }, {});
        return users
            .filter(function(user) {
                if (!user || user.active === false) return false;
                const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role].filter(Boolean).map(String);
                return roles.some(function(role) { return _MANAGER_NOTIFY_ROLES.has(role); });
            })
            .map(function(user) {
                const roles = [...(Array.isArray(user.roles) ? user.roles : []), user.role].filter(Boolean).map(String);
                const primary = roles.find(function(role) { return _MANAGER_NOTIFY_ROLES.has(role); }) || String(user.role || '');
                const role = roleMap[primary] || null;
                return {
                    id: String(user.id || ''),
                    name: String(user.displayName || user.username || user.id || ''),
                    role: primary,
                    roleLabel: role ? role.label : primary,
                    roleColor: role ? role.color : 'var(--text-muted)'
                };
            });
    }

    function _buildEditNotifySelectorHtml(prefix, helpText, selectedIds) {
        const users = _getManagerNotifyUsers();
        var ids = Array.isArray(selectedIds) ? selectedIds.map(String).filter(Boolean) : [];
        if (!ids.length && typeof AuthModule !== 'undefined' && AuthModule.getProdNotifyRecipientIds) {
            ids = AuthModule.getProdNotifyRecipientIds();
        }
        const selected = new Set((ids.length ? ids : users.map(function(u) { return u.id; })).map(String));
        if (!users.length) {
            return '<div style="margin-top:10px;padding:10px 12px;border:1px dashed rgba(239,68,68,0.35);border-radius:6px;font-size:0.8rem;color:var(--text-muted);">통보 가능한 관리자 사용자가 없습니다.</div>';
        }
        const groups = {};
        users.forEach(function(user) {
            const key = user.role || '__none__';
            if (!groups[key]) groups[key] = { label: user.roleLabel, color: user.roleColor, items: [] };
            groups[key].items.push(user);
        });
        const roleBlocks = Object.keys(groups).map(function(key) {
            const group = groups[key];
            return '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<div style="font-size:0.72rem;font-weight:700;color:' + group.color + ';">' + group.label + '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:5px;">' +
                group.items.map(function(user) {
                    return '<label style="display:flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(239,68,68,0.18);border-radius:6px;background:#fff;cursor:pointer;">' +
                        '<input type="checkbox" class="' + prefix + '-notify-user" value="' + user.id + '"' + (selected.has(String(user.id)) ? ' checked' : '') + ' style="width:13px;height:13px;accent-color:#dc2626;flex-shrink:0;">' +
                        '<span style="font-size:0.76rem;color:var(--text-primary);font-weight:600;">' + user.name + '</span>' +
                        '</label>';
                }).join('') +
                '</div></div>';
        }).join('');
        return '<div style="margin-top:8px;border:1px solid rgba(239,68,68,0.25);border-radius:8px;background:#fff;padding:7px 8px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">' +
            '<div style="font-size:0.76rem;font-weight:700;color:#dc2626;">통보 대상 선택</div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PaintingInspectionModule.toggleEditNotifyUsers(\'' + prefix + '\', true)">전체 선택</button>' +
            '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:5px;">' + helpText + '</div>' +
            '<div id="' + prefix + 'NotifyUserWrap" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow:auto;">' + roleBlocks + '</div>' +
            '</div>';
    }

    function _getSelectedEditNotifyUsers(prefix) {
        return Array.from(document.querySelectorAll('.' + prefix + '-notify-user:checked'))
            .map(function(el) { return String(el.value || '').trim(); })
            .filter(Boolean);
    }

    function toggleEditNotifyUsers(prefix, forceCheck) {
        const checks = Array.from(document.querySelectorAll('.' + prefix + '-notify-user'));
        if (!checks.length) return;
        const shouldCheck = typeof forceCheck === 'boolean'
            ? forceCheck
            : checks.some(function(check) { return !check.checked; });
        checks.forEach(function(check) { check.checked = shouldCheck; });
    }

    function _sendEditManagerNotification(title, body, recipientIds) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return false;
        if (!Array.isArray(recipientIds) || !recipientIds.length) return false;
        AuthModule.sendInternalMessage({
            targetType: 'user',
            targetIds: recipientIds,
            title: title,
            body: body,
            category: 'manager_notice',
            priority: 'high'
        });
        if (typeof AuthModule.saveProdNotifyRecipients === 'function') {
            AuthModule.saveProdNotifyRecipients(recipientIds);
        }
        return true;
    }

    function _buildInspectionEditChangeSummary(before, after) {
        const lines = [];
        const addLine = function(label, oldVal, newVal) {
            const o = String(oldVal == null ? '' : oldVal);
            const n = String(newVal == null ? '' : newVal);
            if (o !== n) lines.push(label + ': ' + (o || '-') + ' → ' + (n || '-'));
        };
        addLine('검사일', before.date, after.date);
        addLine('시작시간', before.inspectionStartTime, after.inspectionStartTime);
        addLine('완료시간', before.inspectionEndTime, after.inspectionEndTime);
        addLine('양품수', before.goodQty, after.goodQty);
        addLine('불량수', before.defectQty, after.defectQty);
        const oldInspectors = (before.inspectors || []).join(', ');
        const newInspectors = (after.inspectors || []).join(', ');
        if (oldInspectors !== newInspectors) lines.push('검사자: ' + (oldInspectors || '-') + ' → ' + (newInspectors || '-'));
        const oldDefTotal = (before.defects || []).reduce(function(sum, d) { return sum + (Number(d.defectCount) || 0); }, 0);
        const newDefTotal = (after.defects || []).reduce(function(sum, d) { return sum + (Number(d.defectCount) || 0); }, 0);
        if (oldDefTotal !== newDefTotal) lines.push('불량 유형 합계: ' + UIUtils.formatNumber(oldDefTotal) + ' → ' + UIUtils.formatNumber(newDefTotal));
        return lines.length ? lines.join('\n') : '세부 항목 변경 없음';
    }

    function _canUploadNonconformStandard() {
        return _canWriteInspection();
    }

    async function _loadNonconformStandardImage() {
        try {
            return await Storage.getConfigValue(NONCONFORM_STANDARD_IMAGE_KEY) || null;
        } catch (e) {
            console.warn('[PaintingInspectionModule] standard image load failed:', e);
            return null;
        }
    }

    function render(container) {
        // PaintingNavUI에서 탭을 지정해 왔으면 복원
        const pendingTab = sessionStorage.getItem('paintingInspectionTab');
        const validTabs = ['inspection', 'completion', 'nonconform-standard'];
        if (pendingTab && validTabs.includes(pendingTab)) {
            state.currentTab = pendingTab;
            sessionStorage.removeItem('paintingInspectionTab');
        } else if (pendingTab === 'residual-wip') {
            // 도장후 잔량 현황 메뉴 제거 — 구 탭 요청은 외관검사로 전환
            state.currentTab = 'inspection';
            sessionStorage.removeItem('paintingInspectionTab');
        }

        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 공유 상단 내비게이션 -->
                ${PaintingNavUI.render('painting-inspection', state.currentTab)}

                <!-- 탭 컨텐츠 -->
                <div id="tabContent"></div>
            </div>
        `;

        // 탭 컨텐츠 렌더링
        setTimeout(() => {
            _renderTabContent();
        }, 50);
    }

    function _bindTabEvents() {
        const tabButtons = document.querySelectorAll('[data-painting-tab]');
        tabButtons.forEach(function(tabEl) {
            if (tabEl.dataset.boundClick === '1') return;
            const tabKey = tabEl.getAttribute('data-painting-tab') || '';
            tabEl.addEventListener('click', function() {
                _switchTab(tabKey);
            });
            tabEl.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    _switchTab(tabKey);
                }
            });
            tabEl.dataset.boundClick = '1';
        });
    }

    // 탭 전환
    function _switchTab(tabName) {
        state.currentTab = tabName;
        const contentArea = document.getElementById('contentArea');
        if (contentArea) {
            render(contentArea);
        }
    }

    // 탭 컨텐츠 렌더링
    function _renderTabContent() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        if (state.currentTab === 'inspection') {
            // 검사 진행 탭
            tabContent.innerHTML = `
                <!-- 검사대기품 (도장 작업 완료 목록) -->
                <div class="card" style="margin-bottom:20px;width:100%;">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;"><span class="material-symbols-outlined">done_all</span> 외관 검사 대기품</h4>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            ${(typeof AuthModule !== 'undefined' && AuthModule.incomingInspNotifyAdminButtonHtml)
                                ? AuthModule.incomingInspNotifyAdminButtonHtml('insp_waiting', { small: true, label: '대기품 알림' })
                                  + AuthModule.incomingInspNotifyAdminButtonHtml('paint_insp', { small: true, label: '검사완료 알림' })
                                : ''}
                            <span style="font-size:0.75rem;color:var(--text-muted);">도장 작업 완료된 제품을 외관 검사합니다.</span>
                        </div>
                    </div>
                    <div class="card-body" id="inspectionWaitingList" style="width:100%;"></div>
                </div>

                <!-- 선택 정보 -->
                <div id="selectedInfo"></div>

                <!-- 불량 유형 선택 -->
                <div id="defectCounter"></div>

                <!-- 현재 집계 & 저장 -->
                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">summarize</span> 현재 집계</h4>
                    </div>
                    <div class="card-body" id="currentSummary"></div>
                    <div class="card-footer" style="display:flex;gap:10px;justify-content:center;">
                        <button class="btn btn-primary" onclick="PaintingInspectionModule.save()">
                            <span class="material-symbols-outlined">save</span> 저장
                        </button>
                        <button class="btn btn-secondary" onclick="PaintingInspectionModule.reset()">
                            <span class="material-symbols-outlined">restart_alt</span> 초기화
                        </button>
                    </div>
                </div>
            `;
            renderInspectionWaitingList();
            renderDefectCounter();
            renderSummary();
            // 임시 저장 목록 로드 후 대기품 배지 갱신
            _refreshInspectionDrafts();
        } else if (state.currentTab === 'completion') {
            // 검사 완료 실적 탭
            showCompletionResults();
        } else if (state.currentTab === 'nonconform-standard') {
            renderNonconformStandardPage();
        }
    }

    function _buildResidualKey(carModel, partName, color) {
        return [carModel || '', partName || '', color || ''].join('||');
    }

    function _getResidualWipItems() {
        const inspections = Storage.getAll(STORE) || [];
        const latestMap = {};
        inspections.forEach(function(item) {
            const residualQty = Number(item.residualQty || 0);
            if (residualQty <= 0) return;
            const key = _buildResidualKey(item.carModel, item.partName, item.color);
            const prev = latestMap[key];
            const currentStamp = [item.date || '', item.createdAt || '', item.id || ''].join('|');
            const prevStamp = prev ? [prev.date || '', prev.createdAt || '', prev.id || ''].join('|') : '';
            if (!prev || currentStamp > prevStamp) latestMap[key] = item;
        });
        return Object.values(latestMap)
            .map(function(item) {
                return {
                    key: _buildResidualKey(item.carModel, item.partName, item.color),
                    carModel: item.carModel || '',
                    partName: item.partName || '',
                    color: item.color || '',
                    residualQty: Number(item.residualQty || 0),
                    packUnit: Number(item.packUnit || 0),
                    packQty: Number(item.packQty || 0),
                    packBoxCount: Number(item.packBoxCount || 0),
                    inspectionDate: item.date || '',
                    paintingDate: item.paintingDate || '',
                    lotNo: item.lotNo || '',
                    inspectors: Array.isArray(item.inspectors) ? item.inspectors.filter(Boolean) : [],
                    sourceId: item.id || ''
                };
            })
            .sort(function(a, b) {
                if ((a.carModel || '') !== (b.carModel || '')) return String(a.carModel || '').localeCompare(String(b.carModel || ''));
                if ((a.partName || '') !== (b.partName || '')) return String(a.partName || '').localeCompare(String(b.partName || ''));
                return String(a.color || '').localeCompare(String(b.color || ''));
            });
    }

    function showResidualWipStatus() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const items = _getResidualWipItems();
        const totalQty = items.reduce(function(sum, item) { return sum + (Number(item.residualQty) || 0); }, 0);
        const grouped = {};
        items.forEach(function(item) {
            const key = item.carModel || '미지정';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });

        const cards = Object.keys(grouped).sort().map(function(carModel) {
            const carItems = grouped[carModel];
            const carTotal = carItems.reduce(function(sum, item) { return sum + (Number(item.residualQty) || 0); }, 0);
            const rows = carItems.map(function(item) {
                return `
                    <tr onclick="PaintingInspectionModule._showResidualDetail('${encodeURIComponent(item.key)}', event)"
                        style="cursor:pointer;"
                        onmouseover="this.style.background='var(--bg-secondary)'"
                        onmouseout="this.style.background=''">
                        <td style="padding:6px 10px;border-bottom:1px solid var(--border-color);font-weight:600;">${item.partName || '-'}</td>
                        <td style="padding:6px 10px;border-bottom:1px solid var(--border-color);font-size:0.78rem;color:var(--text-secondary);">${item.color || '-'}</td>
                        <td style="padding:6px 10px;border-bottom:1px solid var(--border-color);text-align:right;white-space:nowrap;">
                            <span style="font-size:0.95rem;font-weight:800;color:var(--accent-orange);">${UIUtils.formatNumber(item.residualQty || 0)}</span>
                            <span style="font-size:0.7rem;color:var(--text-muted);margin-left:2px;">EA</span>
                        </td>
                        <td style="padding:6px 10px;border-bottom:1px solid var(--border-color);text-align:right;font-size:0.78rem;color:var(--text-secondary);">${item.packUnit > 0 ? UIUtils.formatNumber(item.packUnit) : '-'}</td>
                        <td style="padding:6px 10px;border-bottom:1px solid var(--border-color);font-size:0.76rem;color:var(--text-muted);white-space:nowrap;">${item.inspectionDate || '-'}</td>
                    </tr>
                `;
            }).join('');

            return `
                <div style="border:1px solid var(--border-color);border-radius:10px;overflow:hidden;background:#fff;">
                    <div style="background:#f97316;color:#fff;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:1rem;">inventory_2</span>
                            ${carModel}
                            <span style="font-size:0.72rem;font-weight:500;opacity:0.9;">${carItems.length}종</span>
                        </span>
                        <div style="font-size:0.8rem;">잔량 <strong>${UIUtils.formatNumber(carTotal)}</strong> EA</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:5px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:5px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">컬러</th>
                                <th style="padding:5px 10px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">잔량</th>
                                <th style="padding:5px 10px;text-align:right;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">포장단위</th>
                                <th style="padding:5px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">최근 검사일</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }).join('');

        tabContent.innerHTML = `
            <div class="card" style="margin-bottom:18px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 도장 후 잔량 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">도장 외관검사 완료 후 포장단위 미만으로 남은 잔량 재공품입니다.</span>
                </div>
                <div class="card-body" style="padding:16px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
                        <div style="padding:14px;border:1px solid rgba(249,115,22,0.18);border-radius:10px;background:rgba(249,115,22,0.05);">
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">잔량 품목 수</div>
                            <div style="font-size:1.7rem;font-weight:800;color:#f97316;">${items.length}</div>
                        </div>
                        <div style="padding:14px;border:1px solid rgba(249,115,22,0.18);border-radius:10px;background:rgba(249,115,22,0.05);">
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">총 잔량</div>
                            <div style="font-size:1.7rem;font-weight:800;color:#f97316;">${UIUtils.formatNumber(totalQty)}<span style="font-size:0.95rem;margin-left:4px;">EA</span></div>
                        </div>
                        <div style="padding:14px;border:1px solid rgba(249,115,22,0.18);border-radius:10px;background:rgba(249,115,22,0.05);">
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">차종 수</div>
                            <div style="font-size:1.7rem;font-weight:800;color:#f97316;">${Object.keys(grouped).length}</div>
                        </div>
                    </div>
                </div>
            </div>

            ${items.length === 0
                ? `<div class="card"><div class="card-body" style="padding:40px;text-align:center;color:var(--text-muted);">현재 등록된 도장 후 잔량이 없습니다.</div></div>`
                : `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;">${cards}</div>`
            }
        `;
    }

    function _showResidualDetail(keyEnc, event) {
        if (event && event.stopPropagation) event.stopPropagation();
        const key = decodeURIComponent(keyEnc);
        const [carModel, partName, color] = key.split('||');
        const inspections = (Storage.getAll(STORE) || [])
            .filter(function(item) {
                return (item.carModel || '') === (carModel || '')
                    && (item.partName || '') === (partName || '')
                    && (item.color || '') === (color || '')
                    && typeof item.residualQty === 'number';
            })
            .sort(function(a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''))
                    || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            });
        if (!inspections.length) return;

        const rows = inspections.map(function(item) {
            return `
                <tr>
                    <td style="white-space:nowrap;">${item.date || '-'}</td>
                    <td style="white-space:nowrap;">${item.paintingDate || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(item.goodQty || 0)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(item.packQty || 0)}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-orange);">${UIUtils.formatNumber(item.residualQty || 0)}</td>
                    <td style="text-align:right;">${item.packUnit ? UIUtils.formatNumber(item.packUnit) : '-'}</td>
                    <td style="font-family:monospace;font-size:0.78rem;">${item.lotNo || '-'}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);">${_registeredByName(item)}</td>
                </tr>
            `;
        }).join('');

        UIUtils.showModal('도장 후 잔량 상세', `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div style="padding:14px 16px;border-radius:10px;background:var(--bg-secondary);border-left:4px solid #f97316;">
                    <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${carModel || '-'} / ${partName || '-'}</div>
                    <div style="margin-top:6px;font-size:0.85rem;color:var(--text-secondary);">
                        컬러 <strong>${color || '-'}</strong>
                    </div>
                </div>
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>검사일</th>
                                <th>도장작업일</th>
                                <th style="text-align:right;">양품수</th>
                                <th style="text-align:right;">포장수량</th>
                                <th style="text-align:right;">잔량</th>
                                <th style="text-align:right;">포장단위</th>
                                <th>사출 LOT</th>
                                <th>등록자</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    async function renderNonconformStandardPage() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;
        _nonconformStandardImage = await _loadNonconformStandardImage();
        const canUpload = _canUploadNonconformStandard();
        tabContent.innerHTML = `
            <div class="page-header" style="margin-bottom:14px;">
                <div class="page-actions" style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
                    <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule.printNonconformStandardPage()">
                        <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule.focusNonconformStandardPasteZone()" ${canUpload ? '' : 'disabled'} style="${canUpload ? '' : 'opacity:.5;cursor:not-allowed;'}">
                        <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 기준서 업로드
                    </button>
                </div>
            </div>
            <div class="card" style="display:inline-block;width:auto;max-width:100%;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);padding:18px 18px 24px;border-radius:18px;box-shadow:0 18px 42px rgba(15,23,42,0.14),0 6px 14px rgba(15,23,42,0.10);">
                <div id="paintingNonconformStandardPasteZone" tabindex="0" onpaste="PaintingInspectionModule.handleNonconformStandardPaste(event)" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" aria-hidden="true"></div>
                ${_nonconformStandardImage
                    ? `<div style="display:inline-flex;justify-content:flex-start;align-items:flex-start;width:fit-content;max-width:100%;border:1px solid #111;box-shadow:0 10px 28px rgba(15,23,42,0.18),0 3px 8px rgba(15,23,42,0.12);"><img src="${_nonconformStandardImage}" alt="부적합 처리 기준서" style="display:block;max-width:100%;height:auto;"></div>`
                    : `<div style="min-width:980px;min-height:1385px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1rem;">등록된 기준서 이미지가 없습니다.</div>`}
            </div>
        `;
    }

    function focusNonconformStandardPasteZone() {
        if (!_canUploadNonconformStandard()) {
            UIUtils.toast('기준서 업로드는 관리자 또는 관리 권한자만 가능합니다.', 'warning');
            return;
        }
        const zone = document.getElementById('paintingNonconformStandardPasteZone');
        if (!zone) return;
        zone.focus();
        UIUtils.toast('기준서 업로드 영역이 선택되었습니다. Ctrl+V로 붙여넣어 주세요.', 'info');
    }

    async function handleNonconformStandardPaste(event) {
        event.preventDefault();
        if (!_canUploadNonconformStandard()) {
            UIUtils.toast('기준서 업로드 권한이 없습니다.', 'warning');
            return;
        }
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
        if (!imageItem) {
            UIUtils.toast('클립보드 이미지가 없습니다. 기준서 화면을 복사한 뒤 다시 붙여넣어 주세요.', 'warning');
            return;
        }
        const file = imageItem.getAsFile();
        if (!file) {
            UIUtils.toast('이미지 읽기 중 오류가 발생했습니다.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                _nonconformStandardImage = String(reader.result || '');
                await Storage.setConfigValue(NONCONFORM_STANDARD_IMAGE_KEY, _nonconformStandardImage);
                await renderNonconformStandardPage();
                UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
            } catch (e) {
                console.warn('[PaintingInspectionModule] standard save failed:', e);
                UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('클립보드 이미지를 읽을 수 없습니다.', 'error');
        reader.readAsDataURL(file);
    }

    function printNonconformStandardPage() {
        const img = document.querySelector('#tabContent img');
        const imageSrc = img ? String(img.getAttribute('src') || '') : String(_nonconformStandardImage || '');
        if (!imageSrc) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드해 주세요.', 'warning');
            return;
        }
        const win = window.open('', 'painting_nonconform_standard_print', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(`
            <!doctype html><html lang="ko"><head><meta charset="utf-8"><title>부적합 처리 기준서</title>
            <style>
                @page { size: A4 landscape; margin:4mm 6mm 6mm 6mm; }
                html, body { margin:0; padding:0; background:#fff; }
                body { display:flex; align-items:flex-start; justify-content:center; overflow:hidden; }
                .print-sheet { width:285mm; height:198mm; display:flex; align-items:flex-start; justify-content:center; overflow:hidden; margin:0 auto; padding-top:1mm; }
                img { display:block; width:auto; height:auto; max-width:285mm; max-height:197mm; object-fit:contain; break-inside:avoid; page-break-inside:avoid; }
                * { box-sizing:border-box; break-inside:avoid; page-break-inside:avoid; }
            </style></head><body><div class="print-sheet"><img src="${imageSrc}" alt="부적합 처리 기준서"></div></body></html>
        `);
        win.document.close();
        win.focus();
        win.print();
    }

    // 검사대기품 목록 표시 (도장 완료되었으나 검사 실적이 없는 목록)
    function renderInspectionWaitingList() {
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const inspections = Storage.getAll(STORE) || []; // 검사 실적 저장소
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const el = document.getElementById('inspectionWaitingList');
        state.inspectionWaitingWorks = {};

        // 제품 조회 헬퍼 (carModel + partName + color 우선, 없으면 carModel + partName)
        function findProduct(w) {
            return products.find(p => p.carModel === w.carModel && p.partName === w.partName && p.color === w.color)
                || products.find(p => p.carModel === w.carModel && p.partName === w.partName);
        }

        function workPartialHistory(workId) {
            return inspections
                .filter(i => (i.workId || i.productId) === workId)
                .sort((a, b) =>
                    String(a.date || '').localeCompare(String(b.date || ''))
                    || String(a.inspectionStartTime || '').localeCompare(String(b.inspectionStartTime || ''))
                    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
                );
        }

        // 검사수량 = 양품 + 불량(리워크 포함). 리워크는 불량의 일부(재도장 소재).
        function inspGood(i) { return _inspGood(i); }
        function inspRework(i) { return _inspRework(i); }
        function inspDefectTotal(i) { return _inspDefectTotal(i); }
        function inspInspectionQty(i) { return _inspInspectionQty(i); }
        function inspConsumed(i) { return _inspInspectionQty(i); }

        function qtyCell(main, subHtml) {
            return `<td style="text-align:right;line-height:1.35;white-space:nowrap;">
                <div style="font-weight:800;">${main}</div>
                ${subHtml ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${subHtml}</div>` : ''}
            </td>`;
        }
        function numCell(val, color) {
            const n = Number(val) || 0;
            if (!n && val !== 0) {
                return `<td style="text-align:right;white-space:nowrap;color:var(--text-muted);">—</td>`;
            }
            return `<td style="text-align:right;white-space:nowrap;font-weight:700;color:${color || 'var(--text-primary)'};">${UIUtils.formatNumber(n)}</td>`;
        }
        const PARTIAL_PARENT_BG = '#f3ede3';
        const PARTIAL_PARENT_BORDER = 'rgba(146, 95, 30, 0.22)';
        const PARTIAL_CHILD_BG = '#faf7f2';
        const PARTIAL_ACCENT = '#92400e';
        const PARTIAL_ACCENT_LINE = 'rgba(146, 95, 30, 0.42)';
        const partialParentTdBase = `background:${PARTIAL_PARENT_BG} !important;border-top:1px solid ${PARTIAL_PARENT_BORDER};border-bottom:1px solid ${PARTIAL_PARENT_BORDER};`;
        function parentQtyCell(main, subHtml) {
            return `<td style="text-align:right;line-height:1.35;white-space:nowrap;${partialParentTdBase}">
                <div style="font-weight:800;">${main}</div>
                ${subHtml ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${subHtml}</div>` : ''}
            </td>`;
        }
        function parentNumCell(val, color) {
            const n = Number(val) || 0;
            if (!n && val !== 0) {
                return `<td style="text-align:right;white-space:nowrap;color:var(--text-muted);${partialParentTdBase}">—</td>`;
            }
            return `<td style="text-align:right;white-space:nowrap;font-weight:700;color:${color || 'var(--text-primary)'};${partialParentTdBase}">${UIUtils.formatNumber(n)}</td>`;
        }
        function childRowLabel(html) {
            return `<td colspan="6" style="padding:8px 10px 8px 20px;white-space:nowrap;border-top:1px solid ${PARTIAL_PARENT_BORDER};background:${PARTIAL_CHILD_BG};border-left:3px solid ${PARTIAL_ACCENT_LINE};">${html}</td>`;
        }
        function childQtyCell(main, subHtml) {
            return `<td style="text-align:right;line-height:1.35;white-space:nowrap;border-top:1px solid ${PARTIAL_PARENT_BORDER};background:${PARTIAL_CHILD_BG};">
                <div style="font-weight:800;">${main}</div>
                ${subHtml ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${subHtml}</div>` : ''}
            </td>`;
        }
        function childNumCell(val, color) {
            const base = `border-top:1px solid ${PARTIAL_PARENT_BORDER};background:${PARTIAL_CHILD_BG};`;
            const n = Number(val) || 0;
            if (!n && val !== 0) {
                return `<td style="text-align:right;white-space:nowrap;color:var(--text-muted);${base}">—</td>`;
            }
            return `<td style="text-align:right;white-space:nowrap;font-weight:700;color:${color || 'var(--text-primary)'};${base}">${UIUtils.formatNumber(n)}</td>`;
        }
        function childActionCell(html) {
            return `<td style="text-align:center;white-space:nowrap;border-top:1px solid ${PARTIAL_PARENT_BORDER};background:${PARTIAL_CHILD_BG};">${html}</td>`;
        }
        function childEmptyCell() {
            return `<td style="text-align:right;white-space:nowrap;color:var(--text-muted);border-top:1px solid ${PARTIAL_PARENT_BORDER};background:${PARTIAL_CHILD_BG};">—</td>`;
        }

        // 검사 미완료 작업 (inspectionStatus !== 'completed')만 필터링
        const inspectionWorks = paintingWorks.filter(w => {
            if (w.inspectionStatus === 'completed') return false;
            const product = findProduct(w);
            if (!product) return false;
            const paintLineName = (w.line || '').trim();
            if (_laserAfterPaintLine(product, paintLineName)) return false;
            return true;
        });

        if (inspectionWorks.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">외관 검사 공정 제품의 도장 작업 완료 데이터가 없습니다.</p>`;
            return;
        }

        const waitingRowsHtml = inspectionWorks.map((w, index) => {
            const lotDisplay = (w.lots && w.lots.length > 0) ?
                w.lots.map(l => l.lotNo).join(', ') : (w.lotNo || '-');

            const _wp = (w.date || '').split('-');
            const _wst = (w.startTime || '').slice(0, 5);
            const _workDateHtml = _wp.length === 3
                ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _wp[0] + '</span>' +
                  '<span style="font-weight:600;white-space:nowrap;">' + _wp[1] + '-' + _wp[2] + '</span>' +
                  (_wst ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _wst + '</span>' : '')
                : (w.date || '-');
            const waitKey = String(w.id || w.workId || [w.date || '', w.line || '', w.carModel || '', w.partName || '', w.color || '', index].join('::'));
            state.inspectionWaitingWorks[waitKey] = w;

            const _draft = _inspectionDraftCache && _inspectionDraftCache[waitKey];
            const draftBadge = _draft
                ? `<span class="badge" title="임시 저장됨 (${_formatDraftTime(_draft.savedAt)})" style="background:var(--accent-orange);color:#fff;margin-left:6px;font-size:0.68rem;">임시저장</span>`
                : '';

            const originalQty = Number(w.productionQty) || 0;
            const isPartial = w.inspectionStatus === 'partial';
            const history = isPartial ? workPartialHistory(w.id) : [];
            const consumedFromHistory = history.reduce((s, i) => s + inspConsumed(i), 0);
            const inspectedQty = Number(w.inspectedQty) || consumedFromHistory;
            const remainingStored = Number(w.remainingQty);
            const remain = Number.isFinite(remainingStored) && remainingStored >= 0
                ? remainingStored
                : Math.max(0, originalQty - Math.max(inspectedQty, consumedFromHistory));
            const progressPercent = originalQty > 0
                ? Math.round((Math.max(inspectedQty, consumedFromHistory) / originalQty) * 100)
                : 0;

            const partialBadge = isPartial
                ? `<span class="badge" style="background:${PARTIAL_ACCENT};color:#fff;margin-left:6px;font-size:0.68rem;" title="부분 검사 진행 중">부분 ${progressPercent}%</span>`
                : '';

            // 미부분: 단행 + 검사 버튼 / 부분: 상단 원수량(버튼 없음) + 회차 이력(보기) + 하단 대기(계속 검사)
            if (!isPartial) {
                const btnText = _draft ? '이어서 검사' : '외관 검사';
                const btnClass = _draft ? 'btn-outline' : 'btn-primary';
                const btnStyle = _draft ? ' style="color:var(--accent-orange);border-color:var(--accent-orange);"' : '';
                return `
                <tr${_draft ? ' style="background:rgba(245,158,11,0.06);"' : ''}>
                    <td style="line-height:1.3;white-space:nowrap;">${_workDateHtml}</td>
                    <td style="white-space:nowrap;"><span class="badge badge-info">${w.line || '-'}</span></td>
                    <td style="white-space:nowrap;">${w.carModel || '-'}</td>
                    <td style="white-space:nowrap;"><strong>${w.partName || '-'}</strong>${draftBadge}</td>
                    <td style="white-space:nowrap;">${w.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.85rem;white-space:nowrap;">${lotDisplay}</td>
                    ${qtyCell(UIUtils.formatNumber(originalQty) + ' <span style="font-size:0.68rem;font-weight:600;color:var(--text-muted);">원수량</span>', '')}
                    ${numCell(null)}
                    ${numCell(null)}
                    ${numCell(null)}
                    ${numCell(null)}
                    <td style="text-align:center;white-space:nowrap;">
                        <button class="btn btn-sm ${btnClass}" type="button" data-open-painting-inspection="${waitKey}"${btnStyle}>
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">edit</span>${btnText}
                        </button>
                    </td>
                </tr>`;
            }

            const parentRow = `
                <tr style="background:${PARTIAL_PARENT_BG};">
                    <td style="line-height:1.3;white-space:nowrap;font-weight:700;${partialParentTdBase}">${_workDateHtml}</td>
                    <td style="white-space:nowrap;font-weight:700;${partialParentTdBase}"><span class="badge badge-info">${w.line || '-'}</span></td>
                    <td style="white-space:nowrap;font-weight:700;${partialParentTdBase}">${w.carModel || '-'}</td>
                    <td style="white-space:nowrap;font-weight:800;${partialParentTdBase}"><strong>${w.partName || '-'}</strong>${partialBadge}${draftBadge}</td>
                    <td style="white-space:nowrap;font-weight:700;${partialParentTdBase}">${w.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.85rem;white-space:nowrap;font-weight:700;${partialParentTdBase}">${lotDisplay}</td>
                    ${parentQtyCell(
                        UIUtils.formatNumber(originalQty) + ' <span style="font-size:0.68rem;font-weight:600;color:var(--text-muted);">원수량</span>',
                        ''
                    )}
                    ${parentNumCell(null)}
                    ${parentNumCell(null)}
                    ${parentNumCell(null)}
                    ${parentNumCell(null)}
                    <td style="text-align:center;white-space:nowrap;color:${PARTIAL_ACCENT};font-size:0.75rem;font-weight:700;${partialParentTdBase}">진행중</td>
                </tr>`;

            let availableBefore = originalQty;
            const historyRows = history.map((insp, hi) => {
                const round = hi + 1;
                const goodQty = inspGood(insp);
                const reworkQty = inspRework(insp);
                const defectTotal = inspDefectTotal(insp);
                const inspectionQty = inspInspectionQty(insp);
                availableBefore = Math.max(0, availableBefore - inspectionQty);

                const _ip = String(insp.date || '').split('-');
                const _ist = String(insp.inspectionStartTime || '').slice(0, 5);
                const inspDateShort = _ip.length === 3
                    ? `${_ip[1]}-${_ip[2]}${_ist ? ' ' + _ist : ''}`
                    : (insp.date || '-');
                const regName = _registeredByName(insp);

                return `
                <tr>
                    ${childRowLabel(
                        `<span style="color:${PARTIAL_ACCENT};font-weight:800;margin-right:4px;">ㄴ</span>` +
                        `<span style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);">${round}차 부분검사</span>` +
                        `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:8px;">${inspDateShort}</span>` +
                        `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">등록 ${regName}</span>`
                    )}
                    ${childEmptyCell()}
                    ${childNumCell(inspectionQty, 'var(--text-primary)')}
                    ${childNumCell(goodQty, 'var(--accent-green)')}
                    ${childNumCell(defectTotal, 'var(--accent-red)')}
                    ${childNumCell(reworkQty, '#ea580c')}
                    ${childActionCell(
                        insp.id
                            ? `<button class="btn btn-sm btn-outline" type="button" onclick="PaintingInspectionModule.showInspectionDetail('${insp.id}')">보기</button>`
                            : '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>'
                    )}
                </tr>`;
            }).join('');

            const nextRound = history.length + 1;
            const waitingRow = `
                <tr>
                    ${childRowLabel(
                        `<span style="color:${PARTIAL_ACCENT};font-weight:800;margin-right:4px;">ㄴ</span>` +
                        `<span style="font-size:0.82rem;font-weight:800;color:${PARTIAL_ACCENT};">${nextRound}차 검사대기</span>` +
                        '<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">원수량 − 누적검사</span>'
                    )}
                    ${childQtyCell(
                        UIUtils.formatNumber(remain) + ' <span style="font-size:0.68rem;font-weight:600;color:' + PARTIAL_ACCENT + ';">' + nextRound + '차 대기</span>',
                        `원 ${UIUtils.formatNumber(originalQty)} − 누적 ${UIUtils.formatNumber(Math.max(inspectedQty, consumedFromHistory))}`
                    )}
                    ${childEmptyCell()}
                    ${childNumCell(null)}
                    ${childNumCell(null)}
                    ${childNumCell(null)}
                    ${childNumCell(null)}
                    ${childActionCell(
                        `<button class="btn btn-sm btn-outline" type="button" data-open-painting-inspection="${waitKey}"
                            style="color:${PARTIAL_ACCENT};border-color:${PARTIAL_ACCENT};">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px;">edit</span>계속 검사
                        </button>`
                    )}
                </tr>`;

            return parentRow + historyRows + waitingRow;
        }).join('');

        el.innerHTML = `
            <div class="data-table-wrapper" style="overflow-x:auto;width:100%;">
                <table class="data-table" style="width:100%;min-width:100%;table-layout:auto;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="white-space:nowrap;width:1%;">도장작업일</th>
                            <th style="white-space:nowrap;width:1%;">라인</th>
                            <th style="white-space:nowrap;width:1%;">차종</th>
                            <th style="white-space:nowrap;">품명</th>
                            <th style="white-space:nowrap;width:1%;">컬러</th>
                            <th style="white-space:nowrap;width:1%;">사출 LOT</th>
                            <th style="text-align:right;white-space:nowrap;width:1%;">도장완료/검사대기 수량</th>
                            <th style="text-align:right;white-space:nowrap;width:1%;">검사 수량</th>
                            <th style="text-align:right;white-space:nowrap;width:1%;">양품</th>
                            <th style="text-align:right;white-space:nowrap;width:1%;" title="불량 합계(리워크 포함)">불량</th>
                            <th style="text-align:right;white-space:nowrap;width:1%;" title="불량 중 재도장 소재">리워크</th>
                            <th style="white-space:nowrap;width:1%;">외관 검사</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${waitingRowsHtml}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);line-height:1.45;">
                부분검사 진행: 윗줄(N차 결과: 검사수량·양품·불량·리워크) → 아랫줄(다음 차 대기 = 원수량 − 누적검사) ·
                <strong>리워크는 불량 중 일부</strong>이며 재도장 소재 재고로 별도 관리됩니다.
            </div>
        `;

        if (el.dataset.waitingClickBound !== '1') {
            el.addEventListener('click', function(event) {
                const btn = event.target.closest('[data-open-painting-inspection]');
                if (!btn || !el.contains(btn)) return;
                event.preventDefault();
                event.stopPropagation();
                const workId = btn.getAttribute('data-open-painting-inspection') || '';
                openInspectionModal(workId);
            });
            el.dataset.waitingClickBound = '1';
        }
    }

    // 생산 계획 지시서 목록 표시
    function renderPlanSelector() {
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS);
        // 오늘 또는 진행 중인 계획만 표시
        const activePlans = plans.filter(p => p.status === '진행' || p.status === '대기');

        const el = document.getElementById('planSelector');

        if (activePlans.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">활성화된 생산 계획이 없습니다. 생산 계획 지시서에서 등록하세요.</p>`;
            return;
        }

        el.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>선택</th>
                            <th>지시번호</th>
                            <th>날짜</th>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th>계획수량</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activePlans.map(p => `
                            <tr style="cursor:pointer;${state.selectedPlan?.id === p.id ? 'background:#eff6ff;' : ''}" onclick="PaintingInspectionModule.selectPlan('${p.id}')">
                                <td><input type="radio" name="planSelect" ${state.selectedPlan?.id === p.id ? 'checked' : ''}></td>
                                <td><strong>${p.orderNo || '-'}</strong></td>
                                <td>${p.date}</td>
                                <td>${p.carModel || '-'}</td>
                                <td>${p.partName || '-'}</td>
                                <td>${p.color || '-'}</td>
                                <td>${UIUtils.formatNumber(p.planQty)}</td>
                                <td>${UIUtils.badge(p.status, p.status === '진행' ? 'info' : 'warning')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function selectPlan(id) {
        const plan = Storage.getById(DB.STORES.PRODUCTION_PLANS, id);
        state.selectedPlan = plan;
        state.selectedWork = null; // 도장 작업 선택 해제
        renderInspectionWaitingList();
        renderSelectedInfo();
    }

    // 도장 작업 완료에서 직접 검사 시작 (통합 입력 모달)
    function openInspectionModal(workId) {
        try {
            let work = state.inspectionWaitingWorks && state.inspectionWaitingWorks[workId]
                ? state.inspectionWaitingWorks[workId]
                : null;
            if (!work && workId) {
                work = Storage.getById(PAINTING_WORK_STORE, workId)
                    || (Storage.getAll(PAINTING_WORK_STORE) || []).find(function(item) {
                        return String(item.id || '') === String(workId) || String(item.workId || '') === String(workId);
                    });
            }
            if (!work) {
                UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
                return;
            }

            _piWorkId = workId;

            const lotDisplay = work.lots && work.lots.length > 0 ?
                work.lots.map(l => l.lotNo).join(', ') :
                (work.lotNo || '-');
            const injectionMeta = _getInjectionMetaForWork(work);

        // ✓ Case 1: 부분 검사 도장 작업 처리
            const isPartialWork = work.inspectionStatus === 'partial';
            const partialQtys = isPartialWork ? _getPartialInspectionQtys(work) : null;
            const inspectedQty = partialQtys ? partialQtys.inspectedQty : 0;
            const remainingQty = partialQtys
                ? partialQtys.remainingQty
                : (Number(work.productionQty) || 0);
            _piWorkInspectedQty = inspectedQty;
            const baseInspQty = isPartialWork ? remainingQty : (Number(work.productionQty) || 0);

            const allDefects = Storage.getAll(DEFECT_STORE) || [];
            const injectionDefects = allDefects.filter(d => d && (d.type === 'injection' || !d.type));
            const paintingDefects = allDefects.filter(d => d && d.type === 'painting');
            const platingDefects = _isPlatingForWork(work)
                ? allDefects.filter(d => d && d.type === 'plating')
                : [];
            const laserDefects = _isLaserForWork(work)
                ? allDefects.filter(d => d && d.type === 'laser')
                : [];
            const inspectors = Storage.getAll(DB.STORES.INSPECTORS) || [];

        // 포장 단위(제품 마스터) · 검사 수량 초기값
            const packUnitVal = _findPaintProductPackUnit(work.carModel, work.partName, work.color);
            const initGoodQty = Number(UIUtils.toInputNumber(baseInspQty, 0)) || 0;

        // 표준 검사 시간 → 예상 검사 시간 계산 (제품 정보의 외관검사 C.TIME 기준)
            const _stdPerEaSec    = _getInspectionStdPerEaSec(work);
            const _inspQtyForEst  = baseInspQty; // ✓ Case 1: 부분 검사인 경우 remainingQty 사용
            _currentInspectionExpectedSec = _stdPerEaSec * _inspQtyForEst;
            const expectedTimeHtml = _stdPerEaSec > 0
                ? `<div style="margin-top:2px;padding:8px 10px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.25);border-radius:6px;">
                        <div style="display:flex;justify-content:space-between;align-items:baseline;">
                            <span style="font-size:0.72rem;color:var(--text-muted);">예상 검사 시간</span>
                            <strong id="inspExpectedTimeVal" style="font-size:1rem;color:var(--accent-blue);">${_formatDurationSec(_currentInspectionExpectedSec)}</strong>
                        </div>
                        <div id="inspExpectedTimeDetail" style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">표준 ${_stdPerEaSec.toFixed(1)}초/EA × ${UIUtils.formatNumber(_inspQtyForEst)} EA</div>
                        <div id="inspExpectedTimeCompare" style="font-size:0.7rem;margin-top:3px;color:var(--text-secondary);"></div>
                   </div>`
                : `<div style="margin-top:2px;padding:8px 10px;background:var(--bg-secondary);border:1px dashed var(--border);border-radius:6px;font-size:0.72rem;color:var(--text-muted);line-height:1.4;">
                        예상 검사 시간 —
                        <span style="color:var(--accent-orange);">제품 검사 표준시간 미등록</span><br>
                        설정 › 제품 정보 › <strong>외관 검사 기초 정보(C.TIME)</strong>에서 입력하세요.
                   </div>`;

        // ✓ Case 1: 부분 검사 배너 표시
            const partialBannerHtml = isPartialWork
                ? `<div style="background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.3); border-radius:8px; padding:8px 14px; font-size:0.82rem; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue); font-size:20px;">restart_alt</span>
                    <div>
                        <strong>부분 검사 계속</strong>: 이전 ${UIUtils.formatNumber(inspectedQty)}개 검사 완료,
                        <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(remainingQty)}개</strong> 남음
                    </div>
                  </div>`
                : '';

        // 모달 HTML 작성
            let modalContent = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${partialBannerHtml}
                <!-- 도장 정보 컴팩트 배너 -->
                <div style="background:var(--bg-secondary); border-radius:8px; padding:8px 14px; display:flex; flex-wrap:wrap; gap:6px 20px; align-items:center; border-left:4px solid var(--accent-blue);">
                    <span style="font-size:0.75rem; color:var(--text-muted);">작업일&nbsp;<strong style="color:var(--text-primary);">${work.date || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">시간&nbsp;<strong style="color:var(--text-primary);">${work.startTime ? (work.startTime + (work.endTime ? ' ~ ' + work.endTime : '')) : '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">차종&nbsp;<strong style="color:var(--text-primary);">${work.carModel || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">품명&nbsp;<strong style="color:var(--text-primary);">${work.partName || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">컬러&nbsp;<strong style="color:var(--text-primary);">${work.color || '-'}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">사출명&nbsp;<strong style="color:var(--text-primary);">${injectionMeta.partNameText}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">사출컬러&nbsp;<strong style="color:var(--text-primary);">${injectionMeta.colorText}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">사출 LOT&nbsp;<strong style="color:var(--text-primary); font-family:monospace;">${lotDisplay}</strong></span>
                    <span style="color:var(--border);">|</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${isPartialWork ? '남은 검사수량' : '검사 대상'}&nbsp;<strong id="piBannerInspQty" style="color:var(--accent-blue); font-size:0.95rem;">${UIUtils.formatNumber(baseInspQty)} EA</strong>
                        <input type="hidden" id="inpInspectionQty" value="${baseInspQty}">
                        <input type="hidden" id="piInspectedQtyHidden" value="${inspectedQty}">
                        <input type="hidden" id="piProductionQtyHidden" value="${Number(work.productionQty) || 0}">
                        <input type="hidden" id="piIsPartialWorkFlag" value="${isPartialWork ? '1' : '0'}">
                        <input type="hidden" id="piStdPerEaHidden" value="${_stdPerEaSec}">
                    </span>
                </div>

                <!-- 임시 저장 이어서 작성 안내 -->
                <div id="inspDraftNotice" style="display:none; align-items:center; gap:10px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4); border-radius:8px; padding:8px 14px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-orange); font-size:20px;">history</span>
                    <span style="font-size:0.82rem; color:var(--text-primary);">
                        임시 저장된 내용을 불러왔습니다. <span style="color:var(--text-muted);">(저장: <span id="inspDraftNoticeTime">-</span>)</span> 이어서 작성 후 <strong>저장</strong>을 누르면 완료됩니다.
                    </span>
                    <button class="btn btn-sm btn-outline" style="margin-left:auto;" onclick="PaintingInspectionModule._clearInspectionDraft('${workId}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">delete</span> 임시저장 삭제
                    </button>
                </div>

                <!-- 2-컬럼 메인 레이아웃 -->
                <div style="display:grid; grid-template-columns:260px 1fr; gap:10px; align-items:start;">

                    <!-- 좌측: 검사 정보 + 수량 + 포장 -->
                    <div style="display:flex; flex-direction:column; gap:10px;">

                        <!-- 검사 시간 -->
                        <div class="card">
                            <div class="card-body" style="padding:12px;">
                                <h5 style="margin:0 0 10px 0; font-size:0.85rem; color:var(--text-primary);">검사 정보</h5>
                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">검사일자</label>
                                        <input type="date" class="form-input" id="inpInspectionDate" value="${UIUtils.today()}" style="font-weight:600; font-size:0.85rem; padding:6px 8px;">
                                    </div>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                        <div class="form-group" style="margin:0;">
                                            <label class="form-label" style="font-size:0.72rem;">시작시간</label>
                                            <input type="time" class="form-input" id="inpInspectionStartTime" style="font-weight:600; font-size:0.82rem; padding:6px 4px;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                                        </div>
                                        <div class="form-group" style="margin:0;">
                                            <label class="form-label" style="font-size:0.72rem;">완료시간</label>
                                            <input type="time" class="form-input" id="inpInspectionEndTime" style="font-weight:600; font-size:0.82rem; padding:6px 4px;" oninput="PaintingInspectionModule._calculateInspectionTime()" onchange="PaintingInspectionModule._calculateInspectionTime()">
                                        </div>
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">소요시간</label>
                                        <input type="text" class="form-input" id="inpInspectionDuration" placeholder="자동계산" readonly style="background:var(--bg-secondary); font-weight:600; font-size:0.85rem; padding:6px 8px;">
                                    </div>
                                    ${expectedTimeHtml}
                                </div>
                            </div>
                        </div>

                        <!-- 작업 수량 (작업일지 연동) -->
                        ${_buildWorkQtyCard(work, isPartialWork, inspectedQty, remainingQty)}

                        <!-- 검사 수량 -->
                        <div class="card">
                            <div class="card-body" style="padding:12px;">
                                <h5 style="margin:0 0 8px 0; font-size:0.85rem; color:var(--text-primary); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    검사 수량
                                    <!-- ✓ Case 1: 부분 검사 옵션 -->
                                    <label style="margin-left:auto; display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:400; color:var(--text-secondary); cursor:pointer;">
                                        <input type="checkbox" id="inpIsPartialInspection" style="cursor:pointer;" onchange="PaintingInspectionModule._togglePartialInspection()">
                                        <span>부분 검사</span>
                                    </label>
                                </h5>
                                <div style="margin:-2px 0 8px 0; font-size:0.68rem; color:var(--text-muted); line-height:1.35; text-align:right;">
                                    일부 검사 완료 후 출고시 체크
                                </div>
                                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">양품수</label>
                                        <input type="number" class="form-input" id="inpGoodQty" value="${initGoodQty}" min="0" style="text-align:right; font-weight:600; font-size:0.9rem; padding:5px 6px;" onchange="PaintingInspectionModule._updateDefectQty()">
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">불량수</label>
                                        <input type="number" class="form-input" id="inpDefectQty" value="0" min="0" style="text-align:right; font-weight:600; font-size:0.9rem; padding:5px 6px;" onchange="PaintingInspectionModule._updateGoodQty()">
                                    </div>
                                    <div class="form-group" style="margin:0;">
                                        <label class="form-label" style="font-size:0.72rem;">합계 (자동)</label>
                                        <input type="text" class="form-input" id="inpTotalQty" value="${UIUtils.formatNumber(initGoodQty)}" readonly style="background:var(--bg-secondary); text-align:right; font-weight:700; font-size:0.9rem; padding:5px 6px; color:var(--accent-blue);">
                                    </div>
                                </div>
                                <!-- ✓ Case 1: 부분 검사 시 설명 (최대 입력 가능 수량 안내) -->
                                <div id="piPartialInspectionInfo" style="display:none; margin-top:8px; padding:8px 10px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:6px; font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">
                                    <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; color:var(--accent-orange);">info</span>
                                    <span style="margin-left:4px;">부분 검사 시 입력한 수량(양품+불량, 최대 <strong>${UIUtils.formatNumber(baseInspQty)}</strong> EA)만 검사 완료되며, 나머지는 외관검사 대기로 유지됩니다.</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- 우측: 불량 유형 입력 (상단 정렬) -->
                    <div class="card" style="align-self:start; min-width:0;">
                        <div class="card-body" style="padding:14px;">
                            <h5 style="margin:0 0 12px 0; font-size:0.85rem; color:var(--text-primary);">불량 유형 입력</h5>

                            ${injectionDefects.length > 0 ? `
                            <div style="margin-bottom:14px;">
                                <div style="font-size:0.78rem; font-weight:700; color:#ea580c; border-bottom:2px solid #ea580c; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">precision_manufacturing</span> 사출 불량
                                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                    ${injectionDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary); display:flex; align-items:flex-start; gap:6px; min-width:0;">
                                                <button type="button" title="불량유형 보기" onclick="LaserInspectionModule.showDefectTypeView('${d.id}')" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                                </button>
                                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name}</span>
                                            </label>
                                            <input type="text" inputmode="numeric" enterkeyhint="done" id="inj-${d.id}" value="" placeholder="-" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem;" oninput="this.value=this.value.replace(/[^0-9]/g,'');PaintingInspectionModule._updateDefectTotal()">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            ${paintingDefects.length > 0 ? `
                            <div>
                                <div style="font-size:0.78rem; font-weight:700; color:#16a34a; border-bottom:2px solid #16a34a; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;">format_paint</span> 도장 불량
                                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                    ${paintingDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary); display:flex; align-items:flex-start; gap:6px; min-width:0;">
                                                <button type="button" title="불량유형 보기" onclick="LaserInspectionModule.showDefectTypeView('${d.id}')" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                                </button>
                                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name}</span>
                                            </label>
                                            <input type="text" inputmode="numeric" enterkeyhint="done" id="paint-${d.id}" value="" placeholder="-" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem;" oninput="this.value=this.value.replace(/[^0-9]/g,'');PaintingInspectionModule._updateDefectTotal()">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            ${platingDefects.length > 0 ? `
                            <div style="margin-top:14px;">
                                <div style="font-size:0.78rem; font-weight:700; color:#7c3aed; border-bottom:2px solid #7c3aed; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;color:#7c3aed;">layers</span> 도금 불량
                                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                    ${platingDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary); display:flex; align-items:flex-start; gap:6px; min-width:0;">
                                                <button type="button" title="불량유형 보기" onclick="LaserInspectionModule.showDefectTypeView('${d.id}')" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                                </button>
                                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name}</span>
                                            </label>
                                            <input type="text" inputmode="numeric" enterkeyhint="done" id="plate-${d.id}" value="" placeholder="-" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem;" oninput="this.value=this.value.replace(/[^0-9]/g,'');PaintingInspectionModule._updateDefectTotal()">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            ${laserDefects.length > 0 ? `
                            <div style="margin-top:14px;">
                                <div style="font-size:0.78rem; font-weight:700; color:#ef4444; border-bottom:2px solid #ef4444; padding-bottom:4px; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:14px;color:#ef4444;">bolt</span> 레이저 불량
                                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                    ${laserDefects.map(d => `
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <label style="font-size:0.78rem; font-weight:600; margin:0; color:var(--text-secondary); display:flex; align-items:flex-start; gap:6px; min-width:0;">
                                                <button type="button" title="불량유형 보기" onclick="LaserInspectionModule.showDefectTypeView('${d.id}')" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--border);border-radius:50%;background:#fff;color:var(--accent-blue);cursor:pointer;flex:0 0 20px;padding:0;margin-top:1px;">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
                                                </button>
                                                <span style="flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.25;" title="${(d.name || '').replace(/"/g, '&quot;')}">${d.name}</span>
                                            </label>
                                            <input type="text" inputmode="numeric" enterkeyhint="done" id="laser-${d.id}" value="" placeholder="-" style="padding:6px; border:1px solid var(--border); border-radius:4px; text-align:center; font-weight:700; font-size:0.9rem;" oninput="this.value=this.value.replace(/[^0-9]/g,'');PaintingInspectionModule._updateDefectTotal()">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- 하단 액션바: 포장 | 검사자 | 저장 -->
                    <div class="card" style="margin:0;">
                    <div class="card-body" style="padding:10px 14px;display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap;overflow-x:auto;">
                        <!-- ① 포장 단위 (제품 마스터 표시만) -->
                        <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:nowrap;">
                            <span style="font-size:0.78rem;font-weight:700;color:var(--text-primary);white-space:nowrap;display:flex;align-items:center;gap:3px;">
                                <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-blue);">inventory_2</span>포장
                            </span>
                            <div style="background:var(--bg-secondary);border-radius:6px;padding:6px 12px;white-space:nowrap;">
                                <span style="font-size:0.68rem;color:var(--text-muted);">포장 단위</span>
                                <strong id="piPackUnitDisp" style="margin-left:6px;font-size:0.95rem;color:var(--accent-blue);">
                                    ${packUnitVal ? UIUtils.formatNumber(packUnitVal) + ' EA' : '미등록'}
                                </strong>
                                <input type="hidden" id="piPackUnit" value="${packUnitVal || 0}">
                            </div>
                        </div>
                        <div style="width:1px;align-self:stretch;background:var(--border-color);flex:0 0 1px;min-height:36px;"></div>
                        <!-- ② 검사자 -->
                        <div style="display:flex;align-items:flex-end;gap:6px;flex:0 1 auto;flex-wrap:nowrap;">
                            <span style="font-size:0.78rem;font-weight:700;color:var(--text-primary);white-space:nowrap;align-self:center;padding-bottom:6px;">
                                검사자 <span style="color:var(--accent-red);">*</span>
                            </span>
                            <div style="display:flex;align-items:flex-end;gap:6px;flex:0 0 auto;flex-wrap:nowrap;" id="inspectorContainer"></div>
                            <button type="button" class="btn btn-sm btn-primary" onclick="PaintingInspectionModule._addInspectorField()" id="addInspectorBtn" style="gap:3px;padding:4px 8px;font-size:0.72rem;flex:0 0 auto;align-self:flex-end;">
                                <span class="material-symbols-outlined" style="font-size:14px;">add</span> 추가
                            </button>
                        </div>
                        <div style="width:1px;align-self:stretch;background:var(--border-color);flex:0 0 1px;min-height:36px;"></div>
                        <!-- ③ 저장 버튼 -->
                        <div style="display:flex;gap:6px;flex:0 0 auto;flex-wrap:nowrap;align-items:flex-end;">
                            <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule._saveInspectionDraft('${workId}')" style="white-space:nowrap;color:var(--accent-orange);border-color:var(--accent-orange);" title="검사 도중 다른 작업으로 변경시 임시 저장">
                                <span class="material-symbols-outlined" style="font-size:16px;">bookmark_add</span> 임시 저장
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="PaintingInspectionModule._saveInspection('${workId}')" style="white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:16px;">save</span> 검사 완료
                            </button>
                            <button class="btn btn-outline btn-sm" onclick="PaintingInspectionModule._closeInspectionModal()" style="white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:16px;">close</span> 취소
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 커스텀 모달 생성
            const modalEl = document.createElement('div');
            modalEl.className = 'modal fade';
            modalEl.style.display = 'block';
            const modalId = 'paintingInspectionModalBox';
            const modalHandleId = 'paintingInspectionModalHandle';
            modalEl.innerHTML = `
            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; border-radius: 0 !important; }
                    .modal h2 { margin: 0 0 20px 0 !important; }
                    .modal > div > button { display: none !important; }
                    .btn { display: none !important; }
                    .card { page-break-inside: avoid; border: 1px solid #ccc !important; }
                    .form-input { border: 1px solid #ccc !important; }
                    .form-select { border: 1px solid #ccc !important; }
                }
            </style>
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.28); z-index:1000; pointer-events:none;">
                <div id="${modalId}" style="position:fixed; top:4vh; left:50%; transform:translateX(-50%); background:white; border-radius:12px; max-width:90vw; max-height:92vh; width:90vw; overflow:auto; padding:16px 20px; box-shadow:0 10px 40px rgba(0,0,0,0.28); pointer-events:auto;">
                    <div id="${modalHandleId}" title="드래그하여 창 이동" style="display:flex; justify-content:space-between; align-items:center; margin:-4px -8px 12px; padding:8px 8px 10px; border-bottom:1px solid var(--border-color); cursor:move; user-select:none; touch-action:none;">
                        <h2 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:6px; pointer-events:none;">
                            <span class="material-symbols-outlined" style="font-size:1.15rem; color:var(--text-muted);">drag_indicator</span>
                            도장 검사 입력
                        </h2>
                        <button onclick="PaintingInspectionModule._closeInspectionModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted); line-height:1;">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

            document.body.appendChild(modalEl);
            if (typeof UIUtils !== 'undefined' && UIUtils.sanitizeNumberInputs) {
                UIUtils.sanitizeNumberInputs(modalEl);
            }
            _makeInspectionModalDraggable(modalEl, modalId, modalHandleId);
            _makeInspectionModalResizable(modalEl, modalId);

        // 모달에 데이터 저장 (나중에 접근하기 위해)
            modalEl.inspectionWorkId = workId;
            modalEl.injectionDefects = injectionDefects;
            modalEl.paintingDefects = paintingDefects;
            // 부모 페이지 컨테이너 저장 (닫을 때 복귀하기 위해)
            modalEl.parentPageContainer = document.querySelector('[data-page="painting-inspection"]');

        // 검사자 필드 초기화 (기본 4명) + 임시 저장 복원
            setTimeout(async () => {
                const container = document.getElementById('inspectorContainer');
                if (container) {
                    container.innerHTML = '';
                    container.inspectorCount = 0;
                    _addInspectorField(true);
                    _addInspectorField();
                }
                // ✓ Case 1: 부분 검사 도장 작업은 draft를 로드하지 않음 (새로 검사)
                if (!isPartialWork) {
                    // 임시 저장된 내용이 있으면 자동 복원
                    try {
                        const drafts = await _getInspectionDrafts();
                        const draft = drafts[workId];
                        if (draft) {
                            // ✓ Case 2: 수량 변경 감지 - draft 저장 당시와 현재 도장 수량 비교
                            if (draft.sourceProductionQty && draft.sourceProductionQty !== (work.productionQty || 0)) {
                                _showDraftQuantityMismatchModal(work, draft, workId);
                            } else {
                                _applyInspectionDraft(draft);
                                const notice = document.getElementById('inspDraftNotice');
                                const timeEl = document.getElementById('inspDraftNoticeTime');
                                if (notice) notice.style.display = 'flex';
                                if (timeEl) timeEl.textContent = _formatDraftTime(draft.savedAt);
                            }
                        }
                    } catch (e) { /* 무시 */ }
                }
            }, 100);
        } catch (error) {
            console.error('도장 검사 입력 모달 열기 실패', error);
            UIUtils.toast('외관 검사 창을 여는 중 오류가 발생했습니다.', 'error');
        }
    }

    function _makeInspectionModalDraggable(rootEl, modalId, handleId) {
        const modalBox = rootEl.querySelector('#' + modalId);
        const handle = rootEl.querySelector('#' + handleId);
        if (!modalBox || !handle || handle.dataset.dragBound === '1') return;
        handle.dataset.dragBound = '1';

        let dragState = null;

        function _clampPos(left, top) {
            // 제목줄 일부만 화면에 남기면 되도록 — 창을 거의 화면 밖으로도 이동 가능
            const w = modalBox.offsetWidth || 0;
            const minVisibleX = 140;
            const minVisibleY = 48;
            const minLeft = Math.min(0, minVisibleX - w);
            const maxLeft = Math.max(0, window.innerWidth - minVisibleX);
            const minTop = 0;
            const maxTop = Math.max(0, window.innerHeight - minVisibleY);
            return {
                left: Math.min(Math.max(left, minLeft), maxLeft),
                top: Math.min(Math.max(top, minTop), maxTop)
            };
        }

        function _syncResizeHandle() {
            const rh = rootEl.querySelector('#' + modalId + 'Resize');
            if (rh && typeof rh._place === 'function') rh._place();
        }

        function onPointerMove(event) {
            if (!dragState) return;
            const next = _clampPos(
                dragState.startLeft + (event.clientX - dragState.startX),
                dragState.startTop + (event.clientY - dragState.startY)
            );
            modalBox.style.left = next.left + 'px';
            modalBox.style.top = next.top + 'px';
            modalBox.style.right = 'auto';
            modalBox.style.transform = 'none';
            _syncResizeHandle();
        }

        function stopDrag(event) {
            if (!dragState) return;
            dragState = null;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', stopDrag);
            document.removeEventListener('pointercancel', stopDrag);
            document.body.style.userSelect = '';
            try {
                if (event && event.pointerId != null) handle.releasePointerCapture(event.pointerId);
            } catch (e) { /* ignore */ }
        }

        handle.addEventListener('pointerdown', function(event) {
            if (event.button != null && event.button !== 0) return;
            if (event.target.closest('button')) return;

            const rect = modalBox.getBoundingClientRect();
            modalBox.style.left = rect.left + 'px';
            modalBox.style.top = rect.top + 'px';
            modalBox.style.right = 'auto';
            modalBox.style.margin = '0';
            modalBox.style.transform = 'none';

            dragState = {
                startX: event.clientX,
                startY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top
            };
            document.body.style.userSelect = 'none';
            try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', stopDrag);
            document.addEventListener('pointercancel', stopDrag);
            event.preventDefault();
        });
    }

    function _makeInspectionModalResizable(rootEl, modalId) {
        const modalBox = rootEl.querySelector('#' + modalId);
        if (!modalBox) return;

        const handleId = modalId + 'Resize';
        const old = rootEl.querySelector('#' + handleId);
        if (old) old.remove();

        const handle = document.createElement('div');
        handle.id = handleId;
        handle.title = '드래그하여 창 너비 조절';
        handle.style.pointerEvents = 'auto';

        function placeHandle() {
            const r = modalBox.getBoundingClientRect();
            handle.style.cssText = [
                'position:fixed',
                'top:' + r.top + 'px',
                'left:' + (r.right - 12) + 'px',
                'width:12px',
                'height:' + r.height + 'px',
                'cursor:ew-resize',
                'z-index:1001',
                'pointer-events:auto',
                'background:linear-gradient(to right,transparent,rgba(99,102,241,0.35))',
                'border-radius:0 10px 10px 0',
            ].join(';');
        }
        handle._place = placeHandle;

        placeHandle();
        rootEl.appendChild(handle);

        handle.addEventListener('pointerdown', function(event) {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();

            const rect = modalBox.getBoundingClientRect();
            modalBox.style.left = rect.left + 'px';
            modalBox.style.top = rect.top + 'px';
            modalBox.style.transform = 'none';
            modalBox.style.width = rect.width + 'px';
            modalBox.style.maxWidth = 'none';

            const startX = event.clientX;
            const startW = rect.width;
            const minW = Math.min(640, window.innerWidth * 0.45);
            const maxW = window.innerWidth * 0.98;

            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
            try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }

            function onMove(ev) {
                const newW = Math.max(minW, Math.min(startW + (ev.clientX - startX), maxW));
                modalBox.style.width = newW + 'px';
                placeHandle();
            }
            function onUp(ev) {
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                try {
                    if (ev && ev.pointerId != null) handle.releasePointerCapture(ev.pointerId);
                } catch (e) { /* ignore */ }
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });
    }

    // 자주검사자만 반환 — 검사자 마스터에서 주요 공정에 '자주검사(self)'가 포함된 인원
    function _getSelfInspectors() {
        return (Storage.getAll(DB.STORES.INSPECTORS) || [])
            .filter(insp => Array.isArray(insp.processes) && insp.processes.includes('self'));
    }

    // 검사자 필드 동적 추가
    function _addInspectorField(isFirst = false) {
        const container = document.getElementById('inspectorContainer');
        if (!container) return;

        // 도장 외관 검사자는 '자주검사자'만 선택 가능
        const inspectors = _getSelfInspectors();

        // 현재 개수 확인
        if (!container.inspectorCount) {
            container.inspectorCount = container.querySelectorAll('[id^="inspector"]').length;
        }

        // 최대 5명까지만 추가
        if (!isFirst && container.inspectorCount >= 5) {
            UIUtils.toast('검사자는 최대 5명까지 추가할 수 있습니다.', 'warning');
            return;
        }

        container.inspectorCount++;
        const idx = container.inspectorCount;

        const fieldHTML = `
            <div class="form-group" id="inspectorGroup${idx}" style="margin:0; flex:0 0 auto; min-width:120px; max-width:160px;">
                <label class="form-label" style="font-size:0.65rem;margin:0 0 2px 0;white-space:nowrap;">검사자${idx}</label>
                <select id="inspector${idx}" class="form-select" style="width:100%; padding:4px 6px; border:1px solid var(--border); font-size:0.82rem;" onchange="PaintingInspectionModule._syncInspectorOptions()">
                    <option value="">선택 안함</option>
                    ${inspectors.length === 0
                        ? `<option value="" disabled>자주검사자 미등록</option>`
                        : inspectors.map(insp => `<option value="${insp.id}">${insp.name || insp.id}</option>`).join('')}
                </select>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', fieldHTML);
        PaintingInspectionModule._syncInspectorOptions();

        // + 버튼 상태 업데이트
        const addBtn = document.getElementById('addInspectorBtn');
        if (addBtn) {
            addBtn.disabled = container.inspectorCount >= 5;
        }
    }

    // 검사자 드롭다운 간 중복 선택 방지
    function _syncInspectorOptions() {
        const container = document.getElementById('inspectorContainer');
        if (!container) return;
        const selects = Array.from(container.querySelectorAll('select[id^="inspector"]'));
        const selectedValues = selects.map(s => s.value).filter(v => v !== '');
        selects.forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if (opt.value === '' || opt.value === sel.value) {
                    opt.disabled = false;
                } else {
                    opt.disabled = selectedValues.includes(opt.value);
                }
            });
        });
    }

    // 검사 모달 닫기 및 도장 검사 페이지로 복귀
    function _closeInspectionModal() {
        // 모달 제거
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();

        // Router를 통해 도장 검사 페이지로 이동
        Router.navigate('painting-inspection');
    }


    // 제품 선택 목록
    function renderProductSelector() {
        const products = Storage.getAll(PRODUCTS_STORE);
        const el = document.getElementById('productSelector');

        if (products.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">제품이 없습니다. 관리/설정에서 제품을 등록하세요.</p>`;
            return;
        }

        // 차종별 그룹핑
        const grouped = {};
        products.forEach(p => {
            const model = p.carModel || '미분류';
            if (!grouped[model]) grouped[model] = [];
            grouped[model].push(p);
        });

        let html = '';
        Object.entries(grouped).forEach(([model, items]) => {
            html += `<div class="product-group">`;
            html += `<div class="product-group-header">${model}</div>`;
            html += `<div class="product-group-items">`;
            items.forEach(p => {
                const display = p.displayName || `${p.carModel} ${p.partName} ${p.color}`.trim();
                const isSelected = state.selectedProduct && state.selectedProduct.id === p.id;
                html += `<button class="product-select-btn ${isSelected ? 'selected' : ''}" 
                            onclick="PaintingInspectionModule.selectProduct('${p.id}')">${p.color || display}</button>`;
            });
            html += `</div></div>`;
        });

        el.innerHTML = html;
    }

    function selectProduct(id) {
        const product = Storage.getById(PRODUCTS_STORE, id);
        state.selectedProduct = product;
        state.counts = {};
        renderProductSelector();
        renderDefectCounter();
        renderSelectedInfo();
        renderSummary();
    }

    function renderSelectedInfo() {
        const el = document.getElementById('selectedInfo');
        if (!state.selectedProduct && !state.selectedPlan && !state.selectedWork) {
            el.innerHTML = '';
            return;
        }

        let html = '';
        if (state.selectedPlan) {
            html += `<div class="selected-info" style="margin-bottom:10px;">
                <span class="material-symbols-outlined">assignment</span>
                <span>지시서: <strong>${state.selectedPlan.orderNo || '-'}</strong> |
                ${state.selectedPlan.carModel} ${state.selectedPlan.partName} ${state.selectedPlan.color} |
                계획: ${UIUtils.formatNumber(state.selectedPlan.planQty)}EA</span>
            </div>`;
        }
        if (state.selectedWork) {
            const lotDisplay = state.selectedWork.lots && state.selectedWork.lots.length > 0 ?
                state.selectedWork.lots.map(l => l.lotNo).join(', ') :
                (state.selectedWork.lotNo || '-');
            html += `<div class="selected-info" style="margin-bottom:10px;background:rgba(76,175,80,0.1);border-left:4px solid var(--accent-green);padding:8px;border-radius:4px;">
                <span class="material-symbols-outlined" style="color:var(--accent-green);">done_all</span>
                <span>도장 작업: <strong>${state.selectedWork.date}</strong> |
                ${state.selectedWork.carModel} ${state.selectedWork.partName} ${state.selectedWork.color} |
                LOT: ${lotDisplay} |
                완료수량: <strong>${UIUtils.formatNumber(state.selectedWork.productionQty || 0)}EA</strong></span>
            </div>`;
        }
        if (state.selectedProduct) {
            const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;
            html += `<div class="selected-info" style="margin-bottom:20px;">
                <span class="material-symbols-outlined">category</span>
                <span>제품: <strong>${display}</strong></span>
            </div>`;
        }
        el.innerHTML = html;
    }

    function renderDefectCounter() {
        const el = document.getElementById('defectCounterGrid');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어

        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id); // 유효한 항목만

        if (defects.length === 0) {
            el.innerHTML = `<p style="color:var(--text-muted);padding:10px 0;">불량 유형이 없습니다. <strong>관리/설정 &gt; 불량 유형</strong>에서 사출/도장 불량을 등록하세요.</p>`;
            el.style.display = 'block';
            el.style.gridTemplateColumns = 'none';
            return;
        }

        const injDefects = defects.filter(d => d.type === 'injection' || !d.type);
        const paintDefects = defects.filter(d => d.type === 'painting');
        const _platingBaseWork = state.selectedWork || (state.selectedProduct ? {
            carModel: state.selectedProduct.carModel || '',
            partName: state.selectedProduct.partName || '',
            color: state.selectedProduct.color || '',
            lots: []
        } : null);
        const platingDefects = _isPlatingForWork(_platingBaseWork)
            ? defects.filter(d => d.type === 'plating')
            : [];

        let html = '';

        if (injDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-blue);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">precision_manufacturing</span> 사출 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:20px;">`;
            html += injDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${(state.counts[d.id] || 0) > 0 ? state.counts[d.id] : '-'}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        if (paintDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid var(--accent-orange);padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;">format_paint</span> 도장 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:10px;">`;
            html += paintDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${(state.counts[d.id] || 0) > 0 ? state.counts[d.id] : '-'}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        if (platingDefects.length > 0) {
            html += `<h5 style="margin:0 0 10px 0;color:var(--text-primary);border-bottom:2px solid #7c3aed;padding-bottom:5px;">
                         <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;color:#7c3aed;">layers</span> 도금 불량
                     </h5>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:10px;">`;
            html += platingDefects.map(d => {
                const safeName = (d.name || '').replace(/'/g, "\'");
                return `
                    <button class="defect-btn" id="defect-btn-${d.id}"
                        onclick="PaintingInspectionModule.increment('${d.id}', '${safeName}')"
                        oncontextmenu="event.preventDefault(); PaintingInspectionModule.decrement('${d.id}')">
                        <span class="defect-name">${d.name || ''}</span>
                        <span class="defect-count">${(state.counts[d.id] || 0) > 0 ? state.counts[d.id] : '-'}</span>
                    </button>
                `;
            }).join('');
            html += `</div>`;
        }

        el.innerHTML = html;
        el.style.display = 'block';
        el.style.gridTemplateColumns = 'none';
    }

    function increment(defectId, defectName) {
        if (!state.selectedProduct) {
            UIUtils.toast('먼저 제품을 선택하세요.', 'warning');
            return;
        }
        state.counts[defectId] = (state.counts[defectId] || 0) + 1;
        updateCountDisplay(defectId);
        renderSummary();
    }

    function decrement(defectId) {
        if (state.counts[defectId] && state.counts[defectId] > 0) {
            state.counts[defectId]--;
            updateCountDisplay(defectId);
            renderSummary();
        }
    }

    function updateCountDisplay(defectId) {
        const btn = document.getElementById(`defect-btn-${defectId}`);
        if (btn) {
            const count = Number(state.counts[defectId] || 0);
            btn.querySelector('.defect-count').textContent = count > 0 ? count : '-';
        }
    }

    // 현재 집계 표시
    function renderSummary() {
        const el = document.getElementById('currentSummary');
        if (!el) return; // 컨테이너가 DOM에 없을 경우 방어
        const allDefs = Storage.getAll(DEFECT_STORE) || [];
        const defects = allDefs.filter(d => d && d.id);
        const active = defects.filter(d => (state.counts[d.id] || 0) > 0);

        let html = '';

        // 상단: 현재 카운팅 중인 불량
        if (active.length > 0) {
            const total = active.reduce((s, d) => s + state.counts[d.id], 0);

            // 사출, 도장 구분하여 표시
            const injActive = active.filter(d => d.type === 'injection' || !d.type);
            const paintActive = active.filter(d => d.type === 'painting');

            html += `<h6 style="margin:0 0 8px 0; color:var(--accent-blue); font-weight:600;">▶ 현재 카운팅</h6>`;

            if (injActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">사출 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${injActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(59, 130, 246, 0.1);border:1px solid rgba(59, 130, 246, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-blue);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            if (paintActive.length > 0) {
                html += `<div style="margin-bottom:8px;"><span style="font-size:0.9rem;color:var(--text-secondary);">도장 불량</span></div>`;
                html += `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px;">
                    ${paintActive.map(d => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(245, 158, 11, 0.1);border:1px solid rgba(245, 158, 11, 0.2);border-radius:6px;">
                            <span style="font-weight:500;">${d.name}</span>
                            <span style="font-weight:700;color:var(--accent-orange);">${state.counts[d.id]}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            html += `
                <div style="text-align:right;padding:8px 12px;background:rgba(239,68,68,0.1);border-radius:6px;font-weight:700;margin-bottom:16px;">
                    소계: <span style="color:var(--accent-red)">${UIUtils.formatNumber(total)}</span>
                </div>
            `;
        }

        // 하단: 검사 완료된 실적 목록
        const allInspections = Storage.getAll(STORE) || [];
        const todayInspections = allInspections.filter(i => i.date === UIUtils.today()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const _allWorks = Storage.getAll(PAINTING_WORK_STORE) || [];

        if (todayInspections.length > 0) {
            html += `<h6 style="margin:16px 0 8px 0; color:var(--accent-green); font-weight:600; border-top:1px dashed var(--border); padding-top:12px;">▶ 검사 완료 실적 (오늘)</h6>`;
            html += `
                <div class="data-table-wrapper" style="margin-top:8px;">
                    <table class="data-table" style="font-size:0.9rem;">
                        <thead>
                            <tr>
                                <th style="white-space:nowrap;">검사일자</th>
                                <th style="white-space:nowrap;">도장작업일</th>
                                <th style="white-space:nowrap;">라인</th>
                                <th style="white-space:nowrap;">차종</th>
                                <th style="white-space:nowrap;">품명</th>
                                <th style="white-space:nowrap;">컬러</th>
                                <th style="text-align:right;white-space:nowrap;">검사수</th>
                                <th style="text-align:right;white-space:nowrap;">양품</th>
                                <th style="text-align:right;white-space:nowrap;">불량</th>
                                <th style="text-align:right;white-space:nowrap;">불량률</th>
                                <th style="white-space:nowrap;">등록자</th>
                                <th style="width:60px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${todayInspections.map(i => {
                                const insp = Number(i.inspectionQty) || 0;
                                const defect = Number(i.defectQty) || 0;
                                const rate = insp > 0 ? (defect / insp * 100).toFixed(1) : '0.0';
                                const registeredName = _registeredByName(i);
                                const _ip = (i.date || '').split('-');
                                const _ist = (i.inspectionStartTime || '').slice(0, 5);
                                const _inspDateHtml = _ip.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _ip[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _ip[1] + '-' + _ip[2] + '</span>' +
                                      (_ist ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _ist + '</span>' : '')
                                    : (i.date || '-');
                                const _wp = (i.paintingDate || '').split('-');
                                const _wst = (i.paintingTime || '').slice(0, 5);
                                const _workDateHtml = _wp.length === 3
                                    ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + _wp[0] + '</span>' +
                                      '<span style="font-weight:600;white-space:nowrap;">' + _wp[1] + '-' + _wp[2] + '</span>' +
                                      (_wst ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + _wst + '</span>' : '')
                                    : (i.paintingDate || '-');
                                return `
                                <tr>
                                    <td style="line-height:1.3;white-space:nowrap;">${_inspDateHtml}</td>
                                    <td style="line-height:1.3;white-space:nowrap;">${_workDateHtml}</td>
                                    <td style="white-space:nowrap;"><span class="badge badge-info">${(_allWorks.find(w => w.id === (i.workId || i.productId)) || {}).line || '-'}</span></td>
                                    <td style="white-space:nowrap;">${i.carModel || '-'}</td>
                                    <td style="white-space:nowrap;"><strong>${i.partName || '-'}</strong></td>
                                    <td style="white-space:nowrap;">${i.color || '-'}</td>
                                    <td style="text-align:right;white-space:nowrap;">${UIUtils.formatNumber(insp)}</td>
                                    <td style="text-align:right;color:var(--accent-green);font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(Number(i.goodQty) || 0)}</td>
                                    <td style="text-align:right;color:var(--accent-red);font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(defect)}</td>
                                    <td style="text-align:right;font-weight:600;color:${defect > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};white-space:nowrap;">${rate}%</td>
                                    <td style="white-space:nowrap;font-size:0.85rem;">${registeredName}</td>
                                    <td style="text-align:center;"><button class="btn btn-sm btn-outline" onclick="PaintingInspectionModule.showInspectionDetail('${i.id}')">보기</button></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (active.length === 0) {
            html = `<p style="color:var(--text-muted);text-align:center;padding:20px;">오늘 등록된 검사 실적이 없습니다.</p>`;
        }

        el.innerHTML = html;
    }

    // 검사 상세 보기 모달
    function showInspectionDetail(id) {
        const allInspections = Storage.getAll(STORE) || [];
        const i = allInspections.find(r => r.id === id);
        if (!i) { UIUtils.toast('검사 기록을 찾을 수 없습니다.', 'error'); return; }

        const insp = _inspInspectionQty(i);
        const good = _inspGood(i);
        const defect = _inspDefectTotal(i);
        const rework = _inspRework(i);
        const rate = insp > 0 ? (defect / insp * 100).toFixed(1) : '0.0';

        function fmtDate(d) {
            const p = String(d || '').split('-');
            if (p.length !== 3) return { year: '-', md: d || '-', raw: d || '-' };
            return { year: p[0], md: p[1] + '-' + p[2], raw: d };
        }
        function infoRow(label, val) {
            return '<div style="display:grid;grid-template-columns:112px minmax(0,1fr);gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.18);">' +
                   '<div style="font-size:0.77rem;color:var(--text-muted);font-weight:700;letter-spacing:0.02em;">' + label + '</div>' +
                   '<div style="font-size:0.95rem;font-weight:600;color:var(--text-primary);word-break:break-word;">' + val + '</div>' +
                   '</div>';
        }
        function statCard(label, value, tone) {
            const color = tone === 'green' ? '#059669' : tone === 'red' ? '#ef4444' : tone === 'orange' ? '#f97316' : '#1d4ed8';
            const bg = tone === 'green' ? 'rgba(16,185,129,0.10)' : tone === 'red' ? 'rgba(239,68,68,0.10)' : tone === 'orange' ? 'rgba(249,115,22,0.10)' : 'rgba(37,99,235,0.10)';
            return '<div style="padding:14px 16px;border-radius:16px;background:' + bg + ';border:1px solid rgba(148,163,184,0.14);min-height:86px;">' +
                   '<div style="font-size:0.76rem;color:var(--text-muted);font-weight:700;margin-bottom:8px;">' + label + '</div>' +
                   '<div style="font-size:1.5rem;font-weight:900;color:' + color + ';letter-spacing:0.01em;">' + value + '</div>' +
                   '</div>';
        }

        const inspectionDate = fmtDate(i.date);
        const paintingDate = fmtDate(i.paintingDate);
        const inspectionTime = i.inspectionStartTime ? String(i.inspectionStartTime).slice(0, 5) : '-';
        const inspectionRange = (i.inspectionStartTime || '-') + (i.inspectionEndTime ? ' ~ ' + i.inspectionEndTime : '');
        const registeredName = _registeredByName(i);
        const defectRows = (i.defects || []).map(function (d) {
            const sourceLabel = d.defectType === 'painting' ? '도장' : '사출';
            const sourceBg = d.defectType === 'painting' ? 'rgba(59,130,246,0.12)' : 'rgba(249,115,22,0.12)';
            const sourceColor = d.defectType === 'painting' ? '#2563eb' : '#ea580c';
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid rgba(148,163,184,0.14);border-radius:14px;box-shadow:0 8px 18px rgba(15,23,42,0.04);">' +
                '<div style="min-width:0;">' +
                    '<div style="font-size:0.95rem;font-weight:700;color:var(--text-primary);word-break:break-word;">' + (d.defectName || d.defectId) + '</div>' +
                    '<div style="margin-top:6px;"><span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:' + sourceBg + ';color:' + sourceColor + ';font-size:0.72rem;font-weight:800;">' + sourceLabel + '</span></div>' +
                '</div>' +
                '<div style="flex-shrink:0;text-align:right;">' +
                    '<div style="font-size:1.15rem;font-weight:900;color:var(--accent-red);">' + UIUtils.formatNumber(d.defectCount) + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">불량 수량</div>' +
                '</div>' +
            '</div>';
        }).join('');

        const html =
            '<div style="padding:6px 2px 2px;">' +
                '<div style="padding:18px;border-radius:22px;background:linear-gradient(135deg,#f8fbff 0%,#eef6ff 52%,#f8fafc 100%);border:1px solid rgba(59,130,246,0.14);box-shadow:0 18px 34px rgba(15,23,42,0.08);">' +
                    '<div style="display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;">' +
                        '<div style="padding:16px 14px;border-radius:18px;background:#fff;border:1px solid rgba(148,163,184,0.16);display:flex;flex-direction:column;justify-content:center;align-items:flex-start;box-shadow:0 10px 24px rgba(15,23,42,0.05);">' +
                            '<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;">검사일자</div>' +
                            '<div style="font-size:0.78rem;color:#64748b;font-weight:700;">' + inspectionDate.year + '</div>' +
                            '<div style="font-size:1.8rem;line-height:1.1;font-weight:900;color:var(--text-primary);margin-top:2px;">' + inspectionDate.md + '</div>' +
                            '<div style="font-size:0.86rem;color:#2563eb;font-weight:800;margin-top:8px;">' + inspectionTime + '</div>' +
                        '</div>' +
                        '<div style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;flex:1 1 420px;min-width:280px;">' +
                            '<div>' +
                                '<div style="font-size:0.78rem;color:#2563eb;font-weight:800;letter-spacing:0.06em;">PAINT INSPECTION</div>' +
                                '<div style="font-size:1.45rem;font-weight:900;color:var(--text-primary);margin-top:6px;">' + (i.carModel || '-') + ' / ' + (i.partName || '-') + '</div>' +
                                '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
                                    '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(148,163,184,0.16);font-size:0.78rem;color:var(--text-secondary);font-weight:700;">컬러&nbsp;&nbsp;<strong style="color:var(--text-primary);">' + (i.color || '-') + '</strong></span>' +
                                    '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(148,163,184,0.16);font-size:0.78rem;color:var(--text-secondary);font-weight:700;">등록자&nbsp;&nbsp;<strong style="color:var(--text-primary);">' + registeredName + '</strong></span>' +
                                '</div>' +
                            '</div>' +
                            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">' +
                                statCard('검사수량', UIUtils.formatNumber(insp), 'blue') +
                                statCard('양품', UIUtils.formatNumber(good), 'green') +
                                statCard('불량', UIUtils.formatNumber(defect), 'red') +
                                statCard('불량률', rate + '%', defect > 0 ? 'orange' : 'blue') +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px;">' +
                    '<div style="padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                        '<div style="font-size:0.86rem;font-weight:900;color:var(--text-primary);margin-bottom:6px;">기본 정보</div>' +
                        infoRow('검사 시간', inspectionRange) +
                        infoRow('도장 작업일', paintingDate.raw ? paintingDate.raw : '-') +
                        infoRow('사출 LOT', i.lotNo || '-') +
                        infoRow('등록자', registeredName) +
                    '</div>' +
                    '<div style="padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                        '<div style="font-size:0.86rem;font-weight:900;color:var(--text-primary);margin-bottom:6px;">판정 요약</div>' +
                        infoRow('차종 / 품명', (i.carModel || '-') + ' / ' + (i.partName || '-')) +
                        infoRow('컬러', i.color || '-') +
                        infoRow('양품', '<span style="color:var(--accent-green);font-weight:800;">' + UIUtils.formatNumber(good) + '</span>') +
                        infoRow('불량', '<span style="color:var(--accent-red);font-weight:800;">' + UIUtils.formatNumber(defect) + '</span>' +
                            (rework > 0 ? ' <span style="font-size:0.78rem;color:var(--text-muted);">(폐기 ' + UIUtils.formatNumber(Math.max(0, defect - rework)) + ' · 리워크 ' + UIUtils.formatNumber(rework) + ')</span>' : '')) +
                        infoRow('불량률', '<span style="font-weight:800;color:' + (defect > 0 ? 'var(--accent-red)' : 'var(--text-muted)') + ';">' + rate + '%</span>') +
                    '</div>' +
                '</div>' +

                '<div style="margin-top:14px;padding:16px 18px;border-radius:20px;background:#fff;border:1px solid rgba(148,163,184,0.14);box-shadow:0 14px 28px rgba(15,23,42,0.05);">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">' +
                        '<div style="font-size:0.9rem;font-weight:900;color:var(--text-primary);">불량 상세</div>' +
                        '<div style="font-size:0.76rem;color:var(--text-muted);">총 ' + UIUtils.formatNumber(defect) + ' EA</div>' +
                    '</div>' +
                    (defectRows || '<div style="padding:24px 16px;border-radius:16px;background:var(--bg-secondary);text-align:center;color:var(--text-muted);font-size:0.9rem;">등록된 불량 상세가 없습니다.</div>') +
                '</div>' +
            '</div>';

        const canWrite = _canWriteInspection();
        const footerBtns =
            (canWrite
                ? '<button type="button" class="btn btn-primary" onclick="UIUtils.closeModal();PaintingInspectionModule.openEditInspectionModal(\'' + id + '\')">' +
                  '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">edit</span> 수정</button>'
                : '') +
            '<button type="button" class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>';
        UIUtils.showModal('외관 검사 정보', html, footerBtns, 'xl');
    }

    // 저장
    async function save() {
        if (!state.selectedProduct) {
            UIUtils.toast('제품을 선택하세요.', 'warning');
            return;
        }

        const defects = Storage.getAll(DEFECT_STORE);
        const activeDefects = defects.filter(d => state.counts[d.id] > 0);

        if (activeDefects.length === 0) {
            UIUtils.toast('저장할 불량 데이터가 없습니다.', 'warning');
            return;
        }

        const display = state.selectedProduct.displayName || `${state.selectedProduct.carModel} ${state.selectedProduct.partName} ${state.selectedProduct.color}`;

        // 불량별로 각각 기록
        for (const d of activeDefects) {
            await Storage.add(STORE, {
                date: UIUtils.today(),
                productId: state.selectedProduct.id,
                productName: display,
                carModel: state.selectedProduct.carModel || null, // 차종 저장
                partName: state.selectedProduct.partName || null, // 품명 저장
                color: state.selectedProduct.color || null, // 컬러 저장
                defectId: d.id,
                defectName: d.name,
                defectCount: state.counts[d.id],
                planId: state.selectedPlan ? state.selectedPlan.id : null,
                planOrderNo: state.selectedPlan ? state.selectedPlan.orderNo : null
            });
        }

        UIUtils.toast(`${activeDefects.length}건의 불량 기록이 저장되었습니다.`, 'success');
        reset();
    }

    function reset() {
        state.counts = {};
        renderDefectCounter();
        renderSummary();
    }

    // 검사 모달 내부 헬퍼 함수들
    function _incInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decInjDefect(defectId) {
        const input = document.getElementById(`inj-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _incPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input) {
            input.value = (parseInt(input.value) || 0) + 1;
            _updateDefectTotal();
        }
    }

    function _decPaintDefect(defectId) {
        const input = document.getElementById(`paint-${defectId}`);
        if (input && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
            _updateDefectTotal();
        }
    }

    function _isPartialInspectionMode() {
        const checkbox = document.getElementById('inpIsPartialInspection');
        return !!(checkbox && checkbox.checked);
    }

    function _sumDefectTypeInputs() {
        let defectSum = 0;
        document.querySelectorAll('[id^="inj-"],[id^="paint-"],[id^="plate-"],[id^="laser-"]').forEach(function(el) {
            defectSum += parseInt(String(el.value || '').replace(/,/g, ''), 10) || 0;
        });
        return defectSum;
    }

    function _commitActiveNumericInput() {
        // 태블릿은 포커스가 남은 채 체크박스를 누르면 입력값이 아직 확정되지 않는 경우가 있다.
        const active = document.activeElement;
        if (!active || active === document.body) return;
        if (typeof active.blur === 'function') active.blur();
    }

    function _updateDefectQty() {
        // 양품수 변경 시에도 불량 유형 합계를 유지한다.
        // (태블릿은 양품수 value 대입만으로 change가 발생해 불량수가 0으로 덮이는 경우가 있다)
        _recalcInspQuantities();
    }

    function _updateGoodQty() {
        _recalcInspQuantities();
    }

    // ✓ Case 1: 부분 완료 토글
    function _togglePartialInspection() {
        _commitActiveNumericInput();
        const checkbox = document.getElementById('inpIsPartialInspection');
        const infoDiv = document.getElementById('piPartialInspectionInfo');
        const goodQtyEl = document.getElementById('inpGoodQty');
        if (checkbox && infoDiv) {
            infoDiv.style.display = checkbox.checked ? 'flex' : 'none';
        }
        if (checkbox && checkbox.checked) {
            // 부분 완료 진입: 양품수만 직접 입력하도록 초기화한다.
            // 불량수와 합계는 현재 불량 유형 입력값을 그대로 합산한다.
            if (goodQtyEl) goodQtyEl.value = 0;
        }
        // 해제 시 양품수를 미리 채우지 않는다.
        // (미리 채우면 태블릿에서 change → 불량수=검사수량-양품수=0 이 먼저 실행된다)
        _recalcInspQuantities();
    }

    // ── 표준 검사 시간(외관검사 C.TIME) → 개당 초 ────────────────────
    // 제품 정보의 외관 검사 C.TIME(초, 1인 기준)/CVT를 이용해 EA당 표준 검사 시간을 구한다.
    function _getInspectionStdPerEaSec(work) {
        if (!work) return 0;
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const prod = products.find(p => p.carModel === work.carModel && p.partName === work.partName && p.color === work.color)
                  || products.find(p => p.carModel === work.carModel && p.partName === work.partName);
        if (!prod) return 0;
        const ct  = parseFloat(prod.appearanceCt)  || 0;   // 초 (CVT 단위당)
        const cvt = parseFloat(prod.appearanceCvt) || 1;   // 1인 기준
        if (ct <= 0) return 0;
        return cvt > 0 ? ct / cvt : ct;
    }

    function _formatDurationSec(totalSec) {
        totalSec = Math.max(0, Math.round(Number(totalSec) || 0));
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        if (m > 0 && s > 0) return `${m}분 ${s}초`;
        if (m > 0) return `${m}분`;
        return `${s}초`;
    }

    function _formatDraftTime(iso) {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            const p = n => String(n).padStart(2, '0');
            return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        } catch (e) { return ''; }
    }

    // ── 외관 검사 임시 저장(draft) ────────────────────────────────────
    async function _getInspectionDrafts(force) {
        if (_inspectionDraftCache && !force) return _inspectionDraftCache;
        let drafts = {};
        try { drafts = await Storage.getConfigValue(INSPECTION_DRAFT_KEY) || {}; } catch (e) { drafts = {}; }
        if (!drafts || typeof drafts !== 'object') drafts = {};
        _inspectionDraftCache = drafts;
        return drafts;
    }

    async function _refreshInspectionDrafts() {
        await _getInspectionDrafts(true);
        if (state.currentTab === 'inspection' && document.getElementById('inspectionWaitingList')) {
            renderInspectionWaitingList();
        }
    }

    // 현재 검사 모달의 입력값을 수집 (임시 저장 & 복원 공용)
    function _collectInspectionFormData() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const inspectorIds = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById('inspector' + i);
            inspectorIds.push(el ? (el.value || '') : '');
        }
        const defects = {};
        document.querySelectorAll('[id^="inj-"],[id^="paint-"],[id^="plate-"],[id^="laser-"]').forEach(el => {
            const v = String(el.value || '').trim();
            if (v !== '' && v !== '0') defects[el.id] = v;
        });
        return {
            date:         g('inpInspectionDate'),
            startTime:    g('inpInspectionStartTime'),
            endTime:      g('inpInspectionEndTime'),
            goodQty:      g('inpGoodQty'),
            defectQty:    g('inpDefectQty'),
            reworkQty:    g('inpReworkQty'),
            packUnit:     g('piPackUnit'),
            inspectorIds,
            defects
        };
    }

    async function _saveInspectionDraft(workId) {
        if (!_canWriteInspection()) {
            UIUtils.toast('도장 검사 입력 권한이 없습니다.', 'warning');
            return;
        }
        if (!workId) { UIUtils.toast('임시 저장할 검사 대상이 없습니다.', 'warning'); return; }
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) { UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'warning'); return; }

        const data = _collectInspectionFormData();
        data.savedAt = new Date().toISOString();
        data.sourceProductionQty = work.productionQty; // ✓ Case 2: 원본 도장 수량 스냅샷 저장

        try {
            const drafts = await _getInspectionDrafts();
            drafts[workId] = data;
            await Storage.setConfigValue(INSPECTION_DRAFT_KEY, drafts);
            _inspectionDraftCache = drafts;
            UIUtils.toast('임시 저장되었습니다. 나중에 이어서 작성할 수 있습니다.', 'success');
            const notice = document.getElementById('inspDraftNotice');
            const timeEl = document.getElementById('inspDraftNoticeTime');
            if (notice) notice.style.display = 'flex';
            if (timeEl) timeEl.textContent = _formatDraftTime(data.savedAt);
        } catch (e) {
            console.error('외관 검사 임시 저장 실패', e);
            UIUtils.toast('임시 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // ✓ Case 3: 도장 작업 수량 수정 후 검사 기록 동기화 모달
    function _showInspectionSyncModal(workId, oldQty, newQty, diffQty, inspections) {
        const diffSign = diffQty > 0 ? '+' : '';
        const totalInspected = inspections.reduce((sum, insp) => sum + (Number(insp.inspectionQty) || 0), 0);
        const totalRemaining = oldQty - totalInspected;
        const newRemaining = totalRemaining + diffQty;

        UIUtils.showModal('⚠️ 도장 작업 수량이 변경되었습니다 (검사 기록 동기화 필요)', `
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:14px;margin-bottom:16px;">
                <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.8;">
                    <div><strong>원본 도장 수량</strong>: ${UIUtils.formatNumber(oldQty)} EA</div>
                    <div><strong>변경 도장 수량</strong>: ${UIUtils.formatNumber(newQty)} EA</div>
                    <div><strong>변경량</strong>: ${diffSign}${UIUtils.formatNumber(Math.abs(diffQty))} EA</div>
                    <div style="margin-top:8px;border-top:1px solid var(--border-color);padding-top:8px;color:var(--text-secondary);">
                        <div><strong>검사 완료 수량</strong>: ${UIUtils.formatNumber(totalInspected)} EA (${inspections.length}건)</div>
                        <div><strong>이전 미검사</strong>: ${UIUtils.formatNumber(totalRemaining)} EA</div>
                        <div style="color:var(--accent-blue);"><strong>변경 후 미검사</strong>: ${UIUtils.formatNumber(Math.max(0, newRemaining))} EA</div>
                    </div>
                </div>
            </div>
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;color:var(--accent-orange);">info</span>
                <span style="margin-left:6px;">다음 중 선택하세요:</span>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소 (나중에 수정)</button>
            <button class="btn btn-primary" style="background:var(--accent-blue);border-color:var(--accent-blue);"
                onclick="PaintingInspectionModule._autoSyncInspections('${workId}', ${oldQty}, ${newQty})">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">sync</span> 자동 동기화
            </button>
        `, 'md');
    }

    // ✓ Case 3: 검사 기록 자동 동기화
    async function _autoSyncInspections(workId, oldQty, newQty) {
        UIUtils.closeModal();
        try {
            const inspections = (Storage.getAll(PAINTING_INSPECTIONS_STORE) || []).filter(
                insp => insp.workId === workId
            );

            let syncCount = 0;
            for (const insp of inspections) {
                // 각 검사 기록의 "원본 도장 수량" 필드 업데이트 (검사 수량은 유지)
                await Storage.update(PAINTING_INSPECTIONS_STORE, insp.id, {
                    sourcePaintingProductionQty: newQty
                });
                syncCount++;
            }

            UIUtils.toast(`검사 기록 ${syncCount}건이 자동 동기화되었습니다.`, 'success');
            if (typeof loadAll === 'function') loadAll();
        } catch (e) {
            console.error('검사 기록 동기화 실패:', e);
            UIUtils.toast('검사 기록 동기화 중 오류가 발생했습니다.', 'error');
        }
    }

    // ✓ Case 2: 임시 저장 데이터와 현재 도장 작업 수량 불일치 처리
    function _showDraftQuantityMismatchModal(work, draft, workId) {
        const oldQty = draft.sourceProductionQty;
        const newQty = work.productionQty || 0;
        const diffQty = newQty - oldQty;
        const diffSign = diffQty > 0 ? '+' : '';

        UIUtils.showModal('⚠️ 도장 작업 수량이 변경되었습니다', `
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px 14px;margin-bottom:16px;">
                <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.6;">
                    <div><strong>임시 저장 당시 수량</strong>: ${UIUtils.formatNumber(oldQty)} EA</div>
                    <div style="margin-top:4px;"><strong>현재 도장 수량</strong>: ${UIUtils.formatNumber(newQty)} EA</div>
                    <div style="margin-top:4px;"><strong>변경량</strong>: ${diffSign}${UIUtils.formatNumber(Math.abs(diffQty))} EA</div>
                </div>
            </div>
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;color:var(--accent-orange);">info</span>
                <span style="margin-left:6px;">다음 중 선택하세요:</span>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-orange);border-color:var(--accent-orange);"
                onclick="PaintingInspectionModule._continueExistingDraft('${workId}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">refresh</span> 계속 검사 (${UIUtils.formatNumber(oldQty)}개 기준)
            </button>
            <button class="btn btn-primary" style="background:var(--accent-blue);border-color:var(--accent-blue);"
                onclick="PaintingInspectionModule._restartWithNewQuantity('${workId}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">restart_alt</span> 새 수량으로 재시작 (${UIUtils.formatNumber(newQty)}개)
            </button>
        `, 'md');
    }

    // ✓ Case 2: 기존 draft로 계속 검사
    function _continueExistingDraft(workId) {
        UIUtils.closeModal();
        setTimeout(async () => {
            try {
                const drafts = await _getInspectionDrafts();
                const draft = drafts[workId];
                if (draft) {
                    _applyInspectionDraft(draft);
                    const notice = document.getElementById('inspDraftNotice');
                    const timeEl = document.getElementById('inspDraftNoticeTime');
                    if (notice) notice.style.display = 'flex';
                    if (timeEl) timeEl.textContent = _formatDraftTime(draft.savedAt);
                    UIUtils.toast('임시 저장된 검사 내용으로 계속합니다.', 'info');
                }
            } catch (e) { console.error(e); }
        }, 100);
    }

    // ✓ Case 2: 새 수량으로 재시작 (draft 삭제)
    async function _restartWithNewQuantity(workId) {
        UIUtils.closeModal();
        // draft 삭제
        await _clearInspectionDraft(workId, true);
        // 페이지 새로고침하여 draft 없이 다시 로드
        setTimeout(() => {
            const modalEl = document.querySelector('[data-inspection-modal="' + workId + '"]');
            if (modalEl) modalEl.remove();
            openInspectionModal(workId);
            UIUtils.toast('새 수량으로 검사를 재시작합니다.', 'success');
        }, 100);
    }

    async function _clearInspectionDraft(workId, silent) {
        if (!workId) return;
        try {
            const drafts = await _getInspectionDrafts();
            if (drafts[workId]) {
                delete drafts[workId];
                await Storage.setConfigValue(INSPECTION_DRAFT_KEY, drafts);
                _inspectionDraftCache = drafts;
            }
        } catch (e) { /* 무시 */ }
        if (!silent) {
            UIUtils.toast('임시 저장 내용을 삭제했습니다.', 'info');
            const notice = document.getElementById('inspDraftNotice');
            if (notice) notice.style.display = 'none';
        }
    }

    function _scaleLotsToQty(lots, newQty) {
        const scaled = (Array.isArray(lots) ? lots : []).map(function(l) {
            return Object.assign({}, l);
        });
        if (!scaled.length) return scaled;
        const target = Math.max(0, Number(newQty) || 0);
        if (scaled.length === 1) {
            scaled[0].qty = target;
            return scaled;
        }
        const lotSum = scaled.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (lotSum <= 0) {
            scaled[0].qty = target;
            return scaled;
        }
        var allocated = 0;
        scaled.forEach(function(l, idx) {
            if (idx === scaled.length - 1) {
                l.qty = Math.max(0, target - allocated);
            } else {
                l.qty = Math.round((Number(l.qty) || 0) / lotSum * target);
                allocated += l.qty;
            }
        });
        return scaled;
    }

    async function _syncInjectionOutboundForWork(workId, updatedLots) {
        const deductions = (Storage.getAll(INJ_INV_STORE) || []).filter(function(r) {
            return r.source === '도장 작업 출고' && String(r.refWorkId || '') === String(workId || '');
        });
        if (!deductions.length) return;
        const lotQtyMap = {};
        (updatedLots || []).forEach(function(l) {
            if (l && l.lotNo) lotQtyMap[String(l.lotNo)] = Number(l.qty) || 0;
        });
        for (var i = 0; i < deductions.length; i++) {
            var rec = deductions[i];
            var lotNo = String(rec.lotNo || '');
            if (!lotNo || lotQtyMap[lotNo] === undefined) continue;
            var newRecQty = lotQtyMap[lotNo];
            await Storage.update(INJ_INV_STORE, rec.id, Object.assign({}, rec, {
                quantity: newRecQty,
                lots: [{ lotNo: lotNo, qty: newRecQty }]
            }));
        }
    }

    async function _syncWorkQtyToWorkLogImmediate(newQty) {
        if (!_piWorkId) return;
        const workRef = Storage.getById(PAINTING_WORK_STORE, _piWorkId);
        if (!workRef) return;
        const qty = Math.max(0, Number(newQty) || 0);
        const oldQty = Number(workRef.productionQty) || 0;
        const patch = { productionQty: qty };
        if (Array.isArray(workRef.lots) && workRef.lots.length) {
            patch.lots = _scaleLotsToQty(workRef.lots, qty);
            patch.inputQty = patch.lots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        } else if (!workRef.inputQty || Number(workRef.inputQty) === oldQty) {
            patch.inputQty = qty;
        }
        const inspected = Number(workRef.inspectedQty) || _piWorkInspectedQty || 0;
        if (workRef.inspectionStatus === 'partial' || inspected > 0) {
            patch.remainingQty = Math.max(0, qty - inspected);
            patch.inspectionStatus = patch.remainingQty > 0 ? 'partial' : (workRef.inspectionStatus || 'partial');
        }
        await Storage.update(PAINTING_WORK_STORE, _piWorkId, Object.assign({}, workRef, patch));
        if (!_isLaserWipWork(workRef)) {
            await _syncInjectionOutboundForWork(_piWorkId, patch.lots || workRef.lots);
        }
        if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.search === 'function') {
            try { PaintingWorkModule.search(); } catch (e) { /* ignore */ }
        }
    }

    function _buildWorkQtyCard(work, isPartialWork, inspectedQty, remainingQty) {
        const productionQty = Number(work.productionQty) || 0;
        const inspected = Number(inspectedQty) || 0;
        const available = isPartialWork
            ? Math.max(0, Number(remainingQty) || Math.max(0, productionQty - inspected))
            : productionQty;
        const displayQty = isPartialWork ? available : productionQty;
        const displayQtyVal = (typeof UIUtils !== 'undefined' && UIUtils.toInputNumber)
            ? UIUtils.toInputNumber(displayQty, 0)
            : String(displayQty);
        const qtyLabel = isPartialWork ? '검사수량' : '작업수량';
        const sourceLabel = _isLaserWipWork(work) ? '레이저 후 재공품' : '사출 출고';
        const editBtnHtml = isPartialWork ? '' : `
                        <button type="button" id="piWorkQtyEditBtn" class="btn btn-sm btn-outline"
                            onclick="PaintingInspectionModule._enableWorkQtyEdit()"
                            style="padding:4px 10px;font-size:0.75rem;white-space:nowrap;gap:3px;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:14px;">edit</span> 변경
                        </button>`;
        return `
        <div class="card">
            <div class="card-body" style="padding:12px;">
                <h5 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-primary);">작업 수량</h5>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <label class="form-label" style="font-size:0.72rem;margin:0;flex:0 0 auto;white-space:nowrap;">${qtyLabel}</label>
                        <input type="number" class="form-input" id="piWorkQty" value="${displayQtyVal}" min="0" readonly
                            style="text-align:right;font-weight:700;font-size:0.95rem;padding:5px 8px;flex:1 1 110px;min-width:110px;max-width:100%;background:var(--bg-secondary);">
                        <span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">EA</span>
                        ${editBtnHtml}
                    </div>
                    ${isPartialWork ? `<div style="font-size:0.72rem;color:var(--text-muted);">원수량 <strong>${UIUtils.formatNumber(productionQty)}</strong> EA · 이미 검사 <strong style="color:var(--accent-orange);">${UIUtils.formatNumber(inspected)}</strong> EA · 남은 검사 <strong id="piAvailInspLabel" style="color:var(--accent-blue);">${UIUtils.formatNumber(available)}</strong> EA</div>` : ''}
                    <div style="background:rgba(59,130,246,0.08);border-radius:6px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.72rem;color:var(--text-muted);">검사 대상</span>
                        <strong id="piInspAvailLabel" style="font-size:0.95rem;color:var(--accent-blue);">${UIUtils.formatNumber(available)} EA</strong>
                    </div>
                    <div style="font-size:0.68rem;color:var(--text-muted);">연동: 도장 작업일지 · ${sourceLabel}</div>
                </div>
            </div>
        </div>`;
    }

    function _getInspAvailableFromForm() {
        return Math.max(0, Number(document.getElementById('piWorkQty')?.value) || 0);
    }

    function _refreshWorkQtyDisplay() {
        const available = _getInspAvailableFromForm();
        const inspEl = document.getElementById('inpInspectionQty');
        if (inspEl) inspEl.value = available;
        const bannerQty = document.getElementById('piBannerInspQty');
        if (bannerQty) bannerQty.textContent = UIUtils.formatNumber(available) + ' EA';
        const availLabel = document.getElementById('piInspAvailLabel');
        if (availLabel) availLabel.textContent = UIUtils.formatNumber(available) + ' EA';
        const partialAvail = document.getElementById('piAvailInspLabel');
        if (partialAvail) partialAvail.textContent = UIUtils.formatNumber(available);
        const stdPerEa = Number((document.getElementById('piStdPerEaHidden') || {}).value) || 0;
        if (stdPerEa > 0) {
            _currentInspectionExpectedSec = stdPerEa * available;
            const expEl = document.getElementById('inspExpectedTimeVal');
            if (expEl) expEl.textContent = _formatDurationSec(_currentInspectionExpectedSec);
            const expDetail = document.getElementById('inspExpectedTimeDetail');
            if (expDetail) expDetail.textContent = `표준 ${stdPerEa.toFixed(1)}초/EA × ${UIUtils.formatNumber(available)} EA`;
        }
        const partialInfo = document.getElementById('piPartialInspectionInfo');
        if (partialInfo) {
            const strong = partialInfo.querySelector('strong');
            if (strong) strong.textContent = UIUtils.formatNumber(available);
        }
    }

    function _getReworkQtyFromForm() {
        // 외관검사 「리워크로 보내기」UI/기능 삭제 — 항상 0
        return 0;
    }

    function _onReworkQtyChange() {
        _recalcInspQuantities();
    }

    function _recalcInspQuantities() {
        _refreshWorkQtyDisplay();
        const available = _getInspAvailableFromForm();
        const failQty = _sumDefectTypeInputs();
        const failEl = document.getElementById('inpDefectQty');
        if (failEl) failEl.value = failQty;

        const goodEl = document.getElementById('inpGoodQty');
        const totalEl = document.getElementById('inpTotalQty');

        if (_isPartialInspectionMode()) {
            const goodQty = parseInt(goodEl?.value || 0, 10) || 0;
            if (totalEl) totalEl.value = UIUtils.formatNumber(goodQty + failQty);
            return;
        }
        const goodQty = Math.max(0, available - failQty);
        if (goodEl) goodEl.value = goodQty;
        if (totalEl) totalEl.value = UIUtils.formatNumber(goodQty + failQty);
    }

    function _enableWorkQtyEdit() {
        if (!_canWriteInspection()) {
            UIUtils.toast('도장 검사 입력 권한이 없습니다.', 'warning');
            return;
        }
        const el = document.getElementById('piWorkQty');
        if (!el || el.disabled) return;
        if (!el.readOnly) {
            el.focus();
            el.select();
            return;
        }
        const prev = Number(el.value) || 0;
        el.readOnly = false;
        el.style.background = '#fff';
        el.style.borderColor = 'var(--accent-blue)';
        el.style.minWidth = '110px';
        el.style.width = '100%';
        el.style.flex = '1 1 110px';
        el.dataset.prevQty = String(prev);
        const btn = document.getElementById('piWorkQtyEditBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span> 적용';
            btn.className = 'btn btn-sm btn-primary';
            btn.style.flexShrink = '0';
            btn.setAttribute('onclick', 'PaintingInspectionModule.confirmWorkQtyEdit()');
        }
        let cancelBtn = document.getElementById('piWorkQtyCancelBtn');
        if (!cancelBtn && btn && btn.parentNode) {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.id = 'piWorkQtyCancelBtn';
            cancelBtn.className = 'btn btn-sm btn-outline';
            cancelBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;white-space:nowrap;flex-shrink:0;';
            cancelBtn.textContent = '취소';
            cancelBtn.setAttribute('onclick', 'PaintingInspectionModule.cancelWorkQtyEdit()');
            btn.parentNode.insertBefore(cancelBtn, btn.nextSibling);
        }
        const row = el.parentElement;
        if (row) {
            row.style.flexWrap = 'wrap';
            row.style.rowGap = '6px';
        }
        el.oninput = function() { _recalcInspQuantities(); };
        el.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmWorkQtyEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelWorkQtyEdit();
            }
        };
        el.focus();
        el.select();
    }

    function cancelWorkQtyEdit() {
        const el = document.getElementById('piWorkQty');
        if (!el) return;
        const prev = Number(el.dataset.prevQty);
        if (Number.isFinite(prev) && prev > 0) el.value = prev;
        el.readOnly = true;
        el.style.background = 'var(--bg-secondary)';
        el.style.borderColor = '';
        el.style.minWidth = '110px';
        el.style.flex = '1 1 110px';
        el.oninput = null;
        el.onkeydown = null;
        delete el.dataset.prevQty;
        _recalcInspQuantities();
        _resetWorkQtyEditButtons();
    }

    function _resetWorkQtyEditButtons() {
        const btn = document.getElementById('piWorkQtyEditBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">edit</span> 변경';
            btn.className = 'btn btn-sm btn-outline';
            btn.style.cssText = 'padding:4px 10px;font-size:0.75rem;white-space:nowrap;gap:3px;flex-shrink:0;';
            btn.setAttribute('onclick', 'PaintingInspectionModule._enableWorkQtyEdit()');
        }
        const cancelBtn = document.getElementById('piWorkQtyCancelBtn');
        if (cancelBtn) cancelBtn.remove();
    }

    function confirmWorkQtyEdit() {
        const el = document.getElementById('piWorkQty');
        if (!el) return;
        const newQty = Math.max(0, parseInt(String(el.value || '').replace(/[^\d]/g, ''), 10) || 0);
        if (newQty <= 0) {
            UIUtils.toast('작업수량은 1 이상이어야 합니다.', 'warning');
            el.focus();
            return;
        }
        const inspected = Math.max(0, Number(document.getElementById('piInspectedQtyHidden')?.value) || 0);
        if (inspected > 0 && newQty < inspected) {
            UIUtils.toast('작업수량은 이미 검사한 수량(' + UIUtils.formatNumber(inspected) + ' EA)보다 작을 수 없습니다.', 'warning');
            el.focus();
            return;
        }
        el.value = newQty;
        el.readOnly = true;
        el.style.background = 'var(--bg-secondary)';
        el.style.borderColor = '';
        el.style.minWidth = '110px';
        el.style.flex = '1 1 110px';
        el.oninput = null;
        el.onkeydown = null;
        delete el.dataset.prevQty;
        _recalcInspQuantities();
        _resetWorkQtyEditButtons();
        const workRef = Storage.getById(PAINTING_WORK_STORE, _piWorkId);
        const isLaserWip = workRef ? _isLaserWipWork(workRef) : false;
        _syncWorkQtyToWorkLogImmediate(newQty)
            .then(function() {
                var msg = '작업일지 수량 ' + UIUtils.formatNumber(newQty) + ' EA 반영';
                if (isLaserWip) msg += ' · 레이저 재공품 출고 연동';
                else msg += ' · 사출 출고 연동';
                UIUtils.toast(msg, 'success');
            })
            .catch(function(e) {
                UIUtils.toast('작업일지 반영 실패: ' + (e && e.message ? e.message : '오류'), 'error');
            });
    }

    // 임시 저장 내용을 현재 열린 검사 모달 폼에 채운다.
    function _applyInspectionDraft(draft) {
        if (!draft) return;
        const setV = (id, val) => { const el = document.getElementById(id); if (el && val != null && val !== '') el.value = val; };
        const setNum = (id, val) => {
            const el = document.getElementById(id);
            if (!el || val == null || val === '') return;
            el.value = (typeof UIUtils !== 'undefined' && UIUtils.toInputNumber)
                ? UIUtils.toInputNumber(val, 0)
                : String(val).replace(/,/g, '');
        };
        setV('inpInspectionDate',      draft.date);
        setV('inpInspectionStartTime', draft.startTime);
        setV('inpInspectionEndTime',   draft.endTime);
        setV('piPackUnit',             draft.packUnit);
        setV('inpReworkQty',           draft.reworkQty);
        (draft.inspectorIds || []).forEach((val, idx) => {
            const el = document.getElementById('inspector' + (idx + 1));
            if (el && val) el.value = val;
        });
        if (typeof _syncInspectorOptions === 'function') _syncInspectorOptions();
        Object.entries(draft.defects || {}).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
        // 불량 합계·양품수·소요시간 재계산
        _updateDefectTotal();
        // 불량이 하나도 없으면 양품수·리워크수는 저장값 유지
        if (!draft.defects || Object.keys(draft.defects).length === 0) {
            setNum('inpGoodQty', draft.goodQty);
            setNum('inpDefectQty', draft.defectQty);
            setV('inpReworkQty', draft.reworkQty);
        }
        _calculateInspectionTime();
    }

    function _calculateInspectionTime() {
        // 신규 등록 or 편집 모달 — 둘 중 현재 열려 있는 것 사용
        const startTimeEl = document.getElementById('inpInspectionStartTime')
                         || document.getElementById('editInspectionStartTime');
        const endTimeEl   = document.getElementById('inpInspectionEndTime')
                         || document.getElementById('editInspectionEndTime');
        const durationEl  = document.getElementById('inpInspectionDuration')
                         || document.getElementById('editInspectionDuration');

        if (!startTimeEl || !endTimeEl || !durationEl) return;

        const startTime = startTimeEl.value;
        const endTime   = endTimeEl.value;

        if (!startTime || !endTime) {
            durationEl.value = '';
            return;
        }

        const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let duration = toMin(endTime) - toMin(startTime);
        if (duration < 0) duration += 24 * 60; // 자정 넘어가는 경우

        // 분 단위로 표시
        durationEl.value = `${duration}분`;

        // 표준(예상) 검사 시간 대비 실제 소요시간 비교 표시
        const cmpEl = document.getElementById('inspExpectedTimeCompare');
        if (cmpEl && _currentInspectionExpectedSec > 0) {
            const actualSec = duration * 60;
            const diffPct = Math.round((actualSec - _currentInspectionExpectedSec) / _currentInspectionExpectedSec * 100);
            if (diffPct > 0) {
                cmpEl.innerHTML = `실제 ${duration}분 · 표준 대비 <strong style="color:var(--accent-red);">+${diffPct}%</strong>`;
            } else if (diffPct < 0) {
                cmpEl.innerHTML = `실제 ${duration}분 · 표준 대비 <strong style="color:var(--accent-green);">${diffPct}%</strong>`;
            } else {
                cmpEl.innerHTML = `실제 ${duration}분 · 표준과 동일`;
            }
        }
    }

    function _updateDefectTotal() {
        if (document.getElementById('piWorkQty')) {
            _recalcInspQuantities();
            return;
        }
        // 모든 불량 유형 입력값 합산 (inj-*, paint-*)
        let defectSum = 0;
        const defectInputs = document.querySelectorAll('[id^="inj-"], [id^="paint-"], [id^="plate-"], [id^="laser-"]');
        defectInputs.forEach(el => {
            defectSum += parseInt(el.value || 0);
        });
        const inspectionQtyEl = document.getElementById('inpInspectionQty');
        const maxDefectQty = parseInt(inspectionQtyEl ? inspectionQtyEl.value.replace(/,/g, '') || 0 : 0);
        if (maxDefectQty > 0 && defectSum > maxDefectQty) {
            const activeEl = document.activeElement;
            if (activeEl && Array.from(defectInputs).includes(activeEl)) {
                const overflow = defectSum - maxDefectQty;
                const current = parseInt(activeEl.value || 0);
                activeEl.value = Math.max(0, current - overflow);
                defectSum = maxDefectQty;
            } else {
                defectSum = maxDefectQty;
            }
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 최대 ${UIUtils.formatNumber(maxDefectQty)} EA`, 'warning');
        }

        // 불량수 자동 입력
        const defectQtyEl = document.getElementById('inpDefectQty');
        if (defectQtyEl) defectQtyEl.value = defectSum;

        const goodQtyEl = document.getElementById('inpGoodQty');
        if (inspectionQtyEl && goodQtyEl) {
            const inspQty = parseInt(inspectionQtyEl.value.replace(/,/g, '') || 0);
            goodQtyEl.value = Math.max(0, inspQty - defectSum);
        }

        const goodQty = parseInt(goodQtyEl ? goodQtyEl.value || 0 : 0);
        const totalEl = document.getElementById('inpTotalQty');
        if (totalEl) totalEl.value = UIUtils.formatNumber(goodQty + defectSum);
    }

    function _getPaintingWorkQty(work) {
        if (!work) return 0;
        return Number(work.productionQty || work.inputQty || work.quantity || work.goodQty || 0) || 0;
    }

    function _validateDefectQtyWithinWorkQty(defectQty, workQty) {
        const defect = Number(defectQty) || 0;
        const work = Number(workQty) || 0;
        if (work > 0 && defect > work) {
            UIUtils.toast(`불량수는 작업 수량보다 클 수 없습니다. 작업 ${UIUtils.formatNumber(work)} EA / 불량 ${UIUtils.formatNumber(defect)} EA`, 'warning');
            return false;
        }
        return true;
    }

    // ── 포장 헬퍼 함수 ──────────────────────────────────────────────
    function _parsePaintPackNum(raw) {
        if (raw === undefined || raw === null || raw === '' || raw === 0) return 0;
        const cleaned = String(raw).replace(/,/g, '');
        const direct = Number(cleaned);
        if (!isNaN(direct) && direct > 0) return direct;
        const m = cleaned.match(/^(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : 0;
    }

    function _findPaintProductPackUnit(carModel, partName, color) {
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const packKeys = ['packUnit', 'packingUnit', 'packageUnit', 'packQty', 'packingQty'];
        const getRaw = prod => {
            for (const key of packKeys) {
                const v = prod && prod[key];
                if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
            }
            return '';
        };
        const hasPack = p => _parsePaintPackNum(getRaw(p)) > 0;
        const exact = products.find(p =>
            (p.carModel || '') === (carModel || '') &&
            (p.partName || '') === (partName || '') &&
            (p.color || '') === (color || '') &&
            hasPack(p)
        );
        if (exact) return _parsePaintPackNum(getRaw(exact));
        const byPart = products.find(p =>
            (p.carModel || '') === (carModel || '') &&
            (p.partName || '') === (partName || '') &&
            hasPack(p)
        );
        return byPart ? _parsePaintPackNum(getRaw(byPart)) : 0;
    }

    function _getPaintPrevResidualQty(carModel, partName, color) {
        const all = Storage.getAll(STORE) || [];
        const match = all
            .filter(i => i.carModel === carModel && i.partName === partName &&
                         (!color || !i.color || i.color === color) &&
                         typeof i.residualQty === 'number')
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                            (b.inspectionStartTime || '').localeCompare(a.inspectionStartTime || ''));
        return match.length ? (Number(match[0].residualQty) || 0) : 0;
    }

    function _updatePaintPackagingCalc() {
        const prevRes  = parseInt(document.getElementById('piPrevResidual')?.value || 0);
        const packUnit = parseInt(document.getElementById('piPackUnit')?.value || 0);
        const boxCount = parseInt(document.getElementById('piPackBoxCount')?.value || 0);
        const goodQty  = parseInt(document.getElementById('inpGoodQty')?.value || 0);
        const packQty  = packUnit * boxCount;
        const newResid = prevRes + goodQty - packQty;
        const packDisp  = document.getElementById('piPackQtyDisp');
        const residDisp = document.getElementById('piNewResidDisp');
        if (packDisp)  packDisp.textContent = UIUtils.formatNumber(packQty);
        if (residDisp) {
            residDisp.textContent = UIUtils.formatNumber(Math.max(0, newResid));
            residDisp.style.color = newResid < 0 ? 'var(--accent-red)' : 'var(--accent-orange)';
        }
    }

    function _autoPaintBoxCount() {
        const prevRes  = parseInt(document.getElementById('piPrevResidual')?.value || 0);
        const packUnit = parseInt(document.getElementById('piPackUnit')?.value || 0);
        const goodQty  = parseInt(document.getElementById('inpGoodQty')?.value || 0);
        const el = document.getElementById('piPackBoxCount');
        if (el && packUnit > 0) el.value = Math.floor((prevRes + goodQty) / packUnit);
        _updatePaintPackagingCalc();
    }

    function _notifyPaintInspectionRegistered(rec, work, opts) {
        opts = opts || {};
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        try {
            const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
                ? AuthModule.getIncomingInspNotifyRecipientIds('paint_insp')
                : [];
            if (!recipients.length) return;
            const isPartial = !!(opts.isPartial || (rec && rec.isPartial));
            const remainingQty = Number(opts.remainingQty);
            const defects = Array.isArray(rec && rec.defects) ? rec.defects : [];
            const defectTxt = defects
                .filter(function (d) { return Number(d.defectCount) > 0; })
                .map(function (d) { return (d.defectName || '-') + '(' + d.defectCount + ')'; })
                .join(', ');
            const inspectors = Array.isArray(rec && rec.inspectors) ? rec.inspectors.filter(Boolean).join(', ') : '';
            const title = isPartial
                ? (remainingQty > 0 ? '외관 검사 등록 (부분검사)' : '외관 검사 완료 (부분검사 전량 소진)')
                : '외관 검사 완료';
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: title,
                body: [
                    isPartial && remainingQty > 0
                        ? '외관 부분검사가 등록되었습니다. 남은 수량은 대기 목록에 유지됩니다.'
                        : '외관 검사가 등록되었습니다.',
                    '',
                    '라인: ' + ((work && work.line) || rec.line || '-'),
                    '검사일: ' + (rec.date || '-'),
                    '차종: ' + (rec.carModel || (work && work.carModel) || '-'),
                    '품명: ' + (rec.partName || (work && work.partName) || '-'),
                    '컬러: ' + (rec.color || (work && work.color) || '-'),
                    'LOT: ' + (rec.lotNo || '-'),
                    '검사수량: ' + UIUtils.formatNumber(rec.inspectionQty) + ' EA',
                    '양품: ' + UIUtils.formatNumber(rec.goodQty) + ' EA',
                    '불량: ' + UIUtils.formatNumber(rec.defectQty) + ' EA',
                    rec.reworkQty ? ('리워크: ' + UIUtils.formatNumber(rec.reworkQty) + ' EA') : '',
                    defectTxt ? ('불량내역: ' + defectTxt) : '',
                    isPartial ? ('남은 수량: ' + UIUtils.formatNumber(remainingQty) + ' EA') : '',
                    inspectors ? ('검사자: ' + inspectors) : ''
                ].filter(Boolean).join('\n'),
                category: 'paint_insp',
                priority: isPartial && remainingQty > 0 ? 'normal' : 'high'
            });
        } catch (e) {
            console.warn('[PaintingInspectionModule] 외관 검사 등록 통보 실패:', e);
        }
    }

    // 검사 데이터 저장 함수
    async function _saveInspection(workId) {
        if (!_canWriteInspection()) {
            UIUtils.toast('도장 검사 입력 권한이 없습니다.', 'warning');
            return;
        }
        const work = Storage.getById(PAINTING_WORK_STORE, workId);
        if (!work) {
            UIUtils.toast('도장 작업을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty      = parseInt(document.getElementById('inpGoodQty').value || 0);
        const defectQty    = parseInt(document.getElementById('inpDefectQty').value || 0);
        const reworkQty    = _getReworkQtyFromForm();
        // availableQty = 이번에 검사 가능한 전체(남은) 수량 — 부분완료 회차의 상한선으로 사용
        const availableQty = parseInt(document.getElementById('inpInspectionQty').value.replace(/,/g, '') || 0);

        // ✓ Case 1: 부분 완료 여부 (양품수+불량수 = 이번 회차 실제 검사수량)
        const isPartialCheckbox = document.getElementById('inpIsPartialInspection');
        const isPartial = !!(isPartialCheckbox && isPartialCheckbox.checked);

        // 포장 단위만 제품 마스터에서 보관 (잔량 산출 없음)
        const packUnit = parseInt(document.getElementById('piPackUnit')?.value || 0) ||
            _findPaintProductPackUnit(work.carModel, work.partName, work.color) || 0;

        // ✓ 검사 수량 산정: 검사수량 = 양품 + 불량
        const effectiveInspQty = isPartial
            ? (goodQty + defectQty)
            : (availableQty > 0 ? availableQty : (goodQty + defectQty));
        if (effectiveInspQty === 0) {
            UIUtils.toast('검사수량이 0입니다. 양품수를 입력해주세요.', 'warning');
            return;
        }
        // ✓ 부분완료 시 이번 회차 검사수량이 남은 수량을 초과할 수 없음
        if (isPartial && effectiveInspQty > availableQty) {
            UIUtils.toast(`이번 검사수량(${UIUtils.formatNumber(effectiveInspQty)})이 남은 수량(${UIUtils.formatNumber(availableQty)})을 초과할 수 없습니다.`, 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(defectQty, _getPaintingWorkQty(work) || effectiveInspQty)) {
            const defectQtyEl = document.getElementById('inpDefectQty');
            if (defectQtyEl) defectQtyEl.focus();
            return;
        }
        if (goodQty + defectQty !== effectiveInspQty) {
            UIUtils.toast('양품수 + 불량수가 검사수량과 맞지 않습니다.', 'warning');
            return;
        }

        // 검사자 정보 수집 (하단 검사자 섹션에서 inspector1~5)
        const inspectors = [];
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`inspector${i}`);
            if (el && el.value) {
                // select 요소일 경우 선택된 option의 text를 가져옴
                if (el.tagName === 'SELECT') {
                    const selectedOption = el.options[el.selectedIndex];
                    if (selectedOption && selectedOption.text && selectedOption.text !== '선택 안함') {
                        inspectors.push(selectedOption.text);
                    }
                } else if (el.value) {
                    inspectors.push(el.value);
                }
            }
        }

        // 검사자 필수 검증 (1명 이상)
        if (inspectors.length === 0) {
            UIUtils.toast('검사자를 1명 이상 선택해 주세요. (검사자 등록 필수)', 'warning');
            const firstInspector = document.getElementById('inspector1');
            if (firstInspector) firstInspector.focus();
            return;
        }

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('inpInspectionDate');
        const inspectionStartTimeEl = document.getElementById('inpInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('inpInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : UIUtils.today();
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : '';
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : '';

        const productDisplay = `${work.carModel} ${work.partName} ${work.color}`;
        const registered = _captureRegisteredBy();
        const baseData = {
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime,
            workId,
            productId: workId,
            productName: productDisplay,
            carModel: work.carModel,
            partName: work.partName,
            color: work.color,
            paintingDate: work.date,
            paintingTime: work.startTime ? (work.startTime + (work.endTime ? '~' + work.endTime : '')) : '',
            lotNo: work.lots && work.lots.length > 0 ? work.lots.map(l => l.lotNo).join(', ') : (work.lotNo || ''),
            inspectionQty: effectiveInspQty,
            goodQty,
            defectQty,
            reworkQty,
            inspectors,
            registeredBy: registered.registeredBy,
            registeredByName: registered.registeredByName,
            createdBy: registered.registeredBy,
            packUnit,
            prevResidualQty: 0,
            packBoxCount: 0,
            packQty: goodQty,
            residualQty: 0,
            planId: null,
            planOrderNo: null
        };

        // 불량 유형별 수집
        const allDefects = Storage.getAll(DEFECT_STORE) || [];
        const defectDetails = [];

        for (const defect of allDefects) {
            let count = 0;
            const injInput   = document.getElementById(`inj-${defect.id}`);
            const paintInput = document.getElementById(`paint-${defect.id}`);
            const plateInput = document.getElementById(`plate-${defect.id}`);
            const laserInput = document.getElementById(`laser-${defect.id}`);
            if (injInput)   count = parseInt(injInput.value   || 0);
            if (paintInput) count = parseInt(paintInput.value || 0);
            if (plateInput) count = parseInt(plateInput.value || 0);
            if (laserInput) count = parseInt(laserInput.value || 0);

            if (count > 0) {
                defectDetails.push({
                    defectId:    defect.id,
                    defectName:  defect.name,
                    defectType:  defect.type || 'injection',
                    defectCount: count
                });
            }
        }
        const detailDefectTotal = defectDetails.reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, _getPaintingWorkQty(work) || effectiveInspQty)) {
            return;
        }

        // 검사 결과 1건만 저장
        const savedInspection = await Storage.add(STORE, {
            ...baseData,
            defects: defectDetails,
            inspectionStatus: isPartial ? 'partial' : 'completed', // ✓ Case 1: 부분/완료 구분
            isPartial: isPartial, // ✓ Case 1: 부분 검사 플래그
            createdAt: new Date().toISOString()
        });
        _notifyPaintInspectionRegistered(savedInspection, work, {
            isPartial: isPartial,
            remainingQty: isPartial
                ? Math.max(0, (work.productionQty || 0) - ((work.inspectedQty || 0) + effectiveInspQty))
                : 0
        });

        // 리워크로 보내기(외관검사 → 리워크 재공 입고)는 UI/기능 삭제됨

        // ✓ Case 1: 부분 완료 처리
        if (isPartial) {
            // ✓ 다회차 부분검사 누적 처리 — 이전 회차까지 누적 검사수량에 이번 회차를 더한다.
            //   (이전 버그: work.productionQty - effectiveInspQty로 계산해 2회차부터 누적이 무시됨)
            const previousInspectedQty = work.inspectedQty || 0;
            const cumulativeInspectedQty = previousInspectedQty + effectiveInspQty;
            const remainingQty = Math.max(0, (work.productionQty || 0) - cumulativeInspectedQty);
            // 이번 회차로 전량 소진되면 부분 상태를 해제하고 완료로 전환
            const nextStatus = remainingQty > 0 ? 'partial' : 'completed';

            // 도장 작업 업데이트
            await Storage.update(PAINTING_WORK_STORE, workId, {
                inspectionStatus: nextStatus,
                inspectedQty: cumulativeInspectedQty, // 누적 검사 완료 수량
                remainingQty: remainingQty, // 미검사 수량
                lastInspectionDate: inspectionDate,
                updatedAt: new Date().toISOString()
            });

            // 부분 완료 메시지
            const msg = remainingQty > 0
                ? `부분 검사 완료: 이번 회차 ${UIUtils.formatNumber(effectiveInspQty)} EA 검사, 누적 ${UIUtils.formatNumber(cumulativeInspectedQty)} EA / 남은 ${UIUtils.formatNumber(remainingQty)} EA (외관검사 대기 상태 유지)`
                : `부분 검사로 전량 소진되어 검사 완료 처리되었습니다. (누적 ${UIUtils.formatNumber(cumulativeInspectedQty)} EA)`;
            UIUtils.toast(msg, 'success');
        } else {
            // 해당 작업의 상태를 "검사 완료"로 변경
            await Storage.update(PAINTING_WORK_STORE, workId, {
                inspectionStatus: 'completed',
                inspectionDate: inspectionDate,
                inspectionStartTime: inspectionStartTime,
                inspectionEndTime: inspectionEndTime,
                inspectors: inspectors,
                updatedAt: new Date().toISOString()
            });
            UIUtils.toast('검사 데이터가 저장되었습니다.', 'success');
        }

        // 검사 완료 시 임시 저장 내용 정리
        await _clearInspectionDraft(workId, true);

        // ── 출하검사 대기 자동 등록 (레이져 공정 없는 제품만) ──────────
        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _prod = _products.find(p => p.carModel === work.carModel && p.partName === work.partName && p.color === work.color)
                   || _products.find(p => p.carModel === work.carModel && p.partName === work.partName);
        // 이 도장 라인 완료 후 레이저가 남아있으면 출하대기 미등록 (레이저 → 도장 → 검사 순서인 제품은 등록)
        const _paintLineName = (work.line || '').trim();
        const _isLaser = _laserAfterPaintLine(_prod, _paintLineName);

        // ✓ Case 1: 부분 완료인 경우 양품만 출하검사로 이동 (잔량/포장박스 산출 없음)
        if (!_isLaser && goodQty > 0) {
            const standbyQty = goodQty;
            await Storage.add(DB.STORES.SHIPPING_STANDBY, {
                date         : inspectionDate,
                source       : 'painting_inspection',
                paintingWorkId: workId,
                carModel     : work.carModel     || '',
                partName     : work.partName     || '',
                color        : work.color        || '',
                paintingDate : work.date         || '',
                lotNo        : work.lots && work.lots.length > 0
                                ? work.lots.map(l => l.lotNo).join(', ')
                                : (work.lotNo || ''),
                inspectionQty: standbyQty,
                goodQty      : standbyQty,
                packUnit     : packUnit,
                boxCount     : packUnit > 0 ? Math.floor(standbyQty / packUnit) : 0,
                residualQty  : 0,
                customer     : _prod ? (_prod.customer || '') : '',
                status       : '대기',
                isPartialSource: isPartial // ✓ Case 1: 부분 검사에서 나온 출하검사임을 표시
            });
        }

        // 모달 제거 후 도장 검사 페이지로 복귀
        const modal = document.querySelector('.modal.fade');
        if (modal) modal.remove();
        Router.navigate('painting-inspection');
    }

    // 검사 이력 보기 (필터 기능 포함)
    function showHistory() {
        const allData = Storage.getAll(STORE) || [];
        allData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 고유 차종/품명 추출
        const uniqueCarModels = UIUtils.sortCarModels(allData.map(d => d.carModel));
        const uniquePartNames = [...new Set(allData.map(d => d.partName).filter(Boolean))].sort();

        // 초기값
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        let modalContent = `
            <div style="margin-bottom:16px;">
                <!-- 필터 바 -->
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                    <input type="date" id="histStart" value="${startDate}" style="width:130px;" class="form-input">
                    <span style="color:var(--text-muted);">~</span>
                    <input type="date" id="histEnd" value="${endDate}" style="width:130px;" class="form-input">

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                    <select id="histCarModel" style="width:120px;" class="form-select">
                        <option value="">전체</option>
                        ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>

                    <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                    <select id="histPartName" style="width:150px;" class="form-select">
                        <option value="">전체</option>
                        ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>

                    <button class="btn btn-outline btn-sm" onclick="(() => {
                        const start = document.getElementById('histStart').value;
                        const end = document.getElementById('histEnd').value;
                        const carModel = document.getElementById('histCarModel').value;
                        const partName = document.getElementById('histPartName').value;
                        PaintingInspectionModule._filterHistoryTable(start, end, carModel, partName);
                    })()" style="margin-left:8px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">search</span> 조회
                    </button>

                    <button class="btn btn-secondary btn-sm" onclick="window.print()" style="margin-left:12px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                    </button>
                </div>

                <!-- 결과 컨테이너 (가로 스크롤) -->
                <div style="overflow-x:auto; overflow-y:auto; max-height:600px; border:1px solid var(--border); border-radius:8px;" id="historyTableContainer"></div>
            </div>

            <style>
                @media print {
                    body { margin: 0 !important; padding: 0 !important; background: white !important; }
                    .modal, .modal * { box-shadow: none !important; }
                    .modal { position: static !important; display: block !important; max-width: 100% !important; width: 100% !important; padding: 0 !important; border: none !important; }
                    .modal div[style*="position:fixed"] { position: static !important; background: white !important; padding: 20px !important; max-width: 100% !important; max-height: none !important; width: 100% !important; overflow: visible !important; }
                    .modal h2 { display: none !important; }
                    .modal button { display: none !important; }
                    div[style*="display:flex"][style*="align-items:center"][style*="gap:8px"] { display: none !important; }
                    #histStart, #histEnd, #histCarModel, #histPartName, .form-input, .form-select { display: none !important; }
                    .data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    .data-table thead th { background: #f5f5f5 !important; border: 1px solid #ccc !important; padding: 8px !important; text-align: left; font-weight: bold; }
                    .data-table tbody td { border: 1px solid #ccc !important; padding: 6px !important; }
                    .data-table tbody tr:nth-child(odd) { background: #fafafa !important; }
                }
            </style>
        `;

        // 커스텀 모달 (크기를 2배로 확대)
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.style.display = 'block';
        modalEl.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; border-radius:12px; max-width:90vw; max-height:90vh; width:90vw; overflow:auto; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h2 style="margin:0; font-size:1.25rem;">도장 검사 이력 조회</h2>
                        <button onclick="this.closest('.modal').parentElement.remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    ${modalContent}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // 초기 테이블 렌더링
        _filterHistoryTable(startDate, endDate, '', '');
    }

    // 이력 테이블 필터링 및 렌더링 (검사 단위로 그룹화, 불량 유형별 분리)
    function _filterHistoryTable(startDate, endDate, filterCarModel, filterPartName) {
        const allData = Storage.getAll(STORE) || [];
        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (id -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // 공용 필터 적용
        let filtered = _applyCommonFilters(allData, startDate, endDate, filterCarModel, filterPartName);

        // 검사 기록 정규화 (새 구조: defects 배열 / 기존 구조: 개별 레코드)
        const grouped = {};
        filtered.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            // 새 구조: defects 배열이 있으면 그걸 사용
            if (d.defects && Array.isArray(d.defects)) {
                d.defects.forEach(def => {
                    grouped[key].defects.push({
                        name: def.defectName,
                        count: def.defectCount
                    });
                    grouped[key].totalDefects += (def.defectCount || 0);
                });
            } else {
                // 기존 구조: 개별 레코드
                grouped[key].defects.push({
                    name: d.defectName,
                    count: d.defectCount
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });

        // 그룹 데이터를 배열로 변환 및 정렬
        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const container = document.getElementById('historyTableContainer');
        if (!container) return;

        if (groupedArray.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-muted);">조회된 이력이 없습니다.</p>`;
            return;
        }

        // 각 검사 세션의 도장 작업 정보 조회 및 테이블 생성
        const tableRows = groupedArray.map(group => {
            // 새 데이터 구조에서는 paintingDate, lotNo, inspectionQty가 직접 저장됨
            // 기존 데이터와의 호환성을 위해 paintingWorks에서도 조회
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '-');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '-')) :
                '-');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리 (사출 불량 / 도장 불량)
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            // 사출 불량 표시
            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:8px;"><strong style="color:#ea580c;">사출 불량:</strong><br/>${injectionDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#ea580c;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            // 도장 불량 표시
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장 불량:</strong><br/>${paintingDefects.map(d => `<span style="display:inline-block;margin:4px 6px 4px 0;padding:4px 8px;background:#16a34a;color:white;border-radius:4px;font-size:0.85rem;font-weight:600;">${d.name} <span style="font-weight:700;">${d.count}</span></span>`).join('')}</div>` :
                '';

            const defectDisplay = injectionDisplay + paintingDisplay;

            return `
                <tr>
                    <td style="white-space:nowrap;font-weight:500;">${group.date || '-'}</td>
                    <td style="white-space:nowrap;font-weight:500;">${paintingDate || '-'}</td>
                    <td>${group.carModel || '-'}</td>
                    <td><strong>${group.partName || '-'}</strong></td>
                    <td>${group.color || '-'}</td>
                    <td style="font-family:monospace;font-size:0.85rem;">${lotDisplay}</td>
                    <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(inspectionQty)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:600;">${UIUtils.formatNumber(group.totalDefects)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:700;">${defectRate}%</td>
                    <td style="font-size:0.85rem;vertical-align:top;">${defectDisplay || '-'}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="data-table" style="margin:0; table-layout:auto;">
                <thead>
                    <tr>
                        <th style="min-width:100px;">검사일</th>
                        <th style="min-width:100px;">도장작업일</th>
                        <th style="min-width:80px;">차종</th>
                        <th style="min-width:100px;">품명</th>
                        <th style="min-width:80px;">컬러</th>
                        <th style="min-width:120px;">사출 LOT</th>
                        <th style="text-align:right;min-width:80px;">검사수량</th>
                        <th style="text-align:right;min-width:80px;">불량수량</th>
                        <th style="text-align:right;min-width:80px;">불량률(%)</th>
                        <th style="min-width:450px;">불량 유형</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    function exportData() {
        const allData = Storage.getAll(STORE);
        if (!allData.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }

        const paintingWorks = Storage.getAll(PAINTING_WORK_STORE) || [];
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵 생성 (name -> type)
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        // productId + date로 그룹화
        const grouped = {};
        allData.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    // 새로운 필드들
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || []
                };
            }
            grouped[key].defects.push({
                name: d.defectName,
                count: d.defectCount
            });
            grouped[key].totalDefects += (d.defectCount || 0);
        });

        const groupedArray = Object.values(grouped).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const headers = ['검사일', '도장작업일', '차종', '품명', '컬러', '사출 LOT', '검사수량', '양품수', '불량수량', '불량률(%)', '사출 불량', '도장 불량'];
        const rows = groupedArray.map(group => {
            const paintingWork = paintingWorks.find(w => w.id === group.productId);
            const paintingDate = group.paintingDate || (paintingWork ? paintingWork.date : '');
            const lotDisplay = group.lotNo || (paintingWork ?
                (paintingWork.lots && paintingWork.lots.length > 0 ?
                    paintingWork.lots.map(l => l.lotNo).join(', ') :
                    (paintingWork.lotNo || '')) :
                '');
            const inspectionQty = group.inspectionQty || (paintingWork ? (paintingWork.productionQty || 0) : 0);
            const goodQty = group.goodQty || 0;
            const defectQty = group.defectQty || group.totalDefects || 0;
            const defectRate = inspectionQty > 0 ?
                ((defectQty / inspectionQty) * 100).toFixed(1) :
                '0.0';

            // 불량 유형별 분리
            const injectionDefects = [];
            const paintingDefects = [];
            group.defects.forEach(d => {
                const type = defectTypeMap[d.name] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(d);
                } else {
                    injectionDefects.push(d);
                }
            });

            const injectionDefectNames = injectionDefects.map(d => `${d.name}(${d.count})`).join(', ');
            const paintingDefectNames = paintingDefects.map(d => `${d.name}(${d.count})`).join(', ');

            return [
                group.date || '',
                paintingDate || '',
                group.carModel || '',
                group.partName || '',
                group.color || '',
                lotDisplay,
                inspectionQty,
                goodQty,
                defectQty,
                defectRate,
                injectionDefectNames,
                paintingDefectNames
            ];
        });

        Storage.exportToCSV(headers, rows, '도장검사_불량집계');
        UIUtils.toast('내보내기 완료', 'success');
    }

    // ===================================================================
    // Phase 2: 검사 완료 실적 기능
    // ===================================================================

    // 검사 완료 실적 화면 렌더링
    function showCompletionResults() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="completionStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="completionEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="completionCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateCompletionPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="completionPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._filterCompletionResults()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div style="overflow-x:auto; border:1px solid var(--border); border-radius:8px;" id="completionTableContainer"></div>
        `;

        // 초기 조회
        _filterCompletionResults();
    }

    // 차종 선택 시 검사 완료 실적 품명 필터 업데이트
    function _updateCompletionPartFilter() {
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('completionPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 차종 선택 시 통계 대시보드 품명 필터 업데이트
    function _updateStatsPartFilter() {
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const allData = Storage.getAll(STORE) || [];
        const filtered = carModel ? allData.filter(d => d.carModel === carModel) : allData;
        const uniqueParts = [...new Set(filtered.map(d => d.partName).filter(Boolean))].sort();
        const sel = document.getElementById('statsPartName');
        if (!sel) return;
        sel.innerHTML = `<option value="">전체</option>` +
            uniqueParts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 검사 완료 실적 필터링 및 테이블 렌더링
    function _filterCompletionResults() {
        const startDate = document.getElementById('completionStart')?.value || '';
        const endDate = document.getElementById('completionEnd')?.value || '';
        const carModel = document.getElementById('completionCarModel')?.value || '';
        const partName = document.getElementById('completionPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);
        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];

        // defectType 맵
        const defectTypeMap = {};
        defectTypes.forEach(dt => {
            if (dt && dt.name) {
                defectTypeMap[dt.name] = dt.type || 'injection';
            }
        });

        const container = document.getElementById('completionTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-muted);">검사 완료 실적이 없습니다.</p>`;
            return;
        }

        // 정렬 (최신순)
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const _works = Storage.getAll(PAINTING_WORK_STORE) || [];
        function _fmtCompDate(dateStr, timeStr) {
            const p = (dateStr || '').split('-');
            if (p.length !== 3) return dateStr || '-';
            const t = (timeStr || '').slice(0, 5);
            return '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + p[0] + '</span>' +
                   '<span style="font-weight:600;white-space:nowrap;">' + p[1] + '-' + p[2] + '</span>' +
                   (t ? '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">' + t + '</span>' : '');
        }

        const tableRows = filtered.map(d => {
            const _work = _works.find(w => w.id === (d.workId || d.productId));
            const _line = (_work || {}).line || '-';
            const _paintDate = d.paintingDate || (_work || {}).date || '';
            const _paintTime = d.paintingTime || ((_work || {}).startTime || '');

            const injectionDefects = [];
            const paintingDefects = [];

            (d.defects || []).forEach(def => {
                const type = defectTypeMap[def.defectName] || 'injection';
                if (type === 'painting') {
                    paintingDefects.push(def);
                } else {
                    injectionDefects.push(def);
                }
            });

            const injectionDisplay = injectionDefects.length > 0 ?
                `<div style="margin-bottom:4px;"><strong style="color:#ea580c;">사출:</strong> ${injectionDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';
            const paintingDisplay = paintingDefects.length > 0 ?
                `<div><strong style="color:#16a34a;">도장:</strong> ${paintingDefects.map(d => `${d.defectName} ${d.defectCount}`).join(', ')}</div>` : '';

            const defectRate = d.inspectionQty > 0 ?
                ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

            const registeredName = _registeredByName(d);

            return `
                <tr>
                    <td style="line-height:1.3;white-space:nowrap;">${_fmtCompDate(d.date, d.inspectionStartTime)}</td>
                    <td style="line-height:1.3;white-space:nowrap;">${_fmtCompDate(_paintDate, _paintTime)}</td>
                    <td style="white-space:nowrap;"><span class="badge badge-info">${_line}</span></td>
                    <td style="white-space:nowrap;">${d.carModel || ''}</td>
                    <td style="white-space:nowrap;"><strong>${d.partName || ''}</strong></td>
                    <td style="white-space:nowrap;">${d.color || ''}</td>
                    <td style="text-align:right;font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(d.inspectionQty || 0)}</td>
                    <td style="text-align:right;color:var(--accent-green);font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(d.goodQty || 0)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:600;white-space:nowrap;">${UIUtils.formatNumber(d.defectQty || 0)}</td>
                    <td style="text-align:right;color:var(--accent-red);font-weight:700;white-space:nowrap;">${defectRate}%</td>
                    <td style="font-size:0.85rem;">${injectionDisplay}${paintingDisplay}</td>
                    <td style="white-space:nowrap;font-size:0.85rem;">${registeredName}</td>
                    <td style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-outline" onclick="PaintingInspectionModule._showCompletionDetail('${d.id}', event)" style="padding:4px 8px; font-size:0.8rem;">보기</button>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="data-table-wrapper">
            <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="white-space:nowrap;">검사일</th>
                        <th style="white-space:nowrap;">도장작업일</th>
                        <th style="white-space:nowrap;">라인</th>
                        <th style="white-space:nowrap;">차종</th>
                        <th style="white-space:nowrap;">품명</th>
                        <th style="white-space:nowrap;">컬러</th>
                        <th style="white-space:nowrap;text-align:right;">검사수</th>
                        <th style="white-space:nowrap;text-align:right;">양품</th>
                        <th style="white-space:nowrap;text-align:right;">불량</th>
                        <th style="white-space:nowrap;text-align:right;">불량률</th>
                        <th style="white-space:nowrap;">불량 유형</th>
                        <th style="white-space:nowrap;">등록자</th>
                        <th style="white-space:nowrap;">작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            </div>
        `;
    }

    // 검사 완료 실적 상세 조회 팝업
    function _showCompletionDetail(id, event) {
        const d = Storage.getById(STORE, id);
        if (!d) return;

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const defectTypeMap = {};
        defectTypes.forEach(dt => { if (dt && dt.name) defectTypeMap[dt.name] = dt.type || 'injection'; });

        const defectRate = d.inspectionQty > 0
            ? ((d.defectQty / d.inspectionQty) * 100).toFixed(1) : '0.0';

        // 불량 유형 분리
        const injDefects = [];
        const paintDefects = [];
        (d.defects || []).forEach(def => {
            if (def.defectCount > 0) {
                (defectTypeMap[def.defectName] === 'painting' ? paintDefects : injDefects).push(def);
            }
        });

        const defectRowsHtml = (group, label, color) => group.length === 0 ? '' : `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.78rem; font-weight:600; color:${color}; margin-bottom:4px;">${label}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${group.map(def => `
                        <span style="display:inline-flex;align-items:flex-start;gap:4px;background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; padding:3px 10px; font-size:0.82rem; max-width:100%; white-space:normal; word-break:break-word; line-height:1.35;">
                            <span style="color:var(--text-muted);white-space:normal;word-break:break-word;">${def.defectName}</span>
                            <strong style="margin-left:4px; color:var(--accent-red);">${UIUtils.formatNumber(def.defectCount)}</strong>
                        </span>
                    `).join('')}
                </div>
            </div>`;

        const popupId = 'completionDetailPopup';
        const existing = document.getElementById(popupId);
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = popupId;
        popup.style.cssText = `
            position:fixed; z-index:9999;
            background:var(--bg-primary); border:1px solid var(--border);
            border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.22);
            padding:20px 22px; min-width:360px; max-width:720px; width:min(720px,88vw);
            font-size:0.88rem;
        `;

        // 팝업 위치: 클릭 위치 기준
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = event.clientX + 12;
        let top  = event.clientY - 10;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';

        popup.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem; color:var(--accent-blue);">info</span>
                    <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">도장 검사 상세</span>
                </div>
                <button onclick="document.getElementById('${popupId}').remove()"
                    style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:1.2rem; line-height:1; padding:2px 4px;">✕</button>
            </div>

            <!-- 제품 정보 -->
            <div style="background:var(--bg-secondary); border-radius:8px; padding:12px 14px; margin-bottom:12px;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 12px; font-size:0.82rem;">
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">차종</div>
                        <div style="font-weight:600;">${d.carModel || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">품명</div>
                        <div style="font-weight:600;">${d.partName || '-'}</div>
                    </div>
                    <div>
                        <div style="color:var(--text-muted); margin-bottom:2px; font-size:0.72rem;">컬러</div>
                        <div style="font-weight:600;">${d.color || '-'}</div>
                    </div>
                </div>
            </div>

            <!-- LOT 정보 -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">도장 LOT (작업일)</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.paintingDate || '-'}</div>
                </div>
                <div style="background:var(--bg-secondary); border-radius:8px; padding:10px 12px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:3px;">사출 LOT</div>
                    <div style="font-weight:600; font-size:0.82rem; font-family:monospace;">${d.lotNo || '-'}</div>
                </div>
            </div>

            <!-- 검사 수량 요약 -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px; text-align:center;">
                <div style="background:var(--bg-secondary); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사일</div>
                    <div style="font-weight:600; font-size:0.78rem; margin-top:2px;">${d.date || '-'}</div>
                </div>
                <div style="background:rgba(59,130,246,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">검사수량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-blue); margin-top:2px;">${UIUtils.formatNumber(d.inspectionQty || 0)}</div>
                </div>
                <div style="background:rgba(52,211,153,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">양품</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-green); margin-top:2px;">${UIUtils.formatNumber(d.goodQty || 0)}</div>
                </div>
                <div style="background:rgba(239,68,68,0.08); border-radius:8px; padding:8px 4px;">
                    <div style="font-size:0.68rem; color:var(--text-muted);">불량</div>
                    <div style="font-weight:700; font-size:1rem; color:var(--accent-red); margin-top:2px;">${UIUtils.formatNumber(d.defectQty || 0)}</div>
                </div>
            </div>
            <div style="text-align:right; margin-bottom:12px;">
                <span style="font-size:0.8rem; color:var(--text-muted);">불량률 </span>
                <span style="font-weight:700; font-size:1rem; color:${parseFloat(defectRate) > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">${defectRate}%</span>
            </div>

            <!-- 불량 상세 -->
            ${(injDefects.length > 0 || paintDefects.length > 0) ? `
            <div style="border-top:1px solid var(--border); padding-top:10px;">
                ${defectRowsHtml(injDefects,  '사출 불량', '#ea580c')}
                ${defectRowsHtml(paintDefects,'도장 불량', '#16a34a')}
            </div>` : `<div style="color:var(--text-muted); font-size:0.82rem; text-align:center; padding:4px 0;">불량 내역 없음</div>`}

            <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:10px; font-size:0.8rem; color:var(--text-muted);">
                등록자: <strong style="color:var(--text-primary);">${_registeredByName(d)}</strong>
            </div>

            ${(() => {
                const canWrite = _canWriteInspection();
                const isAdmin = typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser();
                if (!canWrite && !isAdmin) return '';
                const editBtn = canWrite ? `<button class="btn btn-sm btn-primary" onclick="document.getElementById('${popupId}').remove();PaintingInspectionModule.openEditInspectionModal('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span> 편집
                    </button>` : '';
                const deleteBtn = isAdmin ? `<button class="btn btn-sm btn-danger" onclick="document.getElementById('${popupId}').remove();PaintingInspectionModule._deleteInspection('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span> 삭제
                    </button>` : '';
                return `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">${editBtn}${deleteBtn}</div>`;
            })()}
        `;

        document.body.appendChild(popup);

        // 화면 밖으로 넘어가지 않도록 위치 보정
        requestAnimationFrame(() => {
            const rect = popup.getBoundingClientRect();
            if (rect.right > vw - 8)  popup.style.left = (vw - rect.width - 8) + 'px';
            if (rect.bottom > vh - 8) popup.style.top  = (vh - rect.height - 8) + 'px';
        });

        // 팝업 외부 클릭 시 닫기
        setTimeout(() => {
            document.addEventListener('click', function _close(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', _close);
                }
            });
        }, 50);
    }

    // 검사 실적 수정 모달 열기
    function openEditInspectionModal(inspectionId) {
        if (!_canWriteInspection()) {
            UIUtils.toast('도장 검사 입력 권한이 없습니다.', 'warning');
            return;
        }
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const defectTypes = Storage.getAll(DB.STORES.DEFECT_TYPES) || [];
        const injDefectTypes  = defectTypes.filter(dt => dt && (dt.type === 'injection' || !dt.type));
        const paintDefectTypes = defectTypes.filter(dt => dt && dt.type === 'painting');
        const platingBaseWork = _getPaintingWorkByInspection(inspection) || {
            carModel: inspection.carModel || '',
            partName: inspection.partName || '',
            color: inspection.color || '',
            lotNo: inspection.lotNo || ''
        };
        const platingDefectTypes = _isPlatingForWork(platingBaseWork)
            ? defectTypes.filter(dt => dt && dt.type === 'plating')
            : [];

        const defectMap = {};
        (inspection.defects || []).forEach(d => {
            if (d.defectId)   defectMap[d.defectId]   = d.defectCount || 0;
            if (d.defectName) defectMap[d.defectName] = d.defectCount || 0;
        });

        function defectInputs(list, color, icon) {
            if (!list.length) return `<p style="color:var(--text-muted);font-size:0.82rem;margin:0;">등록된 불량 유형 없음</p>`;
            return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">` +
                list.map(dt => {
                    const val = defectMap[dt.id] || defectMap[dt.name] || 0;
                    return `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:0.78rem;font-weight:600;color:${color};margin-bottom:6px;">${dt.name}</div>
                        <input type="text" class="form-input defect-count-input" data-defect-id="${dt.id}"
                            value="${val > 0 ? val : ''}" placeholder="-" inputmode="numeric" enterkeyhint="done" data-ime-dismiss="true"
                            style="text-align:right;font-weight:700;font-size:1rem;padding:4px 8px;"
                            oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                    </div>`;
                }).join('') + `</div>`;
        }

        const insp = inspection;
        const modalContent = `
        <div style="display:flex;flex-direction:column;gap:0;">

            <!-- ① 제품 정보 배너 -->
            <div style="background:linear-gradient(135deg,var(--accent-blue) 0%,#0ea5e9 100%);border-radius:10px;padding:16px 20px;margin-bottom:18px;color:#fff;">
                <div style="font-size:0.72rem;opacity:0.8;margin-bottom:4px;letter-spacing:0.05em;">도장 외관 검사 실적 수정</div>
                <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:1.15rem;font-weight:700;">${insp.carModel || ''} ${insp.partName || ''}</span>
                    <span style="font-size:0.9rem;opacity:0.85;">${insp.color || ''}</span>
                </div>
                <div style="display:flex;gap:20px;margin-top:10px;font-size:0.8rem;opacity:0.9;flex-wrap:wrap;">
                    <span><span style="opacity:0.7;">검사일</span> <strong>${insp.date || '-'}</strong></span>
                    <span><span style="opacity:0.7;">도장작업일</span> <strong>${insp.paintingDate || '-'}</strong></span>
                    <span><span style="opacity:0.7;">사출 LOT</span> <strong style="font-family:monospace;">${insp.lotNo || '-'}</strong></span>
                </div>
            </div>

            <!-- ② 검사 일시 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">schedule</span>
                        검사 일시
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">검사일자</label>
                            <input type="date" id="editInspectionDate" value="${insp.date || ''}" class="form-input">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">시작시간</label>
                            <input type="time" id="editInspectionStartTime" value="${insp.inspectionStartTime || ''}" class="form-input"
                                oninput="PaintingInspectionModule._calculateInspectionTime()"
                                onchange="PaintingInspectionModule._calculateInspectionTime()">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">완료시간</label>
                            <input type="time" id="editInspectionEndTime" value="${insp.inspectionEndTime || ''}" class="form-input"
                                oninput="PaintingInspectionModule._calculateInspectionTime()"
                                onchange="PaintingInspectionModule._calculateInspectionTime()">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label class="form-label">소요시간</label>
                            <input type="text" id="editInspectionDuration" value="" class="form-input" readonly
                                style="background:var(--bg-secondary);color:var(--text-muted);text-align:center;">
                        </div>
                    </div>
                </div>
            </div>

            <!-- ③ 검사 수량 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">numbers</span>
                        검사 수량
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                        <div style="background:rgba(59,130,246,0.08);border:1.5px solid rgba(59,130,246,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">검사수량</div>
                            <input type="number" id="editInspQty" value="${(typeof UIUtils !== 'undefined' && UIUtils.toInputNumber) ? UIUtils.toInputNumber(insp.inspectionQty, 0) : (insp.inspectionQty || 0)}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-blue);" readonly>
                        </div>
                        <div style="background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">양품수</div>
                            <input type="number" id="editGoodQty" value="${(typeof UIUtils !== 'undefined' && UIUtils.toInputNumber) ? UIUtils.toInputNumber(insp.goodQty, 0) : (insp.goodQty || 0)}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-green);"
                                onchange="this.dispatchEvent(new Event('change'))">
                        </div>
                        <div style="background:rgba(239,68,68,0.08);border:1.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px;text-align:center;">
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;">불량수</div>
                            <input type="number" id="editDefectQty" value="${(typeof UIUtils !== 'undefined' && UIUtils.toInputNumber) ? UIUtils.toInputNumber(insp.defectQty, 0) : (insp.defectQty || 0)}" class="form-input"
                                style="text-align:center;font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:0;color:var(--accent-red);"
                                onchange="this.dispatchEvent(new Event('change'))">
                        </div>
                    </div>
                </div>
            </div>

            <!-- ④ 불량 유형 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:#ea580c;">report_problem</span>
                        불량 유형별 수량
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
                    ${injDefectTypes.length > 0 ? `
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:#ea580c;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">precision_manufacturing</span> 사출 불량
                        </div>
                        ${defectInputs(injDefectTypes, '#ea580c')}
                    </div>` : ''}
                    ${paintDefectTypes.length > 0 ? `
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:#16a34a;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">format_paint</span> 도장 불량
                        </div>
                        ${defectInputs(paintDefectTypes, '#16a34a')}
                    </div>` : ''}
                    ${platingDefectTypes.length > 0 ? `
                    <div>
                        <div style="font-size:0.78rem;font-weight:700;color:#7c3aed;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">layers</span> 도금 불량
                        </div>
                        ${defectInputs(platingDefectTypes, '#7c3aed')}
                    </div>` : ''}
                </div>
            </div>

            <!-- ⑤ 검사자 -->
            <div class="card" style="margin-bottom:14px;">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid var(--border);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">group</span>
                        검사자
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div id="inspectorsList"></div>
                </div>
            </div>

            <!-- ⑥ 수정 확인 · 관리자 통보 -->
            <div class="card" style="margin-bottom:6px;border:1px solid rgba(239,68,68,0.28);">
                <div class="card-header" style="padding:10px 16px;border-bottom:1px solid rgba(239,68,68,0.18);background:rgba(239,68,68,0.04);">
                    <h4 style="margin:0;font-size:0.88rem;display:flex;align-items:center;gap:6px;color:#dc2626;">
                        <span class="material-symbols-outlined" style="font-size:1rem;">campaign</span>
                        수정 확인 · 관리자 통보
                    </h4>
                </div>
                <div class="card-body" style="padding:14px 16px;">
                    <div style="display:flex;align-items:flex-start;gap:10px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.22);border-radius:8px;padding:12px 14px;margin-bottom:12px;">
                        <span class="material-symbols-outlined" style="color:#dc2626;font-size:20px;flex-shrink:0;margin-top:1px;">warning</span>
                        <div style="font-size:0.82rem;line-height:1.5;color:var(--text-primary);">
                            <strong style="color:#dc2626;">관리자 통보 필요</strong> — 검사 실적 수정이므로 담당 관리자에게 수정 내용을 보고한 뒤 저장하세요.
                            <div style="margin-top:6px;color:var(--text-secondary);">수정자: <strong>${_currentUserDisplayName()}</strong></div>
                        </div>
                    </div>
                    <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;">
                        <input type="checkbox" id="editInspManagerNotified" style="width:16px;height:16px;accent-color:#dc2626;"${insp.editManagerNotified ? ' checked' : ''}>
                        <span style="font-size:0.82rem;font-weight:600;color:#dc2626;">관리자 통보 완료</span>
                    </label>
                    ${_buildEditNotifySelectorHtml('editInsp', '검사 실적 수정 통보를 받을 관리자를 선택하세요.', insp.editManagerRecipients || [])}
                </div>
            </div>

        </div>`;

        UIUtils.showModal('검사 실적 수정', modalContent,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="PaintingInspectionModule._submitEditInspection('${inspectionId}')">
                 <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 저장
             </button>`, 'lg');

        // 검사자 목록 렌더링
        _renderInspectorsForEdit(inspection.inspectors || []);
        setTimeout(function() {
            if (!(inspection.editManagerRecipients || []).length) {
                toggleEditNotifyUsers('editInsp', true);
            }
        }, 60);
    }

    // 검사자 목록 렌더링 (수정 모달용)
    function _renderInspectorsForEdit(inspectors) {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        container.innerHTML = inspectors.map((inspector, idx) => `
            <div style="display:flex; gap:6px; margin-bottom:6px;">
                <input type="text" value="${inspector}" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
                <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
            </div>
        `).join('') + `
            <button class="btn btn-sm btn-secondary" onclick="PaintingInspectionModule._addInspectorFieldToModal()" style="margin-top:6px;">
                + 검사자 추가
            </button>
        `;
    }

    // 검사자 추가 버튼 (수정 모달용)
    function _addInspectorFieldToModal() {
        const container = document.getElementById('inspectorsList');
        if (!container) return;

        const count = container.querySelectorAll('.inspector-input').length;
        if (count >= 5) {
            UIUtils.toast('최대 5명까지 추가 가능합니다.', 'warning');
            return;
        }

        const newField = document.createElement('div');
        newField.style.cssText = 'display:flex; gap:6px; margin-bottom:6px;';
        newField.innerHTML = `
            <input type="text" class="form-input inspector-input" style="flex:1;" placeholder="검사자명">
            <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">삭제</button>
        `;
        container.appendChild(newField);
    }

    // 검사 실적 수정 저장 (모달에서)
    async function _submitEditInspection(inspectionId) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return;
        }

        const goodQty = parseInt(document.getElementById('editGoodQty')?.value || 0);
        const defectQty = parseInt(document.getElementById('editDefectQty')?.value || 0);
        const inspectionQty = parseInt(document.getElementById('editInspQty')?.value || 0);

        // 검사 날짜/시간 수집
        const inspectionDateEl = document.getElementById('editInspectionDate');
        const inspectionStartTimeEl = document.getElementById('editInspectionStartTime');
        const inspectionEndTimeEl = document.getElementById('editInspectionEndTime');
        const inspectionDate = inspectionDateEl ? inspectionDateEl.value : inspection.date;
        const inspectionStartTime = inspectionStartTimeEl ? inspectionStartTimeEl.value : inspection.inspectionStartTime;
        const inspectionEndTime = inspectionEndTimeEl ? inspectionEndTimeEl.value : inspection.inspectionEndTime;

        // 검사자 수집 (하단 검사자 섹션)
        const inspectorInputs = document.querySelectorAll('.inspector-input');
        const inspectors = [];
        inspectorInputs.forEach(input => {
            if (input.value.trim()) {
                inspectors.push(input.value.trim());
            }
        });

        // 불량 유형별 개수 수집
        const defects = [];
        document.querySelectorAll('.defect-count-input').forEach(input => {
            const defectId = input.getAttribute('data-defect-id');
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const defectType = Storage.getAll(DB.STORES.DEFECT_TYPES).find(dt => dt.id === defectId);
                defects.push({
                    defectId,
                    defectName: defectType?.name || '',
                    defectType: defectType?.type || 'injection',
                    defectCount: count
                });
            }
        });

        const managerNotifiedEl = document.getElementById('editInspManagerNotified');
        if (!managerNotifiedEl || !managerNotifiedEl.checked) {
            UIUtils.toast('검사 실적 수정 내용을 관리자에게 통보 후 "관리자 통보 완료"를 체크해 주세요.', 'warning');
            return;
        }
        const editNotifyUsers = _getSelectedEditNotifyUsers('editInsp');
        if (!editNotifyUsers.length) {
            UIUtils.toast('통보를 받을 관리자를 한 명 이상 선택해 주세요.', 'warning');
            return;
        }

        const editor = _currentUser();
        const editorName = _currentUserDisplayName();
        const notifyMeta = {
            editManagerNotified: true,
            editManagerRecipients: editNotifyUsers,
            editManagerNotifiedAt: new Date().toISOString(),
            editManagerNotifiedBy: editor ? String(editor.id || '') : '',
            editManagerNotifiedByName: editorName
        };

        // 저장
        const success = await _saveInspectionUpdate(inspectionId, {
            goodQty,
            defectQty,
            inspectionQty,
            inspectors,
            defects,
            date: inspectionDate,
            inspectionStartTime,
            inspectionEndTime,
            ...notifyMeta
        });

        if (success) {
            const changeSummary = _buildInspectionEditChangeSummary(inspection, {
                date: inspectionDate,
                inspectionStartTime,
                inspectionEndTime,
                goodQty,
                defectQty,
                inspectors,
                defects
            });
            _sendEditManagerNotification(
                '도장 검사 실적 수정 통보',
                '[수정자] ' + editorName + '\n' +
                '[제품] ' + (inspection.carModel || '-') + ' / ' + (inspection.partName || '-') + ' / ' + (inspection.color || '-') + '\n' +
                '[검사일] ' + (inspectionDate || '-') + '\n' +
                '[변경 내용]\n' + changeSummary,
                editNotifyUsers
            );

            // 해당 작업의 상태를 "검사 완료"로 유지
            const workId = inspection.workId || inspection.productId;
            if (workId) {
                await Storage.update(PAINTING_WORK_STORE, workId, {
                    inspectionStatus: 'completed',
                    inspectionDate: inspectionDate,
                    inspectionStartTime: inspectionStartTime,
                    inspectionEndTime: inspectionEndTime,
                    inspectors: inspectors,
                    updatedAt: new Date().toISOString()
                });
            }
            UIUtils.closeModal();
            _filterCompletionResults();
        }
    }

    // ===================================================================
    // Phase 3: 통계 대시보드
    // ===================================================================

    // 통계 대시보드 화면 렌더링
    function showStatisticsDashboard() {
        const tabContent = document.getElementById('tabContent');
        if (!tabContent) return;

        const allData = Storage.getAll(STORE) || [];
        const startDate = UIUtils.monthAgo();
        const endDate = UIUtils.today();

        const uniqueCarModels = _getUniqueCarModels(allData);
        const uniquePartNames = _getUniquePartNames(allData);

        tabContent.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600;">기간</label>
                <input type="date" id="statsStart" value="${startDate}" style="width:130px;" class="form-input">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="statsEnd" value="${endDate}" style="width:130px;" class="form-input">

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">차종</label>
                <select id="statsCarModel" style="width:120px;" class="form-select"
                    onchange="PaintingInspectionModule._updateStatsPartFilter()">
                    <option value="">전체</option>
                    ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>

                <label style="font-size:0.82rem; white-space:nowrap; font-weight:600; margin-left:12px;">품명</label>
                <select id="statsPartName" style="width:120px;" class="form-select">
                    <option value="">전체</option>
                    ${uniquePartNames.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <button class="btn btn-primary" onclick="PaintingInspectionModule._renderStatisticsDashboard()" style="margin-left:auto;">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <div id="statisticsContent"></div>
        `;

        // 초기 렌더링
        _renderStatisticsDashboard();
    }

    // 통계 대시보드 렌더링
    function _renderStatisticsDashboard() {
        const startDate = document.getElementById('statsStart')?.value || '';
        const endDate = document.getElementById('statsEnd')?.value || '';
        const carModel = document.getElementById('statsCarModel')?.value || '';
        const partName = document.getElementById('statsPartName')?.value || '';

        const allData = Storage.getAll(STORE) || [];
        const filtered = _applyCommonFilters(allData, startDate, endDate, carModel, partName);

        const stats = _calculateStatistics(filtered);
        const container = document.getElementById('statisticsContent');
        if (!container) return;

        // 요약 정보
        const totalInspections = filtered.length;
        const totalDefects = filtered.reduce((sum, d) => sum + (d.defectQty || 0), 0);
        const totalInspectionQty = filtered.reduce((sum, d) => sum + (d.inspectionQty || 0), 0);
        const defectRate = totalInspectionQty > 0 ? ((totalDefects / totalInspectionQty) * 100).toFixed(1) : 0;

        container.innerHTML = `
            <!-- 요약 카드 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px;">
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">검사 실적</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${totalInspections}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">건</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 검사수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(totalInspectionQty)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">총 불량수</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${UIUtils.formatNumber(totalDefects)}</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">개</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:4px;">불량률</div>
                    <div style="font-size:1.8rem; font-weight:700; color:var(--accent-red);">${defectRate}%</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">평균</div>
                </div>
            </div>

            <!-- 차트 영역 -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:12px; margin-bottom:16px;">
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">불량 유형별 집계</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="defectTypeChart" height="100"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header" style="padding:8px 14px;">
                        <h4 style="font-size:0.85rem;">차종별 불량률</h4>
                    </div>
                    <div class="card-body" style="padding:8px 14px;">
                        <canvas id="carModelChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- 상세 테이블 -->
            <div class="card">
                <div class="card-header">
                    <h4>불량 유형별 상세 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>불량 유형</th>
                                <th style="text-align:right;">발생 건수</th>
                                <th style="text-align:right;">발생률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byDefectType)
                                .sort((a, b) => b[1].count - a[1].count)
                                .map(([name, data]) => {
                                    const rate = totalDefects > 0 ? ((data.count / totalDefects) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right; font-weight:600;">${data.count}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>차종별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>차종</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byCarModel)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header">
                    <h4>품명별 집계</h4>
                </div>
                <div class="card-body" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>품명</th>
                                <th style="text-align:right;">검사수</th>
                                <th style="text-align:right;">불량수</th>
                                <th style="text-align:right;">불량률</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats.byPartName)
                                .sort((a, b) => b[1].defectQty - a[1].defectQty)
                                .map(([name, data]) => {
                                    const rate = data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
                                    return `
                                        <tr>
                                            <td><strong>${name}</strong></td>
                                            <td style="text-align:right;">${UIUtils.formatNumber(data.inspectionQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:600;">${UIUtils.formatNumber(data.defectQty)}</td>
                                            <td style="text-align:right; color:var(--accent-red); font-weight:700;">${rate}%</td>
                                        </tr>
                                    `;
                                })
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 차트 그리기
        setTimeout(() => {
            _renderStatisticsCharts(stats);
        }, 100);
    }

    // 통계 집계 (차종/품명/불량유형별)
    function _calculateStatistics(data) {
        const stats = {
            byCarModel: {},
            byPartName: {},
            byDefectType: {}
        };

        data.forEach(d => {
            // 차종별
            if (!stats.byCarModel[d.carModel]) {
                stats.byCarModel[d.carModel] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byCarModel[d.carModel].inspectionQty += d.inspectionQty || 0;
            stats.byCarModel[d.carModel].defectQty += d.defectQty || 0;

            // 부품별
            if (!stats.byPartName[d.partName]) {
                stats.byPartName[d.partName] = { inspectionQty: 0, defectQty: 0 };
            }
            stats.byPartName[d.partName].inspectionQty += d.inspectionQty || 0;
            stats.byPartName[d.partName].defectQty += d.defectQty || 0;

            // 불량유형별
            (d.defects || []).forEach(def => {
                if (!stats.byDefectType[def.defectName]) {
                    stats.byDefectType[def.defectName] = { count: 0 };
                }
                stats.byDefectType[def.defectName].count += def.defectCount || 0;
            });
        });

        return stats;
    }

    var _paintCharts = { defectType: null, carModel: null };

    // 통계 차트 그리기
    function _renderStatisticsCharts(stats) {
        if (_paintCharts.defectType) { try { _paintCharts.defectType.destroy(); } catch (e) {} _paintCharts.defectType = null; }
        if (_paintCharts.carModel)   { try { _paintCharts.carModel.destroy();   } catch (e) {} _paintCharts.carModel   = null; }
        // 불량 유형별 막대 차트
        const defectTypeCtx = document.getElementById('defectTypeChart');
        if (defectTypeCtx && window.Chart) {
            const defectLabels = Object.keys(stats.byDefectType).sort((a, b) =>
                stats.byDefectType[b].count - stats.byDefectType[a].count
            );
            const defectData = defectLabels.map(name => stats.byDefectType[name].count);

            _paintCharts.defectType = new Chart(defectTypeCtx, {
                type: 'bar',
                data: {
                    labels: defectLabels,
                    datasets: [{
                        label: '불량 발생수',
                        data: defectData,
                        backgroundColor: '#ea580c',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }

        // 차종별 원형 차트
        const carModelCtx = document.getElementById('carModelChart');
        if (carModelCtx && window.Chart) {
            const carModelLabels = Object.keys(stats.byCarModel);
            const carModelData = carModelLabels.map(name => {
                const data = stats.byCarModel[name];
                return data.inspectionQty > 0 ? ((data.defectQty / data.inspectionQty) * 100).toFixed(1) : 0;
            });

            _paintCharts.carModel = new Chart(carModelCtx, {
                type: 'doughnut',
                data: {
                    labels: carModelLabels,
                    datasets: [{
                        data: carModelData,
                        backgroundColor: ['#ea580c', '#16a34a', '#0066ff', '#ffaa00', '#ee00ee', '#00dddd']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } }
                    }
                }
            });
        }
    }

    // ===================================================================
    // Phase 1: 기초 인프라 함수
    // ===================================================================

    // 공용 필터: 기간, 차종, 품명
    function _applyCommonFilters(data, startDate, endDate, carModel, partName) {
        return data.filter(d => {
            const dateMatch = (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate);
            const carModelMatch = !carModel || d.carModel === carModel;
            const partNameMatch = !partName || d.partName === partName;
            return dateMatch && carModelMatch && partNameMatch;
        });
    }

    // 고유 차종 추출
    function _getUniqueCarModels(data) {
        return UIUtils.sortCarModels(data.map(d => d.carModel));
    }

    // 고유 품명 추출
    function _getUniquePartNames(data) {
        return [...new Set(data.map(d => d.partName).filter(Boolean))].sort();
    }

    // 불량별 개별 레코드 → 검사 단위 그룹화 (호환성 유지)
    function _normalizeInspectionData(rawRecords) {
        const grouped = {};
        rawRecords.forEach(d => {
            const key = `${d.productId}_${d.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    id: d.id || `insp-${Date.now()}-${Math.random()}`,
                    date: d.date,
                    productId: d.productId,
                    carModel: d.carModel,
                    partName: d.partName,
                    color: d.color,
                    defects: [],
                    totalDefects: 0,
                    paintingDate: d.paintingDate || null,
                    lotNo: d.lotNo || null,
                    inspectionQty: d.inspectionQty || 0,
                    goodQty: d.goodQty || 0,
                    defectQty: d.defectQty || 0,
                    inspectors: d.inspectors || [],
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt
                };
            }
            if (d.defectName) {
                grouped[key].defects.push({
                    defectId: d.defectId,
                    defectName: d.defectName,
                    defectType: d.defectType,
                    defectCount: d.defectCount || 0
                });
                grouped[key].totalDefects += (d.defectCount || 0);
            }
        });
        return Object.values(grouped);
    }

    // 검사 실적 수정 저장
    async function _saveInspectionUpdate(inspectionId, data) {
        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        // 검증: 양품수 + 불량수 = 검사수량
        const goodQty = parseInt(data.goodQty || 0);
        const defectQty = parseInt(data.defectQty || 0);
        const inspectionQty = parseInt(data.inspectionQty || inspection.inspectionQty || 0);
        const workId = inspection.workId || inspection.productId;
        const work = workId ? Storage.getById(PAINTING_WORK_STORE, workId) : null;
        const workQty = _getPaintingWorkQty(work) || inspectionQty;

        if (!_validateDefectQtyWithinWorkQty(defectQty, workQty)) {
            return false;
        }
        if (goodQty + defectQty !== inspectionQty) {
            UIUtils.toast(`양품수(${goodQty}) + 불량수(${defectQty}) = 검사수량(${inspectionQty})이어야 합니다.`, 'warning');
            return false;
        }
        const detailDefectTotal = (data.defects || inspection.defects || [])
            .reduce((sum, d) => sum + (Number(d.defectCount) || 0), 0);
        if (detailDefectTotal !== defectQty) {
            UIUtils.toast(`불량 유형 합계(${UIUtils.formatNumber(detailDefectTotal)})와 불량수(${UIUtils.formatNumber(defectQty)})가 일치하지 않습니다.`, 'warning');
            return false;
        }
        if (!_validateDefectQtyWithinWorkQty(detailDefectTotal, workQty)) {
            return false;
        }

        // 업데이트
        const updated = {
            ...inspection,
            date: data.date || inspection.date,
            inspectionStartTime: data.inspectionStartTime || inspection.inspectionStartTime,
            inspectionEndTime: data.inspectionEndTime || inspection.inspectionEndTime,
            goodQty,
            defectQty,
            defects: data.defects || inspection.defects || [],
            inspectors: data.inspectors || inspection.inspectors || [],
            editManagerNotified: data.editManagerNotified != null ? data.editManagerNotified : inspection.editManagerNotified,
            editManagerRecipients: data.editManagerRecipients || inspection.editManagerRecipients || [],
            editManagerNotifiedAt: data.editManagerNotifiedAt || inspection.editManagerNotifiedAt || '',
            editManagerNotifiedBy: data.editManagerNotifiedBy || inspection.editManagerNotifiedBy || '',
            editManagerNotifiedByName: data.editManagerNotifiedByName || inspection.editManagerNotifiedByName || '',
            updatedAt: new Date().toISOString()
        };

        await Storage.update(STORE, inspectionId, updated);
        UIUtils.toast('검사 실적이 수정되었습니다.', 'success');
        return true;
    }

    // 검사 실적 삭제
    async function _deleteInspection(inspectionId) {
        const _cu = AuthModule && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        const _isAdmin = !!(_cu && (_cu.role === 'admin' || (Array.isArray(_cu.roles) && _cu.roles.includes('admin'))));
        if (!_isAdmin) {
            UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning');
            return false;
        }
        if (!confirm('이 검사 실적을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) {
            return false;
        }

        const inspection = Storage.getById(STORE, inspectionId);
        if (!inspection) {
            UIUtils.toast('검사 실적을 찾을 수 없습니다.', 'error');
            return false;
        }

        await Storage.remove(STORE, inspectionId);

        // 해당 작업의 상태를 초기화 (검사 미완료로)
        const workId = inspection.workId || inspection.productId;
        if (workId) {
            await Storage.update(PAINTING_WORK_STORE, workId, {
                inspectionStatus: 'pending',
                inspectionDate: null,
                updatedAt: new Date().toISOString()
            });
        }

        UIUtils.toast('검사 실적이 삭제되었습니다.', 'success');

        // 검사 완료 실적 목록도 새로고침
        if (state.currentTab === 'completion') {
            _filterCompletionResults();
        }

        return true;
    }

    return {
        render,
        selectPlan,
        openInspectionModal,
        selectProduct,
        increment,
        decrement,
        save,
        reset,
        showHistory,
        _filterHistoryTable,
        exportData,
        // Phase 3: 통계 대시보드
        showStatisticsDashboard,
        _renderStatisticsDashboard,
        _calculateStatistics,
        _renderStatisticsCharts,
        // Phase 2: 검사 완료 실적
        showCompletionResults,
        showResidualWipStatus,
        _filterCompletionResults,
        _showCompletionDetail,
        _showResidualDetail,
        _updateCompletionPartFilter,
        _updateStatsPartFilter,
        openEditInspectionModal,
        toggleEditNotifyUsers,
        _submitEditInspection,
        _addInspectorFieldToModal,
        _switchTab,
        _renderTabContent,
        // Phase 1: 기초 인프라
        _applyCommonFilters,
        _getUniqueCarModels,
        _getUniquePartNames,
        _normalizeInspectionData,
        _saveInspectionUpdate,
        _deleteInspection,
        // 검사 모달 헬퍼 함수들
        _incInjDefect,
        _decInjDefect,
        _incPaintDefect,
        _decPaintDefect,
        _updateDefectQty,
        _updateGoodQty,
        _updateDefectTotal,
        _calculateInspectionTime,
        _canWriteInspection,
        _saveInspection,
        _saveInspectionDraft,
        _clearInspectionDraft,
        _updatePaintPackagingCalc,
        _autoPaintBoxCount,
        _onReworkQtyChange,
        _addInspectorField,
        _syncInspectorOptions,
        showInspectionDetail,
        _closeInspectionModal,
        focusNonconformStandardPasteZone,
        handleNonconformStandardPaste,
        printNonconformStandardPage,
        // ✓ Case 1: 부분 완료 검사
        _togglePartialInspection,
        // ✓ Case 2: 작업 중단 후 재개
        _showDraftQuantityMismatchModal,
        _continueExistingDraft,
        _restartWithNewQuantity,
        // ✓ Case 3: 도장 작업 수량 수정 후 검사 기록 동기화
        _showInspectionSyncModal,
        _autoSyncInspections,
        // 작업수량 변경 (작업일지 · 사출출고/레이저재공 연동)
        _enableWorkQtyEdit,
        confirmWorkQtyEdit,
        cancelWorkQtyEdit,
        _recalcInspQuantities
    };
})();

const PaintingQualityPerformanceModule = (function() {
    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header"></div>
                <div id="tabContent"></div>
            </div>
        `;
        setTimeout(() => {
            PaintingInspectionModule.showStatisticsDashboard();
        }, 20);
    }

    return {
        render
    };
})();


// ===================================================================
// 도장품 출고
// ===================================================================
const PaintingOutgoingModule = (function() {
    const STORE = DB.STORES.PAINTING_OUTGOING;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="PaintingOutgoingModule.openAddModal()">
                            <span class="material-symbols-outlined">add</span> 출고 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="poStart" value="${UIUtils.monthAgo()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="poEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-outline" onclick="PaintingOutgoingModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>출고일</th>
                                        <th>품명</th>
                                        <th>수량</th>
                                        <th>행선지</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="poTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        search();
    }

    function search() {
        const start = document.getElementById('poStart').value;
        const end = document.getElementById('poEnd').value;
        const data = Storage.getByDateRange(STORE, start, end).sort((a, b) => b.date.localeCompare(a.date));

        const tbody = document.getElementById('poTableBody');
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">데이터가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.date}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right">${UIUtils.formatNumber(d.quantity)}</td>
                <td>${d.destination || '-'}</td>
                <td>${d.note || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="PaintingOutgoingModule.remove('${d.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function openAddModal() {
        UIUtils.showModal('도장품 출고 등록', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고일</label>
                    <input type="date" class="form-input" id="addPoDate" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <input type="text" class="form-input" id="addPoPart" placeholder="품명">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량</label>
                    <input type="number" class="form-input" id="addPoQty" min="0" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">행선지</label>
                    <input type="text" class="form-input" id="addPoDest" placeholder="예: 출하검사">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="addPoNote" placeholder="비고">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintingOutgoingModule.saveNew()">등록</button>
        `);
    }

    async function saveNew() {
        const data = {
            date: document.getElementById('addPoDate').value,
            partName: document.getElementById('addPoPart').value.trim(),
            quantity: Number(document.getElementById('addPoQty').value) || 0,
            destination: document.getElementById('addPoDest').value.trim(),
            note: document.getElementById('addPoNote').value.trim()
        };
        if (!data.partName) {
            UIUtils.toast('품명을 입력하세요.', 'warning');
            return;
        }

        // 출하검사 대기에도 자동 등록
        await Storage.add(DB.STORES.SHIPPING_STANDBY, {
            date: data.date,
            partName: data.partName,
            quantity: data.quantity,
            status: '대기',
            source: '도장품 출고'
        });

        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장품 출고가 등록되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        remove
    };
})();
