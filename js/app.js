/**
 * 메인 앱 초기화
 * 모든 모듈을 라우터에 등록하고 시스템을 부트스트랩
 */

const App = (function() {

    async function init() {
        console.log('🏭 생산 공정 관리 시스템 (MES) 시작...');

        try {
            // 1. 스토리지 초기화 (IndexedDB)
            await Storage.init();
            console.log('✅ 스토리지 초기화 완료');

            // 2. 인증 모듈 초기화 (기본 계정 보장 + 전역 인터셉터 등록)
            AuthModule.ensureAdminUser();
            AuthModule.init();

            // 3. 모듈 등록
            registerModules();
            console.log('✅ 모듈 등록 완료');

            // 4. 라우터 초기화
            Router.init();
            console.log('✅ 라우터 초기화 완료');

            // 5. 첫 방문 체크
            checkFirstVisit();

            // 5. 사출 LOT 번호 형식 오류 자동 감지 (백그라운드)
            setTimeout(() => _checkLotErrors(), 1500);

        } catch (error) {
            console.error('❌ 초기화 실패:', error);
            const contentArea = document.getElementById('contentArea');
            if (!contentArea) return;

            const msg = (error && error.message) || String(error);

            // ── 케이스 분기: NAS 전용 / IndexedDB / 기타 ──────────────
            // Storage.init이 던진 에러는 isNasError 플래그로 표시됨 (NAS + IndexedDB 모두 실패)
            // 그 외 메시지 패턴은 휴리스틱으로 분류
            const isNasError = (error && error.isNasError) ||
                               /NAS|API 서버|연결 실패|연결 시간 초과|fetch/i.test(msg);
            const isDbErr    = !isNasError && /IndexedDB|DB 연결|버전|version/i.test(msg);

            if (isNasError) {
                // ── NAS 서버 연결 불가 전용 화면 (주황색 테마) ─────────
                contentArea.innerHTML = `
                    <div style="margin-top:60px;display:flex;flex-direction:column;align-items:center;padding:0 20px;">
                        <div style="
                            width:96px;height:96px;border-radius:50%;
                            background:linear-gradient(135deg,#ff6b35,#f7931e);
                            display:flex;align-items:center;justify-content:center;
                            box-shadow:0 8px 24px rgba(255,107,53,0.3);margin-bottom:24px;
                        ">
                            <span class="material-symbols-outlined" style="font-size:54px;color:#fff;">cloud_off</span>
                        </div>
                        <h2 style="margin:0 0 8px;color:#ff6b35;">NAS 서버 연결 불가</h2>
                        <p style="color:var(--text-secondary);max-width:520px;text-align:center;margin:0 0 20px;">
                            MES NAS API 서버(<code style="background:var(--bg-secondary);padding:2px 6px;border-radius:4px;">192.168.10.15:3000</code>)에<br>
                            연결할 수 없고, 로컬 백업 캐시(IndexedDB)도 사용할 수 없습니다.
                        </p>

                        <div style="
                            width:100%;max-width:560px;background:#fff7ed;border:1px solid #fdba74;
                            border-radius:10px;padding:18px 22px;margin-bottom:20px;
                            color:#7c2d12;font-size:0.9rem;line-height:1.7;
                        ">
                            <div style="font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                                <span class="material-symbols-outlined" style="font-size:20px;">checklist</span>
                                NAS 연결 점검 순서
                            </div>
                            <ol style="margin:0;padding-left:22px;">
                                <li><strong>NAS 서버 전원</strong> 켜져 있는지 확인</li>
                                <li><strong>같은 사내 네트워크</strong>(공유기/Wi-Fi)에 접속되어 있는지 확인</li>
                                <li>외부에서 접속 중이면 <strong>VPN 연결</strong> 확인</li>
                                <li>NAS의 <strong>MES API Docker 컨테이너</strong>가 실행 중인지 확인</li>
                                <li>브라우저에서 <a href="http://192.168.10.15:3000/health" target="_blank" style="color:#0369a1;text-decoration:underline;">http://192.168.10.15:3000/health</a> 직접 열어서 응답 확인</li>
                            </ol>
                        </div>

                        <div style="
                            width:100%;max-width:560px;background:var(--bg-secondary);
                            border-radius:8px;padding:12px 16px;margin-bottom:20px;
                            font-family:monospace;font-size:0.78rem;color:var(--text-muted);
                            white-space:pre-wrap;word-break:break-all;
                        ">
                            <strong style="color:var(--text-secondary);font-family:Inter,sans-serif;">상세 오류:</strong><br>${msg}
                        </div>

                        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
                            <button class="btn btn-primary" style="background:#ff6b35;border-color:#ff6b35;" onclick="location.reload()">
                                <span class="material-symbols-outlined">refresh</span> 재연결 시도
                            </button>
                            <button class="btn btn-secondary" onclick="window.open('http://192.168.10.15:3000/health','_blank')">
                                <span class="material-symbols-outlined">open_in_new</span> NAS 직접 확인
                            </button>
                        </div>
                    </div>
                `;
                return;
            }

            // ── 기타 에러 (IndexedDB 등) ────────────────────────────
            const troubleshooting = isDbErr
                ? `<strong>💡 IndexedDB 문제로 보입니다:</strong><br>
                   1. 이 앱이 열린 <strong>모든 탭을 닫고</strong> 새 탭에서 열기<br>
                   2. 그래도 안 되면 <strong>Ctrl+Shift+R</strong> (강제 새로고침)<br>
                   3. 위 방법이 모두 실패하면 <strong>DB 초기화</strong> 클릭<br>
                   <br>⚠️ <em>DB 초기화 시 로컬 백업 캐시가 삭제됩니다.</em>`
                : `<strong>💡 해결 방법:</strong><br>
                   1. 이 앱이 열린 <strong>모든 탭을 닫고</strong> 새 탭에서 열기<br>
                   2. 그래도 안 되면 <strong>Ctrl+Shift+R</strong> (강제 새로고침)<br>
                   3. 위 방법이 모두 실패하면 <strong>DB 초기화</strong> 클릭
                   <br><br>⚠️ <em>DB 초기화 시 기존 데이터가 삭제됩니다.</em>`;

            contentArea.innerHTML = `
                <div class="empty-state" style="margin-top:80px;">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--accent-red);">error</span>
                    <h4>시스템 초기화 실패</h4>
                    <p style="color:var(--text-secondary);max-width:480px;text-align:center;white-space:pre-line;">${msg}</p>
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px;">
                        <button class="btn btn-primary" onclick="location.reload()">
                            <span class="material-symbols-outlined">refresh</span> 새로고침
                        </button>
                        <button class="btn btn-danger" onclick="App.resetDB()">
                            <span class="material-symbols-outlined">delete_forever</span> DB 초기화
                        </button>
                    </div>
                    <div style="margin-top:24px;padding:16px;background:var(--bg-secondary);border-radius:8px;max-width:480px;font-size:0.82rem;color:var(--text-muted);text-align:left;">
                        ${troubleshooting}
                    </div>
                </div>
            `;
        }
    }

    // 모든 모듈을 라우터에 등록
    function registerModules() {
        Router.registerModule('dashboard', DashboardModule);
        Router.registerModule('production-plan', ProductionPlanModule);
        Router.registerModule('injection-incoming', InjectionIncomingModule);
        Router.registerModule('injection-warehouse', InjectionWarehouseModule);
        Router.registerModule('paint-incoming-inspection', PaintIncomingInspectionModule);
        Router.registerModule('injection-work', InjectionWorkLogModule);
        Router.registerModule('raw-material-inventory', RawMaterialInventoryModule);
        Router.registerModule('paint-inventory', PaintInventoryModule);
        Router.registerModule('paint-layout', PaintLayoutModule);
        Router.registerModule('injection-layout', InjectionLayoutModule);
        Router.registerModule('painting-work', PaintingWorkModule);
        Router.registerModule('painting-inspection', PaintingInspectionModule);
        Router.registerModule('laser-standby', LaserStandbyModule);
        Router.registerModule('laser-work', LaserWorkModule);
        Router.registerModule('laser-inspection', LaserInspectionModule);
        Router.registerModule('shipping-standby', ShippingStandbyModule);
        Router.registerModule('shipping-inspection', ShippingInspectionModule);
        Router.registerModule('product-warehouse', ProductWarehouseModule);
        Router.registerModule('sales-delivery', SalesDeliveryModule);
        Router.registerModule('sales-delivery-plan', SalesDeliveryPlanModule);
        Router.registerModule('jig-management', JigModule);
        Router.registerModule('jig-layout', JigLayoutModule);
        Router.registerModule('five-s', FiveSModule);
        Router.registerModule('prod-standards', ProdStandardsModule);
        Router.registerModule('prod-conditions', ProdConditionsModule);
        Router.registerModule('inject-color-std', InjectColorStdModule);
        Router.registerModule('paint-mix', PaintMixModule);
        Router.registerModule('prod-sub-materials', ProdSubMaterialsModule);
        Router.registerModule('prod-quality', ProdQualityModule);
        Router.registerModule('quality-performance', QualityPerformanceModule);
        Router.registerModule('limit-samples', LimitSamplesModule);
        Router.registerModule('prod-spc', ProdSpcModule);
        Router.registerModule('prod-equipment', ProdEquipmentModule);
        Router.registerModule('settings', SettingsModule);
        Router.registerModule('incoming-overview', IncomingOverviewModule);
        Router.registerModule('warehouse-overview', WarehouseOverviewModule);
        Router.registerModule('work-standard', WorkStandardModule);
        function _qualityPersonnelTabNav(active) {
            return `
                <div class="settings-tabs" style="margin-bottom:16px;">
                    <button class="tab-btn ${active === 'certifications' ? 'active' : ''}"
                        onclick="Router.navigate('certifications-mgmt')">
                        <span class="material-symbols-outlined">workspace_premium</span> 자격인증 현황
                    </button>
                    <button class="tab-btn ${active === 'inspectors' ? 'active' : ''}"
                        onclick="Router.navigate('inspectors-mgmt')">
                        <span class="material-symbols-outlined">verified_user</span> 검사자 관리
                    </button>
                    <button class="tab-btn ${active === 'operators' ? 'active' : ''}"
                        onclick="Router.navigate('operators-mgmt')">
                        <span class="material-symbols-outlined">engineering</span> 작업자 관리
                    </button>
                </div>
                <div id="settingsContent"></div>
            `;
        }

        Router.registerModule('inspectors-mgmt', {
            render(container) {
                container.innerHTML = '<div class="fade-in-up">' + _qualityPersonnelTabNav('inspectors') + '</div>';
                SettingsModule.renderInspectorsTab(document.getElementById('settingsContent'));
            }
        });
        Router.registerModule('operators-mgmt', {
            render(container) {
                container.innerHTML = '<div class="fade-in-up">' + _qualityPersonnelTabNav('operators') + '</div>';
                SettingsModule.renderOperatorsTab(document.getElementById('settingsContent'));
            }
        });
        Router.registerModule('certifications-mgmt', {
            render(container) {
                container.innerHTML = '<div class="fade-in-up">' + _qualityPersonnelTabNav('certifications') + '</div>';
                SettingsModule.renderCertificationTab(document.getElementById('settingsContent'));
            }
        });
    }

    // 첫 방문 시 환영 메시지
    function checkFirstVisit() {
        const products = Storage.getAll(DB.STORES.PRODUCTS);
        const defects = Storage.getAll(DB.STORES.DEFECT_TYPES);

        if (products.length === 0 && defects.length === 0) {
            setTimeout(() => {
                UIUtils.showModal('환영합니다! 🏭', `
                    <div style="padding:10px 0;">
                        <p style="margin-bottom:16px;">
                            <strong>생산 공정 관리 시스템 (MES)</strong>에 오신 것을 환영합니다!
                        </p>
                        <p style="margin-bottom:16px;">
                            이 시스템은 생산 계획부터 제품 출고까지 전 공정을 관리합니다.
                        </p>
                        <div style="background:var(--bg-primary);padding:16px;border-radius:8px;margin-bottom:16px;">
                            <h5 style="margin-bottom:8px;">시작하기:</h5>
                            <ol style="padding-left:18px;color:var(--text-secondary);">
                                <li style="margin-bottom:6px;"><strong>관리/설정</strong>에서 제품과 불량 유형을 등록하세요.</li>
                                <li style="margin-bottom:6px;"><strong>생산 계획 지시서</strong>에서 생산 계획을 등록하세요.</li>
                                <li style="margin-bottom:6px;">각 공정 메뉴에서 데이터를 입력하세요.</li>
                                <li><strong>대시보드</strong>에서 전체 현황을 확인하세요.</li>
                            </ol>
                        </div>
                        <p style="color:var(--text-muted);font-size:0.85rem;">
                            💡 샘플 데이터를 추가하면 빠르게 시작할 수 있습니다.
                        </p>
                    </div>
                `, `
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">나중에</button>
                    <button class="btn btn-primary" onclick="App.loadSampleData()">샘플 데이터 추가</button>
                    <button class="btn btn-outline" onclick="UIUtils.closeModal(); Router.navigate('settings');">설정으로 이동</button>
                `);
            }, 800);
        }
    }

    // 샘플 데이터 로드
    async function loadSampleData() {
        // 제품
        const sampleProducts = [{
                carModel: 'HMG-A',
                partName: '프론트 범퍼',
                color: '화이트',
                code: 'FB-WHT-001'
            },
            {
                carModel: 'HMG-A',
                partName: '프론트 범퍼',
                color: '블랙',
                code: 'FB-BLK-002'
            },
            {
                carModel: 'HMG-A',
                partName: '리어 범퍼',
                color: '화이트',
                code: 'RB-WHT-001'
            },
            {
                carModel: 'HMG-A',
                partName: '리어 범퍼',
                color: '블랙',
                code: 'RB-BLK-002'
            },
            {
                carModel: 'HMG-B',
                partName: '사이드 미러',
                color: '실버',
                code: 'SM-SIL-001'
            },
            {
                carModel: 'HMG-B',
                partName: '도어 트림',
                color: '그레이',
                code: 'DT-GRY-001'
            }
        ];

        for (const p of sampleProducts) {
            p.displayName = `${p.carModel} ${p.partName} ${p.color}`;
            await Storage.add(DB.STORES.PRODUCTS, p);
        }

        // ── 불량 유형: 사출 불량 (injection) ──────────────────────────────
        // 사출 수입검사(입고 검사일지)에서 사용되는 사출 성형 불량 유형
        const sampleInjectionDefects = [{
                name: '수축',
                type: 'injection',
                description: '냉각 수축에 의한 표면 함몰(Sink Mark)'
            },
            {
                name: '웰드라인',
                type: 'injection',
                description: '두 수지 흐름 합류 지점의 선상 불량'
            },
            {
                name: '플래시(버)',
                type: 'injection',
                description: '파팅라인·게이트 부위 수지 넘침'
            },
            {
                name: '변형(휨)',
                type: 'injection',
                description: '성형 후 제품 뒤틀림·변형(Warpage)'
            },
            {
                name: '미성형',
                type: 'injection',
                description: '수지 미충전으로 성형 불완전(Short Shot)'
            },
            {
                name: '크랙',
                type: 'injection',
                description: '성형품 표면 또는 내부 균열'
            },
            {
                name: '에어마크',
                type: 'injection',
                description: '공기 혼입에 의한 표면 은백색 불량'
            },
            {
                name: '플로우마크',
                type: 'injection',
                description: '수지 흐름 방향의 표면 줄무늬 자국'
            },
            {
                name: '이물질혼입',
                type: 'injection',
                description: '성형 중 이물질 혼입에 의한 불량'
            },
            {
                name: '색상불량',
                type: 'injection',
                description: '컬러 배합 불균일 또는 변색'
            }
        ];

        for (const d of sampleInjectionDefects) {
            await Storage.add(DB.STORES.DEFECT_TYPES, d);
        }

        // ── 불량 유형: 도장 불량 (painting) ─────────────────────────────
        // 도장 검사(불량 집계)에서 사용되는 도장 공정 불량 유형
        const samplePaintingDefects = [{
                name: '이물',
                type: 'painting',
                description: '도막 위 이물질 부착'
            },
            {
                name: '기포',
                type: 'painting',
                description: '도막 내부 기포 발생'
            },
            {
                name: '흘러내림',
                type: 'painting',
                description: '도료 흘러내림(Sag/Run)'
            },
            {
                name: '핀홀',
                type: 'painting',
                description: '도막 표면 미세 구멍 발생'
            },
            {
                name: '긁힘',
                type: 'painting',
                description: '도막 표면 스크래치'
            },
            {
                name: 'Peel Off',
                type: 'painting',
                description: '도막 벗겨짐·박리'
            },
            {
                name: '색차',
                type: 'painting',
                description: '기준 대비 색상 불균일'
            },
            {
                name: '오렌지 필',
                type: 'painting',
                description: '오렌지 껍질 모양의 표면 요철'
            },
            {
                name: '미도장',
                type: 'painting',
                description: '도장 누락 부위 발생'
            },
            {
                name: '찍힘',
                type: 'painting',
                description: '외부 충격에 의한 도막 함몰'
            },
            {
                name: '광택불량',
                type: 'painting',
                description: '도막 광택 불균일 또는 저하'
            },
            {
                name: '백화',
                type: 'painting',
                description: '도막 하얗게 변색(Blushing)'
            }
        ];

        for (const d of samplePaintingDefects) {
            await Storage.add(DB.STORES.DEFECT_TYPES, d);
        }

        // 샘플 생산 계획
        const today = UIUtils.today();
        await Storage.add(DB.STORES.PRODUCTION_PLANS, {
            orderNo: `PP-${today.replace(/-/g, '')}-001`,
            date: today,
            carModel: 'HMG-A',
            partName: '프론트 범퍼',
            color: '화이트',
            planQty: 500,
            productionQty: 0,
            status: '진행',
            note: '샘플 계획'
        });

        UIUtils.closeModal();
        UIUtils.toast('샘플 데이터가 추가되었습니다!', 'success');
        Router.navigate('dashboard');
    }

    // DB 초기화 (손상/잠금 복구)
    async function resetDB() {
        if (!confirm(
            '⚠️ DB 초기화 경고\n\n' +
            '모든 생산 데이터(검사일지, 창고, 계획 등)가 영구 삭제됩니다.\n\n' +
            '시스템이 정상 실행되지 않을 때만 사용하세요.\n\n' +
            '계속하시겠습니까?'
        )) return;

        try {
            await DB.deleteDatabase();
            alert('DB가 초기화되었습니다. 페이지를 새로고침합니다.');
            location.reload();
        } catch (e) {
            alert(
                'DB 초기화 실패: ' + e.message + '\n\n' +
                '수동 초기화 방법:\n' +
                'Chrome DevTools(F12) → Application 탭 → Storage → Clear site data'
            );
        }
    }

    // ── 커스텀 시간 피커 ────────────────────────────────────────────
    function openTimePicker(el, iconEl) {
        // 이미 열린 피커 닫기
        document.querySelectorAll('.time-picker-dropdown').forEach(p => p.remove());

        const wrapper = el.closest('.time-input-wrapper');

        // 현재 값 또는 현재 시각 파싱
        const now = new Date();
        let curH = now.getHours(), curM = now.getMinutes();
        const mv = el.value.match(/^(\d{2}):(\d{2})$/);
        if (mv) { curH = parseInt(mv[1], 10); curM = parseInt(mv[2], 10); }

        // ── 피커 DOM 생성 ──
        const picker = document.createElement('div');
        picker.className = 'time-picker-dropdown';

        // 헤더 라벨
        const header = document.createElement('div');
        header.className = 'time-picker-header';
        header.innerHTML = '<span>시</span><span></span><span>분</span>';
        picker.appendChild(header);

        // 컬럼 영역
        const cols = document.createElement('div');
        cols.className = 'time-picker-cols';

        // 시 컬럼 (00~23)
        const hoursCol = document.createElement('div');
        hoursCol.className = 'time-picker-col';
        for (let h = 0; h < 24; h++) {
            const item = document.createElement('div');
            item.className = 'time-picker-item' + (h === curH ? ' selected' : '');
            item.textContent = String(h).padStart(2, '0');
            item.dataset.val = h;
            item.addEventListener('click', function () {
                hoursCol.querySelectorAll('.time-picker-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
            });
            hoursCol.appendChild(item);
        }

        // 구분자
        const sep = document.createElement('div');
        sep.className = 'time-picker-sep';
        sep.textContent = ':';

        // 분 컬럼 (00~59)
        const minsCol = document.createElement('div');
        minsCol.className = 'time-picker-col';
        for (let m = 0; m < 60; m++) {
            const item = document.createElement('div');
            item.className = 'time-picker-item' + (m === curM ? ' selected' : '');
            item.textContent = String(m).padStart(2, '0');
            item.dataset.val = m;
            item.addEventListener('click', function () {
                minsCol.querySelectorAll('.time-picker-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
            });
            minsCol.appendChild(item);
        }

        cols.appendChild(hoursCol);
        cols.appendChild(sep);
        cols.appendChild(minsCol);
        picker.appendChild(cols);

        // 확인 버튼
        const footer = document.createElement('div');
        footer.className = 'time-picker-footer';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'time-picker-confirm';
        confirmBtn.textContent = '확인';
        confirmBtn.addEventListener('click', function () {
            const selH = hoursCol.querySelector('.time-picker-item.selected');
            const selM = minsCol.querySelector('.time-picker-item.selected');
            if (selH && selM) {
                el.value = String(parseInt(selH.dataset.val)).padStart(2, '0') + ':' +
                            String(parseInt(selM.dataset.val)).padStart(2, '0');
                // oninput, onchange 핸들러 모두 트리거
                el.dispatchEvent(new Event('input',  { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            picker.remove();
        });
        footer.appendChild(confirmBtn);
        picker.appendChild(footer);

        // body에 붙여 overflow 제한 무력화
        document.body.appendChild(picker);

        // wrapper 기준 fixed 좌표 계산
        function positionPicker() {
            const rect = wrapper.getBoundingClientRect();
            const pickerH = picker.offsetHeight || 280;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            picker.style.position = 'fixed';
            picker.style.left     = rect.left + 'px';
            picker.style.width    = Math.max(rect.width, 180) + 'px';

            // 아래 공간이 부족하면 위로
            if (spaceBelow < pickerH && spaceAbove > pickerH) {
                picker.style.top    = '';
                picker.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            } else {
                picker.style.top    = (rect.bottom + 4) + 'px';
                picker.style.bottom = '';
            }
        }

        // 선택 항목이 컬럼 중앙에 오도록 스크롤
        function scrollToSelected(col) {
            const sel = col.querySelector('.time-picker-item.selected');
            if (sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
        }

        requestAnimationFrame(() => {
            positionPicker();
            scrollToSelected(hoursCol);
            scrollToSelected(minsCol);
        });

        // 스크롤/리사이즈 시 위치 재계산
        function onScroll() { positionPicker(); }
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);

        // 피커 외부 클릭 시 닫기
        setTimeout(() => {
            function onOutside(e) {
                if (!picker.contains(e.target) && e.target !== iconEl) {
                    picker.remove();
                    window.removeEventListener('scroll', onScroll, true);
                    window.removeEventListener('resize', onScroll);
                    document.removeEventListener('mousedown', onOutside);
                }
            }
            document.addEventListener('mousedown', onOutside);
        }, 0);
    }

    // ── 24시간제 텍스트 입력 변환 ──────────────────────────────────
    function convertTimeInput(el) {
        if (el._timeConverted) return;
        el._timeConverted = true;

        el.type = 'text';
        el.setAttribute('placeholder', 'HH:MM');
        el.setAttribute('maxlength', '5');
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('inputmode', 'numeric');

        // 기존 HH:MM 값 유지
        if (/^\d{2}:\d{2}$/.test(el.value || '')) { /* 유지 */ }

        // 숫자 입력 시 자동 ':' 삽입
        el.addEventListener('input', function () {
            let v = this.value.replace(/[^\d]/g, '').slice(0, 4);
            if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
            this.value = v;
        });

        // 포커스 아웃 시 범위 보정
        el.addEventListener('blur', function () {
            const m = this.value.match(/^(\d{1,2}):(\d{2})$/);
            if (m) {
                const h = Math.min(parseInt(m[1], 10), 23);
                const min = Math.min(parseInt(m[2], 10), 59);
                this.value = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
            } else if (this.value && !/^\d{2}:\d{2}$/.test(this.value)) {
                this.value = '';
            }
        });

        // 이미 래퍼가 있으면 스킵
        if (el.parentElement && el.parentElement.classList.contains('time-input-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'time-input-wrapper';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);

        // 기본값: 현재 시각 설정 (빈 값인 경우)
        if (!el.value) {
            const now = new Date();
            el.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        }

        // 시계 아이콘
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined time-clock-icon';
        icon.textContent = 'schedule';
        icon.title = '시간 선택';
        icon.addEventListener('mousedown', function (e) {
            e.preventDefault();
            // 피커가 이미 열려 있으면 닫기만
            if (wrapper.querySelector('.time-picker-dropdown')) {
                wrapper.querySelector('.time-picker-dropdown').remove();
                return;
            }
            openTimePicker(el, icon);
        });
        wrapper.appendChild(icon);
    }

    function applyTimeInputConversion(root) {
        root.querySelectorAll('input[type="time"]').forEach(convertTimeInput);
    }

    // MutationObserver: 동적으로 생성되는 time 입력에도 자동 적용
    const _timeInputObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.matches && node.matches('input[type="time"]')) {
                    convertTimeInput(node);
                } else if (node.querySelectorAll) {
                    applyTimeInputConversion(node);
                }
            });
        });
    });

    // DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyTimeInputConversion(document);
            _timeInputObserver.observe(document.body, { childList: true, subtree: true });
            init();
        });
    } else {
        applyTimeInputConversion(document);
        _timeInputObserver.observe(document.body, { childList: true, subtree: true });
        init();
    }

    // ── 사출 LOT 번호 형식 오류 자동 감지 ──────────────────────────
    function _checkLotErrors() {
        try {
            if (typeof SettingsModule === 'undefined' || !SettingsModule.scanInjLotNumbers) return;

            // 간단 카운트 (UI 없이 직접 스캔)
            const inven = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
            const insps = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
            let errorCount = 0;

            function isValidLot(v) {
                if (!v) return false;
                const s = String(v).trim();
                if (!/^\d{6}$/.test(s)) return false;
                const yy = parseInt(s.slice(0, 2), 10);
                const mm = parseInt(s.slice(2, 4), 10);
                const dd = parseInt(s.slice(4, 6), 10);
                const fy = yy >= 50 ? 1900 + yy : 2000 + yy;
                const d  = new Date(fy, mm - 1, dd);
                return d.getFullYear() === fy && d.getMonth() === mm - 1 && d.getDate() === dd;
            }

            [...inven, ...insps].forEach(item => {
                if (item.lotNo && !isValidLot(item.lotNo)) errorCount++;
                (item.lots || []).forEach(l => {
                    if (l.lotNo && !isValidLot(l.lotNo)) errorCount++;
                });
            });

            if (errorCount === 0) return; // 오류 없음 → 알림 불필요

            // 토스트 알림 표시
            const toastEl = document.getElementById('toastContainer');
            if (!toastEl) return;
            const div = document.createElement('div');
            div.className = 'toast toast-warning';
            div.style.cssText = 'cursor:pointer;';
            div.innerHTML = `
                <span class="material-symbols-outlined">warning</span>
                <span>사출 LOT 번호 형식 오류 <strong>${errorCount}건</strong> 발견
                  — <u>클릭하여 수정</u></span>`;
            div.onclick = () => {
                Router.navigate('settings');
                setTimeout(() => {
                    if (typeof SettingsModule !== 'undefined' && SettingsModule.switchTab) {
                        SettingsModule.switchTab('system');
                        setTimeout(() => {
                            const btn = document.querySelector('#lotRepairResult')?.parentElement?.querySelector('.btn-primary');
                            if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 400);
                    }
                }, 300);
            };
            toastEl.appendChild(div);
            setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 10000);
        } catch(e) {
            console.warn('[LOT Check]', e);
        }
    }

    return {
        init,
        loadSampleData,
        resetDB
    };
})();
