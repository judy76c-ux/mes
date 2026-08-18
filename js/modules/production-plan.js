/**
 * 생산 계획 지시서 모듈
 * 생산 계획 등록, 조회, 상태 관리
 * - 세로 레이아웃: 시간이 행
 * - 라인 선택: 도장-A / 도장-B 필터 적용
 * - 시간대별 클릭 시 해당 시간의 계획 등록
 */

const ProductionPlanModule = (function() {
    const STORE = DB.STORES.PRODUCTION_PLANS;

    const LINE_OPTIONS = ['도장-A', '도장-B'];

    let _autoTimer = null; // 자동 상태 갱신 타이머
    let _calYear = new Date().getFullYear();
    let _calMonth = new Date().getMonth() + 1;
    let _satExpanded = false;

    const FIXED_HOLIDAYS = {
        '01-01':'신정', '03-01':'삼일절', '05-01':'근로자의날',
        '05-05':'어린이날', '06-06':'현충일', '08-15':'광복절',
        '10-03':'개천절', '10-09':'한글날', '12-25':'성탄절'
    };

    // 음력 기반 공휴일 (2024~2030 사전계산)
    const LUNAR_HOLIDAYS = {
        '2024-02-09':'설 연휴','2024-02-10':'설날','2024-02-11':'설 연휴','2024-02-12':'대체공휴일',
        '2025-01-28':'설 연휴','2025-01-29':'설날','2025-01-30':'설 연휴',
        '2026-02-16':'설 연휴','2026-02-17':'설날','2026-02-18':'설 연휴','2026-02-19':'대체공휴일',
        '2027-02-05':'설 연휴','2027-02-06':'설날','2027-02-07':'설 연휴','2027-02-08':'대체공휴일',
        '2028-01-25':'설 연휴','2028-01-26':'설날','2028-01-27':'설 연휴',
        '2029-02-12':'설 연휴','2029-02-13':'설날','2029-02-14':'설 연휴',
        '2030-02-02':'설 연휴','2030-02-03':'설날','2030-02-04':'설 연휴',
        '2024-05-15':'부처님오신날',
        '2025-05-06':'부처님오신날',
        '2026-05-24':'부처님오신날',
        '2027-05-13':'부처님오신날',
        '2028-05-02':'부처님오신날',
        '2029-05-20':'부처님오신날',
        '2030-05-09':'부처님오신날',
        '2024-09-16':'추석 연휴','2024-09-17':'추석','2024-09-18':'추석 연휴',
        '2025-10-05':'추석 연휴','2025-10-06':'추석','2025-10-07':'추석 연휴','2025-10-08':'대체공휴일',
        '2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴','2026-09-27':'대체공휴일',
        '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴',
        '2028-10-02':'추석 연휴','2028-10-03':'추석','2028-10-04':'대체공휴일',
        '2029-09-21':'추석 연휴','2029-09-22':'추석','2029-09-23':'추석 연휴',
        '2030-09-11':'추석 연휴','2030-09-12':'추석','2030-09-13':'추석 연휴',
    };

    function _getHoliday(ds) {
        return FIXED_HOLIDAYS[ds.slice(5)] || LUNAR_HOLIDAYS[ds] || null;
    }

    let _activePlanDateModal = '';
    let _activePlanLineModal = '도장-A';

    const TIME_SLOTS = [
        '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '12:00', '12:30', '13:00', '13:30',
        '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
        '17:00', '17:30', '18:00', '18:30',
        '19:00', '19:30', '20:00'
    ];

    const BREAK_SLOTS = ['12:30', '13:00'];
    const DINNER_SLOTS = ['17:30'];
    const OT_SLOTS = ['18:00', '18:30', '19:00', '19:30', '20:00'];

    function getSlotClass(slot) {
        if (slot === '12:30' || slot === '13:00') return 'lunch-time';
        if (slot === '17:30') return 'dinner-time';
        if (slot >= '18:00') return 'overtime';
        return '';
    }

    // 시간 문자열 → 분 변환
    function _parseMin(t) {
        if (!t) return -1;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    // 슬롯 내 실제 작업 시간 막대 HTML
    // 슬롯(30분)에서 실제 작업이 차지하는 구간을 파란 막대로 표시
    function _slotBar(slot, hasData, item, curActive, curActiveEnd) {
        const slotMin = _parseMin(slot);
        if (slotMin < 0) return '';
        const slotEnd = slotMin + 30;

        let workStart, workEnd;
        if (hasData && item.startTime && item.endTime) {
            workStart = _parseMin(item.startTime);
            workEnd   = _parseMin(item.endTime);
        } else if (curActive && curActiveEnd) {
            workStart = _parseMin(curActive.startTime || curActive.slot);
            workEnd   = _parseMin(curActiveEnd);
        } else {
            return '';
        }

        const os = Math.max(slotMin, workStart);
        const oe = Math.min(slotEnd, workEnd);
        if (oe <= os) return '';

        const leftPct  = ((os - slotMin) / 30 * 100).toFixed(1);
        const widthPct = ((oe - os)      / 30 * 100).toFixed(1);
        const isFull   = widthPct >= 99.9;

        return `<div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(0,0,0,0.07);border-radius:0 0 2px 0;">
            <div style="position:absolute;top:0;left:${leftPct}%;width:${widthPct}%;height:100%;
                        background:${isFull ? 'var(--accent-blue)' : 'var(--accent-green,#10b981)'};
                        opacity:0.75;border-radius:1px;transition:width .2s;"></div>
        </div>`;
    }

    // 차종별 고유 색상 생성 (파스텔 톤)
    function getCarModelColor(carModel, partName, color) {
        const key = (carModel || '') + '|' + (partName || '') + '|' + (color || '');
        if (!key.replace(/\|/g, '')) return 'rgba(66, 133, 244, 0.15)';

        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = key.charCodeAt(i) + ((hash << 5) - hash);
        }

        // 파스텔 톤 (채도 55%, 명도 91%) — 아이템별 구분 색상
        const h = Math.abs(hash % 360);
        return `hsla(${h}, 55%, 91%, 0.85)`;
    }

    const DAY_KO = ['일','월','화','수','목','금','토'];

    function _getDayLabel(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return isNaN(d) ? '' : DAY_KO[d.getDay()];
    }

    function _getDayColor(dateStr) {
        const d = new Date(dateStr);
        const day = d.getDay();
        if (day === 0) return 'var(--accent-red)';
        if (day === 6) return 'var(--accent-blue)';
        return 'var(--text-primary)';
    }

    // 날짜 네비게이션 바 렌더링
    function renderDateNav(selectedDate) {
        const el = document.getElementById('planDateNavBar');
        if (!el) return;

        const allData = Storage.getAll(STORE) || [];
        // 계획이 있는 날짜 Set
        const datesWithPlan = new Set(allData.map(d => d.date).filter(Boolean));

        // 오늘 기준 -14일 ~ +14일 (29일치)
        const today = UIUtils.today();
        const base = new Date(selectedDate || today);
        const dates = [];
        for (let i = -14; i <= 14; i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().slice(0, 10));
        }

        el.innerHTML = dates.map(dt => {
            const isSelected = dt === selectedDate;
            const hasPlan = datesWithPlan.has(dt);
            const dayIdx = new Date(dt).getDay();
            const isSun = dayIdx === 0;
            const isSat = dayIdx === 6;
            const [, mm, dd] = dt.split('-');
            const dayLabel = DAY_KO[dayIdx];
            const dayColor = isSun ? '#ef4444' : isSat ? '#3b82f6' : (isSelected ? '#fff' : 'var(--text-muted)');

            return `
                <div onclick="ProductionPlanModule.selectDate('${dt}')"
                    style="display:inline-flex; flex-direction:column; align-items:center;
                           min-width:44px; padding:6px 8px; border-radius:8px; cursor:pointer;
                           margin-right:4px; transition:all 0.15s;
                           background:${isSelected ? 'var(--accent-blue)' : 'var(--bg-primary)'};
                           border:${isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)'};
                           ${isSelected ? 'box-shadow:0 2px 8px rgba(59,130,246,0.3);' : ''}"
                    onmouseover="if('${dt}'!=='${selectedDate}') this.style.background='var(--bg-secondary)'"
                    onmouseout="if('${dt}'!=='${selectedDate}') this.style.background='var(--bg-primary)'">
                    <span style="font-size:0.7rem; font-weight:600;
                                 color:${isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'};">
                        ${mm}/${dd}
                    </span>
                    <span style="font-size:0.82rem; font-weight:700; color:${isSelected ? '#fff' : dayColor};">
                        ${dayLabel}
                    </span>
                    <div style="height:5px; width:5px; border-radius:50%; margin-top:3px;
                                background:${hasPlan ? (isSelected ? '#fff' : 'var(--accent-green)') : 'transparent'};
                                border:1px solid ${hasPlan ? (isSelected ? '#fff' : 'var(--accent-green)') : 'transparent'};">
                    </div>
                </div>
            `;
        }).join('');

        // 선택 날짜가 보이도록 스크롤
        setTimeout(() => {
            const selected = el.querySelector('[style*="var(--accent-blue)"]');
            if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 50);
    }

    function selectDate(dateStr) {
        const input = document.getElementById('planDateFilter');
        const dayEl = document.getElementById('planDayOfWeek');
        if (input) input.value = dateStr;
        if (dayEl) {
            dayEl.textContent = _getDayLabel(dateStr);
            dayEl.style.color = _getDayColor(dateStr);
        }
        renderDateNav(dateStr);
        search();
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <input type="hidden" id="planDateFilter" value="${UIUtils.today()}">
                <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button class="btn btn-outline" onclick="ProductionPlanModule.prevMonth()">
                            <span class="material-symbols-outlined">chevron_left</span>
                        </button>
                        <h3 id="planCalendarTitle" style="margin:0;min-width:150px;text-align:center;font-size:1.25rem;"></h3>
                        <button class="btn btn-outline" onclick="ProductionPlanModule.nextMonth()">
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="ProductionPlanModule.goToday()">오늘</button>
                    </div>
                    <div style="display:flex;align-items:center;gap:14px;font-size:0.78rem;color:var(--text-secondary);flex-wrap:wrap;">
                        <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-blue);display:inline-block;"></span>도장-A</span>
                        <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-orange);display:inline-block;"></span>도장-B</span>
                        <button class="btn btn-outline btn-sm" onclick="ProductionPlanModule.search()">
                            <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div id="planCalendar" style="overflow-x:auto;"></div>
                    </div>
                </div>
            </div>
        `;

        search();

        if (_autoTimer) clearInterval(_autoTimer);
        _autoTimer = setInterval(() => autoUpdateStatus(), 60000);
    }

    async function search() {
        renderCalendar();
        const date = (document.getElementById('planDateFilter') || {}).value || UIUtils.today();
        if (document.getElementById('planGridBodyA') && document.getElementById('planGridBodyB')) {
            renderDayGrids(date);
        }
        if (date === UIUtils.today()) autoUpdateStatus();
    }

    /** 일별 그리드 키 — startTime 우선(슬롯 비어 있어도 표시). 동일 키 중복 시 최신 문서 유지 */
    function _planSlotKey(item) {
        return String((item && (item.startTime || item.slot)) || '').trim();
    }

    function _isNewerPlan(a, b) {
        const ta = String((a && (a.updatedAt || a.createdAt)) || '');
        const tb = String((b && (b.updatedAt || b.createdAt)) || '');
        if (ta && tb && ta !== tb) return ta > tb;
        return String((a && a.id) || '') > String((b && b.id) || '');
    }

    function _getDaySlotData(date) {
        const allData = Storage.getAll(STORE);
        const slotDataA = {};
        const slotDataB = {};

        allData.forEach(item => {
            if (item.date === date) {
                let targetSlotData = null;
                if (item.line === '도장-A') targetSlotData = slotDataA;
                if (item.line === '도장-B') targetSlotData = slotDataB;

                if (targetSlotData) {
                    const key = _planSlotKey(item);
                    if (key) {
                        const prev = targetSlotData[key];
                        if (!prev || _isNewerPlan(item, prev)) {
                            targetSlotData[key] = item;
                        }
                    } else if (item.hourlyPlans) {
                        for (let s of Object.keys(item.hourlyPlans)) {
                            if (!targetSlotData[s] && item.hourlyPlans[s]) {
                                targetSlotData[s] = {
                                    id: item.id + '_' + s,
                                    date: item.date,
                                    line: item.line,
                                    slot: s,
                                    carModel: item.carModel,
                                    partName: item.partName,
                                    planQty: item.hourlyPlans[s],
                                    status: item.status,
                                    isOldData: true,
                                    parentId: item.id
                                };
                            }
                        }
                    }
                }
            }
        });
        return { slotDataA, slotDataB };
    }

    function renderDayGrids(date) {
        const input = document.getElementById('planDateFilter');
        if (input) input.value = date;
        const { slotDataA, slotDataB } = _getDaySlotData(date);
        renderGrid('planGridBodyA', 'planGridFootA', slotDataA, '도장-A');
        renderGrid('planGridBodyB', 'planGridFootB', slotDataB, '도장-B');
    }

    function renderCalendar() {
        const titleEl = document.getElementById('planCalendarTitle');
        const calEl = document.getElementById('planCalendar');
        if (!calEl) return;
        if (titleEl) titleEl.textContent = `${_calYear}년 ${_calMonth}월`;

        const pad = n => String(n).padStart(2, '0');
        const firstDow = new Date(_calYear, _calMonth - 1, 1).getDay();
        const lastDay = new Date(_calYear, _calMonth, 0).getDate();
        const today = UIUtils.today();
        const plans = Storage.getAll(STORE) || [];
        const paintWorks = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
        const paintInspections = Storage.getAll(DB.STORES.PAINTING_INSPECTIONS) || [];
        const workByPlanId = {};
        paintWorks.forEach(w => {
            if (!w.planId) return;
            if (!workByPlanId[w.planId]) workByPlanId[w.planId] = [];
            workByPlanId[w.planId].push(w);
        });
        const inspectedWorkIds = new Set();
        paintInspections.forEach(i => {
            const wid = i.workId || i.productId;
            if (wid) inspectedWorkIds.add(wid);
        });
        const byDate = {};
        plans.forEach(p => {
            if (!p.date) return;
            if (!byDate[p.date]) byDate[p.date] = [];
            byDate[p.date].push(p);
        });

        const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
        const DAY_COLOR = ['#ef4444','#64748b','#64748b','#64748b','#64748b','#64748b','#2563eb'];
        let html = `
            <div style="border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.07),0 4px 18px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
            <table style="width:100%;border-collapse:collapse;min-width:780px;table-layout:fixed;">
                <colgroup>
                    <col style="width:38px;">
                    <col><col><col><col><col>
                    <col style="${_satExpanded ? '' : 'width:72px;'}">
                </colgroup>
                <thead><tr style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);">
                    ${DAY_KO.map((d, i) => {
                        const isSatCol = i === 6;
                        const extra = isSatCol
                            ? `<span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;margin-left:2px;">${_satExpanded ? 'chevron_left' : 'chevron_right'}</span>`
                            : '';
                        const clickAttr = isSatCol ? `onclick="event.stopPropagation();ProductionPlanModule.toggleSat()" style="cursor:pointer;" title="${_satExpanded ? '토요일 축소' : '토요일 확장'}"` : '';
                        return `<th ${clickAttr} style="padding:12px ${i===0?'2px':'8px'};text-align:center;font-size:0.8rem;font-weight:800;
                            color:${DAY_COLOR[i]};border-bottom:2px solid #e2e8f0;letter-spacing:0.5px;user-select:none;">${d}${extra}</th>`;
                    }).join('')}
                </tr></thead>
                <tbody>
        `;

        let day = 1;
        const rows = Math.ceil((firstDow + lastDay) / 7);
        for (let row = 0; row < rows; row++) {
            html += '<tr style="vertical-align:top;">';
            for (let col = 0; col < 7; col++) {
                const blank = (row === 0 && col < firstDow) || day > lastDay;
                if (blank) {
                    const blankBg = col===0 ? 'rgba(254,242,242,0.5)' : col===6 ? 'rgba(239,246,255,0.5)' : '#f8fafc';
                    const blankPad = col===0 ? 'padding:0;' : '';
                    html += `<td style="height:160px;${blankPad}border:1px solid #e2e8f0;background:${blankBg};"></td>`;
                    continue;
                }

                const ds = `${_calYear}-${pad(_calMonth)}-${pad(day)}`;
                const dayPlans = (byDate[ds] || []).sort((a, b) =>
                    (a.line || '').localeCompare(b.line || '', 'ko') ||
                    (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || '')
                );
                const isToday = ds === today;
                const isSun = col === 0;
                const isSat = col === 6;
                const holiday = _getHoliday(ds);
                const isHoliday = !!holiday;
                const plansA = dayPlans.filter(p => p.line === '도장-A');
                const plansB = dayPlans.filter(p => p.line === '도장-B');
                const planActualStatus = p => {
                    const linkedWorks = workByPlanId[p.id] || [];
                    if (linkedWorks.some(w => w.inspectionStatus === 'completed' || inspectedWorkIds.has(w.id))) return '검사완료';
                    if (linkedWorks.length > 0) return '도장완료';
                    const fallbackWorks = paintWorks.filter(w =>
                        w.date === p.date &&
                        w.line === p.line &&
                        w.carModel === p.carModel &&
                        w.partName === p.partName &&
                        (!p.color || w.color === p.color)
                    );
                    if (fallbackWorks.some(w => w.inspectionStatus === 'completed' || inspectedWorkIds.has(w.id))) return '검사완료';
                    if (fallbackWorks.length > 0) return '도장완료';
                    if (paintInspections.some(i =>
                        i.planId === p.id ||
                        (i.date === p.date && i.carModel === p.carModel && i.partName === p.partName && (!p.color || i.color === p.color))
                    )) return '검사완료';
                    return '계획';
                };
                const lineSummary = (plans, line, label, color) => {
                    // 동일 시작시각 중복은 최신만 표시 (구 계획 잔존 UI 혼선 방지)
                    const bySlot = {};
                    const noSlot = [];
                    plans.forEach(p => {
                        if (!(p.carModel || p.partName || Number(p.planQty))) return;
                        const key = _planSlotKey(p);
                        if (!key) { noSlot.push(p); return; }
                        if (!bySlot[key] || _isNewerPlan(p, bySlot[key])) bySlot[key] = p;
                    });
                    const items = Object.values(bySlot).concat(noSlot)
                        .sort((a, b) => (a.startTime || a.slot || '').localeCompare(b.startTime || b.slot || ''));
                    const itemLabel = p => {
                        const statusLabel = planActualStatus(p);
                        return `${p.partName || p.carModel || '-'} : ${UIUtils.formatNumber(Number(p.planQty) || 0)} (${statusLabel})`;
                    };
                    const text = items.map(itemLabel).join(', ');
                    const rows = items.slice(0, 4).map(p => {
                        const actualStatus = planActualStatus(p);
                        const inspected = actualStatus === '검사완료';
                        const worked = actualStatus === '도장완료';
                        const rowColor = inspected ? 'var(--accent-green)' : (worked ? '#0f766e' : color);
                        const badgeBg = inspected ? 'rgba(16,185,129,0.15)' : (worked ? 'rgba(20,184,166,0.15)' : 'rgba(100,116,139,0.12)');
                        const badgeColor = inspected ? '#065f46' : (worked ? '#0f766e' : '#475569');
                        return `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;">
                            <span style="font-size:0.68rem;font-weight:700;color:${rowColor};overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${p.partName || p.carModel || '-'} : ${UIUtils.formatNumber(Number(p.planQty) || 0)}</span>
                            <span style="font-size:0.58rem;font-weight:800;color:${badgeColor};background:${badgeBg};border-radius:4px;padding:1px 4px;flex-shrink:0;">${actualStatus}</span>
                        </div>`;
                    }).join('');
                    const more = items.length > 4
                        ? `<span style="font-size:0.65rem;color:var(--text-muted);line-height:1.1;">+${items.length - 4}</span>`
                        : '';
                    const lineBg = label==='A' ? 'rgba(37,99,235,0.1)' : 'rgba(234,88,12,0.1)';
                    const lineChip = text ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:900;color:${color};background:${lineBg};margin-bottom:2px;">${label}</span>` : '';
                    return `<div onclick="event.stopPropagation(); ProductionPlanModule.openDayPlan('${ds}', '${line}')"
                        title="${line} ${text}"
                        style="width:50%;padding:4px 4px;display:flex;flex-direction:column;gap:2px;cursor:pointer;min-width:0;${label==='B' ? 'border-left:1px solid #e2e8f0;' : ''}">
                        ${lineChip}${rows}${more}
                    </div>`;
                };

                const cellBg = isToday ? '#eff6ff' : isSun ? 'rgba(254,242,242,0.5)' : isSat ? 'rgba(239,246,255,0.4)' : (isHoliday ? 'rgba(254,242,242,0.3)' : '#fff');
                const cellBorderTop = isToday ? 'border-top:2px solid #2563eb;' : (isHoliday && !isSun && !isSat ? 'border-top:2px solid #fca5a5;' : '');
                const dayNumColor = isSun ? '#ef4444' : isSat ? '#2563eb' : isToday ? '#fff' : (isHoliday ? '#ef4444' : 'var(--text-primary)');
                const dayNumStyle = isToday
                    ? `display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#2563eb;font-size:0.78rem;font-weight:800;color:#fff;`
                    : `font-size:0.88rem;font-weight:800;color:${dayNumColor};`;
                const countBadge = dayPlans.length
                    ? `<span style="font-size:0.6rem;font-weight:700;padding:1px 7px;background:rgba(99,102,241,0.1);color:#4f46e5;border-radius:99px;">${dayPlans.length}</span>`
                    : '';
                if (isSun || (isSat && !_satExpanded)) {
                    const hoverBg = isSun ? '#fee2e2' : '#dbeafe';
                    const clickFn = isSat
                        ? `ProductionPlanModule.toggleSat()`
                        : `ProductionPlanModule.openDayPlan('${ds}', '도장-A')`;
                    const tip = isSat && dayPlans.length ? `title="${dayPlans.length}건 계획"` : '';
                    html += `
                    <td onclick="${clickFn}" ${tip}
                        style="height:160px;padding:6px 2px;border:1px solid #e2e8f0;${cellBorderTop}background:${cellBg};cursor:pointer;vertical-align:top;text-align:center;transition:background 0.12s;position:relative;"
                        onmouseover="this.style.background='${hoverBg}';"
                        onmouseout="this.style.background='${cellBg}';">
                        <span style="${dayNumStyle}">${day}</span>
                        ${holiday ? `<div style="font-size:0.5rem;font-weight:700;color:#ef4444;margin-top:2px;line-height:1.2;word-break:break-all;">${holiday}</div>` : ''}
                        ${isSat && dayPlans.length ? `<span style="display:block;margin-top:3px;font-size:0.58rem;font-weight:700;color:#2563eb;background:rgba(37,99,235,0.1);border-radius:99px;padding:1px 4px;">${dayPlans.length}</span>` : ''}
                    </td>`;
                } else {
                html += `
                    <td onclick="ProductionPlanModule.openDayPlan('${ds}', '도장-A')"
                        style="height:160px;padding:7px 7px;border:1px solid #e2e8f0;${cellBorderTop}background:${cellBg};cursor:pointer;vertical-align:top;transition:background 0.12s,box-shadow 0.12s;"
                        onmouseover="this.style.background='#f1f5f9';this.style.boxShadow='inset 0 0 0 1.5px #94a3b8';"
                        onmouseout="this.style.background='${cellBg}';this.style.boxShadow='';">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;margin-bottom:5px;">
                            <div>
                                <span style="${dayNumStyle}">${day}</span>
                                ${holiday ? `<div style="font-size:0.58rem;font-weight:700;color:#ef4444;line-height:1.2;margin-top:1px;white-space:nowrap;">${holiday}</div>` : ''}
                            </div>
                            ${countBadge}
                        </div>
                        <div style="height:${holiday ? '96px' : '108px'};display:flex;">
                            ${lineSummary(plansA, '도장-A', 'A', '#2563eb')}
                            ${lineSummary(plansB, '도장-B', 'B', '#ea580c')}
                        </div>
                    </td>
                `;
                }
                day++;
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        calEl.innerHTML = html;
    }

    function openDayPlan(date, line = '도장-A') {
        _activePlanDateModal = date;
        _activePlanLineModal = line;
        const input = document.getElementById('planDateFilter');
        if (input) input.value = date;
        const suffix = line === '도장-B' ? 'B' : 'A';
        const color = line === '도장-B' ? 'var(--accent-orange)' : 'var(--accent-blue)';
        UIUtils.showModal(`${date} ${line} 생산 계획`, `
            <div class="plan-day-modal">
            ${_lineGridHTML(suffix, line, color)}
            </div>
        `, `
            <button class="btn btn-secondary" onclick="ProductionPlanModule.closeDayPlan()">닫기</button>
        `, 'xl');
        // 동일 시작시각 중복 문서가 있으면 최신만 남기고 정리 (지시서/도장현황에 구 계획 잔존 방지)
        _cleanupSlotDupesForDay(date, line).then(function(n) {
            if (n > 0) {
                search();
                UIUtils.toast(`같은 시간대 중복 계획 ${n}건을 정리했습니다.`, 'info');
            }
            _decoratePlanDayModalHeader(date, line);
            renderDayGrid(date, line);
        }).catch(function() {
            _decoratePlanDayModalHeader(date, line);
            renderDayGrid(date, line);
        });
    }

    /** 동일 date+line+시작시각에 여러 문서가 있으면 최신 1건만 남김 */
    async function _cleanupSlotDupesForDay(date, line) {
        const all = (Storage.getAll(STORE) || []).filter(p => p.date === date && p.line === line);
        const byKey = {};
        all.forEach(p => {
            const key = _planSlotKey(p);
            if (!key) return;
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(p);
        });
        let removed = 0;
        for (const key of Object.keys(byKey)) {
            const group = byKey[key];
            if (group.length < 2) continue;
            let keep = group[0];
            group.forEach(p => { if (_isNewerPlan(p, keep)) keep = p; });
            for (const p of group) {
                if (p.id === keep.id) continue;
                await Storage.remove(STORE, p.id);
                removed++;
            }
        }
        return removed;
    }

    function _decoratePlanDayModalHeader(date, line) {
        const modal = document.getElementById('modal');
        const header = modal ? modal.querySelector('.modal-header') : null;
        if (!header) return;
        // 모달 컨테이너 상단 강조선
        const container = modal.querySelector('.modal-container');
        if (container) {
            const isB = line === '도장-B';
            container.style.borderTop = `4px solid ${isB ? '#f97316' : '#2563eb'}`;
            container.style.boxShadow = isB
                ? '0 8px 40px rgba(249,115,22,0.18)'
                : '0 8px 40px rgba(37,99,235,0.15)';
        }
        header.classList.add('plan-day-modal-header');
        header.querySelector('.plan-day-line-switch')?.remove();
        const switchEl = document.createElement('div');
        switchEl.className = 'plan-day-line-switch';
        switchEl.innerHTML = `
            <button class="btn btn-sm ${line === '도장-A' ? 'btn-primary' : 'btn-outline'}" onclick="ProductionPlanModule.openDayPlan('${date}', '도장-A')">도장-A</button>
            <button class="btn btn-sm ${line === '도장-B' ? 'btn-primary' : 'btn-outline'}" onclick="ProductionPlanModule.openDayPlan('${date}', '도장-B')">도장-B</button>
        `;
        header.appendChild(switchEl);
    }

    function closeDayPlan() {
        _activePlanDateModal = '';
        _activePlanLineModal = '도장-A';
        UIUtils.closeModal();
    }

    function _lineGridHTML(suffix, line, color) {
        const bgTint = line === '도장-B' ? 'rgba(249,115,22,0.04)' : 'rgba(37,99,235,0.04)';
        const shadowColor = line === '도장-B' ? 'rgba(249,115,22,0.25)' : 'rgba(37,99,235,0.20)';
        return `
            <div class="card grid-card" style="margin-bottom:8px;border:1.5px solid ${color};border-top:4px solid ${color};box-shadow:0 4px 18px ${shadowColor};">
                <div class="card-header" style="padding:6px 14px;background:${bgTint};border-bottom:1px solid ${color}33;display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;color:${color};font-weight:800;"><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;">factory</span>${line}</h4>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;color:#64748b;user-select:none;">
                            <input type="checkbox" id="overtimeToggle${suffix}"
                                onchange="document.getElementById('planGridWrap${suffix}').classList.toggle('show-overtime',this.checked); ProductionPlanModule.updateFooterOT('${suffix}',this.checked)"
                                style="width:15px;height:15px;cursor:pointer;">
                            <span class="material-symbols-outlined" style="font-size:15px;color:#f59e0b;">nights_stay</span>
                            잔업 계획
                        </label>
                        <button class="btn btn-outline btn-sm" onclick="ProductionPlanModule.printWorkOrder('${line}')">
                            <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                        </button>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="mes-grid-container pivoted-grid" id="planGridWrap${suffix}">
                        <table class="mes-grid" id="planGrid${suffix}">
                            <thead>
                                <tr>
                                    <th class="sticky-col time-col-header" style="width:140px;">시간 (시작~종료)</th>
                                    <th style="width:80px;">차종</th><th>제품명</th><th>도장 컬러</th>
                                    <th style="text-align:center;">품목구분</th><th>수량</th><th>상태</th><th style="width:60px;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="planGridBody${suffix}"></tbody>
                            <tfoot id="planGridFoot${suffix}"></tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function renderDayGrid(date, line) {
        const input = document.getElementById('planDateFilter');
        if (input) input.value = date;
        const { slotDataA, slotDataB } = _getDaySlotData(date);
        if (line === '도장-B') {
            renderGrid('planGridBodyB', 'planGridFootB', slotDataB, '도장-B');
        } else {
            renderGrid('planGridBodyA', 'planGridFootA', slotDataA, '도장-A');
        }
    }

    function toggleSat() {
        _satExpanded = !_satExpanded;
        renderCalendar();
    }

    function prevMonth() {
        _calMonth--;
        if (_calMonth < 1) { _calMonth = 12; _calYear--; }
        search();
    }

    function nextMonth() {
        _calMonth++;
        if (_calMonth > 12) { _calMonth = 1; _calYear++; }
        search();
    }

    function goToday() {
        const now = new Date();
        _calYear = now.getFullYear();
        _calMonth = now.getMonth() + 1;
        search();
    }

    function renderGrid(tbodyId, footId, slotData, lineName) {
        const tbody = document.getElementById(tbodyId);
        const foot = document.getElementById(footId);
        const selectedDate = (document.getElementById('planDateFilter') || {}).value || UIUtils.today();

        // 18:00 이후(잔업) 슬롯에 실제 계획이 있으면 "잔업 계획" 체크박스를 자동으로 켜서
        // 기본적으로 숨겨지는 잔업 행이 사용자가 따로 토글하지 않아도 바로 보이게 한다.
        // 계획 자체가 18:00 이전에 시작해도 종료 시간이 18:00을 넘어가면(예: 12:18~21:18)
        // 그 이후 구간도 잔업 행이라 시작 시각뿐 아니라 종료 시각도 함께 확인해야 한다.
        const _otSuffix = lineName === '도장-B' ? 'B' : 'A';
        const hasOvertimePlan = Object.keys(slotData).some(s => {
            const item = slotData[s];
            if (!item || !(item.carModel || item.partName || Number(item.planQty) > 0)) return false;
            return s >= '18:00' || (item.endTime && item.endTime > '18:00');
        });
        if (hasOvertimePlan) {
            const otToggle = document.getElementById('overtimeToggle' + _otSuffix);
            const otWrap = document.getElementById('planGridWrap' + _otSuffix);
            if (otToggle) otToggle.checked = true;
            if (otWrap) otWrap.classList.add('show-overtime');
        }

        let totalQty = 0;
        let totalMinutes = 0;

        const allSlots = Array.from(new Set([...TIME_SLOTS, ...Object.keys(slotData)])).sort();

        // 계획 종료 시간이 정의된 슬롯 범위(TIME_SLOTS, 20:00까지)를 넘어가면(예: 12:18~21:18)
        // 그 종료 시각을 담을 30분 단위 행을 동적으로 추가한다 — 안 그러면 표가 20:00에서
        // 끊겨서 실제 완료(종료) 시간이 어디에도 표시되지 않는다.
        const maxEndMin = Object.values(slotData).reduce((max, item) => {
            if (!item || !item.endTime) return max;
            const m = _parseMin(item.endTime);
            return (m > max && m < 24 * 60) ? m : max;
        }, -1);
        if (maxEndMin >= 0) {
            const lastSlotMin = _parseMin(allSlots[allSlots.length - 1]);
            for (let m = lastSlotMin + 30; m <= maxEndMin; m += 30) {
                allSlots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
            }
            allSlots.sort();
        }

        // 계획 순서 정렬 후 이전 계획 매핑 (교체 감지)
        const sortedPlans = Object.values(slotData)
            .filter(p => p.startTime)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const prevPlanMap = {};
        for (let i = 1; i < sortedPlans.length; i++) {
            prevPlanMap[sortedPlans[i].id] = sortedPlans[i - 1];
        }

        let activeItem = null;
        let activeEndTime = '';
        let _nextSuggestTime = ''; // 다음 작업 권장 시작 시간 (마지막 종료+5분)

        tbody.innerHTML = allSlots.map(slot => {
            let rowClass = getSlotClass(slot);
            const item = slotData[slot] || {};
            const q = Number(item.planQty) || 0;
            totalQty += q;

            // 작업 시간 계산 (점심 시간 12:30~13:30 제외 로직, 식사 시간 가동 제외)
            if (item.startTime && item.endTime) {
                const [sH, sM] = item.startTime.split(':').map(Number);
                const [eH, eM] = item.endTime.split(':').map(Number);
                let sTotal = sH * 60 + sM;
                let eTotal = eH * 60 + eM;

                let diff = eTotal - sTotal;

                // 식사 시간 가동이 아닌 경우에만 식사 시간 차감
                if (!item.mealTimeWork) {
                    const breaks = [
                        { s: 12 * 60 + 30, e: 13 * 60 + 30 }, // 점심
                        { s: 17 * 60 + 30, e: 18 * 60 }        // 석식
                    ];
                    breaks.forEach(b => {
                        const overlapStart = Math.max(sTotal, b.s);
                        const overlapEnd = Math.min(eTotal, b.e);
                        if (overlapStart < overlapEnd) diff -= (overlapEnd - overlapStart);
                    });
                }

                if (diff > 0) totalMinutes += diff;
            }

            const isLunch = (slot === '12:30' || slot === '13:00');
            const isDinner = (slot === '17:30');
            const isMealTime = isLunch || isDinner;
            const hasData = item.carModel || item.partName || q > 0;

            if (hasData) {
                activeItem = item;
                activeEndTime = item.endTime || '';
            }

            let isHighlight = false;
            let bgColorStyle = '';
            if (activeItem && activeEndTime) {
                const checkSlot = slot;
                const activeStart = activeItem.startTime || activeItem.slot;
                if (checkSlot >= activeStart && checkSlot < activeEndTime) {
                    isHighlight = true;
                } else if (checkSlot >= activeEndTime) {
                    if (!hasData) {
                        // 작업 종료 직후 첫 빈 슬롯: 다음 시작 권장 시간 계산 (종료+5분)
                        if (activeEndTime && !_nextSuggestTime) {
                            const [_h, _m] = activeEndTime.split(':').map(Number);
                            const _sm = _h * 60 + _m + 5;
                            _nextSuggestTime = `${String(Math.floor(_sm/60)).padStart(2,'0')}:${String(_sm%60).padStart(2,'0')}`;
                        }
                        activeItem = null;
                        activeEndTime = '';
                    }
                }
            }

            if (isHighlight) {
                const highlightColor = activeItem
                    ? getCarModelColor(activeItem.carModel, activeItem.partName, activeItem.color)
                    : 'rgba(66, 133, 244, 0.15)';
                bgColorStyle = `background-color: ${highlightColor};`;
            }

            let clickable = !isLunch;
            if (isHighlight && !hasData) {
                clickable = false;
            }

            const trCursor = clickable ? 'pointer' : 'not-allowed';
            const trClick = clickable
                ? `onclick="ProductionPlanModule.editSlot('${slot}', '${lineName}')"`
                : (isLunch ? '' : `onclick="event.stopPropagation(); UIUtils.toast('해당 시간은 이미 다른 작업이 진행 중입니다.', 'warning');"`);
            const isOvertimeStart = (slot === '18:00');

            if (isMealTime) {
                // 점심 두 슬롯(12:30, 13:00)을 한 행으로 병합: 13:00 슬롯은 빈 tr만 렌더링
                if (slot === '13:00') return '<tr class="lunch-time" style="cursor:not-allowed;background-color:#f1f5f9;"></tr>';
                let mealText = '';
                let timeRange = '';
                let rowspan = 1;
                if (isLunch) {
                    mealText = '🍱 점심 시간 (LUNCH TIME)';
                    timeRange = '12:30 ~ 13:30';
                    rowspan = 2;
                } else {
                    mealText = '☕ 저녁 식사 (DINNER TIME)';
                    timeRange = '17:30 ~ 18:00';
                }
                // 식사 시간 가동 계획이 이 시간대에 걸쳐 있으면 배너 표시
                const isMealRunning = activeItem && activeItem.mealTimeWork && activeEndTime > slot;
                const mealRunBanner = isMealRunning
                    ? `<span style="margin-left:12px;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.4);border-radius:12px;font-size:0.75rem;font-weight:700;color:#ea580c;">
                           🔄 교대 가동 중 — ${activeItem.carModel} ${activeItem.partName}
                       </span>`
                    : '';
                const mealBg = isMealRunning ? 'background:rgba(249,115,22,0.06);' : 'background-color:#f1f5f9;';
                return `
                    <tr class="${isLunch ? 'lunch-time' : 'dinner-time'}" style="cursor: not-allowed; ${mealBg}">
                        <td class="sticky-col time-cell" style="text-align:center;" rowspan="${rowspan}">${timeRange}</td>
                        <td colspan="7" style="text-align:center; font-weight:bold; color:#94a3b8; letter-spacing:2px;" rowspan="${rowspan}">${mealText}${mealRunBanner}</td>
                    </tr>
                `;
            }

            // 계획 전환 시 교체 기호 행 생성 (prevPlanMap 기반)
            let exchangeRow = '';
            if (hasData && item.id) {
                const prevPlan = prevPlanMap[item.id];
                if (prevPlan) {
                    const jigChange   = prevPlan.partName && item.partName && prevPlan.partName !== item.partName;
                    const colorChange = prevPlan.color    && item.color    && prevPlan.color    !== item.color;
                    if (jigChange || colorChange) {
                        const totalMin = colorChange ? 15 : 5;
                        totalMinutes += totalMin; // 교체 시간 작업 시간에 포함
                        const chips = [];
                        if (colorChange) chips.push(`<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:2px 10px;font-size:0.75rem;font-weight:700;">🎨 도료교체</span>`);
                        if (jigChange)   chips.push(`<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(59,130,246,0.1);color:#2563eb;border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:2px 10px;font-size:0.75rem;font-weight:700;">🔧 JIG교체</span>`);
                        chips.push(`<span style="font-size:0.75rem;color:#92400e;font-weight:600;">+${totalMin}분</span>`);
                        exchangeRow = `<tr style="background:#fffbeb;border-top:2px dashed #fbbf24;">
                            <td class="sticky-col time-cell" style="font-size:0.72rem;color:#92400e;text-align:center;">교체</td>
                            <td colspan="7" style="padding:5px 12px;">${chips.join('<span style="margin:0 6px;color:var(--text-muted);">+</span>')}</td>
                        </tr>`;
                    }
                }
            }

            const barHTML = ''; // 시간 막대 제거

            // 시간 셀 표시 결정
            // ① 첫 행(hasData): 단일 슬롯이면 "HH:MM ~ HH:MM", 여러 슬롯이면 "HH:MM ~"
            // ② continuation 행: 작업이 이 슬롯 안에서 끝나면 "~ HH:MM", 이어지면 공백
            // ③ 빈 슬롯: 슬롯 시간 그대로
            let timeCellText;
            if (hasData) {
                const slotEndMin = _parseMin(slot) + 30;
                const workEndMin = item.endTime ? _parseMin(item.endTime) : 0;
                const isMultiSlot = item.endTime && workEndMin > slotEndMin;
                timeCellText = isMultiSlot
                    ? (item.startTime || slot)
                    : `${item.startTime || slot}${item.endTime ? ' ~ ' + item.endTime : ''}`;
            } else if (isHighlight && activeItem && activeEndTime) {
                const slotStartMin = _parseMin(slot);
                const slotEndMin   = slotStartMin + 30;
                const workEndMin   = _parseMin(activeEndTime);
                timeCellText = (workEndMin > slotStartMin && workEndMin <= slotEndMin)
                    ? activeEndTime
                    : '';
            } else {
                // 마지막 작업 종료 직후 첫 번째 빈 슬롯: 권장 시작 시간 표시
                if (_nextSuggestTime && !isMealTime) {
                    timeCellText = `<span style="color:var(--accent-green);font-weight:800;">${_nextSuggestTime}</span><span style="font-size:0.65rem;color:var(--text-muted);margin-left:3px;">권장</span>`;
                    _nextSuggestTime = ''; // 첫 슬롯에만 표시
                } else {
                    timeCellText = slot;
                }
            }

            const isOvertimeSlot = slot >= '18:00';
            const dragAttrs = hasData && item.id
                ? `draggable="true" ondragstart="ProductionPlanModule.onPlanDragStart(event,'${item.id}')" ondragend="ProductionPlanModule.onPlanDragEnd(event)"`
                : '';
            const dropAttrs = !isLunch
                ? `ondragover="ProductionPlanModule.onPlanDragOver(event)" ondragleave="ProductionPlanModule.onPlanDragLeave(event)" ondrop="ProductionPlanModule.onPlanDrop(event,'${slot}','${lineName}')"`
                : '';

            return exchangeRow + `
                <tr class="${rowClass} hover-row ${isOvertimeStart ? 'overtime-start' : ''} ${isOvertimeSlot ? 'overtime-slot' : ''}" ${dragAttrs} ${dropAttrs} style="cursor: ${hasData ? 'grab' : trCursor}; ${bgColorStyle}">
                    <td class="sticky-col time-cell" style="position:relative;padding-bottom:7px;" ${trClick}>${timeCellText}${barHTML}</td>
                    <td class="editable-cell" ${trClick}>${item.carModel || (clickable ? '<span style="color:#ccc;">(클릭하여 입력)</span>' : `<span style="color:#aaa;">${activeItem?.carModel || ''}</span>`)}</td>
                    <td class="editable-cell" ${trClick}>${item.partName || (!hasData && activeItem ? `<span style="color:#aaa;">${activeItem.partName || ''}</span>` : '')}</td>
                    <td class="editable-cell" ${trClick}>${item.color || (!hasData && activeItem ? `<span style="color:#aaa;">${activeItem.color || ''}</span>` : '')}</td>
                    <td class="editable-cell text-center" ${trClick}>${item.carModel ? UIUtils.itemTypeBadge(item.carModel, item.partName, item.color) : ''}</td>
                    <td class="editable-cell text-right" ${trClick}>${q > 0 ? UIUtils.formatNumber(q) : ''}</td>
                    <td class="editable-cell text-center" ${trClick}>${item.isTemporary ? `<span class="badge" style="background:var(--accent-red,#ef4444);color:#fff;margin-right:4px;font-size:0.68rem;" title="사출·도료 재고 검증 없이 등록된 임시 계획">임시</span>` : ''}${item.status ? UIUtils.badge(item.status, item.status === '완료' ? 'success' : (item.status === '진행' ? 'info' : 'warning')) : ''}</td>
                    <td class="text-center">
                        ${hasData ? `<button class="btn btn-xs btn-icon btn-danger" onclick="ProductionPlanModule.removeSlot('${slot}', '${lineName}')" title="삭제" style="position:relative; z-index:10;"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        if (foot) {
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            const timeStr = h > 0 ? `${h}시간 ${m}분` : `${m}분`;

            // 정규 가용: 08:30 ~ 17:30 (540분) - 점심 60분 = 480분
            // 잔업: 17:30 ~ 20:00 = 2시간 = 120분
            const DAY_AVAILABLE = 480;
            const OVERTIME_AVAIL = 120;
            const remainMinutes = Math.max(0, DAY_AVAILABLE - totalMinutes);
            const overtimeUsed = Math.max(0, totalMinutes - DAY_AVAILABLE);
            const rh = Math.floor(remainMinutes / 60);
            const rm = remainMinutes % 60;
            const remainStr = rh > 0 ? `${rh}시간 ${rm}분` : `${rm}분`;
            const effPct = DAY_AVAILABLE > 0 ? Math.round(totalMinutes / DAY_AVAILABLE * 100) : 0;
            const effColor = effPct >= 90 ? '#10b981' : effPct >= 70 ? '#f59e0b' : '#ef4444';
            const otH = Math.floor(overtimeUsed / 60);
            const otM = overtimeUsed % 60;
            const otStr = otH > 0 ? `${otH}시간 ${otM}분` : `${otM}분`;

            // 정규 효율
            const effLabel = effPct >= 90 ? '최적' : effPct >= 70 ? '양호' : effPct >= 50 ? '보통' : '부족';
            const barFill  = Math.min(effPct, 100);

            // 잔업 포함(600분) 효율
            const OT_TOTAL      = DAY_AVAILABLE + OVERTIME_AVAIL; // 600분
            const remainMinOT   = Math.max(0, OT_TOTAL - totalMinutes);
            const rhOT = Math.floor(remainMinOT / 60), rmOT = remainMinOT % 60;
            const remainStrOT   = rhOT > 0 ? `${rhOT}시간 ${rmOT}분` : `${rmOT}분`;
            const effPctOT      = Math.round(totalMinutes / OT_TOTAL * 100);
            const effColorOT    = effPctOT >= 90 ? '#10b981' : effPctOT >= 70 ? '#f59e0b' : '#ef4444';
            const effLabelOT    = effPctOT >= 90 ? '최적' : effPctOT >= 70 ? '양호' : effPctOT >= 50 ? '보통' : '부족';
            const barFillOT     = Math.min(effPctOT, 100);

            foot.innerHTML = `
                <tr class="total-row">
                    <td class="sticky-col font-bold" colspan="5" style="text-align:left;padding:8px 15px;"
                        id="planFootCell${tbodyId.replace('planGridBody','')}">
                        <div style="display:flex;align-items:center;gap:16px;margin-bottom:5px;">
                            <span id="planFootPlan${tbodyId}" style="font-size:0.78rem;color:#64748b;white-space:nowrap;"
                                data-reg="계획 <strong>${totalMinutes > 0 ? timeStr : '-'}</strong> / 8h"
                                data-ot="계획 <strong>${totalMinutes > 0 ? timeStr : '-'}</strong> / 10h">
                                계획 <strong>${totalMinutes > 0 ? timeStr : '-'}</strong> / 8h
                            </span>
                            <span id="planFootRemain${tbodyId}" style="font-size:0.78rem;color:#94a3b8;white-space:nowrap;"
                                data-reg="${remainMinutes > 0 ? remainStr : '없음'}"
                                data-ot="${remainMinOT > 0 ? remainStrOT : '없음'}">
                                잔여 <strong>${remainMinutes > 0 ? remainStr : '없음'}</strong>
                            </span>
                            <span id="planFootEff${tbodyId}" style="padding:2px 10px;border-radius:999px;font-size:0.75rem;font-weight:800;white-space:nowrap;
                                         background:${effColor}1a;color:${effColor};"
                                data-reg-label="${effLabel}" data-reg-pct="${effPct}" data-reg-color="${effColor}"
                                data-ot-label="${effLabelOT}" data-ot-pct="${effPctOT}" data-ot-color="${effColorOT}">
                                ${effLabel} ${effPct}%
                            </span>
                        </div>
                        <div style="width:100%;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                            <div id="planFootBar${tbodyId}" style="width:${barFill}%;height:100%;background:${effColor};border-radius:4px;transition:width .4s;"
                                data-reg-fill="${barFill}" data-reg-color="${effColor}"
                                data-ot-fill="${barFillOT}" data-ot-color="${effColorOT}"></div>
                        </div>
                        <div style="display:flex;font-size:0.65rem;color:#cbd5e1;margin-top:2px;">
                            <span>0%</span><span style="margin-left:auto;">100%</span>
                        </div>
                    </td>
                    <td class="font-bold" style="text-align:right;padding-right:10px;white-space:nowrap;">총 합계</td>
                    <td class="total-cell font-bold text-right">${UIUtils.formatNumber(totalQty)}</td>
                    <td colspan="1"></td>
                </tr>
            `;
            // 잔업 계획을 자동으로 켰다면(위 hasOvertimePlan) 방금 만든 푸터도 잔업 기준 표시로 맞춘다.
            if (hasOvertimePlan) updateFooterOT(_otSuffix, true);
        }
    }

    function updateFooterOT(suffix, checked) {
        const tbodyId = 'planGridBody' + suffix;
        const planEl  = document.getElementById('planFootPlan'   + tbodyId);
        const remEl   = document.getElementById('planFootRemain' + tbodyId);
        const effEl   = document.getElementById('planFootEff'    + tbodyId);
        const barEl   = document.getElementById('planFootBar'    + tbodyId);
        if (!planEl || !remEl || !effEl || !barEl) return;

        if (checked) {
            planEl.innerHTML = planEl.dataset.ot;
            remEl.innerHTML  = '잔여 <strong>' + remEl.dataset.ot + '</strong>';
            const lbl = effEl.dataset.otLabel, pct = effEl.dataset.otPct, col = effEl.dataset.otColor;
            effEl.textContent = lbl + ' ' + pct + '%';
            effEl.style.background = col + '1a'; effEl.style.color = col;
            barEl.style.width = barEl.dataset.otFill + '%'; barEl.style.background = barEl.dataset.otColor;
        } else {
            planEl.innerHTML = planEl.dataset.reg;
            remEl.innerHTML  = '잔여 <strong>' + remEl.dataset.reg + '</strong>';
            const lbl = effEl.dataset.regLabel, pct = effEl.dataset.regPct, col = effEl.dataset.regColor;
            effEl.textContent = lbl + ' ' + pct + '%';
            effEl.style.background = col + '1a'; effEl.style.color = col;
            barEl.style.width = barEl.dataset.regFill + '%'; barEl.style.background = barEl.dataset.regColor;
        }
    }

    function updateDropdowns(target, line) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _linkedTargetIds = new Set(products.map(p => p.linkedProductId).filter(Boolean));
        // 라인명이 "도장-A" 또는 "도장-B" 형식이므로 라인명 자체를 사용
        let lineProducts = line
            ? products.filter(p => {
                if (_linkedTargetIds.has(p.id)) return false;
                const hasLineProcess =
                    (p.process1 === line) ||
                    (p.process2 === line) ||
                    (p.process3 === line) ||
                    (p.process4 === line);
                return hasLineProcess;
            })
            : products.filter(p => !_linkedTargetIds.has(p.id));
        if (lineProducts.length === 0) lineProducts = products.filter(p => !_linkedTargetIds.has(p.id));

        const modelSel = document.getElementById('sModel');
        const partSel = document.getElementById('sPart');
        const colorSel = document.getElementById('sColor');

        if (target === 'model') {
            const selectedModel = modelSel.value;
            const validParts = [...new Set(lineProducts.filter(p => p.carModel === selectedModel).map(p => p.partName).filter(Boolean))];
            partSel.innerHTML = '<option value="">선택</option>' + validParts.map(p => `<option value="${p}">${p}</option>`).join('');
            partSel.value = '';
            colorSel.innerHTML = '<option value="">선택</option>';
            colorSel.value = '';
        } else if (target === 'part') {
            const selectedModel = modelSel.value;
            const selectedPart = partSel.value;
            // 라인별 컬러 우선: paintColorA/B 있으면 그 값, 없으면 product.color
            const _curLine = line || (document.getElementById('sLine') || {}).value || '';
            const validColors = [...new Set(
                lineProducts
                    .filter(p => p.carModel === selectedModel && p.partName === selectedPart)
                    .map(p => _getPlanColorForLine(p, _curLine))
                    .filter(Boolean)
            )];
            colorSel.innerHTML = '<option value="">선택</option>' + validColors.map(c => `<option value="${c}">${c}</option>`).join('');
            colorSel.value = '';
        }
        // DOM 커밋 후 실행 (선택값 반영 보장)
        setTimeout(function() {
            ProductionPlanModule.updateInjStockPanel();
            ProductionPlanModule.updateLaserWipPanel();
            ProductionPlanModule.updatePaintStockPanel();
            ProductionPlanModule.calcEndTime();
            ProductionPlanModule._autoFillItemType();
            ProductionPlanModule._updateLinkedProductBanner();
        }, 0);
    }

    function _updateLinkedProductBanner() {
        const banner = document.getElementById('linkedProductBanner');
        if (!banner) return;
        const car  = (document.getElementById('sModel') || {}).value || '';
        const part = (document.getElementById('sPart')  || {}).value || '';
        if (!part) { banner.innerHTML = ''; return; }
        const allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const selProd = allProds.find(p => p.carModel === car && p.partName === part);
        if (!selProd || !selProd.linkedProductId) { banner.innerHTML = ''; return; }
        const lp = allProds.find(p => p.id === selProd.linkedProductId);
        if (!lp) { banner.innerHTML = ''; return; }
        banner.innerHTML = `<div style="padding:8px 12px;background:rgba(109,40,217,0.07);border:1px solid rgba(109,40,217,0.25);border-radius:8px;display:flex;align-items:center;gap:8px;font-size:0.82rem;">
            <span class="material-symbols-outlined" style="font-size:16px;color:#7c3aed;flex-shrink:0;">call_split</span>
            <span style="color:#7c3aed;font-weight:600;">레이져 단계에서 납품처별 분리</span>
            <span style="color:var(--text-secondary);">→</span>
            <span style="color:var(--text-primary);">${lp.partName}</span>
            <span style="color:var(--text-muted);font-size:0.75rem;">(${lp.customer || '납품처 미설정'})</span>
        </div>`;
    }

    // ── 품목구분 자동 입력 ────────────────────────────────────────────
    function _autoFillItemType() {
        const car   = (document.getElementById('sModel') || {}).value || '';
        const part  = (document.getElementById('sPart')  || {}).value || '';
        const color = (document.getElementById('sColor') || {}).value || '';
        const hiddenEl = document.getElementById('sItemType');
        const badgeEl  = document.getElementById('sItemTypeBadge');
        if (!hiddenEl || !badgeEl) return;

        const matched = _findProductForPlan(car, part, color);
        const itemType = matched ? (matched.itemType || '') : '';
        hiddenEl.value = itemType;

        const BADGE_STYLES = {
            '양산품': 'background:rgba(52,211,153,0.15);color:var(--accent-green);border-color:var(--accent-green);',
            '개발품': 'background:rgba(59,130,246,0.15);color:var(--accent-blue);border-color:var(--accent-blue);',
            'A/S품':  'background:rgba(245,158,11,0.15);color:#d97706;border-color:#d97706;'
        };
        if (itemType && BADGE_STYLES[itemType]) {
            badgeEl.innerHTML = `<span style="font-weight:700;font-size:0.9rem;">${itemType}</span>`;
            badgeEl.style.cssText = `padding:8px 12px;border-radius:6px;border:1px solid;min-height:38px;display:flex;align-items:center;${BADGE_STYLES[itemType]}`;
        } else {
            badgeEl.innerHTML = '—';
            badgeEl.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);min-height:38px;display:flex;align-items:center;font-size:0.9rem;color:var(--text-muted);';
        }
    }

    function _normalizeProcessName(value) {
        return String(value || '').replace(/\s+/g, '').replace(/[‐‑–—]/g, '-');
    }

    function _isPaintProcess(value) {
        const process = _normalizeProcessName(value);
        return process === '도장' || process.startsWith('도장-') || process.startsWith('도장');
    }

    function _findProductForPlan(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.find(p =>
            p.partName === partName && p.carModel === carModel && (p.color === color || !color || !p.color)
        ) || products.find(p => p.partName === partName && p.carModel === carModel);
    }

    /* 라인별 컬러 결정 헬퍼
     * - 도장-A: product.paintColorA 있으면 사용, 없으면 product.color
     * - 도장-B: product.paintColorB 있으면 사용, 없으면 product.color
     * - 그 외:  product.color
     */
    function _getPlanColorForLine(product, line) {
        if (!product) return '';
        if (line === '도장-A' && product.paintColorA) return product.paintColorA;
        if (line === '도장-B' && product.paintColorB) return product.paintColorB;
        return product.color || '';
    }

    function _usesLaserWipForLine(product, line) {
        if (!product || !_isPaintProcess(product.process3)) return false;
        const process3 = _normalizeProcessName(product.process3);
        const lineName = _normalizeProcessName(line);
        return process3 === '도장' || process3 === lineName;
    }

    // ── 도료 재고 조회 헬퍼 ──────────────────────────────────────────
    // matId → 총 재고 수량 (입고 - 출고)
    function _paintMatBalance(matId) {
        const all = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];
        return all.filter(i => i.materialId === matId)
                  .reduce((s, i) => i.type === '출고' ? s - (Number(i.quantity)||0) : s + (Number(i.quantity)||0), 0);
    }

    function _paintMatName(matId) {
        const mats = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const m = mats.find(x => x.id === matId);
        return m ? m.name : matId;
    }

    function _getPaintRowsForProduct(carModel, partName, color, line) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        // 같은 차종+품명이 도장-A/도장-B 양쪽에 등록돼 있을 수 있어, 먼저 현재 라인의
        // 제조공정(process1~4)에 해당하는 제품만으로 좁힌 뒤 매칭한다. 그렇지 않으면
        // updateDropdowns의 lineProducts 필터(2187행)와 달리 반대 라인의 도료 레시피가
        // 그대로 섞여 보이거나(도료 현재고 패널), 재고 검사(_getPaintShortagesForPlan)가
        // 엉뚱한 라인 기준으로 막힐 수 있다.
        let lineProducts = products;
        if (line) {
            const inLine = products.filter(p =>
                p.process1 === line || p.process2 === line || p.process3 === line || p.process4 === line
            );
            if (inLine.length > 0) lineProducts = inLine;
        }
        const prod = lineProducts.find(p =>
            p.carModel === carModel && p.partName === partName && p.color === color
        ) || lineProducts.find(p =>
            p.carModel === carModel && p.partName === partName
        );
        const rows = (prod && prod.paintMaterials) ? prod.paintMaterials : [];
        if (!line) return rows;
        // 도료 행 하나하나에 도장-A/도장-B 전용 여부(processTag)가 붙어 있을 수 있다
        // (설정 > 제품 도료 편집기의 "공정" 열 — settings.js _resolvePaintProcessTag).
        // 반대 라인 전용 행은 이 라인 계획에 필요 없으므로 재고 표시·부족 검증에서 제외한다.
        // processTag가 비어 있는 과거 데이터 행은 라인 구분 없이 그대로 포함한다.
        return rows.filter(r => !r.processTag || r.processTag === line);
    }

    // 계획에 필요한 도료(주제/경화제/희석제) 중 재고가 바닥난(<=0) 항목의 표시명 목록 반환
    // ※ 개당(EA) 소요량 데이터가 없어 정확한 필요량 비교는 불가 — 재고 유무만 검사
    function _getPaintShortagesForPlan(carModel, partName, color, line) {
        const rows = _getPaintRowsForProduct(carModel, partName, color, line);
        const validRows = rows.filter(r => r.mainId || r.hardId || r.thinnerId);
        const shortages = [];
        const seen = {};
        validRows.forEach(r => {
            [['주제', r.mainId], ['경화제', r.hardId], ['희석제', r.thinnerId]].forEach(function(pair) {
                const label = pair[0], matId = pair[1];
                if (!matId || matId === '사용불필요' || seen[matId]) return;
                seen[matId] = true;
                if (_paintMatBalance(matId) <= 0) {
                    shortages.push(label + ' ' + _paintMatName(matId));
                }
            });
        });
        return shortages;
    }

    // overrideCarModel / overridePartName / overrideColor : 편집 모달 초기화 시 직접 전달
    function updatePaintStockPanel(overrideCarModel, overridePartName, overrideColor) {
        const panel  = document.getElementById('paintStockPanel');
        const lotsEl = document.getElementById('paintStockLots');
        if (!panel) return;

        const carModel = overrideCarModel || (document.getElementById('sModel') || {}).value || '';
        const partName = overridePartName || (document.getElementById('sPart')  || {}).value || '';
        const color    = overrideColor    || (document.getElementById('sColor') || {}).value || '';
        // 현재 모달의 라인 (도장-A / 도장-B)
        const currentLine = (document.getElementById('sLine') || {}).value || '';

        const rows = _getPaintRowsForProduct(carModel, partName, color, currentLine);
        const validRows = rows.filter(r => r.mainId || r.hardId || r.thinnerId);
        if (!validRows.length) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        if (!lotsEl) return;

        // spec 그룹별 표시: Primer / Color / 공용 각각 한 줄
        const specOrder = ['Primer', 'Color', '공용'];
        const grouped = {};
        validRows.forEach(r => {
            const spec = r.paintSpec || '공용';
            if (!grouped[spec]) grouped[spec] = [];
            grouped[spec].push(r);
        });

        function matCell(label, matId) {
            if (!matId) return `<td style="padding:2px 8px;font-size:0.76rem;color:var(--text-muted);">-</td>`;
            if (matId === '사용불필요') return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;color:var(--text-muted);font-style:italic;">
                        <span style="margin-right:3px;">${label}</span>사용불필요
                    </td>`;
            const qty = _paintMatBalance(matId);
            const name = _paintMatName(matId);
            const qtyColor = qty > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;cursor:pointer;border-radius:4px;"
                        onclick="PaintInventoryModule.showPaintDetail('${matId}',{asChild:true})"
                        onmouseover="this.style.background='rgba(99,102,241,0.1)'"
                        onmouseout="this.style.background=''"
                        title="클릭하여 LOT 정보 보기">
                        <span style="color:var(--text-muted);margin-right:3px;">${label}</span><span style="font-weight:600;">${name}</span>
                        <span style="font-weight:700;color:${qtyColor};margin-left:2px;">(${UIUtils.formatNumber(qty)})</span>
                    </td>`;
        }

        const specKeys = [...specOrder.filter(s => grouped[s]), ...Object.keys(grouped).filter(s => !specOrder.includes(s))];

        lotsEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.76rem;">` +
            specKeys.flatMap(spec => grouped[spec].map((r, idx) => `
                <tr style="border-top:1px solid var(--border-color);">
                    <td style="padding:3px 8px 3px 0;font-weight:700;color:var(--text-secondary);white-space:nowrap;vertical-align:middle;min-width:48px;">
                        ${idx === 0 ? spec : ''}
                    </td>
                    ${matCell('주제', r.mainId)}
                    ${matCell('경화제', r.hardId)}
                    ${matCell('희석제', r.thinnerId)}
                </tr>`
            )).join('') +
        `</table>`;
    }

    // ── 사출 재고 조회 헬퍼 ──────────────────────────────────────────
    // 생산계획 품명 → 사출자재 마스터 매칭 → injPartName 목록 반환
    // ★ v19: productId(ID 매칭) 우선, 없으면 mfgProductName/2 텍스트 Fallback
    function getInjPartNamesForPlan(planPartName, carModel, productId, planColor) {
        if (!planPartName && !productId) return [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const _planTrim = (planPartName || '').trim();
        const _normPlan = planColor ? _normalizeColorName(planColor) : '';
        // ★ de-dup 키: injPartName + injColor 조합 → 같은 품명의 다른 색상 자재를 모두 반환
        const seen = {};
        return materials.filter(m => {
            // ① ID 우선 매칭 (productId → m.productIds 배열 포함 여부)
            const idMatch = productId && m.productIds && m.productIds.includes(productId);
            // ② 텍스트 Fallback — 양측 .trim() 비교 (공백 차이 허용)
            const nameMatch = !idMatch && _planTrim && (
                (m.mfgProductName  || '').trim() === _planTrim ||
                (m.mfgProductName2 || '').trim() === _planTrim
            );
            // ③ 차종 필터
            const modelMatch = !carModel || m.carModel === carModel;
            // ④ 컬러 매칭: planColor 지정 시 injColor가 없거나 일치하는 자재만 허용
            //    injColor 없는 자재는 컬러 공통 자재로 간주 → 항상 허용
            let colorMatch = true;
            if (_normPlan && m.injColor) {
                const normInj = _normalizeColorName(m.injColor);
                colorMatch = normInj === _normPlan || normInj.includes(_normPlan) || _normPlan.includes(normInj);
            }
            // ★ de-dup: injPartName + injColor 조합으로 중복 제거
            const dedupKey = (m.injPartName || '') + '|' + _normalizeColorName(m.injColor || '');
            return (idMatch || nameMatch) && modelMatch && colorMatch
                && m.injPartName && !seen[dedupKey] && (seen[dedupKey] = true);
        });
    }

    // ── 색상명 정규화 — 사출 창고(UIUtils.normalizeColorAlias)와 동일 원천 사용 ──
    // "블랙"/"black"/"BK"/"블랙펄" 등 → 동일 대표값. 창고·생산계획 수량 불일치 재발 방지.
    function _normalizeColorName(c) {
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.normalizeColorAlias === 'function') {
            return UIUtils.normalizeColorAlias(c);
        }
        const s = (c || '').trim().toLowerCase().replace(/\s+/g, '');
        const MAP = {
            '블랙':'black','검정':'black','검은색':'black','흑':'black',
            '화이트':'white','흰색':'white','백색':'white','백':'white',
            '그레이':'gray','회색':'gray','그레':'gray',
            '실버':'silver','은색':'silver','은':'silver',
            '레드':'red','빨강':'red','빨간색':'red','적색':'red',
            '블루':'blue','파랑':'blue','파란색':'blue','청색':'blue',
            '그린':'green','초록':'green','녹색':'green',
            '옐로우':'yellow','노랑':'yellow','노란색':'yellow','황색':'yellow',
            '골드':'gold','금색':'gold','금':'gold',
            '오렌지':'orange','주황':'orange','주황색':'orange',
            '퍼플':'purple','보라':'purple','보라색':'purple',
            '브라운':'brown','갈색':'brown',
            '베이지':'beige','크림':'beige',
            'bk':'black','blk':'black',
            'wh':'white','wht':'white',
            'si':'silver','sil':'silver','sl':'silver',
            'gy':'gray','gry':'gray',
            'rd':'red',
            'bl':'blue','blu':'blue',
            'gn':'green','grn':'green',
            'yl':'yellow','yel':'yellow',
            'gd':'gold',
            'or':'orange','org':'orange',
            'vi':'purple','vio':'purple',
            'br':'brown','brn':'brown',
        };
        if (MAP[s] !== undefined) return MAP[s];
        const sortedKeys = Object.keys(MAP).sort((a, b) => b.length - a.length);
        for (const k of sortedKeys) {
            if (s.startsWith(k)) return MAP[k];
        }
        return s;
    }

    function _injColorsMatch(a, b) {
        const na = _normalizeColorName(a);
        const nb = _normalizeColorName(b);
        if (!na || !nb) return false;
        return na === nb || na.includes(nb) || nb.includes(na);
    }

    // 사출자재 마스터 목록 기준 창고 재고 집계
    // matList: [{injPartName, injColor, carModel}, ...] (getInjPartNamesForPlan 반환값)
    //
    // ★ 입·출고 모두 컬러 필터 적용 (사출 창고 _filterProductRecords 와 동일 원칙)
    //   - 컬러 없는 출고(레거시): 해당 품명 버킷에 포함 (창고와 동일)
    //   - 컬러 있는 출고: 자재 컬러와 일치할 때만 차감
    //   ※ 과거 버그: 출고를 컬러 무관 차감 → GRAY 재고에 WHITE 출고가 섞여 수량이 과소 표시됨
    function getInjStockLots(matList, planColor) {
        const all = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];

        // injPartName → 허용 컬러 Set (없으면 컬러 무관 허용)
        const matColorMap = {};
        // injPartName → 허용 차종 Set (없으면 차종 무관 허용)
        const matCarModelMap = {};
        matList.forEach(m => {
            if (!m.injPartName) return;
            if (!matColorMap[m.injPartName])    matColorMap[m.injPartName]    = new Set();
            if (!matCarModelMap[m.injPartName]) matCarModelMap[m.injPartName] = new Set();
            if (m.injColor) {
                m.injColor.split(/[,，\/·|、]/).map(c => _normalizeColorName(c)).filter(Boolean)
                    .forEach(c => matColorMap[m.injPartName].add(c));
            }
            if (m.carModel) {
                matCarModelMap[m.injPartName].add(m.carModel);
            }
        });

        const partNames = Object.keys(matColorMap);
        if (partNames.length === 0) return [];

        const seen = {};
        const result = [];

        matList.forEach(function(m) {
            if (!m.injPartName) return;
            const carModel = m.carModel || '';
            const partName = m.injPartName;
            const displayColor = m.injColor || '-';

            const records = all.filter(function(item) {
                if (item.partName !== partName) return false;

                const allowedCarModels = matCarModelMap[partName];
                if (allowedCarModels && allowedCarModels.size > 0 && item.carModel) {
                    if (!allowedCarModels.has(item.carModel)) return false;
                }
                if (carModel && item.carModel && item.carModel !== carModel) return false;

                const itemColorRaw = String(item.color || '').trim();
                const isOutgoing = (item.type === '출고');
                // 레거시 출고(컬러 미기록): 창고와 같이 품명 단위로 차감 허용
                if (isOutgoing && !itemColorRaw) return true;

                const allowedColors = matColorMap[partName];
                if (allowedColors && allowedColors.size > 0) {
                    const iColor = _normalizeColorName(itemColorRaw);
                    const match = [...allowedColors].some(function(c) {
                        return _injColorsMatch(iColor, c);
                    });
                    if (!match) return false;
                }
                return true;
            });

            const balance = InvCalc.lotBalances(records);
            balance.lots.forEach(function(l) {
                if (l.lotNo === InvCalc.UNMATCHED || l.qty <= 0) return;
                const dedupKey = partName + '|' + displayColor + '|' + l.lotNo;
                if (seen[dedupKey]) return;
                seen[dedupKey] = true;
                result.push({
                    partName: partName,
                    color: displayColor,
                    lotNo: l.lotNo,
                    balance: l.qty,
                    inDate: (l.date || '').split(' ')[0] || ''
                });
            });
        });

        return result.sort(function(a, b) {
            return a.partName.localeCompare(b.partName) ||
                (a.color || '').localeCompare(b.color || '') ||
                a.lotNo.localeCompare(b.lotNo);
        });
    }

    // 도장-A → 레이저 → 도장-B 처럼 레이저 공정 이후에 다시 도장(2차)을 타는 제품인지 판정
    // 이 경우 도장-B 계획은 사출 재고가 아니라 레이저 재공품(WIP)에서 소진되는 것이므로
    // 사출 재고 예약 집계에서 제외해야 한다.
    function _isPostLaserRepaintPlan(p, allProducts) {
        if (!p || p.line !== '도장-B') return false;
        const prod = p.productId
            ? allProducts.find(pr => pr.id === p.productId)
            : allProducts.find(pr => pr.partName === p.partName && (!p.carModel || pr.carModel === p.carModel));
        if (!prod) return false;
        const procs = [prod.process1, prod.process2, prod.process3, prod.process4].filter(Boolean);
        const bIdx = procs.indexOf('도장-B');
        if (bIdx <= 0) return false;
        return procs.slice(0, bIdx).some(v => v === '레이저' || v === '레이져');
    }

    // 창고 '생산출고'가 이미 나간 만큼 예약을 차감한다.
    // (도장 실적 자동 차감 폐지 이후: 물류 출고 → 도장 실적 순인데, 출고만 되면 예약이 남는 문제 방지)
    // refWorkId 가 있는 출고는 도장 실적 연동분이므로 여기서 다시 빼지 않는다.
    function _consumeReserveByWarehouseOut(injPartName, carModel, injColor, pendingPlans, inProgressPlans) {
        const _injPN = (injPartName || '').trim();
        const _targetColor = injColor ? _normalizeColorName(injColor) : '';
        const plans = []
            .concat((pendingPlans || []).map(function(p) {
                return Object.assign({}, p, { remain: Number(p.planQty) || 0, bucket: 'pending' });
            }))
            .concat((inProgressPlans || []).map(function(p) {
                return Object.assign({}, p, { remain: Number(p.planQty) || 0, bucket: 'inProgress' });
            }))
            .sort(function(a, b) {
                return String(a.date || '').localeCompare(String(b.date || '')) ||
                    String(a.id || '').localeCompare(String(b.id || ''));
            });

        if (!plans.length || !_injPN) {
            return {
                pending: 0,
                inProgress: 0,
                pendingPlans: pendingPlans || [],
                inProgressPlans: inProgressPlans || []
            };
        }

        function _outColorOk(outColor) {
            if (!_targetColor) return true;
            if (!outColor) return true;
            const oc = _normalizeColorName(outColor);
            if (!oc) return true;
            return oc === _targetColor || oc.indexOf(_targetColor) >= 0 || _targetColor.indexOf(oc) >= 0
                || ( _targetColor === 'black' && (oc === 'bk' || oc.indexOf('black') >= 0) )
                || ( oc === 'black' && (_targetColor === 'bk' || _targetColor.indexOf('black') >= 0) );
        }

        const injOuts = (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).filter(function(r) {
            if (!r || r.type !== '출고') return false;
            if ((r.partName || '').trim() !== _injPN) return false;
            if (carModel && r.carModel && r.carModel !== carModel) return false;
            if (!_outColorOk(r.color)) return false;
            if (r.refWorkId) return false; // 도장 실적 연동 출고 — 예약은 실적(plan 완료)로 이미 해제
            const oType = String(r.outgoingType || '').trim();
            const src = String(r.source || '').trim();
            return oType === '생산출고' || /도장\s*작업/.test(src) || src === '도장 입고';
        }).map(function(r) { return { date: r.date, createdAt: r.createdAt, id: r.id, planId: r.planId, quantity: Number(r.quantity) || 0 }; });

        // IL 등 리워크 투입품은 사출창고가 아니라 리워크 재공품 → 도장현장 출고로 공급된다
        // (REWORK_WIP, source: 'dispatch_to_line'). 이 소진을 반영하지 않으면 재공품에서 이미
        // 실제로 출고·사용한 만큼도 "아직 사출창고에서 안 받은 예약 수량"으로 계속 잡혀,
        // 현장 입고 부족 목록에서 리워크로 이미 해결된 부족까지 남아 있는 것처럼 보인다.
        const reworkOuts = (DB.STORES.REWORK_WIP ? (Storage.getAll(DB.STORES.REWORK_WIP) || []) : []).filter(function(r) {
            if (!r || r.type !== '출고') return false;
            if (String(r.source || '').trim() !== 'dispatch_to_line') return false;
            if ((r.partName || '').trim() !== _injPN) return false;
            if (carModel && r.carModel && r.carModel !== carModel) return false;
            if (!_outColorOk(r.color)) return false;
            return true;
        }).map(function(r) { return { date: r.date, createdAt: r.createdAt, id: r.id, planId: '', quantity: Number(r.qty) || 0 }; });

        const outs = injOuts.concat(reworkOuts).sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || '')) ||
                String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || ''));
        });

        outs.forEach(function(out) {
            let qty = Number(out.quantity) || 0;
            if (qty <= 0) return;
            const outDay = String(out.date || '').slice(0, 10);
            const planId = String(out.planId || '').trim();

            if (planId) {
                const hit = plans.find(function(p) { return String(p.id) === planId && p.remain > 0; });
                if (hit) {
                    const use = Math.min(hit.remain, qty);
                    hit.remain -= use;
                    qty -= use;
                }
            }
            for (let i = 0; i < plans.length && qty > 0; i++) {
                const p = plans[i];
                if (p.remain <= 0) continue;
                const planDay = String(p.date || '').slice(0, 10);
                if (planDay && outDay && outDay < planDay) continue;
                const use = Math.min(p.remain, qty);
                p.remain -= use;
                qty -= use;
            }
        });

        const nextPending = plans.filter(function(p) { return p.bucket === 'pending' && p.remain > 0; })
            .map(function(p) { return Object.assign({}, p, { planQty: p.remain }); });
        const nextProgress = plans.filter(function(p) { return p.bucket === 'inProgress' && p.remain > 0; })
            .map(function(p) { return Object.assign({}, p, { planQty: p.remain }); });

        return {
            pending: nextPending.reduce(function(s, p) { return s + (Number(p.planQty) || 0); }, 0),
            inProgress: nextProgress.reduce(function(s, p) { return s + (Number(p.planQty) || 0); }, 0),
            pendingPlans: nextPending,
            inProgressPlans: nextProgress
        };
    }

    // 사출 자재명(injPartName) 기준으로 생산계획 예약 수량 집계
    // - 대기/진행: 예약으로 계산
    // - 완료: 도장 작업실적이 없으면 아직 재고가 차감되지 않은 것이므로 예약으로 포함
    // - 창고 생산출고(도장 실적 미연동) 분은 예약에서 차감
    // 반환: { pending(대기+미실적완료), inProgress(진행) }
    function _calcInjPlanReserved(injPartName, excludePlanId, carModel, injColor, includeCurrentForm = true) {
        const injMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        // injPartName → 이 자재가 쓰이는 제품명(partName) 및 허용 컬러 역방향 조회
        const planPartNames = new Set();
        const planColors    = new Set(); // injColor 기반 허용 컬러 목록

        // ── .trim() 정규화 + carModel 필터 (차종별 재고 분리) ────────
        const _injPN = (injPartName || '').trim();

        // ── 창고 아이템 컬러 정규화 (색상별 자재 구분용) ─────────────
        const _targetColor = injColor ? _normalizeColorName(injColor) : '';

        // 자재 컬러와 창고 아이템 컬러 일치 여부 판단
        // - _targetColor 없으면 전체 포함
        // - 자재에 injColor 없으면 컬러 불문 포함 (공통 자재)
        const _matColorMatches = (matColor) => {
            if (!_targetColor) return true;
            if (!matColor) return true;
            const cols = matColor.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean);
            return cols.some(c => c === _targetColor || c.includes(_targetColor) || _targetColor.includes(c));
        };

        // ── 진단: 매칭된 자재 목록 (컬러 포함) ──────────────────────
        const _matchedMats = injMats.filter(m =>
            (m.injPartName || '').trim() === _injPN &&
            (!carModel || !m.carModel || m.carModel === carModel) &&
            _matColorMatches(m.injColor));   // ★ 컬러 필터 추가

        // v19: productIds로 products.partName 역참조 + 기존 텍스트 Fallback 병행
        const _allProducts = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _productIdSet = new Set(); // 이 injPartName과 연결된 productId 집합

        // ★ injMats 전체 순회 → _matchedMats 기반으로 변경 (컬러별 분리 핵심)
        _matchedMats.forEach(m => {
            // ① ID 기반: productIds → products.partName 역참조
            if (m.productIds && m.productIds.length > 0) {
                m.productIds.forEach(pid => {
                    _productIdSet.add(pid);
                    const prod = _allProducts.find(p => p.id === pid);
                    if (prod && prod.partName) planPartNames.add(prod.partName.trim());
                });
            }
            // ② 텍스트 Fallback (ID 미설정 시 또는 보완용)
            if (m.mfgProductName)  planPartNames.add(m.mfgProductName.trim());
            if (m.mfgProductName2) planPartNames.add(m.mfgProductName2.trim());
        });

        // ★ 컬러 필터 활성화 조건:
        //   동일 injPartName 자재가 서로 다른 injColor를 가진 경우에만 활성화
        //   → 컬러 변형이 1개뿐이면 도장 컬러와 사출 컬러를 비교하지 않음
        const _distinctInjColors = new Set(
            _matchedMats.map(m => _normalizeColorName(m.injColor || '')).filter(Boolean)
        );
        if (_distinctInjColors.size > 1) {
            // 컬러가 여러 종류 → 컬러별 자재 구분 필요 → planColors에 추가
            _matchedMats.forEach(m => {
                if (m.injColor) {
                    m.injColor.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean)
                        .forEach(c => planColors.add(c));
                }
            });
        }
        // _distinctInjColors.size <= 1 이면 planColors는 비어있음 → 컬러 필터 전체 무시

        if (planPartNames.size === 0) {
            if (_matchedMats.length === 0) {
                console.warn(`[예약집계] "${injPartName}" → 사출자재 마스터에 일치하는 항목 없음`
                    + ` (전체 자재 ${injMats.length}건)`);
            } else {
                console.warn(`[예약집계] "${injPartName}" → 자재 ${_matchedMats.length}건 매칭됐으나`
                    + ` 제작품목1/2 모두 비어있음 — 설정 > 사출자재에서 제작품목 입력 필요`,
                    _matchedMats.map(m => ({ injPartName: m.injPartName, mfgProductName: m.mfgProductName, mfgProductName2: m.mfgProductName2 })));
            }
            return { pending: 0, inProgress: 0 };
        }

        // 도장 작업실적에 planId가 있는 계획 ID 집합 (실제 작업 완료된 것)
        const workedPlanIds = new Set(
            (Storage.getAll(DB.STORES.PAINTING_WORK) || [])
                .map(w => w.planId).filter(Boolean)
        );

        // 컬러 일치 판단 헬퍼 (한국어↔영어 정규화 포함)
        function _colorMatches(planColor) {
            if (planColors.size === 0) return true; // 자재에 컬러 미지정 → 모든 컬러 허용
            if (!planColor) return true;             // 계획에 컬러 없으면 허용
            // ★ 색상으로 인식되지 않는 값(제품 라인 코드: 6PS, AZ3, 1PH 등)은
            //   색상 필터를 적용하지 않음 → 색상 불문 예약으로 계상
            const _KNOWN_COLORS = [
                'black','white','gray','grey','silver','red','blue','green',
                'yellow','gold','orange','purple','brown','beige','chrome','crom','clear',
                '블랙','화이트','그레이','실버','레드','블루','그린','옐로우',
                '골드','오렌지','퍼플','브라운','베이지','크롬','투명','흰','검정','검은','청'
            ];
            const pLow = (planColor || '').trim().toLowerCase().replace(/\s+/g, '');
            const isRealColor = _KNOWN_COLORS.some(k => pLow === k || pLow.startsWith(k));
            if (!isRealColor) return true; // 색상이 아닌 값(제품 코드 등) → 필터 무시
            const pc = _normalizeColorName(planColor);
            // planColors는 이미 injColor 파싱 시 _normalizeColorName 처리됨
            return [...planColors].some(c => pc === c || pc.includes(c) || c.includes(pc));
        }

        // 수정으로 대체된 구 계획은 예약 수량에서 제외 (_dedupePlanDocs 주석 참조)
        const allPlans = _dedupePlanDocs(Storage.getAll(STORE) || []);

        // ── 진단: 품목명이 일치하는 계획 목록 ───────────────────────
        // ★ .trim() — planPartNames에는 이미 trim된 값이 들어있으므로 p.partName도 trim 비교
        const _partMatchedPlans = allPlans.filter(p => planPartNames.has((p.partName || '').trim()));
        const _colorBlockedPlans = _partMatchedPlans.filter(p => {
            const byId = p.productId && _productIdSet.has(p.productId);
            return !byId && !_colorMatches(p.color);  // ID 매칭은 컬러 필터 제외
        });
        const _passedColorPlans  = _partMatchedPlans.filter(p => {
            const byId = p.productId && _productIdSet.has(p.productId);
            return byId || _colorMatches(p.color);
        });
        const _statusBlockedPlans = _passedColorPlans.filter(p =>
            p.status !== '대기' && p.status !== '진행' &&
            !(p.status === '완료' && !workedPlanIds.has(p.id)));

        if (_partMatchedPlans.length === 0) {
            // ★ console.warn → console.debug 로 변경
            //   "0건" 은 코드 오류가 아니라 해당 제품의 생산계획이 아직 등록되지 않은 정상 상태
            //   실제 데이터 문제(색상 불일치 등)는 아래 else 블록의 console.warn 으로만 표시
            console.debug(`[예약집계] "${injPartName}" → 생산계획 없음`
                + ` (제작품목: ${[...planPartNames].join(', ')})`);
        } else {
            if (_colorBlockedPlans.length > 0) {
                console.warn(`[예약집계] "${injPartName}" → 품목 일치 ${_partMatchedPlans.length}건 중`
                    + ` 컬러 불일치로 ${_colorBlockedPlans.length}건 제외`
                    + ` (허용 컬러: [${[...planColors].join(', ')}])\n`
                    + `  ※ 컬러 불일치 계획: ` + _colorBlockedPlans.map(p => `"${p.partName}" color="${p.color}"`).join(', '));
            }
            if (_statusBlockedPlans.length > 0) {
                console.info(`[예약집계] "${injPartName}" → 상태값으로 ${_statusBlockedPlans.length}건 제외`
                    + ` (완료+작업실적 있음): ` + _statusBlockedPlans.map(p => `"${p.status}"`).join(', '));
            }
        }

        const pendingPlans = [];
        const inProgressPlans = [];

        allPlans.forEach(p => {
            if (excludePlanId && p.id === excludePlanId) return;
            // ★ v19: ID 매칭 우선, 없으면 텍스트 매칭 Fallback
            const matchById   = p.productId && _productIdSet.has(p.productId);
            const matchByName = !matchById && planPartNames.has((p.partName || '').trim());
            if (!matchById && !matchByName) return;
            // ★ 컬러 필터: ID 매칭 시 건너뜀 (도장 컬러 ≠ 사출 컬러, 다른 색상 체계)
            //              이름 매칭 시에만 적용 (같은 품명·다른 사출 컬러 자재 구분용)
            if (!matchById && !_colorMatches(p.color)) return;
            // ★ 도장-A → 레이저 → 도장-B 제품의 도장-B 계획은 레이저 재공품에서 소진되므로 제외
            if (_isPostLaserRepaintPlan(p, _allProducts)) return;
            const qty = Number(p.planQty) || 0;
            const info = {
                id: p.id,
                date: p.date || '',
                partName: p.partName || '',
                color: p.color || '',
                planQty: qty,
                status: p.status || '',
                line: p.line || ''
            };
            if (p.status === '대기')  { pendingPlans.push(info); return; }
            if (p.status === '진행') { inProgressPlans.push(info); return; }
            // 완료 계획이지만 도장 작업실적이 없으면 → 미입력 실적 (예약 상세·도장 실적입력과 동일)
            if (p.status === '완료' && !workedPlanIds.has(p.id)) {
                inProgressPlans.push(Object.assign({}, info, { status: '완료(미실적)' }));
            }
        });
        // 현재 생산계획 등록 모달이 실제로 열려있는 경우에만 폼 입력 수량을 예약으로 포함
        // ★ 모달이 닫혀있어도 DOM에 폼 요소가 남아 있어 오탐(팬텀 예약)이 발생할 수 있으므로
        //    반드시 모달 active 상태를 확인 후 폼 값을 읽는다
        const _modalActive = document.getElementById('modal')?.classList.contains('active');
        if (_modalActive && includeCurrentForm) {
            const formPart  = (document.getElementById('sPart')  || {}).value || '';
            const formColor = (document.getElementById('sColor') || {}).value || '';
            const formQty   = Number((document.getElementById('sQty') || {}).value) || 0;
            // 폼 컬러가 명시적으로 선택된 경우에만, 이 자재의 컬러와 일치할 때 포함
            if (planPartNames.has(formPart) && formQty > 0 && formColor && _colorMatches(formColor)) {
                pendingPlans.push({
                    id: '__form__',
                    date: UIUtils.today ? UIUtils.today() : '',
                    partName: formPart,
                    color: formColor,
                    planQty: formQty,
                    status: '대기(작성중)',
                    line: ''
                });
            }
        }

        const consumed = _consumeReserveByWarehouseOut(_injPN, carModel, injColor, pendingPlans, inProgressPlans);
        const pending = consumed.pending;
        const inProgress = consumed.inProgress;

        console.log(`[예약집계] "${injPartName}"${_targetColor ? ` [${_targetColor}]` : ''}`
            + ` → pending=${pending}, inProgress=${inProgress}`
            + ` (제작품목: ${[...planPartNames].join(', ')}, 컬러: ${[...planColors].join(', ') || '전체'})`);
        return { pending, inProgress };
    }

    // 모달 내 사출 재고 패널 갱신 — 창고 + 현장(라인) 수량
    // overridePartName / overrideCarModel : 편집 모달 초기화 시 DOM 값 대신 직접 전달

    /** 도장 라인 현장 자재 수량 (입고 잔량 + 미입고 출고)
     *  matchedMats: getInjPartNamesForPlan 결과
     *  — 미입고는 도장 자재 목록과 동일하게 "해당일 창고→라인 출고"만 집계 (과거 미연결 출고 과다합산 방지)
     */
    function _getSiteInjStockForPlan(line, matchedMats, carModel) {
        const empty = { total: 0, received: 0, pending: 0, rows: [], line: '' };
        const want = (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.normLine)
            ? PaintingInputModule.normLine(line)
            : (String(line || '').indexOf('B') >= 0 ? '도장-B' : '도장-A');
        const nameSet = {};
        (matchedMats || []).forEach(function (m) {
            const n = String((m && m.injPartName) || '').trim();
            if (n) nameSet[n] = true;
        });
        const names = Object.keys(nameSet);
        if (!names.length) return Object.assign({}, empty, { line: want });

        const byPart = {};
        names.forEach(function (n) {
            byPart[n] = { partName: n, received: 0, pending: 0 };
        });

        // ① 현장 입고 잔량 (painting_input_inventory — 실잔량)
        names.forEach(function (injName) {
            let qty = 0;
            if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.getLotsByInjPart) {
                (PaintingInputModule.getLotsByInjPart(want, injName, null) || []).forEach(function (l) {
                    if (carModel && l.carModel && l.carModel !== carModel) return;
                    qty += Number(l.balance) || 0;
                });
            } else if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.groupStock) {
                (PaintingInputModule.groupStock(want) || []).forEach(function (g) {
                    if (String(g.partName || '') !== injName) return;
                    if (carModel && g.carModel && g.carModel !== carModel) return;
                    qty += Number(g.stock) || 0;
                });
            }
            byPart[injName].received += qty;
        });

        // ② 미입고: 도장 자재 목록과 동일 소스 (해당일 생산출고 · 미입고만)
        //    과거 전체 출고를 합산하면 refOutId 없는 이력까지 잡혀 수량이 부풀려짐
        const day = ((document.getElementById('planDateFilter') || {}).value
            || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        let dayShipments = [];
        if (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.listTodayWarehouseShipments) {
            dayShipments = PaintingInputModule.listTodayWarehouseShipments(want, day) || [];
        } else {
            const receivedOutIds = {};
            const piStore = DB.STORES.PAINTING_INPUT_INVENTORY;
            if (piStore) {
                (Storage.getAll(piStore) || []).forEach(function (r) {
                    if (String(r.type || '') !== '입고') return;
                    const oid = String(r.refOutId || '').trim();
                    if (oid) receivedOutIds[oid] = true;
                });
            }
            dayShipments = (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).filter(function (r) {
                if (String(r.type || '') !== '출고') return false;
                const oType = String(r.outgoingType || '');
                const src = String(r.source || '');
                if (oType !== '생산출고' && src !== '사출 창고 생산출고') return false;
                const outLine = (typeof PaintingInputModule !== 'undefined' && PaintingInputModule.normLine)
                    ? PaintingInputModule.normLine(r.paintLine || r.line)
                    : String(r.paintLine || r.line || '');
                if (outLine !== want) return false;
                if (String(r.date || '').slice(0, 10) !== day) return false;
                return !receivedOutIds[String(r.id || '')];
            }).map(function (r) {
                return Object.assign({}, r, { received: false });
            });
        }

        dayShipments.forEach(function (r) {
            if (r.received) return; // 입고완료 건은 ① 잔량에 포함
            const pName = String(r.partName || '').trim();
            if (!nameSet[pName]) return;
            if (carModel && r.carModel && r.carModel !== carModel) return;
            if (!byPart[pName]) byPart[pName] = { partName: pName, received: 0, pending: 0 };
            byPart[pName].pending += Number(r.quantity) || 0;
        });

        let received = 0, pending = 0;
        const rows = Object.values(byPart).filter(function (row) {
            return (row.received + row.pending) > 0;
        }).map(function (row) {
            received += row.received;
            pending += row.pending;
            return {
                partName: row.partName,
                received: row.received,
                pending: row.pending,
                total: row.received + row.pending
            };
        });

        return {
            line: want,
            received: received,
            pending: pending,
            total: received + pending,
            rows: rows
        };
    }

    function _getInjectionAvailableForPlan(partName, carModel, color, productId, excludePlanId, line) {
        if (!partName) return { available: 0, total: 0, warehouse: 0, site: 0, matched: [], lots: [] };
        let matched = getInjPartNamesForPlan(partName, carModel, productId, color);
        if (matched.length === 0 && carModel) matched = getInjPartNamesForPlan(partName, '', productId, color);
        if (matched.length === 0) matched = getInjPartNamesForPlan(partName, carModel, productId);
        if (matched.length === 0 && carModel) matched = getInjPartNamesForPlan(partName, '', productId);

        const lots = getInjStockLots(matched, color);
        const grouped = {};
        lots.forEach(l => {
            const key = `${l.partName}||${l.color || ''}`;
            if (!grouped[key]) grouped[key] = { partName: l.partName, color: l.color, balance: 0 };
            grouped[key].balance += Number(l.balance) || 0;
        });

        let warehouse = 0;
        let reservedSum = 0;
        const seenReserve = {};
        Object.values(grouped).forEach(g => {
            const rk = `${g.partName}||${g.color || ''}`;
            const reserved = _calcInjPlanReserved(g.partName, excludePlanId, carModel, g.color, false);
            warehouse += g.balance;
            if (!seenReserve[rk]) {
                seenReserve[rk] = true;
                reservedSum += reserved.pending + reserved.inProgress;
            }
        });
        // 창고 행이 없어도 예약은 자재명 기준으로 남을 수 있음 → matched 자재로 보완
        if (Object.keys(grouped).length === 0) {
            matched.forEach(function (m) {
                if (!m.injPartName) return;
                const rk = `${m.injPartName}||${m.injColor || ''}`;
                if (seenReserve[rk]) return;
                seenReserve[rk] = true;
                const reserved = _calcInjPlanReserved(m.injPartName, excludePlanId, carModel, m.injColor || '', false);
                reservedSum += reserved.pending + reserved.inProgress;
            });
        }

        const site = _getSiteInjStockForPlan(line || '', matched, carModel);
        const total = warehouse + site.total;
        const available = total - reservedSum;
        return {
            available: Math.max(0, available),
            total: total,
            warehouse: warehouse,
            site: site.total,
            siteDetail: site,
            reserved: reservedSum,
            matched: matched,
            lots: lots
        };
    }

    function updateInjStockPanel(overridePartName, overrideCarModel) {
        const panel   = document.getElementById('injStockPanel');
        const totalEl = document.getElementById('injStockTotal');
        const lotsEl  = document.getElementById('injStockLots');
        if (!panel) return;

        const partName       = overridePartName  || (document.getElementById('sPart')  || {}).value || '';
        const carModel       = overrideCarModel  || (document.getElementById('sModel') || {}).value || '';
        const lineName       = (document.getElementById('sLine') || {}).value || '';
        const currentPlanId  = panel.getAttribute('data-current-plan-id') || '';

        // v19: 현재 선택된 품명+차종+컬러 → productId 조회
        const colorVal  = (document.getElementById('sColor') || {}).value || '';
        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _matchProd = _products.find(p =>
            p.partName === partName && p.carModel === carModel && (p.color === colorVal || !colorVal || !p.color)
        ) || _products.find(p => p.partName === partName && p.carModel === carModel);
        const productId = _matchProd ? _matchProd.id : '';

        if (_usesLaserWipForLine(_matchProd, lineName)) {
            panel.style.display = 'none';
            if (totalEl) totalEl.textContent = '-';
            if (lotsEl)  lotsEl.innerHTML = '';
            return;
        }

        if (!partName) {
            panel.style.display = 'none';
            if (totalEl) totalEl.textContent = '-';
            if (lotsEl)  lotsEl.innerHTML = '';
            return;
        }

        let matched = getInjPartNamesForPlan(partName, carModel, productId, colorVal);
        if (matched.length === 0 && carModel) matched = getInjPartNamesForPlan(partName, '', productId, colorVal);
        // 색상 지정 후에도 매칭 없으면 색상 무관으로 재시도 (사출자재 색상 미설정 시 폴백)
        if (matched.length === 0) matched = getInjPartNamesForPlan(partName, carModel, productId);
        if (matched.length === 0 && carModel) matched = getInjPartNamesForPlan(partName, '', productId);

        const lots  = getInjStockLots(matched, colorVal);
        const warehouseTotal = lots.reduce((s, l) => s + l.balance, 0);
        const site = _getSiteInjStockForPlan(lineName, matched, carModel);
        const combinedTotal = warehouseTotal + site.total;

        panel.style.display = 'block';

        // 자재명+컬러 기준 집계 (LOT 합산)
        const grouped = {};
        lots.forEach(l => {
            const key = `${l.partName}||${l.color || ''}`;
            if (!grouped[key]) grouped[key] = { partName: l.partName, color: l.color, balance: 0 };
            grouped[key].balance += l.balance;
        });

        // 전체 가용수량 = (창고 + 현장) - 대기예약 - 진행중
        let totalPending = 0, totalInProgress = 0;
        const reserveMap = {};
        const reserveKeys = Object.keys(grouped).length
            ? Object.values(grouped)
            : matched.map(function (m) { return { partName: m.injPartName, color: m.injColor || '' }; });
        const seenReserve = {};
        reserveKeys.forEach(g => {
            if (!g.partName) return;
            const rk = `${g.partName}||${g.color || ''}`;
            if (seenReserve[rk]) return;
            seenReserve[rk] = true;
            const r = _calcInjPlanReserved(g.partName, currentPlanId, carModel, g.color);
            reserveMap[rk] = r;
            totalPending    += r.pending;
            totalInProgress += r.inProgress;
        });

        const totalReserved  = totalPending + totalInProgress;
        const totalAvailable = combinedTotal - totalReserved;
        const siteLineLabel = site.line || lineName || '현장';

        // 가용 재고는 예약 여부와 무관하게 항상 표시
        totalEl.innerHTML = `합계 <strong>${UIUtils.formatNumber(combinedTotal)}</strong> EA`
            + (totalReserved > 0
                ? ` <span style="font-size:0.72rem;color:var(--accent-red);">예약 -${UIUtils.formatNumber(totalReserved)}</span>`
                : '')
            + ` <span style="font-size:0.75rem;color:var(--text-muted);">→ 가용 <strong style="color:${totalAvailable > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(totalAvailable)}</strong> EA</span>`;
        totalEl.style.color = combinedTotal > 0 ? 'var(--accent-blue)' : 'var(--accent-red)';

        const titleEl = panel.querySelector('[data-inj-stock-title]');
        if (titleEl) {
            titleEl.textContent = '사출 자재 재고 (창고 + 현장)';
        }

        const whRows = Object.values(grouped).map(g => {
            const encPart  = encodeURIComponent(g.partName);
            const encColor = encodeURIComponent(g.color || '');
            const encModel = encodeURIComponent(carModel || '');
            const r = reserveMap[`${g.partName}||${g.color || ''}`] || { pending: 0, inProgress: 0 };
            const reservedAmt = r.pending + r.inProgress;

            let reserveBadge = '';
            if (r.inProgress > 0) {
                reserveBadge = `<span style="font-size:0.7rem;background:rgba(234,88,12,0.12);color:#ea580c;
                    border:1px solid rgba(234,88,12,0.3);border-radius:4px;padding:0 5px;margin-left:5px;white-space:nowrap;">
                    사용중 -${UIUtils.formatNumber(r.inProgress)}</span>`;
            } else if (r.pending > 0) {
                reserveBadge = `<span style="font-size:0.7rem;background:rgba(234,179,8,0.12);color:#ca8a04;
                    border:1px solid rgba(234,179,8,0.3);border-radius:4px;padding:0 5px;margin-left:5px;white-space:nowrap;">
                    예약 -${UIUtils.formatNumber(r.pending)}</span>`;
            }

            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;
                        border-bottom:1px solid var(--border-color);font-size:0.78rem;
                        cursor:pointer;border-radius:4px;"
                        onclick="ProductionPlanModule._showInjLotPopup('${encPart}','${encColor}','${encModel}')"
                        onmouseover="this.style.background='rgba(66,133,244,0.1)'"
                        onmouseout="this.style.background=''"
                        title="클릭하여 LOT 정보 보기">
                <span style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">
                    <strong>${g.partName}</strong>
                    <span style="color:var(--text-muted);margin-left:4px;">${g.color || '-'}</span>
                    ${reserveBadge}
                    <span style="font-size:0.7rem;color:var(--accent-blue);margin-left:4px;">🔍</span>
                </span>
                <span style="white-space:nowrap;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(g.balance)} EA</span>
            </div>`;
        }).join('');

        const siteRows = (site.rows || []).map(function (row) {
            const detail = [];
            if (row.received > 0) detail.push('입고 ' + UIUtils.formatNumber(row.received));
            if (row.pending > 0) detail.push('미입고 ' + UIUtils.formatNumber(row.pending));
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;
                        border-bottom:1px solid var(--border-color);font-size:0.78rem;">
                <span><strong>${row.partName}</strong>
                    <span style="color:var(--text-muted);margin-left:6px;font-size:0.7rem;">${detail.join(' · ') || '-'}</span>
                </span>
                <span style="white-space:nowrap;font-weight:700;color:#0f766e;">${UIUtils.formatNumber(row.total)} EA</span>
            </div>`;
        }).join('');

        if (warehouseTotal <= 0 && site.total <= 0) {
            lotsEl.innerHTML = `<div style="text-align:center;padding:6px 0;color:var(--text-muted);">창고·현장 재고 없음</div>`;
            return;
        }

        lotsEl.innerHTML =
            `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:0.78rem;">
                <span style="padding:3px 8px;border-radius:6px;background:rgba(37,99,235,0.08);color:#1d4ed8;font-weight:700;">
                    창고 ${UIUtils.formatNumber(warehouseTotal)} EA
                </span>
                <span style="padding:3px 8px;border-radius:6px;background:rgba(15,118,110,0.10);color:#0f766e;font-weight:700;">
                    현장(${siteLineLabel}) ${UIUtils.formatNumber(site.total)} EA
                    ${site.pending > 0 ? `<span style="font-weight:600;font-size:0.7rem;opacity:0.85;"> · 미입고 ${UIUtils.formatNumber(site.pending)}</span>` : ''}
                </span>
            </div>`
            + `<div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin:2px 0 4px;">창고 현재고</div>`
            + (whRows || `<div style="padding:4px 6px;color:var(--text-muted);font-size:0.75rem;">창고 재고 없음</div>`)
            + `<div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin:8px 0 4px;">현장 자재 (${siteLineLabel})</div>`
            + (siteRows || `<div style="padding:4px 6px;color:var(--text-muted);font-size:0.75rem;">현장 자재 없음 (미입고·입고 잔량)</div>`)
            + `<div style="margin-top:6px;font-size:0.72rem;color:var(--text-muted);line-height:1.4;">
                ※ 계획 수립이 늦어 자재가 먼저 현장에 올라간 경우, <strong>창고 + 현장</strong> 합계로 가용 수량을 판단합니다.
               </div>`;
    }

    function _buildLaserWipLotsHtml(carModel, partName, colorVal, lineName, wip) {
        const wipColor = wip > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const lots = (typeof LaserWipModule !== 'undefined' && LaserWipModule.getWipLotDetail)
            ? (LaserWipModule.getWipLotDetail(carModel, partName, colorVal) || [])
            : [];
        const header = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 6px;border-radius:4px;">
            <span style="font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">bolt</span>
                레이져 완료 → ${lineName || '도장'} 대기
            </span>
            <span style="font-weight:700;color:${wipColor};font-size:0.95rem;">${UIUtils.formatNumber(wip)} EA</span>
        </div>`;
        if (wip <= 0) {
            return header + `<div style="text-align:center;padding:4px 0;font-size:0.78rem;color:var(--accent-red);">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span>
                재공품 재고 없음 — 레이져 공정 완료 후 진행 가능
            </div>`;
        }
        if (!lots.length) {
            return header + `<div style="padding:4px 6px;font-size:0.75rem;color:var(--text-muted);">LOT 미지정 잔량 포함</div>`;
        }
        const lotRows = lots.map(function(l) {
            const keyEnc = encodeURIComponent(`${l.carModel || carModel || ''}||${l.partName || partName || ''}||${l.color || colorVal || ''}`);
            const paint = (l.paintLot && l.paintLot !== '-') ? l.paintLot : '미지정';
            const inj = (l.lotNo && l.lotNo !== '-') ? l.lotNo : '-';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-bottom:1px solid var(--border-color);font-size:0.78rem;cursor:pointer;border-radius:4px;"
                onclick="typeof LaserWipModule!=='undefined'&&LaserWipModule.showWipDetail('${keyEnc}',event)"
                onmouseover="this.style.background='rgba(139,92,246,0.08)'"
                onmouseout="this.style.background=''"
                title="클릭하여 재공 LOT 이력 보기">
                <span style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    <span style="font-family:monospace;color:var(--accent-green);">도장 ${paint}</span>
                    <span style="color:var(--text-muted);">/</span>
                    <span style="font-family:monospace;color:var(--text-secondary);">사출 ${inj}</span>
                    ${l.color ? `<span style="font-size:0.7rem;color:var(--text-muted);">${l.color}</span>` : ''}
                </span>
                <span style="font-weight:700;color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(l.balance)} EA</span>
            </div>`;
        }).join('');
        return header
            + `<div style="margin-top:4px;padding:0 2px 2px;font-size:0.72rem;color:var(--text-muted);">도장 LOT / 사출 LOT 구분</div>`
            + lotRows;
    }

    // 레이져 후 재공품 재고 패널 갱신 (제조공정-3이 도장인 품목만)
    function updateLaserWipPanel(overridePartName, overrideCarModel) {
        const panel = document.getElementById('laserWipPanel');
        if (!panel) return; // 다른 라인에서는 패널 자체가 없음

        const partName  = overridePartName  || (document.getElementById('sPart')  || {}).value || '';
        const carModel  = overrideCarModel  || (document.getElementById('sModel') || {}).value || '';
        const colorVal  = (document.getElementById('sColor') || {}).value || '';
        const lineName  = (document.getElementById('sLine') || {}).value || '';
        const totalEl   = document.getElementById('laserWipTotal');
        const lotsEl    = document.getElementById('laserWipLots');

        if (!partName) {
            panel.style.display = 'none';
            return;
        }

        const product = _findProductForPlan(carModel, partName, colorVal);
        if (!_usesLaserWipForLine(product, lineName)) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        if (typeof LaserWipModule === 'undefined') return;

        const wip = LaserWipModule.getWipStock(carModel, partName, colorVal);
        const wipColor = wip > 0 ? 'var(--accent-green)' : 'var(--accent-red)';

        if (totalEl) totalEl.innerHTML = `<span style="color:${wipColor};font-weight:700;">${UIUtils.formatNumber(wip)} EA</span>`;

        if (lotsEl) {
            lotsEl.innerHTML = _buildLaserWipLotsHtml(carModel, partName, colorVal, lineName, wip);
        }
    }
    // ─────────────────────────────────────────────────────────────────

    function calcEndTime() {
        const qtyEl = document.getElementById('sQty');
        const startEl = document.getElementById('sStartTime');
        const lineEl = document.getElementById('sLine');
        const qtyStr = qtyEl ? qtyEl.value : null;
        const startTimeStr = startEl ? startEl.value : null;
        const qty = Number(qtyStr) || 0;
        const model = document.getElementById('sModel').value;
        const part = document.getElementById('sPart').value;
        const color = document.getElementById('sColor').value;
        const line = lineEl ? lineEl.value : '';

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        // 라인명이 "도장-A" 또는 "도장-B" 형식이므로 라인명 자체를 사용
        let lineProducts = products.filter(p => {
            // 라인에 맞는 제조공정 정보가 있는지 확인
            // 정확히 해당 라인명을 포함하는 process만 선택
            const hasLineProcess =
                (p.process1 === line) ||
                (p.process2 === line) ||
                (p.process3 === line) ||
                (p.process4 === line);

            return hasLineProcess;
        });
        if (lineProducts.length === 0) lineProducts = products;
        // 색상 매칭: 정확일치 → 공용색상(color 없는 제품) 순으로 fallback
        const p = lineProducts.find(x => x.carModel === model && x.partName === part && (x.color === color || !color || !x.color))
                || lineProducts.find(x => x.carModel === model && x.partName === part);

        let ctPerPiece = 0;
        let processInfo = '-';
        if (p) {
            // 선택된 라인(line)과 매칭되는 process를 찾아 CT/CVT 정보 추출
            let ctNum = NaN, cvtNum = NaN, processNum = 0, processName = '';

            for (let i = 1; i <= 4; i++) {
                const processKey = `process${i}`;
                const ctKey = `ct${i}`;
                const cvtKey = `cvt${i}`;

                // 라인과 매칭되는 process를 찾았을 때
                if (p[processKey] === line && p[ctKey] && p[cvtKey]) {
                    processName = p[processKey];
                    processNum = i;
                    ctNum = parseFloat(p[ctKey].toString().replace(/[^0-9.]/g, ''));
                    cvtNum = parseFloat(p[cvtKey].toString().replace(/[^0-9.]/g, ''));
                    break;
                }
            }

            // 매칭되는 라인 process가 없으면 기존 우선순위대로 확인 (하위 호환성)
            if (isNaN(ctNum) || isNaN(cvtNum)) {
                if (p.ct2 && p.cvt2) {
                    ctNum = parseFloat(p.ct2.toString().replace(/[^0-9.]/g, ''));
                    cvtNum = parseFloat(p.cvt2.toString().replace(/[^0-9.]/g, ''));
                    processNum = 2;
                    processName = p.process2 || `공정 ${processNum}`;
                } else if (p.ct3 && p.cvt3) {
                    ctNum = parseFloat(p.ct3.toString().replace(/[^0-9.]/g, ''));
                    cvtNum = parseFloat(p.cvt3.toString().replace(/[^0-9.]/g, ''));
                    processNum = 3;
                    processName = p.process3 || `공정 ${processNum}`;
                } else if (p.ct1 && p.cvt1) {
                    ctNum = parseFloat(p.ct1.toString().replace(/[^0-9.]/g, ''));
                    cvtNum = parseFloat(p.cvt1.toString().replace(/[^0-9.]/g, ''));
                    processNum = 1;
                    processName = p.process1 || `공정 ${processNum}`;
                } else if (p.ct4 && p.cvt4) {
                    ctNum = parseFloat(p.ct4.toString().replace(/[^0-9.]/g, ''));
                    cvtNum = parseFloat(p.cvt4.toString().replace(/[^0-9.]/g, ''));
                    processNum = 4;
                    processName = p.process4 || `공정 ${processNum}`;
                }
            }

            if (!isNaN(ctNum) && !isNaN(cvtNum) && cvtNum !== 0) {
                ctPerPiece = Number((ctNum / cvtNum).toFixed(2));
                processInfo = `${processName} | CVT: ${cvtNum} | C/T: ${ctNum}`;
            }
        }

        // 공정 정보 표시 업데이트 — 수량/시작시간을 아직 입력하지 않았어도(신규 계획은 수량 0으로
        // 시작) 차종·품명·라인만 정해지면 바로 보여야 한다. 종료시간 계산에만 필요한 수량/
        // 시작시간 가드는 이 아래(예상 종료시각 계산)에서만 적용한다.
        const processInfoEl = document.getElementById('processInfo');
        if (processInfoEl) {
            processInfoEl.textContent = processInfo;
            processInfoEl.style.color = processInfo === '-' ? 'var(--text-muted)' : 'var(--text-primary)';
        }

        if (!qtyStr || !startTimeStr) return;
        if (qty <= 0) {
            const endEl = document.getElementById('sEndTime');
            if (endEl) endEl.value = '';
            return;
        }

        if (ctPerPiece > 0 && qty > 0) {
            // 시간 계산 (CT/CVT 기반)
            const totalSeconds = qty * ctPerPiece;
            const totalMinutes = Math.ceil(totalSeconds / 60);

            const parts = startTimeStr.split(':');
            const startMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);

            const lunchStart  = 12 * 60 + 30;  // 12:30
            const lunchEnd    = 13 * 60 + 30;  // 13:30
            const dinnerStart = 17 * 60 + 30;  // 17:30
            const dinnerEnd   = 18 * 60;        // 18:00

            // 식사 시간 제외 없이 단순 합산한 원시 종료 시각
            const rawEndMins = startMins + totalMinutes;

            // 이 계획이 식사 시간을 포함하는지 확인
            const spansLunch  = startMins < lunchEnd  && rawEndMins > lunchStart;
            const spansDinner = startMins < dinnerEnd && rawEndMins > dinnerStart;
            const spansMeal   = spansLunch || spansDinner;

            // 식사 시간 가동 패널 표시/숨김
            const mealPanel = document.getElementById('mealTimeWorkPanel');
            if (mealPanel) mealPanel.style.display = spansMeal ? 'block' : 'none';

            // 체크박스 상태 읽기
            const mealTimeWork = !!(document.getElementById('sMealTimeWork')?.checked);

            let currentMins;
            if (mealTimeWork) {
                // 식사 시간도 가동 → 단순 합산
                currentMins = rawEndMins;
            } else {
                // 식사 시간 제외 (기존 로직)
                currentMins = startMins;
                let remaining = totalMinutes;
                while (remaining > 0) {
                    currentMins++;
                    if (currentMins >= lunchStart  && currentMins < lunchEnd)  currentMins = lunchEnd;
                    if (currentMins >= dinnerStart && currentMins < dinnerEnd) currentMins = dinnerEnd;
                    remaining--;
                }
            }

            // 종료 시간 계산
            const h = Math.floor(currentMins / 60);
            const m = currentMins % 60;
            const endH = String(h % 24).padStart(2, '0');
            const endM = String(m).padStart(2, '0');

            document.getElementById('sEndTime').value = `${endH}:${endM}`;

            // 정보 표시
            const nextSlotInfo = document.getElementById('nextSlotInfo');
            if (nextSlotInfo) {
                const mealNote = mealTimeWork ? ' <span style="color:#ea580c;font-weight:700;">[식사 시간 가동]</span>' : '';
                nextSlotInfo.innerHTML = `
                    <span style="color:var(--accent-blue);font-size:0.8rem;">
                        (${processName} 기준: 수량 ${UIUtils.formatNumber(qty)}EA × C/T ${ctNum}초 ÷ CVT ${cvtNum}개 = 총 소요 ${totalMinutes}분, 예상 종료 ${endH}:${endM})${mealNote}
                    </span>
                `;
            }
        } else {
            const mealPanel = document.getElementById('mealTimeWorkPanel');
            if (mealPanel) mealPanel.style.display = 'none';
            const nextSlotInfo = document.getElementById('nextSlotInfo');
            if (nextSlotInfo) nextSlotInfo.innerHTML = '';
        }
    }

    // 해당 날짜/라인의 마지막 작업 종료 시간을 기반으로 다음 시작 시간 추천
    function _getSuggestedStart(date, line) {
        const allData = Storage.getAll(STORE);
        let lastEnd = '';
        let lastPlan = null;
        allData.forEach(item => {
            if (item.date === date && item.line === line && item.endTime) {
                if (!lastEnd || item.endTime > lastEnd) {
                    lastEnd = item.endTime;
                    lastPlan = item;
                }
            }
        });
        console.log('[sugStart] date:', date, 'line:', line, 'lastEnd:', lastEnd, 'plans:', allData.filter(i=>i.date===date&&i.line===line).length);
        if (!lastEnd || !lastPlan) return null;

        // 기본 교체 시간: JIG교체 5분
        const [h, m] = lastEnd.split(':').map(Number);
        const sugMin = h * 60 + m + 5;
        const sH = Math.floor(sugMin / 60);
        const sM = sugMin % 60;
        const suggestedStart = `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}`;
        return { prevEnd: lastEnd, suggestedStart, lastPlan, exchangeMin: 5 };
    }

    function editSlot(slot, line) {
        const date = document.getElementById('planDateFilter').value;
        const allData = Storage.getAll(STORE);
        let currentItem = null;

        // 해당 시간대의 데이터 찾기 (slot 또는 startTime 일치, 동일 키 중복 시 최신)
        for (const item of allData) {
            if (item.date === date && item.line === line) {
                if (item.slot === slot || item.startTime === slot) {
                    if (!currentItem || _isNewerPlan(item, currentItem)) {
                        currentItem = item;
                    }
                } else if (!currentItem && item.hourlyPlans && item.hourlyPlans[slot]) {
                    currentItem = {
                        carModel: item.carModel,
                        partName: item.partName,
                        planQty: item.hourlyPlans[slot],
                        status: item.status,
                        isOldData: true,
                        parentId: item.id
                    };
                }
            }
        }

        const modelValue = (currentItem && currentItem.carModel) || '';
        const partValue = (currentItem && currentItem.partName) || '';
        const colorValue = (currentItem && currentItem.color) || '';
        const qtyValue = (currentItem && currentItem.planQty) || 0;

        // 새 작업 등록 시: 이전 작업 종료 + 교체 시간 기반 시작 시간 자동 추천
        const _sugStart = (!currentItem) ? _getSuggestedStart(date, line) : null;
        const startTimeValue = (currentItem && currentItem.startTime) || (_sugStart ? _sugStart.suggestedStart : slot);
        const endTimeValue = (currentItem && currentItem.endTime) || '';
        const statusValue = (currentItem && currentItem.status) || '대기';

        // 추천 시작 시간 힌트 메시지
        const startTimeHint = _sugStart
            ? `<div style="margin-top:4px;padding:6px 10px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:0.78rem;color:#065f46;">
                   <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;color:#10b981;">auto_fix_high</span>
                   이전 작업 종료 <strong>${_sugStart.prevEnd}</strong> + JIG교체 5분 → 권장 시작 <strong>${_sugStart.suggestedStart}</strong>
               </div>`
            : '';
        const mealTimeWorkValue = !!(currentItem && currentItem.mealTimeWork);
        const isTemporaryValue = !!(currentItem && currentItem.isTemporary);

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        // 다른 제품의 linkedProductId로 지정된 제품(=레이져 분리 대상)은 도장 계획에서 숨김
        const _linkedTargetIds = new Set(products.map(p => p.linkedProductId).filter(Boolean));
        // 라인명이 "도장-A" 또는 "도장-B" 형식이므로 라인명 자체를 사용
        let lineProducts = products.filter(p => {
            if (_linkedTargetIds.has(p.id)) return false; // 연결 대상 제품 제외
            const hasLineProcess =
                (p.process1 === line) ||
                (p.process2 === line) ||
                (p.process3 === line) ||
                (p.process4 === line);
            return hasLineProcess;
        });
        if (lineProducts.length === 0) lineProducts = products;
        const models = UIUtils.sortCarModels(lineProducts.map(p => p.carModel), lineProducts);

        let parts = [];
        let colors = [];
        if (modelValue) parts = [...new Set(lineProducts.filter(p => p.carModel === modelValue).map(p => p.partName).filter(Boolean))];
        if (modelValue && partValue) {
            colors = [...new Set(
                lineProducts
                    .filter(p => p.carModel === modelValue && p.partName === partValue)
                    .map(p => _getPlanColorForLine(p, line))   // ← 라인별 컬러 우선
                    .filter(Boolean)
            )];
        }

        // 저장된 계획값이 드롭다운에 없을 경우 강제 추가
        // (lineProducts 필터에서 제외된 품명/컬러도 기존 계획 수정 시 표시되어야 함)
        if (partValue && !parts.includes(partValue)) parts.push(partValue);
        if (colorValue && !colors.includes(colorValue)) colors.push(colorValue);
        // 컬러 드롭다운이 비어있으면 전체 products 에서 보완 (라인별 컬러 포함)
        if (modelValue && partValue && colors.length === 0) {
            colors = [...new Set(
                products
                    .filter(p => p.carModel === modelValue && p.partName === partValue)
                    .map(p => _getPlanColorForLine(p, line))
                    .filter(Boolean)
            )];
            if (colorValue && !colors.includes(colorValue)) colors.push(colorValue);
        }

        // ── 사출·도료 현재고 패널: showModal 전 동기 사전 계산 ────────────────────
        // setTimeout/DOM 타이밍 의존 없이 모달 HTML에 직접 삽입
        const _planId = (currentItem && currentItem.id) ? currentItem.id : '';

        // 사출 재고 사전 계산
        // v19: productId 우선 조회
        const _matchedProd = _findProductForPlan(modelValue, partValue, colorValue);
        const _productId = _matchedProd ? _matchedProd.id : '';

        let _injDisplay = 'none', _injTotalHtml = '-', _injLotsHtml = '';
        if (partValue) {
            try {
                let _im = getInjPartNamesForPlan(partValue, modelValue, _productId, colorValue);
                if (_im.length === 0 && modelValue) _im = getInjPartNamesForPlan(partValue, '', _productId, colorValue);
                if (_im.length === 0) _im = getInjPartNamesForPlan(partValue, modelValue, _productId);
                if (_im.length === 0 && modelValue) _im = getInjPartNamesForPlan(partValue, '', _productId);
                const _ilots = getInjStockLots(_im, colorValue);
                const _itotal = _ilots.reduce((s, l) => s + l.balance, 0);
                _injDisplay = 'block';
                if (_ilots.length === 0) {
                    _injTotalHtml = '재고 없음';
                    _injLotsHtml  = '<div style="text-align:center;padding:6px 0;color:var(--text-muted);">재고 없음</div>';
                } else {
                    const _ig = {};
                    _ilots.forEach(l => {
                        const k = `${l.partName}||${l.color||''}`;
                        if (!_ig[k]) _ig[k] = { partName: l.partName, color: l.color, balance: 0 };
                        _ig[k].balance += l.balance;
                    });
                    _injTotalHtml = `${UIUtils.formatNumber(_itotal)} EA`;
                    _injLotsHtml  = Object.values(_ig).map(g => {
                        const ep = encodeURIComponent(g.partName);
                        const ec = encodeURIComponent(g.color || '');
                        const em = encodeURIComponent(modelValue || '');
                        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-bottom:1px solid var(--border-color);font-size:0.78rem;cursor:pointer;border-radius:4px;"
                            onclick="ProductionPlanModule._showInjLotPopup('${ep}','${ec}','${em}')"
                            onmouseover="this.style.background='rgba(66,133,244,0.1)'"
                            onmouseout="this.style.background=''"
                            title="클릭하여 LOT 정보 보기">
                            <span style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">
                                <strong>${g.partName}</strong>
                                <span style="color:var(--text-muted);margin-left:4px;">${g.color||'-'}</span>
                                <span style="font-size:0.7rem;color:var(--accent-blue);margin-left:4px;">🔍</span>
                            </span>
                            <span style="font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(g.balance)} EA</span>
                        </div>`;
                    }).join('');
                }
            } catch(e) { console.error('[editSlot] injStock pre-compute error:', e); }
        }

        // 레이져 후 재공 재고 사전 계산 (제조공정-3이 도장인 품목만)
        let _laserWipDisplay = 'none', _laserWipTotal = '-', _laserWipHtml = '';
        if (partValue && _usesLaserWipForLine(_matchedProd, line)) {
            try {
                const _lwip = (typeof LaserWipModule !== 'undefined')
                    ? LaserWipModule.getWipStock(modelValue || '', partValue, colorValue || '')
                    : 0;
                _laserWipDisplay = 'block';
                const _lwipColor = _lwip > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                _laserWipTotal = `<span style="color:${_lwipColor};font-weight:700;">${UIUtils.formatNumber(_lwip)} EA</span>`;
                _laserWipHtml = _buildLaserWipLotsHtml(modelValue || '', partValue, colorValue || '', line || '도장', _lwip);
                // 레이져 후 도장 공정 품목은 사출 재고 대신 재공품 재고를 기준으로 확인
                _injDisplay = 'none';
            } catch(e) { console.error('[editSlot] laserWip pre-compute error:', e); }
        }

        // 도료 재고 사전 계산
        let _paintDisplay = 'none', _paintLotsHtml = '';
        if (modelValue && partValue) {
            try {
                const _prows = _getPaintRowsForProduct(modelValue, partValue, colorValue, line);
                const _vrows = _prows.filter(r => r.mainId || r.hardId || r.thinnerId);
                if (_vrows.length > 0) {
                    _paintDisplay = 'block';
                    const _pso = ['Primer', 'Color', '공용'];
                    const _pgp = {};
                    _vrows.forEach(r => { const sp = r.paintSpec||'공용'; if (!_pgp[sp]) _pgp[sp]=[]; _pgp[sp].push(r); });
                    const _psk = [..._pso.filter(s => _pgp[s]), ...Object.keys(_pgp).filter(s => !_pso.includes(s))];
                    const _mc = (label, matId) => {
                        if (!matId) return `<td style="padding:2px 8px;font-size:0.76rem;color:var(--text-muted);">-</td>`;
                        if (matId === '사용불필요') return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;color:var(--text-muted);font-style:italic;">
                            <span style="margin-right:3px;">${label}</span>사용불필요
                        </td>`;
                        const qty = _paintMatBalance(matId), name = _paintMatName(matId);
                        const qc  = qty > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;cursor:pointer;border-radius:4px;"
                            onclick="PaintInventoryModule.showPaintDetail('${matId}',{asChild:true})"
                            onmouseover="this.style.background='rgba(99,102,241,0.1)'"
                            onmouseout="this.style.background=''"
                            title="클릭하여 LOT 정보 보기">
                            <span style="color:var(--text-muted);margin-right:3px;">${label}</span><span style="font-weight:600;">${name}</span>
                            <span style="font-weight:700;color:${qc};margin-left:2px;">(${UIUtils.formatNumber(qty)})</span>
                        </td>`;
                    };
                    _paintLotsHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.76rem;">`
                        + _psk.flatMap(spec => _pgp[spec].map((r, idx) => `
                            <tr style="border-top:1px solid var(--border-color);">
                                <td style="padding:3px 8px 3px 0;font-weight:700;color:var(--text-secondary);white-space:nowrap;vertical-align:middle;min-width:48px;">${idx===0?spec:''}</td>
                                ${_mc('주제', r.mainId)}
                                ${_mc('경화제', r.hardId)}
                                ${_mc('희석제', r.thinnerId)}
                            </tr>`)).join('')
                        + `</table>`;
                }
            } catch(e) { console.error('[editSlot] paintStock pre-compute error:', e); }
        }

        const lineClass = line === '도장-B' ? 'line-b' : 'line-a';

        UIUtils.showModal(`[${line}] 생산 계획 등록`, `
            <input type="hidden" id="sLine" value="${line}">
            <div class="paint-plan-entry ${lineClass}">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="sModel" onchange="ProductionPlanModule.updateDropdowns('model', '${line}')" autofocus>
                        <option value="">선택</option>
                        ${models.map(m => `<option value="${m}" ${m === modelValue ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품명 (품명)</label>
                    <select class="form-select" id="sPart" onchange="ProductionPlanModule.updateDropdowns('part', '${line}')">
                        <option value="">선택</option>
                        ${parts.map(p => `<option value="${p}" ${p === partValue ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">도장 컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="sColor" onchange="ProductionPlanModule.calcEndTime(); ProductionPlanModule._autoFillItemType(); ProductionPlanModule.updatePaintStockPanel(); ProductionPlanModule.updateLaserWipPanel();">
                        <option value="">선택</option>
                        ${colors.map(c => `<option value="${c}" ${c === colorValue ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">계획 수량 (EA)</label>
                    <input type="number" class="form-input" id="sQty" value="${qtyValue}" oninput="ProductionPlanModule.calcEndTime(); ProductionPlanModule.updateInjStockPanel(); ProductionPlanModule.updateLaserWipPanel();">
                </div>
                <div class="form-group">
                    <label class="form-label">품목구분 <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(자동)</span></label>
                    <div id="sItemTypeBadge" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);min-height:38px;display:flex;align-items:center;font-size:0.9rem;color:var(--text-muted);">
                        —
                    </div>
                    <input type="hidden" id="sItemType" value="${(function() {
                        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
                        const m = products.find(p => p.carModel === modelValue && p.partName === partValue && p.color === colorValue);
                        return m ? (m.itemType || '') : '';
                    })()}">
                </div>
            </div>
            <div id="linkedProductBanner" style="margin-bottom:8px;">${(function(){
                const allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
                const selProd = partValue ? allProds.find(p => p.carModel === modelValue && p.partName === partValue) : null;
                if (!selProd || !selProd.linkedProductId) return '';
                const lp = allProds.find(p => p.id === selProd.linkedProductId);
                if (!lp) return '';
                return `<div style="padding:8px 12px;background:rgba(109,40,217,0.07);border:1px solid rgba(109,40,217,0.25);border-radius:8px;display:flex;align-items:center;gap:8px;font-size:0.82rem;">
                    <span class="material-symbols-outlined" style="font-size:16px;color:#7c3aed;flex-shrink:0;">call_split</span>
                    <span style="color:#7c3aed;font-weight:600;">레이져 단계에서 납품처별 분리</span>
                    <span style="color:var(--text-secondary);">→</span>
                    <span style="color:var(--text-primary);">${lp.partName}</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;">(${lp.customer||'납품처 미설정'})</span>
                </div>`;
            })()}</div>
            <div id="injStockPanel" data-current-plan-id="${_planId}"
                 style="display:${_injDisplay}; margin-bottom:8px; padding:10px 14px; background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <span style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:15px;">inventory_2</span>
                        <span data-inj-stock-title>사출 자재 재고 (창고 + 현장)</span>
                    </span>
                    <span id="injStockTotal" style="font-size:0.9rem; font-weight:700; color:var(--accent-blue);">${_injTotalHtml}</span>
                </div>
                <div id="injStockLots" style="font-size:0.78rem; color:var(--text-secondary); max-height:220px; overflow-y:auto;">${_injLotsHtml}</div>
            </div>
            <div id="laserWipPanel" data-current-plan-id="${_planId}"
                 style="display:${_laserWipDisplay}; margin-bottom:8px; padding:10px 14px; background:rgba(99,102,241,0.06); border-radius:8px; border:1px solid rgba(99,102,241,0.25);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-size:0.82rem; color:var(--accent-purple); font-weight:600; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:15px;">inventory</span>
                        레이져 후 재공품 현재고
                    </span>
                    <span id="laserWipTotal" style="font-size:0.9rem; font-weight:700;">${_laserWipTotal}</span>
                </div>
                <div id="laserWipLots" style="font-size:0.78rem; color:var(--text-secondary);">${_laserWipHtml}</div>
            </div>
            <div id="paintStockPanel" style="display:${_paintDisplay}; margin-bottom:12px; padding:10px 14px; background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border-color);">
                <div style="margin-bottom:6px;">
                    <span style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:15px;">palette</span>
                        도료 현재고
                    </span>
                </div>
                <div id="paintStockLots" style="font-size:0.78rem; color:var(--text-secondary); max-height:90px; overflow-y:auto;">${_paintLotsHtml}</div>
            </div>
            <div class="form-row" style="background:var(--bg-secondary); padding:12px; border-radius:8px; margin-bottom:12px;">
                <div class="form-group" style="flex:1;">
                    <label class="form-label" style="font-size:0.85rem; color:var(--text-secondary);">제조공정 정보</label>
                    <div id="processInfo" style="padding:8px; background:white; border-radius:4px; font-size:0.9rem; color:var(--text-primary); min-height:24px; font-weight:600;">-</div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">시작 시간</label>
                    <input type="time" class="form-input" id="sStartTime" value="${startTimeValue}" oninput="ProductionPlanModule.calcEndTime()">
                    ${startTimeHint}
                </div>
                <div class="form-group">
                    <label class="form-label">종료 시간 <span id="nextSlotInfo"></span></label>
                    <input type="time" class="form-input" id="sEndTime" value="${endTimeValue}">
                </div>
            </div>
            <div id="mealTimeWorkPanel" style="display:none; margin:0 0 12px; padding:10px 14px; background:rgba(249,115,22,0.06); border-radius:8px; border:1px solid rgba(249,115,22,0.3);">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#ea580c;">
                    <input type="checkbox" id="sMealTimeWork" onchange="ProductionPlanModule.calcEndTime()" style="width:16px;height:16px;cursor:pointer;" ${mealTimeWorkValue ? 'checked' : ''}>
                    🍱 식사 시간 가동 (교대 생산)
                </label>
                <p style="margin:4px 0 0 24px;font-size:0.78rem;color:var(--text-muted);">체크 시 점심/석식 시간을 포함하여 종료 시간을 계산합니다.</p>
            </div>
            <div style="margin:0 0 12px; padding:10px 14px; background:rgba(239,68,68,0.06); border-radius:8px; border:1px solid rgba(239,68,68,0.3);">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.88rem;font-weight:600;color:#b91c1c;">
                    <input type="checkbox" id="sTemporary" style="width:16px;height:16px;cursor:pointer;" ${isTemporaryValue ? 'checked' : ''}>
                    ⚠️ 임시 계획 (사출·도료 재고 부족해도 등록)
                </label>
                <p style="margin:4px 0 0 24px;font-size:0.78rem;color:var(--text-muted);">체크 시 사출 자재 및 도료 재고 검증 없이 계획을 등록합니다. 재고 확보 후 체크를 해제해 정식 계획으로 전환하세요.</p>
            </div>
            <div class="form-group">
                <label class="form-label">상태</label>
                <select class="form-select" id="sStatus">
                    <option value="대기" ${statusValue === '대기' ? 'selected' : ''}>대기</option>
                    <option value="진행" ${statusValue === '진행' ? 'selected' : ''}>진행</option>
                    <option value="완료" ${statusValue === '완료' ? 'selected' : ''}>완료</option>
                </select>
            </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProductionPlanModule.saveSlot('${slot}', '${line}')">저장</button>
        `);

        // 모달 오픈 후 예약 수량 포함 재계산 (calcEndTime + 계획예약 badge 업데이트)
        setTimeout(() => {
            ProductionPlanModule.calcEndTime();
            ProductionPlanModule.updateInjStockPanel(partValue, modelValue);
            ProductionPlanModule.updateLaserWipPanel(partValue, modelValue);
            ProductionPlanModule.updatePaintStockPanel(modelValue, partValue, colorValue);
            ProductionPlanModule._autoFillItemType();
        }, 50);
    }

    function _minToTime(min) {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function _timeToMinPlan(t) {
        if (!t) return NaN;
        const p = t.split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1]);
    }

    // 휴식 시간 정의 (점심 12:30~13:30, 석식 17:30~18:00)
    const _BREAKS = [
        { s: 12 * 60 + 30, e: 13 * 60 + 30 },
        { s: 17 * 60 + 30, e: 18 * 60 }
    ];

    // 시작 시간이 휴식 내에 있으면 휴식 끝으로 밀어냄
    function _skipBreak(startMin) {
        for (const b of _BREAKS) {
            if (startMin >= b.s && startMin < b.e) return b.e;
        }
        return startMin;
    }

    // 구간 [startMin, endMin) 에 포함된 휴식 시간(분) 합산
    function _breakOverlap(startMin, endMin) {
        return _BREAKS.reduce((sum, b) => {
            const os = Math.max(startMin, b.s);
            const oe = Math.min(endMin, b.e);
            return sum + (oe > os ? oe - os : 0);
        }, 0);
    }

    // 교체 시간 계산 (도료교체: 15분, JIG교체: 5분, 둘 다: 15분)
    function _exchangeMin(planA, planB) {
        if (!planA || !planB) return 0;
        const colorChange = planA.color    && planB.color    && planA.color    !== planB.color;
        const jigChange   = planA.partName && planB.partName && planA.partName !== planB.partName;
        if (colorChange) return 15;   // 도료교체 포함 시 항상 15분 (JIG 포함됨)
        if (jigChange)   return 5;
        return 0;
    }

    // 이후 계획을 간격 없이 연속으로 재배치 (교체 시간 포함)
    // prevPlanInfo: { partName, color } — 현재 저장 중인 계획 정보
    async function _cascadeShiftPlans(date, line, fromTime, deltaMin, excludeId, prevPlanInfo) {
        if (!deltaMin) return 0;
        const allData = Storage.getAll(STORE);
        const subsequent = allData
            .filter(item =>
                item.date === date &&
                item.line === line &&
                item.id !== excludeId &&
                item.startTime && item.startTime >= fromTime
            )
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (!subsequent.length) return 0;

        let nextStart = _timeToMinPlan(fromTime) + deltaMin;
        let prevInfo = prevPlanInfo || null;

        for (const item of subsequent) {
            // 교체 시간 추가
            const extra = _exchangeMin(prevInfo, item);
            nextStart += extra;

            // 식사 시간 가동이 아닌 경우만 휴식 시간 건너뜀
            if (!item.mealTimeWork) nextStart = _skipBreak(nextStart);

            // 원래 순수 작업 시간 보존 (식사 시간 가동이면 식사 시간 포함)
            const origStart = _timeToMinPlan(item.startTime);
            const origEnd   = _timeToMinPlan(item.endTime);
            const workMin   = item.mealTimeWork
                ? (origEnd - origStart)
                : (origEnd - origStart) - _breakOverlap(origStart, origEnd);

            let newEnd = nextStart + workMin;
            if (!item.mealTimeWork) newEnd += _breakOverlap(nextStart, newEnd);

            const newStartStr = _minToTime(nextStart);
            const newEndStr   = _minToTime(newEnd);

            await Storage.update(STORE, item.id, Object.assign({}, item, {
                startTime: newStartStr,
                endTime:   newEndStr,
                slot:      newStartStr
            }));

            prevInfo  = item;
            nextStart = newEnd;
        }
        return subsequent.length;
    }

    async function saveSlot(originalSlot, line) {
        const date = document.getElementById('planDateFilter').value;
        const startTime = document.getElementById('sStartTime').value;
        const endTime = document.getElementById('sEndTime').value;
        const newSlot = startTime;
        if (!newSlot) {
            UIUtils.toast('시작 시간을 입력해주세요.', 'warning');
            return;
        }

        const carModel      = document.getElementById('sModel').value.trim();
        const partName      = document.getElementById('sPart').value.trim();
        const color         = document.getElementById('sColor').value.trim();
        const planQty       = Number(document.getElementById('sQty').value) || 0;
        const status        = document.getElementById('sStatus').value;
        const itemType      = (document.getElementById('sItemType') || {}).value || '';
        const mealTimeWork  = !!(document.getElementById('sMealTimeWork')?.checked);
        const isTemporary   = !!(document.getElementById('sTemporary')?.checked);

        if (!color) {
            UIUtils.toast('도장 컬러를 선택하세요.', 'warning');
            const colorEl = document.getElementById('sColor');
            if (colorEl) colorEl.focus();
            return;
        }

        // v19: productId — products에서 carModel+partName+color 로 ID 조회
        const _allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _prodMatch = _allProds.find(p =>
            p.partName === partName && p.carModel === carModel && p.color === color
        ) || _allProds.find(p => p.partName === partName && p.carModel === carModel);
        const productId = _prodMatch ? _prodMatch.id : '';

        if (planQty <= 0) {
            UIUtils.toast('계획 수량을 1 이상 입력해주세요.', 'warning');
            document.getElementById('sQty').focus();
            return;
        }

        const allData = Storage.getAll(STORE);
        let existingId = null;
        let oldDataParentId = null;
        let oldEndTime = '';

        // 편집 폼에 심어 둔 계획 ID를 최우선으로 사용 — 없으면 slot/startTime으로 조회
        // (기존에는 slot===originalSlot 만 매칭해, startTime만 있는 계획·슬롯 불일치 시
        //  Storage.add 로 새 문서가 생기고 구 계획이 지시서/도장현황에 남았다)
        const formPlanId = (
            document.getElementById('injStockPanel')?.getAttribute('data-current-plan-id') ||
            document.getElementById('laserWipPanel')?.getAttribute('data-current-plan-id') ||
            ''
        ).trim();
        if (formPlanId) {
            const formPlan = Storage.getById(STORE, formPlanId);
            if (formPlan && formPlan.date === date && formPlan.line === line) {
                existingId = formPlanId;
                oldEndTime = formPlan.endTime || '';
            }
        }
        if (!existingId) {
            for (const item of allData) {
                if (item.date === date && item.line === line) {
                    if (item.slot === originalSlot || item.startTime === originalSlot) {
                        if (!existingId || _isNewerPlan(item, Storage.getById(STORE, existingId) || { id: existingId })) {
                            existingId = item.id;
                            oldEndTime = item.endTime || '';
                        }
                    } else if (!existingId && item.hourlyPlans && item.hourlyPlans[originalSlot]) {
                        oldDataParentId = item.id;
                    }
                }
            }
        }

        // ① 이후 계획 Cascade shift (Overlap 체크 전에 먼저 실행)
        // 임시 계획(isTemporary) 체크 시 사출/도료 재고 검증을 모두 건너뛴다
        if (partName && planQty > 0 && !isTemporary) {
            const currentPlanId = existingId || formPlanId || '';

            if (_usesLaserWipForLine(_prodMatch, line)) {
                // 레이져→도장 공정 품목: 사출 창고가 아닌 레이져 후 재공품 재고 검사
                const wipStock = (typeof LaserWipModule !== 'undefined')
                    ? LaserWipModule.getWipStock(carModel, partName, color)
                    : 0;
                if (wipStock < planQty) {
                    UIUtils.toast(`레이져 후 재공품 재고보다 많은 계획은 등록할 수 없습니다. 재공품 ${UIUtils.formatNumber(wipStock)} EA / 계획 ${UIUtils.formatNumber(planQty)} EA — 재고 없이 등록하려면 "임시 계획"을 체크하세요.`, 'warning');
                    const qtyEl = document.getElementById('sQty');
                    if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
                    return;
                }
            } else {
                // 일반 도장 품목: 창고 + 현장 합산 가용 재고 검사
                const stockCheck = _getInjectionAvailableForPlan(partName, carModel, color, productId, currentPlanId, line);
                if (stockCheck.available < planQty) {
                    UIUtils.toast(
                        `사출 자재 가용 재고(창고+현장)보다 많은 계획은 등록할 수 없습니다.`
                        + ` 창고 ${UIUtils.formatNumber(stockCheck.warehouse || 0)}`
                        + ` + 현장 ${UIUtils.formatNumber(stockCheck.site || 0)}`
                        + ` = 가용 ${UIUtils.formatNumber(stockCheck.available)} EA`
                        + ` / 계획 ${UIUtils.formatNumber(planQty)} EA`
                        + ` — 재고 없이 등록하려면 "임시 계획"을 체크하세요.`,
                        'warning'
                    );
                    const qtyEl = document.getElementById('sQty');
                    if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
                    updateInjStockPanel(partName, carModel);
                    return;
                }
            }

            // 도료 재고 검사 — 필요한 주제/경화제/희석제 중 하나라도 재고가 없으면 등록 차단
            const paintShortages = _getPaintShortagesForPlan(carModel, partName, color, line);
            if (paintShortages.length > 0) {
                UIUtils.toast(
                    `도료 재고가 없어 계획을 등록할 수 없습니다: ${paintShortages.join(', ')}`
                    + ` — 재고 없이 등록하려면 "임시 계획"을 체크하세요.`,
                    'warning'
                );
                updatePaintStockPanel(carModel, partName, color);
                return;
            }
        }

        let shiftedCount = 0;
        const curPlanInfo = { partName, color };
        if (endTime) {
            if (existingId && oldEndTime && endTime !== oldEndTime) {
                const deltaMin = _timeToMinPlan(endTime) - _timeToMinPlan(oldEndTime);
                shiftedCount = await _cascadeShiftPlans(date, line, oldEndTime, deltaMin, existingId, curPlanInfo);
            } else if (!existingId && startTime) {
                const hasFollowing = allData.some(item =>
                    item.date === date && item.line === line && item.startTime && item.startTime >= startTime
                );
                if (hasFollowing) {
                    const newDuration = _timeToMinPlan(endTime) - _timeToMinPlan(startTime);
                    shiftedCount = await _cascadeShiftPlans(date, line, startTime, newDuration, null, curPlanInfo);
                }
            }
        }

        // ② Overlap 체크 (cascade shift 후 최신 데이터 기준)
        // 동일 시작시각(슬롯) 문서는 저장 시 교체/정리 대상이므로 겹침으로 막지 않는다
        const freshData = Storage.getAll(STORE);
        if (endTime && newSlot && (carModel || partName || planQty > 0)) {
            for (const item of freshData) {
                if (item.date === date && item.line === line && item.id !== existingId) {
                    const iStart = item.startTime || item.slot;
                    const iEnd = item.endTime;
                    if (iStart && (iStart === newSlot || iStart === originalSlot || item.slot === newSlot || item.slot === originalSlot)) {
                        continue;
                    }
                    if (iStart && iEnd) {
                        if (newSlot < iEnd && endTime > iStart) {
                            UIUtils.toast(`[${iStart} ~ ${iEnd}] 시간대에 이미 다른 작업이 있습니다.`, 'warning');
                            search();
                            return;
                        }
                    } else if (iStart) {
                        if (newSlot === iStart || (endTime && endTime > iStart && newSlot <= iStart)) {
                            UIUtils.toast(`해당 시간대에 이미 작업 데이터가 존재합니다.`, 'warning');
                            search();
                            return;
                        }
                    }
                }
            }
        }

        // ③ 예전 방식 데이터 마이그레이션
        if (oldDataParentId && !existingId) {
            const oldPlan = Storage.getById(STORE, oldDataParentId);
            if (oldPlan && oldPlan.hourlyPlans) {
                delete oldPlan.hourlyPlans[originalSlot];
                oldPlan.planQty = Object.values(oldPlan.hourlyPlans).reduce((a, b) => a + (Number(b) || 0), 0);
                await Storage.update(STORE, oldDataParentId, oldPlan);
            }
        }

        /** 동일 일자·라인·시작시각(슬롯)의 다른 문서 제거 — 수정 시 구 계획 잔존 방지 */
        const _removeSlotDupes = async (keepId, slotKey) => {
            if (!slotKey) return 0;
            const keys = new Set([slotKey, originalSlot, newSlot].filter(Boolean));
            let removed = 0;
            const latest = Storage.getAll(STORE) || [];
            for (const item of latest) {
                if (!item || item.id === keepId) continue;
                if (item.date !== date || item.line !== line) continue;
                const itemKey = _planSlotKey(item);
                if (itemKey && keys.has(itemKey)) {
                    await Storage.remove(STORE, item.id);
                    removed++;
                }
            }
            return removed;
        };

        const _sameProductOthers = () => (Storage.getAll(STORE) || []).filter(item =>
            item.date === date && item.line === line &&
            item.id !== existingId &&
            item.carModel === carModel && item.partName === partName &&
            (item.color || '') === color &&
            _planSlotKey(item) !== newSlot
        );

        const _commitSlotSave = async (opts) => {
            const replaceProductIds = (opts && opts.replaceProductIds) || [];
            for (const rid of replaceProductIds) {
                if (rid && rid !== existingId) await Storage.remove(STORE, rid);
            }

            // ④ 현재 계획 저장 — 기존 ID가 있으면 반드시 update (add 금지)
            let savedId = existingId;
            if (existingId) {
                if (!carModel && !partName && planQty === 0) {
                    await Storage.remove(STORE, existingId);
                    savedId = null;
                } else {
                    await Storage.update(STORE, existingId, {
                        slot: newSlot, carModel, partName, color, itemType, planQty,
                        startTime, endTime, status, mealTimeWork, isTemporary,
                        productId: productId || undefined
                    });
                }
            } else {
                // 신규처럼 보여도 같은 시작시각 문서가 있으면 update로 흡수
                const collision = (Storage.getAll(STORE) || []).find(item =>
                    item.date === date && item.line === line &&
                    (_planSlotKey(item) === newSlot || item.slot === newSlot || item.startTime === newSlot)
                );
                if (collision) {
                    savedId = collision.id;
                    await Storage.update(STORE, collision.id, {
                        slot: newSlot, carModel, partName, color, itemType, planQty,
                        startTime, endTime, status, mealTimeWork, isTemporary,
                        productId: productId || undefined
                    });
                } else if (carModel || partName || planQty > 0) {
                    const added = await Storage.add(STORE, {
                        date, line, slot: newSlot, carModel, partName, color, itemType, planQty,
                        startTime, endTime, status, mealTimeWork, isTemporary,
                        productId: productId || undefined
                    });
                    savedId = (added && added.id) || null;
                }
            }

            if (savedId) {
                await _removeSlotDupes(savedId, newSlot);
            }

            UIUtils.closeModal();
            search();
            if (_activePlanDateModal) {
                setTimeout(() => openDayPlan(date, _activePlanLineModal), 0);
            }
            if (shiftedCount > 0) {
                const delta = _timeToMinPlan(endTime) - _timeToMinPlan(oldEndTime);
                UIUtils.toast(`저장 완료 — 이후 ${shiftedCount}개 계획 시간이 ${delta > 0 ? '+' : ''}${delta}분 조정되었습니다.`, 'success');
            } else {
                UIUtils.toast('계획이 저장되었습니다.', 'success');
            }
        };

        // 신규 등록인데 동일 품목이 다른 시간대에 있으면 교체 여부 확인
        const _askSameProductThenSave = () => {
            if (existingId) {
                _commitSlotSave({});
                return;
            }
            const others = _sameProductOthers();
            if (!others.length) {
                _commitSlotSave({});
                return;
            }
            const labels = others.map(p =>
                `${p.startTime || p.slot || '?'} ${UIUtils.formatNumber(Number(p.planQty) || 0)}EA`
            ).join(', ');
            UIUtils.confirm(
                `이 라인에 동일 품목 계획이 이미 있습니다.\n(${labels})\n\n기존 계획을 이 내용으로 교체할까요?\n(취소하면 기존 계획을 유지한 채 추가 등록합니다)`,
                () => { _commitSlotSave({ replaceProductIds: others.map(p => p.id) }); },
                () => { _commitSlotSave({}); }
            );
        };

        // 오늘 날짜에 이미 지나간 시작 시간으로 등록하려는 경우 — 실수 방지 확인
        const _now = new Date();
        const _nowHHMM = String(_now.getHours()).padStart(2, '0') + ':' + String(_now.getMinutes()).padStart(2, '0');
        if (date === UIUtils.today() && startTime && startTime < _nowHHMM) {
            UIUtils.confirm('지나간 시간에 등록을 하려고 하는데 등록 하시겠습니까?', _askSameProductThenSave);
            return;
        }

        _askSameProductThenSave();
    }

    function removeSlot(slot, line) {
        UIUtils.confirm(`${slot} 시간대 계획을 삭제하시겠습니까?`, async () => {
            const date = document.getElementById('planDateFilter').value;
            const allData = Storage.getAll(STORE);
            let removed = 0;
            for (const item of allData) {
                if (item.date === date && item.line === line) {
                    if (item.slot === slot || item.startTime === slot) {
                        await Storage.remove(STORE, item.id);
                        removed++;
                    } else if (item.hourlyPlans && item.hourlyPlans[slot]) {
                        delete item.hourlyPlans[slot];
                        item.planQty = Object.values(item.hourlyPlans).reduce((a, b) => a + (Number(b) || 0), 0);
                        await Storage.update(STORE, item.id, item);
                        removed++;
                    }
                }
            }
            search();
            if (_activePlanDateModal) {
                setTimeout(() => openDayPlan(date, _activePlanLineModal), 0);
            }
            UIUtils.toast(removed > 0 ? '삭제되었습니다.' : '삭제할 계획이 없습니다.', removed > 0 ? 'success' : 'warning');
        });
    }

    // ── 계획 드래그 이동 ────────────────────────────────────────────────
    // 계획 행을 잡아 다른 시간대(빈 칸)에 놓으면, 원래 소요 시간(분량)을 그대로 유지한 채
    // 시작 시간만 옮긴다. 겹침·과거 시간 확인은 saveSlot과 동일 기준을 재사용한다.
    let _dragPlanId = '';

    function onPlanDragStart(ev, planId) {
        if (!planId) { ev.preventDefault(); return; }
        _dragPlanId = planId;
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', planId); } catch (e) { /* 일부 브라우저 무시 */ }
        if (ev.currentTarget) ev.currentTarget.style.opacity = '0.5';
    }

    function onPlanDragEnd(ev) {
        if (ev.currentTarget) ev.currentTarget.style.opacity = '';
        document.querySelectorAll('.plan-drop-hover').forEach(el => el.classList.remove('plan-drop-hover'));
        _dragPlanId = '';
    }

    function onPlanDragOver(ev) {
        if (!_dragPlanId) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        if (ev.currentTarget) ev.currentTarget.classList.add('plan-drop-hover');
    }

    function onPlanDragLeave(ev) {
        if (ev.currentTarget) ev.currentTarget.classList.remove('plan-drop-hover');
    }

    async function onPlanDrop(ev, targetSlot, line) {
        ev.preventDefault();
        if (ev.currentTarget) ev.currentTarget.classList.remove('plan-drop-hover');
        const planId = _dragPlanId || (ev.dataTransfer && ev.dataTransfer.getData('text/plain'));
        _dragPlanId = '';
        if (!planId) return;

        const date = document.getElementById('planDateFilter').value;
        const plan = Storage.getById(STORE, planId);
        if (!plan) return;
        if (plan.slot === targetSlot) return; // 같은 자리에 놓음 — 아무 것도 안 함

        const oldStart = plan.startTime || plan.slot;
        const oldEndMin = _timeToMinPlan(plan.endTime);
        const rawDuration = (plan.endTime && !isNaN(oldEndMin)) ? (oldEndMin - _timeToMinPlan(oldStart)) : NaN;
        // 저장된 종료시간이 손상돼(예: 자정 넘김 계산 오류) 말이 안 되는 값이면(0분 이하 또는 20시간 초과) 기본 30분으로 대체
        const durationMin = (!isNaN(rawDuration) && rawDuration > 0 && rawDuration <= 20 * 60) ? rawDuration : 30;
        const newStartMin = _timeToMinPlan(targetSlot);
        if (isNaN(newStartMin)) return;
        const newStart = targetSlot;
        let newEnd = '';
        if (durationMin > 0) {
            const newEndMin = newStartMin + durationMin;
            if (newEndMin < 24 * 60) {
                newEnd = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
            }
        }

        // 겹침 확인 (자기 자신 제외)
        const freshData = Storage.getAll(STORE);
        const overlap = freshData.find(item => {
            if (item.date !== date || item.line !== line || item.id === planId) return false;
            const iStart = item.startTime || item.slot;
            const iEnd = item.endTime;
            if (!iStart) return false;
            if (iEnd && newEnd) return newStart < iEnd && newEnd > iStart;
            return iStart === newStart;
        });
        if (overlap) {
            UIUtils.toast(`[${overlap.startTime || overlap.slot}${overlap.endTime ? ' ~ ' + overlap.endTime : ''}] 시간대에 이미 다른 작업이 있습니다.`, 'warning');
            return;
        }

        const proceed = async () => {
            await Storage.update(STORE, planId, { slot: newStart, startTime: newStart, endTime: newEnd });
            search();
            if (_activePlanDateModal) {
                setTimeout(() => openDayPlan(date, _activePlanLineModal), 0);
            }
            UIUtils.toast(`계획을 ${newStart}로 이동했습니다.`, 'success');
        };

        const _now = new Date();
        const _nowHHMM = String(_now.getHours()).padStart(2, '0') + ':' + String(_now.getMinutes()).padStart(2, '0');
        if (date === UIUtils.today() && newStart < _nowHHMM) {
            UIUtils.confirm('지나간 시간에 등록을 하려고 하는데 등록 하시겠습니까?', proceed);
            return;
        }
        await proceed();
    }

    function printWorkOrder(line) {
        const date = document.getElementById('planDateFilter').value;
        const allData = Storage.getAll(STORE);

        const slotData = {};
        allData.forEach(item => {
            if (item.date === date && item.line === line) {
                const key = _planSlotKey(item);
                if (key) {
                    const prev = slotData[key];
                    if (!prev || _isNewerPlan(item, prev)) slotData[key] = item;
                } else if (item.hourlyPlans) {
                    for (let s of Object.keys(item.hourlyPlans)) {
                        if (!slotData[s] && item.hourlyPlans[s]) {
                            slotData[s] = {
                                carModel: item.carModel,
                                partName: item.partName,
                                color: item.color,
                                planQty: item.hourlyPlans[s],
                                status: item.status,
                                startTime: item.startTime,
                                endTime: item.endTime
                            };
                        }
                    }
                }
            }
        });

        const allSlots = Array.from(new Set([...TIME_SLOTS, ...Object.keys(slotData)])).sort();
        const slotRangeText = (slot, capEnd = '') => {
            const idx = TIME_SLOTS.indexOf(slot);
            if (idx >= 0 && TIME_SLOTS[idx + 1]) {
                const next = TIME_SLOTS[idx + 1];
                const end = capEnd && capEnd > slot && capEnd < next ? capEnd : next;
                return `${slot} ~ ${end}`;
            }
            return slot;
        };
        let totalQty = 0;
        let totalMinutes = 0;
        let rowIdx = 1;
        let renderedRowCount = 0;
        let activeItem = null;
        let activeEndTime = '';

        let tableRows = allSlots.map(slot => {
            const item = slotData[slot] || {};
            const q = Number(item.planQty) || 0;

            const isLunch = (slot === '12:30' || slot === '13:00');
            const isDinner = (slot === '17:30');
            const isMealTime = isLunch || isDinner;
            const hasData = item.carModel || item.partName || q > 0;

            if (hasData) {
                activeItem = item;
                activeEndTime = item.endTime || '';
            }

            let isHighlight = false;
            if (activeItem && activeEndTime) {
                const activeStart = activeItem.startTime || activeItem.slot;
                if (slot >= activeStart && slot < activeEndTime) {
                    isHighlight = true;
                } else if (slot >= activeEndTime) {
                    if (!hasData) {
                        activeItem = null;
                        activeEndTime = '';
                    }
                }
            }

            if (hasData) {
                totalQty += q;

                // 식사 시간(점심 12:30~13:30, 석식 17:30~18:00) 중첩 확인 및 차감
                if (item.startTime && item.endTime) {
                    const [sH, sM] = item.startTime.split(':').map(Number);
                    const [eH, eM] = item.endTime.split(':').map(Number);
                    let sTotal = sH * 60 + sM;
                    let eTotal = eH * 60 + eM;
                    let diff = eTotal - sTotal;

                    if (!item.mealTimeWork) {
                        const breaks = [{
                                s: 12 * 60 + 30,
                                e: 13 * 60 + 30
                            }, // 점심
                            {
                                s: 17 * 60 + 30,
                                e: 18 * 60
                            } // 석식
                        ];

                        breaks.forEach(b => {
                            const overlapStart = Math.max(sTotal, b.s);
                            const overlapEnd = Math.min(eTotal, b.e);
                            if (overlapStart < overlapEnd) {
                                diff -= (overlapEnd - overlapStart);
                            }
                        });
                    }
                    if (diff > 0) totalMinutes += diff;
                }

                const isOvertimeStart = (item.startTime === '18:00' || (!item.startTime && slot === '18:00'));
                renderedRowCount += 1;

                return `
                    <tr class="${isOvertimeStart ? 'overtime-row' : ''}">
                        <td style="text-align:center;">${rowIdx++}</td>
                        <td style="text-align:center;">${slotRangeText(slot, item.endTime || '')}</td>
                        <td style="text-align:center;">${item.carModel || ''}</td>
                        <td>${item.partName || ''}</td>
                        <td style="text-align:center;">${item.color || ''}</td>
                        <td style="text-align:right;">${q > 0 ? UIUtils.formatNumber(q) : ''} EA</td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                `;
            } else if (isMealTime) {
                if (slot === '13:00') return '';
                let mealText = '';
                let timeRange = '';
                if (isLunch) {
                    mealText = '점심 시간 (LUNCH TIME)';
                    timeRange = '12:30 ~ 13:30';
                } else {
                    mealText = '저녁 식사 (DINNER TIME)';
                    timeRange = '17:30 ~ 18:00';
                }
                const isMealRunning = activeItem && activeItem.mealTimeWork && activeEndTime > slot;
                const mealRunText = isMealRunning
                    ? ` <span style="margin-left:10px;color:#ea580c;font-weight:bold;">교대 가동 중 - ${activeItem.carModel || ''} ${activeItem.partName || ''}</span>`
                    : '';
                renderedRowCount += 1;
                return `
                    <tr class="${isLunch ? 'lunch-time' : 'dinner-time'}" style="background-color: #f1f5f9;">
                        <td style="text-align:center;">-</td>
                        <td style="text-align:center;">${timeRange}</td>
                        <td colspan="7" style="text-align:center; font-weight:bold; color:#94a3b8;">${mealText}${mealRunText}</td>
                    </tr>
                `;
            } else if (isHighlight && activeItem) {
                const isOvertimeStart = (slot === '18:00');
                renderedRowCount += 1;
                return `
                    <tr class="${isOvertimeStart ? 'overtime-row' : ''}" style="background-color:${getCarModelColor(activeItem.carModel, activeItem.partName, activeItem.color)};">
                        <td style="text-align:center;">-</td>
                        <td style="text-align:center;">${slotRangeText(slot, activeEndTime)}</td>
                        <td style="text-align:center;color:#777;">${activeItem.carModel || ''}</td>
                        <td style="color:#777;">${activeItem.partName || ''}</td>
                        <td style="text-align:center;color:#777;">${activeItem.color || ''}</td>
                        <td style="text-align:right;"></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                `;
            }
            return '';
        }).join('');

        const minPrintableRows = 12;
        const fillerCount = Math.max(0, minPrintableRows - renderedRowCount);
        const fillerRows = Array.from({ length: fillerCount }, () => `
            <tr class="filler-row">
                <td style="text-align:center;">&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
            </tr>
        `).join('');

        // 총 시간을 시간/분으로 변환
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        const timeStr = totalHours > 0 ? `${totalHours}시간 ${remainingMinutes}분` : `${remainingMinutes}분`;

        const printWindow = window.open('', '_blank', 'width=1100,height=800,scrollbars=yes,resizable=yes');
        printWindow.document.write(`
            <html>
            <head>
                <title>작업 지시서 - ${line} (${date})</title>
                <style>
                    body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; color: #333; }
                    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .info { font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
                    th, td { border: 1px solid #333; padding: 8px 4px; font-size: 11px; word-break: break-all; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .overtime-row td { border-top: 3px solid #333 !important; }
                    .filler-row td { height: 34px; }
                    .total-label { text-align:right; font-weight:bold; background:#f9f9f9; }
                    .total-value { text-align:right; font-weight:bold; background:#f9f9f9; color: #0056b3; }
                    .footer { margin-top: 30px; text-align: right; font-size: 12px; color: #666; }
                    @page { size: A4 landscape; margin: 10mm 12mm; }
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>생산 작업 지시서 (${line})</h1>
                    <div class="info">계획 일자: <strong>${date}</strong></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:25px;">NO</th>
                            <th style="width:100px;">시간 (시작~종료)</th>
                            <th style="width:70px;">차종</th>
                            <th>제품명 (품명)</th>
                            <th style="width:60px;">컬러</th>
                            <th style="width:60px;">계획 수량</th>
                            <th style="width:60px;">실 작업수량</th>
                            <th style="width:150px;">사출 LOT (수기)</th>
                            <th style="width:160px;">전달 사항</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows || '<tr><td colspan="9" style="text-align:center; padding:40px;">해당 날짜에 등록된 계획이 없습니다.</td></tr>'}
                        ${tableRows ? fillerRows : ''}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="2" class="total-label">총 작업 시간</td>
                            <td class="total-value" style="text-align:center;">${totalMinutes > 0 ? timeStr : '-'}</td>
                            <td class="total-label" style="text-align:center;">정규 잔여<br><span style="font-size:9px;font-weight:400;">(~17:30)</span></td>
                            <td class="total-value" style="text-align:center;color:${(480 - totalMinutes) > 60 ? '#c00' : '#090'};">${(function(){ const r=Math.max(0,480-totalMinutes); const rh=Math.floor(r/60); const rm=r%60; return r>0?(rh>0?rh+'시간 '+rm+'분':rm+'분'):'없음'; })()}</td>
                            <td class="total-value">${UIUtils.formatNumber(totalQty)}</td>
                            <td colspan="3" style="background:#f9f9f9;text-align:left;font-size:10px;padding-left:10px;">설비효율: ${Math.round(totalMinutes/480*100)}% (정규 8h 기준) | 잔업 2h 가능 (~20:00)</td>
                        </tr>
                    </tfoot>
                </table>
                <div class="footer">
                    인쇄 일시: ${new Date().toLocaleString()} | 생산 관리 시스템 (MES)
                </div>
                <div class="no-print" style="margin-top:20px; text-align:center;">
                    <button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer;">인쇄하기</button>
                    <button onclick="window.close()" style="padding:10px 20px; margin-left:10px; cursor:pointer;">닫기</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // ── 사출 재고 LOT 팝업 ───────────────────────────────────────────
    // 패널(updateInjStockPanel)과 동일한 데이터 소스(getInjStockLots)를 사용하여
    // 패널 수치와 LOT 팝업 수치가 항상 일치하도록 보장한다.
    // encCarModel: 차종 인코딩값 (없으면 전체 차종 포함)
    function _showInjLotPopup(encPartName, encColor, encCarModel) {
        const partName = decodeURIComponent(encPartName);
        const color    = decodeURIComponent(encColor    || '');
        const carModel = decodeURIComponent(encCarModel || '');

        // ── Step 1: 사출자재 마스터에서 injPartName + carModel 매칭 ──
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        let matchedMats = materials.filter(m => {
            if (m.injPartName !== partName) return false;
            // carModel 지정 시: 자재에 carModel이 있으면 일치 필요, 없으면 허용
            if (carModel && m.carModel && m.carModel !== carModel) return false;
            return true;
        });
        // carModel 매칭 실패 시 전체 차종으로 폴백
        if (matchedMats.length === 0) {
            matchedMats = materials.filter(m => m.injPartName === partName);
        }

        // ── Step 2: 패널과 동일한 getInjStockLots 호출 ──
        // → 차종·색상 필터, 입출고 계산이 패널과 100% 동일
        let allLots = getInjStockLots(matchedMats);

        // ── Step 3: 클릭한 행의 partName + color 기준 필터 ──
        // getInjStockLots가 반환하는 l.color는 getInjStockLots 내부 필터를 통과한 것
        // → injColor fuzzy match 기준과 동일하게 비교
        const normColor = (color || '').trim().toLowerCase();
        const activeLots = allLots
            .filter(l => {
                if (l.partName !== partName) return false;
                if (normColor && normColor !== '-') {
                    const lc = (l.color || '').toLowerCase();
                    // '-'(미등록 컬러)는 항상 포함, 나머지는 fuzzy 일치
                    if (lc !== '-') {
                        const match = lc === normColor || lc.includes(normColor) || normColor.includes(lc);
                        if (!match) return false;
                    }
                }
                return true;
            })
            .sort((a, b) => a.lotNo.localeCompare(b.lotNo));

        const totalQty = activeLots.reduce((s, l) => s + l.balance, 0);

        const rows = activeLots.length > 0
            ? activeLots.map(l => `
                <tr>
                    <td style="font-family:monospace;font-weight:700;">${l.lotNo}</td>
                    <td style="text-align:center;color:var(--text-muted);font-size:0.82rem;">${l.inDate || '-'}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(l.balance)} EA</td>
                </tr>`).join('')
            : `<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--text-muted);">재고 없음</td></tr>`;

        UIUtils.showChildModal(
            `📦 ${carModel ? carModel + ' · ' : ''}${partName}${color ? ' · ' + color : ''} — LOT 재고`,
            `<div style="margin-bottom:14px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;display:flex;gap:24px;font-size:0.85rem;flex-wrap:wrap;">
                ${carModel ? `<span>차종: <strong>${carModel}</strong></span>` : ''}
                <span>자재명: <strong>${partName}</strong></span>
                ${color ? `<span>컬러: <strong>${color}</strong></span>` : ''}
                <span style="margin-left:auto;font-weight:700;color:var(--accent-blue);">총 재고: ${UIUtils.formatNumber(totalQty)} EA</span>
            </div>
            <table class="data-table">
                <thead><tr>
                    <th>LOT 번호</th>
                    <th style="text-align:center;">최초 입고일</th>
                    <th style="text-align:right;">잔량</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeChildModal()">닫기</button>`
        );
    }

    // ── 시간 기반 자동 상태 갱신 ────────────────────────────────────
    // 오늘 날짜 계획만 대상. 완료는 내리지 않음.
    async function autoUpdateStatus() {
        const dateEl = document.getElementById('planDateFilter');
        if (!dateEl) return;
        const planDate = dateEl.value;
        const today = UIUtils.today();
        if (planDate !== today) return; // 오늘 이외 날짜는 건드리지 않음

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = hh + ':' + mm; // 'HH:MM'

        const allData = Storage.getAll(STORE);
        const todayPlans = allData.filter(p => p.date === today && p.startTime && p.endTime);

        let changed = false;
        for (const plan of todayPlans) {
            if (plan.status === '완료') continue; // 완료는 건드리지 않음

            let newStatus = null;
            if (currentTime >= plan.startTime && currentTime < plan.endTime) {
                newStatus = '진행';
            } else if (currentTime >= plan.endTime) {
                newStatus = '완료';
            }
            // 대기 상태인데 아직 시작 전이면 그대로 유지

            if (newStatus && plan.status !== newStatus) {
                await Storage.update(STORE, plan.id, { ...plan, status: newStatus });
                changed = true;
            }
        }

        if (changed) search(); // 변경된 경우에만 재렌더
    }

    // 사출 창고 예약 집계 상세 반환 (창고 팝업용)
    // 반환: { pendingPlans, inProgressPlans, pendingTotal, inProgressTotal }
    //   pendingPlans    : 대기 상태 계획 목록 (당일 계획)
    //   inProgressPlans : 진행중 + 완료-미실적 목록 (미입력 실적)
    /**
     * 수정으로 대체된 구 계획 문서 제거 — 일자+라인+시작시각이 같으면 최신 1건만 남긴다.
     * 생산계획 수정이 새 문서를 만들고 옛 문서를 지우지 않아 같은 시간대 계획이 중복 존재한다.
     * (도장 작업현황·대시보드·사출창고가 모두 같은 규칙을 써야 화면 간 숫자가 일치한다)
     */
    function _dedupePlanDocs(plans) {
        const byKey = {};
        const noKey = [];
        (plans || []).forEach(function (p) {
            if (!p) return;
            const slot = String(p.startTime || p.slot || '').trim();
            if (!slot) { noKey.push(p); return; }
            const key = String(p.date || '').slice(0, 10) + '||'
                + String(p.line || '').replace(/\s/g, '') + '||' + slot;
            const prev = byKey[key];
            if (!prev) { byKey[key] = p; return; }
            const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
            if (newer) byKey[key] = p;
        });
        return Object.values(byKey).concat(noKey);
    }

    function _getInjReserveDetail(injPartName, carModel, injColor, options) {
        options = options || {};
        const skipWarehouseConsume = !!options.skipWarehouseConsume;
        const injMats      = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const planPartNames = new Set();
        const planColors    = new Set();
        const _injPN        = (injPartName || '').trim();
        const _targetColor  = injColor ? _normalizeColorName(injColor) : '';

        const _mc = (mc) => {
            if (!_targetColor) return true;
            if (!mc) return true;
            return mc.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean)
                .some(c => c === _targetColor || c.includes(_targetColor) || _targetColor.includes(c));
        };

        let _matchedMats = injMats.filter(m =>
            (m.injPartName || '').trim() === _injPN &&
            (!carModel || !m.carModel || m.carModel === carModel) && _mc(m.injColor));
        // 차종까지 엄격히 맞춘 매칭이 하나도 없으면 차종 조건을 풀어 재시도 — 사출자재
        // 마스터의 carModel 값이 계획과 정확히 안 맞는(오탈자·차종 공유 등) 경우, 이 매칭이
        // 통째로 비어버려 계획 예약 수량·"—" 표시로 이어지는 사고를 막는다.
        if (_matchedMats.length === 0 && carModel) {
            _matchedMats = injMats.filter(m =>
                (m.injPartName || '').trim() === _injPN && _mc(m.injColor));
        }

        const _allProducts  = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _productIdSet = new Set();
        _matchedMats.forEach(m => {
            if (m.productIds && m.productIds.length > 0) {
                m.productIds.forEach(pid => {
                    _productIdSet.add(pid);
                    const pr = _allProducts.find(p => p.id === pid);
                    if (pr && pr.partName) planPartNames.add(pr.partName.trim());
                });
            }
            if (m.mfgProductName)  planPartNames.add(m.mfgProductName.trim());
            if (m.mfgProductName2) planPartNames.add(m.mfgProductName2.trim());
        });

        if (planPartNames.size === 0) {
            return { pendingPlans: [], inProgressPlans: [], pendingTotal: 0, inProgressTotal: 0 };
        }

        // ★ _calcInjPlanReserved와 동일한 규칙: 매칭된 자재의 injColor가
        //   2종 이상으로 갈릴 때만 색상 필터를 활성화 (배지 집계와 일치시킴)
        const _distinctInjColors = new Set(
            _matchedMats.map(m => _normalizeColorName(m.injColor || '')).filter(Boolean)
        );
        if (_distinctInjColors.size > 1) {
            _matchedMats.forEach(m => {
                if (m.injColor) {
                    m.injColor.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean)
                        .forEach(c => planColors.add(c));
                }
            });
        }

        const workedPlanIds = new Set(
            (Storage.getAll(DB.STORES.PAINTING_WORK) || []).map(w => w.planId).filter(Boolean)
        );

        const _KC = [
            'black','white','gray','grey','silver','red','blue','green','yellow','gold',
            'orange','purple','brown','beige','블랙','화이트','그레이','실버','레드',
            '블루','그린','옐로우','골드','오렌지','퍼플','브라운','베이지'
        ];
        function _colorOk(planColor) {
            if (planColors.size === 0) return true;
            if (!planColor) return true;
            const pLow = (planColor || '').trim().toLowerCase().replace(/\s+/g, '');
            if (!_KC.some(k => pLow === k || pLow.startsWith(k))) return true;
            const pc = _normalizeColorName(planColor);
            return [...planColors].some(c => pc === c || pc.includes(c) || c.includes(pc));
        }

        // 생산계획을 수정하면 구 문서가 남는 구조라, 걸러내지 않으면 수정 전 계획까지
        // 예약·미실적으로 집계된다(사출창고 타일의 "도장 실적 미입력", 현장 입고 계획수량 등).
        // 일자+라인+시작시각이 같으면 최신 1건만 유효 계획으로 본다.
        const allPlans       = _dedupePlanDocs(Storage.getAll(STORE) || []);
        const pendingPlans   = [];
        const inProgressPlans = [];

        allPlans.forEach(p => {
            const byId   = p.productId && _productIdSet.has(p.productId);
            const byName = !byId && planPartNames.has((p.partName || '').trim());
            if (!byId && !byName) return;
            // ★ ID 매칭 시에는 색상 필터 제외(도장 컬러 ≠ 사출 컬러) — _calcInjPlanReserved와 동일
            if (!byId && !_colorOk(p.color)) return;
            // ★ 도장-A → 레이저 → 도장-B 제품의 도장-B 계획은 레이저 재공품에서 소진되므로 제외
            if (_isPostLaserRepaintPlan(p, _allProducts)) return;

            const qty  = Number(p.planQty) || 0;
            // 생산 시작/종료 시각도 함께 넘긴다 — 현장 입고 부족 경고에서 "언제까지 소재가
            // 필요한지"를 보여주려면 날짜만으로는 부족하다.
            const info = { id: p.id, date: p.date || '', partName: p.partName || '', color: p.color || '',
                           planQty: qty, status: p.status || '', line: p.line || '',
                           startTime: p.startTime || p.slot || '', endTime: p.endTime || '' };
            if (p.status === '대기') {
                pendingPlans.push(info);
            } else if (p.status === '진행') {
                inProgressPlans.push(info);
            } else if (p.status === '완료' && !workedPlanIds.has(p.id)) {
                inProgressPlans.push(Object.assign({}, info, { status: '완료(미실적)' }));
            }
        });

        pendingPlans.sort((a, b) => a.date.localeCompare(b.date));
        inProgressPlans.sort((a, b) => a.date.localeCompare(b.date));

        if (skipWarehouseConsume) {
            return {
                pendingPlans,
                inProgressPlans,
                pendingTotal: pendingPlans.reduce((s, p) => s + p.planQty, 0),
                inProgressTotal: inProgressPlans.reduce((s, p) => s + p.planQty, 0)
            };
        }

        const consumed = _consumeReserveByWarehouseOut(_injPN, carModel, injColor, pendingPlans, inProgressPlans);
        return {
            pendingPlans: consumed.pendingPlans,
            inProgressPlans: consumed.inProgressPlans,
            pendingTotal: consumed.pending,
            inProgressTotal: consumed.inProgress
        };
    }

    /**
     * 진단: 구버전(출고 컬러 무시) vs 현행(입·출고 컬러 일치) 재고 차이.
     * 차이가 있으면 같은 품명의 다른 색 출고가 섞였던 케이스.
     */
    function diagnoseInjStockColorMismatch() {
        const all = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const rows = [];

        mats.forEach(function(m) {
            const carModel = m.carModel || '';
            const partName = m.injPartName || '';
            const injColor = m.injColor || '';
            if (!partName || !injColor) return;

            const targetColors = new Set(
                injColor.split(/[,，\/·|、]/).map(function(c) { return _normalizeColorName(c); }).filter(Boolean)
            );
            if (!targetColors.size) return;

            const baseFilter = function(item) {
                if (item.partName !== partName) return false;
                if (carModel && item.carModel && item.carModel !== carModel) return false;
                return true;
            };

            const legacyRecords = all.filter(function(item) {
                if (!baseFilter(item)) return false;
                if (item.type === '출고') return true;
                const iColor = _normalizeColorName(item.color);
                return [...targetColors].some(function(c) { return _injColorsMatch(iColor, c); });
            });

            const fixedRecords = all.filter(function(item) {
                if (!baseFilter(item)) return false;
                const itemColorRaw = String(item.color || '').trim();
                if (item.type === '출고' && !itemColorRaw) return true;
                const iColor = _normalizeColorName(itemColorRaw);
                return [...targetColors].some(function(c) { return _injColorsMatch(iColor, c); });
            });

            const legacyTotal = InvCalc.totalStock(legacyRecords);
            const fixedTotal = InvCalc.totalStock(fixedRecords);
            const delta = fixedTotal - legacyTotal;
            if (Math.abs(delta) < 0.001) return;

            const linkedProducts = [];
            if (m.productIds && m.productIds.length) {
                m.productIds.forEach(function(pid) {
                    const p = products.find(function(x) { return x.id === pid; });
                    if (p && p.partName) linkedProducts.push(p.partName);
                });
            }
            if (m.mfgProductName) linkedProducts.push(m.mfgProductName);
            if (m.mfgProductName2) linkedProducts.push(m.mfgProductName2);

            rows.push({
                carModel: carModel,
                injPartName: partName,
                injColor: injColor,
                warehouseLike: Math.max(0, fixedTotal),
                planLegacy: Math.max(0, legacyTotal),
                delta: delta,
                linkedProducts: [...new Set(linkedProducts.filter(Boolean))]
            });
        });

        rows.sort(function(a, b) {
            return Math.abs(b.delta) - Math.abs(a.delta) ||
                String(a.carModel).localeCompare(String(b.carModel)) ||
                String(a.injPartName).localeCompare(String(b.injPartName));
        });
        return rows;
    }

    return {
        render,
        search,
        selectDate,
        renderDateNav,
        renderCalendar,
        openDayPlan,
        closeDayPlan,
        toggleSat,
        prevMonth,
        nextMonth,
        goToday,
        editSlot,
        saveSlot,
        removeSlot,
        onPlanDragStart,
        onPlanDragEnd,
        onPlanDragOver,
        onPlanDragLeave,
        onPlanDrop,
        printWorkOrder,
        updateFooterOT,
        updateDropdowns,
        calcEndTime,
        updateInjStockPanel,
        updateLaserWipPanel,
        updatePaintStockPanel,
        _autoFillItemType,
        _updateLinkedProductBanner,
        autoUpdateStatus,
        _showInjLotPopup,
        _calcInjPlanReserved,
        _getInjReserveDetail,
        getInjStockLots,
        diagnoseInjStockColorMismatch
    };
})();
