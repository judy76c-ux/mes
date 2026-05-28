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

    // 파일명에서 날짜 파싱: MES_backup_2026-05-27T02-00-25-774Z.json → 2026-05-27 11:00
    function shortLabel(fileName) {
        const m = fileName.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
        if (!m) return fileName;
        // UTC→KST(+9)
        const utcH = parseInt(m[2], 10);
        const kstH = (utcH + 9) % 24;
        return `${m[1]} ${String(kstH).padStart(2,'0')}:${m[3]}`;
    }

    function isBackupTabVisible() {
        // 백업 탭이 활성화되어 있으면 settingsContent 가 존재함
        const content = document.getElementById('settingsContent');
        if (!content) return false;
        // 현재 탭이 backup 인지 확인 (data-tab 속성 또는 active 클래스)
        const activeBtn = document.querySelector('.tab-btn.active');
        if (activeBtn && activeBtn.textContent.includes('백업')) return true;
        // 폴백: serverBackupCard 가 이미 렌더됐거나 dataStatusInfo 가 있으면 백업탭
        return !!document.getElementById('dataStatusInfo') || !!document.getElementById('serverBackupCard');
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
        // NAS 카드도 함께 갱신
        setTimeout(renderNasPanel, 50);

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
                    <h4><span class="material-symbols-outlined">cloud_sync</span> 서버 자동 백업 <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">MES 서버 DB → 로컬 JSON 백업 + NAS 복사본</span></h4>
                    <span class="badge ${cfg.enabled !== false ? 'badge-success' : 'badge-secondary'}">
                        ${cfg.enabled !== false ? '자동 실행 중' : '자동 실행 중지'}
                    </span>
                </div>
                <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">

                    <!-- 설명 박스 -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;">
                        <div style="padding:10px 12px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac;">
                            <div style="font-size:.75rem;font-weight:700;color:#166534;margin-bottom:5px;">✅ 백업 대상 데이터</div>
                            <div style="font-size:.78rem;color:#166534;line-height:1.6;">
                                MES 웹서버 MariaDB의 <b>전체 생산 데이터</b><br>
                                사출·도장·레이져·출하·품질 등<br>모든 공정 기록 포함
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#eff6ff;border:1px solid #93c5fd;">
                            <div style="font-size:.75rem;font-weight:700;color:#1e3a8a;margin-bottom:5px;">📁 저장 위치</div>
                            <div style="font-size:.78rem;color:#1e3a8a;line-height:1.6;">
                                <b>MES API 서버 로컬</b> 백업 폴더<br>
                                <code style="background:#dbeafe;padding:1px 4px;border-radius:3px;font-size:.72rem;">${esc(info.backupDir || '/mes-server/backups')}</code><br>
                                NAS 연결 시 동일 파일을 NAS에도 복사
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;">
                            <div style="font-size:.75rem;font-weight:700;color:#9a3412;margin-bottom:5px;">💡 어떤 도움이 되나요?</div>
                            <div style="font-size:.78rem;color:#9a3412;line-height:1.6;">
                                MES 서버 DB 손상 시 즉시 복구 가능<br>
                                MES 서버 하드웨어 장애 시 NAS 백업으로 재구축 가능<br>
                                설정 주기마다 <b>자동</b> 실행<br>
                                [복원] 버튼으로 전체 데이터 즉시 복구<br>
                                <span style="color:#dc2626;">※ API 서버와 NAS 마운트 상태 확인 필요</span>
                            </div>
                        </div>
                    </div>

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

                    <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                            <thead>
                                <tr style="background:var(--bg-secondary);">
                                    <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">백업 일시</th>
                                    <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);width:60px;">크기</th>
                                    <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);width:190px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${backups.length ? backups.map((b, i) => `
                                    <tr style="border-bottom:1px solid var(--border-color);background:${i%2===0?'#fff':'#f8fafc'};">
                                        <td style="padding:4px 10px;color:var(--text-primary);">${esc(shortLabel(b.fileName))}</td>
                                        <td style="padding:4px 10px;text-align:right;color:var(--text-muted);">${formatBytes(b.size)}</td>
                                        <td style="padding:4px 10px;text-align:right;white-space:nowrap;">
                                            <a href="${ApiClient.backupDownloadUrl(b.fileName)}" target="_blank"
                                                style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;border:1px solid var(--border-color);border-radius:4px;font-size:.72rem;color:var(--text-secondary);text-decoration:none;background:#fff;">
                                                <span class="material-symbols-outlined" style="font-size:13px;">download</span>
                                            </a>
                                            <button onclick="SettingsBackupExtension.restoreFromServerBackup('${js(b.fileName)}')"
                                                style="padding:2px 8px;border:1px solid #f59e0b;border-radius:4px;font-size:.72rem;background:#fffbeb;color:#92400e;cursor:pointer;">복원</button>
                                            <button onclick="SettingsBackupExtension.deleteBackup('${js(b.fileName)}')"
                                                style="padding:2px 8px;border:1px solid #fca5a5;border-radius:4px;font-size:.72rem;background:#fef2f2;color:#991b1b;cursor:pointer;">삭제</button>
                                        </td>
                                    </tr>`).join('') :
                                    `<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--text-muted);">서버 백업 파일이 없습니다.</td></tr>`}
                            </tbody>
                        </table>
                    </div>

                    <div style="font-size:.78rem;color:var(--text-muted);line-height:1.6;">
                        API 서버가 실행 중이어야 예약 백업이 동작합니다. MES 서버에서는 PM2 또는 systemd로 API 서버를 상시 실행하세요.
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

    function restoreFromServerBackup(fileName) {
        UIUtils.confirm(
            `[${esc(fileName)}] 파일로 DB를 복원하시겠습니까?\n\n현재 모든 데이터가 백업 시점으로 되돌아가며, 이 작업은 취소할 수 없습니다.`,
            async () => {
                UIUtils.toast('복원 중입니다. 잠시 기다려 주세요…', 'info');
                try {
                    const r = await ApiClient.restoreBackup(fileName);
                    UIUtils.toast(
                        `복원 완료 — ${r.restoredStores}개 스토어, ${r.restoredRecords}건 복원됨. 페이지를 새로고침합니다.`,
                        'success'
                    );
                    setTimeout(() => location.reload(), 1800);
                } catch (e) {
                    UIUtils.toast('복원 실패: ' + (e.message || e), 'error');
                }
            }
        );
    }

    // ── NAS 백업 카드 ──
    async function renderNasPanel() {
        if (!isBackupTabVisible()) return;
        const content = document.getElementById('settingsContent');
        if (!content) return;

        // 로컬(file://) 실행 시 NAS HDD 백업 섹션을 비활성화
        if (location.protocol === 'file:') {
            let panel = document.getElementById('nasBackupCard');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'nasBackupCard';
                panel.className = 'card';
                panel.style.marginBottom = '20px';
                const serverCard = document.getElementById('serverBackupCard');
                if (serverCard && serverCard.nextSibling) {
                    content.insertBefore(panel, serverCard.nextSibling);
                } else {
                    content.appendChild(panel);
                }
            }
            panel.innerHTML = `
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">hard_drive</span> NAS 백업 보관</h4>
                    <span class="badge badge-secondary">로컬 모드</span>
                </div>
                <div class="card-body">
                    <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-muted);font-size:.88rem;line-height:1.6;">
                        <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;margin-right:4px;">info</span>
                        로컬 파일 모드에서는 NAS 백업 보관 기능을 사용할 수 없습니다.<br>
                        MES 서버를 통해 접속하면 NAS 백업 기능을 이용할 수 있습니다.
                    </div>
                </div>`;
            return;
        }

        let panel = document.getElementById('nasBackupCard');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'nasBackupCard';
            panel.className = 'card';
            panel.style.marginBottom = '20px';
            // 서버 백업 카드 아래에 삽입
            const serverCard = document.getElementById('serverBackupCard');
            if (serverCard && serverCard.nextSibling) {
                content.insertBefore(panel, serverCard.nextSibling);
            } else {
                content.appendChild(panel);
            }
        }

        panel.innerHTML = `
            <div class="card-header">
                <h4><span class="material-symbols-outlined">hard_drive</span> NAS 백업 보관</h4>
            </div>
            <div class="card-body">
                <div style="color:var(--text-muted);font-size:.9rem;">NAS 설정을 불러오는 중...</div>
            </div>`;

        try {
            const [nasCfg, info] = await Promise.all([
                ApiClient.getNasConfig().catch(() => ({ nasDir: '', keepCount: 365 })),
                ApiClient.listNasBackups().catch(() => ({ available: false, backups: [] }))
            ]);

            const connected = info.available;
            const backups = info.backups || [];

            panel.innerHTML = `
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">hard_drive</span> NAS 백업 보관 <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">MES 서버 로컬 백업 → NAS 공유 폴더 복사본</span></h4>
                    <span class="badge ${connected ? 'badge-success' : 'badge-secondary'}">${connected ? '연결됨' : '미연결'}</span>
                </div>
                <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">

                    <!-- 설명 박스 -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-bottom:4px;">
                        <div style="padding:10px 12px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac;">
                            <div style="font-size:.75rem;font-weight:700;color:#166534;margin-bottom:5px;">✅ 백업 대상 데이터</div>
                            <div style="font-size:.78rem;color:#166534;line-height:1.6;">
                                [서버 자동 백업]으로 생성된<br>
                                <b>MES 서버 JSON 백업 파일</b>을<br>
                                NAS 공유 폴더에 2차 보관
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#eff6ff;border:1px solid #93c5fd;">
                            <div style="font-size:.75rem;font-weight:700;color:#1e3a8a;margin-bottom:5px;">📁 저장 위치</div>
                            <div style="font-size:.78rem;color:#1e3a8a;line-height:1.6;">
                                MES 서버에 마운트된<br>
                                <b>NAS NFS/SMB 공유 경로</b><br>
                                아래 경로란에 직접 입력
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;">
                            <div style="font-size:.75rem;font-weight:700;color:#9a3412;margin-bottom:5px;">💡 어떤 도움이 되나요?</div>
                            <div style="font-size:.78rem;color:#9a3412;line-height:1.6;">
                                MES 서버 하드웨어 장애 시<br>
                                NAS 백업으로 <b>새 서버 재구축</b> 가능<br>
                                로컬 백업의 <b>물리적 2중 보호</b><br>
                                [서버복사] 후 복원 가능
                            </div>
                        </div>
                    </div>

                    <!-- NAS 경로 설정 -->
                    <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                        <div style="font-size:.82rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary);">NAS 마운트 경로 설정</div>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <input type="text" id="nasBackupDirInput" class="form-input"
                                style="flex:1;min-width:260px;font-family:monospace;font-size:.85rem;"
                                placeholder="/mnt/nas-backup"
                                value="${esc(nasCfg.nasDir || '')}">
                            <div class="form-group" style="margin:0;display:flex;align-items:center;gap:6px;">
                                <label style="font-size:.82rem;white-space:nowrap;color:var(--text-muted);">최대 보관 수</label>
                                <input type="number" id="nasKeepCountInput" class="form-input" min="1"
                                    style="width:80px;text-align:center;"
                                    value="${nasCfg.keepCount || 365}">
                            </div>
                            <button class="btn btn-primary" onclick="SettingsBackupExtension.saveNasConfig()" style="white-space:nowrap;">
                                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">save</span> 저장
                            </button>
                        </div>
                        ${!connected && nasCfg.nasDir ? `
                        <div style="margin-top:8px;font-size:.8rem;color:var(--accent-red);">
                            ⚠ 경로가 설정되어 있으나 마운트되지 않았습니다.
                            MES 서버에서 NFS/SMB 마운트 후 다시 확인하세요.
                            ${info.error ? `<br>${esc(info.error)}` : ''}
                        </div>` : ''}
                        ${!nasCfg.nasDir ? `
                        <div style="margin-top:8px;font-size:.8rem;color:var(--text-muted);">
                            MES 서버에 NAS를 마운트한 경로를 입력하세요. (예: /mnt/nas-backup)
                        </div>` : ''}
                    </div>

                    ${connected ? `
                    <!-- 백업 파일 목록 -->
                    <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px;">
                        저장 위치: <b>${esc(info.nasDir || nasCfg.nasDir)}</b> &nbsp;·&nbsp; 총 <b>${backups.length}</b>개
                        &nbsp;·&nbsp; <span style="color:#64748b;">서버복사: NAS→서버 가져오기 &nbsp; 복원: DB 즉시 복원</span>
                    </div>
                    <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                        <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                            <thead>
                                <tr style="background:var(--bg-secondary);">
                                    <th style="padding:5px 10px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">백업 일시</th>
                                    <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);width:60px;">크기</th>
                                    <th style="padding:5px 10px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);width:220px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${backups.length ? backups.map((b, i) => `
                                    <tr style="border-bottom:1px solid var(--border-color);background:${i%2===0?'#fff':'#f8fafc'};">
                                        <td style="padding:4px 10px;color:var(--text-primary);">${esc(shortLabel(b.fileName))}</td>
                                        <td style="padding:4px 10px;text-align:right;color:var(--text-muted);">${formatBytes(b.size)}</td>
                                        <td style="padding:4px 10px;text-align:right;white-space:nowrap;">
                                            <a href="${ApiClient.nasBackupDownloadUrl(b.fileName)}" target="_blank"
                                                style="display:inline-flex;align-items:center;padding:2px 7px;border:1px solid var(--border-color);border-radius:4px;font-size:.72rem;color:var(--text-secondary);text-decoration:none;background:#fff;">
                                                <span class="material-symbols-outlined" style="font-size:13px;">download</span>
                                            </a>
                                            <button onclick="SettingsBackupExtension.copyNasToLocal('${js(b.fileName)}')"
                                                style="padding:2px 8px;border:1px solid var(--border-color);border-radius:4px;font-size:.72rem;background:#fff;color:var(--text-secondary);cursor:pointer;">서버복사</button>
                                            <button onclick="SettingsBackupExtension.restoreFromNasBackup('${js(b.fileName)}')"
                                                style="padding:2px 8px;border:1px solid #f59e0b;border-radius:4px;font-size:.72rem;background:#fffbeb;color:#92400e;cursor:pointer;">복원</button>
                                        </td>
                                    </tr>`).join('') :
                                    `<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--text-muted);">NAS 백업 파일이 없습니다.</td></tr>`}
                            </tbody>
                        </table>
                    </div>` : ''}
                </div>`;
        } catch (e) {
            panel.innerHTML = `
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">hard_drive</span> NAS HDD 백업</h4>
                </div>
                <div class="card-body">
                    <div style="padding:12px;border:1px solid var(--accent-red);border-radius:8px;color:var(--accent-red);">
                        NAS 백업 정보를 불러오지 못했습니다. (${esc(e.message || e)})
                    </div>
                </div>`;
        }
    }

    async function saveNasConfig() {
        const nasDir = document.getElementById('nasBackupDirInput')?.value?.trim() || '';
        const keepCount = Number(document.getElementById('nasKeepCountInput')?.value || 365);
        try {
            await ApiClient.saveNasConfig({ nasDir, keepCount });
            UIUtils.toast('NAS 경로 설정이 저장되었습니다.', 'success');
            renderNasPanel();
        } catch (e) {
            UIUtils.toast('저장 실패: ' + (e.message || e), 'error');
        }
    }

    async function copyNasToLocal(fileName) {
        try {
            await ApiClient.copyNasToLocal(fileName);
            UIUtils.toast(`NAS 백업을 서버로 복사했습니다.`, 'success');
            renderPanel();
        } catch (e) {
            UIUtils.toast('복사 실패: ' + (e.message || e), 'error');
        }
    }

    function restoreFromNasBackup(fileName) {
        UIUtils.confirm(
            `[NAS] [${esc(fileName)}] 파일로 DB를 복원하시겠습니까?\n\n현재 모든 데이터가 백업 시점으로 되돌아가며, 이 작업은 취소할 수 없습니다.`,
            async () => {
                UIUtils.toast('NAS 백업에서 복원 중입니다. 잠시 기다려 주세요…', 'info');
                try {
                    const r = await ApiClient.restoreNasBackup(fileName);
                    UIUtils.toast(
                        `복원 완료 — ${r.restoredStores}개 스토어, ${r.restoredRecords}건 복원됨. 페이지를 새로고침합니다.`,
                        'success'
                    );
                    setTimeout(() => location.reload(), 1800);
                } catch (e) {
                    UIUtils.toast('복원 실패: ' + (e.message || e), 'error');
                }
            }
        );
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
        renderNasPanel,
        saveConfig,
        startAutoBackup,
        stopAutoBackup,
        createBackup,
        cleanupBackups,
        deleteBackup,
        restoreFromServerBackup,
        saveNasConfig,
        copyNasToLocal,
        restoreFromNasBackup,
        toggleScheduleFields
    };
})();

setTimeout(() => SettingsBackupExtension.install(), 0);
