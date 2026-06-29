/**
 * 연장근무계획 모듈
 * 평일 잔업 시간(18:00~20:00)에 공정별 추가 작업 계획을 등록한다.
 */

const OvertimePlanModule = (function () {
    const STORE = DB.STORES.OVERTIME_PLANS;
    const PROCESS_OPTIONS = ['도장-A', '도장-B', '정비', '추가 검사', '레이저', '출하검사', '기타'];
    const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
    const TIME_SLOTS = buildTimeSlots();

    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth() + 1;
    let activeDate = '';
    let satExpanded = false;

    const FIXED_HOLIDAYS = {
        '01-01': '신정',
        '03-01': '삼일절',
        '05-01': '근로자의 날',
        '05-05': '어린이날',
        '06-06': '현충일',
        '08-15': '광복절',
        '10-03': '개천절',
        '10-09': '한글날',
        '12-25': '성탄절'
    };

    const LUNAR_HOLIDAYS = {
        '2024-02-09': '설연휴', '2024-02-10': '설날', '2024-02-11': '설연휴', '2024-02-12': '대체공휴일',
        '2025-01-28': '설연휴', '2025-01-29': '설날', '2025-01-30': '설연휴',
        '2026-02-16': '설연휴', '2026-02-17': '설날', '2026-02-18': '설연휴', '2026-02-19': '대체공휴일',
        '2024-05-15': '부처님오신날', '2025-05-06': '부처님오신날', '2026-05-24': '부처님오신날',
        '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
        '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일',
        '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴', '2026-09-27': '대체공휴일'
    };

    function buildTimeSlots() {
        const slots = [];
        for (let hour = 18; hour <= 19; hour += 1) {
            for (let minute = 0; minute < 60; minute += 10) {
                slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
            }
        }
        slots.push('20:00');
        return slots;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toMinutes(timeText) {
        if (!timeText || !timeText.includes(':')) return -1;
        const [hour, minute] = timeText.split(':').map(Number);
        return hour * 60 + minute;
    }

    function addMinutes(timeText, diff) {
        const minutes = toMinutes(timeText);
        if (minutes < 0) return '';
        const next = minutes + diff;
        return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    }

    function currentUserName() {
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function') {
                return AuthModule.getCurrentUser()?.name || '';
            }
        } catch (_) {}
        return '';
    }

    function allPlans() {
        return (Storage.getAll(STORE) || []).slice().sort((a, b) => {
            return String(a.date || '').localeCompare(String(b.date || ''))
                || String(a.startTime || '').localeCompare(String(b.startTime || ''))
                || String(a.process || '').localeCompare(String(b.process || ''));
        });
    }

    function plansByDate() {
        const map = {};
        allPlans().forEach((plan) => {
            if (!plan.date) return;
            if (!map[plan.date]) map[plan.date] = [];
            map[plan.date].push(plan);
        });
        return map;
    }

    function getHoliday(dateStr) {
        return FIXED_HOLIDAYS[dateStr.slice(5)] || LUNAR_HOLIDAYS[dateStr] || '';
    }

    function getProcessTone(process) {
        const map = {
            '도장-A': { bg: 'rgba(37,99,235,0.10)', color: '#2563eb', border: 'rgba(37,99,235,0.28)' },
            '도장-B': { bg: 'rgba(249,115,22,0.10)', color: '#f97316', border: 'rgba(249,115,22,0.28)' },
            '정비': { bg: 'rgba(100,116,139,0.10)', color: '#475569', border: 'rgba(100,116,139,0.28)' },
            '추가 검사': { bg: 'rgba(34,197,94,0.10)', color: '#16a34a', border: 'rgba(34,197,94,0.28)' },
            '레이저': { bg: 'rgba(124,58,237,0.10)', color: '#7c3aed', border: 'rgba(124,58,237,0.28)' },
            '출하검사': { bg: 'rgba(14,165,233,0.10)', color: '#0284c7', border: 'rgba(14,165,233,0.28)' },
            '기타': { bg: 'rgba(15,118,110,0.10)', color: '#0f766e', border: 'rgba(15,118,110,0.28)' }
        };
        return map[process] || { bg: 'rgba(99,102,241,0.10)', color: '#4f46e5', border: 'rgba(99,102,241,0.28)' };
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header" style="display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
                    <button class="btn btn-primary" onclick="OvertimePlanModule.openDayModal('${UIUtils.today()}')">
                        <span class="material-symbols-outlined">add</span> 오늘 계획 등록
                    </button>
                </div>
                <div class="card" style="margin-bottom:14px;">
                    <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <button class="btn btn-outline" onclick="OvertimePlanModule.prevMonth()"><span class="material-symbols-outlined">chevron_left</span></button>
                            <h4 id="otCalendarTitle" style="margin:0;min-width:170px;text-align:center;font-size:1.2rem;"></h4>
                            <button class="btn btn-outline" onclick="OvertimePlanModule.nextMonth()"><span class="material-symbols-outlined">chevron_right</span></button>
                            <button class="btn btn-secondary btn-sm" onclick="OvertimePlanModule.goToday()">오늘</button>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.8rem;color:var(--text-muted);">
                            ${PROCESS_OPTIONS.slice(0, 6).map((process) => {
                                const tone = getProcessTone(process);
                                return `<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:${tone.color};display:inline-block;"></span>${process}</span>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div id="overtimeCalendar" style="overflow-x:auto;"></div>
                    </div>
                </div>
            </div>
        `;
        renderCalendar();
    }

    function renderCalendar() {
        const titleEl = document.getElementById('otCalendarTitle');
        const calEl = document.getElementById('overtimeCalendar');
        if (!calEl) return;
        if (titleEl) titleEl.textContent = `${calYear}년 ${calMonth}월`;

        const firstDow = new Date(calYear, calMonth - 1, 1).getDay();
        const lastDay = new Date(calYear, calMonth, 0).getDate();
        const today = UIUtils.today();
        const byDate = plansByDate();
        const dayColors = ['#ef4444', '#64748b', '#64748b', '#64748b', '#64748b', '#64748b', '#2563eb'];

        let html = `
            <div style="border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.07),0 4px 18px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
                <table style="width:100%;border-collapse:collapse;min-width:780px;table-layout:fixed;">
                    <colgroup>
                        <col style="width:38px;">
                        <col><col><col><col><col>
                        <col style="${satExpanded ? '' : 'width:72px;'}">
                    </colgroup>
                    <thead><tr style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);">
                        ${DAY_KO.map((day, index) => {
                            const isSat = index === 6;
                            const extra = isSat ? `<span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;margin-left:2px;">${satExpanded ? 'chevron_left' : 'chevron_right'}</span>` : '';
                            const clickAttr = isSat ? `onclick="event.stopPropagation();OvertimePlanModule.toggleSat()" style="cursor:pointer;" title="${satExpanded ? '토요일 축소' : '토요일 확장'}"` : '';
                            return `<th ${clickAttr} style="padding:12px ${index === 0 ? '2px' : '8px'};text-align:center;font-size:0.8rem;font-weight:800;color:${dayColors[index]};border-bottom:2px solid #e2e8f0;letter-spacing:0.5px;user-select:none;">${day}${extra}</th>`;
                        }).join('')}
                    </tr></thead>
                    <tbody>
        `;

        const rows = Math.ceil((firstDow + lastDay) / 7);
        let day = 1;
        for (let row = 0; row < rows; row += 1) {
            html += '<tr style="vertical-align:top;">';
            for (let col = 0; col < 7; col += 1) {
                const blank = (row === 0 && col < firstDow) || day > lastDay;
                if (blank) {
                    const blankBg = col === 0 ? 'rgba(254,242,242,0.5)' : col === 6 ? 'rgba(239,246,255,0.5)' : '#f8fafc';
                    html += `<td style="height:160px;border:1px solid #e2e8f0;background:${blankBg};"></td>`;
                    continue;
                }

                const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const plans = (byDate[dateStr] || []).slice().sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
                const isToday = dateStr === today;
                const isSun = col === 0;
                const isSat = col === 6;
                const holiday = getHoliday(dateStr);
                const cellBg = isToday ? '#eff6ff' : isSun ? 'rgba(254,242,242,0.5)' : isSat ? 'rgba(239,246,255,0.4)' : (holiday ? 'rgba(254,242,242,0.3)' : '#fff');
                const dayNumStyle = isToday
                    ? 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#2563eb;font-size:0.78rem;font-weight:800;color:#fff;'
                    : `font-size:0.88rem;font-weight:800;color:${isSun || holiday ? '#ef4444' : isSat ? '#2563eb' : 'var(--text-primary)'};`;
                const countBadge = plans.length ? `<span style="font-size:0.6rem;font-weight:700;padding:1px 7px;background:rgba(99,102,241,0.1);color:#4f46e5;border-radius:99px;">${plans.length}</span>` : '';

                if (isSun || (isSat && !satExpanded)) {
                    const hoverBg = isSun ? '#fee2e2' : '#dbeafe';
                    const clickFn = isSat ? 'OvertimePlanModule.toggleSat()' : `OvertimePlanModule.openDayModal('${dateStr}')`;
                    html += `
                        <td onclick="${clickFn}" style="height:160px;padding:6px 2px;border:1px solid #e2e8f0;background:${cellBg};cursor:pointer;vertical-align:top;text-align:center;transition:background 0.12s;"
                            onmouseover="this.style.background='${hoverBg}';" onmouseout="this.style.background='${cellBg}';">
                            <span style="${dayNumStyle}">${day}</span>
                            ${holiday ? `<div style="font-size:0.5rem;font-weight:700;color:#ef4444;margin-top:2px;line-height:1.2;word-break:break-all;">${holiday}</div>` : ''}
                            ${isSat && plans.length ? `<span style="display:block;margin-top:3px;font-size:0.58rem;font-weight:700;color:#2563eb;background:rgba(37,99,235,0.1);border-radius:99px;padding:1px 4px;">${plans.length}</span>` : ''}
                        </td>`;
                } else {
                    html += `
                        <td onclick="OvertimePlanModule.openDayModal('${dateStr}')" style="height:160px;padding:7px 7px;border:1px solid #e2e8f0;background:${cellBg};cursor:pointer;vertical-align:top;transition:background 0.12s,box-shadow 0.12s;"
                            onmouseover="this.style.background='#f1f5f9';this.style.boxShadow='inset 0 0 0 1.5px #94a3b8';" onmouseout="this.style.background='${cellBg}';this.style.boxShadow='';">
                            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;margin-bottom:5px;">
                                <div>
                                    <span style="${dayNumStyle}">${day}</span>
                                    ${holiday ? `<div style="font-size:0.58rem;font-weight:700;color:#ef4444;line-height:1.2;margin-top:1px;white-space:nowrap;">${holiday}</div>` : ''}
                                </div>
                                ${countBadge}
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;overflow:hidden;max-height:${holiday ? '96px' : '108px'};">
                                ${plans.slice(0, 3).map((plan) => {
                                    const tone = getProcessTone(plan.process);
                                    return `<div style="display:flex;align-items:center;gap:3px;padding:3px 5px;border-radius:6px;background:${tone.bg};border:1px solid ${tone.border};min-width:0;">
                                        <span style="font-size:0.62rem;font-weight:800;color:${tone.color};white-space:nowrap;flex-shrink:0;">${escapeHtml(plan.process)}</span>
                                        <span style="font-size:0.62rem;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">${escapeHtml(plan.startTime)}~${escapeHtml(plan.endTime)}</span>
                                        <span style="font-size:0.65rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${escapeHtml(plan.taskName)}</span>
                                    </div>`;
                                }).join('')}
                                ${plans.length > 3 ? `<span style="font-size:0.65rem;color:var(--text-muted);">+${plans.length - 3}건</span>` : ''}
                            </div>
                        </td>`;
                }
                day += 1;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        calEl.innerHTML = html;
    }

    function toggleSat() {
        satExpanded = !satExpanded;
        renderCalendar();
    }

    function openDayModal(dateStr) {
        activeDate = dateStr;
        const plans = allPlans().filter((plan) => plan.date === dateStr);
        const planMap = {};
        plans.forEach((plan) => { planMap[plan.startTime] = plan; });

        UIUtils.showModal(
            `${dateStr} 연장근무계획`,
            `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div style="padding:14px 16px;border-radius:12px;background:linear-gradient(135deg, rgba(37,99,235,0.08), rgba(249,115,22,0.06));border:1px solid rgba(148,163,184,0.22);">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${escapeHtml(dateStr)} (${DAY_KO[new Date(dateStr).getDay()]})</div>
                            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">평일 작업 시간 18:00~20:00에 진행할 정비, 추가 검사, 레이저, 출하검사 등의 계획을 등록합니다.</div>
                        </div>
                        <button class="btn btn-primary" onclick="OvertimePlanModule.openEntryModal('${dateStr}', '', '18:00')"><span class="material-symbols-outlined">add</span> 작업 등록</button>
                    </div>
                </div>
                <div class="card" style="margin:0;">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                        <h4 style="margin:0;">작업 시간표</h4>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${plans.length}건 등록</span>
                    </div>
                    <div class="card-body p-0">
                        <div style="overflow-x:auto;">
                            <table class="data-table">
                                <thead>
                                    <tr><th style="width:120px;">시간</th><th style="width:120px;">공정</th><th>작업 내용</th><th style="width:140px;">작업자</th><th style="width:180px;">비고</th><th style="width:120px;text-align:center;">작업</th></tr>
                                </thead>
                                <tbody>
                                    ${TIME_SLOTS.slice(0, -1).map((slot, index) => {
                                        const endSlot = TIME_SLOTS[index + 1];
                                        const plan = planMap[slot];
                                        if (plan) {
                                            const tone = getProcessTone(plan.process);
                                            return `<tr style="background:${tone.bg};"><td style="font-weight:700;">${slot} ~ ${endSlot}</td><td><span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#fff;color:${tone.color};border:1px solid ${tone.border};font-size:0.75rem;font-weight:700;">${escapeHtml(plan.process)}</span></td><td><div style="font-weight:700;color:var(--text-primary);">${escapeHtml(plan.taskName)}</div>${plan.detail ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:3px;white-space:pre-wrap;">${escapeHtml(plan.detail)}</div>` : ''}</td><td>${escapeHtml(plan.workerName || '-')}</td><td style="font-size:0.78rem;color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(plan.memo || '-')}</td><td style="text-align:center;"><div style="display:flex;gap:6px;justify-content:center;"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();OvertimePlanModule.openEntryModal('${dateStr}','${plan.id}')">수정</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();OvertimePlanModule.removePlan('${plan.id}')">삭제</button></div></td></tr>`;
                                        }
                                        const occupied = plans.some((item) => toMinutes(slot) > toMinutes(item.startTime) && toMinutes(slot) < toMinutes(item.endTime));
                                        return `<tr style="background:${occupied ? 'rgba(148,163,184,0.08)' : '#fff'};cursor:${occupied ? 'default' : 'pointer'};" ${occupied ? '' : `onclick="OvertimePlanModule.openEntryModal('${dateStr}', '', '${slot}')"`}><td>${slot} ~ ${endSlot}</td><td style="color:var(--text-muted);">${occupied ? '진행 중 구간' : '-'}</td><td style="color:var(--text-muted);">${occupied ? '이 시간대에는 이미 등록된 작업이 이어집니다.' : '클릭하여 이 시간대에 작업 등록'}</td><td style="color:var(--text-muted);">-</td><td style="color:var(--text-muted);">-</td><td style="text-align:center;color:var(--text-muted);">${occupied ? '-' : '등록'}</td></tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'xl'
        );
    }

    function openEntryModal(dateStr, planId, defaultStartTime) {
        const plan = planId ? Storage.getById(STORE, planId) : null;
        const startTime = plan?.startTime || defaultStartTime || '18:00';
        const endTime = plan?.endTime || addMinutes(startTime, 10) || '18:10';
        const process = plan?.process || '';
        const workerName = plan?.workerName || currentUserName();

        UIUtils.showModal(
            plan ? '연장근무계획 수정' : '연장근무계획 등록',
            `
            <input type="hidden" id="otPlanId" value="${escapeHtml(plan?.id || '')}">
            <input type="hidden" id="otPlanDate" value="${escapeHtml(dateStr)}">
            <div class="form-row">
                <div class="form-group"><label class="form-label">계획일</label><input class="form-input" value="${escapeHtml(dateStr)}" readonly></div>
                <div class="form-group"><label class="form-label">공정 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="otProcess"><option value="">-- 공정 선택 --</option>${PROCESS_OPTIONS.map((item) => `<option value="${escapeHtml(item)}" ${item === process ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">시작 시간 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="otStartTime" onchange="OvertimePlanModule.syncEndTime()">${TIME_SLOTS.slice(0, -1).map((time) => `<option value="${time}" ${time === startTime ? 'selected' : ''}>${time}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">완료 시간 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="otEndTime">${TIME_SLOTS.slice(1).map((time) => `<option value="${time}" ${time === endTime ? 'selected' : ''}>${time}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">작업자 <span style="color:var(--accent-red)">*</span></label><input class="form-input" id="otWorkerName" value="${escapeHtml(workerName)}" placeholder="작업자 이름"></div>
            </div>
            <div class="form-group"><label class="form-label">작업 내용 <span style="color:var(--accent-red)">*</span></label><input class="form-input" id="otTaskName" value="${escapeHtml(plan?.taskName || '')}" placeholder="예: 레이저 추가 작업, 출하검사 보완 검사, 도장-B 설비 정비"></div>
            <div class="form-group"><label class="form-label">상세 내용</label><textarea class="form-input" id="otDetail" rows="3" style="resize:vertical;" placeholder="작업 목적, 대상, 준비 사항 등을 입력합니다.">${escapeHtml(plan?.detail || '')}</textarea></div>
            <div class="form-group"><label class="form-label">비고</label><textarea class="form-input" id="otMemo" rows="2" style="resize:vertical;" placeholder="특이사항">${escapeHtml(plan?.memo || '')}</textarea></div>
            `,
            `<button class="btn btn-secondary" onclick="OvertimePlanModule.reopenDayModal()">취소</button><button class="btn btn-primary" onclick="OvertimePlanModule.savePlan()">저장</button>`,
            'lg'
        );

        setTimeout(syncEndTime, 0);
    }

    function syncEndTime() {
        const startEl = document.getElementById('otStartTime');
        const endEl = document.getElementById('otEndTime');
        if (!startEl || !endEl) return;
        const startMinutes = toMinutes(startEl.value);
        const currentEnd = endEl.value;
        endEl.innerHTML = TIME_SLOTS.filter((time) => toMinutes(time) > startMinutes).map((time) => `<option value="${time}">${time}</option>`).join('');
        if ([...endEl.options].some((opt) => opt.value === currentEnd && toMinutes(currentEnd) > startMinutes)) {
            endEl.value = currentEnd;
        } else if (endEl.options.length > 0) {
            endEl.selectedIndex = 0;
        }
    }

    async function savePlan() {
        const planId = (document.getElementById('otPlanId') || {}).value || '';
        const date = (document.getElementById('otPlanDate') || {}).value || '';
        const process = ((document.getElementById('otProcess') || {}).value || '').trim();
        const startTime = (document.getElementById('otStartTime') || {}).value || '';
        const endTime = (document.getElementById('otEndTime') || {}).value || '';
        const workerName = ((document.getElementById('otWorkerName') || {}).value || '').trim();
        const taskName = ((document.getElementById('otTaskName') || {}).value || '').trim();
        const detail = ((document.getElementById('otDetail') || {}).value || '').trim();
        const memo = ((document.getElementById('otMemo') || {}).value || '').trim();

        if (!date || !process || !startTime || !endTime || !workerName || !taskName) {
            UIUtils.toast('필수 항목을 모두 입력해주세요.', 'warning');
            return;
        }
        if (toMinutes(endTime) <= toMinutes(startTime)) {
            UIUtils.toast('완료 시간은 시작 시간보다 늦어야 합니다.', 'warning');
            return;
        }

        const entries = allPlans().filter((plan) => plan.date === date && plan.id !== planId);
        const newStart = toMinutes(startTime);
        const newEnd = toMinutes(endTime);
        const overlap = entries.find((plan) => newStart < toMinutes(plan.endTime) && newEnd > toMinutes(plan.startTime));
        if (overlap) {
            UIUtils.toast(`${overlap.startTime}~${overlap.endTime}에 등록된 "${overlap.taskName}" 작업과 시간이 겹칩니다.`, 'warning');
            return;
        }

        const payload = {
            date,
            process,
            startTime,
            endTime,
            workerName,
            taskName,
            detail,
            memo,
            durationMin: toMinutes(endTime) - toMinutes(startTime)
        };

        if (planId) {
            await Storage.update(STORE, planId, payload);
        } else {
            await Storage.add(STORE, payload);
        }

        UIUtils.toast('연장근무계획이 저장되었습니다.', 'success');
        UIUtils.closeModal();
        renderCalendar();
        if (activeDate) setTimeout(() => openDayModal(activeDate), 0);
    }

    function removePlan(planId) {
        const plan = Storage.getById(STORE, planId);
        if (!plan) {
            UIUtils.toast('삭제할 계획을 찾지 못했습니다.', 'warning');
            return;
        }
        UIUtils.confirm(`"${plan.taskName}" 계획을 삭제하시겠습니까?`, async () => {
            await Storage.remove(STORE, planId);
            UIUtils.toast('연장근무계획을 삭제했습니다.', 'success');
            renderCalendar();
            if (activeDate) setTimeout(() => openDayModal(activeDate), 0);
        });
    }

    function reopenDayModal() {
        if (activeDate) openDayModal(activeDate);
        else UIUtils.closeModal();
    }

    function prevMonth() {
        calMonth -= 1;
        if (calMonth < 1) {
            calMonth = 12;
            calYear -= 1;
        }
        renderCalendar();
    }

    function nextMonth() {
        calMonth += 1;
        if (calMonth > 12) {
            calMonth = 1;
            calYear += 1;
        }
        renderCalendar();
    }

    function goToday() {
        const today = new Date();
        calYear = today.getFullYear();
        calMonth = today.getMonth() + 1;
        renderCalendar();
        openDayModal(UIUtils.today());
    }

    return {
        render,
        renderCalendar,
        toggleSat,
        openDayModal,
        openEntryModal,
        reopenDayModal,
        savePlan,
        removePlan,
        prevMonth,
        nextMonth,
        goToday,
        syncEndTime
    };
})();
