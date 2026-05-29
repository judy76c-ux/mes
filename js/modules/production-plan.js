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
        if (slot >= '18:00' && slot <= '20:00') return 'overtime';
        return '';
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
                    if (item.slot) {
                        targetSlotData[item.slot] = item;
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
        let html = `
            <table style="width:100%;border-collapse:collapse;min-width:780px;table-layout:fixed;">
                <colgroup>
                    <col style="width:48px;">
                    <col><col><col><col><col>
                    <col style="width:120px;">
                </colgroup>
                <thead><tr>
                    ${DAY_KO.map((d, i) => `
                        <th style="padding:10px 6px;text-align:center;font-size:0.85rem;font-weight:700;color:${i===0?'var(--accent-red)':i===6?'var(--accent-blue)':'var(--text-secondary)'};border-bottom:2px solid var(--border-color);">${d}</th>
                    `).join('')}
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
                    html += `<td style="height:168px;border:1px solid var(--border-color);background:var(--bg-secondary);"></td>`;
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
                    const items = plans.filter(p => p.carModel || Number(p.planQty));
                    const itemLabel = p => {
                        const statusLabel = planActualStatus(p);
                        return `${p.carModel || '-'} : ${UIUtils.formatNumber(Number(p.planQty) || 0)} (${statusLabel})`;
                    };
                    const text = items.map(itemLabel).join(', ');
                    const rows = items.slice(0, 4).map(p => {
                        const actualStatus = planActualStatus(p);
                        const inspected = actualStatus === '검사완료';
                        const worked = actualStatus === '도장완료';
                        const rowColor = inspected ? 'var(--accent-green)' : (worked ? '#0f766e' : color);
                        const badgeBg = inspected ? 'rgba(16,185,129,0.12)' : (worked ? 'rgba(20,184,166,0.12)' : 'rgba(148,163,184,0.14)');
                        const badgeColor = inspected ? 'var(--accent-green)' : (worked ? '#0f766e' : 'var(--text-muted)');
                        return `<span style="font-size:0.68rem;font-weight:700;color:${rowColor};line-height:1.18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${p.carModel || '-'} : ${UIUtils.formatNumber(Number(p.planQty) || 0)}
                            <small style="font-size:0.6rem;font-weight:800;color:${badgeColor};background:${badgeBg};border-radius:4px;padding:0 3px;margin-left:2px;">${actualStatus}</small>
                        </span>`;
                    }).join('');
                    const more = items.length > 4
                        ? `<span style="font-size:0.65rem;color:var(--text-muted);line-height:1.1;">+${items.length - 4}</span>`
                        : '';
                    return `<div onclick="event.stopPropagation(); ProductionPlanModule.openDayPlan('${ds}', '${line}')"
                        title="${line} ${text}"
                        style="width:50%;padding:4px 3px;display:flex;flex-direction:column;gap:2px;cursor:pointer;min-width:0;${!isSun && label === 'B' ? 'border-left:1px dashed var(--border-color);' : ''}">
                        ${text ? `<span style="font-size:0.68rem;font-weight:900;color:${color};line-height:1.1;">${label}</span>
                        ${rows}${more}` : ''}
                    </div>`;
                };

                html += `
                    <td onclick="ProductionPlanModule.openDayPlan('${ds}', '도장-A')"
                        style="height:168px;padding:7px 8px;border:1px solid var(--border-color);background:${isToday?'rgba(59,130,246,0.05)':'#fff'};cursor:pointer;vertical-align:top;${isToday?'box-shadow:inset 0 0 0 2px var(--accent-blue);':''}"
                        onmouseover="this.style.background='rgba(241,245,249,0.9)'"
                        onmouseout="this.style.background='${isToday?'rgba(59,130,246,0.05)':'#fff'}'">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
                            <span style="font-size:0.9rem;font-weight:800;color:${isSun?'var(--accent-red)':isSat?'var(--accent-blue)':'var(--text-primary)'};">${day}</span>
                            ${dayPlans.length ? `<span style="font-size:0.68rem;color:var(--text-muted);">${dayPlans.length}건</span>` : ''}
                        </div>
                        <div style="margin-top:5px;height:111px;display:flex;">
                            ${lineSummary(plansA, '도장-A', 'A', 'var(--accent-blue)')}
                            ${lineSummary(plansB, '도장-B', 'B', 'var(--accent-orange)')}
                        </div>
                    </td>
                `;
                day++;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
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
        setTimeout(() => {
            _decoratePlanDayModalHeader(date, line);
            renderDayGrid(date, line);
        }, 0);
    }

    function _decoratePlanDayModalHeader(date, line) {
        const modal = document.getElementById('modal');
        const header = modal ? modal.querySelector('.modal-header') : null;
        if (!header) return;
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
        return `
            <div class="card grid-card" style="margin-bottom:8px;">
                <div class="card-header" style="padding:6px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;color:${color};"><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;">factory</span>${line}</h4>
                    <button class="btn btn-outline btn-sm" onclick="ProductionPlanModule.printWorkOrder('${line}')">
                        <span class="material-symbols-outlined" style="font-size:16px;">print</span> 인쇄
                    </button>
                </div>
                <div class="card-body p-0">
                    <div class="mes-grid-container pivoted-grid">
                        <table class="mes-grid" id="planGrid${suffix}">
                            <thead>
                                <tr>
                                    <th class="sticky-col time-col-header" style="width:140px;">시간 (시작~종료)</th>
                                    <th>차종</th><th>제품명</th><th>도장 컬러</th>
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
        const isPastDate = selectedDate < UIUtils.today();

        let totalQty = 0;
        let totalMinutes = 0;

        const allSlots = Array.from(new Set([...TIME_SLOTS, ...Object.keys(slotData)])).sort();

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

        tbody.innerHTML = allSlots.map(slot => {
            let rowClass = getSlotClass(slot);
            const item = slotData[slot] || {};
            const q = Number(item.planQty) || 0;
            totalQty += q;

            // 작업 시간 계산 (점심 시간 12:30~13:30 제외 로직)
            if (item.startTime && item.endTime) {
                const [sH, sM] = item.startTime.split(':').map(Number);
                const [eH, eM] = item.endTime.split(':').map(Number);
                let sTotal = sH * 60 + sM;
                let eTotal = eH * 60 + eM;

                let diff = eTotal - sTotal;

                // 식사 시간(점심 12:30~13:30, 석식 17:30~18:00) 중첩 확인 및 차감
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

            let clickable = !isLunch && !isPastDate;
            if (isHighlight && !hasData) {
                clickable = false;
            }

            const trCursor = clickable ? 'pointer' : 'not-allowed';
            const trClick = clickable
                ? `onclick="ProductionPlanModule.editSlot('${slot}', '${lineName}')"`
                : (isLunch ? '' : `onclick="event.stopPropagation(); UIUtils.toast('${isPastDate ? '지난 날짜의 계획은 수정할 수 없습니다.' : '해당 시간은 이미 다른 작업이 진행 중입니다.'}', 'warning');"`);
            const isOvertimeStart = (slot === '18:00');

            if (isMealTime) {
                let mealText = '';
                let timeRange = '';
                if (isLunch) {
                    mealText = '🍱 점심 시간 (LUNCH TIME)';
                    timeRange = slot === '12:30' ? '12:30 ~ 13:00' : '13:00 ~ 13:30';
                } else {
                    mealText = '☕ 저녁 식사 (DINNER TIME)';
                    timeRange = '17:30 ~ 18:00';
                }
                return `
                    <tr class="${isLunch ? 'lunch-time' : 'dinner-time'}" style="cursor: not-allowed; background-color: #f1f5f9;">
                        <td class="sticky-col time-cell" style="text-align:center;">${timeRange}</td>
                        <td colspan="7" style="text-align:center; font-weight:bold; color:#94a3b8; letter-spacing:2px;">${mealText}</td>
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

            return exchangeRow + `
                <tr class="${rowClass} hover-row ${isOvertimeStart ? 'overtime-start' : ''}" style="cursor: ${trCursor}; ${bgColorStyle}">
                    <td class="sticky-col time-cell" ${trClick}>${item.startTime || slot}${item.endTime ? ' ~ ' + item.endTime : ''}</td>
                    <td class="editable-cell" ${trClick}>${item.carModel || (clickable ? '<span style="color:#ccc;">(클릭하여 입력)</span>' : (isPastDate ? '' : `<span style="color:#aaa;">(${activeItem?.status === '완료' ? '작업 완료' : (activeItem?.status === '대기' ? '작업 대기' : '진행 중')})</span>`))}</td>
                    <td class="editable-cell" ${trClick}>${item.partName || ''}</td>
                    <td class="editable-cell" ${trClick}>${item.color || ''}</td>
                    <td class="editable-cell text-center" ${trClick}>${item.carModel ? UIUtils.itemTypeBadge(item.carModel, item.partName, item.color) : ''}</td>
                    <td class="editable-cell text-right" ${trClick}>${q > 0 ? UIUtils.formatNumber(q) : ''}</td>
                    <td class="editable-cell text-center" ${trClick}>${item.status ? UIUtils.badge(item.status, item.status === '완료' ? 'success' : (item.status === '진행' ? 'info' : 'warning')) : ''}</td>
                    <td class="text-center">
                        ${hasData && !isPastDate ? `<button class="btn btn-xs btn-icon btn-danger" onclick="ProductionPlanModule.removeSlot('${slot}', '${lineName}')" title="삭제" style="position:relative; z-index:10;"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        if (foot) {
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            const timeStr = h > 0 ? `${h}시간 ${m}분` : `${m}분`;

            foot.innerHTML = `
                <tr class="total-row">
                    <td class="sticky-col font-bold" colspan="2" style="text-align: left; padding-left: 15px; color: var(--accent-blue);">총 시간: ${totalMinutes > 0 ? timeStr : '-'}</td>
                    <td class="font-bold" colspan="2" style="text-align: right; padding-right: 20px;">총 합계</td>
                    <td class="total-cell font-bold text-right">${UIUtils.formatNumber(totalQty)}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }
    }

    function updateDropdowns(target, line) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        // 라인명이 "도장-A" 또는 "도장-B" 형식이므로 라인명 자체를 사용
        let lineProducts = line
            ? products.filter(p => {
                // 라인에 맞는 제조공정 정보가 있는지 확인
                // 정확히 해당 라인명을 포함하는 process만 선택
                const hasLineProcess =
                    (p.process1 === line) ||
                    (p.process2 === line) ||
                    (p.process3 === line) ||
                    (p.process4 === line);

                return hasLineProcess;
            })
            : products;
        if (lineProducts.length === 0) lineProducts = products;

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
            const validColors = [...new Set(lineProducts.filter(p => p.carModel === selectedModel && p.partName === selectedPart).map(p => p.color).filter(Boolean))];
            // colorValue는 이 스코프에 없으므로 selected 없이 렌더링
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
        }, 0);
    }

    // ── 품목구분 자동 입력 ────────────────────────────────────────────
    function _autoFillItemType() {
        const car   = (document.getElementById('sModel') || {}).value || '';
        const part  = (document.getElementById('sPart')  || {}).value || '';
        const color = (document.getElementById('sColor') || {}).value || '';
        const hiddenEl = document.getElementById('sItemType');
        const badgeEl  = document.getElementById('sItemTypeBadge');
        if (!hiddenEl || !badgeEl) return;

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const matched = products.find(p =>
            p.carModel === car && p.partName === part && (!color || p.color === color)
        );
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
        const prod = products.find(p =>
            p.carModel === carModel && p.partName === partName && p.color === color
        ) || products.find(p =>
            p.carModel === carModel && p.partName === partName
        );
        const rows = (prod && prod.paintMaterials) ? prod.paintMaterials : [];
        // line이 지정된 경우 processTag가 해당 라인이거나 '공용'(or 미설정)인 것만 반환
        if (line) {
            return rows.filter(r => !r.processTag || r.processTag === '공용' || r.processTag === line);
        }
        return rows;
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
            const qty = _paintMatBalance(matId);
            const name = _paintMatName(matId);
            const qtyColor = qty > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;cursor:pointer;border-radius:4px;"
                        onclick="PaintInventoryModule.showPaintDetail('${matId}')"
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

    // ── 색상명 정규화 (한국어↔영어 + 복합색명 + 자동차 컬러코드 통일) ──────
    // "블랙"/"black"/"BK"/"블랙펄"/"블랙 메탈릭" 등 다양한 표기 → 동일 대표값으로 변환
    function _normalizeColorName(c) {
        const s = (c || '').trim().toLowerCase().replace(/\s+/g, '');
        const MAP = {
            // ── 한국어 기본 색상 ─────────────────────────────────────────
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
            // ── 자동차 산업 컬러 코드 ────────────────────────────────────
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
        // ① 정확히 일치하면 즉시 반환
        if (MAP[s] !== undefined) return MAP[s];
        // ② 접두 매칭 — 복합 색명 처리 ("블랙펄" → "블랙" → "black", "blackpearl" → "black"...)
        //    긴 키를 먼저 시도해 짧은 키가 우선 매칭되는 것을 방지
        const sortedKeys = Object.keys(MAP).sort((a, b) => b.length - a.length);
        for (const k of sortedKeys) {
            if (s.startsWith(k)) return MAP[k];
        }
        return s;
    }

    // 사출자재 마스터 목록 기준 창고 재고 집계
    // matList: [{injPartName, injColor, carModel}, ...] (getInjPartNamesForPlan 반환값)
    //
    // ★ Fix: 키에서 color 제거 → 출고 기록(color 없음)과 입고 기록(color 있음)이
    //         같은 LOT 키로 합산되어 차감이 정상 반영됨
    // ★ Fix: 컬러 필터는 입고(type !== '출고') 기록에만 적용
    //         출고 기록은 color 저장 여부와 무관하게 항상 차감 반영
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
                m.injColor.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean)
                    .forEach(c => matColorMap[m.injPartName].add(c));
            }
            if (m.carModel) {
                matCarModelMap[m.injPartName].add(m.carModel);
            }
        });

        // ★ 컬러 전체 확장 블록 제거
        // 이유: getInjPartNamesForPlan이 injPartName+injColor 조합으로 de-dup하므로
        //       같은 injPartName의 다른 injColor 자재가 모두 matList에 포함됨.
        //       → 확장 불필요. 확장하면 오히려 관계없는 색상 재고가 섞임.

        const partNames = Object.keys(matColorMap);
        if (partNames.length === 0) return [];

        // ★ 키: partName|lotNo (color 제거) — 출고 기록과 입고 기록이 같은 키로 집계됨
        const lotMap = {};
        all.forEach(item => {
            if (!partNames.includes(item.partName)) return;

            // 차종 필터 — 자재에 차종이 지정된 경우에만 적용
            const allowedCarModels = matCarModelMap[item.partName];
            if (allowedCarModels && allowedCarModels.size > 0 && item.carModel) {
                if (!allowedCarModels.has(item.carModel)) return;
            }

            // ★ 컬러 필터 — 입고 기록에만 적용 (출고는 color 없어도 항상 차감)
            const isOutgoing = (item.type === '출고');
            if (!isOutgoing) {
                const allowedColors = matColorMap[item.partName];
                if (allowedColors.size > 0) {
                    const iColor = _normalizeColorName(item.color);
                    const match = [...allowedColors].some(c =>
                        iColor === c || iColor.includes(c) || c.includes(iColor));
                    if (!match) return;
                }
            }

            const effectiveLotNo = item.lotNo || '미기재';
            // ★ color 제거 — 입출고 동일 키로 묶어 잔량 정확 계산
            const key = `${item.partName}|${effectiveLotNo}`;
            if (!lotMap[key]) lotMap[key] = {
                partName: item.partName || '',
                color:    item.color    || '-',  // 최초 입고 기록의 color 사용
                lotNo:    effectiveLotNo,
                balance:  0,
                inDate:   ''
            };
            if (isOutgoing) {
                lotMap[key].balance -= Number(item.quantity) || 0;
            } else {
                lotMap[key].balance += Number(item.quantity) || 0;
                // 최초 입고일 · 입고 color 추적
                if (!lotMap[key].inDate || item.date < lotMap[key].inDate) {
                    lotMap[key].inDate = item.date || '';
                }
                // 입고 기록에서 color가 있으면 업데이트
                if (item.color && item.color !== '-') lotMap[key].color = item.color;
            }
        });

        return Object.values(lotMap)
            .filter(l => l.balance > 0)
            .sort((a, b) =>
                a.partName.localeCompare(b.partName) ||
                (a.color || '').localeCompare(b.color || '') ||
                a.lotNo.localeCompare(b.lotNo)
            );
    }

    // 사출 자재명(injPartName) 기준으로 생산계획 예약 수량 집계
    // - 대기/진행: 예약으로 계산
    // - 완료: 도장 작업실적이 없으면 아직 재고가 차감되지 않은 것이므로 예약으로 포함
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

        const allPlans = Storage.getAll(STORE) || [];
        let pending = 0, inProgress = 0;

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

        allPlans.forEach(p => {
            if (excludePlanId && p.id === excludePlanId) return;
            // ★ v19: ID 매칭 우선, 없으면 텍스트 매칭 Fallback
            const matchById   = p.productId && _productIdSet.has(p.productId);
            const matchByName = !matchById && planPartNames.has((p.partName || '').trim());
            if (!matchById && !matchByName) return;
            // ★ 컬러 필터: ID 매칭 시 건너뜀 (도장 컬러 ≠ 사출 컬러, 다른 색상 체계)
            //              이름 매칭 시에만 적용 (같은 품명·다른 사출 컬러 자재 구분용)
            if (!matchById && !_colorMatches(p.color)) return;
            const qty = Number(p.planQty) || 0;
            if (p.status === '대기')  { pending    += qty; return; }
            if (p.status === '진행') { inProgress += qty; return; }
            // 완료 계획이지만 도장 작업실적이 없으면 → 아직 재고 미차감 → 예약으로 포함
            if (p.status === '완료' && !workedPlanIds.has(p.id)) { pending += qty; }
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
                pending += formQty;
            }
        }

        console.log(`[예약집계] "${injPartName}"${_targetColor ? ` [${_targetColor}]` : ''}`
            + ` → pending=${pending}, inProgress=${inProgress}`
            + ` (제작품목: ${[...planPartNames].join(', ')}, 컬러: ${[...planColors].join(', ') || '전체'})`);
        return { pending, inProgress };
    }

    // 모달 내 사출 재고 패널 갱신 — 자재명 | 현재고 | 계획예약 | 사용가능
    // overridePartName / overrideCarModel : 편집 모달 초기화 시 DOM 값 대신 직접 전달
    function _getInjectionAvailableForPlan(partName, carModel, color, productId, excludePlanId) {
        if (!partName) return { available: 0, total: 0, matched: [], lots: [] };
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

        let total = 0;
        let available = 0;
        Object.values(grouped).forEach(g => {
            const reserved = _calcInjPlanReserved(g.partName, excludePlanId, carModel, g.color, false);
            total += g.balance;
            available += g.balance - reserved.pending - reserved.inProgress;
        });
        return { available: Math.max(0, available), total, matched, lots };
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
        const total = lots.reduce((s, l) => s + l.balance, 0);

        panel.style.display = 'block';

        if (lots.length === 0) {
            totalEl.textContent = '재고 없음';
            totalEl.style.color = 'var(--accent-red)';
            lotsEl.innerHTML = `<div style="text-align:center;padding:6px 0;color:var(--text-muted);">재고 없음</div>`;
            return;
        }

        // 자재명+컬러 기준 집계 (LOT 합산)
        const grouped = {};
        lots.forEach(l => {
            const key = `${l.partName}||${l.color || ''}`;
            if (!grouped[key]) grouped[key] = { partName: l.partName, color: l.color, balance: 0 };
            grouped[key].balance += l.balance;
        });

        // 전체 가용수량 = 실재고 - 대기예약 - 진행중
        let totalPending = 0, totalInProgress = 0;
        const reserveMap = {};
        Object.values(grouped).forEach(g => {
            const r = _calcInjPlanReserved(g.partName, currentPlanId, carModel, g.color);
            reserveMap[`${g.partName}||${g.color || ''}`] = r;
            totalPending    += r.pending;
            totalInProgress += r.inProgress;
        });

        const totalAvailable = total - totalPending - totalInProgress;
        const totalReserved  = totalPending + totalInProgress;
        // 가용 재고는 예약 여부와 무관하게 항상 표시
        totalEl.innerHTML = `${UIUtils.formatNumber(total)} EA`
            + (totalReserved > 0
                ? ` <span style="font-size:0.72rem;color:var(--accent-red);">예약 -${UIUtils.formatNumber(totalReserved)}</span>`
                : '')
            + ` <span style="font-size:0.75rem;color:var(--text-muted);">→ 가용 <strong style="color:${totalAvailable > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(totalAvailable)}</strong> EA</span>`;
        totalEl.style.color = total > 0 ? 'var(--accent-blue)' : 'var(--accent-red)';

        lotsEl.innerHTML = Object.values(grouped).map(g => {
            const encPart  = encodeURIComponent(g.partName);
            const encColor = encodeURIComponent(g.color || '');
            const encModel = encodeURIComponent(carModel || '');
            const r = reserveMap[`${g.partName}||${g.color || ''}`] || { pending: 0, inProgress: 0 };
            const available  = g.balance - r.pending - r.inProgress;
            const reservedAmt = r.pending + r.inProgress;

            // 예약/사용중 뱃지
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

            // 가용수량 — 항상 표시 (현재고 - 예약 = 가용)
            const availColor = available > 0 ? 'var(--accent-blue)' : 'var(--accent-red)';
            const stockStr   = reservedAmt > 0
                ? `<span style="color:var(--text-muted);text-decoration:line-through;font-size:0.72rem;">${UIUtils.formatNumber(g.balance)}</span>
                   <span style="font-weight:700;color:${availColor};margin-left:4px;">${UIUtils.formatNumber(available)} EA</span>`
                : `<span style="font-weight:700;color:${availColor};">${UIUtils.formatNumber(g.balance)} EA</span>
                   <span style="font-size:0.68rem;color:var(--accent-green);margin-left:3px;">(가용)</span>`;

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
                <span style="white-space:nowrap;">${stockStr}</span>
            </div>`;
        }).join('');
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
            lotsEl.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 6px;border-radius:4px;">
                <span style="font-size:0.82rem;color:var(--text-secondary);">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">bolt</span>
                    레이져 완료 → ${lineName || '도장'} 대기
                </span>
                <span style="font-weight:700;color:${wipColor};font-size:0.95rem;">${UIUtils.formatNumber(wip)} EA</span>
            </div>
            ${wip <= 0 ? `<div style="text-align:center;padding:4px 0;font-size:0.78rem;color:var(--accent-red);">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span>
                재공품 재고 없음 — 레이져 공정 완료 후 진행 가능
            </div>` : ''}`;
        }
    }
    // ─────────────────────────────────────────────────────────────────

    function calcEndTime() {
        const qtyEl = document.getElementById('sQty');
        const startEl = document.getElementById('sStartTime');
        const lineEl = document.getElementById('sLine');
        const qtyStr = qtyEl ? qtyEl.value : null;
        const startTimeStr = startEl ? startEl.value : null;
        if (!qtyStr || !startTimeStr) return;

        const qty = Number(qtyStr) || 0;
        if (qty <= 0) {
            const endEl = document.getElementById('sEndTime');
            if (endEl) endEl.value = '';
            return;
        }
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
        // color 선택 전이면 carModel + partName 만으로 fallback 조회
        const p = lineProducts.find(x => x.carModel === model && x.partName === part && x.color === color)
                || (!color && lineProducts.find(x => x.carModel === model && x.partName === part));

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

        // 공정 정보 표시 업데이트
        const processInfoEl = document.getElementById('processInfo');
        if (processInfoEl) {
            processInfoEl.textContent = processInfo;
            processInfoEl.style.color = processInfo === '-' ? 'var(--text-muted)' : 'var(--text-primary)';
        }

        if (ctPerPiece > 0 && qty > 0) {
            // 시간 계산 (CT/CVT 기반)
            // CT = Cycle Time (초), CVT = Standard Sample Count (개수)
            // ctPerPiece = CT / CVT (1개 당 소요 시간, 초)
            // totalSeconds = 수량 × 1개 당 소요 시간
            const totalSeconds = qty * ctPerPiece;
            const totalMinutes = Math.ceil(totalSeconds / 60);

            const parts = startTimeStr.split(':');
            let currentMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);

            // 작업 시간 추가 (점심/석식 시간 제외)
            let remaining = totalMinutes;
            while (remaining > 0) {
                currentMins++;

                // 점심 시간 범위 확인 (12:30 ~ 13:30)
                const lunchStart = 12 * 60 + 30;  // 12:30
                const lunchEnd = 13 * 60 + 30;    // 13:30
                if (currentMins >= lunchStart && currentMins < lunchEnd) {
                    currentMins = lunchEnd;
                }

                // 석식 시간 범위 확인 (17:30 ~ 18:00)
                const dinnerStart = 17 * 60 + 30; // 17:30
                const dinnerEnd = 18 * 60;         // 18:00
                if (currentMins >= dinnerStart && currentMins < dinnerEnd) {
                    currentMins = dinnerEnd;
                }

                remaining--;
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
                nextSlotInfo.innerHTML = `
                    <span style="color:var(--accent-blue);font-size:0.8rem;">
                        (${processName} 기준: 수량 ${UIUtils.formatNumber(qty)}EA × C/T ${ctNum}초 ÷ CVT ${cvtNum}개 = 총 소요 ${totalMinutes}분, 예상 종료 ${endH}:${endM})
                    </span>
                `;
            }
        } else {
            const nextSlotInfo = document.getElementById('nextSlotInfo');
            if (nextSlotInfo) nextSlotInfo.innerHTML = '';
        }
    }

    function editSlot(slot, line) {
        const date = document.getElementById('planDateFilter').value;
        if (date < UIUtils.today()) {
            UIUtils.toast('지난 날짜의 계획은 수정할 수 없습니다.', 'warning');
            return;
        }

        const allData = Storage.getAll(STORE);
        let currentItem = null;

        // 해당 시간대의 데이터 찾기
        for (const item of allData) {
            if (item.date === date && item.line === line) {
                if (item.slot === slot) {
                    currentItem = item;
                    break;
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
        const startTimeValue = (currentItem && currentItem.startTime) || slot;
        const endTimeValue = (currentItem && currentItem.endTime) || '';
        const statusValue = (currentItem && currentItem.status) || '대기';

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
        const models = UIUtils.sortCarModels(lineProducts.map(p => p.carModel), lineProducts);

        let parts = [];
        let colors = [];
        if (modelValue) parts = [...new Set(lineProducts.filter(p => p.carModel === modelValue).map(p => p.partName).filter(Boolean))];
        if (modelValue && partValue) colors = [...new Set(lineProducts.filter(p => p.carModel === modelValue && p.partName === partValue).map(p => p.color).filter(Boolean))];

        // 저장된 계획값이 드롭다운에 없을 경우 강제 추가
        // (lineProducts 필터에서 제외된 품명/컬러도 기존 계획 수정 시 표시되어야 함)
        if (partValue && !parts.includes(partValue)) parts.push(partValue);
        if (colorValue && !colors.includes(colorValue)) colors.push(colorValue);
        // 컬러 드롭다운이 비어있으면 전체 products 에서 보완
        if (modelValue && partValue && colors.length === 0) {
            colors = [...new Set(products.filter(p => p.carModel === modelValue && p.partName === partValue).map(p => p.color).filter(Boolean))];
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
                _laserWipHtml = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 6px;border-radius:4px;">
                    <span style="font-size:0.82rem;color:var(--text-secondary);">
                        <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">bolt</span>
                        레이져 완료 → ${line || '도장'} 대기
                    </span>
                    <span style="font-weight:700;color:${_lwipColor};font-size:0.95rem;">${UIUtils.formatNumber(_lwip)} EA</span>
                </div>
                ${_lwip <= 0 ? `<div style="text-align:center;padding:4px 0;font-size:0.78rem;color:var(--accent-red);">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span>
                    재공품 재고 없음 — 레이져 공정 완료 후 진행 가능
                </div>` : ''}`;
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
                        const qty = _paintMatBalance(matId), name = _paintMatName(matId);
                        const qc  = qty > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                        return `<td style="padding:2px 8px;font-size:0.76rem;white-space:nowrap;cursor:pointer;border-radius:4px;"
                            onclick="PaintInventoryModule.showPaintDetail('${matId}')"
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
                    <label class="form-label">도장 컬러</label>
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
            <div id="injStockPanel" data-current-plan-id="${_planId}"
                 style="display:${_injDisplay}; margin-bottom:8px; padding:10px 14px; background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <span style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:15px;">inventory_2</span>
                        사출 창고 현재고
                    </span>
                    <span id="injStockTotal" style="font-size:0.9rem; font-weight:700; color:var(--accent-blue);">${_injTotalHtml}</span>
                </div>
                <div id="injStockLots" style="font-size:0.78rem; color:var(--text-secondary); max-height:120px; overflow-y:auto;">${_injLotsHtml}</div>
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
                </div>
                <div class="form-group">
                    <label class="form-label">종료 시간 <span id="nextSlotInfo"></span></label>
                    <input type="time" class="form-input" id="sEndTime" value="${endTimeValue}">
                </div>
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

            // 휴식 시간 건너뜀
            nextStart = _skipBreak(nextStart);

            // 원래 순수 작업 시간 보존
            const origStart = _timeToMinPlan(item.startTime);
            const origEnd   = _timeToMinPlan(item.endTime);
            const workMin   = (origEnd - origStart) - _breakOverlap(origStart, origEnd);

            let newEnd = nextStart + workMin;
            newEnd += _breakOverlap(nextStart, newEnd);

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
        if (date < UIUtils.today()) {
            UIUtils.toast('지난 날짜의 계획은 저장할 수 없습니다.', 'warning');
            return;
        }

        const startTime = document.getElementById('sStartTime').value;
        const endTime = document.getElementById('sEndTime').value;
        const newSlot = startTime;
        if (!newSlot) {
            UIUtils.toast('시작 시간을 입력해주세요.', 'warning');
            return;
        }

        const carModel  = document.getElementById('sModel').value.trim();
        const partName  = document.getElementById('sPart').value.trim();
        const color     = document.getElementById('sColor').value.trim();
        const planQty   = Number(document.getElementById('sQty').value) || 0;
        const status    = document.getElementById('sStatus').value;
        const itemType  = (document.getElementById('sItemType') || {}).value || '';

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

        for (const item of allData) {
            if (item.date === date && item.line === line) {
                if (item.slot === originalSlot) {
                    existingId = item.id;
                    oldEndTime = item.endTime || '';
                } else if (!existingId && item.hourlyPlans && item.hourlyPlans[originalSlot]) {
                    oldDataParentId = item.id;
                }
            }
        }

        // ① 이후 계획 Cascade shift (Overlap 체크 전에 먼저 실행)
        if (partName && planQty > 0) {
            const currentPlanId = document.getElementById('injStockPanel')?.getAttribute('data-current-plan-id') || existingId || '';
            const stockCheck = _getInjectionAvailableForPlan(partName, carModel, color, productId, currentPlanId);
            if (stockCheck.available < planQty) {
                UIUtils.toast(`사출 창고 가용 재고보다 많은 계획은 등록할 수 없습니다. 가용 ${UIUtils.formatNumber(stockCheck.available)} EA / 계획 ${UIUtils.formatNumber(planQty)} EA`, 'warning');
                const qtyEl = document.getElementById('sQty');
                if (qtyEl) {
                    qtyEl.focus();
                    qtyEl.select();
                }
                updateInjStockPanel(partName, carModel);
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
        const freshData = Storage.getAll(STORE);
        if (endTime && newSlot && (carModel || partName || planQty > 0)) {
            for (const item of freshData) {
                if (item.date === date && item.line === line && item.id !== existingId) {
                    const iStart = item.startTime || item.slot;
                    const iEnd = item.endTime;
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

        // ④ 현재 계획 저장
        if (existingId) {
            if (!carModel && !partName && planQty === 0) {
                await Storage.remove(STORE, existingId);
            } else {
                await Storage.update(STORE, existingId, {
                    slot: newSlot, carModel, partName, color, itemType, planQty,
                    startTime, endTime, status,
                    productId: productId || undefined  // v19
                });
            }
        } else {
            if (carModel || partName || planQty > 0) {
                await Storage.add(STORE, {
                    date, line, slot: newSlot, carModel, partName, color, itemType, planQty,
                    startTime, endTime, status,
                    productId: productId || undefined  // v19
                });
            }
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
    }

    function removeSlot(slot, line) {
        UIUtils.confirm(`${slot} 시간대 계획을 삭제하시겠습니까?`, async () => {
            const date = document.getElementById('planDateFilter').value;
            if (date < UIUtils.today()) {
                UIUtils.toast('지난 날짜의 계획은 삭제할 수 없습니다.', 'warning');
                return;
            }

            const allData = Storage.getAll(STORE);
            for (const item of allData) {
                if (item.date === date && item.line === line) {
                    if (item.slot === slot) {
                        await Storage.remove(STORE, item.id);
                    } else if (item.hourlyPlans && item.hourlyPlans[slot]) {
                        delete item.hourlyPlans[slot];
                        item.planQty = Object.values(item.hourlyPlans).reduce((a, b) => a + (Number(b) || 0), 0);
                        await Storage.update(STORE, item.id, item);
                    }
                }
            }
            search();
            if (_activePlanDateModal) {
                setTimeout(() => openDayPlan(date, _activePlanLineModal), 0);
            }
            UIUtils.toast('삭제되었습니다.', 'success');
        });
    }

    function printWorkOrder(line) {
        const date = document.getElementById('planDateFilter').value;
        const allData = Storage.getAll(STORE);

        const slotData = {};
        allData.forEach(item => {
            if (item.date === date && item.line === line) {
                if (item.slot) {
                    slotData[item.slot] = item;
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
        let totalQty = 0;
        let totalMinutes = 0;
        let rowIdx = 1;

        let tableRows = allSlots.map(slot => {
            const item = slotData[slot] || {};
            const q = Number(item.planQty) || 0;

            const isLunch = (slot === '12:30' || slot === '13:00');
            const isDinner = (slot === '17:30');
            const isMealTime = isLunch || isDinner;

            if (item.carModel || item.partName || q > 0) {
                totalQty += q;

                // 식사 시간(점심 12:30~13:30, 석식 17:30~18:00) 중첩 확인 및 차감
                if (item.startTime && item.endTime) {
                    const [sH, sM] = item.startTime.split(':').map(Number);
                    const [eH, eM] = item.endTime.split(':').map(Number);
                    let sTotal = sH * 60 + sM;
                    let eTotal = eH * 60 + eM;
                    let diff = eTotal - sTotal;

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
                    if (diff > 0) totalMinutes += diff;
                }

                const isOvertimeStart = (item.startTime === '18:00' || (!item.startTime && slot === '18:00'));

                return `
                    <tr class="${isOvertimeStart ? 'overtime-row' : ''}">
                        <td style="text-align:center;">${rowIdx++}</td>
                        <td style="text-align:center;">${item.startTime || slot}${item.endTime ? ' ~ ' + item.endTime : ''}</td>
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
                let mealText = '';
                let timeRange = '';
                if (isLunch) {
                    mealText = '점심 시간 (LUNCH TIME)';
                    timeRange = slot === '12:30' ? '12:30 ~ 13:00' : '13:00 ~ 13:30';
                } else {
                    mealText = '저녁 식사 (DINNER TIME)';
                    timeRange = '17:30 ~ 18:00';
                }
                return `
                    <tr class="${isLunch ? 'lunch-time' : 'dinner-time'}" style="background-color: #f1f5f9;">
                        <td style="text-align:center;">-</td>
                        <td style="text-align:center;">${timeRange}</td>
                        <td colspan="7" style="text-align:center; font-weight:bold; color:#94a3b8;">${mealText}</td>
                    </tr>
                `;
            }
            return '';
        }).join('');

        // 총 시간을 시간/분으로 변환
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        const timeStr = totalHours > 0 ? `${totalHours}시간 ${remainingMinutes}분` : `${remainingMinutes}분`;

        const printWindow = window.open('', '_blank', 'width=1000,height=800,scrollbars=yes,resizable=yes');
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
                    .total-label { text-align:right; font-weight:bold; background:#f9f9f9; }
                    .total-value { text-align:right; font-weight:bold; background:#f9f9f9; color: #0056b3; }
                    .footer { margin-top: 30px; text-align: right; font-size: 12px; color: #666; }
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
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="2" class="total-label">총 작업 시간</td>
                            <td colspan="3" class="total-value" style="text-align:center;">${totalMinutes > 0 ? timeStr : '-'}</td>
                            <td class="total-value">${UIUtils.formatNumber(totalQty)}</td>
                            <td colspan="3" style="background:#f9f9f9; text-align:left; font-size:10px; padding-left:10px;">* 작업 시간은 자동 계산된 추정치입니다.</td>
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

        UIUtils.showModal(
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
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`
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
    function _getInjReserveDetail(injPartName, carModel, injColor) {
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

        const _matchedMats = injMats.filter(m =>
            (m.injPartName || '').trim() === _injPN &&
            (!carModel || !m.carModel || m.carModel === carModel) && _mc(m.injColor));

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
            if (m.injColor) {
                m.injColor.split(/[,，\/]/).map(c => _normalizeColorName(c)).filter(Boolean)
                    .forEach(c => planColors.add(c));
            }
        });

        if (planPartNames.size === 0) {
            return { pendingPlans: [], inProgressPlans: [], pendingTotal: 0, inProgressTotal: 0 };
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

        const allPlans       = Storage.getAll(STORE) || [];
        const pendingPlans   = [];
        const inProgressPlans = [];

        allPlans.forEach(p => {
            const byId   = p.productId && _productIdSet.has(p.productId);
            const byName = !byId && planPartNames.has((p.partName || '').trim());
            if (!byId && !byName) return;
            if (!_colorOk(p.color)) return;

            const qty  = Number(p.planQty) || 0;
            const info = { id: p.id, date: p.date || '', partName: p.partName || '', color: p.color || '',
                           planQty: qty, status: p.status || '', line: p.line || '' };
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

        return {
            pendingPlans,
            inProgressPlans,
            pendingTotal:    pendingPlans.reduce((s, p) => s + p.planQty, 0),
            inProgressTotal: inProgressPlans.reduce((s, p) => s + p.planQty, 0)
        };
    }

    return {
        render,
        search,
        selectDate,
        renderDateNav,
        renderCalendar,
        openDayPlan,
        closeDayPlan,
        prevMonth,
        nextMonth,
        goToday,
        editSlot,
        saveSlot,
        removeSlot,
        printWorkOrder,
        updateDropdowns,
        calcEndTime,
        updateInjStockPanel,
        updateLaserWipPanel,
        updatePaintStockPanel,
        _autoFillItemType,
        autoUpdateStatus,
        _showInjLotPopup,
        _calcInjPlanReserved,
        _getInjReserveDetail
    };
})();
