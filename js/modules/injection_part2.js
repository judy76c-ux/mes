// ===================================================================
// 사출 창고 (자재 재고관리)
// ===================================================================
var InjectionWarehouseModule = (function() {
    const STORE = DB.STORES.INJECTION_INVENTORY;
    let _pendingInspDate = '';

    // ── 사출 창고 입고 대기품 목록에서만 숨기는 항목(관리자 전용) ─────────
    // 검사 기록(INJECTION_INSPECTIONS)이나 창고 재고(INJECTION_INVENTORY)는 전혀 건드리지 않고,
    // "입고 대기" 화면에 다시 뜨지 않도록 표시만 남긴다.
    const DISMISSED_PENDING_KEY = 'injection_inbound_pending_dismissed_v1';
    let _dismissedPending = [];
    let _dismissedPendingLoaded = false;

    function _dismissedPendingKey(inspId, lotNo) { return `${inspId}||${lotNo}`; }

    async function _ensureDismissedPendingLoaded(forceReload) {
        if (_dismissedPendingLoaded && !forceReload) return _dismissedPending;
        const rows = await Storage.getConfigValue(DISMISSED_PENDING_KEY);
        _dismissedPending = Array.isArray(rows) ? rows : [];
        _dismissedPendingLoaded = true;
        return _dismissedPending;
    }

    // ── 수량 보정 시점(컷오버) 이전 검사건은 입고 대기에서 제외 ──────────────
    // 보정 시점 이전의 과거 검사건은 창고 재고가 이미 (수동)정합 처리된 것으로 보고, 입고 대기 목록과
    // 일괄입고 대상에서 제외한다. LOT번호가 생산일자 기준으로 재사용되는 탓에 과거 항목이 다시 대기로
    // 떠서 이중 입고되는 문제를 원천 차단하기 위함이며, 검사(INJECTION_INSPECTIONS)·재고 원본은 보존한다.
    // (서버 공유 config에 최초 활성화 '일자'를 고정 저장 — 이후 검사건만 입고 대기 대상)
    const PENDING_CUTOVER_KEY = 'injection_inbound_pending_cutover_v1';
    let _pendingCutover = '';        // 'YYYY-MM-DD' (day). '' = 미설정(제외 안 함)
    let _pendingCutoverLoaded = false;

    function _cutoverDay(v) { return String(v == null ? '' : v).trim().slice(0, 10); }

    async function _ensurePendingCutoverLoaded(forceReload) {
        if (_pendingCutoverLoaded && !forceReload) return _pendingCutover;
        let v = await Storage.getConfigValue(PENDING_CUTOVER_KEY);
        if (!v) {
            v = _cutoverDay(Storage.today());
            try { await Storage.setConfigValue(PENDING_CUTOVER_KEY, v); } catch (e) {}
        }
        _pendingCutover = _cutoverDay(v);
        _pendingCutoverLoaded = true;
        return _pendingCutover;
    }

    // 검사일(day)이 컷오버 이전이면 true → 입고 대기·일괄입고에서 제외
    function _isBeforePendingCutover(inspDate) {
        if (!_pendingCutover) return false;
        const d = _cutoverDay(inspDate);
        if (!d) return false;                 // 날짜 불명은 제외하지 않음
        return d < _pendingCutover;
    }

    // key/표시용 문자열 정규화 (콤마/공백/트림)
    function _normKeyStr(v) {
        return String(v || '')
            .replace(/[，]/g, ',')         // 전각 콤마 → 반각
            .replace(/\s*,\s*/g, ',')     // 콤마 전후 공백 정리
            .replace(/\s+/g, ' ')         // 연속 공백 정리
            .trim();
    }

    function _colorAliasKey(c) {
        return typeof UIUtils.normalizeColorAlias === 'function'
            ? UIUtils.normalizeColorAlias(c)
            : _normKeyStr(c).toLowerCase();
    }

    function _splitMasterColors(m) {
        const raw = _normKeyStr(typeof m === 'string' ? m : (m.injColor || m.color || ''));
        if (!raw) return [];
        return raw.split(/[,，、\/·|]/).map(function(s) { return s.trim(); }).filter(Boolean);
    }

    function _colorsMatch(c1, c2) {
        const a = _normKeyStr(c1);
        const b = _normKeyStr(c2);
        if (!a || !b) return a === b;
        return _colorAliasKey(a) === _colorAliasKey(b);
    }

    /** 마스터 injColor 표기로 컬러 별칭(BK 등)을 통일 */
    function _resolveMasterColor(carModel, partName, color, materials) {
        const c = _normKeyStr(color);
        if (!c) return '';
        const mats = (materials || []).filter(function(m) {
            return _normKeyStr(m.carModel) === _normKeyStr(carModel) &&
                _normKeyStr(m.injPartName || m.partName) === _normKeyStr(partName);
        });
        if (!mats.length) return c;
        const alias = _colorAliasKey(c);
        for (let i = 0; i < mats.length; i++) {
            const parts = _splitMasterColors(mats[i]);
            for (let j = 0; j < parts.length; j++) {
                if (_colorAliasKey(parts[j]) === alias) return parts[j];
            }
        }
        return c;
    }

    function _recordMatchesMaster(d, materials) {
        if (_isInvalidColor(d.color)) return false;
        const mats = (materials || []).filter(function(m) {
            return _normKeyStr(m.carModel) === _normKeyStr(d.carModel) &&
                _normKeyStr(m.injPartName || m.partName) === _normKeyStr(d.partName);
        });
        if (!mats.length) return false;
        const resolved = _resolveMasterColor(d.carModel, d.partName, d.color, materials);
        return mats.some(function(m) {
            return _splitMasterColors(m).some(function(mc) {
                return _normKeyStr(mc) === _normKeyStr(resolved);
            });
        });
    }

    /** 제품 마스터 라인 코드(6PS·AZ3 등) — 사출 injColor가 아님 */
    function _isProductLineCode(color) {
        const c = _normKeyStr(color).toLowerCase().replace(/\s+/g, '');
        if (!c) return false;
        if (/^\d{1,2}[a-z]{2,4}$/i.test(c)) return true;
        return ['6ps', 'az3', '1ph', '2ph', '3ph'].indexOf(c) >= 0;
    }

    /** 입출고 이력만으로 타일 키를 새로 만들지 말아야 하는 비마스터 컬러 */
    function _isOrphanInventoryColor(carModel, partName, color, materials) {
        const raw = _normKeyStr(color);
        if (!raw) return false;
        if (_isProductLineCode(raw)) return true;
        return !_recordMatchesMaster({ carModel: carModel, partName: partName, color: raw }, materials);
    }

    function _isAliasOnlyMismatch(d, materials) {
        if (!_recordMatchesMaster(d, materials)) return false;
        const resolved = _resolveMasterColor(d.carModel, d.partName, d.color, materials);
        return _normKeyStr(d.color) !== _normKeyStr(resolved);
    }

    function _countAliasMismatchRecords(materials, data) {
        const mats = materials || Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        return (data || Storage.getAll(STORE) || []).filter(function(d) {
            return _isAliasOnlyMismatch(d, mats);
        }).length;
    }

    function _renderAliasCleanupBanner(materials, data) {
        const mats = materials || Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const inv = data || Storage.getAll(STORE) || [];
        const aliasCount = _countAliasMismatchRecords(mats, inv);
        const host = document.getElementById('injAliasCleanupBanner');
        if (!host) return;
        if (!aliasCount || !_isAdminUser()) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        host.style.display = '';
        host.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;
                        border:1px solid #fed7aa;border-radius:10px;background:#fffbeb;">
                <span class="material-symbols-outlined" style="color:#b45309;font-size:22px;">warning</span>
                <div style="flex:1;min-width:200px;font-size:0.86rem;line-height:1.5;">
                    <strong style="color:#b45309;">별칭 컬러 입출고 ${aliasCount}건</strong>
                    <span style="color:var(--text-secondary);"> — BK·BLACK 등 마스터와 다른 표기 (예: IL · BK)</span>
                </div>
                <button type="button" class="btn btn-sm" style="background:#7c2d12;color:#fff;border-color:#7c2d12;"
                    onclick="InjectionWarehouseModule.openColorCleanupModal()">
                    <span class="material-symbols-outlined" style="font-size:16px;">delete_sweep</span>
                    별칭 이력 삭제/통합
                </button>
            </div>`;
    }

    // 타일/목록 표시에서만 제외할 "명백한" 컬러 오입력(숫자형 LOT)
    function _isDisplayInvalidColor(color) {
        const c = _normKeyStr(color);
        if (/^\d[\d,.\s]*$/.test(c)) return true;
        return false;
    }

    function _matHasMfgMapping(mat) {
        if (!mat) return false;
        const n1 = _normKeyStr(mat.mfgProductName);
        const n2 = _normKeyStr(mat.mfgProductName2);
        const hasIds = Array.isArray(mat.productIds) && mat.productIds.length > 0;
        // v19: productIds가 비어 있어도 mfgProductName/2가 있으면 "설정됨"으로 간주 (하위호환)
        return Boolean(n1 || n2 || hasIds);
    }

    function _findMatEntryForTile(allMats, carModel, itemPartName, itemColor) {
        const mats = allMats || [];
        const cCar  = _normKeyStr(carModel);
        const cPart = _normKeyStr(itemPartName);
        const cCol  = _normKeyStr(itemColor);

        // 1) 차종+품명(+컬러) 정규화 기반 매칭 (가능하면 컬러까지)
        let candidates = mats.filter(m =>
            _normKeyStr(m.carModel) === cCar &&
            _normKeyStr(m.injPartName || m.partName) === cPart
        );

        if (candidates.length > 1 && cCol) {
            const byColor = candidates.filter(m => {
                const parts = _splitMasterColors(m);
                if (!parts.length) return false;
                return parts.some(function(mc) { return _colorsMatch(mc, cCol); });
            });
            if (byColor.length === 1) return byColor[0];
            if (byColor.length > 1) candidates = byColor;
        }
        if (candidates.length === 1) return candidates[0];

        // 2) 차종 없이 품명만(레거시) — 마지막 fallback
        return mats.find(m => _normKeyStr(m.injPartName || m.partName) === cPart) || null;
    }

    function _hasRole(user, roleKey) {
        if (!user || !roleKey) return false;
        const keys = [];
        if (Array.isArray(user.roles)) keys.push.apply(keys, user.roles);
        if (user.role) keys.push(user.role);
        return keys.map(function(value) { return String(value || '').trim(); }).includes(String(roleKey));
    }

    /** 사출 출고자 — 물류작업자·생산관리자만 대상. "자재 창고 입력 권한이 있는 역할 전부"로
     *  넓혀봤더니 품질검사자처럼 다른 이유로 자재 창고 입력 권한을 가진 역할까지 딸려 들어와서,
     *  출고 처리를 실제로 담당하는 이 두 역할만 명시적으로 고정한다. 목록도 이 순서(물류작업자 →
     *  생산관리자)로 묶어서 보여준다.
     *
     *  키가 아니라 라벨로 찾는 이유: 관리/설정 > 역할 관리에서 "역할 추가"로 물류작업자를
     *  다시 만들었거나 키를 손으로 입력했다면(한글 등 비ASCII는 saveRole()에서 전부 '_'로
     *  치환됨 — settings.js의 key.replace(/[^a-z0-9_]/gi,'_')), 실제 저장된 key가 기본값
     *  'logistics_worker'/'prod_manager'와 달라져 있을 수 있다. 그 상태에서 key를 그대로
     *  하드코딩해 비교하면 역할별 접근 권한 화면엔 정상으로 보여도(라벨 기준) 이 목록에서는
     *  아무도 안 걸려 조용히 텅 비어 보인다 — 라벨로 먼저 찾고, 못 찾을 때만 기본 key로
     *  폴백한다. */
    const OUTGOING_ACTOR_ROLE_LABELS = ['물류작업자', '생산관리자'];
    const OUTGOING_ACTOR_ROLES = ['logistics_worker', 'prod_manager'];

    function _resolveOutgoingActorRoleKeys() {
        try {
            if (typeof AuthModule === 'undefined' || typeof AuthModule.getRoles !== 'function') return OUTGOING_ACTOR_ROLES;
            const roles = AuthModule.getRoles() || [];
            return OUTGOING_ACTOR_ROLE_LABELS.map(function(label, i) {
                const found = roles.find(function(r) { return r && r.label === label; });
                return found ? found.key : OUTGOING_ACTOR_ROLES[i];
            }).filter(Boolean);
        } catch (e) {
            return OUTGOING_ACTOR_ROLES;
        }
    }

    function _userHasAnyRole(user, roleKeys) {
        if (!user || !roleKeys || !roleKeys.length) return false;
        const keys = [];
        if (Array.isArray(user.roles)) keys.push.apply(keys, user.roles);
        if (user.role) keys.push(user.role);
        return keys.some(function(value) {
            return roleKeys.includes(String(value || '').trim());
        });
    }

    function _getUsersByRoles(roleKeys) {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getUsers !== 'function') return [];
        return (AuthModule.getUsers() || [])
            .filter(function(user) {
                return user && user.active !== false && _userHasAnyRole(user, roleKeys);
            })
            .map(function(user) {
                return {
                    id: String(user.id || user.username || user.displayName || ''),
                    name: String(user.displayName || user.name || user.username || user.id || '')
                };
            })
            .filter(function(user) { return user.id && user.name; })
            .sort(function(a, b) { return a.name.localeCompare(b.name, 'ko'); });
    }

    function _getProductionWorkerUsers() {
        return _getUsersByRoles(['prod_worker']);
    }

    // 순서(물류작업자 → 생산관리자)대로 역할별로 묶어서 반환한다.
    // _getUsersByRoles는 이름 가나다순으로만 섞어 역할 구분 없이 보여주므로 여기선 쓰지 않는다.
    function _getLogisticsWorkerUsers() {
        const seen = new Set();
        const result = [];
        _resolveOutgoingActorRoleKeys().forEach(function(roleKey) {
            _getUsersByRoles([roleKey]).forEach(function(u) {
                if (seen.has(u.id)) return;
                seen.add(u.id);
                result.push(u);
            });
        });
        return result;
    }

    function _isValidOutgoingActor(actorId) {
        const id = String(actorId || '').trim();
        if (!id) return false;
        return _getLogisticsWorkerUsers().some(function(user) { return user.id === id; });
    }

    function _buildProductionWorkerOptionHtml() {
        return _getProductionWorkerUsers()
            .map(function(user) {
                return '<option value="' + user.id.replace(/"/g, '&quot;') + '">' + user.name + '</option>';
            })
            .join('');
    }

    function _buildLogisticsWorkerOptionHtml() {
        return _getLogisticsWorkerUsers()
            .map(function(user) {
                return '<option value="' + user.id.replace(/"/g, '&quot;') + '">' + user.name + '</option>';
            })
            .join('');
    }

    function _getCurrentActorId() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.getCurrentUser !== 'function') return '';
        const user = AuthModule.getCurrentUser();
        if (!user) return '';
        return String(user.id || user.username || '').trim();
    }

    function _formatActorLabel(value) {
        const v = String(value || '').trim();
        if (!v) return '';
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.getUsers === 'function') {
            const matched = (AuthModule.getUsers() || []).find(function(user) {
                return String(user.id || '') === v || String(user.username || '') === v;
            });
            if (matched) return String(matched.displayName || matched.username || v);
        }
        const current = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        if (current && (String(current.id) === v || String(current.username) === v)) {
            return String(current.displayName || current.username || v);
        }
        return v;
    }

    /** 입출고 기록의 정렬·표시용 일시 (date에 시각이 없으면 createdAt/updatedAt 복원) */
    function _txRecordStamp(d) {
        if (typeof InvCalc !== 'undefined' && typeof InvCalc.recordStamp === 'function') {
            const s = InvCalc.recordStamp(d);
            if (s) return String(s).slice(0, 16);
        }
        const raw = String((d && d.date) || '').trim();
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16).replace('T', ' ');
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + ' 00:00';
        return raw;
    }

    function _fmtTxDateCell(raw) {
        const stamp = String(raw || '').trim().replace('T', ' ');
        const sp = stamp.split(' ');
        const pp = (sp[0] || '').split('-');
        const tt = sp[1] ? sp[1].slice(0, 5) : '';
        if (pp.length !== 3) return raw ? String(raw) : '-';
        return '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1;">' + pp[0] + '</span>' +
               '<span style="font-weight:600;white-space:nowrap;">' + pp[1] + '-' + pp[2] + '</span>' +
               (tt
                   ? '<span style="font-size:0.72rem;color:var(--text-secondary);display:block;line-height:1.4;font-weight:600;">' + tt + '</span>'
                   : '<span style="font-size:0.68rem;color:var(--text-muted);display:block;line-height:1.4;">--:--</span>');
    }

    function _buildInspDateContext() {
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const inspDateMap = {};
        inspections.forEach(function(insp) {
            const lots = (insp.lots && insp.lots.length > 0)
                ? insp.lots
                : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
            lots.forEach(function(lot) {
                if (lot.lotNo && insp.partName) {
                    const k = `${insp.partName}||${lot.lotNo}`;
                    if (!inspDateMap[k]) inspDateMap[k] = insp.date || '';
                }
            });
        });

        const inboundInspMap = {};
        (Storage.getAll(STORE) || []).forEach(function(r) {
            if (r.type === '출고' || !r.partName || !r.lotNo) return;
            const k = `${r.partName}||${r.lotNo}`;
            if (inboundInspMap[k]) return;
            const src = String(r.source || '');
            inboundInspMap[k] = {
                inspDate: r.inspDate || '',
                fromInsp: /수입검사/.test(src) || !!r.inspDate
            };
        });
        return { inspDateMap, inboundInspMap };
    }

    function _formatInspDateCell(d, isIncoming, inspDateMap, inboundInspMap) {
        const key = `${d.partName || ''}||${d.lotNo || ''}`;
        const fullDate = d.inspDate || inspDateMap[key] || (inboundInspMap[key] && inboundInspMap[key].inspDate) || '';
        if (fullDate) return _fmtTxDateCell(fullDate);

        if (isIncoming) {
            const src = String(d.source || '');
            const linkedInsp = /수입검사/.test(src) || !!d.inspDate;
            if (linkedInsp) {
                return '<span style="font-size:0.78rem;color:var(--accent-orange);font-weight:600;" title="수입검사 연동 건이나 검사일 미등록">미등록</span>';
            }
            return '<span style="font-size:0.78rem;color:var(--text-muted);" title="수입검사 없이 직접 입고">해당없음</span>';
        }

        const inbound = inboundInspMap[key];
        if (inbound && !inbound.fromInsp) {
            return '<span style="font-size:0.78rem;color:var(--text-muted);" title="수동 입고 LOT">해당없음</span>';
        }
        if (inbound && inbound.fromInsp) {
            return '<span style="font-size:0.78rem;color:var(--accent-orange);font-weight:600;" title="수입검사 연동 LOT이나 검사일 미연동">미연동</span>';
        }
        return '<span style="font-size:0.78rem;color:var(--text-muted);" title="연결된 수입검사 없음">-</span>';
    }

    /** 창고 입고 기록 → 연동 사출 수입검사 ID 조회 */
    function _findLinkedInspectionId(d) {
        if (!d) return '';
        if (d.inspId) return String(d.inspId);
        const partName = String(d.partName || '').trim();
        const lotNo = String(d.lotNo || '').trim();
        if (!partName || !lotNo) return '';

        const inspDateRaw = String(d.inspDate || '').trim();
        const inspDateKey = inspDateRaw.slice(0, 10);
        const carModel = String(d.carModel || '').trim();
        const color = String(d.color || '').trim();
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];

        function hasLot(insp) {
            const lots = (insp.lots && insp.lots.length)
                ? insp.lots
                : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
            return lots.some(function(l) { return String(l.lotNo || '').trim() === lotNo; });
        }

        let candidates = inspections.filter(function(insp) {
            return String(insp.partName || '').trim() === partName && hasLot(insp);
        });
        if (!candidates.length) return '';

        if (inspDateKey) {
            const byDate = candidates.filter(function(insp) {
                return String(insp.date || '').slice(0, 10) === inspDateKey
                    || String(insp.date || '') === inspDateRaw;
            });
            if (byDate.length) candidates = byDate;
        }
        if (carModel) {
            const byCar = candidates.filter(function(insp) {
                return !insp.carModel || String(insp.carModel).trim() === carModel;
            });
            if (byCar.length) candidates = byCar;
        }
        if (color) {
            const byColor = candidates.filter(function(insp) {
                return !insp.color || String(insp.color).trim() === color;
            });
            if (byColor.length) candidates = byColor;
        }

        candidates.sort(function(a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        return candidates[0] ? String(candidates[0].id) : '';
    }

    function openLinkedInspection(inspId) {
        const id = String(inspId || '').trim();
        if (!id) {
            UIUtils.toast('연결된 사출 수입검사가 없습니다.', 'warning');
            return;
        }
        if (typeof InjectionIncomingModule === 'undefined' || typeof InjectionIncomingModule.view !== 'function') {
            UIUtils.toast('사출 수입검사 모듈을 불러올 수 없습니다.', 'error');
            return;
        }
        const insp = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, id);
        if (!insp) {
            UIUtils.toast('사출 수입검사 기록을 찾을 수 없습니다.', 'error');
            return;
        }
        UIUtils.closeModal();
        InjectionIncomingModule.view(id);
    }

    function _inspDateLinkHtml(d, inspDateHtml) {
        const inspId = _findLinkedInspectionId(d);
        if (!inspId) return inspDateHtml;
        if (/해당없음/.test(inspDateHtml)) return inspDateHtml;
        return `<a href="javascript:void(0)"
            onclick="event.preventDefault();InjectionWarehouseModule.openLinkedInspection('${inspId}')"
            style="color:var(--accent-blue);text-decoration:underline;cursor:pointer;display:inline-block;"
            title="사출 수입검사 보기">${inspDateHtml}
            <span style="font-size:0.72rem;font-weight:600;margin-left:4px;white-space:nowrap;">보기</span>
        </a>`;
    }

    function _normalizePaintLine(line) {
        const s = String(line || '').trim();
        if (!s) return '';
        if (/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(s) || s === '도장(B)') return '도장-B';
        if (/도장[-\s]?A|\(A\)|A\s*라인|^A$/i.test(s) || s === '도장(A)') return '도장-A';
        return s;
    }

    /** 제품 마스터 제조공정 → 도장-A/B 목록 */
    function _productPaintProcs(product) {
        if (!product) return [];
        return [product.process1, product.process2, product.process3, product.process4]
            .map(_normalizePaintLine)
            .filter(function (p) { return p === '도장-A' || p === '도장-B'; });
    }

    /** 사출 품명 → 연동 제품 마스터 목록 */
    function _productsForInjPart(carModel, partName, color) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const mat = _findMatEntryForTile(mats, carModel, partName, color);
        const byId = {};

        function add(p) {
            if (p && p.id) byId[p.id] = p;
        }

        if (mat) {
            (mat.productIds || []).forEach(function (id) {
                add(Storage.getById(DB.STORES.PRODUCTS, id));
            });
            const names = [_normKeyStr(mat.mfgProductName), _normKeyStr(mat.mfgProductName2)].filter(Boolean);
            products.forEach(function (p) {
                if (_normKeyStr(p.carModel) !== _normKeyStr(carModel)) return;
                if (names.indexOf(_normKeyStr(p.partName)) >= 0) add(p);
            });
        }

        products.forEach(function (p) {
            if (_normKeyStr(p.carModel) === _normKeyStr(carModel)
                && _normKeyStr(p.partName) === _normKeyStr(partName)) {
                add(p);
            }
        });

        return Object.keys(byId).map(function (k) { return byId[k]; });
    }

    /**
     * 기초정보(제품 마스터 제조공정·도장A/B 컬러)로 도착 라인 자동 판정
     * - 도장-A만 → A / 도장-B만 → B
     * - 둘 다 있으면 paintColorA/B 와 사출 컬러 매칭
     * - 오늘 생산계획 line 폴백
     */
    function _inferPaintLineFromMaster(carModel, partName, color) {
        const prods = _productsForInjPart(carModel, partName, color);
        let voteA = 0;
        let voteB = 0;
        const colorStr = String(color || '').trim();

        prods.forEach(function (product) {
            const procs = [];
            _productPaintProcs(product).forEach(function (p) {
                if (procs.indexOf(p) < 0) procs.push(p);
            });
            const hasA = procs.indexOf('도장-A') >= 0;
            const hasB = procs.indexOf('도장-B') >= 0;
            if (hasA && !hasB) { voteA += 1; return; }
            if (hasB && !hasA) { voteB += 1; return; }
            if (hasA && hasB) {
                const cA = String(product.paintColorA || '').trim();
                const cB = String(product.paintColorB || '').trim();
                if (colorStr && cA && _colorsMatch(cA, colorStr)) { voteA += 2; return; }
                if (colorStr && cB && _colorsMatch(cB, colorStr)) { voteB += 2; return; }
                const base = String(product.color || '').trim();
                if (colorStr && base && _colorsMatch(base, colorStr)) {
                    // 기본 컬러만 있으면 A 우선(단일 라인 관례)
                    voteA += 1;
                    return;
                }
            }
        });

        if (voteB > voteA) return { line: '도장-B', source: '제품 마스터' };
        if (voteA > voteB) return { line: '도장-A', source: '제품 마스터' };

        // 오늘 생산계획 라인 폴백
        try {
            const today = UIUtils.today ? UIUtils.today() : '';
            const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];
            const hit = plans.find(function (p) {
                if (!p || String(p.date || '').slice(0, 10) !== today) return false;
                if (_normKeyStr(p.carModel) !== _normKeyStr(carModel)) return false;
                const line = _normalizePaintLine(p.line);
                if (line !== '도장-A' && line !== '도장-B') return false;
                const pn = _normKeyStr(p.partName);
                return pn === _normKeyStr(partName)
                    || prods.some(function (pr) { return _normKeyStr(pr.partName) === pn; });
            });
            if (hit) {
                return { line: _normalizePaintLine(hit.line), source: '생산계획' };
            }
        } catch (e) { /* ignore */ }

        if (voteB && !voteA) return { line: '도장-B', source: '제품 마스터' };
        return { line: '도장-A', source: prods.length ? '제품 마스터' : '기본값' };
    }

    function _applyPaintLineRadio(radioName, line, hintElId) {
        const want = line === '도장-B' ? '도장-B' : '도장-A';
        document.querySelectorAll('input[name="' + radioName + '"]').forEach(function (el) {
            el.checked = el.value === want;
        });
        if (hintElId) {
            const hint = document.getElementById(hintElId);
            if (hint) {
                hint.textContent = '기초정보 기준 자동 선택: ' + want
                    + ' · 필요 시 변경 가능';
            }
        }
    }

    function _buildPaintWorkLineMap() {
        const map = {};
        (Storage.getAll(DB.STORES.PAINTING_WORK) || []).forEach(function(w) {
            if (w.id) map[w.id] = w.line || '';
        });
        return map;
    }

    /** 도장 투입 입고(refOutId) → 라인 맵 (출고 이력에 paintLine 없을 때 복원) */
    function _buildPaintLineFromInputMap() {
        const byOutId = {};
        const byKey = {};
        const store = DB.STORES.PAINTING_INPUT_INVENTORY;
        if (!store) return { byOutId: byOutId, byKey: byKey };
        (Storage.getAll(store) || []).forEach(function(r) {
            if (String(r.type || '') !== '입고') return;
            const line = _normalizePaintLine(r.paintLine || r.line);
            if (line !== '도장-A' && line !== '도장-B') return;
            if (r.refOutId) byOutId[String(r.refOutId)] = line;
            const day = String(r.date || '').slice(0, 10);
            const lot = String(r.lotNo || (r.lots && r.lots[0] && r.lots[0].lotNo) || '').trim();
            const key = [day, r.carModel || '', r.partName || '', r.color || '', lot].join('||');
            if (day) byKey[key] = line;
        });
        return { byOutId: byOutId, byKey: byKey };
    }

    function _resolveOutgoingPaintLine(d, workLineMap, inputMaps) {
        if (!d) return '';
        let paintLine = _normalizePaintLine(
            d.paintLine || d.line || d.paint_line || d.destinationLine || d.destLine || ''
        );
        if (paintLine === '도장-A' || paintLine === '도장-B') return paintLine;

        if (d.refWorkId && workLineMap && workLineMap[d.refWorkId]) {
            paintLine = _normalizePaintLine(workLineMap[d.refWorkId]);
            if (paintLine === '도장-A' || paintLine === '도장-B') return paintLine;
        }

        if (inputMaps && d.id && inputMaps.byOutId[String(d.id)]) {
            return inputMaps.byOutId[String(d.id)];
        }

        if (inputMaps && inputMaps.byKey) {
            const day = String(d.date || '').slice(0, 10);
            const lot = String(d.lotNo || (d.lots && d.lots[0] && d.lots[0].lotNo) || '').trim();
            const key = [day, d.carModel || '', d.partName || '', d.color || '', lot].join('||');
            if (inputMaps.byKey[key]) return inputMaps.byKey[key];
        }

        // 비고/출처에 도장-A/B 표기가 있으면 사용
        paintLine = _normalizePaintLine(String(d.note || '') + ' ' + String(d.source || ''));
        if (paintLine === '도장-A' || paintLine === '도장-B') return paintLine;
        return '';
    }

    function _outgoingActorLabel(d) {
        const direct = String(d.outgoingByName || '').trim();
        if (direct) return direct;
        return _formatActorLabel(d.outgoingBy || d.processedBy || '');
    }

    function _outgoingTypeHtml(d, workLineMap, inputMaps) {
        const src = String(d.source || '').trim();
        const paintLine = _resolveOutgoingPaintLine(d, workLineMap, inputMaps);

        // 생산출고(도장 투입) → 유형을 도장-A / 도장-B로 표시
        if (paintLine === '도장-A' || paintLine === '도장-B') {
            const bg = paintLine === '도장-B' ? '#ffedd5' : '#ede9fe';
            const fg = paintLine === '도장-B' ? '#c2410c' : '#6d28d9';
            const br = paintLine === '도장-B' ? '#fdba74' : '#c4b5fd';
            return `<span style="display:inline-block;font-size:0.78rem;background:${bg};color:${fg};border:1px solid ${br};padding:2px 10px;border-radius:10px;font-weight:800;letter-spacing:-0.02em;">${paintLine}</span>`;
        }

        let detailBadge = '';
        if (d.outgoingType === '반출') {
            detailBadge = `<span style="margin-left:4px;font-size:0.72rem;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;padding:1px 7px;border-radius:10px;font-weight:700;">반출</span>`;
        } else if (d.outgoingType === '생산출고' || src === '도장 작업 출고' || src === '사출 창고 생산출고') {
            detailBadge = `<span style="margin-left:4px;font-size:0.72rem;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;padding:1px 7px;border-radius:10px;font-weight:700;">생산출고</span>`;
        } else if (src === '도장 입고') {
            detailBadge = `<span style="margin-left:4px;font-size:0.72rem;background:#dbeafe;color:#2563eb;border:1px solid #93c5fd;padding:1px 7px;border-radius:10px;font-weight:700;">도장입고</span>`;
        }

        return `${UIUtils.badge('출고', 'danger')}${detailBadge}`;
    }

    function _actorFieldsForRecord(type) {
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        const actorId = _getCurrentActorId();
        const label = user
            ? String(user.displayName || user.name || user.username || actorId || '')
            : '';
        if (type === '출고') {
            if (actorId) return { outgoingBy: actorId };
            if (label) return { outgoingBy: label };
            return {};
        }
        if (actorId) return { receivedBy: actorId };
        if (label) return { receivedBy: label };
        return {};
    }

    function _getResetActorFields() {
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        const actorId = _getCurrentActorId();
        const displayName = user
            ? String(user.displayName || user.name || user.username || '관리자')
            : '관리자';
        return {
            receivedBy: actorId || displayName,
            resetBy: displayName,
            resetById: actorId || '',
            resetAt: new Date().toISOString()
        };
    }

    function _formatResetHistoryDetail(d) {
        const parts = [];
        if (d.resetReason) parts.push(String(d.resetReason).trim());
        if (d.stockBefore != null) {
            const after = d.stockAfterTarget != null ? d.stockAfterTarget : 0;
            parts.push(`${UIUtils.formatNumber(d.stockBefore)} EA → ${UIUtils.formatNumber(after)} EA`);
        }
        const who = d.resetBy || _formatActorLabel(d.receivedBy || '');
        if (who) parts.push('처리: ' + who);
        if (d.resetAt) parts.push(String(d.resetAt).slice(0, 16).replace('T', ' '));
        return parts.join(' · ') || '재고 오류 보정 입고';
    }

    function _isStockErrorResetRecord(d) {
        return !!(d && (d.isStockErrorReset || d.resetAction === 'stock_error_reset' || /재고 오류 초기화/.test(String(d.source || ''))));
    }

    function _isUnmatchedActionRecord(d) {
        return !!(d && (d.unmatchedAction === 'clear' || d.unmatchedAction === 'absorb'));
    }

    /** 재고 수량 표시 — formatNumber(0)==='-' 이므로 0도 숫자로 보여준다 */
    function _fmtStockQty(n) {
        if (n == null || n === '') return '-';
        const num = Number(n);
        if (isNaN(num)) return String(n);
        return num.toLocaleString('ko-KR');
    }

    function _ensureActorOption(selectEl) {
        if (!selectEl) return;
        const actorId = _getCurrentActorId();
        if (!actorId) return;
        const exists = Array.from(selectEl.options).some(function(opt) { return opt.value === actorId; });
        if (exists) return;
        const current = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        const label = current
            ? String(current.displayName || current.username || actorId)
            : actorId;
        const opt = document.createElement('option');
        opt.value = actorId;
        opt.textContent = label;
        selectEl.appendChild(opt);
    }

    function _prefillActorSelect(type) {
        const actorId = _getCurrentActorId();
        if (!actorId) return;
        const sel = document.getElementById(type === '입고' ? 'addInvReceivedBy' : 'addInvOutgoingBy');
        if (!sel) return;
        if (type === '출고') {
            if (!_isValidOutgoingActor(actorId)) return;
        } else {
            _ensureActorOption(sel);
        }
        sel.value = actorId;
    }

    function _formatDeductionSummary(deductions) {
        if (!deductions || !deductions.length) return '';
        return deductions.map(function(d) {
            if (d.lotNo === InvCalc.UNMATCHED) return '미차감 ' + UIUtils.formatNumber(d.qty);
            return d.lotNo + ' −' + UIUtils.formatNumber(d.qty);
        }).join(', ');
    }

    function _enrichStockSnapshot(record) {
        const siblings = (Storage.getAll(STORE) || []).filter(function(d) {
            return d.carModel === record.carModel &&
                d.partName === record.partName &&
                (d.color || '') === (record.color || '');
        });
        const step = InvCalc.replaySteps(siblings.concat([record])).find(function(s) { return s.rec === record; });
        if (!step) return record;
        record.stockBefore = step.stockBefore;
        record.stockAfter = step.stockAfter;
        record.unmatchedAfter = step.unmatchedAfter;
        if (step.deductions && step.deductions.length) {
            record.deductionSummary = _formatDeductionSummary(step.deductions);
        }
        return record;
    }

    async function _addInventoryRecord(record) {
        _enrichStockSnapshot(record);
        return Storage.add(STORE, record);
    }

    function _renderInvHistoryRow(step, isLast) {
        const d = step.rec;
        const isOut = d.type === '출고';
        const isReset = _isStockErrorResetRecord(d);
        const isUnmatchedAct = _isUnmatchedActionRecord(d);
        const route = _invRoute(d);
        const lotText = isUnmatchedAct
            ? '—'
            : ((Array.isArray(d.lots) && d.lots.length)
                ? d.lots.map(l => l.lotNo).filter(Boolean).join(', ')
                : (d.lotNo || '무표기'));
        const qty = isUnmatchedAct
            ? (Number(d.quantity) || 0)
            : InvCalc.qtyOf(d);
        const who = d.resetBy || _formatActorLabel(d.receivedBy || d.outgoingBy || '');
        const stockBefore = step.stockBefore;
        const stockAfter = step.stockAfter;
        const unmatchedAfter = step.unmatchedAfter;
        const dedTitle = step.deductions ? _formatDeductionSummary(step.deductions) : (d.deductionSummary || '');
        const beforeColor = stockBefore < 0 ? 'var(--accent-red)' : (stockBefore === 0 ? 'var(--text-muted)' : 'var(--accent-blue)');
        const afterColor = stockAfter < 0 ? 'var(--accent-red)' : (stockAfter === 0 ? 'var(--text-muted)' : 'var(--accent-blue)');
        const typeBadge = isUnmatchedAct
            ? `<span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;
                background:rgba(180,83,9,.12);color:#b45309;">보정</span>
               <span style="margin-left:4px;font-size:0.65rem;font-weight:700;background:${d.unmatchedAction === 'absorb' ? '#b45309' : '#0369a1'};color:#fff;padding:1px 6px;border-radius:10px;">
                 ${d.unmatchedAction === 'absorb' ? '미차감 반영' : '미차감 리셋'}
               </span>`
            : `<span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;
                background:${isOut ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'};
                color:${isOut ? '#dc2626' : '#16a34a'};">${isOut ? '출고' : '입고'}</span>
               ${isReset ? `<span style="margin-left:4px;font-size:0.65rem;font-weight:700;background:#dc2626;color:#fff;padding:1px 6px;border-radius:10px;">재고오류 초기화</span>` : ''}`;
        const qtyHtml = isUnmatchedAct
            ? `<span style="color:#b45309;">${UIUtils.formatNumber(qty)}</span>
               <div style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">미차감 처리</div>`
            : `${isOut ? '−' : '+'}${UIUtils.formatNumber(qty)}`;
        const rowBg = isLast
            ? ' style="background:rgba(37,99,235,.05);"'
            : (isUnmatchedAct ? ' style="background:rgba(180,83,9,.06);"'
                : (isReset ? ' style="background:rgba(220,38,38,.05);"' : ''));
        return `
            <tr${rowBg}>
                <td style="white-space:nowrap;font-size:0.8rem;">${InvCalc.normDate(d.date).stamp || (d.date || '-')}</td>
                <td style="white-space:nowrap;">${typeBadge}</td>
                <td style="white-space:nowrap;">
                    ${_renderRouteBadge(d, route)}
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;max-width:220px;
                        white-space:normal;line-height:1.35;" title="${_escapeHtml(String(route.detail || ''))}">${_escapeHtml(String(route.detail || ''))}</div>
                </td>
                <td style="font-size:0.8rem;">${lotText}</td>
                <td style="text-align:right;font-weight:600;color:${isUnmatchedAct ? '#b45309' : (isOut ? 'var(--accent-red)' : 'var(--accent-green)')};">
                    ${qtyHtml}
                </td>
                <td style="text-align:right;font-weight:700;color:${beforeColor};white-space:nowrap;">
                    ${stockBefore != null ? _fmtStockQty(stockBefore) : '-'}
                </td>
                <td style="text-align:right;white-space:nowrap;"${dedTitle ? ` title="${dedTitle.replace(/"/g, '&quot;')}"` : ''}>
                    <div style="font-weight:700;color:${afterColor};">${stockAfter != null ? _fmtStockQty(stockAfter) : '-'}${isLast ? ' <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">현재</span>' : ''}</div>
                    ${unmatchedAfter > 0 ? `<div style="font-size:0.68rem;color:var(--accent-red);font-weight:700;">미차감 ${_fmtStockQty(unmatchedAfter)}</div>` : ''}
                </td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${who || '-'}</td>
            </tr>`;
    }

    let _activeTab = 'stock';
    let _injOutListupRows = [];

    function _txHistoryCard(tab) {
        const isIn = tab === 'incoming';
        const suffix = isIn ? 'In' : 'Out';
        const title = isIn ? '입고 이력' : '출고 이력';
        const icon = isIn ? 'move_to_inbox' : 'outbox';
        const monthAgo = UIUtils.monthAgo ? UIUtils.monthAgo() : '';
        const today = UIUtils.today ? UIUtils.today() : '';
        return `
                <div class="card">
                    <div class="card-header" style="flex-wrap:wrap; gap:8px;">
                        <h4><span class="material-symbols-outlined">${icon}</span> ${title}</h4>
                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                            <input type="date" id="injTxStart${suffix}" class="form-input" style="width:165px;min-width:165px;" value="${monthAgo}">
                            <span style="color:var(--text-muted);">~</span>
                            <input type="date" id="injTxEnd${suffix}" class="form-input" style="width:165px;min-width:165px;" value="${today}">
                            <select id="injTxCar${suffix}" class="form-select" style="width:150px;min-width:150px;"
                                onchange="InjectionWarehouseModule.onTxCarChange('${suffix}')">
                                <option value="">전체 차종</option>
                            </select>
                            <select id="injTxPart${suffix}" class="form-select" style="width:200px;min-width:200px;">
                                <option value="">전체 품명</option>
                            </select>
                            <button class="btn btn-primary" onclick="InjectionWarehouseModule.filterTransactions('${tab}')">
                                <span class="material-symbols-outlined">search</span> 조회
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="white-space:nowrap;">${isIn ? '창고 입고일' : '출고일시'}</th>
                                        <th>수입검사일</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>컬러</th>
                                        <th>사출처</th>
                                        <th>LOT번호</th>
                                        <th style="text-align:right;">수량</th>
                                        <th style="text-align:right;">금액</th>
                                        <th>유형</th>
                                        ${isIn ? '<th>입고경로</th><th>입고자</th>' : '<th>출고자</th>'}
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="injInvTableBody${suffix}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
    }

    function render(container) {
        const actionCards = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">
                ${ProdAppleMenu.card({ label: '레이아웃', subtitle: '보관창고 배치도', icon: 'map', accent: '#06b6d4', onClick: "sessionStorage.setItem('mes_layout_back','injection-warehouse');Router.navigate('injection-layout')" })}
                ${ProdAppleMenu.card({ label: '사출입고', subtitle: '사출 자재 입고', icon: 'move_to_inbox', accent: '#10b981', onClick: "InjectionWarehouseModule.openAddModal('입고')" })}
                ${ProdAppleMenu.card({ label: '사출 출고', subtitle: '사출 자재 출고', icon: 'outbox', accent: '#f59e0b', onClick: "InjectionWarehouseModule.openAddModal('출고')" })}
            </div>`;

        container.innerHTML = `
            <div class="fade-in-up">
                <div id="injNavStrip" class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    ${[
                        { tab:'stock',    icon:'inventory_2',  title:'사출품현황', sub:'차종별 재고·입고대기', active:true  },
                        { tab:'incoming', icon:'move_to_inbox',title:'입고이력',   sub:'사출 자재 입고 기록', active:false },
                        { tab:'outgoing', icon:'outbox',       title:'출고 이력', sub:'사출 자재 출고 기록', active:false }
                    ].map(m => `
                        <button type="button" class="inj-tab-btn${m.active?' inj-tab-active':''}" data-tab="${m.tab}"
                            onclick="InjectionWarehouseModule._switchTab('${m.tab}')"
                            style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                                   border:${m.active?'2px solid var(--accent-blue)':'1.5px solid var(--border-color)'};
                                   background:var(--bg-primary);color:var(--text-primary);
                                   cursor:pointer;min-width:160px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                            <span style="display:inline-flex;align-items:center;justify-content:center;
                                         width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                         background:${m.active?'var(--accent-blue)':'var(--bg-secondary)'};">
                                <span class="material-symbols-outlined" style="font-size:24px;color:${m.active?'#fff':'var(--text-muted)'};">${m.icon}</span>
                            </span>
                            <span style="display:flex;flex-direction:column;gap:2px;">
                                <span style="font-size:0.92rem;font-weight:700;">${m.title}</span>
                                <span style="font-size:0.73rem;color:var(--text-muted);">${m.sub}</span>
                            </span>
                        </button>`).join('')}
                    </div>
                    ${actionCards}
                </div>

                <div id="injTabStock">
                    <div id="injInspStandbyCard" style="margin-bottom:20px;"></div>
                    <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-red);">
                        <div class="card-header" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                            <h4 style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span class="material-symbols-outlined" style="color:var(--accent-red);">checklist</span>
                                사출 창고 출고 리스트업
                                <span id="injOutListupBadge" style="font-size:0.78rem; background:var(--accent-red); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600; display:none;"></span>
                            </h4>
                            <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.renderOutgoingListup()">
                                <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                            </button>
                        </div>
                        <div class="card-body" id="injOutListupBody" style="padding:0;"></div>
                    </div>
                    <div class="card" style="margin-bottom:20px;">
                        <div class="card-header" style="flex-wrap:wrap;gap:8px;">
                            <h4><span class="material-symbols-outlined">grid_view</span> 차종별 재고 현황</h4>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto;">
                                <div id="injStockErrorAdminBar"></div>
                                <select id="injTileCarFilter" class="form-select" style="width:140px;"
                                    onchange="InjectionWarehouseModule.renderCarTiles()">
                                    <option value="">전체 차종</option>
                                </select>
                            </div>
                        </div>
                        <div class="card-body">
                            <div id="injAliasCleanupBanner" style="display:none;"></div>
                            <div id="injCarTiles" style="display:flex; gap:12px; align-items:flex-start;"></div>
                        </div>
                    </div>
                </div>
                <div id="injTabIncoming" style="display:none;">
                    ${_txHistoryCard('incoming')}
                </div>
                <div id="injTabOutgoing" style="display:none;">
                    ${_txHistoryCard('outgoing')}
                </div>
            </div>
        `;
        _activeTab = 'stock';
        loadData();
    }

    function _switchTab(tab) {
        _activeTab = tab;
        ['stock', 'incoming', 'outgoing'].forEach(function (t) {
            const panelEl = document.getElementById('injTab' + t.charAt(0).toUpperCase() + t.slice(1));
            if (panelEl) panelEl.style.display = t === tab ? '' : 'none';
        });
        document.querySelectorAll('.inj-tab-btn').forEach(function (btn) {
            const isActive = btn.dataset.tab === tab;
            btn.style.border = isActive ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)';
            const iconBox = btn.querySelector('span[style*="border-radius:10px"]');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (iconBox) iconBox.style.background = isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)';
            if (icon) icon.style.color = isActive ? '#fff' : 'var(--text-muted)';
        });
        // 종료일이 오늘보다 이전이면 보정 (UTC today 버그·장시간 열린 탭 대비)
        if (tab === 'incoming' || tab === 'outgoing') {
            const suffix = tab === 'incoming' ? 'In' : 'Out';
            const todayStr = UIUtils.today ? UIUtils.today() : '';
            const endEl = document.getElementById('injTxEnd' + suffix);
            if (endEl && todayStr && (!endEl.value || endEl.value < todayStr)) endEl.value = todayStr;
            filterTransactions(tab);
        }
    }

    function _buildDisplayStockMap() {
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const stockMap = {};

        (materials || []).forEach(function(m) {
            const carModel = _normKeyStr(m.carModel);
            const partName = _normKeyStr(m.injPartName || m.partName);
            const color = _normKeyStr(m.injColor || m.color);
            if (!carModel && !partName && !color) return;
            const key = `${carModel}||${partName}||${color}`;
            if (!stockMap[key]) {
                stockMap[key] = {
                    carModel: carModel,
                    partName: partName,
                    color: color,
                    stock: 0,
                    price: Number(m.unitPrice) || 0
                };
            } else if (!stockMap[key].price) {
                stockMap[key].price = Number(m.unitPrice) || 0;
            }
        });

        (data || []).forEach(function(d) {
            const dCar = _normKeyStr(d.carModel);
            const dPart = _normKeyStr(d.partName);
            const dColorRaw = _normKeyStr(d.color);
            let mat = d.injMaterialId && materials.find(function(m) { return m.id === d.injMaterialId; });
            if (!mat) {
                const sameCarPart = materials.filter(function(m) {
                    return _normKeyStr(m.carModel) === dCar && _normKeyStr(m.injPartName) === dPart;
                });
                mat = sameCarPart.find(function(m) {
                    return _splitMasterColors(m).some(function(mc) { return _colorsMatch(mc, dColorRaw); });
                }) || (sameCarPart.length === 1 ? sameCarPart[0] : null);
            }
            if (mat && dColorRaw) {
                const matColors = _splitMasterColors(mat);
                if (matColors.length && !matColors.some(function(mc) { return _colorsMatch(mc, dColorRaw); })) mat = null;
            }
            const carModel = _normKeyStr((mat && mat.carModel) || d.carModel);
            const partName = _normKeyStr((mat && (mat.injPartName || mat.partName)) || d.partName);
            const color = _resolveMasterColor(carModel, partName, dColorRaw || (mat && (mat.injColor || mat.color)), materials);
            const key = `${carModel}||${partName}||${color}`;
            if (!stockMap[key]) {
                // 제품 라인코드(6PS/AZ3)·제품 컬러(75 GRAY 등)는 사출 마스터 키가 아님 → 유령 타일 방지
                if (_isOrphanInventoryColor(carModel, partName, dColorRaw || color, materials)) return;
                stockMap[key] = {
                    carModel: carModel,
                    partName: partName,
                    color: color,
                    stock: 0,
                    price: Number(mat ? mat.unitPrice : 0) || 0
                };
            }
        });

        Object.keys(stockMap).forEach(function(key) {
            const g = stockMap[key];
            const bal = InvCalc.lotBalances(_filterProductRecords(g.carModel, g.partName, g.color));
            g.stock = bal.total;
            g.unmatched = bal.unmatched || 0;
        });
        return stockMap;
    }

    function loadData() {
        const data = Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        const stockMap = _buildDisplayStockMap();
        let totalValue = 0;
        Object.keys(stockMap).forEach(function(key) {
            const g = stockMap[key];
            totalValue += g.stock * (Number(g.price) || 0);
        });

        const totalStock = Object.values(stockMap).reduce((s, v) => s + v.stock, 0);
        const partCount  = Object.keys(stockMap).length;


        // ── 차종 드롭다운 채우기 ───────────────────────────────────
        const carModels = UIUtils.sortCarModels(Object.values(stockMap).map(v => v.carModel));
        ['injTileCarFilter', 'injTxCarIn', 'injTxCarOut'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = `<option value="">전체 차종</option>` +
                carModels.map(c => `<option value="${c}">${c}</option>`).join('');
            sel.value = cur;
        });

        // ── 차종별 타일 렌더링 ─────────────────────────────────────
        renderCarTiles(stockMap, data);

        if (_activeTab === 'incoming') filterTransactions('incoming');
        else if (_activeTab === 'outgoing') filterTransactions('outgoing');

        renderInspStandby();
        renderOutgoingListup();
    }

    // 차종 카드 HTML 생성
    function _buildCarCard(carModel, items) {
        const totalCarStock = items.reduce((s, i) => s + i.stock, 0);
        const unmatchedCount = items.filter(function(i) { return (Number(i.unmatched) || 0) > 0; }).length;
        // 사출자재 마스터에서 제작품목 설정 여부 확인용
        const _allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const _products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _itemTypeLabel = _getCarItemTypeLabel(carModel, items, _allMats, _products);
        const rows = items
            .sort((a, b) => a.partName.localeCompare(b.partName))
            .map(item => {
                // 생산 계획 예약 수량 조회
                const r = (typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule._calcInjPlanReserved)
                    ? ProductionPlanModule._calcInjPlanReserved(item.partName, null, item.carModel, item.color)
                    : { pending: 0, inProgress: 0 };
                const reserved   = r.pending + r.inProgress;
                const available  = item.stock - reserved;

                // ── 제작품목 미설정 경고 뱃지 ──────────────────────────
                // v19+: 타일 쪽 partName은 _normKeyStr()로 canonicalize 될 수 있어 .trim() 단독 비교는 매칭 실패 가능
                //      → 차종+품명(+컬러) 정규화 키로 사출자재 마스터를 찾는다.
                const _matEntry = _findMatEntryForTile(_allMats, carModel, item.partName, item.color);
                const _hasMfgMapping = _matHasMfgMapping(_matEntry);
                const _noMappingBadge = (!_hasMfgMapping)
                    ? `<span title="설정 > 사출자재에서 제작품목1/2를 입력해야 예약 수량이 표시됩니다"
                             style="font-size:0.62rem;background:rgba(234,179,8,0.15);color:#b45309;
                                    border:1px solid rgba(234,179,8,0.4);border-radius:3px;
                                    padding:0 4px;margin-left:4px;cursor:help;vertical-align:middle;">
                            ⚠ 제작품목 미설정
                        </span>`
                    : '';

                // 재고 표시 (예약 있을 때는 취소선 + 가용 표시)
                const _ep = encodeURIComponent(item.partName);
                const _em = encodeURIComponent(carModel);
                const _ec = encodeURIComponent(item.color || '');
                const _resolvedColor = _resolveMasterColor(carModel, item.partName, item.color, _allMats);
                const _isOrphanAlias = !!item.isAliasOrphan || (
                    item.color && _resolvedColor &&
                    _normKeyStr(item.color) !== _normKeyStr(_resolvedColor) &&
                    _colorsMatch(item.color, _resolvedColor)
                );
                const _aliasDeleteBtn = (_isOrphanAlias && _isAdminUser())
                    ? `<button type="button"
                            onclick="event.stopPropagation();InjectionWarehouseModule.deleteProductColorRecords('${_em}','${_ep}','${_ec}')"
                            title="마스터에 없는 별칭 컬러(${item.color}) 입출고 이력 전체 삭제"
                            style="display:inline-block;margin-left:4px;font-size:0.58rem;font-weight:700;background:#7c2d12;
                                   color:#fff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;vertical-align:middle;white-space:nowrap;">
                            별칭삭제
                       </button>`
                    : '';
                let stockHtml;
                if (r.inProgress > 0) {
                    stockHtml = `
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
                            <span style="font-size:0.7rem;color:var(--text-muted);text-decoration:line-through;">${UIUtils.formatNumber(item.stock)}</span>
                            <span style="font-size:0.85rem;font-weight:700;color:${available > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(available)} EA</span>
                            <span onclick="event.stopPropagation();InjectionWarehouseModule.showReserveDetailPopup(event,'${_ep}','${_em}','${_ec}')"
                                  style="font-size:0.68rem;background:rgba(234,88,12,0.12);color:#ea580c;border:1px solid rgba(234,88,12,0.3);border-radius:3px;padding:0 4px;white-space:nowrap;cursor:pointer;"
                                  title="클릭하여 예약 상세 보기">미입력실적 -${UIUtils.formatNumber(r.inProgress)} ℹ</span>
                        </div>`;
                } else if (r.pending > 0) {
                    stockHtml = `
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
                            <span style="font-size:0.7rem;color:var(--text-muted);text-decoration:line-through;">${UIUtils.formatNumber(item.stock)}</span>
                            <span style="font-size:0.85rem;font-weight:700;color:${available > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(available)} EA</span>
                            <span onclick="event.stopPropagation();InjectionWarehouseModule.showReserveDetailPopup(event,'${_ep}','${_em}','${_ec}')"
                                  style="font-size:0.68rem;background:rgba(234,179,8,0.12);color:#ca8a04;border:1px solid rgba(234,179,8,0.3);border-radius:3px;padding:0 4px;white-space:nowrap;cursor:pointer;"
                                  title="클릭하여 예약 상세 보기">예약 -${UIUtils.formatNumber(r.pending)} ℹ</span>
                        </div>`;
                } else {
                    stockHtml = `<span style="font-size:0.85rem;font-weight:700;color:${item.stock > 0 ? 'var(--accent-blue)' : 'var(--accent-red)'};">${UIUtils.formatNumber(item.stock)} EA</span>`;
                }

                // 재고 마이너스는 데이터(입출고 기록) 오류 — 숨기지 않고 경고 뱃지로 노출
                // 관리자는 뱃지를 클릭하면 아래 "입출고 조회"로 바로 이동해 원인 기록을 찾아 삭제할 수 있다.
                if (item.stock < 0) {
                    const badgeClick = _isAdminUser()
                        ? `event.stopPropagation();InjectionWarehouseModule.jumpToTxHistory('${_em}','${_ep}','${_ec}');`
                        : '';
                    const resetBtn = _isAdminUser()
                        ? `${_isOrphanAlias ? _aliasDeleteBtn : ''}<button type="button"
                                onclick="event.stopPropagation();InjectionWarehouseModule.openResetStockErrorModal('${_em}','${_ep}','${_ec}',${item.stock})"
                                title="보정 입고로 재고를 0 EA로 초기화"
                                style="display:inline-block;margin-left:4px;font-size:0.58rem;font-weight:700;background:#dc2626;
                                       color:#fff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;vertical-align:middle;white-space:nowrap;">
                                초기화
                           </button>`
                        : '';
                    stockHtml += `<span title="입출고 합계가 마이너스입니다.${_isAdminUser() ? ' 클릭하면 입출고 조회에서 원인 기록을 확인/삭제할 수 있습니다.' : ' 최근 입고/출고/LOT 수정 기록을 확인하세요.'}"
                        onclick="${badgeClick}"
                        style="display:inline-block;margin-left:4px;font-size:0.6rem;font-weight:700;background:rgba(220,38,38,0.12);
                               color:#b91c1c;border:1px solid rgba(220,38,38,0.4);border-radius:3px;padding:0 4px;
                               vertical-align:middle;${_isAdminUser() ? 'cursor:pointer;' : 'cursor:help;'}white-space:nowrap;">⚠ 재고 오류</span>${resetBtn}`;
                } else if (_isOrphanAlias) {
                    stockHtml += _aliasDeleteBtn;
                }

                // 미차감(과다출고) — LOT에서 차감하지 못한 출고 잔액. 클릭하면 상세에서 반영/리셋 가능
                const unmatchedQty = Number(item.unmatched) || 0;
                if (unmatchedQty > 0) {
                    stockHtml += `<span title="과다 출고(미차감) ${_fmtStockQty(unmatchedQty)} EA — 클릭하면 상세에서 반영/리셋할 수 있습니다."
                        onclick="event.stopPropagation();InjectionWarehouseModule.showPartDetail('${carModel}','${item.partName}','${item.color || ''}')"
                        style="display:inline-block;margin-left:4px;font-size:0.6rem;font-weight:700;background:rgba(180,83,9,0.12);
                               color:#b45309;border:1px solid rgba(180,83,9,0.45);border-radius:3px;padding:0 4px;
                               vertical-align:middle;cursor:pointer;white-space:nowrap;">⚠ 미차감 ${_fmtStockQty(unmatchedQty)}</span>`;
                }

                return `
                <tr onclick="InjectionWarehouseModule.showPartDetail('${carModel}','${item.partName}','${item.color}')"
                    style="cursor:pointer;"
                    onmouseover="this.style.background='var(--bg-secondary)'"
                    onmouseout="this.style.background=''">
                    <td style="padding:5px 8px; font-size:0.82rem; font-weight:600;
                               border-bottom:1px solid var(--border-color);">
                        ${item.partName}${_noMappingBadge}
                    </td>
                    <td style="padding:5px 8px; font-size:0.82rem; color:var(--text-muted);
                               border-bottom:1px solid var(--border-color);">
                        ${item.color || '-'}
                        ${_isOrphanAlias ? `<span style="margin-left:4px;font-size:0.58rem;color:#b45309;font-weight:700;" title="마스터 컬러(${_resolvedColor})와 다른 별칭 표기">⚠ 별칭</span>` : ''}
                    </td>
                    <td style="padding:5px 8px; text-align:right; border-bottom:1px solid var(--border-color);">
                        ${stockHtml}
                    </td>
                </tr>`;
            }).join('');
        return `
            <div style="border:1px solid var(--border-color); border-radius:6px;
                        overflow:hidden; background:var(--bg-primary); margin-bottom:12px;">
                <div style="background:#7ec8e3; padding:6px 10px;
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:0.92rem; color:#1a3a4a;">${carModel}${_itemTypeLabel}</span>
                    <span style="font-size:0.78rem; color:#1a3a4a; font-weight:600;display:flex;align-items:center;gap:6px;">
                        ${unmatchedCount > 0
                            ? `<span title="미차감(과다출고) 품목 ${unmatchedCount}건"
                                     style="font-size:0.65rem;font-weight:800;background:#b45309;color:#fff;
                                            border-radius:3px;padding:1px 6px;white-space:nowrap;">미차감 ${unmatchedCount}</span>`
                            : ''}
                        ${items.length}개품목
                    </span>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <tbody>${rows}</tbody>
                </table>
                <div style="padding:5px 8px; background:var(--bg-secondary);
                            border-top:2px solid var(--border-color);
                            display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.78rem; color:var(--text-muted);">합계</span>
                    <span style="font-size:0.88rem; font-weight:800; color:var(--accent-blue);">
                        ${UIUtils.formatNumber(totalCarStock)} EA
                    </span>
                </div>
            </div>
        `;
    }

    function _shortItemType(type) {
        const t = String(type || '').trim();
        if (!t) return '';
        if (t === 'A/S품') return 'A/S';
        if (t === '양산품') return '양산';
        if (t === '개발품') return '개발';
        return t.replace(/품$/, '');
    }

    function _getCarItemTypeLabel(carModel, items, materials, products) {
        const types = new Set();
        const itemParts = new Set((items || []).map(i => (i.partName || '').trim()).filter(Boolean));
        const addType = type => {
            const short = _shortItemType(type);
            if (short) types.add(short);
        };

        (products || [])
            .filter(p => p.carModel === carModel)
            .forEach(p => {
                const productName = (p.partName || '').trim();
                const linkedByMaterial = (materials || []).some(m => {
                    if (m.carModel !== carModel) return false;
                    const matPart = (m.injPartName || '').trim();
                    if (!itemParts.has(matPart)) return false;
                    return (m.productIds || []).includes(p.id)
                        || (m.mfgProductName || '').trim() === productName
                        || (m.mfgProductName2 || '').trim() === productName;
                });
                if (itemParts.has(productName) || linkedByMaterial) addType(p.itemType);
            });

        (materials || [])
            .filter(m => m.carModel === carModel && itemParts.has((m.injPartName || '').trim()))
            .forEach(m => addType(m.itemType));

        const labels = [...types];
        return labels.length ? ` (${labels.join('/')})` : '';
    }

    // 차종별 타일 렌더링 (Greedy bin-packing 컬럼 배치)
    function renderCarTiles(stockMapArg, dataArg) {
        const tilesEl = document.getElementById('injCarTiles');
        if (!tilesEl) return;

        const data = dataArg || Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const stockMap = stockMapArg || _buildDisplayStockMap();

        const mergedMap = Object.assign({}, stockMap);
        materials.forEach(mat => {
            const carModel = _normKeyStr(mat.carModel);
            const partName = _normKeyStr(mat.injPartName);
            const color = _normKeyStr(mat.injColor);
            const key = `${carModel}||${partName}||${color}`;
            // carModel/컬러가 비어도(미설정) 마스터 품목은 목록에 포함한다
            if (!mergedMap[key] && partName) {
                mergedMap[key] = {
                    carModel,
                    partName,
                    color,
                    stock:    0,
                    price:    Number(mat.unitPrice) || 0
                };
            }
        });

        _injectAliasOrphanTiles(mergedMap, materials, data);
        _renderAliasCleanupBanner(materials, data);

        const filterCar = (document.getElementById('injTileCarFilter') || {}).value || '';

        // 차종별 그룹핑 (재고 없는 품목 포함)
        const byCarModel = {};
        Object.values(mergedMap).forEach(item => {
            if (filterCar && item.carModel !== filterCar) return;
            if (_isDisplayInvalidColor(item.color)) return;
            const groupKey = item.carModel || '(차종 미설정)';
            if (!byCarModel[groupKey]) byCarModel[groupKey] = [];
            byCarModel[groupKey].push(item);
        });

        const entries = Object.entries(byCarModel);
        if (entries.length === 0) {
            tilesEl.innerHTML = `<p style="color:var(--text-muted); padding:20px;">재고 데이터가 없습니다.</p>`;
            return;
        }

        // 품목 수 내림차순 정렬
        entries.sort(([, a], [, b]) => b.length - a.length || a[0].carModel.localeCompare(b[0].carModel));

        // 컬럼 수 결정 (차종 수에 따라 유동)
        const total = entries.length;
        const COLS = total <= 2 ? total : total <= 6 ? 3 : 4;

        // Greedy bin-packing: 각 카드를 누적 품목 수가 가장 적은 컬럼에 배치
        const cols   = Array.from({ length: COLS }, () => []);       // 컬럼별 카드 목록
        const heights = Array(COLS).fill(0);                          // 컬럼별 누적 품목 수

        for (const [carModel, items] of entries) {
            const minIdx = heights.indexOf(Math.min(...heights));
            cols[minIdx].push([carModel, items]);
            heights[minIdx] += items.length + 1; // +1: 헤더/합계 행 높이 보정
        }

        // 컬럼별 HTML 생성
        tilesEl.innerHTML = cols.map(colCards => `
            <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
                ${colCards.map(([carModel, items]) => _buildCarCard(carModel, items)).join('')}
            </div>
        `).join('');

        _renderStockErrorAdminBar(mergedMap);
    }

    function _getNegativeStockItems(stockMap) {
        return Object.values(stockMap || {})
            .filter(item => (Number(item.stock) || 0) < 0)
            .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
    }

    function _renderStockErrorAdminBar(stockMap) {
        const bar = document.getElementById('injStockErrorAdminBar');
        if (!bar) return;
        if (!_isAdminUser()) {
            bar.innerHTML = '';
            return;
        }
        const negatives = _getNegativeStockItems(stockMap);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const invData = Storage.getAll(STORE) || [];
        const aliasCount = invData.filter(function(d) { return _isAliasOnlyMismatch(d, materials); }).length;
        const invalidCount = invData.filter(function(d) {
            if (_isInvalidColor(d.color)) return true;
            return !_recordMatchesMaster(d, materials);
        }).length;
        const parts = [];
        if (negatives.length) {
            parts.push(`
            <button class="btn btn-sm" style="background:#dc2626;color:#fff;border-color:#dc2626;"
                onclick="InjectionWarehouseModule.openBulkResetStockErrorsModal()"
                title="마이너스 재고 품목을 보정 입고로 0 EA로 맞춥니다">
                <span class="material-symbols-outlined" style="font-size:15px;">warning</span>
                재고 오류 초기화 (${negatives.length})
            </button>`);
        }
        if (aliasCount || invalidCount) {
            parts.push(`
            <button class="btn btn-sm btn-outline" style="border-color:#f59e0b;color:#b45309;"
                onclick="InjectionWarehouseModule.openColorCleanupModal()"
                title="BK·BLACK 등 컬러 별칭 불일치 또는 마스터 미등록 컬러 정리">
                <span class="material-symbols-outlined" style="font-size:15px;">palette</span>
                컬러 데이터 정리 (${aliasCount + invalidCount})
            </button>`);
        }
        bar.innerHTML = parts.join('');
    }

    // 입출고 조회 필터 적용 (incoming | outgoing 탭)
    function filterTransactions(tab) {
        tab = tab || _activeTab;
        if (tab !== 'incoming' && tab !== 'outgoing') return;

        const suffix = tab === 'incoming' ? 'In' : 'Out';
        const typeFixed = tab === 'incoming' ? '입고' : '출고';
        const data      = Storage.getAll(STORE);
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const start  = (document.getElementById('injTxStart' + suffix) || {}).value || '';
        const end    = (document.getElementById('injTxEnd' + suffix)   || {}).value || '';
        const car    = (document.getElementById('injTxCar' + suffix)   || {}).value || '';
        const part   = (document.getElementById('injTxPart' + suffix)  || {}).value || '';

        const filtered = data.filter(d => {
            const day = String(d.date || '').slice(0, 10);
            if (start && day < start) return false;
            if (end   && day > end)   return false;
            if (car   && d.carModel !== car)      return false;
            if (part  && d.partName !== part)     return false;
            if (d.type !== typeFixed)             return false;
            return true;
        });

        // 최신 일시순 (시각 포함 — date만 있는 구기록은 createdAt으로 복원)
        filtered.sort(function (a, b) {
            return _txRecordStamp(b).localeCompare(_txRecordStamp(a));
        });
        renderTxTable(filtered, materials, 'injInvTableBody' + suffix, typeFixed);
    }

    // 차종 변경 시 품명 드롭다운 업데이트
    function onTxCarChange(suffix) {
        suffix = suffix || 'In';
        const car  = (document.getElementById('injTxCar' + suffix) || {}).value || '';
        const data = Storage.getAll(STORE);
        const parts = [...new Set(
            data.filter(d => !car || d.carModel === car).map(d => d.partName).filter(Boolean)
        )].sort();
        const sel = document.getElementById('injTxPart' + suffix);
        if (!sel) return;
        sel.innerHTML = `<option value="">전체 품명</option>` +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // 재고 오류(마이너스) 뱃지 클릭 → 입고 이력을 해당 품목으로 필터링해 원인 기록을 바로 찾게 함 (관리자 전용)
    function jumpToTxHistory(carModel, partName, color) {
        if (!_isAdminUser()) return;
        _filterTxHistoryFor('incoming', carModel, partName);
    }

    // 입고/출고 이력 탭으로 이동해 차종·품명으로 필터링한다.
    function _filterTxHistoryFor(tab, carModel, partName) {
        const cm = decodeURIComponent(carModel || '');
        const pn = decodeURIComponent(partName || '');

        _switchTab(tab);

        setTimeout(function () {
            const suffix = tab === 'incoming' ? 'In' : 'Out';
            const startEl = document.getElementById('injTxStart' + suffix);
            const endEl   = document.getElementById('injTxEnd' + suffix);
            if (startEl) startEl.value = '2000-01-01';
            if (endEl) endEl.value = UIUtils.today ? UIUtils.today() : '';

            const carSel = document.getElementById('injTxCar' + suffix);
            if (carSel) carSel.value = cm;
            onTxCarChange(suffix);

            setTimeout(function () {
                const partSel = document.getElementById('injTxPart' + suffix);
                if (partSel) partSel.value = pn;
                filterTransactions(tab);
                const tbody = document.getElementById('injInvTableBody' + suffix);
                const card = tbody && tbody.closest('.card');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 30);
        }, 30);
    }

    // 입출고 테이블 렌더링
    function renderTxTable(data, materials, tbodyId, typeLabel) {
        const tbody = document.getElementById(tbodyId || 'injInvTableBodyIn');
        if (!tbody) return;
        const isIncoming = typeLabel === '입고';
        const emptyColspan = isIncoming ? 13 : 12;
        const emptyMsg = typeLabel === '출고' ? '출고 이력이 없습니다.' : '입고 이력이 없습니다.';
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${emptyColspan}" style="text-align:center;padding:40px;color:var(--text-muted);">${emptyMsg}</td></tr>`;
            return;
        }
        const mats = materials || Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const inspCtx = _buildInspDateContext();
        const workLineMap = isIncoming ? {} : _buildPaintWorkLineMap();
        const inputMaps = isIncoming ? null : _buildPaintLineFromInputMap();

        tbody.innerHTML = data.map(d => {
            const mat   = mats.find(m => m.carModel === d.carModel && m.injPartName === d.partName);
            const price = Number(mat ? mat.unitPrice : 0) || 0;
            const value = (Number(d.quantity) || 0) * price;
            const typeBadge = d.type === '출고' ? 'danger' : 'success';
            const isReset = _isStockErrorResetRecord(d);
            const inspDateHtml = _formatInspDateCell(d, isIncoming, inspCtx.inspDateMap, inspCtx.inboundInspMap);
            const path = isIncoming ? _incomingPathLabel(d) : null;
            const who = d.resetBy || _formatActorLabel(d.receivedBy || d.outgoingBy || '');
            const outgoingActor = _outgoingActorLabel(d);
            const actionCell = isIncoming
                ? `<button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.openIncomingTxView('${d.id}')">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">visibility</span> 보기
                   </button>`
                : `<button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.openEditModal('${d.id}')">수정</button>
                        ${_isAdminUser() ? `
                        <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#fca5a5;margin-left:4px;"
                                title="이 입출고 기록을 삭제합니다. 재고 오류(마이너스 재고) 수정 시 사용하세요."
                                onclick="InjectionWarehouseModule.remove('${d.id}')">삭제</button>` : ''}`;
            const typeCell = isIncoming
                ? `${UIUtils.badge(d.type || '입고', typeBadge)}`
                : _outgoingTypeHtml(d, workLineMap, inputMaps);
            return `
                <tr>
                    <td style="white-space:nowrap;line-height:1.3;">${_fmtTxDateCell(_txRecordStamp(d))}</td>
                    <td style="white-space:nowrap;">${inspDateHtml}</td>
                    <td>${d.carModel || '-'}</td>
                    <td><strong>${d.partName || '-'}</strong></td>
                    <td>${d.color || '-'}</td>
                    <td>${d.supplier || '-'}</td>
                    <td>${d.lotNo || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.quantity)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(value)}</td>
                    <td>
                        ${typeCell}
                        ${isReset ? `<span style="margin-left:4px;font-size:0.72rem;background:#dc2626;color:#fff;padding:1px 6px;border-radius:10px;">재고오류 초기화</span>` : ''}
                        ${isReset && d.stockBefore != null ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${UIUtils.formatNumber(d.stockBefore)} EA → ${d.stockAfterTarget != null ? UIUtils.formatNumber(d.stockAfterTarget) : '0'} EA</div>` : ''}
                        ${isReset && d.resetReason ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">사유: ${_escapeHtml(d.resetReason)}</div>` : ''}
                        ${!isReset && d.returnReason ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">사유: ${d.returnReason}</div>` : ''}
                        ${!isIncoming && d.refWorkId ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">작업연동</div>` : ''}
                    </td>
                    ${isIncoming ? `<td style="white-space:nowrap;">
                        <span style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:999px;
                            border:1px solid ${path.color}44;background:${path.color}12;color:${path.color};">${path.label}</span>
                        ${path.detail ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;max-width:140px;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_escapeHtml(path.detail)}">${_escapeHtml(path.detail)}</div>` : ''}
                    </td>
                    <td style="white-space:nowrap;font-size:0.85rem;">${who ? _escapeHtml(who) : '<span style="color:var(--text-muted);font-size:0.78rem;">미등록</span>'}</td>` : `<td style="white-space:nowrap;font-size:0.85rem;">${outgoingActor ? _escapeHtml(outgoingActor) : '<span style="color:var(--text-muted);font-size:0.78rem;">미등록</span>'}</td>`}
                    <td style="white-space:nowrap;">${actionCell}</td>
                </tr>
            `;
        }).join('');
    }

    // 입출고 기록 1건의 '경로'를 분류한다.
    //   입고 → 수입검사 / 수동입고,  출고 → 생산 차감 / 수동 차감
    // (source 문자열이 시기별로 제각각이라 한 곳에서만 판별한다)
    function _invRoute(d) {
        const src  = String((d && d.source) || '').trim();
        const oType = String((d && d.outgoingType) || '').trim();

        if (d && _isUnmatchedActionRecord(d)) {
            const reason = String(d.resetReason || d.note || '').trim();
            if (d.unmatchedAction === 'absorb') {
                return {
                    label: '미차감 반영',
                    color: '#b45309',
                    detail: reason || '보유 LOT에서 미차감분 FIFO 차감 · 표시 재고 유지'
                };
            }
            return {
                label: '미차감 리셋',
                color: '#0369a1',
                detail: reason || '미차감만 0 · 표시 재고 유지'
            };
        }
        if (d && d.type === '출고') {
            const paintLine = _resolveOutgoingPaintLine(d, null, _buildPaintLineFromInputMap());
            if (paintLine === '도장-A' || paintLine === '도장-B') {
                return {
                    label: paintLine,
                    color: paintLine === '도장-B' ? '#c2410c' : '#6d28d9',
                    detail: src || oType || '생산출고 → 도장 투입'
                };
            }
            const isProd = src === '도장 작업 출고' || src === '도장 입고' || src === '사출 창고 생산출고' || oType === '생산출고';
            return isProd
                ? { label: '생산 차감', color: '#7c3aed', detail: src || oType || '도장 투입' }
                : { label: '수동 차감', color: '#dc2626', detail: src || oType || '수기 출고' };
        }
        if (d && _isStockErrorResetRecord(d)) {
            return { label: '재고 오류 초기화', color: '#dc2626', detail: _formatResetHistoryDetail(d) };
        }
        // 입고: source 가 비어있어도 검사일(inspDate)이 있으면 수입검사 연동 건이다.
        const fromInsp = /수입검사/.test(src) || !!(d && d.inspDate);
        return fromInsp
            ? { label: '수입검사', color: '#2563eb', detail: src || '검사 합격 입고' }
            : { label: '수동입고', color: '#0891b2', detail: src || '수기 등록' };
    }

    // 경로 배지의 이동 대상 — 수입검사 → 검사 이력, 생산 차감 → 작업 실적, 수동입고 → 입고 이력
    function _routeLinkFor(d, route) {
        if (!d || !route) return null;
        if (route.label === '수입검사') {
            const inspId = _findLinkedInspectionId(d);
            if (!inspId) return null;
            return {
                onclick: `InjectionWarehouseModule.openLinkedInspection('${inspId}')`,
                title: '사출 수입검사 이력 보기'
            };
        }
        if (route.label === '생산 차감') {
            return {
                onclick: `InjectionWarehouseModule.openLinkedPaintWork('${d.id}')`,
                title: '도장 작업 실적으로 이동'
            };
        }
        if (route.label === '수동입고') {
            const em = encodeURIComponent(d.carModel || '');
            const ep = encodeURIComponent(d.partName || '');
            return {
                onclick: `InjectionWarehouseModule.openManualIncomingHistory('${em}','${ep}')`,
                title: '입고 이력에서 이 품목 보기'
            };
        }
        return null;
    }

    function _renderRouteBadge(d, route) {
        const badgeStyle = `font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:4px;
                        border:1px solid ${route.color}44;background:${route.color}12;color:${route.color};`;
        const link = _routeLinkFor(d, route);
        if (!link) {
            return `<span style="${badgeStyle}">${route.label}</span>`;
        }
        return `<a href="javascript:void(0)" title="${link.title}"
                    onclick="event.preventDefault();event.stopPropagation();${link.onclick}"
                    style="${badgeStyle}display:inline-flex;align-items:center;gap:2px;text-decoration:none;cursor:pointer;">
                    ${route.label}
                    <span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span>
                </a>`;
    }

    /** 생산 차감 출고 → 연동된 도장 작업 실적 보기 (계획은 이미 완료된 상태) */
    function openLinkedPaintWork(recordId) {
        const d = Storage.getById(STORE, recordId);
        if (!d) { UIUtils.toast('기록을 찾을 수 없습니다.', 'error'); return; }

        let work = null;
        const refWorkId = String(d.refWorkId || '').trim();
        if (refWorkId) {
            work = Storage.getById(DB.STORES.PAINTING_WORK, refWorkId);
        }
        if (!work) {
            const planId = String(d.planId || '').trim();
            if (planId) {
                work = (Storage.getAll(DB.STORES.PAINTING_WORK) || []).find(function(w) {
                    return String(w.planId || '') === planId;
                }) || null;
            }
        }
        if (!work) {
            const day = String(d.date || '').slice(0, 10);
            const injPart = String(d.partName || '').trim();
            const car = String(d.carModel || '').trim();
            const lotNo = String(d.lotNo || '').trim();
            const candidates = (Storage.getAll(DB.STORES.PAINTING_WORK) || []).filter(function(w) {
                if (day && String(w.date || '').slice(0, 10) !== day) return false;
                if (car && String(w.carModel || '').trim() && String(w.carModel || '').trim() !== car) return false;
                // 출고 LOT이 작업 lots[]에 포함되면 동일 실적으로 본다
                if (lotNo && Array.isArray(w.lots) && w.lots.length) {
                    return w.lots.some(function(l) {
                        return String(l.lotNo || '').trim() === lotNo ||
                            String(l.partName || '').trim() === injPart;
                    });
                }
                return injPart && (
                    String(w.partName || '').trim() === injPart ||
                    (Array.isArray(w.lots) && w.lots.some(function(l) {
                        return String(l.partName || '').trim() === injPart;
                    }))
                );
            });
            if (candidates.length === 1) work = candidates[0];
            else if (candidates.length > 1) {
                candidates.sort(function(a, b) {
                    return String(b.registeredAt || b.date || '').localeCompare(String(a.registeredAt || a.date || ''));
                });
                work = candidates[0];
            }
        }

        if (!work || !work.id) {
            // 창고 직접 생산출고(실적 미연동) → 예약 계획으로 안내
            const detail = (typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule._getInjReserveDetail)
                ? ProductionPlanModule._getInjReserveDetail(d.partName || '', d.carModel || '', d.color || '', { skipWarehouseConsume: true })
                : null;
            const candidates = []
                .concat((detail && detail.pendingPlans) || [])
                .concat((detail && detail.inProgressPlans) || []);
            let planId = String(d.planId || '').trim();
            if (!planId && candidates.length) {
                const day = String(d.date || '').slice(0, 10);
                const sameDay = candidates.find(function(p) { return String(p.date || '').slice(0, 10) === day; });
                planId = String((sameDay || candidates[0]).id || '').trim();
            }
            if (planId && typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.goToWorkFromPlan === 'function') {
                UIUtils.closeModal();
                UIUtils.toast('도장 실적 미연동 출고입니다. 예약 계획 실적입력으로 이동합니다.', 'info');
                PaintingWorkModule.goToWorkFromPlan(planId);
                return;
            }
            UIUtils.toast('연동된 도장 작업 실적을 찾을 수 없습니다. (창고 직접 출고 — 예약 계획에서 실적을 입력하세요)', 'warning');
            return;
        }

        const line = String(work.line || d.paintLine || '');
        const pageId = /도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(line) ? 'painting-work-b' : 'painting-work-a';

        UIUtils.closeModal();
        if (typeof Router !== 'undefined') Router.navigate(pageId);
        setTimeout(function() {
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.openWorkViewPage === 'function') {
                PaintingWorkModule.openWorkViewPage(work.id);
            } else {
                UIUtils.toast('도장 작업 모듈을 불러올 수 없습니다.', 'error');
            }
        }, 300);
    }

    /** 수동입고 → 입고 이력 탭에서 해당 품목으로 필터 (권한 무관 조회) */
    function openManualIncomingHistory(carModelEnc, partNameEnc) {
        UIUtils.closeModal();
        _filterTxHistoryFor('incoming', carModelEnc, partNameEnc);
    }

    function _incomingPathLabel(d) {
        const route = _invRoute(d);
        if (route.label === '수입검사') {
            return { label: '수입검사', color: route.color, detail: route.detail };
        }
        if (route.label === '재고 오류 초기화') {
            return { label: route.label, color: route.color, detail: route.detail };
        }
        return { label: '직접 입고', color: route.color, detail: route.detail };
    }

    function openIncomingTxView(id) {
        const d = Storage.getById(STORE, id);
        if (!d) { UIUtils.toast('기록을 찾을 수 없습니다.', 'error'); return; }

        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const mat = mats.find(m => m.carModel === d.carModel && m.injPartName === d.partName);
        const price = Number(mat ? mat.unitPrice : 0) || 0;
        const value = (Number(d.quantity) || 0) * price;
        const path = _incomingPathLabel(d);

        const inspCtx = _buildInspDateContext();
        const inspDateHtml = _inspDateLinkHtml(d, _formatInspDateCell(d, true, inspCtx.inspDateMap, inspCtx.inboundInspMap));

        const who = d.resetBy || _formatActorLabel(d.receivedBy || d.outgoingBy || '');
        const isReset = _isStockErrorResetRecord(d);
        const row = (label, val) => `
            <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);">
                <span style="min-width:96px;font-size:0.82rem;color:var(--text-muted);flex-shrink:0;">${label}</span>
                <span style="font-size:0.88rem;color:var(--text-primary);word-break:break-word;">${val}</span>
            </div>`;

        const adminDel = _isAdminUser()
            ? `<button class="btn btn-outline" style="color:#dc2626;border-color:#fca5a5;"
                    onclick="UIUtils.closeModal();InjectionWarehouseModule.remove('${id}')">삭제</button>`
            : '';

        const resetRows = isReset ? `
                ${row('초기화 구분', '<span style="font-weight:700;color:#dc2626;">재고 오류 초기화</span>')}
                ${row('초기화 사유', _escapeHtml(d.resetReason || '-'))}
                ${row('초기화 전 재고', d.stockBefore != null ? UIUtils.formatNumber(d.stockBefore) + ' EA' : '-')}
                ${row('초기화 후 목표', d.stockAfterTarget != null ? UIUtils.formatNumber(d.stockAfterTarget) + ' EA' : '0 EA')}
                ${row('보정 입고량', UIUtils.formatNumber(d.quantity || 0) + ' EA')}
                ${row('초기화 일시', _escapeHtml(String(d.resetAt || d.date || '-').slice(0, 19).replace('T', ' ')))}
        ` : '';

        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;color:' + (isReset ? '#dc2626' : 'var(--accent-blue)') + ';">' +
            (isReset ? 'warning' : 'inventory_2') + '</span> ' +
            (isReset ? '재고 오류 초기화 이력' : '입고 이력 상세'),
            `<div style="margin-bottom:12px;">
                <span style="font-size:0.8rem;font-weight:700;padding:3px 10px;border-radius:999px;
                    border:1px solid ${path.color}44;background:${path.color}12;color:${path.color};">${path.label}</span>
                ${path.detail ? `<div style="margin-top:6px;font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${_escapeHtml(path.detail)}</div>` : ''}
            </div>
            <div style="background:var(--bg-secondary);border-radius:10px;padding:12px 14px;">
                ${resetRows}
                ${row('창고 입고일', _escapeHtml((d.date || '-') + (d.time ? ' ' + d.time : '')))}
                ${isReset ? '' : row('수입검사일', inspDateHtml)}
                ${row('차종', _escapeHtml(d.carModel || '-'))}
                ${row('품명', '<strong>' + _escapeHtml(d.partName || '-') + '</strong>')}
                ${row('컬러', _escapeHtml(d.color || '-'))}
                ${row('사출처', _escapeHtml(d.supplier || '-'))}
                ${row('LOT번호', _escapeHtml(d.lotNo || (d.lots ? d.lots.map(l => l.lotNo).join(', ') : '-')))}
                ${isReset ? '' : row('수량', UIUtils.formatNumber(d.quantity || 0) + ' EA')}
                ${isReset ? '' : row('금액', UIUtils.formatNumber(value) + '원')}
                ${row('입고자', _escapeHtml(who || '미등록'))}
                ${row('비고', _escapeHtml(d.note || d.source || '-'))}
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             ${isReset ? '' : `<button class="btn btn-primary" onclick="UIUtils.closeModal();InjectionWarehouseModule.openEditModal('${id}')">수정</button>`}
             ${adminDel}`,
            'min(720px, calc(100vw - 32px))'
        );
    }

    // 창고 LOT 형식 유효성 — RST + 숫자, 또는 유효한 YYMMDD(6자리 날짜)만 정상.
    // 빈 값·'무표기'·자릿수/날짜 오류는 모두 형식 오류(대시보드 "사출 LOT 형식 오류"와 동일 기준).
    function _isValidLotFormat(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s || s === '무표기') return false;
        if (/^RST\d+$/i.test(s)) return true;
        if (!/^\d{6}$/.test(s)) return false;
        const yy = parseInt(s.slice(0, 2), 10);
        const mm = parseInt(s.slice(2, 4), 10);
        const dd = parseInt(s.slice(4, 6), 10);
        const fy = yy >= 50 ? 1900 + yy : 2000 + yy;
        const d = new Date(fy, mm - 1, dd);
        return d.getFullYear() === fy && d.getMonth() === mm - 1 && d.getDate() === dd;
    }

    // 표시용 LOT 키 — 빈 값/공백은 '무표기'로 통일 (currentLots 표시 기준과 동일).
    function _lotKey(v) { return (String(v == null ? '' : v).trim() || '무표기'); }

    // 레코드가 (차종/품명/컬러) 일치하고, 최상위 lotNo 또는 lots[] 안에 targetLot 을 포함하는가.
    // 무표기 LOT은 lots[] 배열 안에만 있고 최상위 lotNo 는 다른 대표 LOT일 수 있어,
    // 최상위만 비교하면 못 찾는다("변경할 재고 없음" 버그). lots[] 까지 훑는다.
    function _recordMatchesLot(d, carModel, partName, color, targetLot) {
        if (d.carModel !== carModel || d.partName !== partName || (d.color || '') !== (color || '')) return false;
        if (Array.isArray(d.lots) && d.lots.length > 0) {
            return d.lots.some(l => _lotKey(l.lotNo) === targetLot);
        }
        return _lotKey(d.lotNo) === targetLot;
    }

    // 레코드의 LOT을 oldLot → newLot 으로 교체한 updates 객체 생성.
    // lots[] 가 있으면 그 안의 해당 항목만 바꾸고, 최상위 lotNo 는 그게 대표였을 때만 교체(다른 대표 LOT 보존).
    function _buildLotRenameUpdates(d, oldLot, newLot) {
        const updates = {};
        if (Array.isArray(d.lots) && d.lots.length > 0) {
            updates.lots = d.lots.map(l => (_lotKey(l.lotNo) === oldLot ? { ...l, lotNo: newLot } : l));
            if (_lotKey(d.lotNo) === oldLot) updates.lotNo = newLot;
        } else {
            updates.lotNo = newLot;
        }
        return updates;
    }

    // 품목 클릭 시 LOT 상세 팝업
    function showPartDetail(carModel, partName, color) {
        const data = Storage.getAll(STORE);
        const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        const items = _filterProductRecords(carModel, partName, color)
            .slice()
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const mat   = mats.find(m => m.carModel === carModel && m.injPartName === partName);
        const price = Number(mat ? mat.unitPrice : 0) || 0;

        const { balance, lots: lotList } = StockDetailUI.lotBalancesFromRecords(items, { positiveOnly: false });
        const stock = balance.total;

        const currentLots = lotList
            .map(l => ({ lot: l.lotNo, qty: l.qty, date: l.date, supplier: l.supplier }))
            .filter(item => item.qty !== 0)
            .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.lot.localeCompare(b.lot));

        const fifoHeadLot = currentLots.find(d => d.qty > 0);

        const unmatchedQty   = balance.unmatched || 0;
        const corruptedCount = balance.corrupted.length;
        const physicalLotSum = currentLots
            .filter(function(l) { return l.lot !== InvCalc.UNMATCHED && (Number(l.qty) || 0) > 0; })
            .reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        const historySteps = InvCalc.replaySteps(items).slice().reverse();
        const historyRows = historySteps.map(function(step, idx) {
            return _renderInvHistoryRow(step, idx === 0);
        }).join('');
        const _cmJs = carModel.replace(/'/g, "\\'");
        const _pnJs = partName.replace(/'/g, "\\'");
        const _clJs = (color || '').replace(/'/g, "\\'");
        const _emJs = encodeURIComponent(carModel);
        const _epJs = encodeURIComponent(partName);
        const _ecJs = encodeURIComponent(color || '');
        const _resolvedDetailColor = _resolveMasterColor(carModel, partName, color, mats);
        const _isAliasDetail = color && _resolvedDetailColor &&
            _normKeyStr(color) !== _normKeyStr(_resolvedDetailColor) &&
            _colorsMatch(color, _resolvedDetailColor);
        const canEditLot = _canEditWarehouseLot();

        const rows = currentLots.map(d => {
            const _lotJs = d.lot.replace(/'/g, "\\'");
            const isNeg = d.qty < 0;
            // 형식 오류 LOT(빈 값·무표기·잘못된 날짜) → 빨간 강조 + 배지로 어느 행이 문제인지 즉시 보이게 한다.
            const isBadLot = !isNeg && !_isValidLotFormat(d.lot);
            const isFifoHead = fifoHeadLot && d.lot === fifoHeadLot.lot && d.qty > 0;
            const fifoBadge = isFifoHead
                ? ' <span style="font-size:0.65rem;background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 5px;font-weight:700;">FIFO</span>'
                : '';
            const badLotBadge = isBadLot
                ? ' <span title="LOT 번호 형식 오류 — 수량 보정으로 올바른 LOT을 입력하세요" style="font-size:0.65rem;background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 5px;font-weight:700;">⚠ LOT 오류</span>'
                : '';
            const rowStyle = isNeg ? ' style="background:rgba(239,68,68,.06);"'
                : (isBadLot ? ' style="background:rgba(239,68,68,.1);"' : '');
            return `
                <tr${rowStyle}>
                    <td style="white-space:nowrap;">${d.date || '-'}</td>
                    <td>${d.lot || '-'}${fifoBadge}${badLotBadge}${isNeg ? ' <span title="입고보다 출고가 많아 어느 LOT에서도 차감하지 못한 수량" style="font-size:0.7rem;color:var(--accent-red);font-weight:700;">⚠ 과다출고</span>' : ''}</td>
                    <td>${d.supplier || '-'}</td>
                    <td style="text-align:right; color:${isNeg ? 'var(--accent-red)' : 'var(--accent-green)'}; font-weight:600;">
                        ${UIUtils.formatNumber(d.qty)}
                    </td>
                    ${canEditLot ? `<td style="text-align:center;">
                        ${isNeg ? '' : `<button class="btn btn-sm ${isBadLot ? 'btn-primary' : 'btn-outline'}" style="font-size:0.72rem;padding:2px 8px;${isBadLot ? 'background:#7c3aed;border-color:#7c3aed;' : 'color:#7c3aed;border-color:#7c3aed;'}"
                            onclick="InjectionWarehouseModule.openLotEditModal('${_cmJs}','${_pnJs}','${_clJs}','${_lotJs}',${Number(d.qty) || 0})">
                            ${isBadLot ? 'LOT 입력' : '수량 보정'}
                        </button>`}
                    </td>` : ''}
                    <td style="text-align:center;">
                        ${isNeg ? '' : `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;color:#dc2626;border-color:#dc2626;"
                            title="이 LOT을 출고 목록에 추가"
                            onclick="InjectionWarehouseModule.openOutgoingListupItemModal('${_cmJs}','${_pnJs}','${_clJs}','${_lotJs}',${Number(d.qty) || 0})">
                            출고
                        </button>`}
                    </td>
                </tr>
            `;
        }).join('');

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color ? ' · ' + color : ''}`,
            `
            <!-- 기본 정보 + 입고/출고 버튼 -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${carModel}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${partName}</strong></span>
                ${color ? `<span style="color:var(--text-muted);">·</span><span>${color}</span>` : ''}
                ${_isAliasDetail ? `<span style="margin-left:6px;font-size:0.72rem;color:#b45309;font-weight:700;">⚠ 마스터 컬러: ${_resolvedDetailColor}</span>` : ''}
                <div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                    ${_isAliasDetail && _isAdminUser() ? `
                    <button class="btn btn-sm" style="font-size:0.78rem;background:#7c2d12;color:#fff;border-color:#7c2d12;"
                        onclick="InjectionWarehouseModule.deleteProductColorRecords('${_emJs}','${_epJs}','${_ecJs}')">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">delete_sweep</span>
                        ${color} 별칭 이력 삭제
                    </button>` : ''}
                    <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                        onclick="UIUtils.closeModal();setTimeout(()=>InjectionWarehouseModule._openAddModalForPart('입고','${_cmJs}','${_pnJs}','${_clJs}'),80);">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 입고
                    </button>
                </div>
            </div>
            <div style="margin-bottom:14px;padding:8px 12px;background:rgba(220,38,38,0.05);border-left:3px solid var(--accent-red);border-radius:0 6px 6px 0;font-size:0.8rem;color:var(--text-secondary);">
                출고할 LOT 옆의 <strong style="color:#dc2626;">출고</strong> 버튼을 누르면 출고 목록에 담기고, 재고 현황 화면의 '출고 리스트업'에서 <strong>출고 완료</strong>를 눌러야 재고에서 차감됩니다.
                <strong>생산출고</strong>는 도착 라인(도장-A/B)을 선택하면 해당 라인 작업현황의 <strong>입고 처리</strong> 대상이 됩니다.
            </div>
            <div style="margin-bottom:16px; display:flex; gap:16px; flex-wrap:wrap;">
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700; color:var(--accent-blue);">${_fmtStockQty(stock)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">현재 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700; color:var(--accent-green);">${_fmtStockQty(stock * price)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">재고 금액 (₩)</div>
                </div>
                <div style="background:var(--bg-secondary); padding:12px 20px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.4rem; font-weight:700;">${currentLots.filter(l => l.qty > 0).length}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">보유 LOT 수</div>
                </div>
            </div>
            ${unmatchedQty ? `
            <div style="margin-bottom:14px;padding:12px 14px;border-radius:8px;
                        border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.07);
                        font-size:0.82rem;line-height:1.55;">
                <div style="display:flex;align-items:flex-start;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-red);flex-shrink:0;">error</span>
                    <div style="flex:1;">
                        <strong style="color:var(--accent-red);">미차감(과다출고)이 남아 있습니다.</strong>
                        <div style="margin-top:8px;padding:10px 12px;border-radius:6px;background:var(--bg-primary);border:1px solid var(--border-color);">
                            <div style="display:flex;flex-wrap:wrap;gap:12px 18px;font-size:0.8rem;">
                                <span>LOT 잔량 합계 <strong>${_fmtStockQty(physicalLotSum)}</strong></span>
                                <span>미차감(과다출고) <strong style="color:var(--accent-red);">−${_fmtStockQty(unmatchedQty)}</strong></span>
                                <span>표시 재고 <strong style="color:var(--accent-blue);">${_fmtStockQty(stock)}</strong></span>
                            </div>
                            <div style="margin-top:8px;color:var(--text-secondary);">
                                과거 출고가 입고보다 많아 생긴 미차감입니다. 이후 입고로 자동 상쇄되지 않으니,
                                <strong>이력을 확인</strong>한 뒤 <strong>반영</strong>할지 <strong>리셋</strong>할지 선택하세요.
                            </div>
                            <ul style="margin:8px 0 0;padding-left:18px;color:var(--text-secondary);">
                                <li><strong>반영</strong> — LOT에서 미차감분(${_fmtStockQty(unmatchedQty)} EA)을 FIFO 차감 → 표시 재고 <strong>${_fmtStockQty(stock)}</strong> 유지, LOT 합계도 맞춤</li>
                                <li><strong>리셋</strong> — 미차감만 0 · 표시 재고 <strong>${_fmtStockQty(stock)}</strong> 유지 (현재 재고를 맞춘 뒤)</li>
                                <li><strong>이력 확인</strong> — 처리하지 않고 입출고 이력에서 원인 출고를 먼저 확인</li>
                            </ul>
                            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
                                <button type="button" class="btn btn-sm btn-outline"
                                    onclick="document.getElementById('injInvHistorySection')&&document.getElementById('injInvHistorySection').scrollIntoView({behavior:'smooth',block:'start'})">
                                    <span class="material-symbols-outlined" style="font-size:0.9rem;">history</span> 이력 확인
                                </button>
                                ${_isAdminUser() ? `
                                <button type="button" class="btn btn-sm" style="background:#b45309;color:#fff;border-color:#b45309;"
                                    onclick="InjectionWarehouseModule.openUnmatchedActionModal('${_emJs}','${_epJs}','${_ecJs}','absorb',${unmatchedQty},${stock},${physicalLotSum})">
                                    <span class="material-symbols-outlined" style="font-size:0.9rem;">playlist_add_check</span> 반영 (${_fmtStockQty(unmatchedQty)} EA)
                                </button>
                                <button type="button" class="btn btn-sm" style="background:#0369a1;color:#fff;border-color:#0369a1;"
                                    onclick="InjectionWarehouseModule.openUnmatchedActionModal('${_emJs}','${_epJs}','${_ecJs}','clear',${unmatchedQty},${stock},${physicalLotSum})">
                                    <span class="material-symbols-outlined" style="font-size:0.9rem;">restart_alt</span> 리셋 (미차감 0)
                                </button>` : `
                                <span style="font-size:0.75rem;color:var(--text-muted);align-self:center;">반영·리셋은 관리자만 실행할 수 있습니다.</span>`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>` : ''}
            ${corruptedCount ? `
            <div style="margin-bottom:14px;padding:12px 14px;border-radius:8px;
                        border:1px solid rgba(180,83,9,.35);background:rgba(180,83,9,.07);
                        font-size:0.82rem;line-height:1.55;">
                <div style="display:flex;align-items:flex-start;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:#b45309;flex-shrink:0;">warning</span>
                    <div style="flex:1;">
                        <strong style="color:#b45309;">수량 필드 불일치 ${corruptedCount}건</strong>
                        <div style="margin-top:6px;color:var(--text-secondary);">
                            일부 입출고 기록의 <code>quantity</code> 값이 LOT별 수량 합계와 다릅니다.
                            재고·LOT 계산은 이미 <strong>LOT 합계 기준</strong>이라 표시 숫자는 맞습니다.
                            경고만 없애려면 아래 버튼으로 quantity 필드를 LOT 합계에 맞추면 됩니다.
                            ${unmatchedQty ? '' : '<br><span style="color:var(--text-muted);">※ 미차감 반영/리셋과는 별개 이슈입니다.</span>'}
                        </div>
                        ${_isAdminUser() ? `
                        <div style="margin-top:10px;">
                            <button type="button" class="btn btn-sm" style="background:#b45309;color:#fff;border-color:#b45309;"
                                onclick="InjectionWarehouseModule.fixCorruptedQtyFields('${_emJs}','${_epJs}','${_ecJs}')">
                                <span class="material-symbols-outlined" style="font-size:0.9rem;">build</span>
                                수량 필드 맞추기 (${corruptedCount}건)
                            </button>
                        </div>` : `
                        <div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);">수량 필드 보정은 관리자만 실행할 수 있습니다.</div>`}
                    </div>
                </div>
            </div>` : ''}
            ${StockDetailUI.buildLotTableSection({
                headers: canEditLot ? ['입고일', 'LOT번호', '생산처', '현재 수량', '', '출고'] : ['입고일', 'LOT번호', '생산처', '현재 수량', '출고'],
                colSpan: canEditLot ? 6 : 5,
                rowsHtml: rows
            })}


            <!-- 입출고 이력 -->
            <div id="injInvHistorySection" style="margin-top:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--text-muted);">history</span>
                <strong style="font-size:0.86rem;">입출고 이력</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">전체 ${items.length}건 · 최신순 (위가 최근)</span>
                <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">아래에서 위로 읽으면 재고 변화 흐름</span>
            </div>
            <div style="overflow:auto;margin-top:6px;max-height:380px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>일시</th>
                            <th>구분</th>
                            <th>경로</th>
                            <th>LOT번호</th>
                            <th style="text-align:right;">입출고 수량</th>
                            <th style="text-align:right;">기존 수량</th>
                            <th style="text-align:right;">현재 수량</th>
                            <th>담당</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyRows || `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">입출고 이력이 없습니다.</td></tr>`}
                    </tbody>
                </table>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'lg'
        );
    }

    // LOT번호 수정 모달 — 동일 (차종/품명/컬러) 내 특정 LOT의 번호를 일괄 변경한다.
    function openLotRenameModal(carModel, partName, color, oldLot) {
        const _cmJs = carModel.replace(/'/g, "\\'");
        const _pnJs = partName.replace(/'/g, "\\'");
        const _clJs = (color || '').replace(/'/g, "\\'");
        const _olJs = oldLot.replace(/'/g, "\\'");
        const displayLot = oldLot === '무표기' ? '' : oldLot;

        UIUtils.showModal(
            'LOT번호 수정',
            `
            <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:14px;font-size:0.85rem;">
                <div><strong>${carModel}</strong> · ${partName}${color ? ' · ' + color : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);">기존 LOT번호: <strong>${oldLot === '무표기' ? '(미표기)' : oldLot}</strong></div>
            </div>
            <div class="form-group">
                <label class="form-label">새 LOT번호 (YYMMDD) <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="lotRenameInput" value="${displayLot}" maxlength="6"
                    placeholder="예: 250625" style="font-family:monospace; letter-spacing:1px;"
                    oninput="InjectionWarehouseModule.onLotInput(this, 'lotRenameMsg')">
                <div id="lotRenameMsg" style="margin-top:6px;font-size:0.8rem;"></div>
            </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="InjectionWarehouseModule.saveLotRename('${_cmJs}','${_pnJs}','${_clJs}','${_olJs}')">저장</button>`,
            'sm'
        );
    }

    async function saveLotRename(carModel, partName, color, oldLot) {
        const input = document.getElementById('lotRenameInput');
        const newLot = ((input || {}).value || '').trim();

        if (!/^\d{6}$/.test(newLot)) {
            UIUtils.toast('LOT번호는 YYMMDD 형식으로 6자리 숫자를 입력하세요.', 'warning');
            if (input) input.focus();
            return;
        }

        if (newLot === oldLot) {
            UIUtils.closeModal();
            return;
        }

        const data = Storage.getAll(STORE);
        const targets = data.filter(d => _recordMatchesLot(d, carModel, partName, color, oldLot));

        if (targets.length === 0) {
            UIUtils.toast('변경할 재고 기록을 찾을 수 없습니다.', 'error');
            return;
        }

        try {
            for (const d of targets) {
                await Storage.update(STORE, d.id, _buildLotRenameUpdates(d, oldLot, newLot));
            }
            UIUtils.closeModal();
            UIUtils.toast(`LOT번호가 ${newLot}(으)로 변경되었습니다.`, 'success');
            loadData();
            showPartDetail(carModel, partName, color);
        } catch (e) {
            console.error('LOT번호 수정 실패:', e);
            UIUtils.toast('LOT번호 수정 실패: ' + e.message, 'error');
        }
    }

    // LOT 정보 전체 수정 모달 — 입고일·생산처·LOT번호·현재 수량을 함께 편집한다.
    function openLotEditModal(carModel, partName, color, oldLot, currentQty) {
        if (!_canEditWarehouseLot()) {
            UIUtils.toast('수량 보정 권한이 있는 사용자만 LOT 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        const _cmJs = carModel.replace(/'/g, "\\'");
        const _pnJs = partName.replace(/'/g, "\\'");
        const _clJs = (color || '').replace(/'/g, "\\'");
        const _olJs = oldLot.replace(/'/g, "\\'");
        const displayLot = oldLot === '무표기' ? '' : oldLot;

        // 이 LOT의 대표 입고 기록에서 입고일·생산처 기본값 조회 (lots[] 안의 무표기도 매칭)
        const recs = (Storage.getAll(STORE) || []).filter(d =>
            d.type !== '출고' && _recordMatchesLot(d, carModel, partName, color, oldLot));
        recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const primary = recs[0] || {};
        const dateOnly = String(primary.date || '').slice(0, 10);
        const supplier = String(primary.supplier || '').replace(/"/g, '&quot;');

        UIUtils.showModal(
            '수량 보정',
            `
            <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:14px;font-size:0.85rem;">
                <div><strong>${carModel}</strong> · ${partName}${color ? ' · ' + color : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);">기존 LOT번호: <strong>${oldLot === '무표기' ? '(미표기)' : oldLot}</strong></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">입고일</label>
                    <input type="date" class="form-input" id="lotEditDate" value="${dateOnly}">
                </div>
                <div class="form-group">
                    <label class="form-label">생산처</label>
                    <input type="text" class="form-input" id="lotEditSupplier" value="${supplier}" placeholder="예: 알리">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">LOT번호 (YYMMDD) <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="lotEditLot" value="${displayLot}" maxlength="6"
                        placeholder="예: 250625" style="font-family:monospace;letter-spacing:1px;"
                        oninput="InjectionWarehouseModule.onLotInput(this, 'lotEditMsg')">
                    <div id="lotEditMsg" style="margin-top:6px;font-size:0.8rem;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">현재 수량 (EA) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="lotEditQty" value="${Number(currentQty) || 0}" min="0"
                        inputmode="numeric" enterkeyhint="done" style="text-align:right;">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">처리 사유 <span style="color:var(--accent-red)">*</span></label>
                <textarea id="lotEditReason" class="form-textarea" rows="2"
                    placeholder="예: 실사 재고와 차이 확인 — 250 EA 부족분 반영"></textarea>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">※ 수량을 변경하면 차이만큼 재고 보정 입·출고가 자동으로 기록됩니다.</div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" style="background:#7c3aed;border-color:#7c3aed;" onclick="InjectionWarehouseModule.saveLotEdit('${_cmJs}','${_pnJs}','${_clJs}','${_olJs}',${Number(currentQty) || 0})">수량 보정 저장</button>`,
            'md'
        );
    }

    // 같은 LOT을 아주 짧은 시간 안에 반복 보정하는 것을 감지 — 저장할 때마다 차이만큼 레코드가
    // '추가'되는 방식이라(값을 덮어쓰는 게 아님), 재시도를 반복하면 매번 누적돼 실제 의도보다
    // 훨씬 큰 보정이 쌓이는 사고가 실제로 있었다(예: 47분 사이 5회 저장, 합계 13,338 EA).
    function _recentLotEditWarning(carModel, partName, color, lotNo) {
        const WINDOW_MIN = 30;
        const now = Date.now();
        const all = Storage.getAll(STORE) || [];
        const recent = all.filter(d => {
            if (d.source !== '재고 수정 보정') return false;
            if (!_recordMatchesLot(d, carModel, partName, color, lotNo)) return false;
            const t = new Date(d.createdAt || d.date).getTime();
            return !isNaN(t) && (now - t) >= 0 && (now - t) <= WINDOW_MIN * 60000;
        });
        if (recent.length === 0) return '';
        const sum = recent.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
        return `⚠ 최근 ${WINDOW_MIN}분 안에 같은 LOT을 이미 ${recent.length}번 보정했습니다(합계 ${UIUtils.formatNumber(sum)} EA).\n` +
               `저장할 때마다 차이만큼 새로 누적되니, 중복 저장이 아닌지 다시 확인해 주세요.\n\n그래도 계속하시겠습니까?`;
    }

    async function saveLotEdit(carModel, partName, color, oldLot, oldQty) {
        if (!_canEditWarehouseLot()) {
            UIUtils.toast('수량 보정 권한이 있는 사용자만 LOT 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        const newLot      = ((document.getElementById('lotEditLot')      || {}).value || '').trim();
        const newDate     = ((document.getElementById('lotEditDate')     || {}).value || '').trim();
        const newSupplier = ((document.getElementById('lotEditSupplier') || {}).value || '').trim();
        const newQty      = Number((document.getElementById('lotEditQty') || {}).value);
        const reasonEl     = document.getElementById('lotEditReason');
        const reason       = reasonEl ? reasonEl.value.trim() : '';

        if (!/^\d{6}$/.test(newLot)) {
            UIUtils.toast('LOT번호는 YYMMDD 형식 6자리 숫자로 입력하세요.', 'warning');
            return;
        }
        if (isNaN(newQty) || newQty < 0) {
            UIUtils.toast('현재 수량을 0 이상으로 입력하세요.', 'warning');
            return;
        }
        if (!reason) {
            UIUtils.toast('처리 사유를 입력해주세요.', 'warning');
            if (reasonEl) reasonEl.focus();
            return;
        }

        const all = Storage.getAll(STORE) || [];
        const targets = all.filter(d => _recordMatchesLot(d, carModel, partName, color, oldLot));

        if (targets.length === 0) {
            UIUtils.toast('변경할 재고 기록을 찾을 수 없습니다.', 'error');
            return;
        }

        const delta = newQty - (Number(oldQty) || 0);

        const proceed = () => {
            // ★ 이 보정을 적용했을 때 해당 품목의 전체 재고(모든 LOT 합산)가
            //   마이너스가 되면 그대로 진행하지 않고 먼저 확인을 받는다.
            //   (LOT 하나만 보고 수정하면 다른 LOT과 합산한 실제 재고가 이미
            //    부족한 상태를 놓쳐 마이너스 재고 오류로 이어질 수 있음)
            if (delta !== 0) {
                const productItems = (all || []).filter(function(d) {
                    return d.carModel === carModel && d.partName === partName && (d.color || '') === (color || '');
                });
                const currentTotal = InvCalc.lotBalances(productItems).total;
                const projected = currentTotal + delta;
                if (projected < 0) {
                    UIUtils.confirm(
                        `이 수정을 적용하면 "${partName}"의 전체 재고가 ${UIUtils.formatNumber(projected)} EA(마이너스)가 됩니다.\n` +
                        `다른 LOT의 실제 재고나 이전 입출고 기록을 다시 확인해 주세요.\n\n그래도 계속하시겠습니까?`,
                        () => _commitLotEdit(carModel, partName, color, oldLot, newLot, newDate, newSupplier, targets, delta, reason)
                    );
                    return;
                }
            }
            _commitLotEdit(carModel, partName, color, oldLot, newLot, newDate, newSupplier, targets, delta, reason);
        };

        const dupWarning = delta !== 0 ? _recentLotEditWarning(carModel, partName, color, oldLot) : '';
        if (dupWarning) {
            UIUtils.confirm(dupWarning, proceed);
            return;
        }
        proceed();
    }

    async function _commitLotEdit(carModel, partName, color, oldLot, newLot, newDate, newSupplier, targets, delta, reason) {
        try {
            for (const d of targets) {
                let updates = {};
                // LOT번호 변경 — lots[] 안의 해당 항목만 교체(다른 대표 LOT 보존)
                if (newLot !== oldLot) {
                    updates = _buildLotRenameUpdates(d, oldLot, newLot);
                }
                // 입고일·생산처는 입고 기록에만 반영
                if (d.type !== '출고') {
                    if (newDate) {
                        const timePart = String(d.date || '').slice(10); // " HH:MM" 시간부 보존
                        updates.date = (newDate + timePart).trim();
                    }
                    updates.supplier = newSupplier;
                }
                if (Object.keys(updates).length > 0) await Storage.update(STORE, d.id, updates);
            }

            // 수량 보정 — 차이만큼 입/출고 기록을 추가해 재고에 반영 (기존 기록 무손상)
            if (delta !== 0) {
                const adjQty = Math.abs(delta);
                const nowStr = (UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '));
                await _addInventoryRecord({
                    date: nowStr,
                    type: delta > 0 ? '입고' : '출고',
                    carModel: carModel,
                    partName: partName,
                    color: color || '',
                    supplier: newSupplier,
                    lotNo: newLot,
                    lots: [{ lotNo: newLot, qty: adjQty }],
                    quantity: adjQty,
                    unit: 'EA',
                    source: '재고 수정 보정',
                    resetReason: reason,
                    note: reason,
                    ..._actorFieldsForRecord(delta > 0 ? '입고' : '출고')
                });
            }

            UIUtils.closeModal();
            UIUtils.toast('LOT 정보가 수정되었습니다.', 'success');
            loadData();
            showPartDetail(carModel, partName, color);
        } catch (e) {
            console.error('LOT 정보 수정 실패:', e);
            UIUtils.toast('LOT 정보 수정 실패: ' + e.message, 'error');
        }
    }

    function _openAddModalForPart(type, carModel, partName, color) {
        openAddModal(type);
        setTimeout(() => {
            const carSel = document.getElementById('addInvCarModel');
            if (carSel) {
                carSel.value = carModel;
                InjectionWarehouseModule.onModalCarModelChange();
            }
            setTimeout(() => {
                const partSel = document.getElementById('addInvPart');
                if (partSel) {
                    partSel.value = partName;
                    InjectionWarehouseModule.onModalPartChange();
                }
                setTimeout(() => {
                    if (color) {
                        const colorSel = document.getElementById('addInvColor');
                        if (colorSel) colorSel.value = color;
                    }
                    InjectionWarehouseModule.onModalColorChange();
                }, 80);
            }, 80);
        }, 80);
    }

    // ── 사출 창고 출고 리스트업 (도료 출고 리스트업과 동일한 방식) ──────────
    // 재고 상세에서 LOT의 "출고"를 누르면 바로 창고에서 빠지는 게 아니라
    // 이 리스트업에 쌓이고, "출고 완료"를 눌러야 한 번에 반영된다.
    function _scrollToOutgoingListup() {
        if (_activeTab !== 'stock') _switchTab('stock');
        setTimeout(function() {
            const body = document.getElementById('injOutListupBody');
            const card = body && body.closest('.card');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    }

    function openOutgoingListupItemModal(carModel, partName, color, lotNo, maxQty) {
        const qtyMax = Number(maxQty) || 0;
        const todayStr = UIUtils.today();
        const _cmJs = carModel.replace(/'/g, "\\'");
        const _pnJs = partName.replace(/'/g, "\\'");
        const _clJs = (color || '').replace(/'/g, "\\'");
        const _lnJs = lotNo.replace(/'/g, "\\'");
        const fifoHead = _getNextFifoLot(carModel, partName, color, null);
        const fifoViolated = fifoHead && _normInvLotNo(lotNo) !== fifoHead.lotNo;

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-red);">output</span> 사출 출고 등록`,
            `
            <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span style="font-weight:700;">${carModel} · ${partName}${color ? ' · ' + color : ''}</span><br>
                <span>LOT: <strong style="font-family:monospace;">${lotNo}</strong>
                <span style="color:var(--text-muted);margin:0 8px;">|</span>
                현재 재고: <strong style="color:var(--accent-blue);">${UIUtils.formatNumber(qtyMax)} EA</strong></span>
                ${fifoHead ? `<br><span style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;display:inline-block;">선입선출 우선 LOT: <strong style="font-family:monospace;color:#16a34a;">${fifoHead.lotNo}</strong>${fifoHead.date ? ' (' + fifoHead.date + ')' : ''}</span>` : ''}
            </div>
            ${fifoViolated ? `
            <div id="injOutItemFifoWarn" style="margin-bottom:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(245,158,11,0.55);background:#fffbeb;font-size:0.82rem;color:#b45309;line-height:1.5;">
                <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                    <span><strong>선입선출 위반</strong> — LOT <strong style="font-family:monospace;">${fifoHead.lotNo}</strong> 재고를 먼저 출고해야 합니다.</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <label style="font-size:0.76rem;white-space:nowrap;font-weight:700;">미준수 사유 <span style="color:var(--accent-red);">*</span></label>
                    ${_invFifoReasonSelectHtml().replace('inv-fifo-reason', 'inv-out-fifo-reason')}
                </div>
            </div>` : ''}
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="injOutItemDate" value="${todayStr}">
                </div>
                <div class="form-group">
                    <label class="form-label">출고 수량 <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="injOutItemQty" min="1" max="${qtyMax}"
                        placeholder="최대 ${UIUtils.formatNumber(qtyMax)}"
                        oninput="this.value=Math.min(Math.max(this.value,1),${qtyMax})">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">출고 구분 <span style="color:var(--accent-red)">*</span></label>
                <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                        <input type="radio" name="injOutItemType" id="injOutItemTypeProd" value="생산출고" checked
                            onchange="InjectionWarehouseModule._onOutItemTypeChange()">
                        <span style="font-weight:600;color:var(--accent-blue);">생산 출고</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                        <input type="radio" name="injOutItemType" id="injOutItemTypeReturn" value="반출"
                            onchange="InjectionWarehouseModule._onOutItemTypeChange()">
                        <span style="font-weight:600;color:var(--accent-orange,#f59e0b);">반출</span>
                    </label>
                </div>
            </div>
            <div id="injOutItemPaintLineGroup" class="form-group">
                <label class="form-label">도착 라인 (도장 투입 자재) <span style="color:var(--accent-red)">*</span></label>
                <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                        <input type="radio" name="injOutItemPaintLine" id="injOutItemLineA" value="도장-A">
                        <span style="font-weight:700;color:#2563eb;">도장-A 자재</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                        <input type="radio" name="injOutItemPaintLine" id="injOutItemLineB" value="도장-B">
                        <span style="font-weight:700;color:#ea580c;">도장-B 자재</span>
                    </label>
                </div>
                <div id="injOutItemPaintLineHint" style="font-size:0.75rem;color:var(--text-muted);">기초정보(제품 마스터) 기준으로 자동 선택됩니다.</div>
            </div>
            <div id="injOutItemReturnReasonGroup" style="display:none;margin-bottom:12px;">
                <label class="form-label">반출 사유 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="injOutItemReturnReason" placeholder="반출 사유를 입력하세요">
            </div>
            <div class="form-group">
                <label class="form-label">비고 (선택)</label>
                <input type="text" class="form-input" id="injOutItemMemo" placeholder="출고 용도 또는 메모">
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary"
                onclick="InjectionWarehouseModule.saveOutgoingListupItem('${_cmJs}','${_pnJs}','${_clJs}','${_lnJs}',${qtyMax})">
                출고 목록에 추가
             </button>`
        );

        setTimeout(() => {
            const inferred = _inferPaintLineFromMaster(carModel, partName, color);
            _applyPaintLineRadio('injOutItemPaintLine', inferred.line, 'injOutItemPaintLineHint');
            const qtyInput = document.getElementById('injOutItemQty');
            if (qtyInput) qtyInput.focus();
        }, 100);
    }

    function _onOutItemTypeChange() {
        const isReturn = !!(document.getElementById('injOutItemTypeReturn') || {}).checked;
        const grp = document.getElementById('injOutItemReturnReasonGroup');
        if (grp) grp.style.display = isReturn ? '' : 'none';
        const lineGrp = document.getElementById('injOutItemPaintLineGroup');
        if (lineGrp) lineGrp.style.display = isReturn ? 'none' : '';
    }

    function saveOutgoingListupItem(carModel, partName, color, lotNo, maxQty) {
        const date = (document.getElementById('injOutItemDate') || {}).value || '';
        const qty = Number((document.getElementById('injOutItemQty') || {}).value) || 0;
        const isReturn = !!(document.getElementById('injOutItemTypeReturn') || {}).checked;
        const outgoingType = isReturn ? '반출' : '생산출고';
        const returnReason = isReturn ? ((document.getElementById('injOutItemReturnReason') || {}).value || '').trim() : '';
        const memo = ((document.getElementById('injOutItemMemo') || {}).value || '').trim();
        let paintLine = '';
        if (!isReturn) {
            const lineEl = document.querySelector('input[name="injOutItemPaintLine"]:checked');
            paintLine = lineEl ? String(lineEl.value || '').trim() : '';
            if (paintLine !== '도장-A' && paintLine !== '도장-B') {
                paintLine = _inferPaintLineFromMaster(carModel, partName, color).line;
            }
        }

        if (!date) { UIUtils.toast('출고 일자를 선택하세요.', 'warning'); return; }
        if (qty <= 0) { UIUtils.toast('출고 수량을 입력하세요.', 'warning'); return; }
        if (qty > Number(maxQty)) { UIUtils.toast('현재 재고를 초과할 수 없습니다.', 'warning'); return; }
        if (isReturn && !returnReason) {
            UIUtils.toast('반출 사유를 입력하세요.', 'warning');
            document.getElementById('injOutItemReturnReason')?.focus();
            return;
        }
        if (!isReturn && !paintLine) {
            UIUtils.toast('도착 라인(도장-A/B)을 선택하세요.', 'warning');
            return;
        }

        // 이미 목록에 대기 중인 같은 LOT 수량까지 감안해 잔량 초과를 막는다.
        const pending = (_injOutListupRows || [])
            .filter(r => r.carModel === carModel && r.partName === partName && (r.color || '') === (color || '') && r.lotNo === lotNo)
            .reduce((s, r) => s + (Number(r.qty) || 0), 0);
        if (pending + qty > Number(maxQty)) {
            UIUtils.toast(
                `재고 부족 — 현재 재고 ${UIUtils.formatNumber(maxQty)} EA, 대기 중 ${UIUtils.formatNumber(pending)} EA, 요청 ${UIUtils.formatNumber(qty)} EA`,
                'error'
            );
            return;
        }

        const fifoHead = _getNextFifoLot(carModel, partName, color, null);
        const fifoViolated = fifoHead && _normInvLotNo(lotNo) !== fifoHead.lotNo;
        let fifoReason = '';
        if (fifoViolated) {
            fifoReason = ((document.querySelector('.inv-out-fifo-reason') || {}).value || '').trim();
            if (!fifoReason) {
                UIUtils.toast('선입선출 미준수 사유를 선택해 주세요.', 'warning');
                document.querySelector('.inv-out-fifo-reason')?.focus();
                return;
            }
        }
        const fifoCheck = _analyzeFifoViolations(carModel, partName, color, [{ lotNo: lotNo, qty: qty }], null);
        if (fifoCheck.violated && !fifoReason) {
            UIUtils.toast(fifoCheck.message || '선입선출 규칙을 확인해 주세요.', 'warning');
            return;
        }

        _injOutListupRows.push({
            key: 'inj__' + Storage.generateId(),
            carModel, partName, color: color || '', lotNo,
            qty, maxQty: Number(maxQty) || qty,
            outgoingType, returnReason, memo,
            paintLine: paintLine || undefined,
            fifoReason: fifoReason || undefined,
            date
        });

        UIUtils.toast('출고 목록에 추가되었습니다. 출고자 선택 후 출고 완료를 누르세요.', 'success');
        UIUtils.closeModal();
        renderOutgoingListup();
        _scrollToOutgoingListup();
    }

    function removeOutgoingListupRow(key) {
        _injOutListupRows = (_injOutListupRows || []).filter(r => r.key !== key);
        renderOutgoingListup();
    }

    function toggleOutgoingListupAll(checked) {
        document.querySelectorAll('.inj-out-listup-chk').forEach(el => { el.checked = checked; });
    }

    function renderOutgoingListup() {
        const body = document.getElementById('injOutListupBody');
        const badge = document.getElementById('injOutListupBadge');
        if (!body) return;

        const rows = _injOutListupRows || [];
        if (badge) {
            if (rows.length) { badge.textContent = `${rows.length}건`; badge.style.display = ''; }
            else badge.style.display = 'none';
        }

        if (!rows.length) {
            body.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:18px;color:var(--text-muted);font-size:0.9rem;">
                    <span class="material-symbols-outlined">inventory_2</span>
                    <span>출고 대기 중인 항목이 없습니다. 아래 재고 목록에서 품목을 클릭한 뒤 LOT의 '출고' 버튼을 눌러 추가하세요.</span>
                </div>`;
            return;
        }

        const defaultActorId = _getCurrentActorId();
        const issuerOpts = '<option value="">-- 출고자 선택 --</option>' +
            _getLogisticsWorkerUsers().map(function(u) {
                const sel = u.id === defaultActorId && _isValidOutgoingActor(defaultActorId) ? ' selected' : '';
                return `<option value="${_escapeHtml(u.id)}"${sel}>${_escapeHtml(u.name)}</option>`;
            }).join('');

        const rowsHtml = rows.map(function(r) {
            const typeBadge = r.outgoingType === '반출'
                ? '<span style="font-size:0.68rem;background:#fef3c7;color:#b45309;border-radius:4px;padding:1px 6px;white-space:nowrap;">반출</span>'
                : (r.paintLine === '도장-B'
                    ? '<span style="font-size:0.68rem;background:#ffedd5;color:#c2410c;border-radius:4px;padding:1px 6px;white-space:nowrap;font-weight:700;">도장-B</span>'
                    : '<span style="font-size:0.68rem;background:#ede9fe;color:#6d28d9;border-radius:4px;padding:1px 6px;white-space:nowrap;font-weight:700;">도장-A</span>');
            const fifoBadge = r.fifoReason
                ? '<span style="font-size:0.65rem;background:#fffbeb;color:#b45309;border:1px solid #fcd34d;border-radius:4px;padding:1px 5px;margin-left:4px;" title="' + _escapeHtml(r.fifoReason) + '">FIFO예외</span>'
                : '';
            return `
                <tr data-key="${r.key}">
                    <td style="text-align:center;"><input type="checkbox" class="inj-out-listup-chk" data-key="${_escapeHtml(r.key)}" checked></td>
                    <td><strong>${_escapeHtml(r.carModel)}</strong></td>
                    <td>${_escapeHtml(r.partName)}</td>
                    <td>${_escapeHtml(r.color || '-')}</td>
                    <td style="font-family:monospace;">${_escapeHtml(r.lotNo)}${fifoBadge}</td>
                    <td style="text-align:right;">
                        <input type="number" class="form-input inj-out-listup-qty" data-key="${_escapeHtml(r.key)}"
                            value="${r.qty}" min="1" max="${r.maxQty || r.qty}"
                            style="width:70px;text-align:right;font-weight:700;padding:4px 6px;font-size:0.85rem;">
                    </td>
                    <td>${typeBadge}</td>
                    <td style="font-size:0.78rem;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_escapeHtml(r.memo || '')}">${_escapeHtml(r.memo || '-')}</td>
                    <td style="text-align:center;">
                        <button type="button" class="btn btn-xs btn-outline" title="삭제"
                            onclick="InjectionWarehouseModule.removeOutgoingListupRow('${r.key}')">
                            <span class="material-symbols-outlined" style="font-size:14px;">close</span>
                        </button>
                    </td>
                </tr>`;
        }).join('');

        body.innerHTML = `
            <div style="padding:12px 16px;background:rgba(220,38,38,0.05);border-bottom:1px solid rgba(220,38,38,0.15);font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:var(--accent-red);">info</span>
                <span style="margin-left:4px;">출고할 항목을 모두 선택한 뒤 출고자를 고르고 <strong>출고 완료</strong>를 누르세요. <strong style="color:#b45309;">선입선출</strong> — 오래된 LOT부터 출고해야 합니다.</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:42px;text-align:center;">
                                <input type="checkbox" checked onchange="InjectionWarehouseModule.toggleOutgoingListupAll(this.checked)" title="전체 선택">
                            </th>
                            <th>차종</th><th>품명</th><th>컬러</th><th>LOT</th>
                            <th style="text-align:right;width:90px;">수량</th>
                            <th>구분</th><th>메모</th><th style="width:44px;"></th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <div style="padding:12px 16px;border-top:1px solid var(--border-color);background:var(--bg-secondary);display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
                <div class="form-group" style="margin:0;min-width:180px;flex:1 1 180px;">
                    <label class="form-label" style="font-size:0.75rem;">출고자 <span style="color:var(--accent-red);">*</span></label>
                    <select class="form-select" id="injOutListupIssuer" style="font-size:0.85rem;">${issuerOpts}</select>
                </div>
                <button class="btn btn-primary" onclick="InjectionWarehouseModule.confirmOutgoingListup()">
                    <span class="material-symbols-outlined" style="font-size:18px;">logout</span> 출고 완료
                </button>
            </div>`;
    }

    async function confirmOutgoingListup() {
        const issuer = ((document.getElementById('injOutListupIssuer') || {}).value || '').trim();
        if (!issuer) { UIUtils.toast('출고자를 선택하세요.', 'warning'); return; }
        if (!_isValidOutgoingActor(issuer)) {
            UIUtils.toast('출고자는 물류 담당자(물류작업자)만 선택할 수 있습니다.', 'warning');
            return;
        }

        const checkedKeys = new Set();
        document.querySelectorAll('.inj-out-listup-chk:checked').forEach(chk => checkedKeys.add(chk.dataset.key));
        if (!checkedKeys.size) { UIUtils.toast('출고할 품목을 1건 이상 선택하세요.', 'warning'); return; }

        // 화면에서 수정했을 수 있는 최신 수량 값을 반영
        document.querySelectorAll('.inj-out-listup-qty').forEach(inp => {
            const row = (_injOutListupRows || []).find(r => r.key === inp.dataset.key);
            if (row) row.qty = Math.max(1, parseInt(inp.value, 10) || 1);
        });

        const items = (_injOutListupRows || []).filter(r => checkedKeys.has(r.key));

        // 목록에 담은 뒤 다른 경로로 재고가 바뀌었을 수 있으니 실행 직전 다시 검증한다.
        for (const item of items) {
            const { lots: availableLots } = _getLotBalancesForProduct(item.carModel, item.partName, item.color);
            const lotBal = (availableLots.find(l => l.lotNo === item.lotNo) || {}).qty || 0;
            if (item.qty > lotBal) {
                UIUtils.toast(`LOT ${item.lotNo} 가용 재고(${UIUtils.formatNumber(lotBal)} EA)를 초과합니다. 목록을 다시 확인하세요.`, 'danger');
                return;
            }
        }

        // 선입선출 — 품목별로 출고 목록 전체를 검증
        const productGroups = {};
        items.forEach(function(item) {
            const gk = [item.carModel, item.partName, item.color || ''].join('||');
            if (!productGroups[gk]) productGroups[gk] = { carModel: item.carModel, partName: item.partName, color: item.color || '', items: [] };
            productGroups[gk].items.push(item);
        });
        for (const gk of Object.keys(productGroups)) {
            const group = productGroups[gk];
            const allocs = group.items.map(function(it) { return { lotNo: it.lotNo, qty: it.qty }; });
            const excludeKeys = new Set(group.items.map(function(it) { return it.key; }));
            const analysis = _analyzeFifoViolations(group.carModel, group.partName, group.color, allocs, excludeKeys);
            if (analysis.violated) {
                const missingReason = group.items.some(function(it) {
                    return analysis.violatingLots.indexOf(_normInvLotNo(it.lotNo)) >= 0 && !it.fifoReason;
                });
                if (missingReason) {
                    UIUtils.toast(analysis.message || '선입선출 미준수 항목에 사유가 없습니다. 해당 LOT를 다시 추가해 주세요.', 'warning');
                    return;
                }
            }
        }

        // 출고일(YYYY-MM-DD) + 현재 시각 — 이력 필터/정렬이 시각 포함 문자열과 섞여도 끊기지 않게
        const nowStamp = (UIUtils.now ? UIUtils.now() : '').slice(0, 16);
        const nowTime = nowStamp.length >= 16 ? nowStamp.slice(11, 16) : '00:00';

        let savedCount = 0;
        try {
            for (const item of items) {
                let planId = '';
                if (item.outgoingType === '생산출고' && typeof ProductionPlanModule !== 'undefined'
                    && typeof ProductionPlanModule._getInjReserveDetail === 'function') {
                    const detail = ProductionPlanModule._getInjReserveDetail(item.partName, item.carModel, item.color || '');
                    const plans = [].concat(detail.pendingPlans || [], detail.inProgressPlans || []);
                    if (plans.length) {
                        const day = String(item.date || '').slice(0, 10);
                        const sameDay = plans.find(function(p) { return String(p.date || '').slice(0, 10) === day; });
                        planId = String((sameDay || plans[0]).id || '');
                    }
                }
                const paintLine = item.outgoingType === '생산출고'
                    ? (item.paintLine === '도장-B' ? '도장-B' : '도장-A')
                    : undefined;
                const day = String(item.date || '').slice(0, 10)
                    || (nowStamp ? nowStamp.slice(0, 10) : '');
                const dateStamp = day ? (day + ' ' + nowTime) : nowStamp;

                await _addInventoryRecord({
                    date: dateStamp,
                    type: '출고',
                    outgoingType: item.outgoingType,
                    returnReason: item.returnReason || undefined,
                    carModel: item.carModel,
                    partName: item.partName,
                    color: item.color || '',
                    lots: [{ lotNo: item.lotNo, qty: item.qty, fifoReason: item.fifoReason || undefined }],
                    lotNo: item.lotNo,
                    quantity: item.qty,
                    unit: 'EA',
                    note: item.memo || undefined,
                    fifoReason: item.fifoReason || undefined,
                    outgoingBy: issuer,
                    planId: planId || undefined,
                    paintLine: paintLine,
                    line: paintLine,
                    source: item.outgoingType === '생산출고' ? '사출 창고 생산출고' : undefined
                });
                savedCount++;
                // 도장 투입 재고는 라인 운영자가 작업현황에서 「입고 처리」할 때 반영
            }
        } catch (e) {
            console.error('[confirmOutgoingListup] 저장 실패:', e);
            UIUtils.toast(
                savedCount > 0
                    ? `출고 일부만 저장됨(${savedCount}/${items.length}건). 나머지를 다시 시도하세요: ${e.message || e}`
                    : `출고 저장 실패: ${e.message || e}`,
                'error'
            );
            // 성공분만 목록에서 제거
            if (savedCount > 0) {
                const doneKeys = new Set(items.slice(0, savedCount).map(function (it) { return it.key; }));
                _injOutListupRows = (_injOutListupRows || []).filter(r => !doneKeys.has(r.key));
                renderOutgoingListup();
            }
            loadData();
            return;
        }

        _injOutListupRows = (_injOutListupRows || []).filter(r => !checkedKeys.has(r.key));
        const hasPaintOut = items.some(function (it) { return it.outgoingType === '생산출고'; });
        UIUtils.toast(
            hasPaintOut
                ? `${items.length}건 출고 완료 — 도장 라인에서 입고 처리하세요.`
                : `${items.length}건 출고 완료`,
            'success'
        );
        renderOutgoingListup();
        loadData();

        // 출고 이력 탭으로 이동해 방금 저장분이 보이게 (종료일이 오늘보다 이전이면 보정)
        const todayStr = UIUtils.today ? UIUtils.today() : '';
        const endEl = document.getElementById('injTxEndOut');
        if (endEl && todayStr && (!endEl.value || endEl.value < todayStr)) endEl.value = todayStr;
        _switchTab('outgoing');
    }

    // ── 수입 검사 완료품 입고 대기 섹션 ──────────────────────────────
    function renderInspStandby() {
        const card = document.getElementById('injInspStandbyCard');
        if (!card) return;

        if (!_dismissedPendingLoaded) {
            _ensureDismissedPendingLoaded().then(renderInspStandby).catch(() => {});
        }
        if (!_pendingCutoverLoaded) {
            _ensurePendingCutoverLoaded().then(renderInspStandby).catch(() => {});
        }

        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const inventory   = Storage.getAll(DB.STORES.INJECTION_INVENTORY)   || [];

        // 창고 입고 기록 → "이미 입고됨" 판정 키. 검사 인스턴스(inspId > inspDate)를 우선 키로 쓰고,
        // 둘 다 없는 옛 수동입고에 한해서만 수량 폴백을 쓴다. (LOT번호 재사용 오탐 방지 — _addInStockKeys)
        const inStockSet = new Set();
        inventory.filter(i => i.type === '입고').forEach(i => {
            if (i.lots && i.lots.length > 0) {
                i.lots.forEach(function(lot) {
                    _addInStockKeys(inStockSet, i.partName, lot.lotNo, _lotNum(lot.qty), i.inspId, i.inspDate);
                });
            } else if (i.lotNo) {
                _addInStockKeys(inStockSet, i.partName, i.lotNo, _lotNum(i.quantity), i.inspId, i.inspDate);
            }
        });

        // 검사 기록 → LOT별 행 펼치기
        const rows = [];
        inspections
            .filter(i => (i.lots && i.lots.length > 0) || (Number(i.passQty) || 0) > 0)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .forEach(insp => {
                if (insp.lots && insp.lots.length > 0) {
                    // 다중 LOT: 각 LOT별 개별 행 (수량 0인 LOT 제외)
                    insp.lots.forEach(lot => {
                        if ((Number(lot.qty) || 0) <= 0) return;
                        rows.push({
                            inspId: insp.id,
                            date: insp.date,
                            carModel: insp.carModel,
                            partName: insp.partName,
                            color: insp.color,
                            supplierName: insp.supplierName,
                            lotNo: lot.lotNo,
                            qty: lot.qty,
                            certReceived: lot.certReceived || false
                        });
                    });
                } else {
                    // 구형 단일 LOT 레코드 하위 호환
                    rows.push({
                        inspId: insp.id,
                        date: insp.date,
                        carModel: insp.carModel,
                        partName: insp.partName,
                        color: insp.color,
                        supplierName: insp.supplierName,
                        lotNo: insp.lotNo,
                        qty: insp.passQty,
                        certReceived: false
                    });
                }
            });

        // 입고 대기 중인 항목만 필터링 (입고 완료된 항목 + 관리자가 삭제(숨김)한 항목 제외)
        const dismissedSet = new Set(_dismissedPending.map(d => _dismissedPendingKey(d.inspId, d.lotNo)));
        const pendingRows = rows.filter(r =>
            !_isBeforePendingCutover(r.date) &&
            !_lotInStock(inStockSet, r.partName, r.lotNo, r.qty, r.inspId, r.date) &&
            !dismissedSet.has(_dismissedPendingKey(r.inspId, r.lotNo))
        );

        const dismissedCountBadge = _isAdminUser() && _dismissedPending.length > 0 ? `
            <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.openDismissedPendingModal()"
                style="font-size:0.78rem;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.9rem;">visibility_off</span>
                숨김 항목 (${_dismissedPending.length})
            </button>` : '';

        if (pendingRows.length === 0) {
            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; padding:10px 14px;
                            background:var(--bg-card); border:1px solid var(--border);
                            border-left:3px solid var(--accent-green); border-radius:8px;
                            margin-bottom:0; color:var(--accent-green); font-size:0.85rem;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">check_circle</span>
                    <span style="font-weight:600;">사출 창고 입고 대기품</span>
                    <span style="color:var(--text-muted); font-size:0.8rem;">(수입 검사 완료품)</span>
                    <span style="margin-left:auto; display:flex; align-items:center; gap:6px;">
                        <span style="color:var(--text-muted); font-size:0.82rem;">입고 대기 없음</span>
                        ${dismissedCountBadge}
                        <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.renderInspStandby()"
                            style="padding:2px 8px; font-size:0.78rem;">
                            <span class="material-symbols-outlined" style="font-size:0.9rem;">refresh</span>
                        </button>
                    </span>
                </div>`;
            return;
        }

        card.innerHTML = `
            <div class="card" style="margin-bottom:20px; border-left:3px solid var(--accent-orange,#f59e0b);">
                <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;">
                    <h4 style="display:flex; align-items:center; gap:8px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-orange,#f59e0b);">move_to_inbox</span>
                        사출 창고 입고 대기품
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">(수입 검사 완료품)</span>
                        <span style="font-size:0.78rem; background:var(--accent-orange,#f59e0b); color:#fff; padding:2px 8px; border-radius:12px; font-weight:600;">대기 ${pendingRows.length}건</span>
                    </h4>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${_testInspections().length ? `
                        <button class="btn btn-sm" onclick="InjectionWarehouseModule.clearTestInspections()"
                            style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5;"
                            title="LOT 260101 등 [DEV] 테스트 시드 검사 데이터를 삭제합니다.">
                            <span class="material-symbols-outlined" style="font-size:1rem;">delete_sweep</span>
                            테스트 데이터 정리 (${_testInspections().length})
                        </button>` : ''}
                        ${pendingRows.length > 0 ? `
                        <button class="btn btn-sm btn-danger" onclick="InjectionWarehouseModule.addAllPendingInspections()"
                            title="현재 대기 중인 모든 검사건의 미입고 LOT을 성적서 접수 여부와 무관하게 합격수량 전체 일괄 입고 처리합니다.">
                            <span class="material-symbols-outlined" style="font-size:1rem;">done_all</span>
                            전체 일괄 입고 (${pendingRows.length}건)
                        </button>` : ''}
                        ${dismissedCountBadge}
                        <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.renderInspStandby()">
                            <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span>
                        </button>
                    </div>
                </div>
                <div class="card-body" id="injInspStandbyBody" style="padding:0;"></div>
            </div>`;
        // 검사 1건(inspId)에 몰려있는 미입고 LOT 개수 — 2건 이상이면 "전체입고" 버튼 노출
        const inspGroupCount = {};
        pendingRows.forEach(r => { inspGroupCount[r.inspId] = (inspGroupCount[r.inspId] || 0) + 1; });
        const inspGroupSeen = new Set();

        const body = card.querySelector('#injInspStandbyBody');
        body.innerHTML = `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>검사일</th>
                            <th>차종</th>
                            <th>사출명</th>
                            <th>컬러</th>
                            <th>생산처</th>
                            <th>LOT번호</th>
                            <th style="text-align:center;">성적서</th>
                            <th style="text-align:right;">수량</th>
                            <th style="text-align:center;">상태</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingRows.map(r => {
                            const groupCount = inspGroupCount[r.inspId] || 1;
                            const isFirstOfGroup = groupCount > 1 && !inspGroupSeen.has(r.inspId);
                            if (isFirstOfGroup) inspGroupSeen.add(r.inspId);
                            return `
                            <tr style="background:rgba(245,158,11,0.06);">
                                <td style="font-size:0.82rem;">${(r.date || '').slice(0, 10)}</td>
                                <td>${r.carModel || '-'}</td>
                                <td><strong>${r.partName || '-'}</strong></td>
                                <td>${r.color || '-'}</td>
                                <td style="font-size:0.82rem;">${r.supplierName || '-'}</td>
                                <td style="font-family:monospace; font-weight:600;">${r.lotNo || '-'}</td>
                                <td style="text-align:center;">
                                    ${r.certReceived
                                        ? '<span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-green);vertical-align:middle;">check_circle</span>'
                                        : '<span style="color:var(--text-muted);font-size:0.85rem;">-</span>'}
                                </td>
                                <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${UIUtils.formatNumber(r.qty || 0)}</td>
                                <td style="text-align:center;">
                                    <span class="badge badge-warning" style="background:var(--accent-orange,#f59e0b);color:#fff;">입고대기</span>
                                </td>
                                <td style="white-space:nowrap;">
                                    <div style="display:flex; gap:4px; align-items:center;">
                                        <button class="btn btn-sm btn-outline" title="이 항목의 수입검사 상세 내용을 확인합니다."
                                                onclick="InjectionIncomingModule.view('${r.inspId}')">
                                            <span class="material-symbols-outlined" style="font-size:0.9rem;">visibility</span> 보기
                                        </button>
                                        <button class="btn btn-sm btn-primary" onclick="InjectionWarehouseModule.openAddFromInspection('${r.inspId}', '${r.lotNo}')">
                                            <span class="material-symbols-outlined" style="font-size:0.9rem;">add_circle</span> 입고
                                        </button>
                                        ${isFirstOfGroup ? `
                                        <button class="btn btn-sm btn-danger" title="이 검사건의 미입고 LOT ${groupCount}건을 합격수량 전체(성적서 접수 여부와 무관) 한 번에 입고 처리합니다."
                                                onclick="InjectionWarehouseModule.addAllFromInspection('${r.inspId}')">
                                            <span class="material-symbols-outlined" style="font-size:0.9rem;">done_all</span> 전체입고(${groupCount})
                                        </button>` : ''}
                                        ${_isAdminUser() ? `
                                        <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#fca5a5;"
                                                title="이 항목을 대기 목록에서만 삭제(숨김)합니다. 수입검사 기록과 창고 재고에는 영향 없음."
                                                onclick="InjectionWarehouseModule.dismissPendingLot('${r.inspId}', '${encodeURIComponent(r.lotNo || '')}')">
                                            <span class="material-symbols-outlined" style="font-size:0.9rem;">delete</span>
                                        </button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // 대기 목록에서 특정 LOT을 삭제(숨김) — 검사 기록/창고 재고는 전혀 건드리지 않음 (관리자 전용)
    async function dismissPendingLot(inspId, encodedLotNo) {
        if (!_isAdminUser()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        const lotNo = decodeURIComponent(encodedLotNo || '');
        const insp = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, inspId);
        const label = insp ? `${insp.carModel || ''} ${insp.partName || ''} (${insp.color || '-'})` : '';

        UIUtils.confirm(
            `${label} · LOT ${lotNo}\n` +
            `이 항목을 "사출 창고 입고 대기품" 목록에서만 삭제합니다.\n` +
            `수입검사 기록이나 실제 창고 재고는 전혀 변경되지 않으며, 화면 목록에서만 숨겨집니다.\n계속하시겠습니까?`,
            async () => {
                await _ensureDismissedPendingLoaded();
                const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
                _dismissedPending.push({
                    inspId,
                    lotNo,
                    carModel: insp ? insp.carModel : '',
                    partName: insp ? insp.partName : '',
                    color: insp ? insp.color : '',
                    dismissedAt: new Date().toISOString(),
                    dismissedBy: (user && (user.displayName || user.username)) || ''
                });
                await Storage.setConfigValue(DISMISSED_PENDING_KEY, _dismissedPending);
                UIUtils.toast('대기 목록에서 삭제되었습니다. (검사기록/재고는 영향 없음)', 'success');
                renderInspStandby();
            }
        );
    }

    // 숨김 처리된 항목 목록 (관리자 전용) — 실수로 삭제한 경우 복원 가능
    function openDismissedPendingModal() {
        if (!_isAdminUser()) { UIUtils.toast('관리자만 볼 수 있습니다.', 'warning'); return; }
        const rows = _dismissedPending.map((d, idx) => `
            <tr>
                <td style="font-size:0.82rem;">${d.carModel || '-'}</td>
                <td><strong>${d.partName || '-'}</strong></td>
                <td>${d.color || '-'}</td>
                <td style="font-family:monospace;">${d.lotNo || '-'}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${(d.dismissedAt || '').slice(0, 16).replace('T', ' ')}</td>
                <td style="font-size:0.78rem;">${d.dismissedBy || '-'}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.restoreDismissedPendingLot(${idx})">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">restore</span> 복원
                    </button>
                </td>
            </tr>`).join('');

        UIUtils.showModal('숨김 처리된 입고 대기 항목', `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>차종</th><th>사출명</th><th>컬러</th><th>LOT번호</th>
                            <th>삭제일시</th><th>삭제자</th><th></th>
                        </tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">숨김 처리된 항목이 없습니다.</td></tr>`}</tbody>
                </table>
            </div>
        `, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, '900px');
    }

    // 숨김 처리 취소 — 대기 목록에 다시 노출
    async function restoreDismissedPendingLot(idx) {
        if (!_isAdminUser()) { UIUtils.toast('관리자만 복원할 수 있습니다.', 'warning'); return; }
        if (idx < 0 || idx >= _dismissedPending.length) return;
        _dismissedPending.splice(idx, 1);
        await Storage.setConfigValue(DISMISSED_PENDING_KEY, _dismissedPending);
        UIUtils.toast('복원되었습니다.', 'success');
        UIUtils.closeModal();
        openDismissedPendingModal();
        renderInspStandby();
    }

    // 수입검사 1건의 LOT들이 이미 사출 창고(INJECTION_INVENTORY)에 입고 처리된 기록을 찾아 반환.
    // 각 항목에 consumed(이미 다른 출고 기록에서 사용됐는지)를 표시 — 수입검사 삭제 시
    // 창고 재고와의 정합성을 확인하는 용도로 사용한다(InjectionIncomingModule.remove에서 호출).
    function getLinkedInventoryForInspection(insp) {
        if (!insp) return [];
        const inventory = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const sourceLots = (insp.lots && insp.lots.length > 0)
            ? insp.lots
            : (insp.lotNo ? [{ lotNo: insp.lotNo, qty: insp.passQty }] : []);

        const linked = [];
        sourceLots.forEach(lot => {
            if (!lot.lotNo) return;
            const qty = Number(lot.qty) || 0;
            if (qty <= 0) return;

            inventory.forEach(inv => {
                if (inv.type !== '입고' || inv.partName !== insp.partName) return;
                const invLots = (inv.lots && inv.lots.length > 0)
                    ? inv.lots
                    : (inv.lotNo ? [{ lotNo: inv.lotNo, qty: inv.quantity }] : []);
                invLots.forEach(invLot => {
                    if (invLot.lotNo !== lot.lotNo) return;
                    const invQty = Number(invLot.qty) || 0;
                    const matchesQty = invQty === qty;
                    const matchesInsp = !!inv.inspDate && inv.inspDate === insp.date;
                    if (!matchesQty && !matchesInsp) return;

                    const consumed = inventory.some(o =>
                        o.type === '출고' && o.partName === insp.partName &&
                        (o.lotNo === lot.lotNo || (o.lots || []).some(l2 => l2.lotNo === lot.lotNo))
                    );
                    linked.push({ invId: inv.id, lotNo: lot.lotNo, qty: invQty, consumed });
                });
            });
        });
        return linked;
    }

    // linked 창고 입고 기록 삭제 — 위 함수로 확인된, 아직 소비되지 않은 레코드만 넘겨야 함
    async function removeLinkedInventoryRecords(ids) {
        for (const id of (ids || [])) {
            try { await Storage.remove(DB.STORES.INJECTION_INVENTORY, id); }
            catch (e) { console.warn('[removeLinkedInventoryRecords] 실패:', id, e); }
        }
    }

    // 콤마 포함 문자열 수량도 안전하게 숫자화 (InvCalc._num과 동일 규칙)
    function _lotNum(v) { return Number(String(v == null ? '' : v).replace(/,/g, '')) || 0; }

    // "이미 입고됨" 판정 키 등록.
    // LOT 번호는 생산일자 기준이라 서로 다른 검사건이 같은 번호를 재사용한다. LOT번호+수량만으로
    // 매칭하면 다른 검사건의 동일 LOT·동일 수량을 "이미 입고"로 오인해(오탐) 실제 입고가 누락된다.
    // 따라서 검사 인스턴스를 특정하는 inspId > inspDate 를 우선 키로 쓰고, 둘 다 없는 옛 수동입고에
    // 한해서만 수량 폴백(qtyonly)을 남긴다.
    function _addInStockKeys(set, partName, lotNo, qty, inspId, inspDate) {
        if (!lotNo || qty <= 0) return;
        if (inspId)   set.add(`${partName}||${lotNo}||inspid:${inspId}`);
        if (inspDate) set.add(`${partName}||${lotNo}||insp:${inspDate}`);
        if (!inspId && !inspDate) set.add(`${partName}||${lotNo}||qtyonly:${qty}`);
    }

    // 검사건의 LOT 하나가 이미 창고에 반영됐는지 — 등록과 동일 우선순위로 확인
    function _lotInStock(set, partName, lotNo, qty, inspId, inspDate) {
        if (inspId   && set.has(`${partName}||${lotNo}||inspid:${inspId}`)) return true;
        if (inspDate && set.has(`${partName}||${lotNo}||insp:${inspDate}`)) return true;
        return set.has(`${partName}||${lotNo}||qtyonly:${_lotNum(qty)}`);
    }

    // 현재 창고(INJECTION_INVENTORY)에 이미 입고된 LOT 판정 키 집합 (_addInStockKeys 규칙)
    function _buildInStockLotSet() {
        const inventory = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const inStockSet = new Set();
        inventory.filter(i => i.type === '입고').forEach(i => {
            if (i.lots && i.lots.length > 0) {
                i.lots.forEach(function(lot) {
                    _addInStockKeys(inStockSet, i.partName, lot.lotNo, _lotNum(lot.qty), i.inspId, i.inspDate);
                });
            } else if (i.lotNo) {
                _addInStockKeys(inStockSet, i.partName, i.lotNo, _lotNum(i.quantity), i.inspId, i.inspDate);
            }
        });
        return inStockSet;
    }

    // 검사 1건의 미입고 LOT 목록(성적서 접수 여부 무관, qty>0, 아직 창고 미반영) 반환
    function _pendingLotsForInspection(insp, inStockSet) {
        // 수량 보정 시점 이전 검사건은 입고 대상에서 제외 (이미 재고 정합 처리됨)
        if (_isBeforePendingCutover(insp.date)) return [];
        const sourceLots = (insp.lots && insp.lots.length > 0)
            ? insp.lots
            : (insp.lotNo ? [{ lotNo: insp.lotNo, qty: insp.passQty }] : []);
        return sourceLots.filter(l => {
            const qty = _lotNum(l.qty);
            if (qty <= 0) return false;
            return !_lotInStock(inStockSet, insp.partName, l.lotNo, qty, insp.id, insp.date);
        });
    }

    // 검사 1건의 미입고 LOT 전체를 사출 창고(INJECTION_INVENTORY) 입고 레코드 1건으로 반영
    async function _commitInspectionInbound(insp, pendingLots, allMats) {
        const totalQty = pendingLots.reduce((s, l) => s + (Number(l.qty) || 0), 0);
        // 차종+품명만으로 매칭하면 컬러가 다른 자재(마스터)와 잘못 연결되어 재고 집계 시
        // 서로 다른 컬러의 수량이 섞이는 오류가 생긴다. 컬러까지 일치하는 자재를 우선 사용하고,
        // 차종+품명 조합에 자재가 하나뿐일 때만(컬러 구분 없음) 컬러 무시 매칭으로 넘어간다.
        const _sameCarPart = (allMats || []).filter(m => m.injPartName === insp.partName && m.carModel === insp.carModel);
        const _matMatch = _sameCarPart.find(m => _splitMasterColors(m).some(mc => _colorsMatch(mc, insp.color || '')))
            || (_sameCarPart.length === 1 ? _sameCarPart[0] : null);
        const _resolvedColor = _resolveMasterColor(insp.carModel, insp.partName, insp.color, allMats);

        await _addInventoryRecord({
            date: InvCalc.stampFor(UIUtils.today()),
            type: '입고',
            carModel: insp.carModel || '',
            partName: insp.partName || '',
            color: _resolvedColor || insp.color || '',
            supplier: insp.supplierName || '',
            lots: pendingLots.map(l => ({ lotNo: l.lotNo, qty: Number(l.qty) || 0 })),
            lotNo: pendingLots[0].lotNo || '',
            quantity: totalQty,
            unit: 'EA',
            source: '수입검사 합격수량 전체입고',
            injMaterialId: _matMatch ? _matMatch.id : undefined,
            inspId: insp.id || undefined,
            inspDate: insp.date || undefined
        });
        return totalQty;
    }

    // 검사 1건에 남아있는 미입고 LOT을 전부 한 번에 창고 입고 처리 (성적서 접수 여부 무관, 합격수량 전체 반영)
    async function addAllFromInspection(inspId) {
        const insp = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('검사 정보를 찾을 수 없습니다.', 'error'); return; }

        await _ensurePendingCutoverLoaded();
        const pendingLots = _pendingLotsForInspection(insp, _buildInStockLotSet());
        if (pendingLots.length === 0) {
            UIUtils.toast('이미 모두 입고 처리되었습니다.', 'info');
            renderInspStandby();
            return;
        }

        const totalQty = pendingLots.reduce((s, l) => s + (Number(l.qty) || 0), 0);

        UIUtils.confirm(
            `${insp.carModel || ''} ${insp.partName || ''} (${insp.color || '-'})\n` +
            `미입고 LOT ${pendingLots.length}건 · 합계 ${UIUtils.formatNumber(totalQty)} EA를 사출 창고에 전체 입고 처리하시겠습니까?`,
            async () => {
                const allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
                await _commitInspectionInbound(insp, pendingLots, allMats);
                UIUtils.toast(`${pendingLots.length}건 · ${UIUtils.formatNumber(totalQty)} EA 입고 처리 완료되었습니다.`, 'success');
                renderInspStandby();
                if (typeof loadData === 'function') { try { loadData(); } catch (e) {} }
            }
        );
    }

    // 현재 대기 중인 모든 검사건의 미입고 LOT을 일괄 창고 입고 처리 (성적서 접수 여부 무관, 합격수량 전체 반영)
    async function addAllPendingInspections() {
        await _ensurePendingCutoverLoaded();
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const inStockSet = _buildInStockLotSet();

        const groups = inspections
            .map(insp => ({ insp, pendingLots: _pendingLotsForInspection(insp, inStockSet) }))
            .filter(g => g.pendingLots.length > 0);

        if (groups.length === 0) {
            UIUtils.toast('입고 대기 중인 항목이 없습니다.', 'info');
            renderInspStandby();
            return;
        }

        const totalLots = groups.reduce((s, g) => s + g.pendingLots.length, 0);
        const totalQty = groups.reduce((s, g) => s + g.pendingLots.reduce((s2, l) => s2 + (Number(l.qty) || 0), 0), 0);

        UIUtils.confirm(
            `검사 ${groups.length}건 · 미입고 LOT ${totalLots}건 · 합계 ${UIUtils.formatNumber(totalQty)} EA를\n` +
            `성적서 접수 여부와 무관하게 사출 창고에 전체 일괄 입고 처리하시겠습니까?`,
            async () => {
                const allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
                for (const g of groups) {
                    try { await _commitInspectionInbound(g.insp, g.pendingLots, allMats); }
                    catch (e) { console.warn('[addAllPendingInspections] 실패:', g.insp.id, e); }
                }
                UIUtils.toast(`${groups.length}건 · ${UIUtils.formatNumber(totalQty)} EA 일괄 입고 처리 완료되었습니다.`, 'success');
                renderInspStandby();
                if (typeof loadData === 'function') { try { loadData(); } catch (e) {} }
            }
        );
    }

    // DEV 테스트 시드 검사 기록 판별 ([DEV] 표기 또는 LOT 260101 + 테스트 검사자)
    function _isTestInspection(insp) {
        const note = String(insp.note || '');
        if (note.indexOf('[DEV]') > -1) return true;
        const lotMatch = insp.lotNo === '260101' ||
            (Array.isArray(insp.lots) && insp.lots.some(function (l) { return l.lotNo === '260101'; }));
        return lotMatch && String(insp.inspector || '') === '테스트';
    }

    function _testInspections() {
        return (Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || []).filter(_isTestInspection);
    }

    // 테스트 시드 검사 데이터 일괄 삭제 (실제 검사 기록은 보존)
    function clearTestInspections() {
        const targets = _testInspections();
        if (!targets.length) {
            UIUtils.toast('삭제할 테스트 데이터가 없습니다.', 'info');
            return;
        }
        UIUtils.confirm(
            `[DEV] 테스트 시드 수입검사 ${targets.length}건을 삭제하시겠습니까?\n` +
            `(LOT 260101 등 테스트 데이터만 삭제되며, 실제 검사 기록은 보존됩니다.)`,
            async function () {
                let removed = 0;
                for (const insp of targets) {
                    try { await Storage.remove(DB.STORES.INJECTION_INSPECTIONS, insp.id); removed++; }
                    catch (e) { console.warn('[clearTestInspections] remove failed:', insp.id, e); }
                }
                UIUtils.toast(`테스트 데이터 ${removed}건을 삭제했습니다.`, 'success');
                renderInspStandby();
            }
        );
    }

    // 검사 기록으로부터 입고 모달 자동 채움
    function openAddFromInspection(inspId, lotNo) {
        const insp = Storage.getById(DB.STORES.INJECTION_INSPECTIONS, inspId);
        if (!insp) { UIUtils.toast('검사 정보를 찾을 수 없습니다.', 'error'); return; }

        _pendingInspDate = insp.date || '';
        openAddModal('입고');
        setTimeout(() => {
            const carSel  = document.getElementById('addInvCarModel');
            const partSel = document.getElementById('addInvPart');
            const colorSel = document.getElementById('addInvColor');

            // 날짜/시간을 검사일 기준으로 세팅
            const dateParts = (_pendingInspDate || '').split(' ');
            const dateEl = document.getElementById('addInvDate');
            const timeEl = document.getElementById('addInvTime');
            if (dateEl && dateParts[0]) dateEl.value = dateParts[0];
            if (timeEl && dateParts[1]) timeEl.value = dateParts[1];

            if (carSel) {
                carSel.value = insp.carModel || '';
                InjectionWarehouseModule.onModalCarModelChange();
            }
            setTimeout(() => {
                if (partSel) {
                    partSel.value = insp.partName || '';
                    InjectionWarehouseModule.onModalPartChange();
                }
                setTimeout(() => {
                    if (colorSel && insp.color) colorSel.value = insp.color;
                    // 다중 LOT 또는 단일 LOT 처리
                    const container = document.getElementById('invLotRows');
                    if (!container) return;
                    container.innerHTML = '';
                    // 클릭한 특정 LOT만 채움 (전체 X)
                    var targetLot = null;
                    if (lotNo && insp.lots && insp.lots.length > 0) {
                        targetLot = insp.lots.find(function(l) { return l.lotNo === lotNo; });
                    }
                    var fillLotNo = targetLot ? targetLot.lotNo : (lotNo || insp.lotNo || '');
                    var fillQty   = targetLot ? targetLot.qty   : (insp.passQty || 0);

                    var row = document.createElement('div');
                    row.className = 'inv-lot-row';
                    row.style.cssText = 'display:grid; grid-template-columns:200px 1fr 34px; gap:8px; align-items:center; margin-bottom:8px; padding:8px 10px; border:1px solid rgba(37,99,235,0.18); border-radius:10px; background:#fff; box-shadow:0 1px 3px rgba(37,99,235,0.06);';
                    row.innerHTML = '<input type="text" class="form-input inv-lot-no" value="' + fillLotNo + '" maxlength="6" placeholder="YYMMDD (필수)" required style="font-family:monospace; letter-spacing:1px; font-weight:800; font-size:1rem;" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');">'
                        + '<input type="number" class="form-input inv-lot-qty" value="' + fillQty + '" min="1" placeholder="수량 (필수)" required style="text-align:right; font-weight:800; font-size:1rem; color:var(--accent-blue);" oninput="InjectionWarehouseModule.calcInvLotTotal()">'
                        + '<button type="button" onclick="InjectionWarehouseModule.removeInvLotRow(this)" style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
                        + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
                        + '</button>';
                    container.appendChild(row);
                    InjectionWarehouseModule.calcInvLotTotal();
                }, 80);
            }, 80);
        }, 80);
    }

    function openAddModal(type = '입고') {
        if (type !== '입고') _pendingInspDate = '';
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        // 출고 시: 재고 > 0 인 차종만 표시
        let uniqueCarModels;
        if (type === '출고') {
            const stockMap = _calcStockMap();
            const carsWithStock = new Set(
                Object.values(stockMap)
                    .filter(v => v.stock > 0)
                    .map(v => v.carModel)
            );
            uniqueCarModels = UIUtils.sortCarModels(
                materials.map(m => m.carModel).filter(c => carsWithStock.has(c)),
                materials
            );
        } else {
            uniqueCarModels = UIUtils.sortCarModels(materials.map(m => m.carModel), materials);
        }

        const colorClass = type === '출고' ? 'var(--accent-red)' : 'var(--accent-blue)';
        const titleIcon = type === '출고' ? 'do_not_disturb_on' : 'add_circle';

        UIUtils.showModal(`<span class="material-symbols-outlined" style="vertical-align:middle;color:${colorClass};">${titleIcon}</span> 사출 ${type} 등록`, `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${type}일시</label>
                    <div style="display:flex; gap:8px;">
                        <input type="date" class="form-input" id="addInvDate" value="${UIUtils.today()}">
                        <input type="time" class="form-input" id="addInvTime" value="${new Date().toTimeString().slice(0, 5)}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">구분</label>
                    <input type="text" class="form-input" id="addInvType" value="${type}" readonly style="background:var(--bg-secondary);font-weight:700;color:${colorClass}; text-align:center;">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="addInvCarModel" onchange="InjectionWarehouseModule.onModalCarModelChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${uniqueCarModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출명</label>
                    <select class="form-select" id="addInvPart" onchange="InjectionWarehouseModule.onModalPartChange()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 컬러</label>
                    <select class="form-select" id="addInvColor" onchange="InjectionWarehouseModule.onModalColorChange()">
                        <option value="">-- 차종 먼저 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">사출처</label>
                    <div id="addInvSupplierDisplay" style="padding:8px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; color:var(--text-muted); font-size:0.92rem; min-height:38px; display:flex; align-items:center;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>
                    </div>
                    <input type="hidden" id="addInvSupplier">
                </div>
            </div>
            ${type === '출고' ? `
            <div class="form-row" id="outTypeRow">
                <div class="form-group" style="flex:none;">
                    <label class="form-label">출고 구분 <span style="color:var(--accent-red)">*</span></label>
                    <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="outgoingType" id="outTypeProduction" value="생산출고" checked
                                onchange="InjectionWarehouseModule.onOutTypeChange()">
                            <span style="font-weight:600;color:var(--accent-blue);">생산 출고</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="outgoingType" id="outTypeReturn" value="반출"
                                onchange="InjectionWarehouseModule.onOutTypeChange()">
                            <span style="font-weight:600;color:var(--accent-orange,#f59e0b);">반출</span>
                        </label>
                    </div>
                </div>
                <div class="form-group" id="addInvPaintLineGroup">
                    <label class="form-label">도착 라인 <span style="color:var(--accent-red)">*</span></label>
                    <div style="display:flex;gap:12px;align-items:center;padding:8px 0;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="addInvPaintLine" value="도장-A">
                            <span style="font-weight:700;color:#2563eb;">도장-A</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
                            <input type="radio" name="addInvPaintLine" value="도장-B">
                            <span style="font-weight:700;color:#ea580c;">도장-B</span>
                        </label>
                    </div>
                    <div id="addInvPaintLineHint" style="font-size:0.75rem;color:var(--text-muted);">기초정보(제품 마스터) 기준으로 자동 선택됩니다.</div>
                </div>
            </div>
            <div id="returnReasonGroup" style="display:none; margin-bottom:12px;">
                <label class="form-label">반출 사유 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="returnReasonInput" placeholder="반출 사유를 입력하세요" style="width:100%; box-sizing:border-box;">
            </div>` : ''}
            <div style="margin-bottom:16px;">

                ${type === '출고' ? `
                <div id="addInvStockArea" style="margin-bottom:10px; padding:10px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">
                    <div id="lotStockListContainer">
                        <label class="form-label" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:5px; display:block;">현재 보관중인 LOT (클릭 시 자동 입력)</label>
                        <div id="lotStockList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:white;">
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                        <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">현재 가용 재고 합계</span>
                        <span id="addInvCurrentStock" style="font-size:1.1rem; font-weight:700; color:var(--accent-blue);">0 EA</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;
                            background:rgba(239,68,68,0.05); border:1px solid var(--accent-red);
                            border-radius:8px; padding:10px 12px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-red); font-size:1.1rem;">auto_fix_high</span>
                    <span style="font-size:0.82rem; font-weight:600; white-space:nowrap; color:var(--text-secondary);">총 출고 수량</span>
                    <input type="number" id="fifoTotalQty" class="form-input" min="1" placeholder="수량 입력"
                        style="flex:1; max-width:120px; text-align:right;">
                    <span style="font-size:0.82rem; color:var(--text-muted);">EA</span>
                    <button type="button" class="btn btn-sm btn-danger"
                        onclick="InjectionWarehouseModule.autoFillFIFO()"
                        style="white-space:nowrap; display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">playlist_add_check</span>
                        선입선출 로트 자동 입력
                    </button>
                </div>` : `
                <div id="addInvStockArea" style="display:none; margin-bottom:10px; padding:10px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">
                    <div id="lotStockListContainer">
                        <label class="form-label" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:5px; display:block;">현재 보관중인 LOT</label>
                        <div id="lotStockList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:white;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                        <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">현재 가용 재고 합계</span>
                        <span id="addInvCurrentStock" style="font-size:1.1rem; font-weight:700; color:var(--accent-blue);">0 EA</span>
                    </div>
                </div>`}

                <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                    <div style="display:grid; grid-template-columns:200px 1fr 34px; gap:8px; align-items:center; margin:0 0 6px; padding:0 10px; font-size:0.78rem; font-weight:700; color:var(--text-secondary);">
                        <span>사출LOT <span style="color:var(--accent-red);">*</span></span>
                        <span>수량 <span style="color:var(--accent-red);">*</span></span>
                        <span></span>
                    </div>
                    <div id="invLotRows"></div>
                    <button type="button" class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.addInvLotRow()" style="margin-top:4px; display:flex; align-items:center; gap:4px; font-size:0.8rem;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">add</span> LOT 추가
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:rgba(59,130,246,0.06); border:1px solid var(--accent-blue); border-radius:6px; padding:8px 14px;">
                    <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">총 ${type}수량</span>
                    <span id="invLotTotalQty" style="font-size:1.15rem; font-weight:700; color:var(--accent-blue);">0</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">EA</span>
                </div>
                <input type="hidden" id="addInvQty" value="0">
                <input type="hidden" id="addInvUnit" value="EA">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="addInvSource" placeholder="기타 특이사항">
                </div>
                ${type === '입고' ? `
                <div class="form-group">
                    <label class="form-label">입고자 <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">(임의 입고)</span></label>
                    <select class="form-select" id="addInvReceivedBy">
                        <option value="">-- 선택 --</option>
                        ${_buildProductionWorkerOptionHtml()}
                    </select>
                </div>` : `
                <div class="form-group">
                    <label class="form-label">출고자 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">(물류 담당자)</span></label>
                    <select class="form-select" id="addInvOutgoingBy">
                        <option value="">-- 출고자 선택 --</option>
                        ${_buildLogisticsWorkerOptionHtml()}
                    </select>
                </div>`}
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn ${type === '출고' ? 'btn-danger' : 'btn-primary'}" onclick="InjectionWarehouseModule.saveNew()">확인</button>
        `, 'min(1180px, calc(100vw - 32px))');
        // 첫 LOT 행 초기화
        setTimeout(() => {
            addInvLotRow();
            _prefillActorSelect(type);
        }, 100);
    }

    /**
     * 컬러 드롭다운 갱신 — 사출자재 마스터(INJECTION_MATERIALS)의 injColor 기준
     * @param {string} carModel  - 선택된 차종
     * @param {string} partName  - 선택된 사출명 (없으면 차종 전체 스캔)
     */
    function _updateColorOptions(carModel, partName) {
        const colorSel = document.getElementById('addInvColor');
        if (!colorSel) return;

        if (!carModel) {
            colorSel.innerHTML = '<option value="">-- 차종 먼저 선택 --</option>';
            return;
        }

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

        // 사출명이 지정된 경우 해당 자재만, 아니면 차종 전체 자재 스캔
        const targets = partName
            ? materials.filter(m => m.carModel === carModel && m.injPartName === partName)
            : materials.filter(m => m.carModel === carModel);

        // injColor 파싱: 쉼표/공백 구분자로 여러 색상이 들어올 수 있음
        const colorSet = new Set();
        targets.forEach(m => {
            if (m.injColor) {
                m.injColor.split(/[,，、\/]/).map(c => c.trim()).filter(Boolean)
                    .forEach(c => colorSet.add(c));
            }
        });

        const colors = [...colorSet].sort();

        if (colors.length === 0) {
            colorSel.innerHTML = '<option value="">-- 컬러 정보 없음 --</option>';
            return;
        }

        colorSel.innerHTML = '<option value="">-- 선택 --</option>' +
            colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // 컬러가 1개뿐이면 자동 선택
        if (colors.length === 1) colorSel.value = colors[0];
    }

    // 선입선출(FIFO) 자동 LOT 입력
    function autoFillFIFO() {
        const totalQty = parseInt(document.getElementById('fifoTotalQty')?.value) || 0;
        if (totalQty <= 0) { UIUtils.toast('총 출고 수량을 입력해주세요.', 'warning'); return; }

        const carModel = document.getElementById('addInvCarModel')?.value || '';
        const partName = document.getElementById('addInvPart')?.value || '';
        const color    = document.getElementById('addInvColor')?.value || '';

        if (!carModel || !partName) { UIUtils.toast('차종과 품목을 먼저 선택해주세요.', 'warning'); return; }

        // LOT별 재고 — InvCalc(lots[] 우선) 단일 진실 공급원
        const { lots: fifoLots, balance } = _getLotBalancesForProduct(carModel, partName, color);

        if (fifoLots.length === 0) { UIUtils.toast('가용 재고가 없습니다.', 'error'); return; }

        const totalAvail = balance.total;
        if (totalQty > totalAvail) {
            UIUtils.toast(`재고 부족! 가용 재고: ${totalAvail.toLocaleString()} EA`, 'error');
            return;
        }

        // FIFO 배분 (입고일 오름차순)
        const fifoSorted = fifoLots.slice().sort(function(a, b) {
            return (a.date || '').localeCompare(b.date || '') || String(a.lotNo).localeCompare(String(b.lotNo));
        });
        let remaining = totalQty;
        const allocations = [];
        for (const lot of fifoSorted) {
            if (remaining <= 0) break;
            const allocQty = Math.min(remaining, lot.qty);
            allocations.push({ lot: lot.lotNo, qty: allocQty });
            remaining -= allocQty;
        }

        // LOT 행 초기화 후 자동 채우기
        const container = document.getElementById('invLotRows');
        if (!container) return;
        container.innerHTML = '';

        allocations.forEach(({ lot, qty }) => {
            addInvLotRow();
            const rows = container.querySelectorAll('.inv-lot-row');
            const lastRow = rows[rows.length - 1];
            const lotInput = lastRow.querySelector('.inv-lot-no');
            const qtyInput = lastRow.querySelector('.inv-lot-qty');
            if (lotInput) lotInput.value = lot === '무표기' ? '' : lot;
            if (qtyInput) { qtyInput.value = qty; }
        });

        calcInvLotTotal();
        checkAllInvFifoWarnings();
        UIUtils.toast(`선입선출 자동 입력 완료 (${allocations.length}개 LOT, 총 ${totalQty.toLocaleString()} EA)`, 'success');
    }

    // 재고 맵 계산 헬퍼 (차종||품목||컬러 → {stock}) — InvCalc + 출고(color 없음) 반영
    function _calcStockMap() {
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const keySet = {};

        function addKey(carModel, partName, color) {
            if (!partName) return;
            const k = `${carModel || ''}||${partName || ''}||${color || ''}`;
            if (!keySet[k]) keySet[k] = { carModel: carModel || '', partName: partName || '', color: color || '' };
        }

        data.forEach(function(d) {
            const carModel = _normKeyStr(d.carModel);
            const partName = _normKeyStr(d.partName);
            const colorRaw = _normKeyStr(d.color);
            const resolved = _resolveMasterColor(carModel, partName, colorRaw, materials);
            if (_isOrphanInventoryColor(carModel, partName, colorRaw || resolved, materials)) return;
            addKey(carModel, partName, resolved);
        });
        materials.forEach(function(m) { addKey(m.carModel, m.injPartName, m.injColor); });

        const m = {};
        Object.keys(keySet).forEach(function(key) {
            const g = keySet[key];
            const bal = InvCalc.lotBalances(_filterProductRecords(g.carModel, g.partName, g.color));
            m[key] = {
                carModel: g.carModel,
                partName: g.partName,
                color: g.color,
                stock: bal.total,
                unmatched: bal.unmatched || 0
            };
        });
        return m;
    }

    function onModalCarModelChange() {
        const carModel = document.getElementById('addInvCarModel').value;
        const partSelect = document.getElementById('addInvPart');
        const supplierDisplay = document.getElementById('addInvSupplierDisplay');
        const supplierHidden  = document.getElementById('addInvSupplier');

        partSelect.innerHTML = '<option value="">-- 사출명 선택 --</option>';
        if (supplierDisplay) supplierDisplay.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>';
        if (supplierHidden)  supplierHidden.value = '';

        _updateColorOptions(carModel, '');   // 차종 전체 스캔 (사출명 미선택)
        const _typeForHide = document.getElementById('addInvType')?.value || '입고';
        if (_typeForHide !== '출고') document.getElementById('addInvStockArea').style.display = 'none';

        if (!carModel) return;

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const filtered = materials.filter(m => m.carModel === carModel);
        const type = document.getElementById('addInvType')?.value || '입고';

        let partNames;
        if (type === '출고') {
            // 출고 시: 해당 차종에서 재고 > 0 인 품목만
            const stockMap = _calcStockMap();
            const partsWithStock = new Set(
                Object.values(stockMap)
                    .filter(v => v.carModel === carModel && v.stock > 0)
                    .map(v => v.partName)
            );
            partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))]
                .filter(p => partsWithStock.has(p))
                .sort();
        } else {
            partNames = [...new Set(filtered.map(m => m.injPartName).filter(Boolean))].sort();
        }

        partSelect.innerHTML = '<option value="">-- 사출명 선택 --</option>' +
            partNames.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    function onModalPartChange() {
        const carModel = document.getElementById('addInvCarModel').value;
        const partName = document.getElementById('addInvPart').value;
        const supplierDisplay = document.getElementById('addInvSupplierDisplay');
        const supplierHidden  = document.getElementById('addInvSupplier');
        const stockArea = document.getElementById('addInvStockArea');

        const _type2 = document.getElementById('addInvType')?.value || '입고';
        if (!carModel || !partName) {
            if (supplierDisplay) supplierDisplay.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">사출명 선택 시 자동 표시</span>';
            if (supplierHidden)  supplierHidden.value = '';
            if (_type2 !== '출고') stockArea.style.display = 'none';
            return;
        }

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        const material = materials.find(m => m.carModel === carModel && m.injPartName === partName);

        const supplierText = (material && material.supplier) ? material.supplier : '-';
        if (supplierDisplay) {
            supplierDisplay.innerHTML = `<strong style="color:var(--text-primary);">${supplierText}</strong>`;
        }
        if (supplierHidden) supplierHidden.value = supplierText;

        // 단위 갱신
        const unitEl = document.getElementById('addInvUnit');
        if (unitEl && material && material.unit) unitEl.value = material.unit;

        // 사출자재 마스터 injColor 기준으로 컬러 옵션 갱신 (사출명 확정 후)
        _updateColorOptions(carModel, partName);

        // 재고 계산 및 표시 (컬러 자동선택·수동선택 후)
        onModalColorChange();
    }

    function onLotItemSelect(lot, qty) {
        const container = document.getElementById('invLotRows');
        if (!container) return;
        const lotNo = lot === '무표기' ? '' : lot;

        // 이미 같은 LOT 행이 있으면 해당 행 포커스
        const existingRows = container.querySelectorAll('.inv-lot-row');
        for (const row of existingRows) {
            const lotInput = row.querySelector('.inv-lot-no');
            if (lotInput && lotInput.value === lotNo) {
                const qtyInput = row.querySelector('.inv-lot-qty');
                if (qtyInput) {
                    qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                    qtyInput.focus();
                }
                UIUtils.toast(`LOT ${lot} 행에 수량을 입력하세요 (가용: ${qty.toLocaleString()} EA)`, 'info');
                return;
            }
        }

        // 빈 LOT 행이 있으면 채우기, 없으면 새 행 추가
        let filled = false;
        for (const row of existingRows) {
            const lotInput = row.querySelector('.inv-lot-no');
            const qtyInput = row.querySelector('.inv-lot-qty');
            if (lotInput && !lotInput.value.trim()) {
                lotInput.value = lotNo;
                if (qtyInput) {
                    qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                    qtyInput.focus();
                }
                filled = true;
                break;
            }
        }
        if (!filled) {
            addInvLotRow();
            const rows = container.querySelectorAll('.inv-lot-row');
            const lastRow = rows[rows.length - 1];
            const lotInput = lastRow.querySelector('.inv-lot-no');
            const qtyInput = lastRow.querySelector('.inv-lot-qty');
            if (lotInput) lotInput.value = lotNo;
            if (qtyInput) {
                qtyInput.placeholder = `최대 ${qty.toLocaleString()}`;
                qtyInput.focus();
            }
        }
        UIUtils.toast(`LOT ${lot} 선택됨 (가용: ${qty.toLocaleString()} EA) — 수량을 입력하세요`, 'info');
        setTimeout(function() {
            const rows = container.querySelectorAll('.inv-lot-row');
            const targetRow = rows[rows.length - 1];
            if (targetRow) checkInvFifoWarning(targetRow);
        }, 50);
    }

    // 컬러 변경 → LOT 재고 목록 갱신 + 도착 라인 자동 선택
    function onModalColorChange() {
        const carModel = (document.getElementById('addInvCarModel') || {}).value || '';
        const partName = (document.getElementById('addInvPart') || {}).value || '';
        if (carModel && partName) updateLotStockList(carModel, partName);
        _syncAddInvPaintLineFromMaster();
    }

    function _syncAddInvPaintLineFromMaster() {
        const type = (document.getElementById('addInvType') || {}).value || '';
        if (type !== '출고') return;
        const isReturn = !!(document.getElementById('outTypeReturn') || {}).checked;
        if (isReturn) return;
        const carModel = (document.getElementById('addInvCarModel') || {}).value || '';
        const partName = (document.getElementById('addInvPart') || {}).value || '';
        const color = (document.getElementById('addInvColor') || {}).value || '';
        if (!carModel || !partName) return;
        const inferred = _inferPaintLineFromMaster(carModel, partName, color);
        _applyPaintLineRadio('addInvPaintLine', inferred.line, 'addInvPaintLineHint');
    }

    // 출고 구분 변경 → 반출 사유 표시/숨김
    function onOutTypeChange() {
        const isReturn = document.getElementById('outTypeReturn')?.checked;
        const reasonGroup = document.getElementById('returnReasonGroup');
        const paintGroup = document.getElementById('addInvPaintLineGroup');
        if (reasonGroup) reasonGroup.style.display = isReturn ? '' : 'none';
        if (paintGroup) paintGroup.style.display = isReturn ? 'none' : '';
        if (!isReturn) {
            const reasonInput = document.getElementById('returnReasonInput');
            if (reasonInput) reasonInput.value = '';
            _syncAddInvPaintLineFromMaster();
        }
    }

    function _decorateInvModalStockArea() {
        const stockDisplay = document.getElementById('addInvCurrentStock');
        const lotRowsWrap = document.getElementById('invLotRows');
        if (stockDisplay) {
            stockDisplay.style.fontSize = '0.98rem';
            stockDisplay.style.fontWeight = '600';
            if (!stockDisplay.style.color || stockDisplay.style.color === 'var(--accent-blue)') {
                stockDisplay.style.color = 'var(--text-secondary)';
            }
        }
        if (lotRowsWrap && lotRowsWrap.parentElement) {
            lotRowsWrap.parentElement.style.background = 'rgba(37,99,235,0.04)';
            lotRowsWrap.parentElement.style.border = '1px solid rgba(37,99,235,0.24)';
            lotRowsWrap.parentElement.style.borderRadius = '10px';
        }
    }

    function updateLotStockList(carModel, partName) {
        const stockArea = document.getElementById('addInvStockArea');
        const stockDisplay = document.getElementById('addInvCurrentStock');
        const lotList = document.getElementById('lotStockList');
        const typeEl = document.getElementById('addInvType');
        const type = typeEl ? typeEl.value : '입고';
        const color = (document.getElementById('addInvColor') || {}).value || '';

        if (!color) {
            _decorateInvModalStockArea();
            if (stockDisplay) {
                stockDisplay.textContent = '—';
                stockDisplay.style.color = 'var(--text-muted)';
            }
            if (lotList) {
                lotList.innerHTML = '<div style="padding:10px; color:var(--text-muted); text-align:center; font-size:0.8rem;">사출 컬러를 선택하면 LOT 재고가 표시됩니다.</div>';
            }
            if (stockArea) stockArea.style.display = 'block';
            return;
        }

        const { balance, lots: displayLots } = _getLotBalancesForProduct(carModel, partName, color);
        const totalQty = balance.total;

        _decorateInvModalStockArea();

        if (stockDisplay) {
            stockDisplay.textContent = UIUtils.formatNumber(totalQty) + ' EA';
            stockDisplay.style.color = (type === '출고' && totalQty <= 0) ? 'var(--accent-red)' : 'var(--text-secondary)';
        }

        if (lotList) {
            let html = '';
            if (balance.unmatched > 0) {
                html += `<div style="padding:8px 12px;font-size:0.78rem;color:var(--accent-red);border-bottom:1px solid var(--border);">
                    ⚠ 과다 출고 ${UIUtils.formatNumber(balance.unmatched)} EA — LOT 합계와 총 재고가 다를 수 있습니다. 입출고 이력을 확인하세요.
                </div>`;
            }
            if (!displayLots.length) {
                html += '<div style="padding:10px; color:var(--text-muted); text-align:center; font-size:0.8rem;">기존 재고 기록이 없습니다.</div>';
            } else {
                const fifoOrdered = type === '출고'
                    ? displayLots.slice().sort(function(a, b) {
                        return (a.date || '').localeCompare(b.date || '') || String(a.lotNo).localeCompare(String(b.lotNo));
                    })
                    : displayLots;
                html += fifoOrdered.map(function(item, idx) {
                    const lotEsc = String(item.lotNo || '').replace(/'/g, "\\'");
                    const isSelectable = type === '출고';
                    const cursor = isSelectable ? 'cursor:pointer;' : 'cursor:default;';
                    const hover = isSelectable ? 'onmouseover="this.style.background=\'var(--bg-secondary)\'" onmouseout="this.style.background=\'white\'"' : '';
                    const click = isSelectable ? `onclick="InjectionWarehouseModule.onLotItemSelect('${lotEsc}', ${item.qty})"` : '';
                    const dateHint = item.date ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">${item.date}</span>` : '';
                    const fifoBadge = (type === '출고' && idx === 0)
                        ? '<span style="font-size:0.65rem;background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 5px;margin-left:6px;font-weight:700;">FIFO</span>'
                        : '';
                    return `
                        <div ${click} ${hover} style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border); ${cursor} font-size:0.82rem;">
                            <span style="font-weight:600;">LOT: ${item.lotNo}${fifoBadge}${dateHint}</span>
                            <span style="color:var(--accent-blue); font-weight:700;">${UIUtils.formatNumber(item.qty)} EA</span>
                        </div>`;
                }).join('');
            }
            lotList.innerHTML = html;
        }

        if (stockArea) stockArea.style.display = 'block';
    }

    function addInvLotRow() {
        const container = document.getElementById('invLotRows');
        if (!container) return;
        _decorateInvModalStockArea();
        const div = document.createElement('div');
        div.className = 'inv-lot-row';
        div.style.cssText = 'display:grid; grid-template-columns:200px 1fr 34px; gap:8px; align-items:center; margin-bottom:8px; padding:8px 10px; border:1px solid rgba(37,99,235,0.18); border-radius:10px; background:#fff; box-shadow:0 1px 3px rgba(37,99,235,0.06);';
        div.innerHTML = '<input type="text" class="form-input inv-lot-no" placeholder="YYMMDD (필수)" maxlength="6" required'
            + ' style="font-family:monospace; letter-spacing:1px; font-weight:800; font-size:1rem; color:var(--text-primary); background:rgba(37,99,235,0.04);"'
            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); this.style.borderColor=this.value?\'\':\'\' ; InjectionWarehouseModule.checkInvFifoWarning(this.closest(\'.inv-lot-row\'));">'
            + '<input type="number" class="form-input inv-lot-qty" min="1" placeholder="수량 (필수)" required'
            + ' style="text-align:right; font-weight:800; font-size:1rem; color:var(--accent-blue); background:rgba(37,99,235,0.04);"'
            + ' oninput="InjectionWarehouseModule.calcInvLotTotal()">'
            + '<button type="button" onclick="InjectionWarehouseModule.removeInvLotRow(this)"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
            + '</button>'
            + '<div class="inv-fifo-warn" style="display:none;grid-column:1 / -1;margin-top:2px;padding:8px 10px;border-radius:8px;border:1px solid rgba(245,158,11,0.55);background:#fffbeb;font-size:0.78rem;color:#b45309;">'
            + '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;"><span class="material-symbols-outlined" style="font-size:16px;">warning</span>'
            + '<span class="inv-fifo-warn-msg"></span></div>'
            + '<div style="display:flex;align-items:center;gap:8px;"><label style="font-size:0.74rem;white-space:nowrap;font-weight:700;">미준수 사유 <span style="color:var(--accent-red);">*</span></label>'
            + _invFifoReasonSelectHtml()
            + '</div></div>';
        container.appendChild(div);
    }

    function _legacyAddInvLotRow() {
        const container = document.getElementById('invLotRows');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'inv-lot-row';
        div.style.cssText = 'display:grid; grid-template-columns:200px 1fr 34px; gap:8px; align-items:center; margin-bottom:6px;';
        div.innerHTML = '<input type="text" class="form-input inv-lot-no" placeholder="YYMMDD (필수)" maxlength="6" required'
            + ' style="font-family:monospace; letter-spacing:1px;"'
            + ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); this.style.borderColor=this.value?\'\':\'\' ;">'
            + '<input type="number" class="form-input inv-lot-qty" min="1" placeholder="수량 (필수)" required'
            + ' style="text-align:right;"'
            + ' oninput="InjectionWarehouseModule.calcInvLotTotal()">'
            + '<button type="button" onclick="InjectionWarehouseModule.removeInvLotRow(this)"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--accent-red);padding:4px;display:flex;align-items:center;justify-content:center;" title="행 삭제">'
            + '<span class="material-symbols-outlined" style="font-size:1.2rem;">remove_circle</span>'
            + '</button>';
        container.appendChild(div);
    }

    function removeInvLotRow(btn) {
        const row = btn.closest('.inv-lot-row');
        if (!row) return;
        const container = document.getElementById('invLotRows');
        if (container && container.querySelectorAll('.inv-lot-row').length <= 1) {
            UIUtils.toast('최소 1개의 LOT 행이 필요합니다.', 'warning');
            return;
        }
        row.remove();
        calcInvLotTotal();
    }

    function calcInvLotTotal() {
        const qtyInputs = document.querySelectorAll('#invLotRows .inv-lot-qty');
        let total = 0;
        qtyInputs.forEach(function(inp) { total += (Number(inp.value) || 0); });
        const totalEl = document.getElementById('invLotTotalQty');
        if (totalEl) totalEl.textContent = UIUtils.formatNumber(total);
        const hiddenEl = document.getElementById('addInvQty');
        if (hiddenEl) hiddenEl.value = total;
        checkAllInvFifoWarnings();
    }

    function _escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function _normalizeText(value) {
        return String(value ?? '').replace(/\u00a0/g, ' ').trim();
    }

    function _parseQty(value) {
        const text = _normalizeText(value);
        if (!text || text === '-' || text === '－') return 0;
        const cleaned = text.replace(/,/g, '').replace(/[^\d.-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function _isQtyCell(value) {
        const text = _normalizeText(value);
        if (!text || text === '-' || text === '－') return true;
        return /^-?[\d,]+(\.\d+)?$/.test(text);
    }

    function _splitClipboardRows(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.split('\t').map(_normalizeText))
            .filter(row => row.some(Boolean));
    }

    function _parseBulkSimpleTable(rows) {
        if (!rows.length) return [];
        const header = rows[0].map(h => h.replace(/\s/g, '').toLowerCase());
        const aliases = {
            carModel: ['차종', '모델', 'carmodel'],
            partName: ['품명', '사출품명', '부품명', '자재명', 'partname'],
            color: ['컬러', '색상', 'color'],
            quantity: ['수량', '현재고', '재고', 'qty', 'quantity']
        };
        const findIdx = names => header.findIndex(h => names.some(n => h.includes(n.toLowerCase())));
        const idx = {
            carModel: findIdx(aliases.carModel),
            partName: findIdx(aliases.partName),
            color: findIdx(aliases.color),
            quantity: findIdx(aliases.quantity)
        };
        if (idx.partName < 0 || idx.quantity < 0) {
            return rows
                .filter(row => row.length >= 4)
                .map(row => ({
                    carModel: row[0] || '',
                    partName: row[1] || '',
                    color: row[2] || '',
                    quantity: _parseQty(row[3])
                }))
                .filter(r => r.carModel && r.partName && r.color);
        }

        return rows.slice(1).map(row => ({
            carModel: idx.carModel >= 0 ? row[idx.carModel] : '',
            partName: row[idx.partName] || '',
            color: idx.color >= 0 ? row[idx.color] : '',
            quantity: _parseQty(row[idx.quantity])
        })).filter(r => r.partName);
    }

    function _looksLikeWideHeader(rows, r, c) {
        const cell = _normalizeText(rows[r]?.[c]);
        if (!cell || _isQtyCell(cell)) return false;
        const right = _normalizeText(rows[r]?.[c + 1]);
        if (right && _isQtyCell(right)) return false;
        const headerRow = rows[r] || [];
        const colorHeaderCount = headerRow
            .slice(c + 1)
            .filter(v => {
                const text = _normalizeText(v);
                return text && !_isQtyCell(text);
            }).length;
        if (colorHeaderCount === 0) return false;
        const maxCol = Math.min((rows[r] || []).length - 1, c + 4);
        for (let rr = r + 1; rr < Math.min(rows.length, r + 12); rr++) {
            const part = _normalizeText(rows[rr]?.[c]);
            if (!part || _isQtyCell(part)) continue;
            for (let cc = c + 1; cc <= maxCol; cc++) {
                const qty = _normalizeText(rows[rr]?.[cc]);
                if (qty && _isQtyCell(qty)) return true;
            }
        }
        return false;
    }

    function _parseBulkWideLayout(rows) {
        const result = [];
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                if (!_looksLikeWideHeader(rows, r, c)) continue;

                const carModel = _normalizeText(row[c]);
                let nextHeaderCol = row.length;
                for (let nc = c + 1; nc < row.length; nc++) {
                    if (_looksLikeWideHeader(rows, r, nc)) {
                        nextHeaderCol = nc;
                        break;
                    }
                }

                let nextHeaderRow = rows.length;
                for (let nr = r + 1; nr < rows.length; nr++) {
                    if (_looksLikeWideHeader(rows, nr, c)) {
                        nextHeaderRow = nr;
                        break;
                    }
                }

                const colorCols = [];
                for (let cc = c + 1; cc < nextHeaderCol; cc++) {
                    const color = _normalizeText(row[cc]);
                    let hasQty = false;
                    for (let rr = r + 1; rr < nextHeaderRow; rr++) {
                        const qtyText = _normalizeText(rows[rr]?.[cc]);
                        if (qtyText && _isQtyCell(qtyText)) {
                            hasQty = true;
                            break;
                        }
                    }
                    if (hasQty) colorCols.push({ col: cc, color });
                }
                if (!colorCols.length) continue;

                for (let rr = r + 1; rr < nextHeaderRow; rr++) {
                    if (_looksLikeWideHeader(rows, rr, c)) break;
                    const partName = _normalizeText(rows[rr]?.[c]);
                    if (!partName || _isQtyCell(partName)) continue;
                    colorCols.forEach(info => {
                        const rawQty = _normalizeText(rows[rr]?.[info.col]);
                        if (!rawQty) return;
                        result.push({
                            carModel,
                            partName,
                            color: info.color,
                            quantity: _parseQty(rawQty)
                        });
                    });
                }
            }
        }

        const merged = new Map();
        result.forEach(row => {
            if (!row.carModel || !row.partName) return;
            const key = `${row.carModel}||${row.partName}||${row.color || ''}`;
            merged.set(key, row);
        });
        return Array.from(merged.values());
    }

    function _parseBulkPasteText(text) {
        const rows = _splitClipboardRows(text);
        const simpleRows = _parseBulkSimpleTable(rows);
        const parsed = simpleRows.length ? simpleRows : _parseBulkWideLayout(rows);
        return parsed
            .map(r => ({
                carModel: _normalizeText(r.carModel),
                partName: _normalizeText(r.partName),
                color: _normalizeText(r.color),
                quantity: Math.max(0, Math.round(Number(r.quantity) || 0))
            }))
            .filter(r => r.carModel && r.partName);
    }

    function _filterProductRecords(carModel, partName, color) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const normColor = _resolveMasterColor(carModel, partName, color, materials);
        return (Storage.getAll(STORE) || []).filter(function(d) {
            if ((d.carModel || '') !== carModel) return false;
            if ((d.partName || '') !== partName) return false;
            if (!normColor) return true;
            const recColor = _resolveMasterColor(carModel, partName, d.color, materials);
            if (d.type === '출고') {
                return !recColor || _colorsMatch(recColor, normColor);
            }
            return _colorsMatch(recColor, normColor);
        });
    }

    function _getLotBalancesForProduct(carModel, partName, color) {
        const records = _filterProductRecords(carModel, partName, color);
        const result = StockDetailUI.lotBalancesFromRecords(records, { positiveOnly: true });
        // 출고 모달·상세 모달·FIFO 모두 동일 정렬(입고일 최신순)
        result.lots.sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '') || String(a.lotNo).localeCompare(String(b.lotNo));
        });
        return { balance: result.balance, lots: result.lots, records: records };
    }

    function _normInvLotNo(lotNo) {
        const s = String(lotNo || '').trim();
        return s || '무표기';
    }

    function _getFifoOrderedLots(carModel, partName, color) {
        const { lots } = _getLotBalancesForProduct(carModel, partName, color);
        return lots.slice().sort(function(a, b) {
            return (a.date || '').localeCompare(b.date || '') || String(a.lotNo).localeCompare(String(b.lotNo));
        });
    }

    function _getPendingOutgoingByLot(carModel, partName, color, excludeKeys) {
        const map = {};
        (_injOutListupRows || []).forEach(function(r) {
            if (r.carModel !== carModel || r.partName !== partName || (r.color || '') !== (color || '')) return;
            if (excludeKeys && excludeKeys.has(r.key)) return;
            const lot = _normInvLotNo(r.lotNo);
            map[lot] = (map[lot] || 0) + (Number(r.qty) || 0);
        });
        return map;
    }

    function _getNextFifoLot(carModel, partName, color, excludeListupKeys) {
        const pending = _getPendingOutgoingByLot(carModel, partName, color, excludeListupKeys);
        const ordered = _getFifoOrderedLots(carModel, partName, color);
        for (let i = 0; i < ordered.length; i++) {
            const lot = _normInvLotNo(ordered[i].lotNo);
            const eff = Math.max(0, (Number(ordered[i].qty) || 0) - (pending[lot] || 0));
            if (eff > 0) return { lotNo: lot, qty: eff, date: ordered[i].date || '' };
        }
        return null;
    }

    function _analyzeFifoViolations(carModel, partName, color, allocations, excludeListupKeys) {
        const fifoOrdered = _getFifoOrderedLots(carModel, partName, color);
        if (!fifoOrdered.length) return { violated: false, violatingLots: [], message: '' };

        const listupPending = _getPendingOutgoingByLot(carModel, partName, color, excludeListupKeys);
        const stock = {};
        fifoOrdered.forEach(function(l) {
            stock[_normInvLotNo(l.lotNo)] = Number(l.qty) || 0;
        });
        Object.keys(listupPending).forEach(function(lot) {
            stock[lot] = Math.max(0, (stock[lot] || 0) - listupPending[lot]);
        });

        const allocMap = {};
        (allocations || []).forEach(function(a) {
            const k = _normInvLotNo(a.lotNo);
            allocMap[k] = (allocMap[k] || 0) + (Number(a.qty) || 0);
        });

        const violatingLots = [];
        let message = '';

        for (let i = 0; i < fifoOrdered.length; i++) {
            const k = _normInvLotNo(fifoOrdered[i].lotNo);
            const available = stock[k] || 0;
            const requested = allocMap[k] || 0;
            if (requested > available) {
                return {
                    violated: true,
                    violatingLots: [k],
                    oldestBlockingLot: k,
                    message: 'LOT ' + k + ' 가용 재고(' + UIUtils.formatNumber(available) + ' EA)를 초과했습니다.'
                };
            }
            const remainingAfterAlloc = available - requested;
            if (remainingAfterAlloc > 0) {
                for (let j = i + 1; j < fifoOrdered.length; j++) {
                    const newerK = _normInvLotNo(fifoOrdered[j].lotNo);
                    if ((allocMap[newerK] || 0) > 0) {
                        if (violatingLots.indexOf(newerK) < 0) violatingLots.push(newerK);
                        message = '선입선출 위반 — LOT ' + k + ' 재고(' + UIUtils.formatNumber(remainingAfterAlloc) + ' EA 잔량)가 먼저 소진되어야 합니다.';
                    }
                }
            }
        }

        return {
            violated: violatingLots.length > 0,
            violatingLots: violatingLots,
            oldestBlockingLot: violatingLots.length ? null : null,
            message: message
        };
    }

    function _invFifoReasonSelectHtml() {
        const options = [
            ['자재 불량', '자재 불량 (이전 LOT 사용 불가)'],
            ['자재수량 부족', '자재수량 부족 (이전 LOT 잔량 부족)'],
            ['색상 불일치', '색상 불일치'],
            ['긴급 생산', '긴급 생산 지시'],
            ['기타', '기타 (비고 입력)']
        ];
        return '<select class="form-select inv-fifo-reason" style="font-size:0.8rem;flex:1;border-color:rgba(245,158,11,0.7);background:#fffbeb;">' +
            '<option value="">-- 사유 선택 필수 --</option>' +
            options.map(function(pair) {
                return '<option value="' + _escapeHtml(pair[0]) + '">' + _escapeHtml(pair[1]) + '</option>';
            }).join('') +
            '</select>';
    }

    function _collectInvLotAllocations() {
        const allocations = [];
        document.querySelectorAll('#invLotRows .inv-lot-row').forEach(function(row) {
            const lotNo = ((row.querySelector('.inv-lot-no') || {}).value || '').trim();
            const qty = Number((row.querySelector('.inv-lot-qty') || {}).value) || 0;
            if (lotNo && qty > 0) allocations.push({ lotNo: lotNo, qty: qty });
        });
        return allocations;
    }

    function checkInvFifoWarning(row) {
        const type = (document.getElementById('addInvType') || {}).value;
        const warnEl = row ? row.querySelector('.inv-fifo-warn') : null;
        if (!warnEl || type !== '출고') {
            if (warnEl) warnEl.style.display = 'none';
            return false;
        }
        const msgEl = row.querySelector('.inv-fifo-warn-msg');
        const carModel = (document.getElementById('addInvCarModel') || {}).value || '';
        const partName = (document.getElementById('addInvPart') || {}).value || '';
        const color = (document.getElementById('addInvColor') || {}).value || '';
        const lotNo = ((row.querySelector('.inv-lot-no') || {}).value || '').trim();
        const qty = Number((row.querySelector('.inv-lot-qty') || {}).value) || 0;

        if (!carModel || !partName || !color || !lotNo || qty <= 0) {
            warnEl.style.display = 'none';
            return false;
        }

        const allocs = _collectInvLotAllocations();
        const analysis = _analyzeFifoViolations(carModel, partName, color, allocs, null);
        const lotKey = _normInvLotNo(lotNo);
        const isViolating = analysis.violated && analysis.violatingLots.indexOf(lotKey) >= 0;

        if (!isViolating) {
            warnEl.style.display = 'none';
            return false;
        }
        if (msgEl) msgEl.textContent = analysis.message || ('선입선출 위반 — 더 오래된 LOT를 먼저 출고해야 합니다.');
        warnEl.style.display = 'block';
        return true;
    }

    function checkAllInvFifoWarnings() {
        document.querySelectorAll('#invLotRows .inv-lot-row').forEach(function(row) {
            checkInvFifoWarning(row);
        });
    }

    function _getCurrentStockMap() {
        return _calcStockMap();
    }

    function _findInjectionMaterial(carModel, partName, color) {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const resolved = _resolveMasterColor(carModel, partName, color, materials);
        return materials.find(m =>
            (m.carModel || '') === carModel &&
            (m.injPartName || '') === partName &&
            (!resolved || _splitMasterColors(m).some(mc => _colorsMatch(mc, resolved)))
        ) || materials.find(m =>
            (m.carModel || '') === carModel &&
            (m.injPartName || '') === partName &&
            !_splitMasterColors(m).length
        ) || null;
    }

    function _isProductMasterName(carModel, partName) {
        const target = (partName || '').trim();
        if (!target) return false;
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return products.some(p => {
            const productName = ((p.partName || p.name || '') + '').trim();
            return productName === target && (!carModel || !p.carModel || p.carModel === carModel);
        });
    }

    function _isAdminUser() {
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return false;
        const user = AuthModule.getCurrentUser();
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (Array.isArray(user.roles) && user.roles.indexOf('admin') >= 0) return true;
        return false;
    }

    function _canManageStockData() {
        if (_isAdminUser()) return true;
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function') {
                return AuthModule.canWritePage('injection-warehouse');
            }
        } catch (e) { /* 무시 */ }
        return false;
    }

    /** DB에 BK 등 별칭 컬러 입출고가 있으면 타일에 별도 행으로 노출 */
    function _injectAliasOrphanTiles(mergedMap, materials, data) {
        const inv = data || Storage.getAll(STORE) || [];
        const mats = materials || Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const seen = new Set();

        inv.forEach(function(d) {
            if (!_isAliasOnlyMismatch(d, mats)) return;
            const carModel = _normKeyStr(d.carModel);
            const partName = _normKeyStr(d.partName);
            const color = _normKeyStr(d.color);
            if (!partName || !color) return;
            const key = `${carModel}||${partName}||${color}`;
            if (seen.has(key)) return;
            seen.add(key);

            const records = inv.filter(function(r) {
                return _normKeyStr(r.carModel) === carModel &&
                    _normKeyStr(r.partName) === partName &&
                    _normKeyStr(r.color) === color;
            });
            const mat = _findInjectionMaterial(carModel, partName, color);
            const bal = InvCalc.lotBalances(records);
            mergedMap[key] = {
                carModel: carModel,
                partName: partName,
                color: color,
                stock: bal.total,
                unmatched: bal.unmatched || 0,
                price: Number(mat ? mat.unitPrice : 0) || 0,
                isAliasOrphan: true
            };
        });
    }

    // 사출 LOT 수량 보정 권한: "수량 보정"(adjust) 또는 입력(write) 보유자.
    // 물류작업자는 입력 없이 수량 보정만 갖는 경우가 많으므로 adjust를 우선 인정한다.
    function _canEditWarehouseLot() {
        try {
            if (_isAdminUser()) return true;
            if (typeof AuthModule !== 'undefined') {
                if (typeof AuthModule.canAdjustPage === 'function') {
                    if (AuthModule.canAdjustPage('injection-warehouse') ||
                        AuthModule.canAdjustPage('warehouse-overview')) return true;
                }
                if (typeof AuthModule.canWritePage === 'function') {
                    if (AuthModule.canWritePage('injection-warehouse')) return true;
                }
            }
        } catch (e) { /* 무시 */ }
        return false;
    }

    function _requireBulkAdmin(onPass) {
        if (_canManageStockData()) {
            onPass();
            return;
        }
        const user = typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser ? AuthModule.getCurrentUser() : null;
        if (!user && typeof AuthModule !== 'undefined' && AuthModule.showLoginModal) {
            AuthModule.showLoginModal(function() { _requireBulkAdmin(onPass); });
            return;
        }
        UIUtils.toast('사출 창고 입력 권한이 있는 사용자만 일괄 등록·수정할 수 있습니다.', 'warning');
    }

    function _canEditReservedPlan() {
        if (_isAdminUser()) return true;
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function') {
                return AuthModule.canWritePage('production-plan') || AuthModule.canWritePage('injection-warehouse');
            }
        } catch (e) { /* 무시 */ }
        return false;
    }

    function openBulkPasteModal() {
        _requireBulkAdmin(_showBulkPasteModal);
    }

    function _showBulkPasteModal() {
        window._injBulkRows = [];
        UIUtils.showModal('사출 창고 재고 일괄 등록/수정', `
            <div style="background:var(--bg-secondary);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.84rem;line-height:1.7;">
                <div style="font-weight:700;margin-bottom:4px;">엑셀 표를 그대로 복사해 붙여넣으세요.</div>
                <div style="color:var(--text-secondary);">
                    권장 양식은 <strong>첫 줄: 차종 + 컬러</strong>, <strong>아래 줄: 품명 + 컬러별 현재고</strong>입니다.
                    빈 칸은 무시하고, <strong>-</strong>는 0 재고로 인식합니다.
                    단순 표는 <strong>차종, 품명, 컬러, 수량</strong> 헤더로 붙여넣으면 됩니다.
                </div>
                <div style="margin-top:8px;padding:8px 10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;font-family:Consolas,monospace;font-size:0.78rem;line-height:1.45;color:var(--text-secondary);">
                    GOLF-7&nbsp;&nbsp;&nbsp;&nbsp;WHITE&nbsp;&nbsp;&nbsp;&nbsp;GRAY<br>
                    DOOR KNOB&nbsp;&nbsp;6,600&nbsp;&nbsp;&nbsp;&nbsp;5,400<br>
                    REAR KNOB&nbsp;&nbsp;5,700&nbsp;&nbsp;&nbsp;&nbsp;6,000
                </div>
            </div>
            <textarea id="injBulkPasteText" class="form-textarea" rows="9"
                placeholder="엑셀 범위 선택 → Ctrl+C → 여기에 Ctrl+V"
                style="font-family:Consolas,monospace;font-size:0.82rem;resize:vertical;"
                oninput="InjectionWarehouseModule.handleBulkPasteInput()"></textarea>
            <div style="display:flex;gap:14px;align-items:center;margin:10px 0 12px;">
                <label style="display:flex;align-items:center;gap:7px;font-size:0.86rem;cursor:pointer;">
                    <input type="checkbox" id="injBulkCreateMaterial">
                    사출자재 마스터에 없는 품목 자동 생성
                </label>
                <span style="color:var(--text-muted);font-size:0.78rem;">제품명은 사출자재로 자동 생성되지 않습니다. 저장은 현재고가 목표 수량이 되도록 차이만 보정합니다.</span>
            </div>
            <div id="injBulkPreview"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="injBulkConfirmBtn" style="display:none;"
                onclick="InjectionWarehouseModule.confirmBulkPaste()">
                <span class="material-symbols-outlined">save</span> 일괄 반영
            </button>
        `, 'xl');
    }

    function handleBulkPasteInput() {
        const text = (document.getElementById('injBulkPasteText') || {}).value || '';
        const rows = _parseBulkPasteText(text);
        window._injBulkRows = rows;
        _renderBulkPreview();
    }

    function _renderBulkPreview() {
        const box = document.getElementById('injBulkPreview');
        const btn = document.getElementById('injBulkConfirmBtn');
        if (!box || !btn) return;

        const rows = window._injBulkRows || [];
        if (!rows.length) {
            box.innerHTML = '<div style="padding:14px;color:var(--text-muted);border:1px dashed var(--border);border-radius:8px;text-align:center;">인식된 재고 데이터가 없습니다.</div>';
            btn.style.display = 'none';
            return;
        }

        const currentMap = _getCurrentStockMap();
        let changed = 0;
        const tableRows = rows.map((r, idx) => {
            const key = `${r.carModel}||${r.partName}||${r.color || ''}`;
            const current = (currentMap[key] || {}).stock || 0;
            const diff = r.quantity - current;
            if (diff !== 0) changed++;
            const diffColor = diff > 0 ? 'var(--accent-green)' : diff < 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            const diffLabel = diff > 0 ? `+${UIUtils.formatNumber(diff)}` : UIUtils.formatNumber(diff);
            return `
                <tr>
                    <td><input class="form-input inj-bulk-cell" value="${_escapeHtml(r.carModel)}" data-idx="${idx}" data-field="carModel"></td>
                    <td><input class="form-input inj-bulk-cell" value="${_escapeHtml(r.partName)}" data-idx="${idx}" data-field="partName"></td>
                    <td><input class="form-input inj-bulk-cell" value="${_escapeHtml(r.color)}" data-idx="${idx}" data-field="color"></td>
                    <td style="text-align:right;color:var(--text-muted);">${UIUtils.formatNumber(current)}</td>
                    <td><input type="number" min="0" class="form-input inj-bulk-cell" value="${r.quantity}" data-idx="${idx}" data-field="quantity" style="text-align:right;"></td>
                    <td style="text-align:right;font-weight:700;color:${diffColor};">${diffLabel}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.removeBulkPreviewRow(${idx})">제외</button>
                    </td>
                </tr>`;
        }).join('');

        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:0.85rem;">
                <span>인식 <strong>${rows.length}건</strong> / 보정 필요 <strong>${changed}건</strong></span>
                <span style="color:var(--text-muted);font-size:0.78rem;">미리보기 값은 바로 수정할 수 있습니다.</span>
            </div>
            <div class="data-table-wrapper" style="max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="min-width:110px;">차종</th>
                            <th style="min-width:180px;">품명</th>
                            <th style="min-width:100px;">컬러</th>
                            <th style="text-align:right;">현재고</th>
                            <th style="min-width:110px;text-align:right;">목표수량</th>
                            <th style="text-align:right;">보정</th>
                            <th style="text-align:center;">작업</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>`;
        box.querySelectorAll('.inj-bulk-cell').forEach(input => {
            input.addEventListener('input', function() {
                const idx = Number(this.dataset.idx);
                const field = this.dataset.field;
                if (!window._injBulkRows || !window._injBulkRows[idx]) return;
                window._injBulkRows[idx][field] = field === 'quantity'
                    ? Math.max(0, Math.round(Number(this.value) || 0))
                    : _normalizeText(this.value);
            });
            input.addEventListener('change', _renderBulkPreview);
        });
        btn.style.display = '';
    }

    function removeBulkPreviewRow(idx) {
        if (!window._injBulkRows) return;
        window._injBulkRows.splice(idx, 1);
        _renderBulkPreview();
    }

    async function confirmBulkPaste() {
        if (!_canManageStockData()) {
            UIUtils.toast('사출 창고 입력 권한이 있는 사용자만 일괄 등록·수정할 수 있습니다.', 'warning');
            return;
        }

        const rows = (window._injBulkRows || [])
            .map(r => ({
                carModel: _normalizeText(r.carModel),
                partName: _normalizeText(r.partName),
                color: _normalizeText(r.color),
                quantity: Math.max(0, Math.round(Number(r.quantity) || 0))
            }))
            .filter(r => r.carModel && r.partName);

        if (!rows.length) {
            UIUtils.toast('반영할 데이터가 없습니다.', 'warning');
            return;
        }

        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        rows.forEach(function(row) {
            row.color = _resolveMasterColor(row.carModel, row.partName, row.color, materials);
        });

        const createMissing = !!document.getElementById('injBulkCreateMaterial')?.checked;
        const productNameRows = rows.filter(row => !_findInjectionMaterial(row.carModel, row.partName, row.color) && _isProductMasterName(row.carModel, row.partName));
        if (productNameRows.length) {
            UIUtils.toast(`제품명으로 보이는 품목은 사출자재로 자동 생성할 수 없습니다: ${productNameRows.slice(0, 3).map(r => r.partName).join(', ')}`, 'error');
            return;
        }
        const currentMap = _getCurrentStockMap();
        const today = UIUtils.today ? UIUtils.today() : new Date().toISOString().slice(0, 10);
        const nowTime = new Date().toTimeString().slice(0, 5);
        // 'RST' 접두사 필수 — 순수 YYMMDD LOT은 같은 날짜의 진짜 생산 LOT과 형식이 겹쳐
        // (실사례: 260526/260615 배치가 무관한 수십 품목에 뒤섞이고, 이후 근거 레코드가 지워지면
        // 미차감(과다출고)만 영구히 남음) 반드시 구분되는 코드를 쓴다. RST\d+ 는 _isValidLotFormat()에서
        // 이미 "생산 LOT과 무관한 별도 용도"로 인정하는 형식이라 LOT 형식 오류로도 잡히지 않는다.
        const lotNo = 'RST' + today.slice(2).replace(/-/g, '') + nowTime.replace(':', '');
        let materialAdded = 0;
        let adjusted = 0;

        try {
            for (const row of rows) {
                let material = _findInjectionMaterial(row.carModel, row.partName, row.color);
                if (!material && createMissing) {
                    material = await Storage.add(DB.STORES.INJECTION_MATERIALS, {
                        carModel: row.carModel,
                        supplier: '',
                        injPartName: row.partName,
                        injColor: row.color,
                        unitPrice: 0,
                        unit: 'EA',
                        itemType: '사출품',
                        source: '사출 창고 재고 일괄 등록'
                    });
                    materialAdded++;
                }

                const key = `${row.carModel}||${row.partName}||${row.color || ''}`;
                const current = (currentMap[key] || {}).stock || 0;
                const diff = row.quantity - current;
                if (diff === 0) continue;

                await _addInventoryRecord({
                    date: `${today} ${nowTime}`,
                    type: diff > 0 ? '입고' : '출고',
                    carModel: row.carModel,
                    partName: row.partName,
                    color: row.color,
                    supplier: material ? (material.supplier || '') : '',
                    lots: [{ lotNo, qty: Math.abs(diff) }],
                    lotNo,
                    quantity: Math.abs(diff),
                    unit: 'EA',
                    source: `일괄 현재고 보정 (목표 ${row.quantity.toLocaleString()} EA)`,
                    injMaterialId: material ? material.id : undefined,
                    ..._actorFieldsForRecord(diff > 0 ? '입고' : '출고')
                });
                adjusted++;
            }

            UIUtils.closeModal();
            UIUtils.toast(`재고 보정 ${adjusted}건 완료${materialAdded ? ` / 사출자재 ${materialAdded}건 생성` : ''}`, 'success');
            loadData();
        } catch (e) {
            console.error('사출 창고 재고 일괄 반영 실패:', e);
            UIUtils.toast('일괄 반영 실패: ' + e.message, 'error');
        }
    }

    function _yymmddLotError(value) {
        const val = String(value == null ? '' : value).trim();
        if (!/^\d{6}$/.test(val)) return 'LOT번호는 YYMMDD 형식(6자리 숫자)으로 입력하세요.';
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        const yyNum = parseInt(val.slice(0, 2), 10);
        const fullYear = yyNum >= 50 ? 1900 + yyNum : 2000 + yyNum;
        const inputDate = new Date(fullYear, mm - 1, dd);
        if (inputDate.getFullYear() !== fullYear || inputDate.getMonth() !== mm - 1 || inputDate.getDate() !== dd) {
            return '유효하지 않은 날짜입니다. YYMMDD 형식으로 입력하세요.';
        }
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (inputDate > today) return '오늘 이후(미래)의 날짜는 LOT로 사용할 수 없습니다.';
        return null;
    }

    async function _applyStockErrorCorrection(carModel, partName, color, reason, targetQty, lotNo) {
        const target = Math.max(0, Math.round(Number(targetQty) || 0));
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const resolvedColor = _resolveMasterColor(carModel, partName, color, materials);
        const productItems = _filterProductRecords(carModel, partName, resolvedColor);
        const balance = InvCalc.lotBalances(productItems);
        const current = balance.total;
        if (current >= 0) return { skipped: true, reason: 'not_negative' };

        const diff = target - current;
        if (diff === 0) return { skipped: true, reason: 'no_change' };

        const lotErr = _yymmddLotError(lotNo);
        if (lotErr) throw new Error(lotErr);
        const normalizedLot = String(lotNo).trim();

        const material = _findInjectionMaterial(carModel, partName, color);
        const resetActor = _getResetActorFields();
        const record = {
            date: InvCalc.stampFor(new Date()),
            type: '입고',
            carModel: carModel,
            partName: partName,
            color: resolvedColor || color || '',
            supplier: material ? (material.supplier || '') : '',
            lots: [{ lotNo: normalizedLot, qty: Math.abs(diff) }],
            lotNo: normalizedLot,
            quantity: Math.abs(diff),
            unit: 'EA',
            source: '재고 오류 초기화',
            resetAction: 'stock_error_reset',
            resetReason: reason || '',
            note: `[재고 오류 초기화] ${reason || '사유 미기재'} · ${UIUtils.formatNumber(current)} EA → ${UIUtils.formatNumber(target)} EA`,
            injMaterialId: material ? material.id : undefined,
            isStockErrorReset: true,
            stockBefore: current,
            stockAfterTarget: target,
            unmatchedBefore: balance.unmatched || 0,
            ...resetActor
        };
        const added = await _addInventoryRecord(record);

        await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, {
            id: Storage.generateId(),
            type: 'injection_inventory_reset',
            typeLabel: '사출 창고 재고 오류 초기화',
            deletedAt: resetActor.resetAt,
            deletedBy: resetActor.resetBy,
            reason: reason,
            originalId: added && added.id ? added.id : undefined,
            originalData: {
                carModel: carModel,
                partName: partName,
                color: color || '',
                beforeStock: current,
                targetStock: target,
                correctionQty: Math.abs(diff),
                correctionType: record.type,
                unmatchedBefore: balance.unmatched || 0,
                stockAfter: record.stockAfter,
                correctionRecord: record
            },
            summary: `${carModel} / ${partName} ${color || ''} / ${UIUtils.formatNumber(current)} → ${UIUtils.formatNumber(target)} EA`
        });

        return { skipped: false, before: current, after: target, correctionQty: Math.abs(diff) };
    }

    function openResetStockErrorModal(carModelEnc, partNameEnc, colorEnc, currentStock) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 재고 오류를 초기화할 수 있습니다.', 'warning');
            return;
        }
        const carModel = decodeURIComponent(carModelEnc || '');
        const partName = decodeURIComponent(partNameEnc || '');
        const color = decodeURIComponent(colorEnc || '');
        const stock = Number(currentStock) || 0;
        if (stock >= 0) {
            UIUtils.toast('마이너스 재고가 아닙니다.', 'info');
            return;
        }

        UIUtils.showModal('재고 오류 초기화', `
            <div style="background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.2);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.86rem;line-height:1.6;">
                <div><strong>${_escapeHtml(carModel)}</strong> / <strong>${_escapeHtml(partName)}</strong>${color ? ` / <strong>${_escapeHtml(color)}</strong>` : ''}</div>
                <div style="margin-top:6px;">현재 재고: <strong style="color:var(--accent-red);">${UIUtils.formatNumber(stock)} EA</strong></div>
                <div style="color:var(--text-secondary);margin-top:6px;">보정 입고를 등록해 재고를 <strong>0 EA</strong>로 맞춥니다. LOT는 시스템이 자동으로 부여하며, 기존 입출고 기록은 삭제하지 않습니다.</div>
            </div>
            <div class="form-group">
                <label class="form-label">초기화 사유 <span style="color:var(--accent-red)">*</span></label>
                <textarea id="injStockResetReason" class="form-textarea" rows="3" placeholder="오류 원인 및 초기화 사유를 입력하세요"></textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:#dc2626;border-color:#dc2626;"
                onclick="InjectionWarehouseModule.confirmResetStockError('${carModelEnc}','${partNameEnc}','${colorEnc}')">
                초기화 실행
            </button>
        `, 'md');

        setTimeout(function() {
            const el = document.getElementById('injStockResetReason');
            if (el) el.focus();
        }, 100);
    }

    function openUnmatchedActionModal(carModelEnc, partNameEnc, colorEnc, action, unmatchedQty, stockQty, physicalLotSum) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 미차감을 처리할 수 있습니다.', 'warning');
            return;
        }
        const isAbsorb = action === 'absorb';
        if (!isAbsorb && action !== 'clear') {
            UIUtils.toast('잘못된 처리 유형입니다.', 'error');
            return;
        }
        const carModel = decodeURIComponent(carModelEnc || '');
        const partName = decodeURIComponent(partNameEnc || '');
        const color = decodeURIComponent(colorEnc || '');
        const unmatched = Math.max(0, Number(unmatchedQty) || 0);
        const stock = Number(stockQty) || 0;
        const lotSum = Number(physicalLotSum) || 0;
        if (unmatched <= 0) {
            UIUtils.toast('처리할 미차감이 없습니다.', 'info');
            return;
        }
        if (isAbsorb && lotSum < unmatched) {
            UIUtils.toast(
                `보유 LOT(${_fmtStockQty(lotSum)} EA)보다 미차감(${_fmtStockQty(unmatched)} EA)이 커서 반영할 수 없습니다. 리셋을 사용하세요.`,
                'warning'
            );
            return;
        }
        const title = isAbsorb ? '미차감 반영' : '미차감 리셋';
        const accent = isAbsorb ? '#b45309' : '#0369a1';
        const resultStock = stock;
        const explain = isAbsorb
            ? `보유 LOT에서 미차감 ${UIUtils.formatNumber(unmatched)} EA를 FIFO로 차감합니다.<br>
               · 표시 재고: <strong>${UIUtils.formatNumber(stock)}</strong> EA 유지<br>
               · LOT 잔량 합계: ${UIUtils.formatNumber(lotSum)} → <strong>${UIUtils.formatNumber(stock)}</strong> EA<br>
               · 실물보다 시스템이 높게 잡고 있을 때(과다 출고가 맞을 때) 선택하세요.`
            : `미차감 ${UIUtils.formatNumber(unmatched)} EA만 <strong>0</strong>으로 만듭니다.<br>
               · 표시 재고: <strong>${UIUtils.formatNumber(stock)}</strong> EA 유지 (이미 맞춘 재고 그대로)<br>
               · LOT 수량은 변경하지 않습니다.<br>
               · 현재 재고를 맞춘 뒤 미차감 표시만 지울 때 사용합니다.`;

        UIUtils.showModal(title, `
            <div style="background:${accent}12;border:1px solid ${accent}44;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.86rem;line-height:1.65;">
                <div><strong>${_escapeHtml(carModel)}</strong> / <strong>${_escapeHtml(partName)}</strong>${color ? ` / <strong>${_escapeHtml(color)}</strong>` : ''}</div>
                <div style="margin-top:8px;">${explain}</div>
                <div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--bg-primary);font-size:0.8rem;">
                    처리 후 예상 재고: <strong style="color:${accent};">${UIUtils.formatNumber(resultStock)} EA</strong>
                    · 미차감 <strong>0</strong>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">처리 사유 <span style="color:var(--accent-red)">*</span></label>
                <textarea id="injUnmatchedActionReason" class="form-textarea" rows="3"
                    placeholder="${isAbsorb ? '예: 과거 중복 출고 확인 — LOT에서 미차감분 반영' : '예: 과거 출고 오류로 판단 — 미차감만 리셋'}"></textarea>
            </div>
        `, `
            <button class="btn btn-secondary"
                onclick="UIUtils.closeModal();setTimeout(function(){InjectionWarehouseModule.showPartDetail(decodeURIComponent('${carModelEnc}'),decodeURIComponent('${partNameEnc}'),decodeURIComponent('${colorEnc}'));},80);">
                취소
            </button>
            <button class="btn btn-primary" style="background:${accent};border-color:${accent};"
                onclick="InjectionWarehouseModule.confirmUnmatchedAction('${carModelEnc}','${partNameEnc}','${colorEnc}','${action}')">
                ${isAbsorb ? '반영 실행' : '리셋 실행'}
            </button>
        `, 'md');

        setTimeout(function() {
            const el = document.getElementById('injUnmatchedActionReason');
            if (el) el.focus();
        }, 100);
    }

    async function confirmUnmatchedAction(carModelEnc, partNameEnc, colorEnc, action) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 미차감을 처리할 수 있습니다.', 'warning');
            return;
        }
        const isAbsorb = action === 'absorb';
        if (!isAbsorb && action !== 'clear') {
            UIUtils.toast('잘못된 처리 유형입니다.', 'error');
            return;
        }
        const reasonEl = document.getElementById('injUnmatchedActionReason');
        const reason = reasonEl ? reasonEl.value.trim() : '';
        if (!reason) {
            UIUtils.toast('처리 사유를 입력해주세요.', 'warning');
            if (reasonEl) reasonEl.focus();
            return;
        }

        const carModel = decodeURIComponent(carModelEnc || '');
        const partName = decodeURIComponent(partNameEnc || '');
        const color = decodeURIComponent(colorEnc || '');
        const records = _filterProductRecords(carModel, partName, color);
        const balance = InvCalc.lotBalances(records);
        const unmatched = balance.unmatched || 0;
        if (unmatched <= 0) {
            UIUtils.toast('처리할 미차감이 없습니다.', 'info');
            return;
        }

        const stockBefore = balance.total;
        const physicalLotSum = (balance.lots || [])
            .filter(function(l) { return l.lotNo !== InvCalc.UNMATCHED && (Number(l.qty) || 0) > 0; })
            .reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (isAbsorb && physicalLotSum < unmatched) {
            UIUtils.toast(
                `보유 LOT(${_fmtStockQty(physicalLotSum)} EA)보다 미차감(${_fmtStockQty(unmatched)} EA)이 커서 반영할 수 없습니다. 리셋을 사용하세요.`,
                'warning'
            );
            return;
        }
        const stockAfterTarget = stockBefore;
        const actor = _getResetActorFields();
        const nowStr = (UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '));
        const label = isAbsorb ? '미차감 반영' : '미차감 리셋';

        try {
            await _addInventoryRecord({
                date: nowStr,
                type: '보정',
                carModel: carModel,
                partName: partName,
                color: color || '',
                quantity: unmatched,
                unit: 'EA',
                lots: [],
                lotNo: '',
                source: label,
                unmatchedAction: action,
                resetReason: reason,
                note: `[${label}] ${reason} · 미차감 ${UIUtils.formatNumber(unmatched)} EA → 0 · 재고 ${UIUtils.formatNumber(stockBefore)} EA 유지`,
                unmatchedBefore: unmatched,
                stockBefore: stockBefore,
                stockAfterTarget: stockAfterTarget,
                ...actor
            });

            await Storage.add(DB.STORES.INSPECTION_DELETE_LOGS, {
                id: Storage.generateId(),
                type: isAbsorb ? 'injection_unmatched_absorb' : 'injection_unmatched_clear',
                typeLabel: '사출 창고 ' + label,
                deletedAt: actor.resetAt,
                deletedBy: actor.resetBy,
                reason: reason,
                originalData: {
                    carModel: carModel,
                    partName: partName,
                    color: color || '',
                    unmatchedBefore: unmatched,
                    stockBefore: stockBefore,
                    stockAfterTarget: stockAfterTarget,
                    action: action
                },
                summary: `${carModel} / ${partName} ${color || ''} / ${label} ${UIUtils.formatNumber(unmatched)} EA`
            });

            UIUtils.closeModal();
            UIUtils.toast(`${label} 완료 — 미차감 0 · 재고 ${_fmtStockQty(stockBefore)} EA 유지`, 'success');
            loadData();
            showPartDetail(carModel, partName, color);
        } catch (e) {
            console.error(label + ' 실패:', e);
            UIUtils.toast(label + ' 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    async function fixCorruptedQtyFields(carModelEnc, partNameEnc, colorEnc) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 수량 필드를 보정할 수 있습니다.', 'warning');
            return;
        }
        const carModel = decodeURIComponent(carModelEnc || '');
        const partName = decodeURIComponent(partNameEnc || '');
        const color = decodeURIComponent(colorEnc || '');
        const records = _filterProductRecords(carModel, partName, color);
        const corrupted = records.filter(function(r) { return InvCalc.isQtyCorrupted(r); });
        if (!corrupted.length) {
            UIUtils.toast('보정할 수량 필드 불일치가 없습니다.', 'info');
            return;
        }

        const lines = corrupted.slice(0, 5).map(function(r) {
            const lotSum = InvCalc.qtyOf(r);
            const declared = Number(r.quantity) || 0;
            return `· ${(r.date || '-')} ${(r.type || '')} LOT합 ${lotSum} / quantity ${declared}`;
        }).join('\n');
        const more = corrupted.length > 5 ? `\n… 외 ${corrupted.length - 5}건` : '';

        UIUtils.confirm(
            `수량 필드(quantity)가 LOT 합계와 다른 ${corrupted.length}건을 LOT 합계로 맞춥니다.\n` +
            `재고 계산은 이미 LOT 기준이라 표시 재고는 변하지 않고, 경고만 사라집니다.\n\n${lines}${more}`,
            async function() {
                try {
                    let fixed = 0;
                    for (let i = 0; i < corrupted.length; i++) {
                        const rec = corrupted[i];
                        const lotSum = InvCalc.qtyOf(rec);
                        await Storage.update(STORE, rec.id, { quantity: lotSum });
                        fixed += 1;
                    }
                    UIUtils.toast(`수량 필드 ${fixed}건을 LOT 합계에 맞췄습니다.`, 'success');
                    loadData();
                    showPartDetail(carModel, partName, color);
                } catch (e) {
                    console.error('수량 필드 보정 실패:', e);
                    UIUtils.toast('보정 실패: ' + (e && e.message ? e.message : e), 'error');
                }
            }
        );
    }

    // 재고 오류 초기화(보정 입고)에 자동으로 붙일 LOT — 사용자가 실물 없는 LOT 번호를
    // 직접 입력·검증할 필요가 없도록 시스템이 부여한다.
    // 'RST' 접두사 필수: 순수 YYMMDD(예: '260526')를 쓰면 같은 날짜에 생산된 진짜 LOT번호와
    // 형식이 완전히 같아져 재고 계산기(InvCalc)·입고 중복판정이 서로 다른 두 항목을 같은
    // LOT으로 오인한다(실사례: 일괄 현재고 보정이 이 방식으로 LOT을 만들어 무관한 품목 수십 건이
    // 뒤섞이고, 원본 입고가 삭제되면 미차감(과다출고)만 영구히 남는 문제가 발생함).
    // RST\d+ 형식은 _isValidLotFormat()에서 이미 "생산 LOT과 무관한 별도 용도"로 인정하는 규칙이라
    // LOT 형식 오류로도 잡히지 않는다.
    function _autoResetLot() {
        const today = UIUtils.today ? UIUtils.today() : new Date().toISOString().slice(0, 10);
        const nowTime = new Date().toTimeString().slice(0, 5).replace(':', '');
        return 'RST' + today.slice(2).replace(/-/g, '') + nowTime;
    }

    async function confirmResetStockError(carModelEnc, partNameEnc, colorEnc) {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 재고 오류를 초기화할 수 있습니다.', 'warning');
            return;
        }
        const lotNo = _autoResetLot();
        const reasonEl = document.getElementById('injStockResetReason');
        const reason = reasonEl ? reasonEl.value.trim() : '';
        if (!reason) {
            UIUtils.toast('초기화 사유를 입력해주세요.', 'warning');
            if (reasonEl) reasonEl.focus();
            return;
        }

        const carModel = decodeURIComponent(carModelEnc || '');
        const partName = decodeURIComponent(partNameEnc || '');
        const color = decodeURIComponent(colorEnc || '');

        try {
            const result = await _applyStockErrorCorrection(carModel, partName, color, reason, 0, lotNo);
            if (result.skipped) {
                UIUtils.toast(
                    result.reason === 'not_negative' ? '이미 마이너스 재고가 아닙니다.' : '변경할 내용이 없습니다.',
                    'info'
                );
                return;
            }
            UIUtils.closeModal();
            UIUtils.toast(`재고 오류 초기화 완료 (${UIUtils.formatNumber(result.before)} → 0 EA, LOT ${lotNo})`, 'success');
            loadData();
        } catch (e) {
            console.error('재고 오류 초기화 실패:', e);
            UIUtils.toast('초기화 실패: ' + e.message, 'error');
        }
    }

    function openBulkResetStockErrorsModal() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 재고 오류를 초기화할 수 있습니다.', 'warning');
            return;
        }

        const currentMap = _getCurrentStockMap();
        const items = Object.entries(currentMap)
            .filter(function(entry) { return (Number(entry[1] && entry[1].stock) || 0) < 0; })
            .map(function(entry) {
                const parts = entry[0].split('||');
                return {
                    carModel: parts[0] || '',
                    partName: parts[1] || '',
                    color: parts[2] || '',
                    stock: Number(entry[1] && entry[1].stock) || 0
                };
            })
            .sort(function(a, b) { return a.stock - b.stock; });

        if (!items.length) {
            UIUtils.toast('마이너스 재고 품목이 없습니다.', 'info');
            return;
        }

        window._injStockResetItems = items;
        UIUtils.showModal('재고 오류 일괄 초기화', `
            <div style="background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.2);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.86rem;line-height:1.6;">
                <div style="font-weight:700;margin-bottom:4px;">마이너스 재고 <span id="injBulkStockResetCount">${items.length}</span>건을 0 EA로 보정합니다.</div>
                <div style="color:var(--text-secondary);">각 품목에 보정 입고가 등록되며, 기존 입출고 기록은 삭제하지 않습니다. LOT는 시스템이 자동으로 부여합니다.</div>
            </div>
            <div class="form-group">
                <label class="form-label">초기화 사유 <span style="color:var(--accent-red)">*</span></label>
                <textarea id="injBulkStockResetReason" class="form-textarea" rows="3" placeholder="일괄 초기화 사유를 입력하세요"></textarea>
            </div>
            <div class="data-table-wrapper" style="max-height:320px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>차종</th>
                            <th>품명</th>
                            <th>컬러</th>
                            <th style="text-align:right;">현재고</th>
                            <th style="text-align:right;">초기화 후</th>
                            <th style="text-align:center;">작업</th>
                        </tr>
                    </thead>
                    <tbody id="injBulkStockResetBody"></tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="injBulkStockResetConfirmBtn" style="background:#dc2626;border-color:#dc2626;"
                onclick="InjectionWarehouseModule.confirmBulkResetStockErrors()">
                ${items.length}건 일괄 초기화
            </button>
        `, 'xl');

        _renderBulkResetPreviewTable();

        setTimeout(function() {
            const el = document.getElementById('injBulkStockResetReason');
            if (el) el.focus();
        }, 100);
    }

    function _renderBulkResetPreviewTable() {
        const items = window._injStockResetItems || [];
        const tbody = document.getElementById('injBulkStockResetBody');
        if (!tbody) return;
        if (!items.length) {
            UIUtils.closeModal();
            window._injStockResetItems = null;
            UIUtils.toast('초기화 대상이 없습니다.', 'info');
            return;
        }
        const countEl = document.getElementById('injBulkStockResetCount');
        if (countEl) countEl.textContent = String(items.length);
        const confirmBtn = document.getElementById('injBulkStockResetConfirmBtn');
        if (confirmBtn) confirmBtn.textContent = `${items.length}건 일괄 초기화`;

        tbody.innerHTML = items.map(function(item, idx) {
            return `
                <tr>
                    <td>${_escapeHtml(item.carModel)}</td>
                    <td>${_escapeHtml(item.partName)}</td>
                    <td>${_escapeHtml(item.color || '-')}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-red);">${UIUtils.formatNumber(item.stock)} EA</td>
                    <td style="text-align:right;color:var(--accent-green);font-weight:700;">0 EA</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-outline" onclick="InjectionWarehouseModule.removeBulkResetPreviewRow(${idx})">제외</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function removeBulkResetPreviewRow(idx) {
        if (!window._injStockResetItems) return;
        window._injStockResetItems.splice(idx, 1);
        _renderBulkResetPreviewTable();
    }

    async function confirmBulkResetStockErrors() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 재고 오류를 초기화할 수 있습니다.', 'warning');
            return;
        }
        const lotNo = _autoResetLot();
        const reasonEl = document.getElementById('injBulkStockResetReason');
        const reason = reasonEl ? reasonEl.value.trim() : '';
        if (!reason) {
            UIUtils.toast('초기화 사유를 입력해주세요.', 'warning');
            if (reasonEl) reasonEl.focus();
            return;
        }

        const items = (window._injStockResetItems || []).slice();
        if (!items.length) {
            UIUtils.toast('초기화 대상이 없습니다.', 'warning');
            return;
        }

        try {
            let done = 0;
            let skipped = 0;
            for (const item of items) {
                const result = await _applyStockErrorCorrection(item.carModel, item.partName, item.color, reason, 0, lotNo);
                if (result.skipped) skipped++;
                else done++;
            }
            UIUtils.closeModal();
            window._injStockResetItems = null;
            UIUtils.toast(`재고 오류 일괄 초기화 완료 (${done}건${skipped ? `, 제외 ${skipped}건` : ''}, LOT ${lotNo})`, 'success');
            loadData();
        } catch (e) {
            console.error('재고 오류 일괄 초기화 실패:', e);
            UIUtils.toast('일괄 초기화 실패: ' + e.message, 'error');
        }
    }

    async function saveNew() {
        const dateVal = document.getElementById('addInvDate').value;
        const timeVal = document.getElementById('addInvTime').value;

        // LOT 목록 수집 + 필수 입력 검사 (사출LOT·수량 모두 필수)
        const lotRows = document.querySelectorAll('#invLotRows .inv-lot-row');
        const lots = [];
        let lotValid = true;
        let firstInvalid = null;
        let errMsg = '';
        lotRows.forEach(function(row) {
            const lotInput = row.querySelector('.inv-lot-no');
            const qtyInput = row.querySelector('.inv-lot-qty');
            const lotNo = (lotInput ? lotInput.value : '').trim();
            const qty = Number(qtyInput ? qtyInput.value : 0) || 0;

            if (lotInput) lotInput.style.borderColor = '';
            if (qtyInput) qtyInput.style.borderColor = '';

            if (!lotNo) {
                if (lotInput) {
                    lotInput.style.borderColor = 'var(--accent-red)';
                    if (!firstInvalid) firstInvalid = lotInput;
                }
                lotValid = false;
                if (!errMsg) errMsg = '사출LOT는 필수 입력 항목입니다.';
                return;
            }
            const lotErr = _yymmddLotError(lotNo);
            if (lotErr) {
                if (lotInput) {
                    lotInput.style.borderColor = 'var(--accent-red)';
                    if (!firstInvalid) firstInvalid = lotInput;
                }
                lotValid = false;
                if (!errMsg) errMsg = lotErr;
                return;
            }
            if (qty <= 0) {
                if (qtyInput) {
                    qtyInput.style.borderColor = 'var(--accent-red)';
                    if (!firstInvalid) firstInvalid = qtyInput;
                }
                lotValid = false;
                if (!errMsg) errMsg = '수량은 필수 입력 항목입니다. 1 이상 입력하세요.';
                return;
            }
            const warnEl = row.querySelector('.inv-fifo-warn');
            const isFifoViolated = warnEl && warnEl.style.display !== 'none';
            const fifoReason = isFifoViolated
                ? ((row.querySelector('.inv-fifo-reason') || {}).value || '').trim()
                : '';
            lots.push({ lotNo: lotNo, qty: qty, fifoReason: fifoReason || undefined });
        });

        if (!lotValid) {
            if (firstInvalid) firstInvalid.focus();
            UIUtils.toast(errMsg || '사출LOT와 수량은 필수 입력 항목입니다.', 'error');
            return;
        }

        if (lots.length === 0) {
            UIUtils.toast('사출LOT와 수량을 입력하세요.', 'warning');
            return;
        }

        const totalQty = lots.reduce(function(s, l) { return s + l.qty; }, 0);

        const _invCarModel = document.getElementById('addInvCarModel').value;
        const _invPartName = document.getElementById('addInvPart').value;
        const _invColor = (document.getElementById('addInvColor') || {}).value || '';

        // v19: injMaterialId — injection_materials에서 carModel+injPartName(+컬러)으로 ID 조회
        // 컬러까지 일치하는 자재를 우선 사용 — 컬러 무시 매칭은 서로 다른 컬러의 자재와 잘못
        // 연결되어(예: GRAY 거래가 WHITE 자재로 연결) 재고 집계 시 수량이 섞이는 오류로 이어진다.
        var _allMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        var _sameCarPart = _allMats.filter(function(m) {
            return m.injPartName === _invPartName && m.carModel === _invCarModel;
        });
        var _matMatch = _sameCarPart.find(function(m) {
            return _splitMasterColors(m).some(function(mc) { return _colorsMatch(mc, _invColor); });
        }) || (_sameCarPart.length === 1 ? _sameCarPart[0] : null);
        var _injMaterialId = _matMatch ? _matMatch.id : '';
        const _resolvedInvColor = _resolveMasterColor(_invCarModel, _invPartName, _invColor, _allMats);

        const _type = document.getElementById('addInvType').value;
        const actorId = _getCurrentActorId();

        // 출고 구분 (생산출고 / 반출)
        let _outgoingType = '';
        let _returnReason = '';
        let _outgoingBy = '';
        let _paintLine = '';
        if (_type === '출고') {
            const outTypeEl = document.querySelector('input[name="outgoingType"]:checked');
            _outgoingType = outTypeEl ? outTypeEl.value : '생산출고';
            _outgoingBy = ((document.getElementById('addInvOutgoingBy') || {}).value || '').trim();
            if (!_outgoingBy) {
                UIUtils.toast('출고자를 선택하세요.', 'warning');
                document.getElementById('addInvOutgoingBy')?.focus();
                return;
            }
            if (!_isValidOutgoingActor(_outgoingBy)) {
                UIUtils.toast('출고자는 물류 담당자(물류작업자)만 선택할 수 있습니다.', 'warning');
                document.getElementById('addInvOutgoingBy')?.focus();
                return;
            }
            if (_outgoingType === '반출') {
                _returnReason = ((document.getElementById('returnReasonInput') || {}).value || '').trim();
                if (!_returnReason) {
                    UIUtils.toast('반출 사유를 입력하세요.', 'warning');
                    document.getElementById('returnReasonInput')?.focus();
                    return;
                }
            } else {
                const lineEl = document.querySelector('input[name="addInvPaintLine"]:checked');
                _paintLine = lineEl ? String(lineEl.value || '').trim() : '';
                if (_paintLine !== '도장-A' && _paintLine !== '도장-B') {
                    _paintLine = _inferPaintLineFromMaster(_invCarModel, _invPartName, _resolvedInvColor || _invColor).line;
                }
            }
        }

        const data = {
            date: `${dateVal} ${timeVal}`.trim(),
            type: _type,
            outgoingType: _outgoingType || undefined,   // 생산출고 / 반출
            returnReason: _returnReason || undefined,    // 반출 사유
            carModel: _invCarModel,
            partName: _invPartName,
            color: _resolvedInvColor || _invColor,
            supplier: (document.getElementById('addInvSupplier') || {}).value || '',
            lots: lots,
            lotNo: lots.length > 0 ? lots[0].lotNo : '',
            quantity: totalQty,
            unit: (document.getElementById('addInvUnit') || { value: 'EA', textContent: 'EA' }).value || 'EA',
            source: _type === '출고' && _outgoingType === '생산출고'
                ? '사출 창고 생산출고'
                : (((document.getElementById('addInvSource') || {}).value || '').trim() || undefined),
            injMaterialId: _injMaterialId || undefined,  // v19
            inspDate: _pendingInspDate || undefined,
            receivedBy: _type === '입고'
                ? (((document.getElementById('addInvReceivedBy') || {}).value || '').trim() || actorId)
                : undefined,
            outgoingBy: _type === '출고' ? _outgoingBy : undefined,
            paintLine: _paintLine || undefined,
            line: _paintLine || undefined
        };
        _pendingInspDate = '';

        if (!data.carModel || !data.partName) {
            UIUtils.toast('차종과 품명을 선택하세요.', 'warning');
            return;
        }

        if (data.quantity <= 0) {
            UIUtils.toast('수량을 입력하세요.', 'warning');
            return;
        }

        // 출고 시 재고 체크 — InvCalc LOT 잔량 기준
        if (data.type === '출고') {
            const { balance, lots: availableLots } = _getLotBalancesForProduct(data.carModel, data.partName, data.color);
            if (data.quantity > balance.total) {
                UIUtils.toast(`가용 재고(${UIUtils.formatNumber(balance.total)} EA)를 초과할 수 없습니다.`, 'danger');
                return;
            }
            const lotAvailMap = {};
            availableLots.forEach(function(l) { lotAvailMap[l.lotNo] = l.qty; });
            for (const lot of lots) {
                const avail = lotAvailMap[lot.lotNo] || 0;
                if (lot.qty > avail) {
                    UIUtils.toast(`LOT ${lot.lotNo} 가용 재고(${UIUtils.formatNumber(avail)} EA)를 초과할 수 없습니다.`, 'danger');
                    return;
                }
            }

            const fifoAnalysis = _analyzeFifoViolations(data.carModel, data.partName, data.color, lots, null);
            if (fifoAnalysis.violated) {
                const missingReason = lots.some(function(lot) {
                    return fifoAnalysis.violatingLots.indexOf(_normInvLotNo(lot.lotNo)) >= 0 && !lot.fifoReason;
                });
                if (missingReason) {
                    UIUtils.toast(fifoAnalysis.message || '선입선출 미준수 사유를 선택해 주세요.', 'warning');
                    const reasonEl = document.querySelector('#invLotRows .inv-fifo-reason');
                    if (reasonEl) reasonEl.focus();
                    return;
                }
            }
            const topFifoReason = lots.map(function(l) { return l.fifoReason; }).find(Boolean);
            if (topFifoReason) data.fifoReason = topFifoReason;
        }
        if (data.quantity <= 0) {
            UIUtils.toast('유효한 수량을 입력하세요.', 'warning');
            return;
        }

        await _addInventoryRecord(data);
        UIUtils.closeModal();
        UIUtils.toast(`${data.type} 등록이 완료되었습니다.`, 'success');
        loadData();
    }

    function remove(id) {
        if (!_isAdminUser()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        UIUtils.confirm('이 재고 기록을 삭제하시겠습니까? (삭제 시 실제 재고량에 직접 반영됩니다.)', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadData();
        });
    }

    function openEditModal(id) {
        const d = Storage.getById(STORE, id);
        if (!d) { UIUtils.toast('기록을 찾을 수 없습니다.', 'error'); return; }
        const typeColor = d.type === '출고' ? 'var(--accent-red)' : 'var(--accent-blue)';
        const inspCtx = _buildInspDateContext();
        const inspDateHtml = _formatInspDateCell(d, d.type !== '출고', inspCtx.inspDateMap, inspCtx.inboundInspMap);
        const workLineMap = _buildPaintWorkLineMap();
        const paintLine = _resolveOutgoingPaintLine(d, workLineMap, _buildPaintLineFromInputMap());
        const outgoingActor = _outgoingActorLabel(d);
        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:${typeColor};margin-right:4px;">edit</span> 입출고 이력 수정`,
            `<div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:14px;font-size:0.85rem;">
                <div style="display:flex;gap:16px;flex-wrap:wrap;">
                    <span><strong>일자:</strong> ${d.date || '-'} ${d.time || ''}</span>
                    <span><strong>구분:</strong> <span style="color:${typeColor};font-weight:700;">${d.type || '-'}</span></span>
                    <span><strong>차종:</strong> ${d.carModel || '-'}</span>
                    <span><strong>품명:</strong> ${d.partName || '-'}</span>
                    <span><strong>컬러:</strong> ${d.color || '-'}</span>
                    <span><strong>LOT:</strong> ${d.lotNo || (d.lots ? d.lots.map(l=>l.lotNo).join(', ') : '-')}</span>
                    ${d.type === '출고' && paintLine ? `<span><strong>출고구분:</strong> ${paintLine}</span>` : ''}
                    ${d.type === '출고' ? `<span><strong>출고자:</strong> ${outgoingActor || '미등록'}</span>` : ''}
                    <span><strong>수입검사일:</strong> ${inspDateHtml}</span>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="editInvQty" value="${d.quantity || 0}" min="1"
                        style="font-size:1.1rem;font-weight:700;text-align:right;">
                </div>
                ${d.type === '출고' ? `
                <div class="form-group">
                    <label class="form-label">출고 구분</label>
                    <input type="text" class="form-input" value="${paintLine || d.outgoingType || '생산출고'}" readonly
                        style="background:var(--bg-secondary);">
                </div>` : ''}
            </div>
            ${d.returnReason ? `
            <div class="form-group">
                <label class="form-label">반출 사유</label>
                <input type="text" class="form-input" id="editReturnReason" value="${d.returnReason || ''}">
            </div>` : ''}
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="editInvNote" value="${d.note || ''}" placeholder="특이사항">
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="InjectionWarehouseModule.saveEdit('${id}')">저장</button>`,
            'min(1180px, calc(100vw - 32px))'
        );
    }

    async function saveEdit(id) {
        const qtyEl = document.getElementById('editInvQty');
        const qty = Number((qtyEl || {}).value) || 0;
        if (!qty) { UIUtils.toast('수량을 입력하세요.', 'warning'); if (qtyEl) qtyEl.focus(); return; }
        const note        = (document.getElementById('editInvNote') || {}).value || '';
        const returnReason = (document.getElementById('editReturnReason') || {}).value || undefined;
        const updates = { quantity: qty, note };
        if (returnReason !== undefined) updates.returnReason = returnReason;
        await Storage.update(STORE, id, updates);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadData();
    }

    function exportData() {
        const data = Storage.getAll(STORE);
        if (!data.length) {
            UIUtils.toast('데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['일자', '차종', '사출명', '컬러', '사출처', 'LOT번호', '단위', '수량', '유형', '비고'];
        const rows = data.map(d => [
            d.date || '',
            d.carModel || '',
            d.partName || '',
            d.color || '',
            d.supplier || '',
            d.lotNo || '',
            d.unit || 'EA',
            d.quantity || 0,
            d.type || '입고',
            d.source || ''
        ]);
        Storage.exportToCSV(headers, rows, '사출창고_입출고현황');
        UIUtils.toast('CSV 데이터 내보내기 성공', 'success');
    }

    function onLotInput(input, msgId) {
        // 숫자만 허용
        const val = input.value.replace(/\D/g, '').slice(0, 6);
        input.value = val;

        const msg = document.getElementById(msgId);
        if (!msg) return;

        if (val.length === 0) {
            msg.innerHTML = '';
            input.style.borderColor = '';
            return;
        }

        if (val.length < 6) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ ${6 - val.length}자리 더 입력하세요 (현재 ${val.length}/6)</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        // 6자리 도달 — 날짜 유효성 확인 (YYMMDD)
        const mm = parseInt(val.slice(2, 4), 10);
        const dd = parseInt(val.slice(4, 6), 10);
        const yyStr = val.slice(0, 2);
        const yyNum = parseInt(yyStr, 10);

        const fullYear = yyNum >= 50 ? 1900 + yyNum : 2000 + yyNum;
        const inputDate = new Date(fullYear, mm - 1, dd);

        if (inputDate.getFullYear() !== fullYear || inputDate.getMonth() !== mm - 1 || inputDate.getDate() !== dd) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 유효하지 않은 날짜입니다 (월: ${mm}, 일: ${dd})</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (inputDate > today) {
            msg.innerHTML = `<span style="color:var(--accent-red);">⚠ 오늘 이후(미래)의 날짜입니다</span>`;
            input.style.borderColor = 'var(--accent-red)';
            return;
        }

        msg.innerHTML = `<span style="color:var(--accent-green);">✓ ${fullYear}년 ${String(mm).padStart(2, '0')}월 ${String(dd).padStart(2, '0')}일</span>`;
        input.style.borderColor = 'var(--accent-green)';
    }

    /* ================================================================
       컬러 유효성 헬퍼 + 데이터 정리 모달
    ================================================================ */

    /**
     * 잘못된 컬러값 판별
     * - 빈값 / "-" → 미설정
     * - 숫자만으로 구성된 문자열 (예: "46645") → LOT번호 오입력
     */
    function _isInvalidColor(color) {
        const c = (color || '').trim();
        if (!c || c === '-') return true;           // 빈값·대시
        if (/^\d[\d,.\s]*$/.test(c)) return true;  // 숫자(쉼표·점 포함) — LOT번호 오입력
        return false;
    }

    /** 컬러 별칭·오입력 레코드 확인 및 통합/삭제 모달 */
    function openColorCleanupModal() {
        const data      = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

        const aliasRecords = data.filter(function(d) { return _isAliasOnlyMismatch(d, materials); });
        const badRecords = data.filter(function(d) {
            if (_isInvalidColor(d.color)) return true;
            return !_recordMatchesMaster(d, materials);
        });

        if (aliasRecords.length === 0 && badRecords.length === 0) {
            UIUtils.showToast('정리할 컬러 데이터가 없습니다.', 'success');
            return;
        }

        function buildSummary(records, includeTarget) {
            const summary = {};
            records.forEach(function(d) {
                const resolved = includeTarget
                    ? _resolveMasterColor(d.carModel, d.partName, d.color, materials)
                    : '';
                const key = `${d.carModel||'-'}||${d.partName||'-'}||${d.color||'(빈값)'}`;
                if (!summary[key]) {
                    summary[key] = {
                        carModel: d.carModel || '-',
                        partName: d.partName || '-',
                        color: d.color || '(빈값)',
                        target: resolved,
                        count: 0
                    };
                }
                summary[key].count++;
            });
            return Object.values(summary)
                .sort(function(a, b) {
                    return a.carModel.localeCompare(b.carModel) || a.partName.localeCompare(b.partName);
                });
        }

        const aliasRows = buildSummary(aliasRecords, true).map(function(s) {
            return `
                <tr>
                    <td style="padding:4px 8px;font-size:0.82rem;">${s.carModel}</td>
                    <td style="padding:4px 8px;font-size:0.82rem;font-weight:600;">${s.partName}</td>
                    <td style="padding:4px 8px;font-size:0.82rem;">
                        <code style="background:#fee2e2;padding:1px 6px;border-radius:3px;">${s.color}</code>
                        <span style="color:var(--text-muted);margin:0 4px;">→</span>
                        <code style="background:#dcfce7;padding:1px 6px;border-radius:3px;">${s.target}</code>
                    </td>
                    <td style="padding:4px 8px;font-size:0.82rem;text-align:right;color:var(--text-muted);">${s.count}건</td>
                </tr>`;
        }).join('');

        const badRows = buildSummary(badRecords, false).map(function(s) {
            return `
                <tr>
                    <td style="padding:4px 8px;font-size:0.82rem;">${s.carModel}</td>
                    <td style="padding:4px 8px;font-size:0.82rem;font-weight:600;">${s.partName}</td>
                    <td style="padding:4px 8px;font-size:0.82rem;color:var(--accent-red);">
                        <code style="background:#fee2e2;padding:1px 6px;border-radius:3px;">${s.color}</code>
                    </td>
                    <td style="padding:4px 8px;font-size:0.82rem;text-align:right;color:var(--text-muted);">${s.count}건</td>
                </tr>`;
        }).join('');

        const footerBtns = ['<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>'];
        if (aliasRecords.length) {
            footerBtns.push(`
                <button class="btn btn-primary" onclick="InjectionWarehouseModule.migrateColorAliasRecords()">
                    <span class="material-symbols-outlined" style="font-size:1rem;">merge</span>
                    별칭 통합 (${aliasRecords.length}건)
                </button>
                <button class="btn btn-outline" style="border-color:#dc2626;color:#dc2626;"
                    onclick="InjectionWarehouseModule.deleteAliasColorRecords()">
                    <span class="material-symbols-outlined" style="font-size:1rem;">delete</span>
                    별칭 삭제 (${aliasRecords.length}건)
                </button>`);
        }
        if (badRecords.length) {
            footerBtns.push(`
                <button class="btn btn-danger" onclick="InjectionWarehouseModule.deleteInvalidColorRecords()">
                    <span class="material-symbols-outlined" style="font-size:1rem;">delete_sweep</span>
                    잘못된 레코드 삭제 (${badRecords.length}건)
                </button>`);
        }

        UIUtils.showModal('사출 창고 컬러 데이터 정리', `
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
                마스터에 <strong>BLACK</strong>만 등록되어 있어도 입출고 이력에 <strong>BK</strong> 등 별칭이 있으면 재고가 두 줄로 나뉩니다.
                별칭 통합은 이력의 컬러를 마스터 표기로 바꿉니다. (BK → BLACK 등)
            </div>
            ${aliasRecords.length ? `
            <div style="margin-bottom:16px;">
                <div style="font-size:0.8rem;font-weight:700;color:#b45309;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">palette</span>
                    별칭 불일치 — 마스터로 통합 가능 (${aliasRecords.length}건)
                </div>
                <div style="max-height:260px;overflow-y:auto;border:1px solid #fed7aa;border-radius:6px;background:#fffbeb;">
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead><tr><th>차종</th><th>사출품명</th><th>현재 → 통합</th><th style="text-align:right;">건수</th></tr></thead>
                        <tbody>${aliasRows}</tbody>
                    </table>
                </div>
            </div>` : ''}
            ${badRecords.length ? `
            <div>
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-red);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">delete_sweep</span>
                    삭제 대상 — 마스터 미등록·오입력 (${badRecords.length}건)
                </div>
                <div style="max-height:260px;overflow-y:auto;border:1px solid #fca5a5;border-radius:6px;background:#fff5f5;">
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead><tr><th>차종</th><th>사출품명</th><th>컬러(문제)</th><th style="text-align:right;">건수</th></tr></thead>
                        <tbody>${badRows}</tbody>
                    </table>
                </div>
                <div style="margin-top:8px;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;
                            border-radius:6px;font-size:0.78rem;color:#92400e;">
                    ⚠ 삭제하면 해당 입출고 이력이 영구 제거됩니다.
                </div>
            </div>` : ''}
        `, footerBtns.join(''), 'min(900px, calc(100vw - 32px))');
    }

    /** 별칭 컬러(BK 등) 입출고 이력 일괄 삭제 — 마스터에 없는 유령 품목 제거 */
    async function deleteAliasColorRecords() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 실행할 수 있습니다.', 'warning');
            return;
        }
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const targets = data.filter(function(d) { return _isAliasOnlyMismatch(d, materials); });
        if (!targets.length) {
            UIUtils.showToast('삭제할 별칭 레코드가 없습니다.', 'info');
            UIUtils.closeModal();
            return;
        }
        try {
            for (const rec of targets) {
                await Storage.remove(STORE, rec.id);
            }
            UIUtils.closeModal();
            UIUtils.showToast(`별칭 컬러 입출고 ${targets.length}건을 삭제했습니다.`, 'success');
            loadData();
        } catch (e) {
            UIUtils.showToast('삭제 중 오류: ' + e.message, 'error');
        }
    }

    /** 특정 품목·컬러(예: IL·BK) 입출고 이력 삭제 */
    function deleteProductColorRecords(carModel, partName, color) {
        if (!_canManageStockData()) {
            UIUtils.toast('사출창고 편집 권한이 필요합니다.', 'warning');
            return;
        }
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const data = Storage.getAll(STORE) || [];
        const decodedCar = decodeURIComponent(carModel || '');
        const decodedPart = decodeURIComponent(partName || '');
        const decodedColor = decodeURIComponent(color || '');
        const targets = data.filter(function(d) {
            if (_normKeyStr(d.carModel) !== _normKeyStr(decodedCar)) return false;
            if (_normKeyStr(d.partName) !== _normKeyStr(decodedPart)) return false;
            return _colorAliasKey(d.color) === _colorAliasKey(decodedColor) &&
                _isAliasOnlyMismatch(d, materials);
        });
        if (!targets.length) {
            UIUtils.toast('삭제할 별칭 입출고 이력이 없습니다.', 'info');
            return;
        }
        const masterColor = _resolveMasterColor(decodedCar, decodedPart, decodedColor, materials);
        UIUtils.confirm(
            `${decodedCar} · ${decodedPart} · ${decodedColor}\n` +
            `마스터에 없는 별칭 컬러 입출고 ${targets.length}건을 삭제합니다.\n` +
            (masterColor ? `(마스터 컬러: ${masterColor} — 해당 이력은 유지됩니다)` : ''),
            async function() {
                try {
                    for (const rec of targets) {
                        await Storage.remove(STORE, rec.id);
                    }
                    UIUtils.showToast(`${decodedPart} · ${decodedColor} 이력 ${targets.length}건 삭제 완료`, 'success');
                    loadData();
                } catch (e) {
                    UIUtils.showToast('삭제 중 오류: ' + e.message, 'error');
                }
            }
        );
    }

    /** 별칭 컬러(BK 등)를 마스터 표기(BLACK 등)로 일괄 통합 */
    async function migrateColorAliasRecords() {
        if (!_isAdminUser()) {
            UIUtils.toast('관리자만 실행할 수 있습니다.', 'warning');
            return;
        }
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const targets = data.filter(function(d) { return _isAliasOnlyMismatch(d, materials); });
        if (!targets.length) {
            UIUtils.showToast('통합할 별칭 레코드가 없습니다.', 'info');
            UIUtils.closeModal();
            return;
        }
        try {
            let count = 0;
            for (const rec of targets) {
                const resolved = _resolveMasterColor(rec.carModel, rec.partName, rec.color, materials);
                if (!resolved || _normKeyStr(rec.color) === _normKeyStr(resolved)) continue;
                await Storage.update(STORE, rec.id, Object.assign({}, rec, { color: resolved }));
                count++;
            }
            UIUtils.closeModal();
            UIUtils.showToast(`컬러 별칭 ${count}건을 마스터 표기로 통합했습니다.`, 'success');
            loadData();
        } catch (e) {
            UIUtils.showToast('통합 중 오류: ' + e.message, 'error');
        }
    }

    /** 잘못된 컬러 레코드 일괄 삭제 */
    async function deleteInvalidColorRecords() {
        const data      = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];

        const badRecords = data.filter(function(d) {
            if (_isInvalidColor(d.color)) return true;
            return !_recordMatchesMaster(d, materials);
        });

        if (badRecords.length === 0) {
            UIUtils.showToast('삭제할 레코드가 없습니다.', 'info');
            UIUtils.closeModal();
            return;
        }

        try {
            for (const rec of badRecords) {
                await Storage.remove(STORE, rec.id);
            }
            UIUtils.closeModal();
            UIUtils.showToast(`${badRecords.length}건의 잘못된 레코드를 삭제했습니다.`, 'success');
            loadData();
        } catch (e) {
            UIUtils.showToast('삭제 중 오류가 발생했습니다: ' + e.message, 'error');
        }
    }

    function showStockModal() {
        const data = Storage.getAll(STORE) || [];
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);

        // 차종+품명+컬러 기준 InvCalc 집계
        const groups = {};
        data.forEach(function(d) {
            const carModel = _normKeyStr(d.carModel) || '-';
            const partName = _normKeyStr(d.partName) || '-';
            const color = _resolveMasterColor(carModel, partName, d.color, materials) || '-';
            const key = `${carModel}_${partName}_${color}`;
            if (!groups[key]) groups[key] = { carModel, partName, color, records: [] };
            groups[key].records.push(d);
        });
        const stockMap = {};
        Object.keys(groups).forEach(function(key) {
            const g = groups[key];
            const mat = materials.find(function(m) {
                return _normKeyStr(m.carModel) === g.carModel && _normKeyStr(m.injPartName) === g.partName;
            });
            const balance = InvCalc.lotBalances(g.records);
            const lotSet = new Set();
            balance.lots.forEach(function(l) {
                if (l.lotNo !== InvCalc.UNMATCHED && l.qty > 0) lotSet.add(l.lotNo);
            });
            stockMap[key] = {
                carModel: g.carModel,
                partName: g.partName,
                color: g.color,
                supplier: '-',
                unit: 'EA',
                price: Number(mat ? mat.unitPrice : 0) || 0,
                qty: balance.total,
                lots: lotSet
            };
        });
        materials.forEach(mat => {
            if (!mat.carModel || !mat.injPartName) return;
            const carModel = _normKeyStr(mat.carModel) || '-';
            const partName = _normKeyStr(mat.injPartName) || '-';
            const color = _normKeyStr(mat.injColor) || '-';
            const key = `${carModel}_${partName}_${color}`;
            if (!stockMap[key]) {
                stockMap[key] = {
                    carModel,
                    partName,
                    color:    color,
                    supplier: '-',
                    unit:     'EA',
                    price:    Number(mat.unitPrice) || 0,
                    qty:      0,
                    lots:     new Set()
                };
            }
        });

        const rows = Object.values(stockMap).map(r => ({
            ...r,
            lots: Array.from(r.lots).sort()
        })).sort((a, b) => a.carModel.localeCompare(b.carModel) || a.partName.localeCompare(b.partName) || a.color.localeCompare(b.color));

        const carModels = UIUtils.sortCarModels(rows.map(r => r.carModel).filter(c => c !== '-'));

        const tableRows = rows.length === 0 ?
            `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">재고 데이터가 없습니다.</td></tr>` :
            // 표시 단계에서는 '-'(미설정) 컬러도 노출하고, 숫자형 컬러(LOT 오입력)만 제외
            rows.filter(r => r.qty >= 0 && !_isDisplayInvalidColor(r.color)).map(r => {
                const qtyColor = r.qty === 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
                const lotBadges = r.lots.length > 0 ?
                    r.lots.map(l => `<span class="lot-badge-sm">${l}</span>`).join('') :
                    '<span style="color:var(--text-muted)">-</span>';
                return `
                    <tr data-car-model="${r.carModel}">
                        <td>${r.carModel}</td>
                        <td><strong>${r.partName}</strong></td>
                        <td>${r.color !== '-' ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.8rem;background:var(--bg-secondary);border:1px solid var(--border);">${r.color}</span>` : '-'}</td>
                        <td style="text-align:right;">${UIUtils.formatNumber(r.price)}</td>
                        <td style="text-align:right;font-weight:700;color:${qtyColor};">
                            ${UIUtils.formatNumber(r.qty)}<span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);margin-left:3px;">${r.unit}</span>
                        </td>
                        <td><div style="display:flex; flex-wrap:wrap; gap:4px;">${lotBadges}</div></td>
                    </tr>`;
            }).join('');

        UIUtils.showModal('사출 자재 현재 재고 현황', `
            <style>
                .lot-badge-sm {
                    display:inline-block;
                    background:var(--bg-primary);
                    border:1px solid var(--border);
                    border-radius:4px;
                    padding:1px 6px;
                    font-size:0.75rem;
                    color:var(--text-secondary);
                }
            </style>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);">filter_alt</span>
                <select class="form-select" id="injStockCarFilter" style="max-width:200px;"
                        onchange="InjectionWarehouseModule.filterStock()">
                    <option value="">전체 차종</option>
                    ${carModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <span style="font-size:0.82rem;color:var(--text-muted);">총 ${rows.length}개 품목</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>차종</th>
                            <th>사출명</th>
                            <th>컬러</th>
                            <th style="text-align:right;">단가</th>
                            <th style="text-align:right;">현재고</th>
                            <th>LOT 목록</th>
                        </tr>
                    </thead>
                    <tbody id="injStockTableBody">${tableRows}</tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
        `, 'lg');
    }

    function filterStock() {
        const carModel = document.getElementById('injStockCarFilter').value;
        const rows = document.querySelectorAll('#injStockTableBody tr[data-car-model]');
        rows.forEach(row => {
            row.style.display = (!carModel || row.dataset.carModel === carModel) ? '' : 'none';
        });
    }

    // ── 예약 집계 상세 팝업 ──────────────────────────────────────────
    // 사출 창고 목록의 예약 뱃지 클릭 시 호출 — 당일 계획 / 미입력 실적 분리 표시
    function showReserveDetailPopup(event, encPart, encModel, encColor) {
        event.stopPropagation();

        const partName = decodeURIComponent(encPart);
        const carModel = decodeURIComponent(encModel);
        const color    = decodeURIComponent(encColor);

        // 기존 팝업이 같은 뱃지를 다시 클릭한 경우 닫기 (토글)
        const oldPopup = document.getElementById('injReserveDetailPopup');
        if (oldPopup) {
            oldPopup.remove();
            if (oldPopup.dataset.key === `${partName}|${carModel}|${color}`) return;
        }

        const detail = (typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule._getInjReserveDetail)
            ? ProductionPlanModule._getInjReserveDetail(partName, carModel, color)
            : { pendingPlans: [], inProgressPlans: [], pendingTotal: 0, inProgressTotal: 0 };

        const { pendingPlans, inProgressPlans, pendingTotal, inProgressTotal } = detail;
        const totalReserved = pendingTotal + inProgressTotal;
        const isAdmin = _isAdminUser();
        const canEditPlan = _canEditReservedPlan();

        function _adminButtons(p) {
            if (!canEditPlan && !isAdmin) return '';
            const editBtn = canEditPlan ? `
                    <button type="button" title="수량 수정"
                        onclick="event.stopPropagation();InjectionWarehouseModule.editReservedPlan('${p.id}', ${Number(p.planQty) || 0})"
                        style="border:none;background:none;cursor:pointer;padding:1px;color:var(--accent-blue);display:flex;">
                        <span class="material-symbols-outlined" style="font-size:14px;">edit</span>
                    </button>` : '';
            const deleteBtn = isAdmin ? `
                    <button type="button" title="삭제"
                        onclick="event.stopPropagation();InjectionWarehouseModule.removeReservedPlan('${p.id}')"
                        style="border:none;background:none;cursor:pointer;padding:1px;color:var(--accent-red);display:flex;">
                        <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                    </button>` : '';
            return `<span style="display:flex;gap:2px;margin-left:2px;flex-shrink:0;">${editBtn}${deleteBtn}</span>`;
        }

        // 계획 목록 행 생성 (대기·미입력 공통 — 클릭 시 도장 실적입력으로 이동)
        function _clickableRows(plans, bgColor, accentColor) {
            if (!plans.length) return `<div style="font-size:0.75rem;color:var(--text-muted);padding:4px 0;">해당 없음</div>`;
            const accent = accentColor || '#ea580c';
            return plans.map(p => `
                <div data-plan-date="${p.date || ''}" data-plan-id="${p.id || ''}"
                     style="display:flex;gap:6px;align-items:center;font-size:0.75rem;padding:4px 6px;
                            border-bottom:1px solid var(--border-color);cursor:pointer;border-radius:4px;
                            transition:background 0.15s;"
                     onmouseover="this.style.background='${bgColor}'"
                     onmouseout="this.style.background=''"
                     onclick="InjectionWarehouseModule._goToPlan(this)"
                     title="클릭하면 도장 실적입력으로 이동합니다">
                    <span class="material-symbols-outlined" style="font-size:13px;color:${accent};flex-shrink:0;">edit_note</span>
                    <span style="color:var(--text-muted);min-width:78px;flex-shrink:0;">${p.date || '-'}</span>
                    <span style="flex:1;color:var(--text-secondary);">${p.line || '-'}</span>
                    <span style="font-weight:700;white-space:nowrap;">${UIUtils.formatNumber(p.planQty)} 개</span>
                    <span style="font-size:0.68rem;background:${bgColor};border-radius:3px;padding:0 4px;white-space:nowrap;">${p.status}</span>
                    ${_adminButtons(p)}
                </div>`).join('');
        }

        const popup = document.createElement('div');
        popup.id = 'injReserveDetailPopup';
        popup.dataset.key = `${partName}|${carModel}|${color}`;
        popup.style.cssText = [
            'position:fixed','z-index:9999',
            'background:var(--bg-primary,#fff)',
            'border:1.5px solid var(--border-color)',
            'border-radius:10px',
            'box-shadow:0 8px 28px rgba(0,0,0,0.2)',
            'padding:14px 16px',
            'min-width:250px','max-width:340px',
            'font-family:inherit'
        ].join(';');

        popup.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span style="font-weight:700;font-size:0.9rem;display:flex;align-items:center;gap:5px;">
                    <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-blue);">event_note</span>
                    예약 집계 상세
                </span>
                <span style="font-size:0.75rem;color:var(--text-muted);background:var(--bg-secondary);
                             padding:2px 7px;border-radius:10px;">${partName} ${color || ''}</span>
            </div>

            <!-- 요약 카드 -->
            <div style="background:var(--bg-secondary);border-radius:7px;padding:10px 12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                    <span style="font-size:0.83rem;color:var(--text-secondary);">당일 계획 (대기)</span>
                    <span style="font-weight:700;color:var(--accent-blue);font-size:0.92rem;">${UIUtils.formatNumber(pendingTotal)} 개</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                    <span style="font-size:0.83rem;color:var(--text-secondary);">미입력 실적</span>
                    <span style="font-weight:700;color:${inProgressTotal > 0 ? '#ea580c' : 'var(--text-muted)'};font-size:0.92rem;">${UIUtils.formatNumber(inProgressTotal)} 개</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:6px 0 2px;margin-top:4px;border-top:1.5px solid var(--border-color);">
                    <span style="font-size:0.85rem;font-weight:600;">합계 예약</span>
                    <span style="font-weight:800;color:var(--accent-red);font-size:0.98rem;">${UIUtils.formatNumber(totalReserved)} 개</span>
                </div>
            </div>

            <!-- 대기 계획 목록 -->
            ${pendingPlans.length > 0 ? `
            <div style="margin-bottom:8px;">
                <div style="font-size:0.76rem;font-weight:600;color:var(--accent-blue);
                            margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">schedule</span>
                    대기 계획 (${pendingPlans.length}건)
                </div>
                <div style="max-height:90px;overflow-y:auto;">
                    ${_clickableRows(pendingPlans, 'rgba(37,99,235,0.10)', '#2563eb')}
                </div>
            </div>` : ''}

            <!-- 미입력 실적 목록 -->
            ${inProgressPlans.length > 0 ? `
            <div>
                <div style="font-size:0.76rem;font-weight:600;color:#ea580c;
                            margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">warning</span>
                    미입력 실적 (${inProgressPlans.length}건)
                </div>
                <div style="max-height:90px;overflow-y:auto;">
                    ${_clickableRows(inProgressPlans, 'rgba(234,88,12,0.12)', '#ea580c')}
                </div>
            </div>` : ''}

            <div style="margin-top:8px;text-align:center;font-size:0.68rem;color:var(--text-muted);">
                계획 행 클릭 → 도장 실적입력으로 이동
            </div>`;

        // 위치 지정 (화면 경계 보정)
        document.body.appendChild(popup);
        const rect = event.currentTarget.getBoundingClientRect();
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        let left = rect.left;
        let top  = rect.bottom + 6;
        if (left + pw > window.innerWidth  - 10) left = window.innerWidth  - pw - 10;
        if (left < 10) left = 10;
        if (top  + ph > window.innerHeight - 10) top  = rect.top - ph - 6;
        if (top  < 10) top  = 10;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';

        // 외부 클릭 시 닫기 (팝업 내부 클릭은 닫지 않음 — 미입력 실적 행 클릭 허용)
        const _close = (e) => {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _close); }
        };
        setTimeout(() => document.addEventListener('click', _close), 10);
    }

    // 예약/미입력 실적 행 클릭 → 도장 실적입력 페이지로 이동
    function _goToPlan(rowEl) {
        const planId = rowEl && rowEl.dataset ? rowEl.dataset.planId : '';
        const date = rowEl && rowEl.dataset ? rowEl.dataset.planDate : '';
        const popup = document.getElementById('injReserveDetailPopup');
        if (popup) popup.remove();

        if (planId && typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.goToWorkFromPlan === 'function') {
            PaintingWorkModule.goToWorkFromPlan(planId);
            return;
        }

        // 폴백: 생산계획 페이지의 해당 날짜로 이동
        if (typeof Router !== 'undefined') {
            Router.navigate('production-plan');
            if (date && typeof ProductionPlanModule !== 'undefined' && ProductionPlanModule.selectDate) {
                setTimeout(() => ProductionPlanModule.selectDate(date), 300);
            }
        }
    }

    // ── 예약(생산계획) 수량 수정/삭제 — 관리자 전용 ──────────────────
    function editReservedPlan(id, currentQty) {
        if (!_canEditReservedPlan()) {
            UIUtils.toast('생산계획 또는 사출 창고 입력 권한이 있는 사용자만 예약 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        UIUtils.showModal('예약 수량 수정', `
            <div class="form-group">
                <label class="form-label">계획 수량</label>
                <input type="number" class="form-input" id="reservePlanQtyInput" value="${Number(currentQty) || 0}" min="0">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="InjectionWarehouseModule._saveReservedPlanQty('${id}')">저장</button>
        `);
    }

    async function _saveReservedPlanQty(id) {
        const qty = Number(document.getElementById('reservePlanQtyInput')?.value) || 0;
        if (qty <= 0) {
            UIUtils.toast('수량을 입력하세요.', 'warning');
            return;
        }
        try {
            await Storage.update(DB.STORES.PRODUCTION_PLANS, id, { planQty: qty });
            UIUtils.closeModal();
            const popup = document.getElementById('injReserveDetailPopup');
            if (popup) popup.remove();
            UIUtils.toast('예약 수량이 수정되었습니다.', 'success');
            loadData();
        } catch (e) {
            UIUtils.toast('수정 실패: ' + e.message, 'error');
        }
    }

    function removeReservedPlan(id) {
        if (!_isAdminUser()) {
            UIUtils.toast('예약 삭제는 관리자만 가능합니다.', 'warning');
            return;
        }
        UIUtils.confirm('해당 예약(생산계획)을 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.', async () => {
            try {
                await Storage.remove(DB.STORES.PRODUCTION_PLANS, id);
                const popup = document.getElementById('injReserveDetailPopup');
                if (popup) popup.remove();
                UIUtils.toast('삭제되었습니다.', 'success');
                loadData();
            } catch (e) {
                UIUtils.toast('삭제 실패: ' + e.message, 'error');
            }
        });
    }

    return {
        render,
        _switchTab,
        loadData,
        renderInspStandby,
        clearTestInspections,
        renderCarTiles,
        filterTransactions,
        onTxCarChange,
        jumpToTxHistory,
        openResetStockErrorModal,
        confirmResetStockError,
        openUnmatchedActionModal,
        confirmUnmatchedAction,
        openLinkedPaintWork,
        openManualIncomingHistory,
        fixCorruptedQtyFields,
        openBulkResetStockErrorsModal,
        removeBulkResetPreviewRow,
        confirmBulkResetStockErrors,
        showPartDetail,
        openLotRenameModal,
        saveLotRename,
        openLotEditModal,
        saveLotEdit,
        _openAddModalForPart,
        openAddModal,
        openAddFromInspection,
        addAllFromInspection,
        addAllPendingInspections,
        dismissPendingLot,
        openDismissedPendingModal,
        restoreDismissedPendingLot,
        getLinkedInventoryForInspection,
        removeLinkedInventoryRecords,
        onModalCarModelChange,
        onModalPartChange,
        onModalColorChange,
        onOutTypeChange,
        updateLotStockList,
        onLotItemSelect,
        autoFillFIFO,
        checkInvFifoWarning,
        checkAllInvFifoWarnings,
        addInvLotRow,
        removeInvLotRow,
        calcInvLotTotal,
        openBulkPasteModal,
        handleBulkPasteInput,
        removeBulkPreviewRow,
        confirmBulkPaste,
        saveNew,
        remove,
        openIncomingTxView,
        openLinkedInspection,
        openEditModal,
        saveEdit,
        exportData,
        onLotInput,
        showStockModal,
        openColorCleanupModal,
        migrateColorAliasRecords,
        deleteAliasColorRecords,
        deleteProductColorRecords,
        deleteInvalidColorRecords,
        filterStock,
        showReserveDetailPopup,
        _goToPlan,
        editReservedPlan,
        _saveReservedPlanQty,
        removeReservedPlan,
        renderOutgoingListup,
        openOutgoingListupItemModal,
        _onOutItemTypeChange,
        saveOutgoingListupItem,
        removeOutgoingListupRow,
        toggleOutgoingListupAll,
        confirmOutgoingListup
    };
})();
