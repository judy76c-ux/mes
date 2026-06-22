/**
 * 연장근무계획 모듈
 * 도장 공정 관련 잔업/정비/추가 검사 작업을 달력 기반으로 등록한다.
 */

const OvertimePlanModule = (function() {
    const STORE = DB.STORES.OVERTIME_PLANS;
    const PROCESS_OPTIONS = ['도장-A', '도장-B', '정비', '추가 검사', '레이져', '출하검사', '기타'];
    const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
    const TIME_SLOTS = _buildTimeSlots();

    let _calYear = new Date().getFullYear();
    let _calMonth = new Date().getMonth() + 1;
    let _activeDate = '';

    function _buildTimeSlots() {
        const slots = [];
        for (let hour = 18; hour <= 19; hour += 1) {
            for (let minute = 0; minute < 60; minute += 10) {
                slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
            }
        }
        slots.push('20:00');
        return slots;
    }

    function _toMinutes(timeText) {
        if (!timeText || !timeText.includes(':')) return -1;
        const [hour, minute] = timeText.split(':').map(Number);
        return hour * 60 + minute;
    }

    function _addMinutes(timeText, diff) {
        const minutes = _toMinutes(timeText);
        if (minutes < 0) return '';
        const next = minutes + diff;
        return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    }

    function _escape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _currentUserName() {
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function') {
                return AuthModule.getCurrentUser()?.name || '';
            }
        } catch (_) {}
        return '';
    }

    function _allPlans() {
        return (Storage.getAll(STORE) || []).slice().sort((a, b) => {
            return String(a.date || '').localeCompare(String(b.date || '')) ||
                String(a.startTime || '').localeCompare(String(b.startTime || '')) ||
                String(a.process || '').localeCompare(String(b.process || ''));
        });
    }

    function _plansByDate() {
        const map = {};
        _allPlans().forEach((plan) => {
            const key = plan.date || '';
            if (!key) return;
            if (!map[key]) map[key] = [];
            map[key].push(plan);
        });
        return map;
    }

    function _processColor(process) {
        const map = {
            '도장-A': { bg: 'rgba(37,99,235,0.10)', color: '#2563eb', border: 'rgba(37,99,235,0.30)' },
            '도장-B': { bg: 'rgba(249,115,22,0.10)', color: '#f97316', border: 'rgba(249,115,22,0.30)' },
            '정비': { bg: 'rgba(107,114,128,0.12)', color: '#4b5563', border: 'rgba(107,114,128,0.30)' },
            '추가 검사': { bg: 'rgba(22,163,74,0.10)', color: '#16a34a', border: 'rgba(22,163,74,0.30)' },
            '레이져': { bg: 'rgba(124,58,237,0.10)', color: '#7c3aed', border: 'rgba(124,58,237,0.30)' },
            '출하검사': { bg: 'rgba(14,165,233,0.10)', color: '#0284c7', border: 'rgba(14,165,233,0.30)' },
            '기타': { bg: 'rgba(15,118,110,0.10)', color: '#0f766e', border: 'rgba(15,118,110,0.30)' }
        };
        return map[process] || { bg: 'rgba(99,102,241,0.10)', color: '#4f46e5', border: 'rgba(99,102,241,0.30)' };
    }

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
                    <div>
                        <h3 style="margin:0 0 6px;">연장근무계획</h3>
                        <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">평일 잔업 시간(18:00~20:00)에 진행할 정비, 추가 검사, 레이져, 출하검사 등의 작업 계획을 등록합니다.</p>
                    </div>
                    <button class="btn btn-primary" onclick="OvertimePlanModule.openDayModal('${UIUtils.today()}')">
                        <span class="material-symbols-outlined">add</span> 오늘 계획 등록
                    </button>
                </div>

                <div class="card" style="margin-bottom:14px;">
                    <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <button class="btn btn-outline" onclick="OvertimePlanModule.prevMonth()">
                                <span class="material-symbols-outlined">chevron_left</span>
                            </button>
                            <h4 id="otCalendarTitle" style="margin:0;min-width:170px;text-align:center;font-size:1.2rem;"></h4>
                            <button class="btn btn-outline" onclick="OvertimePlanModule.nextMonth()">
                                <span class="material-symbols-outlined">chevron_right</span>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="OvertimePlanModule.goToday()">오늘</button>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.8rem;color:var(--text-muted);">
                            <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:#2563eb;display:inline-block;"></span>도장-A</span>
                            <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:#f97316;display:inline-block;"></span>도장-B</span>
                            <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:#7c3aed;display:inline-block;"></span>레이져</span>
                            <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:#16a34a;display:inline-block;"></span>추가 검사</span>
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

        if (titleEl) titleEl.textContent = `${_calYear}년 ${_calMonth}월`;

        const firstDow = new Date(_calYear, _calMonth - 1, 1).getDay();
        const lastDay = new Date(_calYear, _calMonth, 0).getDate();
        const today = UIUtils.today();
        const byDate = _plansByDate();

        let html = `
            <table style="width:100%;border-collapse:collapse;min-width:840px;table-layout:fixed;">
                <thead>
                    <tr>
                        ${DAY_KO.map((day, index) => `
                            <th style="padding:10px 6px;text-align:center;font-size:0.86rem;font-weight:700;color:${index === 0 ? 'var(--accent-red)' : index === 6 ? 'var(--accent-blue)' : 'var(--text-secondary)'};border-bottom:2px solid var(--border-color);">${day}</th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        let day = 1;
        const rows = Math.ceil((firstDow + lastDay) / 7);
        for (let row = 0; row < rows; row += 1) {
            html += '<tr style="vertical-align:top;">';
            for (let col = 0; col < 7; col += 1) {
                const blank = (row === 0 && col < firstDow) || day > lastDay;
                if (blank) {
                    html += `<td style="height:178px;border:1px solid var(--border-color);background:var(--bg-secondary);"></td>`;
                    continue;
                }

                const dateStr = `${_calYear}-${String(_calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const plans = (byDate[dateStr] || []).slice().sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
                const isToday = dateStr === today;
                const dayColor = col === 0 ? 'var(--accent-red)' : col === 6 ? 'var(--accent-blue)' : 'var(--text-primary)';

                html += `
                    <td onclick="OvertimePlanModule.openDayModal('${dateStr}')"
                        style="height:178px;padding:8px;border:1px solid var(--border-color);background:${isToday ? 'rgba(37,99,235,0.05)' : '#fff'};cursor:pointer;vertical-align:top;${isToday ? 'box-shadow:inset 0 0 0 2px var(--accent-blue);' : ''}"
                        onmouseover="this.style.background='rgba(241,245,249,0.9)'"
                        onmouseout="this.style.background='${isToday ? 'rgba(37,99,235,0.05)' : '#fff'}'">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;">
                            <span style="font-size:0.95rem;font-weight:800;color:${dayColor};">${day}</span>
                            ${plans.length ? `<span style="font-size:0.72rem;color:var(--text-muted);">${plans.length}건</span>` : ''}
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${plans.slice(0, 4).map((plan) => {
                                const tone = _processColor(plan.process);
                                return `
                                    <div style="padding:6px 7px;border-radius:8px;background:${tone.bg};border:1px solid ${tone.border};min-width:0;">
                                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                                            <span style="font-size:0.69rem;font-weight:800;color:${tone.color};white-space:nowrap;">${_escape(plan.process)}</span>
                                            <span style="font-size:0.68rem;color:var(--text-muted);white-space:nowrap;">${_escape(plan.startTime)}~${_escape(plan.endTime)}</span>
                                        </div>
                                        <div style="font-size:0.76rem;font-weight:700;color:var(--text-primary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escape(plan.taskName)}</div>
                                    </div>
                                `;
                            }).join('')}
                            ${plans.length > 4 ? `<div style="font-size:0.72rem;color:var(--text-muted);padding-left:2px;">+${plans.length - 4}건 더 있음</div>` : ''}
                            ${!plans.length ? `<div style="font-size:0.76rem;color:var(--text-muted);padding-top:16px;">등록된 연장근무 계획이 없습니다.</div>` : ''}
                        </div>
                    </td>
                `;
                day += 1;
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        calEl.innerHTML = html;
    }

    function openDayModal(dateStr) {
        _activeDate = dateStr;
        const plans = _allPlans().filter((plan) => plan.date === dateStr);
        const planMap = {};
        plans.forEach((plan) => {
            planMap[plan.startTime] = plan;
        });

        UIUtils.showModal(
            `${dateStr} 연장근무계획`,
            `
            <div style="display:flex;flex-direction:column;gap:14px;">
                <div style="padding:14px 16px;border-radius:12px;background:linear-gradient(135deg, rgba(37,99,235,0.08), rgba(249,115,22,0.06));border:1px solid rgba(148,163,184,0.22);">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${_escape(dateStr)} (${DAY_KO[new Date(dateStr).getDay()]})</div>
                            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">평일 잔업 시간 18:00 ~ 20:00, 10분 단위 등록</div>
                        </div>
                        <button class="btn btn-primary" onclick="OvertimePlanModule.openEntryModal('${dateStr}', '', '18:00')">
                            <span class="material-symbols-outlined">add</span> 작업 등록
                        </button>
                    </div>
                </div>

                <div class="card" style="margin:0;">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                        <h4 style="margin:0;">잔업 시간표</h4>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${plans.length}건 등록</span>
                    </div>
                    <div class="card-body p-0">
                        <div style="overflow-x:auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="width:120px;">시간</th>
                                        <th style="width:120px;">공정</th>
                                        <th>작업 내용</th>
                                        <th style="width:140px;">작업자</th>
                                        <th style="width:180px;">비고</th>
                                        <th style="width:120px;text-align:center;">작업</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${TIME_SLOTS.slice(0, -1).map((slot, index) => {
                                        const endSlot = TIME_SLOTS[index + 1];
                                        const plan = planMap[slot];
                                        if (plan) {
                                            const tone = _processColor(plan.process);
                                            return `
                                                <tr style="background:${tone.bg};">
                                                    <td style="font-weight:700;">${slot} ~ ${endSlot}</td>
                                                    <td><span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#fff;color:${tone.color};border:1px solid ${tone.border};font-size:0.75rem;font-weight:700;">${_escape(plan.process)}</span></td>
                                                    <td>
                                                        <div style="font-weight:700;color:var(--text-primary);">${_escape(plan.taskName)}</div>
                                                        ${plan.detail ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:3px;white-space:pre-wrap;">${_escape(plan.detail)}</div>` : ''}
                                                    </td>
                                                    <td>${_escape(plan.workerName || '-')}</td>
                                                    <td style="font-size:0.78rem;color:var(--text-secondary);white-space:pre-wrap;">${_escape(plan.memo || '-')}</td>
                                                    <td style="text-align:center;">
                                                        <div style="display:flex;gap:6px;justify-content:center;">
                                                            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();OvertimePlanModule.openEntryModal('${dateStr}','${plan.id}')">수정</button>
                                                            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();OvertimePlanModule.removePlan('${plan.id}')">삭제</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `;
                                        }

                                        const occupied = plans.some((item) => _toMinutes(slot) > _toMinutes(item.startTime) && _toMinutes(slot) < _toMinutes(item.endTime));
                                        return `
                                            <tr style="background:${occupied ? 'rgba(148,163,184,0.08)' : '#fff'};cursor:${occupied ? 'default' : 'pointer'};"
                                                ${occupied ? '' : `onclick="OvertimePlanModule.openEntryModal('${dateStr}', '', '${slot}')"`}>
                                                <td>${slot} ~ ${endSlot}</td>
                                                <td style="color:var(--text-muted);">${occupied ? '진행 중 구간' : '-'}</td>
                                                <td style="color:var(--text-muted);">${occupied ? '앞 시간에 등록된 작업이 이어집니다.' : '클릭하여 이 시간대에 작업 등록'}</td>
                                                <td style="color:var(--text-muted);">-</td>
                                                <td style="color:var(--text-muted);">-</td>
                                                <td style="text-align:center;color:var(--text-muted);">${occupied ? '-' : '등록'}</td>
                                            </tr>
                                        `;
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
        const endTime = plan?.endTime || _addMinutes(startTime, 10) || '18:10';
        const process = plan?.process || '';
        const workerName = plan?.workerName || _currentUserName();

        UIUtils.showModal(
            `${plan ? '연장근무계획 수정' : '연장근무계획 등록'}`,
            `
            <input type="hidden" id="otPlanId" value="${_escape(plan?.id || '')}">
            <input type="hidden" id="otPlanDate" value="${_escape(dateStr)}">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">계획일</label>
                    <input class="form-input" value="${_escape(dateStr)}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">공정 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="otProcess">
                        <option value="">-- 공정 선택 --</option>
                        ${PROCESS_OPTIONS.map((item) => `<option value="${_escape(item)}" ${item === process ? 'selected' : ''}>${_escape(item)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">시작 시간 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="otStartTime" onchange="OvertimePlanModule.syncEndTime()">
                        ${TIME_SLOTS.slice(0, -1).map((time) => `<option value="${time}" ${time === startTime ? 'selected' : ''}>${time}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">완료 시간 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="otEndTime">
                        ${TIME_SLOTS.slice(1).map((time) => `<option value="${time}" ${time === endTime ? 'selected' : ''}>${time}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">작업자 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="otWorkerName" value="${_escape(workerName)}" placeholder="작업자 이름">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">작업 내용 <span style="color:var(--accent-red)">*</span></label>
                <input class="form-input" id="otTaskName" value="${_escape(plan?.taskName || '')}" placeholder="예: 레이져 추가 작업, 출하검사 보완 검사, 도장-B 설비 정비">
            </div>
            <div class="form-group">
                <label class="form-label">상세 내용</label>
                <textarea class="form-input" id="otDetail" rows="3" style="resize:vertical;" placeholder="작업 목적, 대상 품목, 준비 사항 등을 적습니다.">${_escape(plan?.detail || '')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-input" id="otMemo" rows="2" style="resize:vertical;" placeholder="특이사항">${_escape(plan?.memo || '')}</textarea>
            </div>
            `,
            `
            <button class="btn btn-secondary" onclick="OvertimePlanModule.reopenDayModal()">취소</button>
            <button class="btn btn-primary" onclick="OvertimePlanModule.savePlan()">저장</button>
            `,
            'lg'
        );

        setTimeout(syncEndTime, 0);
    }

    function syncEndTime() {
        const startEl = document.getElementById('otStartTime');
        const endEl = document.getElementById('otEndTime');
        if (!startEl || !endEl) return;

        const startMinutes = _toMinutes(startEl.value);
        const currentEnd = endEl.value;
        endEl.innerHTML = TIME_SLOTS.filter((time) => _toMinutes(time) > startMinutes).map((time) => `<option value="${time}">${time}</option>`).join('');
        if ([...endEl.options].some((opt) => opt.value === currentEnd && _toMinutes(currentEnd) > startMinutes)) {
            endEl.value = currentEnd;
        } else if (endEl.options.length > 0) {
            endEl.selectedIndex = 0;
        }
    }

    async function savePlan() {
        const planId = (document.getElementById('otPlanId') || {}).value || '';
        const date = (document.getElementById('otPlanDate') || {}).value || '';
        const process = (document.getElementById('otProcess') || {}).value?.trim() || '';
        const startTime = (document.getElementById('otStartTime') || {}).value || '';
        const endTime = (document.getElementById('otEndTime') || {}).value || '';
        const workerName = (document.getElementById('otWorkerName') || {}).value?.trim() || '';
        const taskName = (document.getElementById('otTaskName') || {}).value?.trim() || '';
        const detail = (document.getElementById('otDetail') || {}).value?.trim() || '';
        const memo = (document.getElementById('otMemo') || {}).value?.trim() || '';

        if (!date || !process || !startTime || !endTime || !workerName || !taskName) {
            UIUtils.toast('필수 항목을 모두 입력해 주세요.', 'warning');
            return;
        }
        if (_toMinutes(endTime) <= _toMinutes(startTime)) {
            UIUtils.toast('완료 시간은 시작 시간보다 뒤여야 합니다.', 'warning');
            return;
        }

        const entries = _allPlans().filter((plan) => plan.date === date && plan.id !== planId);
        const newStart = _toMinutes(startTime);
        const newEnd = _toMinutes(endTime);
        const overlap = entries.find((plan) => newStart < _toMinutes(plan.endTime) && newEnd > _toMinutes(plan.startTime));
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
            durationMin: _toMinutes(endTime) - _toMinutes(startTime)
        };

        if (planId) {
            await Storage.update(STORE, planId, payload);
        } else {
            await Storage.add(STORE, payload);
        }

        UIUtils.toast('연장근무계획이 저장되었습니다.', 'success');
        UIUtils.closeModal();
        renderCalendar();
        if (_activeDate) {
            setTimeout(() => openDayModal(_activeDate), 0);
        }
    }

    function removePlan(planId) {
        const plan = Storage.getById(STORE, planId);
        if (!plan) {
            UIUtils.toast('삭제할 계획을 찾지 못했습니다.', 'warning');
            return;
        }
        UIUtils.confirm(`"${plan.taskName}" 계획을 삭제하시겠습니까?`, async () => {
            await Storage.remove(STORE, planId);
            UIUtils.toast('연장근무계획이 삭제되었습니다.', 'success');
            renderCalendar();
            if (_activeDate) {
                setTimeout(() => openDayModal(_activeDate), 0);
            }
        });
    }

    function reopenDayModal() {
        if (_activeDate) {
            openDayModal(_activeDate);
        } else {
            UIUtils.closeModal();
        }
    }

    function prevMonth() {
        _calMonth -= 1;
        if (_calMonth < 1) {
            _calMonth = 12;
            _calYear -= 1;
        }
        renderCalendar();
    }

    function nextMonth() {
        _calMonth += 1;
        if (_calMonth > 12) {
            _calMonth = 1;
            _calYear += 1;
        }
        renderCalendar();
    }

    function goToday() {
        const today = new Date();
        _calYear = today.getFullYear();
        _calMonth = today.getMonth() + 1;
        renderCalendar();
        openDayModal(UIUtils.today());
    }

    return {
        render,
        renderCalendar,
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
