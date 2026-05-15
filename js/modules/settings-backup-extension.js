const SettingsBackupExtension = (function() {
    let installed = false;

    const WEEKDAYS = [
        { value: 0, label: '일요일' },
        { value: 1, label: '월요일' },
        { value: 2, label: '화요일' },
        { value: 3, label: '수요일' },
        { value: 4, label: '목요일' },
        { value: 5, label: '금요일' },
        { value: 6, label: '토요일' }
    ];

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function js(s) {
        return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function formatBytes(size) {
        const n = Number(size || 0);
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(1) + ' MB';
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString('ko-KR');
    }

    function isBackupTabVisible() {
        return !!document.getElementById('restoreFileInput');
    }

    function scheduleText(config) {
        const time = config.time || '02:00';
        if (config.frequency === 'weekly') {
            const day = WEEKDAYS.find(d => d.value === Number(config.weeklyDay))?.label || '월요일';
            return `매주 ${day} ${time}`;
        }
        if (config.frequency === 'monthly') {
            return `매월 ${Number(config.monthlyDay || 1)}일 ${time}`;
        }
        return `매일 ${time}`;
    }

    function renderFrequencyOptions(config) {
        const frequency = config.frequency || 'daily';
        return `
            <option value="daily" ${frequency === 'daily' ? 'selected' : ''}>매일</option>
            <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>매주</option>
            <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>매월</option>`;
    }

    function renderWeeklyOptions(config) {
        return WEEKDAYS.map(day => `
            <option value="${day.value}" ${Number(config.weeklyDay ?? 1) === day.value ? 'selected' : ''}>
                ${day.label}
            </option>`).join('');
    }

    function renderMonthlyOptions(config) {
        const selected = Number(config.monthlyDay || 1);
        return Array.from({ length: 31 }, (_, i) => i + 1).map(day => `
            <option value="${day}" ${selected === day ? 'selected' : ''}>${day}일</option>`).join('');
    }

    function toggleScheduleFields() {
        const frequency = document.getElementById('backupFrequency')?.value || 'daily';
        const weekly = document.getElementById('backupWeeklyField');
        const monthly = document.getElementById('backupMonthlyField');
        if (weekly) weekly.style.display = frequency === 'weekly' ? '' : 'none';
        if (monthly) monthly.style.display = frequency === 'monthly' ? '' : 'none';
    }

    function collectConfig(forceEnabled) {
        return {
            enabled: forceEnabled ?? (document.getElementById('backupEnabled')?.value !== 'false'),
            frequency: document.getElementById('backupFrequency')?.value || 'daily',
            time: document.getElementById('backupTime')?.value || '02:00',
            weeklyDay: Number(document.getElementById('backupWeeklyDay')?.value || 1),
            monthlyDay: Number(document.getElementById('backupMonthlyDay')?.value || 1),
            retentionDays: Number(document.getElementById('backupRetentionDays')?.value || 30),
            retentionCount: Number(document.getElementById('backupRetentionCount')?.value || 60)
        };
    }

    async function renderPanel() {
        if (!isBackupTabVisible()) return;
        const content = document.getElementById('settingsContent');
        if (!content) return;

        let panel = document.getElementById('serverBackupCard');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'serverBackupCard';
            panel.className = 'card';
            panel.style.marginBottom = '20px';
            content.insertBefore(panel, content.firstChild);
        }

        panel.innerHTML = `
            <div class="card-header">
                <h4><span class="material-symbols-outlined">cloud_sync</span> 서버 자동 백업</h4>
            </div>
            <div class="card-body">
                <div style="color:var(--text-muted);font-size:.9rem;">백업 설정을 불러오는 중입니다.</div>
            </div>`;

        try {
            const info = await ApiClient.listBackups();
            const cfg = info.config || {};
            const backups = info.backups || [];
            panel.innerHTML = `
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_sync</span> 서버 자동 백업</h4>
                    <span class="badge ${cfg.enabled !== false ? 'badge-success' : 'badge-secondary'}">
                        ${cfg.enabled !== false ? '자동 실행 중' : '자동 실행 중지'}
                    </span>
                </div>
                <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;">
                        <div class="form-group">
                            <label class="form-label">자동 백업 상태</label>
                            <select class="form-select" id="backupEnabled">
                                <option value="true" ${cfg.enabled !== false ? 'selected' : ''}>사용</option>
                                <option value="false" ${cfg.enabled === false ? 'selected' : ''}>중지</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">백업 주기</label>
                            <select class="form-select" id="backupFrequency" onchange="SettingsBackupExtension.toggleScheduleFields()">
                                ${renderFrequencyOptions(cfg)}
                            </select>
                        </div>
                        <div class="form-group" id="backupWeeklyField">
                            <label class="form-label">주간 실행 요일</label>
                            <select class="form-select" id="backupWeeklyDay">
                                ${renderWeeklyOptions(cfg)}
                            </select>
                        </div>
                        <div class="form-group" id="backupMonthlyField">
                            <label class="form-label">월간 실행일</label>
                            <select class="form-select" id="backupMonthlyDay">
                                ${renderMonthlyOptions(cfg)}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">실행 시간</label>
                            <input type="time" class="form-input" id="backupTime" value="${cfg.time || '02:00'}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">보존 기간(일)</label>
                            <input type="number" min="1" class="form-input" id="backupRetentionDays" value="${cfg.retentionDays || 30}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">최대 보관 파일 수</label>
                            <input type="number" min="1" class="form-input" id="backupRetentionCount" value="${cfg.retentionCount || 60}">
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="SettingsBackupExtension.startAutoBackup()">
                            <span class="material-symbols-outlined">play_arrow</span> 자동 백업 시작
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsBackupExtension.stopAutoBackup()">
                            <span class="material-symbols-outlined">pause</span> 자동 백업 중지
                        </button>
                        <button class="btn btn-outline" onclick="SettingsBackupExtension.saveConfig()">
                            <span class="material-symbols-outlined">save</span> 설정 저장
                        </button>
                        <button class="btn btn-outline" onclick="SettingsBackupExtension.createBackup()">
                            <span class="material-symbols-outlined">backup</span> 지금 백업
                        </button>
                        <button class="btn btn-outline" onclick="SettingsBackupExtension.cleanupBackups()">
                            <span class="material-symbols-outlined">cleaning_services</span> 오래된 파일 정리
                        </button>
                    </div>

                    <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);font-size:.82rem;color:var(--text-secondary);">
                        <b>다음 자동 백업 기준:</b> ${esc(scheduleText(cfg))}
                        <span style="margin-left:12px;">저장 위치: ${esc(info.backupDir || '-')}</span>
                    </div>

                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr><th>파일명</th><th>크기</th><th>생성/수정일</th><th>작업</th></tr>
                            </thead>
                            <tbody>
                                ${backups.length ? backups.map(b => `
                                    <tr>
                                        <td style="font-family:monospace;font-size:.78rem;">${esc(b.fileName)}</td>
                                        <td>${formatBytes(b.size)}</td>
                                        <td>${esc(formatDateTime(b.modifiedAt || b.createdAt))}</td>
                                        <td style="white-space:nowrap;">
                                            <a class="btn btn-xs btn-outline" href="${ApiClient.backupDownloadUrl(b.fileName)}" target="_blank">
                                                <span class="material-symbols-outlined" style="font-size:14px;">download</span> 다운로드
                                            </a>
                                            <button class="btn btn-xs btn-danger" onclick="SettingsBackupExtension.deleteBackup('${js(b.fileName)}')">삭제</button>
                                        </td>
                                    </tr>`).join('') :
                                    `<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--text-muted);">서버 백업 파일이 없습니다.</td></tr>`}
                            </tbody>
                        </table>
                    </div>

                    <div style="font-size:.78rem;color:var(--text-muted);line-height:1.6;">
                        API 서버가 실행 중이어야 예약 백업이 동작합니다. Ubuntu에서는 PM2 또는 systemd로 API 서버를 상시 실행하세요.
                    </div>
                </div>`;
            toggleScheduleFields();
        } catch (e) {
            panel.innerHTML = `
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_sync</span> 서버 자동 백업</h4>
                </div>
                <div class="card-body">
                    <div style="padding:12px;border:1px solid var(--accent-red);border-radius:8px;color:var(--accent-red);">
                        서버 백업 정보를 불러오지 못했습니다. API 서버가 실행 중인지 확인하세요. (${esc(e.message || e)})
                    </div>
                </div>`;
        }
    }

    async function saveConfig() {
        await ApiClient.saveBackupConfig(collectConfig());
        UIUtils.toast('서버 백업 설정이 저장되었습니다.', 'success');
        renderPanel();
    }

    async function startAutoBackup() {
        await ApiClient.saveBackupConfig(collectConfig(true));
        UIUtils.toast('자동 백업 실행이 시작되었습니다.', 'success');
        renderPanel();
    }

    async function stopAutoBackup() {
        await ApiClient.saveBackupConfig(collectConfig(false));
        UIUtils.toast('자동 백업 실행이 중지되었습니다.', 'success');
        renderPanel();
    }

    async function createBackup() {
        await ApiClient.createBackup();
        UIUtils.toast('서버 백업 파일이 생성되었습니다.', 'success');
        renderPanel();
    }

    async function cleanupBackups() {
        const r = await ApiClient.cleanupBackups();
        UIUtils.toast(`오래된 백업 ${r.deleted || 0}개를 정리했습니다.`, 'success');
        renderPanel();
    }

    function deleteBackup(fileName) {
        UIUtils.confirm('선택한 서버 백업 파일을 삭제하시겠습니까?', async () => {
            await ApiClient.deleteBackup(fileName);
            UIUtils.toast('서버 백업 파일을 삭제했습니다.', 'success');
            renderPanel();
        });
    }

    function install() {
        if (installed || typeof SettingsModule === 'undefined') return;
        installed = true;
        const originalRender = SettingsModule.render;
        const originalSwitchTab = SettingsModule.switchTab;
        SettingsModule.render = function(container) {
            originalRender.call(SettingsModule, container);
            setTimeout(renderPanel, 0);
        };
        SettingsModule.switchTab = function(tab) {
            originalSwitchTab.call(SettingsModule, tab);
            setTimeout(renderPanel, 0);
        };
    }

    return {
        install,
        renderPanel,
        saveConfig,
        startAutoBackup,
        stopAutoBackup,
        createBackup,
        cleanupBackups,
        deleteBackup,
        toggleScheduleFields
    };
})();

setTimeout(() => SettingsBackupExtension.install(), 0);
