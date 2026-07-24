/**
 * 재공품 현황 (통합)
 * - 탭 1: 레이져 대기품 현황  (도장 완료 → 레이져 공정 대기)
 * - 탭 2: 레이져 후 재공품 현황 (레이져 완료 → 도장-B 대기)
 * - 탭 3: 레이져 잔량 현황   (포장단위 미달 잔량, 레이져 공정 제품)
 */

var LaserWipModule = (function() {
    const STORE_LASER = DB.STORES.LASER_WORK_LOG;
    const STORE_PAINT = DB.STORES.PAINTING_WORK;
    const AFTER_WIP_HISTORY_RESET_KEY = 'laser_after_wip_history_resets_v1';
    const RESIDUAL_HISTORY_RESET_KEY = 'laser_residual_history_resets_v1';

    let _activeTab = 'standby'; // 'standby' | 'after-laser' | 'after-laser-residual'
    let _afterWipHistoryResets = [];
    let _afterWipHistoryResetsLoaded = false;
    let _residualHistoryResets = [];
    let _residualHistoryResetsLoaded = false;

    function _isAdmin() {
        try {
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.isAdminUser === 'function') {
                return !!AuthModule.isAdminUser();
            }
            const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            const roles = Array.isArray(u && u.roles) ? u.roles : [u && u.role];
            return roles.some(role => String(role || '') === 'admin');
        } catch (e) { return false; }
    }

    function _canEditWip() {
        try {
            if (_isAdmin()) return true;
            return typeof AuthModule !== 'undefined' &&
                typeof AuthModule.canWritePage === 'function' &&
                AuthModule.canWritePage('laser-wip');
        } catch (e) { /* 무시 */ }
        return false;
    }

    // 잔량 수기 입/출고 기록에 남길 작성자 이름
    function _currentUserName() {
        try {
            const u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            return (u && (u.displayName || u.username)) || '';
        } catch (e) { /* 무시 */ }
        return '';
    }

    // onclick 인자용 — URI 인코딩은 1회만. 따옴표만 이스케이프한다.
    function _jsArg(value) {
        return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function _parseProductKey(keyEnc) {
        let s = String(keyEnc || '');
        for (let i = 0; i < 3; i++) {
            try {
                const d = decodeURIComponent(s);
                if (d === s) break;
                s = d;
            } catch (e) { break; }
        }
        const parts = s.split('||');
        return {
            carModel: (parts[0] || '').trim(),
            partName: (parts[1] || '').trim(),
            color: (parts[2] || '').trim()
        };
    }

    function _productKeyRaw(carModel, partName, color) {
        return `${carModel || ''}||${partName || ''}||${color || ''}`;
    }

    function _productKey(carModel, partName, color) {
        return encodeURIComponent(_productKeyRaw(carModel, partName, color));
    }

    function _sumOpeningLotsQty(openingLots) {
        return (Array.isArray(openingLots) ? openingLots : []).reduce(function(sum, lot) {
            return sum + Math.max(0, Number(lot && lot.qty) || 0);
        }, 0);
    }

    // 이력 리셋 스냅샷: openingStock(제품합)과 openingLots(LOT표)가 어긋난 기존 데이터를 보정한다.
    // (예: openingStock=0 인데 openingLots에 525가 남아 LOT표만 부풀던 문제)
    function _syncAfterWipResetOpeningStock(rows) {
        let dirty = false;
        const synced = (Array.isArray(rows) ? rows : []).map(function(row) {
            if (!row) return row;
            const lots = Array.isArray(row.openingLots) ? row.openingLots : [];
            if (!lots.length) return row;
            const lotSum = _sumOpeningLotsQty(lots);
            if (Math.abs((Number(row.openingStock) || 0) - lotSum) < 0.001) return row;
            dirty = true;
            return Object.assign({}, row, { openingStock: lotSum });
        });
        return { rows: synced, dirty: dirty };
    }

    async function _ensureAfterWipHistoryResetsLoaded(forceReload) {
        if (_afterWipHistoryResetsLoaded && !forceReload) return _afterWipHistoryResets;
        const rows = await Storage.getConfigValue(AFTER_WIP_HISTORY_RESET_KEY);
        const synced = _syncAfterWipResetOpeningStock(Array.isArray(rows) ? rows : []);
        _afterWipHistoryResets = synced.rows;
        _afterWipHistoryResetsLoaded = true;
        if (synced.dirty) {
            try { await _saveAfterWipHistoryResets(); } catch (e) { /* 보정 저장 실패 시에도 메모리 보정은 유지 */ }
        }
        return _afterWipHistoryResets;
    }

    async function _saveAfterWipHistoryResets() {
        await Storage.setConfigValue(AFTER_WIP_HISTORY_RESET_KEY, _afterWipHistoryResets);
    }

    async function _ensureResidualHistoryResetsLoaded(forceReload) {
        if (_residualHistoryResetsLoaded && !forceReload) return _residualHistoryResets;
        const rows = await Storage.getConfigValue(RESIDUAL_HISTORY_RESET_KEY);
        _residualHistoryResets = Array.isArray(rows) ? rows : [];
        _residualHistoryResetsLoaded = true;
        return _residualHistoryResets;
    }

    async function _saveResidualHistoryResets() {
        await Storage.setConfigValue(RESIDUAL_HISTORY_RESET_KEY, _residualHistoryResets);
    }

    function _eventStamp(value) {
        return String(value || '')
            .trim()
            .replace(' ', 'T')
            .replace(/(\d{4}-\d{2}-\d{2})T?(\d{2}:\d{2})?(:\d{2})?.*$/, function(_, d, hm, sec) {
                return d + 'T' + (hm || '00:00') + (sec || ':00');
            });
    }

    // dateValue는 시각 없는 'YYYY-MM-DD'로 저장되는 경우가 많아 00:00:00으로 취급된다.
    // 같은 날짜에 이력 리셋이 일어나면 그 날 입력된 보정/수기입출고가 전부 리셋 이전으로
    // 오판되어 반영되지 않는 문제가 있어, dateValue와 createdAt이 같은 날이면
    // createdAt의 정밀 시각으로 순서를 가린다.
    function _isBeforeHistoryReset(dateValue, resetAt, createdAtValue) {
        if (!resetAt) return false;
        const resetStamp = _eventStamp(resetAt);
        if (!dateValue) return _eventStamp(createdAtValue || '') < resetStamp;
        const dateStamp = _eventStamp(dateValue);
        if (createdAtValue) {
            const createdStamp = _eventStamp(createdAtValue);
            if (createdStamp.slice(0, 10) === dateStamp.slice(0, 10)) {
                return createdStamp < resetStamp;
            }
        }
        return dateStamp < resetStamp;
    }

    function _getAfterWipHistoryReset(carModel, partName, color) {
        const canon = _resolveWipColorKey(carModel, partName, color);
        const keys = new Set([
            _productKeyRaw(carModel, partName, color),
            _productKeyRaw(carModel, partName, canon)
        ]);
        return (_afterWipHistoryResets || []).find(function(r) {
            if (!r) return false;
            const rk = (r && r.key) || _productKeyRaw(r.carModel, r.partName, r.color);
            if (keys.has(rk)) return true;
            const rCanon = _resolveWipColorKey(r.carModel, r.partName, r.color);
            return keys.has(_productKeyRaw(r.carModel, r.partName, rCanon));
        }) || null;
    }

    function _wipColorMatches(carModel, partName, recordColor, targetColor) {
        if (!targetColor) return true;
        return _resolveWipColorKey(carModel, partName, recordColor)
            === _resolveWipColorKey(carModel, partName, targetColor);
    }

    function _getResidualHistoryReset(carModel, partName, color) {
        // 레이져 후 재공과 동일하게 컬러 표기 차이(제품/도장)를 흡수한다.
        const canon = (typeof _resolveWipColorKey === 'function')
            ? _resolveWipColorKey(carModel, partName, color)
            : String(color || '').trim();
        const keys = new Set([
            _productKeyRaw(carModel, partName, color),
            _productKeyRaw(carModel, partName, canon)
        ]);
        return (_residualHistoryResets || []).find(function(r) {
            if (!r) return false;
            const rk = (r && r.key) || _productKeyRaw(r.carModel, r.partName, r.color);
            if (keys.has(rk)) return true;
            const rCanon = (typeof _resolveWipColorKey === 'function')
                ? _resolveWipColorKey(r.carModel, r.partName, r.color)
                : String(r.color || '').trim();
            return keys.has(_productKeyRaw(r.carModel, r.partName, rCanon));
        }) || null;
    }

    // 상세 모달 상단 액션 버튼 — 품명과 분리된 전체 폭 행으로 항상 보이게
    function _detailActionBarHtml(buttonsHtml) {
        if (!buttonsHtml) return '';
        return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;align-items:center;">
            ${buttonsHtml}
        </div>`;
    }

    function _historyResetBtnHtml(onClickJs, opts) {
        // adminOnly: 레이져 잔량 수량 초기화(이력만 리셋)는 관리자 전용으로 하드코딩 —
        // 일반 canEditWip(레이져운영자 등)은 버튼 자체가 보이지 않아야 한다.
        const requireAdmin = !!(opts && opts.adminOnly);
        if (requireAdmin ? !_isAdmin() : !_canEditWip()) return '';
        return `<button class="btn btn-sm btn-outline" style="font-size:0.78rem;border-color:var(--accent-red);color:var(--accent-red);"
            onclick="${onClickJs}">
            <span class="material-symbols-outlined" style="font-size:0.9rem;">restart_alt</span> 이력만 리셋
        </button>`;
    }

    function _escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function _decodeArg(value) {
        let s = String(value || '');
        for (let i = 0; i < 2; i++) {
            try {
                const d = decodeURIComponent(s);
                if (d === s) break;
                s = d;
            } catch (e) { break; }
        }
        return s;
    }

    function _isCorruptedLaserIdentity(w) {
        const cm = String(w && w.carModel || '');
        const pn = String(w && w.partName || '');
        if (!cm) return false;
        if (cm.indexOf('%7C%7C') >= 0) return true;
        if (cm.indexOf('||') >= 0 && !pn) return true;
        if ((cm.indexOf('%20') >= 0 || cm.indexOf('%5B') >= 0 || cm.indexOf('%5D') >= 0) && !pn) return true;
        return false;
    }

    async function _repairCorruptedLaserWorkRecords() {
        const all = Storage.getAll(STORE_LASER) || [];
        let repaired = 0;
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            if (!_isCorruptedLaserIdentity(w)) continue;
            const parsed = _parseProductKey(w.carModel);
            if (!parsed.carModel || !parsed.partName) continue;
            if (parsed.carModel === w.carModel && parsed.partName === w.partName && (parsed.color || '') === (w.color || '')) continue;
            try {
                await Storage.update(STORE_LASER, w.id, {
                    carModel: parsed.carModel,
                    partName: parsed.partName,
                    color: parsed.color || w.color || ''
                });
                repaired++;
            } catch (e) {
                console.warn('[LaserWip] repair failed:', w.id, e);
            }
        }
        if (repaired > 0) {
            console.info('[LaserWip] repaired corrupted laser work records:', repaired);
        }
        return repaired;
    }

    function _validateProductIdentity(carModel, partName, color) {
        if (!carModel || !partName) return false;
        if (carModel.indexOf('%7C') >= 0 || carModel.indexOf('||') >= 0) return false;
        if (partName.indexOf('%7C') >= 0 || partName.indexOf('||') >= 0) return false;
        return true;
    }

    // 제품 마스터에 등록된 컬러만 허용 (BK vs BK+CLEAR 같은 고아 버킷 방지)
    function _masterColorsFor(carModel, partName) {
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        if (!car || !part) return [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        return [...new Set(products
            .filter(function(p) {
                return String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
            })
            .map(function(p) { return String(p.color || '').trim(); })
            .filter(Boolean))]
            .sort(function(a, b) { return String(a).localeCompare(String(b), 'ko'); });
    }

    function _assertMasterColor(carModel, partName, color) {
        const colors = _masterColorsFor(carModel, partName);
        if (!colors.length) {
            return { ok: false, colors: colors, message: '제품 마스터에 해당 차종·품명이 없습니다.' };
        }
        const c = String(color || '').trim();
        if (!c) {
            return { ok: false, colors: colors, message: '컬러를 선택해 주세요. (제품 마스터 값만 가능)' };
        }
        if (colors.indexOf(c) < 0) {
            return {
                ok: false,
                colors: colors,
                message: '컬러는 제품 마스터에 등록된 값만 사용할 수 있습니다: ' + colors.join(', ')
            };
        }
        return { ok: true, colors: colors, color: c };
    }

    function _isResidualOnlyRecord(w) {
        if (!w) return false;
        return !!(w.isResidualManualIn || w.isResidualManualOut || w.isResidualLotAdjust || w.isResidualAuditOnly);
    }

    function _colorSelectOptionsHtml(colors, selected) {
        const sel = String(selected || '').trim();
        return '<option value="">-- 컬러 선택 --</option>' +
            (colors || []).map(function(c) {
                return `<option value="${_esc(c)}"${c === sel ? ' selected' : ''}>${_esc(c)}</option>`;
            }).join('');
    }

    // 도장 LOT(YYMMDD) / 사출 LOT 문자열 정규화 — 보정 저장·집계 키 일치용
    function _normalizePaintLot(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw || raw === '-') return '-';
        const s = raw.replace(/-/g, '');
        if (/^\d{6}$/.test(s)) return s;
        if (/^\d{8}$/.test(s)) return s.slice(2, 8);
        if (s.length > 8) return s.slice(2, 8);
        return s || raw;
    }

    // 요약 카드용 도장 LOT 표시 (중복 제거 · 오름차순)
    function _paintLotSummaryText(values) {
        const list = [...new Set((values || []).map(function(v) {
            return _normalizePaintLot(v);
        }).filter(function(v) { return v && v !== '-'; }))].sort();
        return list.length ? list.join(', ') : '-';
    }

    function _isUnassignedPaintLot(paintLot) {
        const p = String(paintLot == null ? '' : paintLot).trim();
        return !p || p === '-' || p === 'LOT 미지정';
    }

    function _isUnassignedInjLot(lotNo) {
        const l = String(lotNo == null ? '' : lotNo).trim();
        return !l || l === '-' || l === '(미확인)' || l === '수기 잔량입고';
    }

    // 페이지 상단 LOT 미지정 경고 배너
    // items: [{ carModel, partName, color, qty, onClick }]
    function _unassignedLotWarnHtml(items, opts) {
        const list = (items || []).filter(function(i) { return (Number(i.qty) || 0) > 0; });
        if (!list.length) return '';
        const accent = (opts && opts.accent) || 'var(--accent-orange,#f59e0b)';
        const hint = (opts && opts.hint) || '품목 상세에서 LOT 지정·보정으로 도장/사출 LOT를 등록하세요.';
        const title = (opts && opts.title) || 'LOT 미지정 경고';
        const bg = (opts && opts.bg) || 'rgba(245,158,11,0.10)';
        const border = (opts && opts.border) || 'rgba(245,158,11,0.38)';
        const totalQty = list.reduce(function(s, i) { return s + (Number(i.qty) || 0); }, 0);
        const preview = list.slice(0, 6).map(function(i) {
            const label = [i.carModel, i.partName, i.color && i.color !== '-' ? i.color : '']
                .filter(Boolean).join(' · ');
            const qtyTxt = UIUtils.formatNumber(i.qty) + ' EA';
            if (i.onClick) {
                return `<button type="button" onclick="${i.onClick}"
                    style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px dashed rgba(245,158,11,0.55);
                           border-radius:999px;background:rgba(255,255,255,0.7);cursor:pointer;font-size:0.74rem;
                           color:var(--text-primary);font-family:inherit;white-space:nowrap;">
                    ${_esc(label)} <strong style="color:${accent};">${qtyTxt}</strong>
                </button>`;
            }
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px dashed rgba(245,158,11,0.55);
                           border-radius:999px;background:rgba(255,255,255,0.7);font-size:0.74rem;white-space:nowrap;">
                    ${_esc(label)} <strong style="color:${accent};">${qtyTxt}</strong>
                </span>`;
        }).join('');
        const more = list.length > 6
            ? `<span style="font-size:0.74rem;color:var(--text-muted);">+${list.length - 6}종</span>`
            : '';
        return `
        <div style="margin-bottom:14px;padding:12px 14px;background:${bg};
                    border:1px solid ${border};border-radius:8px;line-height:1.45;">
            <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="font-size:1.15rem;color:${accent};flex-shrink:0;margin-top:1px;">warning</span>
                <div style="flex:1;min-width:200px;">
                    <div style="font-size:0.88rem;font-weight:700;color:${accent};">
                        ${_esc(title)}
                        <span style="font-weight:600;color:var(--text-secondary);margin-left:6px;">
                            ${list.length}종 · ${UIUtils.formatNumber(totalQty)} EA
                        </span>
                    </div>
                    <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:3px;">${_esc(hint)}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;">
                        ${preview}${more}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _normalizeInjLot(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s || s === '-') return '-';
        return s.split(',').map(function(p) { return p.trim(); }).filter(Boolean).join(', ');
    }

    // ── 사출 LOT / 도장 작업LOT 입력 형식 검증 (YYMMDD 6자리, 미래 날짜 금지) ──
    // YYMMDD 값이 오늘보다 미래인지 확인
    function _isFutureLotDate(value) {
        const v = String(value == null ? '' : value).trim();
        if (!/^\d{6}$/.test(v)) return false;
        const dateStr = '20' + v.substring(0, 2) + '-' + v.substring(2, 4) + '-' + v.substring(4, 6);
        const today = new Date().toISOString().slice(0, 10);
        return dateStr > today;
    }

    // 저장 시 사용 — 구체적인 사유를 담은 오류 메시지 반환(유효하면 null)
    function _lotValidationMessage(value) {
        const v = String(value == null ? '' : value).trim();
        if (v.length !== 6 || !/^\d{6}$/.test(v)) return 'YYMMDD 형식(6자리 숫자)으로 입력해 주세요.';
        const mm = parseInt(v.substring(2, 4), 10);
        const dd = parseInt(v.substring(4, 6), 10);
        if (mm < 1 || mm > 12) return '월(MM)은 01~12 범위여야 합니다.';
        if (dd < 1 || dd > 31) return '일(DD)은 01~31 범위여야 합니다.';
        if (_isFutureLotDate(v)) return '미래 날짜는 입력할 수 없습니다.';
        return null;
    }

    // 입력 중(oninput): 숫자만 남기고 6자리로 제한
    function _validateLotFormat(input) {
        if (!input) return;
        input.value = input.value.replace(/[^0-9]/g, '');
        if (input.value.length > 6) input.value = input.value.substring(0, 6);
    }

    // 포커스 아웃(onblur): 형식 검증 — YYMMDD, 월 01~12, 일 01~31, 미래 날짜 금지
    function _checkLotFormat(input) {
        if (!input) return;
        const value = input.value.trim();
        if (!value) return; // 빈 값은 저장 시점에 별도로 필수 검증
        if (value.length !== 6) {
            UIUtils.toast('LOT은 YYMMDD 형식으로 6자리여야 합니다.', 'warning');
            input.focus();
            return;
        }
        const mm = parseInt(value.substring(2, 4), 10);
        const dd = parseInt(value.substring(4, 6), 10);
        if (mm < 1 || mm > 12) {
            UIUtils.toast('월(MM)은 01~12 범위여야 합니다.', 'warning');
            input.focus();
            return;
        }
        if (dd < 1 || dd > 31) {
            UIUtils.toast('일(DD)은 01~31 범위여야 합니다.', 'warning');
            input.focus();
            return;
        }
        if (_isFutureLotDate(value)) {
            UIUtils.toast('미래 날짜는 입력할 수 없습니다.', 'warning');
            input.focus();
        }
    }

    function _residualLotKey(paintLot, injLot) {
        return _normalizePaintLot(paintLot) + '|' + _normalizeInjLot(injLot);
    }

    function _workResidualLotKeys(w) {
        const paintLots = Array.isArray(w.paintLots) && w.paintLots.length ? w.paintLots : [];
        const paintLot = paintLots.length && paintLots[0] && paintLots[0].paintDate
            ? _normalizePaintLot(paintLots[0].paintDate)
            : _normalizePaintLot(w.paintDate || w.date || '');
        const injLots = paintLots.length
            ? paintLots.map(function(l) { return _normalizeInjLot(l && l.lotNo || ''); }).filter(function(v) { return v && v !== '-'; })
            : [_normalizeInjLot(w.paintLot || w.lotNo || '')].filter(function(v) { return v && v !== '-'; });
        const injStr = injLots.length ? injLots.join(', ') : '-';
        return [_residualLotKey(paintLot, injStr)];
    }

    function _findResidualLotSourceWorks(carModel, partName, color, paintLot, injLot) {
        const targetKey = _residualLotKey(paintLot, injLot);
        return (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return false;
            if (color && (w.color || '') !== color) return false;
            if (w.isManualOut || w.isResidualManualIn || w.isResidualManualOut) return false;
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (resQty <= 0) return false;
            return _workResidualLotKeys(w).some(function(k) { return k === targetKey; });
        });
    }

    function _getResidualLotQtyFromDetail(detail, paintLot, injLot) {
        const key = _residualLotKey(paintLot, injLot);
        const row = (detail && detail.lots || []).find(function(l) {
            return _residualLotKey(l.paintLot, l.injLot) === key;
        });
        return row ? Math.max(0, Number(row.qty) || 0) : 0;
    }

    async function _neutralizePriorLotAdjustRecords(carModel, partName, color, paintLot, injLot) {
        const targetKey = _residualLotKey(paintLot, injLot);
        const items = Storage.getAll(STORE_LASER) || [];
        for (let i = 0; i < items.length; i++) {
            const w = items[i];
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) continue;
            if (color && (w.color || '') !== color) continue;
            if (!w.isResidualLotAdjust || w.isResidualAuditOnly) continue;
            if (_residualLotKey(w.residualPaintLot, w.lotNo) !== targetKey) continue;
            await Storage.update(STORE_LASER, w.id, { isResidualAuditOnly: true });
        }
    }

    // 수기 입/출고 모달을 열 때 팝업에서 넘어온 품목을 드롭다운에 자동 선택한다.
    // 제품 목록(잔량 대상)에 없는 품목이면 조용히 무시되고 수동 선택으로 진행 가능.
    function _applyPrefillSelects(prefill, carId, partId, colorId, onCarChange, onPartChange) {
        if (!prefill) return;
        setTimeout(function() {
            const carEl = document.getElementById(carId);
            if (carEl && prefill.carModel) {
                carEl.value = prefill.carModel;
                if (typeof onCarChange === 'function') { try { onCarChange(); } catch (e) {} }
            }
            setTimeout(function() {
                const partEl = document.getElementById(partId);
                if (partEl && prefill.partName) {
                    partEl.value = prefill.partName;
                    if (typeof onPartChange === 'function') { try { onPartChange(); } catch (e) {} }
                }
                setTimeout(function() {
                    const colEl = document.getElementById(colorId);
                    if (colEl && prefill.color) colEl.value = prefill.color;
                }, 0);
            }, 0);
        }, 0);
    }

    // 재공/잔량 상세 팝업의 '수량 수정'(절대 수량 지정) — 관리자·레이져운영자만
    function openAdjustAfterLaserModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const r = (_calcWip()).find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.wip) || 0) : 0;
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 수량 수정', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 재공품 <strong style="color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(currentQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjAfterDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjAfterQty" value="${currentQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjAfterNote" placeholder="수량 수정">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
                입력한 수량과 현재 재고의 차이만큼 수동입고/출고로 반영됩니다.
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustAfterLaserModal('${_jsArg(keyEnc || '')}')">저장</button>
        `, 'md');
    }

    async function saveAdjustAfterLaserModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) { UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning'); return; }

        const r = (_calcWip()).find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.wip) || 0) : 0;
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjAfterQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjAfterDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjAfterNote') || {}).value || '').trim() || '수량 수정';
        const diff = targetQty - currentQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (diff > 0) {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: diff, machine: '', note,
                isManual: true, author: _currentUserName()
            });
        } else {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: Math.abs(diff), machine: '', note,
                isManual: true, isManualOut: true, author: _currentUserName()
            });
        }

        UIUtils.closeModal();
        UIUtils.toast(`재공품 수량이 ${UIUtils.formatNumber(currentQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
    }

    function openAdjustResidualModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const r = _calcLaserResidualWip().find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const packUnit = r ? Number(r.packUnit) || 0 : 0;
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 수량 수정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 잔량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(currentQty)} EA</strong>
                    ${packUnit ? `<span style="margin-left:8px;color:var(--text-muted);">포장단위 ${UIUtils.formatNumber(packUnit)}</span>` : ''}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjResDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 잔량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjResQty" value="${currentQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjResNote" placeholder="수량 수정">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
                입력한 잔량과 현재 잔량의 차이만큼 수동입고/출고로 반영됩니다.
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustResidualModal('${_jsArg(keyEnc || '')}')">저장</button>
        `, 'md');
    }

    async function saveAdjustResidualModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) { UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning'); return; }

        const r = _calcLaserResidualWip().find(x => x.carModel === carModel && x.partName === partName && (x.color || '') === color);
        const currentQty = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const packUnit = r ? Number(r.packUnit) || 0 : 0;
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjResQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjResDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjResNote') || {}).value || '').trim() || '수량 수정';
        const diff = targetQty - currentQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (diff > 0) {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: diff, note, packUnit,
                isManual: true, isResidualManualIn: true, author: _currentUserName()
            });
        } else {
            await Storage.add(STORE_LASER, {
                date, carModel, partName, color, quantity: Math.abs(diff), note, packUnit,
                isManual: true, isResidualManualOut: true, author: _currentUserName()
            });
        }

        UIUtils.closeModal();
        UIUtils.toast(`잔량이 ${UIUtils.formatNumber(currentQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
    }

    // 재공/잔량 상세 팝업의 '수량 수정'(수동입고/출고) 진입 — 관리자·레이져운영자만
    function adjustAfterLaserFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const prefill = _parseProductKey(keyEnc);
        if (mode === 'out') openAfterLaserOut(prefill); else openAfterLaserInput(prefill);
    }
    function adjustResidualFromPopup(keyEnc, mode) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        _closeDetailPopup();
        const prefill = _parseProductKey(keyEnc);
        if (mode === 'out') openResidualOut(prefill); else openResidualInput(prefill);
    }

    const TABS = [
        { id: 'standby',     label: '레이져 대기품 현황',    icon: 'hourglass_top' },
        { id: 'after-laser', label: '레이져 후 재공품 현황', icon: 'bolt' },
        { id: 'after-laser-residual', label: '레이져 잔량 현황', icon: 'inventory_2' }
    ];
    const TAB_STATE_KEY = 'mes_laser_wip_tab';

    function _saveActiveTab() {
        try { sessionStorage.setItem(TAB_STATE_KEY, _activeTab); } catch (e) { /* 무시 */ }
    }

    function _restoreActiveTab() {
        try {
            const saved = sessionStorage.getItem(TAB_STATE_KEY);
            if (saved && TABS.some(function(t) { return t.id === saved; })) {
                _activeTab = saved;
            }
        } catch (e) { /* 무시 */ }
    }

    function _actionBtn(label, icon, onclick, color) {
        const col = color || 'var(--text-primary)';
        return `<button type="button" onclick="${onclick}"
            style="display:flex;align-items:center;gap:5px;padding:6px 13px;border:1px solid var(--border-color);
                   border-radius:7px;background:#fff;cursor:pointer;font-size:0.84rem;color:${col};
                   font-family:inherit;white-space:nowrap;transition:background 0.15s;"
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='#fff'">
            <span class="material-symbols-outlined" style="font-size:16px;color:${col};">${icon}</span>${label}
        </button>`;
    }

    function _tabNav() {
        // 재공품 현황 레이아웃(보관 위치/박스 배치 편집기)은 대기품·후 재공품 탭에서만 의미가 있다(잔량 탭 제외).
        const layoutAction = (_activeTab === 'standby' || _activeTab === 'after-laser')
            ? _actionBtn('재공품 현황 레이아웃', 'map', "LaserStandbyModule.openLayout()")
            : '';
        const standbyActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openManualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserStandbyModule.openStandbyOutModal()", 'var(--accent-red)')}` : '';
        const afterActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openAfterLaserOut()", 'var(--accent-red)')}` : '';
        const residualActions = _canEditWip() ? `
            ${_actionBtn('수동입고', 'arrow_downward', "LaserWipModule.openResidualInput()", 'var(--accent-green)')}
            ${_actionBtn('수동출고', 'arrow_upward',   "LaserWipModule.openResidualOut()", 'var(--accent-red)')}` : '';
        const currentActions = _activeTab === 'standby' ? standbyActions
            : (_activeTab === 'after-laser' ? afterActions : residualActions);
        return `
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
            ${layoutAction}
            ${currentActions}
        </div>`;
    }
    function render(container) {
        _restoreActiveTab();
        const activePageId = _activeTab === 'standby' ? 'laser-wip-standby'
            : (_activeTab === 'after-laser' ? 'laser-wip-after' : 'laser-wip-residual');
        container.innerHTML = `
        <div class="fade-in-up">
            ${LaserProcessUI.renderSection(activePageId)}
            <div id="wipTabNav">${_tabNav()}</div>
            <div id="wipTabContent"></div>
        </div>`;
        _repairCorruptedLaserWorkRecords().finally(function() {
            Promise.all([
                _ensureAfterWipHistoryResetsLoaded(),
                _ensureResidualHistoryResetsLoaded()
            ]).finally(function() {
                _renderTabContent();
            });
        });
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;
        _saveActiveTab();
        const container = document.getElementById('contentArea');
        if (container) { render(container); return; }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    function openTab(tab) {
        _activeTab = TABS.some(t => t.id === tab) ? tab : 'standby';
        _saveActiveTab();
        if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate('laser-wip');
            return;
        }
        const navEl = document.getElementById('wipTabNav');
        if (navEl) navEl.innerHTML = _tabNav();
        _renderTabContent();
    }

    // ── 탭 컨텐츠 렌더 ───────────────────────────────────────────────────
    function _renderTabContent() {
        const el = document.getElementById('wipTabContent');
        if (!el) return;
        if (_activeTab === 'standby') {
            _renderStandbyTab(el);
        } else if (_activeTab === 'after-laser') {
            _renderAfterLaserTab(el);
        } else {
            _renderAfterLaserResidualTab(el);
        }
    }

    // ── 탭 1: 레이져 대기품 현황 ─────────────────────────────────────────
    function _renderStandbyTab(el) {
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;
                        background:rgba(245,158,11,0.07);border-left:3px solid var(--accent-orange);border-radius:0 8px 8px 0;">
                <span class="material-symbols-outlined" style="font-size:1.2rem;color:var(--accent-orange);">hourglass_top</span>
                <div>
                    <div style="font-size:0.92rem;font-weight:700;color:var(--accent-orange);">레이져 대기품 현황</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);">도장 완료 후 레이져 공정 대기 재공품</div>
                </div>
            </div>
            <div id="lsbContentWrapper"></div>`;

        const wrapper = document.getElementById('lsbContentWrapper');
        if (wrapper && typeof LaserStandbyModule !== 'undefined') {
            LaserStandbyModule.renderContentOnly(wrapper);
        }
    }

    // ── 탭 2: 레이져 후 재공품 현황 ──────────────────────────────────────
    function _renderAfterLaserTab(el) {
        const rows       = _calcWip();
        const totalLaser = rows.reduce((s,r) => s + r.laserQty, 0);
        const totalPaint = rows.reduce((s,r) => s + r.paintBQty, 0);
        const totalWip   = rows.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
        const waitCount  = rows.filter(r => r.wip > 0).length;
        const unassignedWarn = _unassignedLotWarnHtml(
            rows.filter(function(r) { return (Number(r.unassignedQty) || 0) > 0; })
                .map(function(r) {
                    const encKey = _productKey(r.carModel, r.partName, r.color || '');
                    return {
                        carModel: r.carModel,
                        partName: r.partName,
                        color: r.color,
                        qty: r.unassignedQty,
                        onClick: "LaserWipModule.showWipDetail('" + encKey + "')"
                    };
                }),
            {
                accent: 'var(--accent-orange,#f59e0b)',
                hint: '도장/사출 LOT가 없는 재공 재고가 있습니다. 품목 상세에서 LOT 보정·수동입출고로 등록하세요.'
            }
        );

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carWip = items.reduce((s,r) => s + (r.wip > 0 ? r.wip : 0), 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => {
                        const wipColor   = r.wip > 0 ? 'var(--accent-green)' : (r.wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
                        const displayQty = Math.max(0, Number(r.wip) || 0);
                        const excessQty  = r.wip < 0 ? Math.abs(Number(r.wip) || 0) : 0;
                        const statusText = r.wip > 0 ? '도장 투입 대기'
                            : (excessQty > 0 ? `오류(초과 ${excessQty.toLocaleString('ko-KR')})` : '소진');
                        const encKey = _productKey(r.carModel, r.partName, r.color || '');
                        const paintLotText = r.paintLotSummary || '-';
                        return `<tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                                    onclick="LaserWipModule.showWipDetail('${encKey}', event)"
                                    onmouseover="this.style.background='rgba(139,92,246,0.06)'"
                                    onmouseout="this.style.background=''">
                            <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:140px;max-width:200px;">
                                <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                            </td>
                            <td style="padding:5px 6px;font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${_wipColorDisplayHtml(r.carModel, r.partName, r.color || '')}</td>
                            <td style="padding:5px 6px;font-family:monospace;font-size:0.72rem;color:var(--accent-green);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px;" title="${_esc(paintLotText)}">${_esc(paintLotText)}</td>
                            <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                                <span style="font-size:0.9rem;font-weight:800;color:${wipColor};">${displayQty.toLocaleString('ko-KR')}</span>
                                <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                            </td>
                            <td style="padding:5px 8px;font-size:0.7rem;color:${wipColor};white-space:nowrap;">${statusText}
                                <span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;opacity:0.5;margin-left:2px;">open_in_new</span>
                            </td>
                        </tr>`;
                    }).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;break-inside:avoid;margin-bottom:10px;">
                    <div style="background:var(--accent-purple,#7c3aed);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">재공 <strong>${UIUtils.formatNumber(carWip)}</strong> EA</div>
                    </div>
                    <table style="width:max-content;min-width:100%;border-collapse:collapse;background:var(--bg-primary);table-layout:auto;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 6px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">컬러</th>
                                <th style="padding:4px 6px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">도장 LOT</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">재공품</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">상태</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="5" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="column-count:2;column-gap:10px;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 레이져 후 재공품이 없습니다.
               </div>`;

        el.innerHTML = `
            ${unassignedWarn}
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card purple">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalLaser)}</div>
                    <div class="stat-card-label">검사 양품 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalPaint)}</div>
                    <div class="stat-card-label">도장 투입 (EA)</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalWip)}</div>
                    <div class="stat-card-label">현재 재공품 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${waitCount}</div>
                    <div class="stat-card-label">대기 품종 수</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 재공 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 완료 − 도장 투입 = 재공품 (레이져→도장 공정 제품만)</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 입출고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">입고(레이져 완료) · 출고(도장 투입) 내역을 분리 표시</span>
                </div>
                <div class="card-body" style="padding:0;">
                    ${_afterLaserFlowHistHtml()}
                </div>
            </div>
            ${_canEditWip() ? `
            <div class="card" style="margin-top:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">edit_note</span> 수기 입출고 내역 관리
                        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(관리자·레이져운영자 전용)</span>
                    </h4>
                    ${_actionBtn('신규 등록', 'add', "LaserWipModule.openAfterLaserInput()", 'var(--accent-green)')}
                </div>
                <div class="card-body" style="padding:0;">
                    ${_manualEntriesTableHtml()}
                </div>
            </div>` : ''}`;
    }

    // ── 레이져 후 재공품 수기 입출고 내역 관리 (관리자 전용) ──────────────
    function _afterLaserManualEntries() {
        return (Storage.getAll(STORE_LASER) || [])
            .filter(w => w.isManual && !w.isResidualManualIn && !w.isResidualManualOut)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function _manualEntriesTableHtml() {
        const entries = _afterLaserManualEntries();
        if (!entries.length) {
            return `<div style="text-align:center;padding:24px;color:var(--text-muted);">등록된 수기 입출고 내역이 없습니다.</div>`;
        }
        return `
        <div class="data-table-wrapper">
            <table class="data-table" style="font-size:0.83rem;">
                <thead><tr>
                    <th>날짜</th><th>구분</th><th>차종</th><th>품명</th><th>컬러</th>
                    <th style="text-align:right;">수량(EA)</th><th>비고</th><th>관리</th>
                </tr></thead>
                <tbody>
                    ${entries.map(w => {
                        const isOut = !!w.isManualOut;
                        const badge = isOut
                            ? `<span style="color:var(--accent-red);font-weight:700;">출고</span>`
                            : `<span style="color:var(--accent-green);font-weight:700;">입고</span>`;
                        return `<tr>
                            <td style="white-space:nowrap;">${_esc(w.date || '-')}</td>
                            <td>${badge}</td>
                            <td>${_esc(w.carModel || '-')}</td>
                            <td>${_esc(w.partName || '-')}</td>
                            <td>${_esc(w.color || '-')}</td>
                            <td style="text-align:right;">${UIUtils.formatNumber(w.quantity || 0)}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${_esc(w.note || '-')}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-sm btn-outline" onclick="LaserWipModule.openEditManualEntry('${w.id}')">수정</button>
                                ${_isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="LaserWipModule.removeManualEntry('${w.id}')">삭제</button>` : ''}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function openEditManualEntry(id) {
        if (!_canEditWip()) {
            UIUtils.toast('레이져 후 재공품 입력 권한이 있는 사용자만 수정할 수 있습니다.', 'warning');
            return;
        }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        if (!entry) { UIUtils.toast('내역을 찾을 수 없습니다.', 'warning'); return; }
        const isOut = !!entry.isManualOut;
        const products = _getPaintBProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const carModel = entry.carModel || '';
        const partName = entry.partName || '';
        const color = entry.color || '';
        const partNames = [...new Set(products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        if (partName && partNames.indexOf(partName) < 0) partNames.push(partName);
        const colors = _masterColorsFor(carModel, partName);
        if (color && colors.indexOf(color) < 0) colors.push(color);
        const paintLot = _normalizePaintLot(entry.paintDate || entry.paintLot || '') || '';
        const injLot = String(entry.lotNo || entry.paintLot || '').trim();

        UIUtils.showModal(`레이져 후 재공품 수기 ${isOut ? '출고' : '입고'} 수정`, `
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">컬러는 제품 마스터에 등록된 값만 선택할 수 있습니다.</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwEditDate" value="${_esc(entry.date || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwEditCarModel" onchange="LaserWipModule.onEditManualCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${_esc(m)}"${m === carModel ? ' selected' : ''}>${_esc(m)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwEditPartName" onchange="LaserWipModule.onEditManualPartChange()">
                        <option value="">-- 품명 선택 --</option>
                        ${partNames.map(n => `<option value="${_esc(n)}"${n === partName ? ' selected' : ''}>${_esc(n)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwEditColor">
                        ${_colorSelectOptionsHtml(colors, color)}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수량 (EA)</label>
                    <input type="number" class="form-input" id="lwEditQty" min="1" value="${_esc(entry.quantity || 0)}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwEditNote" value="${_esc(entry.note || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">도장 LOT (YYMMDD)</label>
                    <input type="text" class="form-input" id="lwEditPaintLot" value="${_esc(paintLot === '-' ? '' : paintLot)}" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 LOT (YYMMDD)</label>
                    <input type="text" class="form-input" id="lwEditInjLot" value="${_esc(injLot)}" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveEditManualEntry('${id}')">저장</button>
        `, 'lg');
    }

    function onEditManualCarChange() {
        const carModel = (document.getElementById('lwEditCarModel') || {}).value || '';
        const products = _getPaintBProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const partEl = document.getElementById('lwEditPartName');
        if (partEl) {
            partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                partNames.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');
        }
        const colorEl = document.getElementById('lwEditColor');
        if (colorEl) colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onEditManualPartChange() {
        const carModel = (document.getElementById('lwEditCarModel') || {}).value || '';
        const partName = (document.getElementById('lwEditPartName') || {}).value || '';
        const colorEl = document.getElementById('lwEditColor');
        if (colorEl) colorEl.innerHTML = _colorSelectOptionsHtml(_masterColorsFor(carModel, partName), '');
    }

    async function saveEditManualEntry(id) {
        if (!_canEditWip()) return;
        const date     = (document.getElementById('lwEditDate')     || {}).value || '';
        const carModel = (document.getElementById('lwEditCarModel') || {}).value.trim() || '';
        const partName = (document.getElementById('lwEditPartName') || {}).value.trim() || '';
        const color    = (document.getElementById('lwEditColor')    || {}).value.trim() || '';
        const quantity = parseInt((document.getElementById('lwEditQty') || {}).value || '0', 10);
        const note     = (document.getElementById('lwEditNote')     || {}).value.trim() || '';
        const paintDate = ((document.getElementById('lwEditPaintLot') || {}).value || '').trim();
        const lotNo = ((document.getElementById('lwEditInjLot') || {}).value || '').trim();

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheck = _assertMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        if (paintDate) {
            const err = _lotValidationMessage(paintDate);
            if (err) { UIUtils.toast('도장 LOT: ' + err, 'warning'); return; }
        }
        if (lotNo) {
            const err = _lotValidationMessage(lotNo);
            if (err) { UIUtils.toast('사출 LOT: ' + err, 'warning'); return; }
        }

        await Storage.update(STORE_LASER, id, {
            date, carModel, partName, color: colorCheck.color, quantity, note,
            paintDate: paintDate || '',
            lotNo: lotNo || '',
            paintLot: lotNo || paintDate || ''
        });
        UIUtils.closeModal();
        UIUtils.toast('수기 내역이 수정되었습니다.', 'success');
        refresh();
    }

    function removeManualEntry(id) {
        if (!_isAdmin()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        UIUtils.confirm('이 수기 등록 내역을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE_LASER, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            refresh();
        });
    }

    function _summaryCard(label, value, icon, color) {
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:1.1rem;color:${color};">${icon}</span>
                <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:500;">${label}</span>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:${color};">${UIUtils.formatNumber(value)}
                <span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">EA</span>
            </div>
        </div>`;
    }

    function _renderAfterLaserResidualTab(el) {
        const rows          = _calcLaserResidualWip();
        const totalResidual = rows.reduce((s,r) => s + r.residualQty, 0);
        const totalGood     = rows.reduce((s,r) => s + r.goodQty, 0);
        const totalShip     = rows.reduce((s,r) => s + r.fullBoxQty, 0);
        const unassignedWarn = _unassignedLotWarnHtml(
            rows.filter(function(r) { return (Number(r.unassignedQty) || 0) > 0; })
                .map(function(r) {
                    const encKey = _productKey(r.carModel, r.partName, r.color || '');
                    return {
                        carModel: r.carModel,
                        partName: r.partName,
                        color: r.color,
                        qty: r.unassignedQty,
                        onClick: "LaserWipModule.showResidualDetail('" + encKey + "')"
                    };
                }),
            {
                accent: 'var(--accent-orange,#f59e0b)',
                hint: '도장/사출 LOT가 없는 잔량이 있습니다. 품목 상세의 「LOT 지정」으로 등록하세요.'
            }
        );
        // 전체 품목을 한 번에 훑어서, LOT 표 합계와 이력 재생값이 어긋나는 품목을 자동으로 찾아낸다.
        const mismatchWarn = _unassignedLotWarnHtml(
            rows.filter(function(r) { return r.hasMismatch; })
                .map(function(r) {
                    const encKey = _productKey(r.carModel, r.partName, r.color || '');
                    return {
                        carModel: r.carModel,
                        partName: r.partName,
                        color: r.color,
                        qty: Math.abs((Number(r.flatTotal) || 0) - (Number(r.residualQty) || 0)),
                        onClick: "LaserWipModule.showResidualDetail('" + encKey + "')"
                    };
                }),
            {
                accent: 'var(--accent-red,#dc2626)',
                bg: 'rgba(220,38,38,0.08)',
                border: 'rgba(220,38,38,0.35)',
                title: '잔량 불일치 경고',
                hint: 'LOT 표 합계와 전체 이력 재생값이 다른 품목입니다. 클릭해서 상세의 경고 배너와 이력을 확인하세요.'
            }
        );

        // 차종별 그룹핑
        const carGroups = {};
        rows.forEach(r => {
            const car = r.carModel || '차종 미지정';
            if (!carGroups[car]) carGroups[car] = [];
            carGroups[car].push(r);
        });

        const carCards = Object.entries(carGroups)
            .sort(([a],[b]) => a.localeCompare(b, 'ko'))
            .map(([carModel, items]) => {
                const carResidual = items.reduce((s,r) => s + r.residualQty, 0);
                const itemRows = items
                    .sort((a,b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                    .map(r => {
                        const encKey = _productKey(r.carModel, r.partName, r.color || '');
                        const paintLotText = r.paintLotSummary || '-';
                        return `
                    <tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                        onclick="LaserWipModule.showResidualDetail('${encKey}', event)"
                        onmouseover="this.style.background='rgba(245,158,11,0.07)'"
                        onmouseout="this.style.background=''">
                        <td style="padding:5px 8px;font-size:0.8rem;font-weight:600;line-height:1.28;white-space:normal;word-break:break-word;min-width:140px;max-width:200px;">
                            <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${_esc(r.partName)}">${_esc(r.partName)}</span>
                        </td>
                        <td style="padding:5px 6px;font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${r.color && r.color !== '-' ? _esc(r.color) : ''}</td>
                        <td style="padding:5px 6px;font-family:monospace;font-size:0.72rem;color:var(--accent-green);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px;" title="${_esc(paintLotText)}">${_esc(paintLotText)}</td>
                        <td style="padding:5px 8px;text-align:right;white-space:nowrap;">
                            <span style="font-size:0.9rem;font-weight:800;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(r.residualQty)}</span>
                            <span style="font-size:0.68rem;color:var(--text-muted);margin-left:1px;">EA</span>
                        </td>
                        <td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}
                            <span class="material-symbols-outlined" style="font-size:11px;vertical-align:middle;opacity:0.5;margin-left:2px;">open_in_new</span>
                        </td>
                    </tr>`;
                    }).join('');
                return `
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;break-inside:avoid;margin-bottom:10px;">
                    <div style="background:var(--accent-orange,#f59e0b);color:#fff;padding:7px 10px;
                                display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:700;font-size:0.85rem;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>
                            ${_esc(carModel)}
                            <span style="font-size:0.7rem;font-weight:400;opacity:0.85;">${items.length}종</span>
                        </span>
                        <div style="font-size:0.75rem;">잔량 <strong>${UIUtils.formatNumber(carResidual)}</strong> EA</div>
                    </div>
                    <table style="width:max-content;min-width:100%;border-collapse:collapse;background:var(--bg-primary);table-layout:auto;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);">품명</th>
                                <th style="padding:4px 6px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">컬러</th>
                                <th style="padding:4px 6px;text-align:left;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">도장 LOT</th>
                                <th style="padding:4px 8px;text-align:right;font-size:0.68rem;color:var(--accent-orange,#f59e0b);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">잔량</th>
                                <th style="padding:4px 8px;font-size:0.68rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;">포장단위</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="5" style="padding:12px 8px;text-align:center;font-size:0.8rem;color:var(--text-muted);">내역 없음</td></tr>'}</tbody>
                    </table>
                </div>`;
            }).join('');

        const inventoryHtml = carCards
            ? `<div style="column-count:2;column-gap:10px;">${carCards}</div>`
            : `<div style="text-align:center;padding:40px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:2.5rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                현재 잔량이 없습니다.
               </div>`;

        el.innerHTML = `
            ${mismatchWarn}
            ${unassignedWarn}
            <div class="stat-cards" style="margin-bottom:16px;">
                <div class="stat-card orange">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalResidual)}</div>
                    <div class="stat-card-label">총 재고 (EA)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${rows.length}</div>
                    <div class="stat-card-label">잔량 품목 수</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalShip)}</div>
                    <div class="stat-card-label">출하가능 (EA)</div>
                </div>
                <div class="stat-card blue">
                    <div class="stat-card-value">${UIUtils.formatNumber(totalGood)}</div>
                    <div class="stat-card-label">총 양품 (EA)</div>
                </div>
            </div>
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">inventory_2</span> 잔량 재고 현황</h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">포장단위 미달로 출하 제외된 잔량</span>
                </div>
                <div class="card-body" style="padding:16px;display:flex;flex-direction:column;gap:14px;">
                    ${inventoryHtml}
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_rows</span> 잔량 상세 내역 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">(입출고 현황)</span></h4>
                    <span style="font-size:0.75rem;color:var(--text-muted);">레이져 작업 기준 잔량 발생 내역 · 수동입고/출고 포함</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">차종</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">품명</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">컬러</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">레이져작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">도장작업일</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">사출LOT</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">양품</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-green);white-space:nowrap;">출하가능</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">포장단위</th>
                                <th style="padding:9px 12px;text-align:right;font-weight:600;color:var(--accent-orange,#f59e0b);white-space:nowrap;">잔량</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:600;color:var(--text-secondary);white-space:nowrap;">상태</th>
                                <th style="padding:9px 12px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap;">작성자</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(function() {
                                const manualEntries = _residualManualEntries();
                                if (rows.length === 0 && manualEntries.length === 0) {
                                    return `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">
                                        <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">check_circle</span>
                                        레이져 잔량 입고 대상이 없습니다.
                                       </td></tr>`;
                                }
                                const combined = [
                                    ...rows.map(r => ({ date: r.laserDates[0] || '', html: _laserResidualRow(r) })),
                                    ...manualEntries.map(w => ({ date: w.date || '', html: _manualResidualHistoryRow(w) }))
                                ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
                                return combined.map(item => item.html).join('');
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
            ${_canEditWip() ? `
            <div class="card" style="margin-top:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">edit_note</span> 잔량 수기 입출고 내역 관리
                        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(관리자·레이져운영자 전용)</span>
                    </h4>
                    ${_actionBtn('신규 등록', 'add', "LaserWipModule.openResidualInput()", 'var(--accent-green)')}
                </div>
                <div class="card-body" style="padding:0;">
                    ${_residualManualEntriesTableHtml()}
                </div>
            </div>` : ''}`;
    }

    // ── 레이져 잔량 수기 입출고 내역 관리 (관리자 전용) ────────────────
    function _residualManualEntries() {
        return (Storage.getAll(STORE_LASER) || [])
            .filter(w => w.isResidualManualIn || w.isResidualManualOut)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function _residualManualEntriesTableHtml() {
        const entries = _residualManualEntries();
        if (!entries.length) {
            return `<div style="text-align:center;padding:24px;color:var(--text-muted);">등록된 수기 입출고 내역이 없습니다.</div>`;
        }
        return `
        <div class="data-table-wrapper">
            <table class="data-table" style="font-size:0.83rem;">
                <thead><tr>
                    <th>날짜</th><th>구분</th><th>차종</th><th>품명</th><th>컬러</th>
                    <th style="text-align:right;">수량(EA)</th><th>비고</th><th>작성자</th><th>관리</th>
                </tr></thead>
                <tbody>
                    ${entries.map(w => {
                        const isOut = !!w.isResidualManualOut;
                        const badge = isOut
                            ? `<span style="color:var(--accent-red);font-weight:700;">출고</span>`
                            : `<span style="color:var(--accent-green);font-weight:700;">입고</span>`;
                        return `<tr>
                            <td style="white-space:nowrap;">${_esc(w.date || '-')}</td>
                            <td>${badge}</td>
                            <td>${_esc(w.carModel || '-')}</td>
                            <td>${_esc(w.partName || '-')}</td>
                            <td>${_esc(w.color || '-')}</td>
                            <td style="text-align:right;">${UIUtils.formatNumber(w.quantity || 0)}</td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${_esc(w.note || '-')}</td>
                            <td style="font-size:0.8rem;color:var(--text-secondary);">${_esc(w.author || '-')}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-sm btn-outline" onclick="LaserWipModule.openEditResidualManualEntry('${w.id}')">수정</button>
                                ${_isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="LaserWipModule.removeResidualManualEntry('${w.id}')">삭제</button>` : ''}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function openEditResidualManualEntry(id) {
        if (!_canEditWip()) {
            UIUtils.toast('레이져 후 재공품 입력 권한이 있는 사용자만 수정할 수 있습니다.', 'warning');
            return;
        }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        if (!entry) { UIUtils.toast('내역을 찾을 수 없습니다.', 'warning'); return; }
        const isOut = !!entry.isResidualManualOut;
        const isLotAdj = !!entry.isResidualLotAdjust;
        const products = _getResidualProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const carModel = entry.carModel || '';
        const partName = entry.partName || '';
        const color = entry.color || '';
        const partNames = [...new Set(products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        if (partName && partNames.indexOf(partName) < 0) partNames.push(partName);
        const colors = _masterColorsFor(carModel, partName);
        if (color && colors.indexOf(color) < 0) colors.push(color);
        const paintLot = _normalizePaintLot(entry.residualPaintLot || entry.paintDate || '') || '';
        const injLot = String(entry.lotNo || '').trim();
        const qtyVal = isLotAdj && entry.residualLotAbsoluteQty != null
            ? Math.max(0, Number(entry.residualLotAbsoluteQty) || 0)
            : (entry.quantity || 0);
        const modalTitle = isLotAdj
            ? '레이져 잔량 LOT 보정 수정'
            : (`레이져 잔량 수기 ${isOut ? '출고' : '입고'} 수정`);

        UIUtils.showModal(modalTitle, `
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">컬러는 제품 마스터에 등록된 값만 선택할 수 있습니다.${isLotAdj ? ' LOT 보정은 수정 후 잔량(절대값)을 입력합니다.' : ''}</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResEditDate" value="${_esc(entry.date || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwResEditCarModel" onchange="LaserWipModule.onEditResidualCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${_esc(m)}"${m === carModel ? ' selected' : ''}>${_esc(m)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwResEditPartName" onchange="LaserWipModule.onEditResidualPartChange()">
                        <option value="">-- 품명 선택 --</option>
                        ${partNames.map(n => `<option value="${_esc(n)}"${n === partName ? ' selected' : ''}>${_esc(n)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwResEditColor">
                        ${_colorSelectOptionsHtml(colors, color)}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">${isLotAdj ? '수정 후 잔량 (EA)' : '수량 (EA)'}</label>
                    <input type="number" class="form-input" id="lwResEditQty" min="${isLotAdj ? '0' : '1'}" value="${_esc(qtyVal)}">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResEditNote" value="${_esc(entry.note || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">도장 LOT (YYMMDD)</label>
                    <input type="text" class="form-input" id="lwResEditPaintLot" value="${_esc(paintLot === '-' ? '' : paintLot)}" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 LOT (YYMMDD)</label>
                    <input type="text" class="form-input" id="lwResEditInjLot" value="${_esc(injLot)}" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveEditResidualManualEntry('${id}')">저장</button>
        `, 'lg');
    }

    function onEditResidualCarChange() {
        const carModel = (document.getElementById('lwResEditCarModel') || {}).value || '';
        const products = _getResidualProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const partEl = document.getElementById('lwResEditPartName');
        if (partEl) {
            partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                partNames.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');
        }
        const colorEl = document.getElementById('lwResEditColor');
        if (colorEl) colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onEditResidualPartChange() {
        const carModel = (document.getElementById('lwResEditCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResEditPartName') || {}).value || '';
        const colorEl = document.getElementById('lwResEditColor');
        if (colorEl) colorEl.innerHTML = _colorSelectOptionsHtml(_masterColorsFor(carModel, partName), '');
    }

    async function saveEditResidualManualEntry(id) {
        if (!_canEditWip()) return;
        const date     = (document.getElementById('lwResEditDate')     || {}).value || '';
        const carModel = (document.getElementById('lwResEditCarModel') || {}).value.trim() || '';
        const partName = (document.getElementById('lwResEditPartName') || {}).value.trim() || '';
        const color    = (document.getElementById('lwResEditColor')    || {}).value.trim() || '';
        const quantity = parseInt((document.getElementById('lwResEditQty') || {}).value || '0', 10);
        const note     = (document.getElementById('lwResEditNote')     || {}).value.trim() || '';
        const paintDate = ((document.getElementById('lwResEditPaintLot') || {}).value || '').trim();
        const lotNo = ((document.getElementById('lwResEditInjLot') || {}).value || '').trim();

        if (!date || !carModel || !partName) {
            UIUtils.toast('날짜, 차종, 품명은 필수입니다.', 'warning');
            return;
        }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        const isLotAdj = !!(entry && entry.isResidualLotAdjust);
        if (isLotAdj) {
            if (isNaN(quantity) || quantity < 0) {
                UIUtils.toast('수정 후 잔량(0 이상)을 입력해 주세요.', 'warning');
                return;
            }
        } else if (!quantity || quantity <= 0) {
            UIUtils.toast('수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheck = _assertMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        if (paintDate) {
            const err = _lotValidationMessage(paintDate);
            if (err) { UIUtils.toast('도장 LOT: ' + err, 'warning'); return; }
        }
        if (lotNo) {
            const err = _lotValidationMessage(lotNo);
            if (err) { UIUtils.toast('사출 LOT: ' + err, 'warning'); return; }
        }

        const updates = {
            date, carModel, partName, color: colorCheck.color, quantity, note,
            paintDate: paintDate || '',
            residualPaintLot: paintDate || '',
            lotNo: lotNo || ''
        };
        if (isLotAdj) {
            updates.residualLotAbsoluteQty = quantity;
            // LOT 보정은 절대 잔량이므로 입/출고 방향 플래그는 기존 유지, 델타 quantity는 절대값과 맞춤
            updates.quantity = quantity;
        }

        await Storage.update(STORE_LASER, id, updates);
        UIUtils.closeModal();
        UIUtils.toast('수기 내역이 수정되었습니다.', 'success');
        refresh();
    }

    // 레이져 작업일지 컬러/품명 오입력 교정 (제품 마스터 컬러만)
    function openEditLaserWorkIdentity(id) {
        if (!_canEditWip()) {
            UIUtils.toast('레이져 후 재공품 입력 권한이 있는 사용자만 수정할 수 있습니다.', 'warning');
            return;
        }
        const entry = (Storage.getAll(STORE_LASER) || []).find(w => w.id === id);
        if (!entry) { UIUtils.toast('내역을 찾을 수 없습니다.', 'warning'); return; }
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const carModel = entry.carModel || '';
        const partName = entry.partName || '';
        const color = entry.color || '';
        const partNames = [...new Set(products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        if (partName && partNames.indexOf(partName) < 0) partNames.push(partName);
        const colors = _masterColorsFor(carModel, partName);
        if (color && colors.indexOf(color) < 0) colors.push(color);

        UIUtils.showModal('레이져 작업 품목·컬러 수정', `
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">
                작업일지의 차종·품명·컬러를 제품 마스터 기준으로 교정합니다.
                <strong>컬러는 마스터에 있는 값만</strong> 선택할 수 있습니다. (예: BK → BK+CLEAR)
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwIdEditCar" onchange="LaserWipModule.onEditLaserIdCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${_esc(m)}"${m === carModel ? ' selected' : ''}>${_esc(m)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwIdEditPart" onchange="LaserWipModule.onEditLaserIdPartChange()">
                        <option value="">-- 품명 선택 --</option>
                        ${partNames.map(n => `<option value="${_esc(n)}"${n === partName ? ' selected' : ''}>${_esc(n)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="lwIdEditColor">
                        ${_colorSelectOptionsHtml(colors, color)}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">작업수량 (참고)</label>
                <input type="number" class="form-input" id="lwIdEditQty" min="1" value="${_esc(entry.quantity || 0)}">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveEditLaserWorkIdentity('${id}')">저장</button>
        `, 'md');
    }

    function onEditLaserIdCarChange() {
        const carModel = (document.getElementById('lwIdEditCar') || {}).value || '';
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const partNames = [...new Set(products.filter(p => !carModel || p.carModel === carModel).map(p => p.partName).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
        const partEl = document.getElementById('lwIdEditPart');
        if (partEl) {
            partEl.innerHTML = '<option value="">-- 품명 선택 --</option>' +
                partNames.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');
        }
        const colorEl = document.getElementById('lwIdEditColor');
        if (colorEl) colorEl.innerHTML = '<option value="">-- 컬러 선택 --</option>';
    }

    function onEditLaserIdPartChange() {
        const carModel = (document.getElementById('lwIdEditCar') || {}).value || '';
        const partName = (document.getElementById('lwIdEditPart') || {}).value || '';
        const colorEl = document.getElementById('lwIdEditColor');
        if (colorEl) colorEl.innerHTML = _colorSelectOptionsHtml(_masterColorsFor(carModel, partName), '');
    }

    async function saveEditLaserWorkIdentity(id) {
        if (!_canEditWip()) return;
        const carModel = (document.getElementById('lwIdEditCar') || {}).value.trim() || '';
        const partName = (document.getElementById('lwIdEditPart') || {}).value.trim() || '';
        const color = (document.getElementById('lwIdEditColor') || {}).value.trim() || '';
        const quantity = parseInt((document.getElementById('lwIdEditQty') || {}).value || '0', 10);
        if (!carModel || !partName) {
            UIUtils.toast('차종·품명을 선택해 주세요.', 'warning');
            return;
        }
        const colorCheck = _assertMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        if (!quantity || quantity <= 0) {
            UIUtils.toast('수량을 확인해 주세요.', 'warning');
            return;
        }
        await Storage.update(STORE_LASER, id, { carModel, partName, color: colorCheck.color, quantity });
        UIUtils.closeModal();
        UIUtils.toast('레이져 작업 품목·컬러가 수정되었습니다.', 'success');
        refresh();
    }

    function removeResidualManualEntry(id) {
        if (!_isAdmin()) { UIUtils.toast('관리자만 삭제할 수 있습니다.', 'warning'); return; }
        UIUtils.confirm('이 수기 등록 내역을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE_LASER, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            refresh();
        });
    }

    function _residualQtyFromLotDetail(detail) {
        const lotSum = (detail.lots || []).reduce(function(s, l) {
            return s + Math.max(0, Number(l.qty) || 0);
        }, 0);
        // LOT 미지정 양수 잔량만 총량에 포함 (FIFO 후 남은 음수 미지정은 실재고가 아님)
        const unassigned = Math.max(0, Number(detail.manualAdj) || 0);
        return Math.max(0, Math.round(lotSum + unassigned));
    }

    function _calcLaserResidualWip() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const residualMap = {};

        function ensureRow(w) {
            const key = `${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`;
            if (!residualMap[key]) {
                residualMap[key] = {
                    carModel: w.carModel || '',
                    partName: w.partName || '',
                    color: w.color || '',
                    laserDates: [],
                    paintDates: [],
                    injectionLots: [],
                    goodQty: 0,
                    fullBoxQty: 0,
                    packUnit: 0,
                    residualQty: 0
                };
            }
            return residualMap[key];
        }

        // 메타(양품/출하가능/일자)는 작업 실적에서 수집
        laserWorks
            .filter(w => !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut)
            .forEach(w => {
                const packUnit = _num(w.packUnit);
                const goodQty = _num(w.inspectionGoodQty) || _num(w.completedQty) || _num(w.quantity);
                const fullBoxQty = _num(w.shippingEligibleQty) || (packUnit > 0 ? Math.floor(goodQty / packUnit) * packUnit : goodQty);
                const paintLots = Array.isArray(w.paintLots) ? w.paintLots : [];
                const row = ensureRow(w);
                row.laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                (paintLots.length ? paintLots.map(l => l && l.paintDate) : [w.paintDate || '']).forEach(v => row.paintDates.push(v));
                (paintLots.length ? paintLots.map(l => l && l.lotNo) : [w.paintLot || w.lotNo || '']).forEach(v => row.injectionLots.push(v));
                row.goodQty += goodQty;
                row.fullBoxQty += fullBoxQty;
                row.packUnit = row.packUnit || packUnit;
            });

        // 수기/LOT보정만 있는 품목도 집계 대상에 포함
        laserWorks
            .filter(w => w.isResidualManualIn || w.isResidualManualOut || w.isResidualLotAdjust)
            .forEach(w => {
                if (w.isResidualAuditOnly) return;
                const row = ensureRow(w);
                row.packUnit = row.packUnit || _num(w.packUnit);
                row.laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (w.paintDate) row.paintDates.push(w.paintDate);
                if (w.residualPaintLot) row.paintDates.push(w.residualPaintLot);
                if (w.lotNo) row.injectionLots.push(w.lotNo);
            });

        // ★ 현재 잔량 = 현재 보관 LOT 합계 (단일 원천)
        // 과거처럼 품목 단위 델타 누적과 LOT 절대보정 로직이 달라 42 vs 164 불일치가 나지 않도록 한다.
        return Object.values(residualMap)
            .map(r => {
                const detail = _calcResidualLotDetail(r.carModel, r.partName, r.color);
                const paintLotLabels = [];
                let unassignedQty = Math.max(0, Number(detail.manualAdj) || 0);
                (detail.lots || []).forEach(function(l) {
                    if ((Number(l.qty) || 0) <= 0) return;
                    const pl = _normalizePaintLot(l.paintLot);
                    if (pl && pl !== '-') paintLotLabels.push(pl);
                    else unassignedQty += Math.max(0, Number(l.qty) || 0);
                });
                if (unassignedQty > 0) paintLotLabels.push('LOT 미지정');
                const residualQty = _residualQtyFromLotDetail(detail);
                const flatTotal = _calcResidualFlatTotal(r.carModel, r.partName, r.color);
                return Object.assign({}, r, {
                    residualQty: residualQty,
                    residualLotCount: (detail.lots || []).length + ((Number(detail.manualAdj) || 0) > 0 ? 1 : 0),
                    paintLotSummary: _paintLotSummaryText(paintLotLabels),
                    unassignedQty: unassignedQty,
                    flatTotal: flatTotal,
                    hasMismatch: Math.abs(flatTotal - residualQty) > 0.001
                });
            })
            .filter(r => r.residualQty > 0)
            .sort((a, b) => {
                const d = String(b.laserDates[0] || '').localeCompare(String(a.laserDates[0] || ''));
                if (d !== 0) return d;
                const cm = (a.carModel || '').localeCompare(b.carModel || '');
                return cm !== 0 ? cm : (a.partName || '').localeCompare(b.partName || '');
            });
    }

    function openResidualInput(prefill) {
        const products = _getResidualProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);
        const fg = (flex) => `class="form-group" style="flex:${flex};margin-bottom:0;min-width:0;"`;

        UIUtils.showModal('레이져 잔량 수동입고', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary);">
                포장단위 미달 잔량을 수동으로 추가 등록합니다.
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px 10px;align-items:flex-end;">
                <div ${fg('0 1 148px')}>
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualInDate" value="${today}">
                </div>
                <div ${fg('1 1 88px')}>
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualInCarModel" onchange="LaserWipModule.onResidualInCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div ${fg('1.6 1 140px')}>
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualInPartName" onchange="LaserWipModule.onResidualInPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div ${fg('1.2 1 110px')}>
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualInColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
                <div ${fg('0 1 108px')}>
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwResidualInInjectionLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 120px')}>
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwResidualInPaintDate" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 118px')}>
                    <label class="form-label">잔량 수량 (EA) <span style="color:var(--accent-red);">*</span></label>
                    <input type="number" class="form-input" id="lwResidualInQty" min="1" placeholder="0">
                </div>
                <div ${fg('2 1 160px')}>
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualInNote" placeholder="수기 잔량입고">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveResidualInput()">등록</button>
        `, 'min(720px, calc(100vw - 32px))');
        _applyPrefillSelects(prefill, 'lwResidualInCarModel', 'lwResidualInPartName', 'lwResidualInColor', onResidualInCarChange, onResidualInPartChange);
    }

    function onResidualInCarChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const products = _getResidualProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualInPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';

        // LOT 필드 초기화
        const injLotEl = document.getElementById('lwResidualInInjectionLot');
        const paintDateEl = document.getElementById('lwResidualInPaintDate');
        if (injLotEl) injLotEl.value = '';
        if (paintDateEl) paintDateEl.value = '';
    }

    function onResidualInPartChange() {
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const products = _getResidualProducts().filter(p => (!carModel || p.carModel === carModel) && (!partName || p.partName === partName));
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualInColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // 선택한 제품의 기존 작업 실적이 있으면 참고용으로 최근 LOT 1건만 자동 채워준다(직접 수정 가능).
        // 필드가 YYMMDD 단일 입력으로 필수화되어 여러 값을 콤마로 채우지 않는다.
        // 실적이 없어도(도장 생산과 무관하게) 사용자가 직접 입력할 수 있어야 하므로 비워둔다.
        const r = _calcLaserResidualWip().find(x => x.carModel === carModel && x.partName === partName);
        const injLotEl = document.getElementById('lwResidualInInjectionLot');
        const paintDateEl = document.getElementById('lwResidualInPaintDate');
        const injLots = r ? (Array.isArray(r.injectionLots) ? r.injectionLots : []).filter(Boolean) : [];
        const paintDates = r ? (Array.isArray(r.paintDates) ? r.paintDates : []).filter(Boolean) : [];
        if (injLotEl) injLotEl.value = injLots.length > 0 ? _normalizePaintLot(injLots[injLots.length - 1]).replace('-', '') : '';
        if (paintDateEl) paintDateEl.value = paintDates.length > 0 ? _normalizePaintLot(paintDates[paintDates.length - 1]).replace('-', '') : '';
    }

    async function saveResidualInput() {
        const date = (document.getElementById('lwResidualInDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualInCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualInPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualInColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualInQty') || {}).value || '0', 10);
        const note = ((document.getElementById('lwResidualInNote') || {}).value || '').trim() || '수기 잔량입고';
        const injectionLot = ((document.getElementById('lwResidualInInjectionLot') || {}).value || '').trim();
        const paintDate = ((document.getElementById('lwResidualInPaintDate') || {}).value || '').trim();
        const prod = _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName && (!color || p.color === color))
            || _getResidualProducts().find(p => p.carModel === carModel && p.partName === partName);
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 잔량 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheck = _assertMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        // ✓ 사출 LOT, 도장 작업LOT은 도장 생산 실적과 무관하게 직접 입력 가능하되 필수값이며 YYMMDD 형식이어야 한다.
        if (!injectionLot) {
            UIUtils.toast('사출 LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwResidualInInjectionLot')?.focus();
            return;
        }
        const injLotErr = _lotValidationMessage(injectionLot);
        if (injLotErr) {
            UIUtils.toast('사출 LOT: ' + injLotErr, 'warning');
            document.getElementById('lwResidualInInjectionLot')?.focus();
            return;
        }
        if (!paintDate) {
            UIUtils.toast('도장 작업LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwResidualInPaintDate')?.focus();
            return;
        }
        const paintLotErr = _lotValidationMessage(paintDate);
        if (paintLotErr) {
            UIUtils.toast('도장 작업LOT: ' + paintLotErr, 'warning');
            document.getElementById('lwResidualInPaintDate')?.focus();
            return;
        }

        const record = {
            date, carModel, partName, color: colorCheck.color, quantity, note, packUnit,
            isManual: true, isResidualManualIn: true,
            lotNo: injectionLot, paintDate,
            residualPaintLot: paintDate,
            author: _currentUserName()
        };

        try {
            await Storage.add(STORE_LASER, record);
        } catch (e) {
            console.error('레이져 잔량 수동입고 실패:', e);
            UIUtils.toast('저장 중 오류가 발생했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
            return;
        }
        UIUtils.closeModal();
        UIUtils.toast(`레이져 잔량 수동입고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function _residualStockLots(carModel, partName, color) {
        const detail = _calcResidualLotDetail(carModel || '', partName || '', color || '');
        return (detail.lots || [])
            .filter(function(l) { return (Number(l.qty) || 0) > 0.001; })
            .map(function(l) {
                return {
                    paintLot: _normalizePaintLot(l.paintLot || ''),
                    injLot: _normalizeInjLot(l.injLot || ''),
                    qty: Math.round(Number(l.qty) || 0)
                };
            })
            .filter(function(l) { return l.paintLot && l.injLot && l.paintLot !== '-' && l.injLot !== '-'; })
            .sort(function(a, b) {
                const qd = (b.qty || 0) - (a.qty || 0);
                if (qd !== 0) return qd;
                return String(a.paintLot).localeCompare(String(b.paintLot))
                    || String(a.injLot).localeCompare(String(b.injLot));
            });
    }

    function _applyResidualOutLotPick() {
        const pick = document.getElementById('lwResidualOutLotPick');
        const injLotEl = document.getElementById('lwResidualOutInjectionLot');
        const paintDateEl = document.getElementById('lwResidualOutPaintDate');
        const info = document.getElementById('lwResidualOutStockInfo');
        if (!pick || !pick.value) return;
        const parts = String(pick.value).split('|');
        const paintLot = _normalizePaintLot(parts[0] || '');
        const injLot = _normalizeInjLot(parts.slice(1).join('|') || '');
        if (paintDateEl) paintDateEl.value = paintLot;
        if (injLotEl) injLotEl.value = injLot;
        const opt = pick.options[pick.selectedIndex];
        const lotQty = opt ? (Number(opt.getAttribute('data-qty')) || 0) : 0;
        const totalHtml = (info && info.getAttribute('data-total-html')) || '';
        if (info && totalHtml) {
            info.innerHTML = totalHtml
                + (lotQty > 0
                    ? ` · 선택 LOT 잔량 <strong style="color:var(--accent-orange);">${UIUtils.formatNumber(lotQty)} EA</strong>`
                    : '');
        }
    }

    function _refreshResidualOutLotUi() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualOutColor') || {}).value || '';
        const pick = document.getElementById('lwResidualOutLotPick');
        const info = document.getElementById('lwResidualOutStockInfo');
        const injLotEl = document.getElementById('lwResidualOutInjectionLot');
        const paintDateEl = document.getElementById('lwResidualOutPaintDate');
        if (!carModel || !partName) {
            if (pick) pick.innerHTML = '<option value="">-- 품목 선택 후 LOT 표시 --</option>';
            if (info) { info.textContent = ''; info.removeAttribute('data-total-html'); }
            if (injLotEl) injLotEl.value = '';
            if (paintDateEl) paintDateEl.value = '';
            return;
        }

        const lots = _residualStockLots(carModel, partName, color);
        const totalQty = lots.reduce(function(s, l) { return s + (l.qty || 0); }, 0);
        if (pick) {
            pick.innerHTML = lots.length
                ? '<option value="">-- 현재 보관 LOT 선택 --</option>' + lots.map(function(l) {
                    const val = String(l.paintLot) + '|' + String(l.injLot);
                    return `<option value="${_esc(val)}" data-qty="${l.qty}">${_esc(l.paintLot)} / ${_esc(l.injLot)} (${UIUtils.formatNumber(l.qty)} EA)</option>`;
                }).join('')
                : '<option value="">-- 출고 가능한 보관 LOT 없음 --</option>';
        }
        const lotListHtml = lots.length
            ? `<div style="margin-top:6px;font-size:0.78rem;color:var(--text-secondary);">현재 보관 LOT: ${
                lots.map(function(l) {
                    return `<span style="font-family:monospace;">${_esc(l.paintLot)}/${_esc(l.injLot)}</span>(${UIUtils.formatNumber(l.qty)})`;
                }).join(' · ')
            }</div>`
            : `<div style="margin-top:6px;font-size:0.78rem;color:var(--accent-red);">출고 가능한 현재 보관 LOT가 없습니다.</div>`;
        const totalHtml = `현재 잔량 재고 <strong style="color:var(--accent-orange);">${UIUtils.formatNumber(totalQty)} EA</strong>${lotListHtml}`;
        if (info) {
            info.innerHTML = totalHtml;
            info.setAttribute('data-total-html', totalHtml);
        }
        if (lots.length > 0) {
            if (pick) pick.value = String(lots[0].paintLot) + '|' + String(lots[0].injLot);
            _applyResidualOutLotPick();
        } else {
            if (injLotEl) injLotEl.value = '';
            if (paintDateEl) paintDateEl.value = '';
        }
    }

    function openResidualOut(prefill) {
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 수동출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);">
                잔량 재고를 <strong>현재 보관 LOT</strong> 기준으로 출고합니다. 잔량이 0인 과거 LOT에서는 출고할 수 없습니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwResidualOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwResidualOutCarModel" onchange="LaserWipModule.onResidualOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwResidualOutPartName" onchange="LaserWipModule.onResidualOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwResidualOutColor" onchange="LaserWipModule.onResidualOutColorChange()">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label">출고 LOT (현재 보관) <span style="color:var(--accent-red);">*</span></label>
                <select class="form-select" id="lwResidualOutLotPick" onchange="LaserWipModule.onResidualOutLotPick()">
                    <option value="">-- 품목 선택 후 LOT 표시 --</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwResidualOutInjectionLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwResidualOutPaintDate" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA) <span style="color:var(--accent-red);">*</span></label>
                    <input type="number" class="form-input" id="lwResidualOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwResidualOutNote" placeholder="수기 잔량출고">
                </div>
            </div>
            <div id="lwResidualOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);" onclick="LaserWipModule.saveResidualOut()">출고 등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwResidualOutCarModel', 'lwResidualOutPartName', 'lwResidualOutColor', onResidualOutCarChange, onResidualOutPartChange);
        if (prefill && prefill.color) {
            setTimeout(function() { onResidualOutColorChange(); }, 30);
        }
    }

    function onResidualOutCarChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const partSel = document.getElementById('lwResidualOutPartName');
        if (partSel) partSel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        _refreshResidualOutLotUi();
    }

    function onResidualOutPartChange() {
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const rows = _calcLaserResidualWip().filter(r => r.residualQty > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const colorSel = document.getElementById('lwResidualOutColor');
        if (colorSel) {
            colorSel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
            if (colors.length === 1) colorSel.value = colors[0];
        }
        _refreshResidualOutLotUi();
    }

    function onResidualOutColorChange() {
        _refreshResidualOutLotUi();
    }

    function onResidualOutLotPick() {
        _applyResidualOutLotPick();
    }

    async function saveResidualOut() {
        const date = (document.getElementById('lwResidualOutDate') || {}).value || '';
        const carModel = (document.getElementById('lwResidualOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwResidualOutPartName') || {}).value || '';
        const color = (document.getElementById('lwResidualOutColor') || {}).value || '';
        const quantity = parseInt((document.getElementById('lwResidualOutQty') || {}).value || '0', 10);
        const note = ((document.getElementById('lwResidualOutNote') || {}).value || '').trim() || '수기 잔량출고';
        const injectionLot = _normalizeInjLot(((document.getElementById('lwResidualOutInjectionLot') || {}).value || '').trim());
        const paintDate = _normalizePaintLot(((document.getElementById('lwResidualOutPaintDate') || {}).value || '').trim());

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 출고 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheckOut = _assertMasterColor(carModel, partName, color);
        if (!colorCheckOut.ok) {
            UIUtils.toast(colorCheckOut.message, 'warning');
            return;
        }
        if (!injectionLot) {
            UIUtils.toast('사출 LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwResidualOutInjectionLot')?.focus();
            return;
        }
        const injLotErr = _lotValidationMessage(injectionLot);
        if (injLotErr) {
            UIUtils.toast('사출 LOT: ' + injLotErr, 'warning');
            document.getElementById('lwResidualOutInjectionLot')?.focus();
            return;
        }
        if (!paintDate) {
            UIUtils.toast('도장 작업LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwResidualOutPaintDate')?.focus();
            return;
        }
        const paintLotErr = _lotValidationMessage(paintDate);
        if (paintLotErr) {
            UIUtils.toast('도장 작업LOT: ' + paintLotErr, 'warning');
            document.getElementById('lwResidualOutPaintDate')?.focus();
            return;
        }

        const lotDetail = _calcResidualLotDetail(carModel, partName, colorCheckOut.color);
        const lotQty = _getResidualLotQtyFromDetail(lotDetail, paintDate, injectionLot);
        const residualQty = _residualQtyFromLotDetail(lotDetail);
        if (lotQty <= 0) {
            UIUtils.toast(`선택한 LOT(${paintDate}/${injectionLot})은 현재 보관 잔량이 없습니다. 현재 보관 LOT에서 선택해 주세요.`, 'warning');
            document.getElementById('lwResidualOutLotPick')?.focus();
            return;
        }
        if (quantity > lotQty) {
            UIUtils.toast(`출고 수량(${UIUtils.formatNumber(quantity)})이 선택 LOT 잔량(${UIUtils.formatNumber(lotQty)})을 초과합니다.`, 'warning');
            return;
        }
        if (quantity > residualQty) {
            UIUtils.toast(`출고 수량(${UIUtils.formatNumber(quantity)})이 현재 잔량(${UIUtils.formatNumber(residualQty)})을 초과합니다.`, 'warning');
            return;
        }

        const residual = _calcLaserResidualWip().find(r => r.carModel === carModel && r.partName === partName && (!colorCheckOut.color || r.color === colorCheckOut.color));
        const record = {
            date, carModel, partName, color: colorCheckOut.color, quantity, note,
            packUnit: residual ? residual.packUnit : 0,
            isManual: true, isResidualManualOut: true,
            lotNo: injectionLot, paintDate,
            residualPaintLot: paintDate,
            author: _currentUserName()
        };

        try {
            await Storage.add(STORE_LASER, record);
        } catch (e) {
            console.error('레이져 잔량 수동출고 실패:', e);
            UIUtils.toast('저장 중 오류가 발생했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
            return;
        }
        UIUtils.closeModal();
        UIUtils.toast(`레이져 잔량 수동출고 완료 — ${partName} ${quantity}EA (${paintDate}/${injectionLot})`, 'success');
        refresh();
    }

    // ── 상세 모달 공통 ───────────────────────────────────────────────────
    function _closeDetailPopup() {
        UIUtils.closeModal();
        const el = document.getElementById('lwDetailPopup');
        if (el) el.remove();
    }

    function _wipHistorySection(histItems, opts) {
        opts = opts || {};
        const productLevelQty = !!opts.productLevelQty;
        const canEdit = _canEditWip();
        return StockDetailUI.buildSimpleHistorySection(histItems, {
            floorZero: opts.floorZero !== false,
            splitLots: opts.splitLots !== false,
            showActions: canEdit,
            actionHtmlFn: canEdit ? function(item) {
                // 이력 리셋 스냅샷만 제외. 리셋 이전 기록도 입력 실수 교정 가능
                if (!item || !item.sourceId || item.isHistoryReset || item.routeLabel === '이력 리셋') return '';
                if (item.editKind === 'after_manual') {
                    return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="event.stopPropagation();UIUtils.closeModal();setTimeout(function(){LaserWipModule.openEditManualEntry('${_jsArg(item.sourceId)}');},80);">수정</button>`;
                }
                if (item.editKind === 'residual_manual') {
                    return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="event.stopPropagation();UIUtils.closeModal();setTimeout(function(){LaserWipModule.openEditResidualManualEntry('${_jsArg(item.sourceId)}');},80);">수정</button>`;
                }
                if (item.editKind === 'laser_work') {
                    return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;"
                        onclick="event.stopPropagation();UIUtils.closeModal();setTimeout(function(){LaserWipModule.openEditLaserWorkIdentity('${_jsArg(item.sourceId)}');},80);">수정</button>`;
                }
                return '';
            } : null,
            perLotKey: productLevelQty ? null : function(item) {
                if (item.lotKey) return item.lotKey;
                const paint = item.paintLot || '';
                const inj = item.injLot || item.lot || '';
                if (paint || inj) return String(paint) + '|' + String(inj);
                return '__ALL__';
            },
            getAbsoluteAfter: function(item) {
                if (item && item.absoluteAfter != null && (item.routeLabel === '이력 리셋' || item.isHistoryReset)) {
                    return item.absoluteAfter;
                }
                if (productLevelQty) return null;
                return item.absoluteAfter != null ? item.absoluteAfter : null;
            }
        });
    }

    function _openAfterLaserOutForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openAfterLaserOut({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openAfterLaserInForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openAfterLaserInput({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openResidualOutForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openResidualOut({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    function _openResidualInForPart(carModel, partName, color) {
        UIUtils.closeModal();
        setTimeout(function() { openResidualInput({ carModel: carModel, partName: partName, color: color }); }, 80);
    }

    // 잔량 이력 호기: 기록 자체 > 동일 LOT 레이져 작업일지 > 외관검사일지→작업일지
    function _resolveResidualMachine(carModel, partName, color, paintLot, injLot, date, seedMachine) {
        if (seedMachine) return String(seedMachine).trim();
        const paint = _normalizePaintLot(paintLot || '');
        const inj = _normalizeInjLot(injLot || '');
        const day = String(date || '').slice(0, 10);
        let fallback = '';

        function lotMatches(work) {
            const lots = Array.isArray(work.paintLots) ? work.paintLots : [];
            const workPaint = lots.length
                ? lots.map(function(l) { return _normalizePaintLot(l && l.paintDate || ''); })
                : [_normalizePaintLot(work.paintDate || work.residualPaintLot || '')];
            const workInj = lots.length
                ? lots.map(function(l) { return _normalizeInjLot(l && l.lotNo || ''); })
                : [_normalizeInjLot(work.paintLot || work.lotNo || '')];
            const paintOk = !paint || paint === '-' || workPaint.indexOf(paint) >= 0;
            const injOk = !inj || inj === '-' || workInj.indexOf(inj) >= 0;
            return paintOk && injOk;
        }

        function productMatches(row) {
            if ((row.carModel || '') !== carModel || (row.partName || '') !== partName) return false;
            if (color && (row.color || '') !== color) return false;
            return true;
        }

        const works = Storage.getAll(STORE_LASER) || [];
        for (let i = 0; i < works.length; i++) {
            const w = works[i];
            if (!w || w.isManual || w.isResidualManualIn || w.isResidualManualOut || w.isResidualLotAdjust) continue;
            if (!productMatches(w) || !w.machine) continue;
            if (!lotMatches(w)) continue;
            if (day && String(w.date || '').slice(0, 10) === day) return String(w.machine).trim();
            if (!fallback) fallback = String(w.machine).trim();
        }

        const insps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        for (let j = 0; j < insps.length; j++) {
            const insp = insps[j];
            if (!insp || !insp.workLogId || !productMatches(insp)) continue;
            const work = Storage.getById(STORE_LASER, insp.workLogId);
            if (!work || !work.machine) continue;
            if (paint && paint !== '-' && !lotMatches(work)) continue;
            if (inj && inj !== '-' && !lotMatches(work)) continue;
            const inspDay = String(insp.date || work.date || '').slice(0, 10);
            if (day && inspDay === day) return String(work.machine).trim();
            if (!fallback) fallback = String(work.machine).trim();
        }

        return fallback;
    }

    function _calcResidualLotDetail(carModel, partName, color) {
        const laserAllWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color);
        });

        const lotMap = {};
        var manualAdj = 0;
        const events = [];
        const histReset = _getResidualHistoryReset(carModel, partName, color);
        const resetAt = histReset && histReset.historyOnly ? (histReset.historyResetAt || '') : '';
        const useSnapshot = !!(resetAt && Array.isArray(histReset.openingLots));

        function ensureLot(key, paintLot, injLot) {
            if (!lotMap[key]) lotMap[key] = { paintLot: paintLot, injLot: injLot, qty: 0 };
            return lotMap[key];
        }

        // 이력만 리셋 후: 리셋 시점 LOT 스냅샷을 기준으로 두고, 이후 이벤트만 반영한다.
        // (숨김만 하면 과거 원본이 다시 LOT 합계에 섞이는 문제가 난다)
        if (useSnapshot) {
            histReset.openingLots.forEach(function(l) {
                const qty = Math.max(0, Number(l && l.qty) || 0);
                if (qty <= 0) return;
                const paintLot = String((l && l.paintLot) || '').trim();
                const injLot = String((l && l.injLot) || '').trim();
                if (!paintLot || paintLot === 'LOT 미지정' || !injLot || injLot === '수기 잔량입고') {
                    manualAdj += qty;
                    return;
                }
                const key = _residualLotKey(paintLot, injLot);
                ensureLot(key, _normalizePaintLot(paintLot), _normalizeInjLot(injLot)).qty = qty;
            });
        }

        // ① 레이저 작업 잔량 발생
        laserAllWorks.filter(function(w) {
            return !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut;
        }).forEach(function(w) {
            if (useSnapshot && _isBeforeHistoryReset(w.date, resetAt, w.createdAt)) return;
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (resQty <= 0) return;
            _workResidualLotKeys(w).forEach(function(key) {
                const pipeIdx = key.indexOf('|');
                const paintLot = pipeIdx >= 0 ? key.slice(0, pipeIdx) : key;
                const injLot = pipeIdx >= 0 ? key.slice(pipeIdx + 1) : '-';
                events.push({
                    date: w.date || '',
                    createdAt: w.createdAt || w.id || '',
                    type: 'delta',
                    key: key,
                    paintLot: paintLot,
                    injLot: injLot,
                    qty: resQty
                });
            });
        });

        // ② 수기 입출고 / LOT 절대 보정
        laserAllWorks.filter(function(w) {
            return w.isResidualManualIn || w.isResidualManualOut;
        }).forEach(function(w) {
            if (w.isResidualAuditOnly) return;
            if (useSnapshot && _isBeforeHistoryReset(w.date, resetAt, w.createdAt)) return;
            const qty = Number(w.quantity) || 0;
            const absQty = w.residualLotAbsoluteQty;
            const rawPaintLot = w.residualPaintLot || w.paintDate || '';
            const rawInjLot = w.lotNo || '';
            const paintLot = rawPaintLot ? _normalizePaintLot(rawPaintLot) : '';
            const injLot = rawInjLot ? _normalizeInjLot(rawInjLot) : '';
            if (absQty != null && w.isResidualLotAdjust && paintLot && injLot) {
                events.push({
                    date: w.date || '',
                    createdAt: w.createdAt || w.id || '',
                    type: 'absolute',
                    key: _residualLotKey(paintLot, injLot),
                    paintLot: paintLot,
                    injLot: injLot,
                    qty: Math.max(0, Number(absQty) || 0)
                });
                return;
            }
            if (paintLot && injLot) {
                events.push({
                    date: w.date || '',
                    createdAt: w.createdAt || w.id || '',
                    type: 'delta',
                    key: _residualLotKey(paintLot, injLot),
                    paintLot: paintLot,
                    injLot: injLot,
                    qty: w.isResidualManualIn ? qty : -qty
                });
            } else {
                events.push({
                    date: w.date || '',
                    createdAt: w.createdAt || w.id || '',
                    type: 'unassigned',
                    qty: w.isResidualManualIn ? qty : -qty,
                    sourceId: w.id || '',
                    author: w.author || ''
                });
            }
        });

        events.sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || '')) ||
                String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });

        // LOT 미지정 출고를 그 시점까지 쌓인 LOT에서 FIFO로 차감한다.
        // 어느 LOT에서 얼마나 빠졌는지 fifoTrace에 남겨서, 이력표에도 실제 배분 내역을 보여줄 수 있게 한다.
        const fifoTrace = [];
        function fifoDeductFromLots(amount, sourceEvent) {
            let remaining = amount;
            Object.values(lotMap)
                .sort(function(a, b) {
                    return String(a.paintLot || '').localeCompare(String(b.paintLot || '')) ||
                        String(a.injLot || '').localeCompare(String(b.injLot || ''));
                })
                .forEach(function(lot) {
                    if (remaining <= 0) return;
                    const available = Math.max(0, Number(lot.qty) || 0);
                    const used = Math.min(available, remaining);
                    if (used > 0) {
                        lot.qty -= used;
                        remaining -= used;
                        fifoTrace.push({
                            date: sourceEvent.date || '',
                            createdAt: sourceEvent.createdAt || '',
                            sourceId: sourceEvent.sourceId || '',
                            author: sourceEvent.author || '',
                            paintLot: lot.paintLot,
                            injLot: lot.injLot,
                            key: String(lot.paintLot) + '|' + String(lot.injLot),
                            qty: used
                        });
                    }
                });
            return remaining;
        }

        // ★ 이벤트를 시간순으로 재생하면서 그 시점에 처리한다. 미지정 출고를 전부 쌓았다가
        //   맨 마지막에 "최종" LOT 상태에서 한 번에 FIFO 차감하면, 과거 미지정 출고가 그 이후에
        //   새로 생긴(당시엔 존재하지도 않았던) LOT에서 잘못 빠져나가는 오류가 생긴다.
        //   (예: 7/13 미지정 출고가 7/20에 새로 생긴 LOT의 잔량을 갉아먹는 문제)
        events.forEach(function(e) {
            if (e.type === 'unassigned') {
                if (e.qty >= 0) {
                    manualAdj += e.qty;
                } else {
                    let remainingOut = Math.abs(e.qty);
                    const fromPool = Math.min(manualAdj, remainingOut);
                    manualAdj -= fromPool;
                    remainingOut -= fromPool;
                    if (remainingOut > 0) fifoDeductFromLots(remainingOut, e);
                }
                return;
            }
            const row = ensureLot(e.key, e.paintLot, e.injLot);
            if (e.type === 'absolute') {
                row.qty = Math.max(0, Number(e.qty) || 0);
            } else {
                row.qty += Number(e.qty) || 0;
                if (row.qty < 0) row.qty = 0;
            }
        });

        // 초과 출고분(그 시점까지 차감할 LOT조차 없던 경우)은 음수로 남기지 않음
        if (manualAdj < 0) manualAdj = 0;

        const lots = Object.values(lotMap)
            .map(function(l) { return { paintLot: l.paintLot, injLot: l.injLot, qty: Math.round(l.qty) }; })
            .filter(function(l) { return l.qty > 0; })
            .sort(function(a, b) {
                return String(a.paintLot || '').localeCompare(String(b.paintLot || '')) ||
                    String(a.injLot || '').localeCompare(String(b.injLot || ''));
            });

        return { lots: lots, manualAdj: manualAdj, fifoTrace: fifoTrace };
    }

    // 안전장치: LOT별 배분(_calcResidualLotDetail) 없이, 이 품목의 모든 입출고를 LOT 구분 없이
    // 그대로 한 줄로 재생한 "품목 단위 총량"을 계산한다. 정상 데이터라면 항상 LOT 표 합계와
    // 같아야 하고, 다르면(예: 특정 LOT만 자체적으로 초과출고돼 그 LOT에서 0으로 잘렸는데
    // 전체로 보면 재고가 남아있던 경우) 조용히 틀린 숫자를 보여주는 대신 경고할 근거가 된다.
    // (레이져 후 재공품의 _replayAfterWipProductBalance와 같은 목적/같은 방식)
    function _calcResidualFlatTotal(carModel, partName, color) {
        const laserAllWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color);
        });
        const histReset = _getResidualHistoryReset(carModel, partName, color);
        const resetAt = histReset && histReset.historyOnly ? (histReset.historyResetAt || '') : '';
        const useSnapshot = !!resetAt;

        const events = [];
        if (useSnapshot) {
            const openingLots = Array.isArray(histReset.openingLots) ? histReset.openingLots : [];
            const openingStock = openingLots.length
                ? openingLots.reduce(function(s, l) { return s + Math.max(0, Number(l && l.qty) || 0); }, 0)
                : Math.max(0, Number(histReset.openingStock) || 0);
            events.push({ date: resetAt, createdAt: resetAt, type: 'absolute', qty: openingStock });
        }

        laserAllWorks.filter(function(w) {
            return !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut;
        }).forEach(function(w) {
            if (useSnapshot && _isBeforeHistoryReset(w.date, resetAt, w.createdAt)) return;
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (resQty <= 0) return;
            events.push({ date: w.date || '', createdAt: w.createdAt || w.id || '', type: 'delta', qty: resQty });
        });

        // LOT 보정(절대값)도 그 순간 실제로 바뀐 순증감(diff)만큼은 품목 총량에 반영해야 한다.
        // (LOT 표는 절대값으로 덮어쓰지만, 품목 전체로 보면 그 보정이 낸 순변화는 delta일 뿐이다)
        laserAllWorks.filter(function(w) {
            return w.isResidualManualIn || w.isResidualManualOut;
        }).forEach(function(w) {
            if (w.isResidualAuditOnly) return;
            if (useSnapshot && _isBeforeHistoryReset(w.date, resetAt, w.createdAt)) return;
            const qty = Number(w.quantity) || 0;
            events.push({
                date: w.date || '',
                createdAt: w.createdAt || w.id || '',
                type: 'delta',
                qty: w.isResidualManualIn ? qty : -qty
            });
        });

        events.sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || '')) ||
                String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });

        var running = 0;
        events.forEach(function(e) {
            if (e.type === 'absolute') { running = Math.max(0, Number(e.qty) || 0); return; }
            running += Number(e.qty) || 0;
            if (running < 0) running = 0;
        });
        return Math.max(0, running);
    }

    // 레이저 대기 수량 보정(LaserStandbyModule)과 동일한 UX: 총수량 + LOT별 재고 배분(추가/삭제 가능)을 한 화면에서 고친다.
    function _residualAdjustLotRowHtml(lot) {
        lot = lot || {};
        const paintLot = String(lot.paintLot || '').trim();
        const injLot = String(lot.injLot || '').trim();
        const qty = Math.max(0, Number(lot.qty) || 0);
        return `
            <div class="lw-adj-res-lot-row" style="display:grid;grid-template-columns:1fr 1fr 140px 34px;gap:8px;align-items:end;margin-bottom:8px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">도장 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input lw-adj-res-paint-lot" value="${_esc(paintLot)}"
                        placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input lw-adj-res-inj-lot" value="${_esc(injLot)}"
                        placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">LOT 수량</label>
                    <input type="number" class="form-input lw-adj-res-lot-qty" value="${qty || ''}" min="0" placeholder="0"
                        oninput="LaserWipModule.onAdjustResAllLotQtyInput()">
                </div>
                <button type="button" class="btn btn-sm btn-danger" style="height:38px;padding:0;"
                    title="LOT 행 삭제" onclick="LaserWipModule.removeAdjustResAllLotRow(this)">−</button>
            </div>`;
    }

    function addAdjustResAllLotRow() {
        const container = document.getElementById('lwAdjResAllLotRows');
        if (!container) return;
        container.insertAdjacentHTML('beforeend', _residualAdjustLotRowHtml({}));
        onAdjustResAllLotQtyInput();
    }

    // LOT 행이 1개뿐일 때는 배분 방식이 하나로 정해져 있으므로(총수량 = 그 LOT 수량),
    // "수정 후 총수량" 입력에 맞춰 그 LOT 수량도 실시간으로 따라가게 한다.
    function onAdjustResAllTotalQtyInput(value) {
        const container = document.getElementById('lwAdjResAllLotRows');
        if (!container) return;
        const rows = container.querySelectorAll('.lw-adj-res-lot-row');
        if (rows.length !== 1) return;
        const qtyInput = rows[0].querySelector('.lw-adj-res-lot-qty');
        if (qtyInput) qtyInput.value = value;
    }

    // 반대 방향: LOT별 수량을 고치면(추가/삭제 포함) "수정 후 총수량"이 그 합계를 따라가게 한다.
    function onAdjustResAllLotQtyInput() {
        const container = document.getElementById('lwAdjResAllLotRows');
        const totalInput = document.getElementById('lwAdjResAllQty');
        if (!container || !totalInput) return;
        const sum = Array.from(container.querySelectorAll('.lw-adj-res-lot-qty'))
            .reduce(function(s, input) { return s + Math.max(0, parseInt(input.value || '0', 10) || 0); }, 0);
        totalInput.value = sum;
    }

    function removeAdjustResAllLotRow(button) {
        const container = document.getElementById('lwAdjResAllLotRows');
        const row = button && button.closest ? button.closest('.lw-adj-res-lot-row') : null;
        if (!container || !row) return;
        const rows = container.querySelectorAll('.lw-adj-res-lot-row');
        if (rows.length <= 1) {
            row.querySelectorAll('input').forEach(function(input) { input.value = ''; });
            onAdjustResAllLotQtyInput();
            return;
        }
        row.remove();
        onAdjustResAllLotQtyInput();
    }

    function _readAdjustResAllLotRows() {
        return Array.from(document.querySelectorAll('#lwAdjResAllLotRows .lw-adj-res-lot-row'))
            .map(function(row) {
                return {
                    paintLot: String((row.querySelector('.lw-adj-res-paint-lot') || {}).value || '').trim(),
                    injLot: String((row.querySelector('.lw-adj-res-inj-lot') || {}).value || '').trim(),
                    qty: Math.max(0, parseInt((row.querySelector('.lw-adj-res-lot-qty') || {}).value || '0', 10) || 0)
                };
            })
            .filter(function(lot) { return lot.paintLot || lot.injLot || lot.qty > 0; });
    }

    function openAdjustResidualSingleLotModal(keyEnc, paintLotEnc, injLotEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const injLot = _decodeArg(injLotEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 LOT 보정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;margin-top:6px;">
                    도장 LOT <strong style="font-family:monospace;color:var(--accent-green);">${_esc(paintLot || '-')}</strong>
                    · 사출 LOT <strong style="font-family:monospace;">${_esc(injLot || '-')}</strong>
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 수량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(curQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjResLotDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjResLotQty" value="${curQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjResLotNote" placeholder="LOT 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustResidualSingleLotModal('${_jsArg(keyEnc || '')}','${_jsArg(paintLotEnc || '')}','${_jsArg(injLotEnc || '')}',${curQty})">저장</button>
        `, 'md');
    }

    async function saveAdjustResidualSingleLotModal(keyEnc, paintLotEnc, injLotEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다. 목록에서 다시 시도해 주세요.', 'error');
            return;
        }
        const paintLot = _normalizePaintLot(_decodeArg(paintLotEnc));
        const injLot = _normalizeInjLot(_decodeArg(injLotEnc));
        if (!paintLot || paintLot === '-' || !injLot || injLot === '-') {
            UIUtils.toast('도장/사출 LOT 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const curQty = Math.max(0, Number(currentQty) || 0);
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjResLotQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjResLotDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjResLotNote') || {}).value || '').trim()
            || (`LOT ${paintLot}/${injLot} 보정`);
        const diff = targetQty - curQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        const prod = _getResidualProducts().find(function(p) {
            return p.carModel === carModel && p.partName === partName && (!color || p.color === color);
        });
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;

        try {
            await _neutralizePriorLotAdjustRecords(carModel, partName, color, paintLot, injLot);
            await Storage.add(STORE_LASER, {
                date,
                carModel,
                partName,
                color,
                lotNo: injLot,
                residualPaintLot: paintLot,
                paintDate: paintLot,
                note,
                packUnit,
                isManual: true,
                isResidualLotAdjust: true,
                residualLotAbsoluteQty: targetQty,
                quantity: Math.abs(diff) || targetQty,
                isResidualManualIn: diff >= 0,
                isResidualManualOut: diff < 0,
                author: _currentUserName()
            });
        } catch (err) {
            console.error('[LaserWip] saveAdjustResidualSingleLotModal failed:', err);
            UIUtils.toast('LOT 보정 저장에 실패했습니다.', 'error');
            return;
        }

        UIUtils.closeModal();
        UIUtils.toast(`LOT ${paintLot}/${injLot} 수량이 ${UIUtils.formatNumber(curQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
        setTimeout(function() { showResidualDetail(_productKey(carModel, partName, color)); }, 80);
    }

    function openAdjustResidualLotModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const { lots, manualAdj } = _calcResidualLotDetail(carModel, partName, color);
        const initialLots = lots.length > 0
            ? lots.map(function(l) { return { paintLot: l.paintLot, injLot: l.injLot, qty: l.qty }; })
            : [{ paintLot: '', injLot: '', qty: 0 }];
        const totalQty = initialLots.reduce(function(s, l) { return s + (Number(l.qty) || 0); }, 0);
        const today = new Date().toISOString().slice(0, 10);
        const unassignedNote = manualAdj > 0
            ? `<div style="font-size:0.76rem;color:var(--accent-orange,#f59e0b);margin-top:8px;">LOT 미지정 잔량 ${UIUtils.formatNumber(manualAdj)} EA는 이 보정에 포함되지 않습니다. LOT 표의 'LOT 지정' 버튼으로 별도 처리하세요.</div>`
            : '';

        UIUtils.showModal('레이져 잔량 보정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 잔량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(totalQty)} EA</strong>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;line-height:1.45;">
                    수량 보정은 <strong>현재 실사 수량</strong>을 기준으로 LOT별 잔량을 맞춥니다.
                    과거 이력(음수 포함)과 무관하게 입력한 값으로 현재 수량이 덮어씌워집니다.
                </div>
                ${unassignedNote}
            </div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjResAllDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 총수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjResAllQty" value="${totalQty}" min="0" placeholder="0"
                        oninput="LaserWipModule.onAdjustResAllTotalQtyInput(this.value)">
                </div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div>
                        <strong style="font-size:0.85rem;">LOT별 재고 배분</strong>
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">도장·사출 LOT는 YYMMDD(6자리) 필수 · LOT 수량 합계 = 총수량</div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" onclick="LaserWipModule.addAdjustResAllLotRow()">
                        <span class="material-symbols-outlined" style="font-size:1rem;">add</span> LOT 추가
                    </button>
                </div>
                <div id="lwAdjResAllLotRows">${initialLots.map(_residualAdjustLotRowHtml).join('')}</div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjResAllNote" placeholder="LOT 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustResidualLotModal('${_jsArg(keyEnc || '')}')">저장</button>
        `, 'lg');
    }

    async function saveAdjustResidualLotModal(keyEnc) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다. 목록에서 다시 시도해 주세요.', 'error');
            return;
        }

        const rows = _readAdjustResAllLotRows();
        const totalQty = Math.max(0, parseInt((document.getElementById('lwAdjResAllQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjResAllDate') || {}).value || new Date().toISOString().slice(0, 10);
        const noteInput = ((document.getElementById('lwAdjResAllNote') || {}).value || '').trim();

        // LOT이 1개뿐이면 배분 방식이 유일하므로(총수량 = 그 LOT 수량) 저장 시점에 자동으로 맞춰준다.
        if (rows.length === 1 && totalQty > 0) {
            rows[0].qty = totalQty;
        }

        const invalidRow = rows.find(function(row) { return !row.paintLot || !row.injLot || row.qty <= 0; });
        if (!rows.length || invalidRow) {
            UIUtils.toast('각 LOT 행의 도장 LOT, 사출 LOT, LOT 수량을 모두 입력해 주세요.', 'warning');
            return;
        }

        const formatError = rows.reduce(function(err, row) {
            if (err) return err;
            const paintErr = _lotValidationMessage(row.paintLot);
            if (paintErr) return '도장 LOT: ' + paintErr;
            const injErr = _lotValidationMessage(row.injLot);
            if (injErr) return '사출 LOT: ' + injErr;
            return null;
        }, null);
        if (formatError) {
            UIUtils.toast(formatError, 'warning');
            return;
        }

        const rowSum = rows.reduce(function(s, row) { return s + row.qty; }, 0);
        if (Math.abs(rowSum - totalQty) > 0.001) {
            UIUtils.toast(
                `LOT 수량 합계(${UIUtils.formatNumber(rowSum)} EA)와 수정 후 총수량(${UIUtils.formatNumber(totalQty)} EA)이 일치하지 않습니다.`,
                'warning'
            );
            return;
        }

        const seenKeys = {};
        for (let i = 0; i < rows.length; i++) {
            const dupKey = _residualLotKey(_normalizePaintLot(rows[i].paintLot), _normalizeInjLot(rows[i].injLot));
            if (seenKeys[dupKey]) {
                UIUtils.toast('같은 LOT(도장+사출)이 두 번 입력되었습니다. 한 행으로 합쳐 주세요.', 'warning');
                return;
            }
            seenKeys[dupKey] = true;
        }

        const detail = _calcResidualLotDetail(carModel, partName, color);
        const currentLots = {};
        (detail.lots || []).forEach(function(l) {
            currentLots[_residualLotKey(l.paintLot, l.injLot)] = Math.max(0, Number(l.qty) || 0);
        });

        const submittedKeys = {};
        const changes = [];
        rows.forEach(function(row) {
            const paintLot = _normalizePaintLot(row.paintLot);
            const injLot = _normalizeInjLot(row.injLot);
            const key = _residualLotKey(paintLot, injLot);
            submittedKeys[key] = true;
            const curQty = currentLots[key] || 0;
            if (row.qty !== curQty) {
                changes.push({ paintLot, injLot, targetQty: row.qty, curQty });
            }
        });
        // 화면에서 지운 기존 LOT은 더 이상 보유하지 않는다는 뜻이므로 0으로 보정한다.
        Object.keys(currentLots).forEach(function(key) {
            if (submittedKeys[key] || currentLots[key] <= 0) return;
            const pipeIdx = key.indexOf('|');
            changes.push({
                paintLot: pipeIdx >= 0 ? key.slice(0, pipeIdx) : key,
                injLot: pipeIdx >= 0 ? key.slice(pipeIdx + 1) : '-',
                targetQty: 0,
                curQty: currentLots[key]
            });
        });

        if (!changes.length) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        const prod = _getResidualProducts().find(function(p) { return p.carModel === carModel && p.partName === partName && (!color || p.color === color); });
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;
        const note = noteInput || 'LOT 보정';
        const author = _currentUserName();

        try {
            for (let i = 0; i < changes.length; i++) {
                const ch = changes[i];
                const diff = ch.targetQty - ch.curQty;
                // 이전 LOT 절대보정은 감사처리 후, 이번 보정만 실재고로 반영
                await _neutralizePriorLotAdjustRecords(carModel, partName, color, ch.paintLot, ch.injLot);
                // ★ 원천 작업의 laserResidualQty를 직접 고치지 않는다.
                //    (고치면 과거 수기 출고가 남은 채 기준량만 커져 LOT 합과 총잔량이 다시 어긋남)
                //    residualLotAbsoluteQty로 “현재 실사 수량”을 덮어쓰는 것이 수량 보정의 의미이다.
                await Storage.add(STORE_LASER, {
                    date,
                    carModel,
                    partName,
                    color,
                    lotNo: ch.injLot,
                    residualPaintLot: ch.paintLot,
                    note,
                    packUnit,
                    isManual: true,
                    isResidualLotAdjust: true,
                    residualLotAbsoluteQty: ch.targetQty,
                    quantity: Math.abs(diff) || ch.targetQty,
                    isResidualManualIn: diff >= 0,
                    isResidualManualOut: diff < 0,
                    author
                });
            }
        } catch (err) {
            console.error('[LaserWip] saveAdjustResidualLotModal failed:', err);
            UIUtils.toast('LOT 보정 저장에 실패했습니다.', 'error');
            return;
        }

        UIUtils.closeModal();
        UIUtils.toast(`잔량이 LOT ${changes.length}건 보정되었습니다. (총 ${UIUtils.formatNumber(rowSum)} EA)`, 'success');
        refresh();
        setTimeout(function() { showResidualDetail(_productKey(carModel, partName, color)); }, 80);
    }

    // LOT 정보 없이 남아있는 레거시 수기 잔량(LOT 미지정)을 찾는다.
    // _calcResidualLotDetail의 manualAdj 판별 조건과 동일해야 화면과 실제 대상이 어긋나지 않는다.
    function _findUnassignedResidualRecords(carModel, partName, color) {
        return (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return false;
            if (color && (w.color || '') !== color) return false;
            if (!(w.isResidualManualIn || w.isResidualManualOut)) return false;
            if (w.residualLotAbsoluteQty != null) return false;
            if (w.isResidualAuditOnly) return false;
            const rawPaintLot = w.residualPaintLot || w.paintDate || '';
            const rawInjLot = w.lotNo || '';
            return !(rawPaintLot && rawInjLot);
        });
    }

    function _isUnassignedOpeningLot(lot) {
        if (!lot) return true;
        const paintLot = String(lot.paintLot || lot.paintDate || '').trim();
        const injLot = String(lot.injLot || lot.lotNo || '').trim();
        return _isUnassignedPaintLot(paintLot) || _isUnassignedInjLot(injLot);
    }

    // 이력 리셋 스냅샷에 남아 있는 'LOT 미지정'을 지정 LOT로 옮긴다.
    async function _convertUnassignedInResidualReset(carModel, partName, color, paintLot, injLot, assignQty) {
        await _ensureResidualHistoryResetsLoaded();
        const reset = _getResidualHistoryReset(carModel, partName, color);
        if (!reset || !Array.isArray(reset.openingLots) || !reset.openingLots.length) {
            return { converted: 0, changed: false };
        }

        let remaining = Math.max(0, Number(assignQty) || 0);
        let converted = 0;
        const nextLots = [];
        reset.openingLots.forEach(function(lot) {
            const qty = Math.max(0, Number(lot && lot.qty) || 0);
            if (qty <= 0) return;
            if (!_isUnassignedOpeningLot(lot) || remaining <= 0) {
                nextLots.push(Object.assign({}, lot, { qty: qty }));
                return;
            }
            const take = Math.min(qty, remaining);
            converted += take;
            remaining -= take;
            const left = qty - take;
            if (left > 0) {
                nextLots.push(Object.assign({}, lot, { qty: left }));
            }
        });

        if (converted <= 0) return { converted: 0, changed: false };

        const paintNorm = _normalizePaintLot(paintLot);
        const injNorm = _normalizeInjLot(injLot);
        let merged = false;
        nextLots.forEach(function(lot) {
            if (merged) return;
            if (_normalizePaintLot(lot.paintLot || lot.paintDate || '') === paintNorm
                && _normalizeInjLot(lot.injLot || lot.lotNo || '') === injNorm) {
                lot.qty = Math.max(0, Number(lot.qty) || 0) + converted;
                lot.paintLot = paintNorm;
                lot.injLot = injNorm;
                merged = true;
            }
        });
        if (!merged) {
            nextLots.push({ paintLot: paintNorm, injLot: injNorm, qty: converted });
        }

        const lotSum = nextLots.reduce(function(sum, lot) {
            return sum + Math.max(0, Number(lot.qty) || 0);
        }, 0);
        const key = (reset.key) || _productKeyRaw(carModel, partName, color);
        _residualHistoryResets = (_residualHistoryResets || []).map(function(row) {
            const rk = (row && row.key) || _productKeyRaw(row && row.carModel, row && row.partName, row && row.color);
            if (rk !== key) return row;
            return Object.assign({}, row, {
                openingLots: nextLots,
                openingStock: lotSum,
                updatedAt: new Date().toISOString()
            });
        });
        await _saveResidualHistoryResets();
        return { converted: converted, changed: true };
    }

    // 잔량이 LOT 없이(미지정) 남아있을 때 도장/사출 LOT을 새로 지정해서 정상 LOT 표로 편입시킨다.
    function openAssignResidualLotModal(keyEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const detail = _calcResidualLotDetail(carModel, partName, color);
        const liveUnassigned = Math.max(0, Number(detail.manualAdj) || 0);
        const curQty = liveUnassigned > 0 ? liveUnassigned : Math.max(0, Number(currentQty) || 0);
        if (curQty <= 0) {
            UIUtils.toast('지정할 LOT 미지정 잔량이 없습니다.', 'info');
            return;
        }
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 잔량 LOT 지정', `
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    LOT 미지정 잔량 <strong style="color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(curQty)} EA</strong>
                </div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">
                도장/사출 LOT이 없어 '미지정'으로 표시된 잔량입니다. LOT을 지정하면 정상 LOT 표로 이동합니다.
                ${(_getResidualHistoryReset(carModel, partName, color) ? '<br>이력 리셋 스냅샷의 미지정도 함께 전환됩니다.' : '')}
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwAssignResInjLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwAssignResPaintLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAssignResDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">지정 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAssignResQty" value="${curQty}" min="1" max="${curQty}" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAssignResNote" placeholder="LOT 지정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAssignResidualLotModal('${_jsArg(keyEnc || '')}',${curQty})">저장</button>
        `, 'md');
    }

    async function saveAssignResidualLotModal(keyEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }

        const injLot = ((document.getElementById('lwAssignResInjLot') || {}).value || '').trim();
        const paintLot = ((document.getElementById('lwAssignResPaintLot') || {}).value || '').trim();
        if (!injLot) {
            UIUtils.toast('사출 LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwAssignResInjLot')?.focus();
            return;
        }
        const injLotErr = _lotValidationMessage(injLot);
        if (injLotErr) {
            UIUtils.toast('사출 LOT: ' + injLotErr, 'warning');
            document.getElementById('lwAssignResInjLot')?.focus();
            return;
        }
        if (!paintLot) {
            UIUtils.toast('도장 작업LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwAssignResPaintLot')?.focus();
            return;
        }
        const paintLotErr = _lotValidationMessage(paintLot);
        if (paintLotErr) {
            UIUtils.toast('도장 작업LOT: ' + paintLotErr, 'warning');
            document.getElementById('lwAssignResPaintLot')?.focus();
            return;
        }

        const date = (document.getElementById('lwAssignResDate') || {}).value || new Date().toISOString().slice(0, 10);
        const detailBefore = _calcResidualLotDetail(carModel, partName, color);
        const unassignedBefore = Math.max(0, Number(detailBefore.manualAdj) || 0);
        const maxAssign = unassignedBefore > 0 ? unassignedBefore : Math.max(0, Number(currentQty) || 0);
        let targetQty = Math.max(0, parseInt((document.getElementById('lwAssignResQty') || {}).value || '0', 10) || 0);
        if (targetQty <= 0) {
            UIUtils.toast('지정 수량을 입력해 주세요.', 'warning');
            return;
        }
        if (maxAssign > 0 && targetQty > maxAssign) {
            targetQty = maxAssign;
        }
        const note = ((document.getElementById('lwAssignResNote') || {}).value || '').trim() || 'LOT 지정';

        try {
            // 1) 이력 리셋 스냅샷의 미지정 잔량을 지정 LOT로 전환 (리셋 후 미지정 잔량의 핵심 원인)
            const resetResult = await _convertUnassignedInResidualReset(
                carModel, partName, color, paintLot, injLot, targetQty
            );

            // 2) 리셋 이전/이후 수기 미지정 기록에도 LOT 메타데이터를 채운다.
            const unassigned = _findUnassignedResidualRecords(carModel, partName, color);
            for (let i = 0; i < unassigned.length; i++) {
                await Storage.update(STORE_LASER, unassigned[i].id, {
                    lotNo: injLot,
                    paintDate: paintLot,
                    residualPaintLot: paintLot
                });
            }

            // 3) 스냅샷 전환만으로 부족하면(리셋 없는 경우 등) 지정 LOT로 절대 보정 입고를 남긴다.
            const detailAfterMeta = _calcResidualLotDetail(carModel, partName, color);
            const stillUnassigned = Math.max(0, Number(detailAfterMeta.manualAdj) || 0);
            const assignedNow = (detailAfterMeta.lots || []).reduce(function(sum, lot) {
                if (_normalizePaintLot(lot.paintLot) !== _normalizePaintLot(paintLot)) return sum;
                if (_normalizeInjLot(lot.injLot) !== _normalizeInjLot(injLot)) return sum;
                return sum + Math.max(0, Number(lot.qty) || 0);
            }, 0);

            if (stillUnassigned > 0 && resetResult.converted < targetQty) {
                // 스냅샷에 미지정이 더 남아 있으면 남은 분도 지정 LOT로 한 번 더 전환
                await _convertUnassignedInResidualReset(
                    carModel, partName, color, paintLot, injLot, Math.min(stillUnassigned, targetQty - resetResult.converted)
                );
            }

            const detailFinalCheck = _calcResidualLotDetail(carModel, partName, color);
            const assignedFinal = (detailFinalCheck.lots || []).reduce(function(sum, lot) {
                if (_normalizePaintLot(lot.paintLot) !== _normalizePaintLot(paintLot)) return sum;
                if (_normalizeInjLot(lot.injLot) !== _normalizeInjLot(injLot)) return sum;
                return sum + Math.max(0, Number(lot.qty) || 0);
            }, 0);
            const unassignedFinal = Math.max(0, Number(detailFinalCheck.manualAdj) || 0);

            // 리셋이 없고 미지정만 있던 경우: 미지정 소진 + 지정 LOT 반영을 절대보정으로 맞춘다.
            if (unassignedFinal >= targetQty && assignedFinal < targetQty) {
                const prod = _getResidualProducts().find(function(p) {
                    return p.carModel === carModel && p.partName === partName && (!color || p.color === color);
                });
                const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;
                // 미지정 잔량을 줄이기 위해 수기 출고(미지정) + 지정 LOT 절대보정
                await Storage.add(STORE_LASER, {
                    date, carModel, partName, color,
                    note: note + ' (미지정 차감)',
                    packUnit, isManual: true,
                    quantity: targetQty,
                    isResidualManualOut: true,
                    author: _currentUserName()
                });
                await Storage.add(STORE_LASER, {
                    date, carModel, partName, color,
                    lotNo: injLot,
                    paintDate: paintLot,
                    residualPaintLot: paintLot,
                    note: note,
                    packUnit, isManual: true,
                    quantity: targetQty,
                    isResidualManualIn: true,
                    isResidualLotAdjust: true,
                    residualLotAbsoluteQty: assignedFinal + targetQty,
                    author: _currentUserName()
                });
            } else if (!resetResult.changed && unassigned.length === 0 && assignedFinal < targetQty) {
                const prod = _getResidualProducts().find(function(p) {
                    return p.carModel === carModel && p.partName === partName && (!color || p.color === color);
                });
                const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;
                await Storage.add(STORE_LASER, {
                    date, carModel, partName, color,
                    lotNo: injLot,
                    paintDate: paintLot,
                    residualPaintLot: paintLot,
                    note: note,
                    packUnit, isManual: true,
                    quantity: targetQty,
                    isResidualManualIn: true,
                    author: _currentUserName()
                });
            }
        } catch (err) {
            console.error('[LaserWip] saveAssignResidualLotModal failed:', err);
            UIUtils.toast('LOT 지정 저장에 실패했습니다.', 'error');
            return;
        }

        const detailDone = _calcResidualLotDetail(carModel, partName, color);
        const leftUnassigned = Math.max(0, Number(detailDone.manualAdj) || 0);
        UIUtils.closeModal();
        if (leftUnassigned > 0) {
            UIUtils.toast(`LOT ${paintLot}/${injLot} 지정 완료. 미지정 잔량 ${UIUtils.formatNumber(leftUnassigned)} EA가 남아 있습니다.`, 'warning');
        } else {
            UIUtils.toast(`LOT 미지정 ${UIUtils.formatNumber(targetQty)} EA → ${paintLot}/${injLot} 지정 완료`, 'success');
        }
        refresh();
        setTimeout(function() { showResidualDetail(_productKey(carModel, partName, color)); }, 80);
    }

    // LOT 지정 없이 LOT 미지정 잔량 자체를 삭제(수기 출고 처리)한다.
    function confirmDeleteUnassignedResidual(keyEnc, qty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 삭제할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const amount = Math.max(0, Number(qty) || 0);
        if (amount <= 0) return;
        UIUtils.confirm(
            `LOT 미지정 잔량 ${UIUtils.formatNumber(amount)} EA를 삭제하시겠습니까? 입출고 이력에 삭제 기록이 남으며 되돌릴 수 없습니다.`,
            async () => {
                await _deleteUnassignedResidual(carModel, partName, color, amount);
            }
        );
    }

    async function _deleteUnassignedResidual(carModel, partName, color, amount) {
        const detail = _calcResidualLotDetail(carModel, partName, color);
        const liveUnassigned = Math.max(0, Number(detail.manualAdj) || 0);
        const targetQty = liveUnassigned > 0 ? Math.min(amount, liveUnassigned) : amount;
        if (targetQty <= 0) {
            UIUtils.toast('삭제할 LOT 미지정 잔량이 없습니다.', 'info');
            return;
        }
        const prod = _getResidualProducts().find(function(p) {
            return p.carModel === carModel && p.partName === partName && (!color || p.color === color);
        });
        const packUnit = prod ? _num(prod.packUnit || prod.packingUnit || prod.packageUnit || prod.packQty || prod.packingQty) : 0;
        try {
            await Storage.add(STORE_LASER, {
                date: new Date().toISOString().slice(0, 10),
                carModel, partName, color,
                note: 'LOT 미지정 잔량 삭제',
                packUnit, isManual: true,
                quantity: targetQty,
                isResidualManualOut: true,
                author: _currentUserName()
            });
        } catch (err) {
            console.error('[LaserWip] _deleteUnassignedResidual failed:', err);
            UIUtils.toast('삭제에 실패했습니다.', 'error');
            return;
        }
        UIUtils.toast(`LOT 미지정 잔량 ${UIUtils.formatNumber(targetQty)} EA를 삭제했습니다.`, 'success');
        refresh();
        setTimeout(function() { showResidualDetail(_productKey(carModel, partName, color)); }, 80);
    }

    function openAdjustAfterLaserLotModal(keyEnc, paintLotEnc, lotNoEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const lotNo = _decodeArg(lotNoEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const today = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 LOT 보정', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.82rem;color:var(--text-secondary);">
                    <strong>${_esc(carModel)}</strong> / ${_esc(partName)}${color ? ' / ' + _esc(color) : ''}
                </div>
                <div style="font-size:0.82rem;margin-top:6px;">
                    도장 LOT <strong style="font-family:monospace;color:var(--accent-green);">${_esc(paintLot || '-')}</strong>
                    · 사출 LOT <strong style="font-family:monospace;">${_esc(lotNo)}</strong>
                </div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px;">
                    현재 수량 <strong style="color:var(--accent-purple,#7c3aed);">${UIUtils.formatNumber(curQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수정 기준일</label>
                    <input type="date" class="form-input" id="lwAdjWipLotDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">수정 후 수량 (EA)</label>
                    <input type="number" class="form-input" id="lwAdjWipLotQty" value="${curQty}" min="0" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="lwAdjWipLotNote" placeholder="LOT 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAdjustAfterLaserLotModal('${_jsArg(keyEnc || '')}','${_jsArg(paintLotEnc || '')}','${_jsArg(lotNoEnc || '')}',${curQty})">저장</button>
        `, 'md');
    }

    async function saveAdjustAfterLaserLotModal(keyEnc, paintLotEnc, lotNoEnc, currentQty) {
        if (!_canEditWip()) { UIUtils.toast('관리자·레이져운영자만 수량을 수정할 수 있습니다.', 'warning'); return; }
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        const paintLot = _decodeArg(paintLotEnc);
        const lotNo = _decodeArg(lotNoEnc);
        const curQty = Math.max(0, Number(currentQty) || 0);
        const targetQty = Math.max(0, parseInt((document.getElementById('lwAdjWipLotQty') || {}).value || '0', 10) || 0);
        const date = (document.getElementById('lwAdjWipLotDate') || {}).value || new Date().toISOString().slice(0, 10);
        const note = ((document.getElementById('lwAdjWipLotNote') || {}).value || '').trim() || `LOT ${paintLot || '-'}/${lotNo} 보정`;
        const diff = targetQty - curQty;

        if (diff === 0) {
            UIUtils.closeModal();
            UIUtils.toast('변경된 수량이 없습니다.', 'info');
            return;
        }

        if (!_validateProductIdentity(carModel, partName, color)) {
            UIUtils.toast('품목 정보가 올바르지 않습니다. 목록에서 다시 시도해 주세요.', 'error');
            return;
        }

        const paintLots = paintLot ? [{ paintDate: paintLot, lotNo: lotNo, qty: Math.abs(diff) }] : [];
        const base = {
            date, carModel, partName, color, lotNo: lotNo, paintLot: paintLot || '',
            paintLots: paintLots, machine: '', note, isManual: true, isWipLotAdjust: true,
            author: _currentUserName()
        };

        if (diff > 0) {
            await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: diff }));
        } else {
            await Storage.add(STORE_LASER, Object.assign({}, base, { quantity: Math.abs(diff), isManualOut: true }));
        }

        UIUtils.closeModal();
        UIUtils.toast(`LOT ${lotNo} 수량이 ${UIUtils.formatNumber(curQty)} → ${UIUtils.formatNumber(targetQty)} EA로 수정되었습니다.`, 'success');
        refresh();
        setTimeout(function() { showWipDetail(_productKey(carModel, partName, color)); }, 80);
    }

    // ── 레이져 후 재공품 LOT별 잔량 계산 ────────────────────────────────
    // 제품 재공·이력표와 동일 이벤트(_buildAfterWipHistItems)를 시간순 재생한다.
    // 출고는 지정 LOT 우선 후 FIFO — 키 불일치로 음수 LOT가 숨고 보관 LOT만 부풀는 것을 막는다.
    function _calcWipLotDetail(carModel, partName, color, opts) {
        opts = opts || {};
        const ignoreHistoryReset = !!opts.ignoreHistoryReset;
        const histReset = ignoreHistoryReset ? null : _getAfterWipHistoryReset(carModel, partName, color);
        const resetAt = histReset && histReset.historyOnly ? (histReset.historyResetAt || '') : '';
        const useSnapshot = !!resetAt;

        const histItems = _buildAfterWipHistItems(carModel, partName, color);
        const wipMap = {};

        function _ensureLot(lotNo, paintLot) {
            const key = String(lotNo || '').trim() || '-';
            if (!wipMap[key]) wipMap[key] = { lotNo: key, paintLot: paintLot || '', balance: 0 };
            else if (!wipMap[key].paintLot && paintLot) wipMap[key].paintLot = paintLot;
            return wipMap[key];
        }

        function _drainLots(preferredLotNo, qty, paintLot) {
            let remain = Math.max(0, Number(qty) || 0);
            if (remain <= 0) return;
            const pref = String(preferredLotNo || '').trim();
            if (pref && pref !== '-' && wipMap[pref]) {
                const avail = Math.max(0, wipMap[pref].balance);
                const take = Math.min(avail, remain);
                wipMap[pref].balance = Math.max(0, wipMap[pref].balance - take);
                remain -= take;
                if (!wipMap[pref].paintLot && paintLot) wipMap[pref].paintLot = paintLot;
            }
            if (remain > 0) {
                Object.keys(wipMap).sort(function(a, b) { return String(a).localeCompare(String(b)); }).forEach(function(k) {
                    if (remain <= 0 || k === pref) return;
                    const avail = Math.max(0, wipMap[k].balance);
                    if (avail <= 0) return;
                    const take = Math.min(avail, remain);
                    wipMap[k].balance = Math.max(0, wipMap[k].balance - take);
                    remain -= take;
                });
            }
            // 후공정이 보유 재고보다 많이 빼가도 음수는 기억하지 않음 (잔량 0에서 절단)
        }

        function _lotAllocationsOf(h) {
            if (h && Array.isArray(h.lotAllocations) && h.lotAllocations.length) {
                return h.lotAllocations;
            }
            const inj = String((h && (h.injLot || h.lot)) || '').trim() || '-';
            const paint = String((h && h.paintLot) || '').trim();
            const paintNorm = paint && paint !== '-' ? _normalizePaintLot(paint) : '';
            // 이력 표시용으로 여러 LOT가 콤마 결합된 경우 → 수량 전체를 FIFO
            if (inj.indexOf(',') >= 0) {
                return [{ injLot: '', paintLot: paintNorm === '-' ? '' : paintNorm, qty: Number(h.qty) || 0, fifo: true }];
            }
            return [{
                injLot: inj,
                paintLot: paintNorm === '-' ? '' : paintNorm,
                qty: Number(h && h.qty) || 0
            }];
        }

        if (useSnapshot) {
            (Array.isArray(histReset.openingLots) ? histReset.openingLots : []).forEach(function(l) {
                const qty = Math.max(0, Number(l && l.qty) || 0);
                if (qty <= 0) return;
                const lotNo = String((l && (l.lotNo || l.injLot)) || '').trim() || '-';
                const paintLot = _normalizePaintLot((l && l.paintLot) || '');
                _ensureLot(lotNo, paintLot === '-' ? '' : paintLot).balance = qty;
            });
            const openingStock = Number(histReset.openingStock != null ? histReset.openingStock : 0) || 0;
            const seeded = Object.values(wipMap).reduce(function(s, l) { return s + Math.max(0, Number(l.balance) || 0); }, 0);
            if (openingStock > seeded) {
                _ensureLot('__UNASSIGNED__', '').balance += (openingStock - seeded);
            }
        }

        const events = histItems.slice().sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || '')) ||
                String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
                String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
        });

        events.forEach(function(h) {
            if (useSnapshot && _isBeforeHistoryReset(h.date, resetAt, h.createdAt)) return;
            const allocs = _lotAllocationsOf(h);
            allocs.forEach(function(a) {
                const qty = Math.max(0, Number(a.qty) || 0);
                if (qty <= 0) return;
                const paintLot = a.paintLot || '';
                const injLot = String(a.injLot || '').trim();
                if (h.isOut) {
                    if (a.fifo || !injLot || injLot === '-') _drainLots('', qty, paintLot);
                    else _drainLots(injLot, qty, paintLot);
                } else {
                    // 입고(양수)는 이전 초과출고와 무관하게 전량 가산
                    _ensureLot(injLot && injLot !== '-' ? injLot : '__UNASSIGNED__', paintLot).balance += qty;
                }
            });
        });

        // 잔량은 항상 0 이상만 유지 (후공정 초과 출고로 생긴 음수는 폐기)
        Object.keys(wipMap).forEach(function(k) {
            wipMap[k].balance = Math.max(0, Number(wipMap[k].balance) || 0);
        });

        return Object.values(wipMap)
            .map(function(l) { return { lotNo: l.lotNo, paintLot: l.paintLot || '', balance: Math.round(l.balance) }; })
            .filter(function(l) { return (Number(l.balance) || 0) > 0; })
            .sort(function(a, b) { return String(a.lotNo || '').localeCompare(String(b.lotNo || '')); });
    }

    function _wipQtyFromLotRows(lotRows) {
        return (lotRows || []).reduce(function(s, l) {
            return s + Math.max(0, Number(l && l.balance) || 0);
        }, 0);
    }

    // 레이져 후 재공에서 도장-B로 이동한 수량은 도장 "완료수량"이 아니라
    // 실제 투입수량이다. 완료수량은 공정 손실/불량을 제외한 결과값이므로 재공 출고량으로
    // 사용하면 투입 LOT 합계와 달라진다(예: 7,800 투입 / 7,752 완료 → 48 EA 불일치).
    function _paintingWipConsumptionQty(work) {
        if (!work) return 0;
        const inputQty = Math.max(0, Number(work.inputQty) || 0);
        if (inputQty > 0) return inputQty;
        const lotQty = (Array.isArray(work.lots) ? work.lots : []).reduce(function(sum, lot) {
            return sum + Math.max(0, Number(lot && lot.qty) || 0);
        }, 0);
        if (lotQty > 0) return lotQty;
        return Math.max(0, Number(work.productionQty) || 0);
    }

    function _normalizeWipLotAllocations(allocations, totalQty) {
        const total = Math.max(0, Number(totalQty) || 0);
        const rows = (allocations || []).filter(function(row) {
            return Math.max(0, Number(row && row.qty) || 0) > 0;
        }).map(function(row) {
            return Object.assign({}, row, { qty: Math.max(0, Number(row.qty) || 0) });
        });
        const sourceTotal = rows.reduce(function(sum, row) { return sum + row.qty; }, 0);
        if (total <= 0 || sourceTotal <= 0) return [];
        if (Math.abs(sourceTotal - total) < 0.001) return rows;
        if (sourceTotal < total) {
            rows.push({ injLot: '', paintLot: '', qty: total - sourceTotal, fifo: true });
            return rows;
        }

        // 레거시 데이터에서 LOT 합계가 투입수량보다 큰 경우에도 총 차감량은
        // 반드시 투입수량과 같도록 비례 축소한다.
        let allocated = 0;
        return rows.map(function(row, index) {
            const qty = index === rows.length - 1
                ? Math.max(0, total - allocated)
                : Math.max(0, Math.floor((row.qty / sourceTotal) * total));
            allocated += qty;
            return Object.assign({}, row, { qty: qty });
        }).filter(function(row) { return row.qty > 0; });
    }

    function _wipHistLotsFromLaser(w) {
        let paintLot = '-';
        let injLot = '-';
        if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
            paintLot = [...new Set(w.paintLots.map(function(pl) {
                return pl && pl.paintDate ? _normalizePaintLot(pl.paintDate) : '';
            }).filter(function(v) { return v && v !== '-'; }))].join(', ') || '-';
            injLot = [...new Set(w.paintLots.map(function(pl) {
                return String((pl && pl.lotNo) || '').trim();
            }).filter(Boolean))].join(', ') || '-';
        } else if (w.isWipLotAdjust || w.isManual) {
            paintLot = _normalizePaintLot(w.paintDate || w.paintLot || '') || '-';
            injLot = String(w.lotNo || '').trim() || '-';
        } else {
            paintLot = _normalizePaintLot(w.paintDate || '') || '-';
            injLot = String(w.paintLot || w.lotNo || '').trim() || '-';
        }
        return { paintLot: paintLot || '-', injLot: injLot || '-' };
    }

    // 상세 이력·현재 재공이 동일한 누적 로직을 쓰도록 입출고 이력 행을 구성한다.
    function _buildAfterWipHistItems(carModel, partName, color) {
        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const inspGoodMap = {};
        laserInsps.forEach(function(i) {
            if (i.workLogId) {
                const g = Math.max(0, (Number(i.inspQty) || 0) - (Number(i.failQty) || 0));
                inspGoodMap[i.workLogId] = (inspGoodMap[i.workLogId] || 0) + g;
            }
        });
        const drainMap = _buildAfterLaserDrainMap();
        const drainLine = drainMap[`${carModel}||${partName}`];
        const laserWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            if (_isResidualOnlyRecord(w)) return false;
            return (w.carModel || '') === carModel && (w.partName || '') === partName
                && _wipColorMatches(carModel, partName, w.color, color) && !w.isManualOut;
        });
        const paintWorks = (Storage.getAll(STORE_PAINT) || []).filter(function(w) {
            if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return false;
            if (!_wipColorMatches(carModel, partName, w.color, color)) return false;
            return !drainLine || (w.line || '').trim() === drainLine;
        });

        const histItems = [];
        laserWorks.forEach(function(w) {
            const goodQty = (w.id && (w.id in inspGoodMap)) ? inspGoodMap[w.id] : (Number(w.quantity) || 0);
            const lots = _wipHistLotsFromLaser(w);
            const isAdj = !!w.isWipLotAdjust;
            const isManualIn = !!w.isManual && !isAdj;
            const workQty = Number(w.quantity) || 0;
            const effGood = goodQty > 0 ? goodQty : workQty;
            let lotAllocations = [];
            if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
                const injLots = [];
                w.paintLots.forEach(function(pl) {
                    if (!pl) return;
                    let lotNo = String(pl.lotNo || '').trim();
                    if (!lotNo && pl.paintDate) lotNo = _normalizePaintLot(pl.paintDate);
                    if (lotNo && lotNo !== '-') injLots.push({ lotNo: lotNo, qty: Number(pl.qty) || 0, paintDate: pl.paintDate });
                });
                const totalLotQty = injLots.reduce(function(s, l) { return s + l.qty; }, 0);
                const paintLot0 = injLots[0] && injLots[0].paintDate
                    ? _normalizePaintLot(injLots[0].paintDate)
                    : (lots.paintLot !== '-' ? lots.paintLot : '');
                if (injLots.length) {
                    injLots.forEach(function(lj) {
                        const wipQty = totalLotQty > 0 ? (effGood * lj.qty / totalLotQty) : (effGood / injLots.length);
                        if (wipQty <= 0) return;
                        lotAllocations.push({
                            injLot: lj.lotNo,
                            paintLot: paintLot0 === '-' ? '' : paintLot0,
                            qty: wipQty
                        });
                    });
                }
            }
            if (!lotAllocations.length && effGood > 0) {
                lotAllocations = [{
                    injLot: lots.injLot !== '-' ? lots.injLot : '',
                    paintLot: lots.paintLot !== '-' ? lots.paintLot : '',
                    qty: effGood,
                    fifo: lots.injLot === '-' || !lots.injLot
                }];
            }
            const allocQty = lotAllocations.reduce(function(s, a) { return s + (Number(a.qty) || 0); }, 0);
            histItems.push({
                date: w.date || '-',
                isOut: false,
                routeLabel: isAdj ? 'LOT 보정' : (isManualIn ? '수동 입고' : '레이져 입고'),
                routeColor: isAdj ? '#2563eb' : (isManualIn ? '#0891b2' : '#7c3aed'),
                routeDetail: w.machine || (isAdj || isManualIn ? (w.note || '수동 조정') : '레이저 작업'),
                lot: lots.injLot,
                paintLot: lots.paintLot,
                injLot: lots.injLot,
                qty: allocQty > 0 ? allocQty : effGood,
                lotAllocations: lotAllocations,
                note: w.note || w.machine || '-',
                author: w.author || w.operator || '-',
                sourceId: w.id || '',
                createdAt: w.createdAt || '',
                _seq: w.createdAt || w.id || '',
                editKind: isAdj || isManualIn ? 'after_manual' : 'laser_work'
            });
        });
        (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            if (_isResidualOnlyRecord(w)) return false;
            return (w.carModel || '') === carModel && (w.partName || '') === partName
                && _wipColorMatches(carModel, partName, w.color, color) && !!w.isManualOut;
        }).forEach(function(w) {
            const lots = _wipHistLotsFromLaser(w);
            const isAdj = !!w.isWipLotAdjust;
            const qty = Number(w.quantity) || 0;
            histItems.push({
                date: w.date || '-',
                isOut: true,
                routeLabel: isAdj ? 'LOT 보정' : '수동 출고',
                routeColor: isAdj ? '#2563eb' : '#dc2626',
                routeDetail: w.note || '수동 차감',
                lot: lots.injLot,
                paintLot: lots.paintLot,
                injLot: lots.injLot,
                qty: qty,
                lotAllocations: [{
                    injLot: lots.injLot !== '-' ? lots.injLot : '',
                    paintLot: lots.paintLot !== '-' ? lots.paintLot : '',
                    qty: qty
                }],
                note: w.note || '',
                author: w.author || '-',
                sourceId: w.id || '',
                createdAt: w.createdAt || '',
                _seq: w.createdAt || w.id || '',
                editKind: 'after_manual'
            });
        });

        // 사출 LOT → 도장 LOT 매핑 (도장 작업 lots에 paintDate가 없는 레거시 출고 보강용)
        const paintByInj = {};
        function rememberPaintLot(injLot, paintLot) {
            const inj = String(injLot || '').trim();
            const paint = _normalizePaintLot(paintLot || '');
            if (!inj || inj === '-' || !paint || paint === '-') return;
            if (!paintByInj[inj]) paintByInj[inj] = paint;
        }
        histItems.forEach(function(h) {
            (h.lotAllocations || []).forEach(function(a) {
                rememberPaintLot(a.injLot, a.paintLot);
            });
            if (h.injLot && String(h.injLot).indexOf(',') < 0) {
                rememberPaintLot(h.injLot, h.paintLot);
            }
        });
        const histResetForMap = _getAfterWipHistoryReset(carModel, partName, color);
        (histResetForMap && Array.isArray(histResetForMap.openingLots) ? histResetForMap.openingLots : []).forEach(function(l) {
            rememberPaintLot(l && (l.lotNo || l.injLot), l && (l.paintLot || l.paintDate));
        });

        paintWorks.forEach(function(w) {
            const qty = _paintingWipConsumptionQty(w);
            let lotAllocations = [];
            if (Array.isArray(w.lots) && w.lots.length) {
                w.lots.forEach(function(l) {
                    const lqty = Number(l && l.qty) || 0;
                    if (lqty <= 0) return;
                    const inj = String((l && l.lotNo) || '').trim() || '';
                    const rawPaint = (l && (l.paintDate || l.paintLot)) || '';
                    let pl = rawPaint ? _normalizePaintLot(rawPaint) : '';
                    if ((!pl || pl === '-') && inj && paintByInj[inj]) pl = paintByInj[inj];
                    lotAllocations.push({
                        injLot: inj,
                        paintLot: pl === '-' ? '' : pl,
                        qty: lqty
                    });
                });
            } else {
                const inj = String(w.lotNo || '').trim() || '';
                lotAllocations = [{
                    injLot: inj,
                    paintLot: (inj && paintByInj[inj]) || '',
                    qty: qty,
                    fifo: !inj
                }];
            }
            lotAllocations = _normalizeWipLotAllocations(lotAllocations, qty).map(function(a) {
                if (a.paintLot) return a;
                const mapped = a.injLot && paintByInj[a.injLot] ? paintByInj[a.injLot] : '';
                return mapped ? Object.assign({}, a, { paintLot: mapped }) : a;
            });
            const paintLot = [...new Set(lotAllocations.map(function(a) {
                return String(a.paintLot || '').trim();
            }).filter(Boolean))].join(', ') || '-';
            const injLot = [...new Set(lotAllocations.map(function(a) {
                return String(a.injLot || '').trim();
            }).filter(Boolean))].join(', ') || (w.lotNo || '-');
            histItems.push({
                date: w.date || '-',
                isOut: true,
                routeLabel: '도장-B 출고',
                routeColor: '#2563eb',
                routeDetail: w.line || '도장-B 투입',
                lot: injLot || '-',
                paintLot: paintLot,
                injLot: injLot || '-',
                qty: qty,
                lotAllocations: lotAllocations,
                note: w.note || '',
                author: w.author || w.operator || w.worker || '-',
                createdAt: w.createdAt || '',
                _seq: w.createdAt || w.id || ''
            });
        });
        return histItems;
    }

    function _prepareAfterWipDisplayHist(histItems, histReset) {
        let displayHist = histItems.slice();
        if (!histReset || !histReset.historyResetAt) return displayHist;
        displayHist = histItems.map(function(h) {
            if (_isBeforeHistoryReset(h.date, histReset.historyResetAt, h.createdAt)) {
                return Object.assign({}, h, { beforeReset: true });
            }
            return h;
        });
        const openingLots = Array.isArray(histReset.openingLots) ? histReset.openingLots : [];
        // LOT표와 동일 원천: openingLots 합계를 리셋 시점 잔량으로 쓴다.
        const openingStock = openingLots.length
            ? _sumOpeningLotsQty(openingLots)
            : (Number(histReset.openingStock != null ? histReset.openingStock : 0) || 0);
        const paintLots = [...new Set(openingLots.map(function(l) { return String((l && (l.paintLot || l.paintDate)) || '').trim(); }).filter(function(v) { return v && v !== '-'; }))];
        const injLots = [...new Set(openingLots.map(function(l) { return String((l && (l.lotNo || l.injLot)) || '').trim(); }).filter(function(v) { return v && v !== '-'; }))];
        const lotNote = openingLots.length
            ? openingLots.map(function(l) {
                const paint = String((l && (l.paintLot || l.paintDate)) || '-').trim() || '-';
                const inj = String((l && (l.lotNo || l.injLot)) || '-').trim() || '-';
                const qty = Math.max(0, Number(l && l.qty) || 0);
                return paint + '/' + inj + '=' + qty;
            }).join(', ')
            : '이력 리셋 시점 잔량';
        displayHist.push({
            date: histReset.historyResetAt,
            isOut: false,
            routeLabel: '이력 리셋',
            routeColor: '#2563eb',
            routeDetail: histReset.note || '리셋 시점 잔량',
            lot: injLots.join(', ') || '-',
            paintLot: paintLots.join(', ') || '-',
            injLot: injLots.join(', ') || '-',
            qty: openingStock,
            absoluteAfter: openingStock,
            isHistoryReset: true,
            note: lotNote,
            author: histReset.author || '-'
        });
        return displayHist;
    }

    // 이력표 '현재 수량'과 동일한 제품 단위 재고 (리셋 스냅샷 + 이후 증감)
    function _replayAfterWipProductBalance(displayHist) {
        const steps = StockDetailUI.simpleReplaySteps(displayHist || [], function(item) {
            return item.isOut ? -(Number(item.qty) || 0) : (Number(item.qty) || 0);
        }, {
            floorZero: true,
            perLotKey: null,
            getAbsoluteAfter: function(item) {
                if (item && item.absoluteAfter != null && (item.routeLabel === '이력 리셋' || item.isHistoryReset)) {
                    return item.absoluteAfter;
                }
                return null;
            }
        });
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step.archiveOnly || (step.item && (step.item.beforeReset || step.item.archiveOnly))) continue;
            return Math.max(0, Number(step.stockAfter) || 0);
        }
        return 0;
    }

    function _findCalcWipRow(carModel, partName, color) {
        const colorKey = _resolveWipColorKey(carModel, partName, color);
        return (_calcWip()).find(function(x) {
            return x.carModel === carModel && x.partName === partName
                && _resolveWipColorKey(x.carModel, x.partName, x.color) === colorKey;
        }) || null;
    }

    // ── 레이져 후 재공품 상세 모달 ────────────────────────────────────────
    async function showWipDetail(keyEnc, evt) {
        if (evt) evt.stopPropagation();
        await _ensureAfterWipHistoryResetsLoaded();

        const { carModel, partName, color } = _parseProductKey(keyEnc);

        const r = _findCalcWipRow(carModel, partName, color);
        if (!r) return;

        const histReset = _getAfterWipHistoryReset(carModel, partName, color);
        const histItems = _buildAfterWipHistItems(carModel, partName, color);
        const displayHist = _prepareAfterWipDisplayHist(histItems, histReset);
        displayHist.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });

        const lotRows = _calcWipLotDetail(carModel, partName, color);
        const visibleLots = lotRows.filter(function(l) { return l.balance > 0; });
        // 현재 재공 = 현재 보관 LOT 합 (단일 원천). 이력표 현재수량과도 동일 이벤트 기준.
        const displayWip = _wipQtyFromLotRows(lotRows);
        const fmtStock = function(n) {
            const num = Math.max(0, Number(n) || 0);
            return num.toLocaleString('ko-KR');
        };

        // 안전장치: LOT별 배분(FIFO) 없이 이력을 그대로 재생한 "제품 단위 현재 수량"과
        // LOT표 합계(displayWip)를 서로 비교한다. 정상 데이터면 항상 같아야 하고, 다르면
        // (예: 출고가 입고보다 많이 기록된 데이터 오류) 조용히 틀린 숫자를 보여주는 대신 경고한다.
        const _replayedWip = _replayAfterWipProductBalance(displayHist);
        const _wipMismatch = Math.abs(_replayedWip - displayWip) > 0.001;
        if (_wipMismatch) {
            console.error('[LaserWip] 재공 현재수량 불일치:', {
                carModel, partName, color, displayWip, replayedWip: _replayedWip
            });
        }
        const resetHint = r.historyResetApplied
            ? `<div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.15);font-size:0.78rem;color:var(--text-secondary);">
                입고·출고 합계는 <strong>전체 이력 기록</strong>입니다. 현재 재공은 <strong>이력 리셋 이후</strong> 기준입니다.
               </div>`
            : '';

        const _cmJs = String(carModel || '').replace(/'/g, "\\'");
        const _pnJs = String(partName || '').replace(/'/g, "\\'");
        const _clJs = String(color || '').replace(/'/g, "\\'");
        const _keyJs = _productKey(carModel, partName, color);
        const canEdit = _canEditWip();

        const wipLotGroups = {};
        visibleLots.forEach(function(l) {
            const paintLot = (_normalizePaintLot(l.paintLot) !== '-' ? _normalizePaintLot(l.paintLot) : (l.paintLot || '-')) || '-';
            if (!wipLotGroups[paintLot]) wipLotGroups[paintLot] = { paintLot: paintLot, lots: [], total: 0 };
            wipLotGroups[paintLot].lots.push(Object.assign({}, l, { paintLot: paintLot }));
            wipLotGroups[paintLot].total += Number(l.balance) || 0;
        });
        const lotRowsHtml = Object.values(wipLotGroups).sort(function(a, b) {
            return String(a.paintLot).localeCompare(String(b.paintLot));
        }).map(function(group) {
            const lotTags = group.lots.map(function(l) {
                return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid var(--border-color);border-radius:999px;font-family:monospace;font-size:0.76rem;">
                    ${_esc(l.lotNo)} <strong style="color:var(--accent-purple,#7c3aed);">(${UIUtils.formatNumber(l.balance)})</strong>
                </span>`;
            }).join('');
            const actionHtml = canEdit
                ? group.lots.map(function(l) {
                    const _plJs = encodeURIComponent(l.paintLot || '');
                    const _lnJs = encodeURIComponent(l.lotNo || '');
                    const label = group.lots.length > 1 ? `${_esc(l.lotNo)} 보정` : '수량 보정';
                    return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;white-space:nowrap;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserWipModule.openAdjustAfterLaserLotModal('${_jsArg(_keyJs)}','${_plJs}','${_lnJs}',${Number(l.balance) || 0}),80);">
                        ${label}
                    </button>`;
                }).join('')
                : '';
            return `<tr>
                <td style="font-family:monospace;color:var(--accent-green);">${_esc(group.paintLot)}</td>
                <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${lotTags}</div></td>
                <td style="text-align:right;color:var(--accent-purple,#7c3aed);font-weight:600;">${UIUtils.formatNumber(group.total)}</td>
                ${canEdit ? `<td style="text-align:center;"><div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">${actionHtml}</div></td>` : ''}
            </tr>`;
        }).join('');

        const historySection = _wipHistorySection(displayHist, { splitLots: true, productLevelQty: true, floorZero: true });
        const resetBanner = histReset ? `
            <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);font-size:0.8rem;color:var(--text-secondary);">
                <strong style="color:#2563eb;">이력만 리셋 적용</strong>
                · ${_escapeHtml(String(histReset.historyResetAt || '').replace('T', ' ').slice(0, 16))}
                이전 이력은 <strong>리셋 이전 기록</strong>으로 남기고, <strong>현재 재공</strong>은 리셋 시점부터 다시 계산합니다.
                ${histReset.author ? ' · ' + _escapeHtml(histReset.author) : ''}
                ${histReset.note ? ' · ' + _escapeHtml(histReset.note) : ''}
            </div>` : '';

        UIUtils.showModal(
            `⚡ ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${_esc(carModel)}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${_esc(partName)}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${_esc(color)}</span>` : ''}
            </div>
            ${_detailActionBarHtml(canEdit || _isAdmin() ? `
                ${canEdit ? `
                <button class="btn btn-sm btn-outline" style="font-size:0.78rem;"
                    onclick="UIUtils.closeModal();setTimeout(()=>LaserWipModule.openAdjustAfterLaserModal('${_jsArg(_keyJs)}'),80);">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">edit</span> 재공 보정
                </button>
                <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                    onclick="LaserWipModule._openAfterLaserInForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 수동입고
                </button>
                <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                    onclick="LaserWipModule._openAfterLaserOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 수동 출고
                </button>` : ''}
                ${_historyResetBtnHtml("UIUtils.closeModal();setTimeout(()=>LaserWipModule.confirmResetAfterWip('" + _jsArg(_keyJs) + "'),80);")}
            ` : '')}
            ${_wipMismatch ? `
            <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;line-height:1.5;">
                <strong style="color:var(--accent-red);display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">error</span> 현재 재공과 이력이 일치하지 않습니다
                </strong>
                <div style="margin-top:5px;color:var(--text-secondary);">
                    LOT표 합계는 <strong>${fmtStock(displayWip)} EA</strong>인데 아래 입출고 이력을 재생한 값은
                    <strong>${fmtStock(_replayedWip)} EA</strong>로 서로 다릅니다. 입고보다 출고가 많이 기록된 등
                    데이터 오류일 수 있으니, 이력을 확인하고 '재공 보정'으로 실제 수량을 다시 맞춰 주세요.
                </div>
            </div>` : ''}
            ${resetBanner}
            ${resetHint}
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-purple,#7c3aed);">${fmtStock(displayWip)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">현재 재공 재고 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${fmtStock(r.laserQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">입고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-red);">${fmtStock(r.paintBQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출고 합계 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${Object.keys(wipLotGroups).length}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">보유 LOT 수</div>
                </div>
            </div>
            ${StockDetailUI.buildLotTableSection({
                headers: canEdit ? ['도장 LOT', '사출 LOT', '현재 수량', ''] : ['도장 LOT', '사출 LOT', '현재 수량'],
                colSpan: canEdit ? 4 : 3,
                rowsHtml: lotRowsHtml
            })}
            ${historySection}
            `,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'lg'
        );
    }

    async function confirmResetAfterWip(keyEnc) {
        if (!_canEditWip()) {
            UIUtils.toast('관리자·레이져운영자만 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureAfterWipHistoryResetsLoaded();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!carModel || !partName) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const r = _findCalcWipRow(carModel, partName, color);
        const stock = r ? Math.max(0, Number(r.wip) || 0) : 0;
        const lots = _calcWipLotDetail(carModel, partName, color).filter(function(l) { return (Number(l.balance) || 0) > 0; });
        const existing = _getAfterWipHistoryReset(carModel, partName, color);

        UIUtils.showModal('레이져 후 재공 이력만 리셋', `
            <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.88rem;font-weight:700;color:#2563eb;margin-bottom:6px;">음수(오류) 재공을 0으로 다시 시작합니다</div>
                <ul style="margin:0;padding-left:18px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                    <li>입고·출고 <strong>이력 기록은 그대로 남깁니다</strong> (잘못된 이력도 보관).</li>
                    <li>리셋 이전 이력은 상세에서 <strong>리셋 이전</strong>으로 표시됩니다.</li>
                    <li><strong>현재 재공</strong>은 리셋 시점 잔량(음수면 0)부터 다시 계산합니다.</li>
                    <li>원본 작업일지는 삭제되지 않습니다.</li>
                </ul>
            </div>
            <div style="font-size:0.85rem;margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                <div><strong>${_escapeHtml(carModel)}</strong> · ${_escapeHtml(partName)}${color ? ' · ' + _escapeHtml(color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);">현재 재고 ${UIUtils.formatNumber(stock)} EA · LOT ${lots.length}건${existing ? ' · 이전 리셋 있음' : ''}</div>
            </div>
            <div class="form-group">
                <label class="form-label">리셋 사유 (선택)</label>
                <input type="text" class="form-input" id="lwAfterWipResetNote" placeholder="예: 음수 재공 오류 정리 후 0으로 시작">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-danger" onclick="LaserWipModule.executeResetAfterWip('${_jsArg(keyEnc)}')">이력만 리셋</button>
        `, 'md');
    }

    async function executeResetAfterWip(keyEnc) {
        if (!_canEditWip()) {
            UIUtils.toast('관리자·레이져운영자만 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureAfterWipHistoryResetsLoaded();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!carModel || !partName) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const key = _productKeyRaw(carModel, partName, color);
        // 리셋 스냅샷은 LOT표와 동일 원천(_calcWipLotDetail)만 사용한다.
        // 예전처럼 laserQty-paintBQty(openingStock)와 LOT합을 따로 두면 525 vs 0 같은 불일치가 고착된다.
        const openingLots = _calcWipLotDetail(carModel, partName, color, { ignoreHistoryReset: true })
            .filter(function(l) { return (Number(l.balance) || 0) > 0; })
            .map(function(l) {
                return {
                    paintLot: l.paintLot || '-',
                    lotNo: l.lotNo || '',
                    injLot: l.lotNo || '',
                    qty: Number(l.balance) || 0
                };
            });
        const openingStock = _sumOpeningLotsQty(openingLots);
        const note = ((document.getElementById('lwAfterWipResetNote') || {}).value || '').trim() || '이력만 리셋';
        const historyResetAt = new Date().toISOString();

        _afterWipHistoryResets = (_afterWipHistoryResets || []).filter(function(row) {
            const rk = (row && row.key) || _productKeyRaw(row && row.carModel, row && row.partName, row && row.color);
            return rk !== key;
        });
        _afterWipHistoryResets.push({
            id: Storage.generateId(),
            key: key,
            carModel: carModel,
            partName: partName,
            color: color || '',
            historyResetAt: historyResetAt,
            historyOnly: true,
            openingStock: openingStock,
            openingLots: openingLots,
            author: _currentUserName(),
            note: note,
            updatedAt: historyResetAt
        });
        await _saveAfterWipHistoryResets();

        UIUtils.closeModal();
        UIUtils.toast(`이력만 리셋 완료 — 현재 재공 ${openingStock.toLocaleString('ko-KR')} EA부터 시작`, 'success');
        refresh();
        setTimeout(function() {
            try { showWipDetail(_productKey(carModel, partName, color)); } catch (e) {}
        }, 80);
    }

    // ── 레이져 잔량 상세 모달 ─────────────────────────────────────────────
    async function showResidualDetail(keyEnc, evt) {
        if (evt) evt.stopPropagation();
        await _ensureResidualHistoryResetsLoaded();

        const { carModel, partName, color } = _parseProductKey(keyEnc);

        const r = _calcLaserResidualWip().find(function(x) { return x.carModel === carModel && x.partName === partName && (x.color || '') === color; });
        if (!r) return;

        const histReset = _getResidualHistoryReset(carModel, partName, color);

        const laserAllWorks = (Storage.getAll(STORE_LASER) || []).filter(function(w) {
            return (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color);
        });

        const { lots: lotEntries, manualAdj, fifoTrace } = _calcResidualLotDetail(carModel, partName, color);
        // LOT가 없는 과거 수기 이력도 현재 보관 LOT 표에서 숨기지 않는다.
        // 실제 LOT로 추정하지 않고 "LOT 미지정"으로 명확히 분리한다.
        const displayLotEntries = lotEntries.slice();
        if (manualAdj > 0) {
            displayLotEntries.push({
                paintLot: 'LOT 미지정',
                injLot: '수기 잔량입고',
                qty: manualAdj,
                isUnassigned: true
            });
        }
        const lotTotalQty = displayLotEntries.reduce(function(s, e) { return s + Math.max(0, Number(e.qty) || 0); }, 0);
        // 헤더 현재 잔량은 보관 LOT 합과 반드시 동일
        const residualQtyDisplay = lotTotalQty > 0 ? lotTotalQty : Math.max(0, Number(r && r.residualQty) || 0);

        // 안전장치: LOT별 배분 합계와, LOT 구분 없이 전체 이력을 그대로 재생한 품목 단위 총량을 비교한다.
        const _flatResidualTotal = _calcResidualFlatTotal(carModel, partName, color);
        const _residualMismatch = Math.abs(_flatResidualTotal - residualQtyDisplay) > 0.001;
        if (_residualMismatch) {
            console.error('[LaserWip] 레이져 잔량 현재수량 불일치:', {
                carModel, partName, color, lotTotal: residualQtyDisplay, flatTotal: _flatResidualTotal
            });
        }

        const histItems = [];
        laserAllWorks.filter(function(w) { return !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut; }).forEach(function(w) {
            const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
            const packUnit = Number(w.packUnit) || 0;
            const residualQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
            if (residualQty <= 0) return;
            const lotKeys = _workResidualLotKeys(w);
            const firstKey = lotKeys[0] || '';
            const pipeIdx = firstKey.indexOf('|');
            const paintLot = pipeIdx >= 0 ? firstKey.slice(0, pipeIdx) : (w.paintDate || '-');
            const injLot = pipeIdx >= 0 ? firstKey.slice(pipeIdx + 1) : (w.lotNo || '-');
            const machine = _resolveResidualMachine(carModel, partName, color, paintLot, injLot, w.date, w.machine);
            histItems.push({
                date: w.date || '-',
                isOut: false,
                routeLabel: '잔량 발생',
                routeColor: '#f59e0b',
                routeDetail: machine || w.machine || '레이져 작업',
                lot: injLot || '-',
                paintLot: paintLot || '-',
                injLot: injLot || '-',
                lotKey: firstKey || ('__RES__|' + (w.id || '')),
                qty: residualQty,
                author: w.author || w.operator || [w.worker1, w.worker2, w.worker3].filter(Boolean).join(', ') || '-',
                note: w.note || '',
                _seq: w.createdAt || w.id || '',
                createdAt: w.createdAt || '',
                sourceId: w.id || '',
                editKind: 'laser_work'
            });
        });
        laserAllWorks.filter(function(w) {
            return (w.isResidualManualIn || w.isResidualManualOut) && !w.isResidualAuditOnly;
        }).forEach(function(w) {
            const qty = Number(w.quantity) || 0;
            const isIn = w.isResidualManualIn;
            const isLotAdjust = !!w.isResidualLotAdjust;
            const paintLot = _normalizePaintLot(w.residualPaintLot || w.paintDate || '') || '-';
            const injLot = _normalizeInjLot(w.lotNo || '') || '-';
            const lotKey = (paintLot !== '-' && injLot !== '-') ? _residualLotKey(paintLot, injLot) : ('__MANUAL__|' + (w.id || ''));
            const absQty = w.residualLotAbsoluteQty;
            const machine = _resolveResidualMachine(carModel, partName, color, paintLot, injLot, w.date, w.machine);
            let routeLabel;
            let routeColor;
            let routeDetail;
            if (isLotAdjust) {
                routeLabel = 'LOT 보정';
                routeColor = '#2563eb';
                routeDetail = machine
                    || ((paintLot !== '-' ? paintLot + ' / ' : '') + (injLot !== '-' ? injLot : ''))
                    || (w.note || '');
            } else if (isIn) {
                routeLabel = '수기 입고';
                routeColor = '#16a34a';
                routeDetail = machine || w.note || '잔량 수기 입고';
            } else {
                // 잔량 차감은 레이져 작업(포장·검사) 소진 — 수기 출고로 표기하지 않는다
                routeLabel = '레이져 작업출고';
                routeColor = '#7c3aed';
                routeDetail = machine || w.note || '레이져 작업';
            }
            histItems.push({
                date: w.date || '-',
                isOut: !isIn,
                routeLabel: routeLabel,
                routeColor: routeColor,
                routeDetail: routeDetail,
                lot: injLot,
                paintLot: paintLot,
                injLot: injLot,
                lotKey: lotKey,
                qty: qty,
                absoluteAfter: (isLotAdjust && absQty != null) ? Math.max(0, Number(absQty) || 0) : null,
                author: w.author || '-',
                note: w.note || '',
                _seq: w.createdAt || w.id || '',
                createdAt: w.createdAt || '',
                sourceId: w.id || '',
                editKind: 'residual_manual'
            });
        });

        // LOT 미지정 출고가 FIFO로 실제 LOT에서 빠져나간 내역을 그 LOT의 이력 행으로도 남긴다.
        // (원본 미지정 출고 행은 그대로 유지하고, 어디서 빠졌는지 보여주는 배분 행을 추가한다.
        //  총량은 이미 원본 미지정 출고 행에 반영돼 있으므로, 이 배분 행은 해당 LOT의
        //  기존/현재 수량을 맞추는 표시용이지 전체 합계에 이중 반영되지 않는다 — LOT별로만 재생한다.)
        (fifoTrace || []).forEach(function(t) {
            histItems.push({
                date: t.date || '-',
                isOut: true,
                routeLabel: '미지정 출고 배분',
                routeColor: '#dc2626',
                routeDetail: 'LOT 미지정 출고 자동 배분',
                lot: t.injLot,
                paintLot: t.paintLot,
                injLot: t.injLot,
                lotKey: t.key,
                qty: t.qty,
                author: t.author || '-',
                note: '미지정 출고가 이 LOT에서 자동 차감됨',
                _seq: (t.createdAt || t.date || '') + '_fifo',
                createdAt: t.createdAt || '',
                sourceId: t.sourceId || '',
                editKind: null
            });
        });
        histItems.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });

        // 이력만 리셋: 리셋 이전 이력은 기록으로 유지(재고·LOT 재생에는 미반영), 스냅샷 기준행 추가
        let displayHist = histItems.slice();
        if (histReset && histReset.historyResetAt) {
            displayHist = histItems.map(function(h) {
                if (_isBeforeHistoryReset(h.date, histReset.historyResetAt, h.createdAt)) {
                    return Object.assign({}, h, { beforeReset: true });
                }
                return h;
            });
            const openingLots = Array.isArray(histReset.openingLots) ? histReset.openingLots : [];
            if (openingLots.length) {
                openingLots.forEach(function(l) {
                    const qty = Math.max(0, Number(l && l.qty) || 0);
                    if (qty <= 0) return;
                    const paintLot = String((l && l.paintLot) || '-');
                    const injLot = String((l && l.injLot) || '-');
                    displayHist.push({
                        date: histReset.historyResetAt,
                        isOut: false,
                        routeLabel: '이력 리셋',
                        routeColor: '#2563eb',
                        routeDetail: histReset.note || '리셋 시점 LOT 잔량',
                        lot: injLot,
                        paintLot: paintLot,
                        injLot: injLot,
                        lotKey: _residualLotKey(paintLot, injLot),
                        qty: qty,
                        absoluteAfter: qty,
                        isHistoryReset: true,
                        note: '이력 리셋 시점 잔량',
                        author: histReset.author || '-'
                    });
                });
            } else {
                const openingStock = Number(histReset.openingStock != null ? histReset.openingStock : 0) || 0;
                displayHist.push({
                    date: histReset.historyResetAt,
                    isOut: false,
                    routeLabel: '이력 리셋',
                    routeColor: '#2563eb',
                    routeDetail: histReset.note || '리셋 시점 잔량',
                    lot: '-',
                    paintLot: '-',
                    injLot: '-',
                    lotKey: '__RESET__|ALL',
                    qty: openingStock,
                    absoluteAfter: openingStock,
                    isHistoryReset: true,
                    note: '이력 리셋 시점 잔량',
                    author: histReset.author || '-'
                });
            }
        }
        displayHist.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });

        const _cmJs = String(carModel || '').replace(/'/g, "\\'");
        const _pnJs = String(partName || '').replace(/'/g, "\\'");
        const _clJs = String(color || '').replace(/'/g, "\\'");
        const _keyJs = _productKey(carModel, partName, color);
        const canEdit = _canEditWip();

        // 동일 도장 LOT는 한 행으로 묶고, 사출 LOT별 수량을 함께 표시한다. (레이져 후 재공과 동일 UX)
        const residualLotGroups = {};
        displayLotEntries.forEach(function(e) {
            const paintLot = e.paintLot || '-';
            if (!residualLotGroups[paintLot]) residualLotGroups[paintLot] = { paintLot: paintLot, lots: [], total: 0 };
            residualLotGroups[paintLot].lots.push(e);
            residualLotGroups[paintLot].total += Number(e.qty) || 0;
        });
        const lotRowsHtml = Object.values(residualLotGroups).sort(function(a, b) {
            return String(a.paintLot).localeCompare(String(b.paintLot));
        }).map(function(group) {
            const lotTags = group.lots.map(function(e) {
                if (e.isUnassigned) {
                    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px dashed var(--accent-orange,#f59e0b);border-radius:999px;font-size:0.76rem;color:var(--text-muted);">
                        LOT 미지정 <strong style="color:var(--accent-orange,#f59e0b);">(${UIUtils.formatNumber(e.qty)})</strong>
                    </span>`;
                }
                return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid var(--border-color);border-radius:999px;font-family:monospace;font-size:0.76rem;">
                    ${_esc(e.injLot)} <strong style="color:var(--accent-orange,#f59e0b);">(${UIUtils.formatNumber(e.qty)})</strong>
                </span>`;
            }).join('');
            const actionHtml = !canEdit ? '' : group.lots.map(function(e) {
                if (e.isUnassigned) {
                    return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;white-space:nowrap;"
                        onclick="UIUtils.closeModal();setTimeout(function(){LaserWipModule.openAssignResidualLotModal('${_jsArg(_keyJs)}',${Number(e.qty) || 0});},80);">
                        LOT 지정
                    </button>
                    <button class="btn btn-sm btn-danger" style="font-size:0.72rem;padding:2px 8px;white-space:nowrap;"
                        onclick="LaserWipModule.confirmDeleteUnassignedResidual('${_jsArg(_keyJs)}',${Number(e.qty) || 0});">
                        삭제
                    </button>`;
                }
                const _plJs = encodeURIComponent(e.paintLot || '');
                const _injJs = encodeURIComponent(e.injLot || '');
                const label = group.lots.filter(function(x) { return !x.isUnassigned; }).length > 1
                    ? `${_esc(e.injLot)} 보정`
                    : '수량 보정';
                return `<button class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;white-space:nowrap;"
                    onclick="UIUtils.closeModal();setTimeout(function(){LaserWipModule.openAdjustResidualSingleLotModal('${_jsArg(_keyJs)}','${_plJs}','${_injJs}',${Number(e.qty) || 0});},80);">
                    ${label}
                </button>`;
            }).join('');
            return `<tr>
                <td style="font-family:monospace;color:${group.paintLot === 'LOT 미지정' ? 'var(--text-muted)' : 'var(--accent-green)'};">${_esc(group.paintLot)}</td>
                <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${lotTags}</div></td>
                <td style="text-align:right;color:var(--accent-orange,#f59e0b);font-weight:600;">${UIUtils.formatNumber(group.total)}</td>
                ${canEdit ? `<td style="text-align:center;"><div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">${actionHtml}</div></td>` : ''}
            </tr>`;
        }).join('');

        // LOT별(도장+사출) 기존±입출고=현재 — 품목 합계 재생은 복수 도장 LOT에서 혼동을 일으킴
        const historySection = _wipHistorySection(displayHist, { splitLots: true, productLevelQty: false });
        const resetBanner = histReset ? `
            <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);font-size:0.8rem;color:var(--text-secondary);">
                <strong style="color:#2563eb;">이력만 리셋 적용</strong>
                · ${_escapeHtml(String(histReset.historyResetAt || '').replace('T', ' ').slice(0, 16))}
                — 리셋 이전 이력은 <strong>기록으로 유지</strong>하고, <strong>현재 보관 LOT는 리셋 시점 스냅샷 + 이후 입출고만</strong>으로 계산합니다.
                ${histReset.author ? ' · ' + _escapeHtml(histReset.author) : ''}
                ${histReset.note ? ' · ' + _escapeHtml(histReset.note) : ''}
            </div>` : '';

        UIUtils.showModal(
            `📦 ${carModel} · ${partName}${color && color !== '-' ? ' · ' + color : ''}`,
            `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;
                        background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;flex-wrap:wrap;">
                <span><strong>${_esc(carModel)}</strong></span>
                <span style="color:var(--text-muted);">·</span>
                <span><strong>${_esc(partName)}</strong></span>
                ${color && color !== '-' ? `<span style="color:var(--text-muted);">·</span><span>${_esc(color)}</span>` : ''}
            </div>
            ${_detailActionBarHtml(canEdit || _isAdmin() ? `
                ${canEdit ? `
                <button class="btn btn-sm btn-primary" style="font-size:0.78rem;"
                    onclick="LaserWipModule._openResidualInForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">login</span> 입고
                </button>
                <button class="btn btn-sm btn-danger" style="font-size:0.78rem;"
                    onclick="LaserWipModule._openResidualOutForPart('${_cmJs}','${_pnJs}','${_clJs}');">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">logout</span> 출고
                </button>` : ''}
                ${_historyResetBtnHtml("UIUtils.closeModal();setTimeout(()=>LaserWipModule.confirmResetResidual('" + _jsArg(_keyJs) + "'),80);", { adminOnly: true })}
            ` : '')}
            ${_residualMismatch ? `
            <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;line-height:1.5;">
                <strong style="color:var(--accent-red);display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">error</span> 현재 잔량과 이력이 일치하지 않습니다
                </strong>
                <div style="margin-top:5px;color:var(--text-secondary);">
                    LOT표 합계는 <strong>${UIUtils.formatNumber(residualQtyDisplay)} EA</strong>인데 아래 입출고 이력을 LOT 구분 없이
                    재생한 값은 <strong>${UIUtils.formatNumber(_flatResidualTotal)} EA</strong>로 서로 다릅니다. 특정 LOT만 자체적으로
                    초과 출고돼 그 LOT에서 0으로 잘렸을 수 있으니, 이력을 확인하고 '수량 보정'으로 실제 수량을 다시 맞춰 주세요.
                </div>
            </div>` : ''}
            ${resetBanner}
            <div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;align-items:stretch;">
                <div style="background:var(--bg-secondary);padding:12px 16px;border-radius:8px;text-align:center;display:flex;align-items:center;gap:12px;">
                    <div>
                        <div style="font-size:1.4rem;font-weight:700;color:var(--accent-orange,#f59e0b);">${UIUtils.formatNumber(residualQtyDisplay)}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">현재 잔량 (EA)</div>
                    </div>
                    ${canEdit ? `<button class="btn btn-sm btn-outline" style="font-size:0.78rem;white-space:nowrap;"
                        onclick="UIUtils.closeModal();setTimeout(()=>LaserWipModule.openAdjustResidualLotModal('${_jsArg(_keyJs)}'),80);">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">tune</span> 수량 보정
                    </button>` : ''}
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">출하가능 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">포장단위 (EA)</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px 20px;border-radius:8px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;">${Object.keys(residualLotGroups).length}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">LOT 항목 수</div>
                </div>
            </div>
            ${StockDetailUI.buildLotTableSection({
                title: '현재 보관 LOT',
                headers: canEdit ? ['도장 LOT', '사출 LOT', '현재 수량', ''] : ['도장 LOT', '사출 LOT', '현재 수량'],
                colSpan: canEdit ? 4 : 3,
                qtyColIndex: 2,
                totalQty: residualQtyDisplay,
                totalLabel: '보관 합계',
                totalColor: 'var(--accent-orange,#f59e0b)',
                emptyText: 'LOT 정보가 없습니다.',
                rowsHtml: lotRowsHtml
            })}
            ${historySection}
            `,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'lg'
        );
    }

    async function confirmResetResidual(keyEnc) {
        // 레이져 잔량 수량 초기화는 관리자 전용으로 하드코딩
        if (!_isAdmin()) {
            UIUtils.toast('관리자만 잔량 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureResidualHistoryResetsLoaded();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!carModel || !partName) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const r = (_calcLaserResidualWip()).find(function(x) {
            return x.carModel === carModel && x.partName === partName && (x.color || '') === color;
        });
        const stock = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const detail = _calcResidualLotDetail(carModel, partName, color);
        const lotCount = (detail.lots || []).filter(function(l) { return (Number(l.qty) || 0) > 0; }).length
            + ((Number(detail.manualAdj) || 0) > 0 ? 1 : 0);
        const existing = _getResidualHistoryReset(carModel, partName, color);

        UIUtils.showModal('레이져 잔량 이력만 리셋', `
            <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.88rem;font-weight:700;color:#2563eb;margin-bottom:6px;">리셋 시점 LOT를 새 기준으로 잡습니다</div>
                <ul style="margin:0;padding-left:18px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                    <li>리셋 시각의 <strong>현재 잔량·도장/사출 LOT</strong>를 스냅샷으로 저장합니다.</li>
                    <li>리셋 이전 이력은 <strong>"리셋 이전" 기록으로 남기고</strong>, <strong>LOT 합계 계산에는 더 이상 넣지 않습니다</strong>.</li>
                    <li>리셋 이후 입고/출고/보정만 LOT·이력에 반영됩니다. (원본 일지 삭제 없음)</li>
                    <li>도장 LOT가 여러 개여도 <strong>LOT별로 기존±입출고=현재</strong>가 맞도록 재생합니다.</li>
                </ul>
            </div>
            <div style="font-size:0.85rem;margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                <div><strong>${_escapeHtml(carModel)}</strong> · ${_escapeHtml(partName)}${color ? ' · ' + _escapeHtml(color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);">현재 잔량 ${UIUtils.formatNumber(stock)} EA · LOT ${lotCount}건${existing ? ' · 이전 리셋 있음' : ''}</div>
            </div>
            <div class="form-group">
                <label class="form-label">리셋 사유 (선택)</label>
                <input type="text" class="form-input" id="lwResidualResetNote" placeholder="예: 복수 도장 LOT 이력/잔량 불일치 정리">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-danger" onclick="LaserWipModule.executeResetResidual('${_jsArg(keyEnc)}')">이력만 리셋</button>
        `, 'md');
    }

    async function executeResetResidual(keyEnc) {
        // 레이져 잔량 수량 초기화는 관리자 전용으로 하드코딩
        if (!_isAdmin()) {
            UIUtils.toast('관리자만 잔량 이력만 리셋을 실행할 수 있습니다.', 'warning');
            return;
        }
        await _ensureResidualHistoryResetsLoaded();
        const { carModel, partName, color } = _parseProductKey(keyEnc);
        if (!carModel || !partName) {
            UIUtils.toast('품목 정보가 올바르지 않습니다.', 'warning');
            return;
        }
        const key = _productKeyRaw(carModel, partName, color);
        const r = (_calcLaserResidualWip()).find(function(x) {
            return x.carModel === carModel && x.partName === partName && (x.color || '') === color;
        });
        const openingStock = r ? Math.max(0, Number(r.residualQty) || 0) : 0;
        const detail = _calcResidualLotDetail(carModel, partName, color);
        const openingLots = (detail.lots || [])
            .filter(function(l) { return (Number(l.qty) || 0) > 0; })
            .map(function(l) {
                return {
                    paintLot: l.paintLot || '-',
                    injLot: l.injLot || '',
                    qty: Number(l.qty) || 0
                };
            });
        if ((Number(detail.manualAdj) || 0) > 0) {
            openingLots.push({ paintLot: 'LOT 미지정', injLot: '수기 잔량입고', qty: Number(detail.manualAdj) || 0 });
        }
        const note = ((document.getElementById('lwResidualResetNote') || {}).value || '').trim() || '이력만 리셋';
        const historyResetAt = new Date().toISOString();

        _residualHistoryResets = (_residualHistoryResets || []).filter(function(row) {
            const rk = (row && row.key) || _productKeyRaw(row && row.carModel, row && row.partName, row && row.color);
            return rk !== key;
        });
        _residualHistoryResets.push({
            id: Storage.generateId(),
            key: key,
            carModel: carModel,
            partName: partName,
            color: color || '',
            historyResetAt: historyResetAt,
            historyOnly: true,
            openingStock: openingStock,
            openingLots: openingLots,
            author: _currentUserName(),
            note: note,
            updatedAt: historyResetAt
        });
        await _saveResidualHistoryResets();

        UIUtils.closeModal();
        UIUtils.toast(`이력만 리셋 완료 — 잔량 ${UIUtils.formatNumber(openingStock)} EA · LOT 유지`, 'success');
        refresh();
        setTimeout(function() {
            try { showResidualDetail(_productKey(carModel, partName, color)); } catch (e) {}
        }, 80);
    }

    function _num(value) {
        return Number(String(value == null ? '' : value).replace(/,/g, '')) || 0;
    }

    function _laserResidualRow(r) {
        const encKey = _productKey(r.carModel || '', r.partName || '', r.color || '');
        return `<tr style="border-bottom:1px solid var(--border-color);cursor:pointer;"
                    onclick="LaserWipModule.showResidualDetail('${encKey}', event)"
                    onmouseover="this.style.background='rgba(245,158,11,0.07)'"
                    onmouseout="this.style.background=''">
            <td style="padding:10px 14px;font-weight:600;">${_esc(r.carModel || '-')}</td>
            <td style="padding:10px 14px;">${_esc(r.partName || '-')}</td>
            <td style="padding:10px 14px;">${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${_esc(r.color)}</span>` : '-'}</td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;">${UIUtils.formatNumber(r.goodQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-green);">${UIUtils.formatNumber(r.fullBoxQty)}</td>
            <td style="padding:10px 14px;text-align:right;">${r.packUnit ? UIUtils.formatNumber(r.packUnit) : '-'}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:800;color:var(--accent-orange);">${UIUtils.formatNumber(r.residualQty)}</td>
            <td style="padding:10px 14px;text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:rgba(245,158,11,0.12);color:var(--accent-orange);">
                    <span class="material-symbols-outlined" style="font-size:0.85rem;">move_to_inbox</span> 잔량입고
                </span>
            </td>
            <td style="padding:10px 14px;color:var(--text-muted);">-</td>
        </tr>`;
    }

    // 잔량 상세 내역에 표시할 개별 수동 입고/출고 이력 행 (작성자 포함)
    function _manualResidualHistoryRow(w) {
        const isOut = !!w.isResidualManualOut;
        const qty = _num(w.quantity);
        const badge = isOut
            ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:rgba(124,58,237,0.12);color:#7c3aed;">
                  <span class="material-symbols-outlined" style="font-size:0.85rem;">outbox</span> 레이져 작업출고
               </span>`
            : `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;background:rgba(59,130,246,0.12);color:var(--accent-blue,#2563eb);">
                  <span class="material-symbols-outlined" style="font-size:0.85rem;">move_to_inbox</span> 수동입고
               </span>`;
        const machine = _resolveResidualMachine(
            w.carModel || '', w.partName || '', w.color || '',
            w.residualPaintLot || w.paintDate || '', w.lotNo || '', w.date || '', w.machine || ''
        );
        return `<tr style="border-bottom:1px solid var(--border-color);background:rgba(59,130,246,0.03);">
            <td style="padding:10px 14px;font-weight:600;">${_esc(w.carModel || '-')}</td>
            <td style="padding:10px 14px;">${_esc(w.partName || '-')}</td>
            <td style="padding:10px 14px;">${w.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${_esc(w.color)}</span>` : '-'}</td>
            <td style="padding:10px 14px;">${_esc(w.date || '-')}</td>
            <td style="padding:10px 14px;">${_esc(w.paintDate || '-')}</td>
            <td style="padding:10px 14px;">${_esc(w.lotNo || '-')}</td>
            <td style="padding:10px 14px;text-align:right;color:var(--text-muted);">-</td>
            <td style="padding:10px 14px;text-align:right;color:var(--text-muted);">-</td>
            <td style="padding:10px 14px;text-align:right;">${w.packUnit ? UIUtils.formatNumber(w.packUnit) : '-'}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:800;color:${isOut ? 'var(--accent-red)' : 'var(--accent-blue,#2563eb)'};">${isOut ? '-' : '+'}${UIUtils.formatNumber(qty)}</td>
            <td style="padding:10px 14px;text-align:center;">${badge}${machine ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${_esc(machine)}</div>` : ''}</td>
            <td style="padding:10px 14px;font-size:0.8rem;color:var(--text-secondary);">${_esc(w.author || '-')}</td>
        </tr>`;
    }

    function _esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _dateTime(dateValue, timeValue) {
        const date = String(dateValue || '').trim();
        const time = String(timeValue || '').trim();
        if (!date && !time) return '';
        const dateMatch = date.match(/\d{4}-\d{2}-\d{2}/);
        const timeMatch = (date.match(/[ T](\d{2}:\d{2})/) || time.match(/(\d{2}:\d{2})/));
        return [dateMatch ? dateMatch[0] : date, timeMatch ? timeMatch[1] : ''].filter(Boolean).join(' ');
    }

    function _uniqueList(values) {
        return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
    }

    function _listCell(values) {
        const list = _uniqueList(values);
        if (!list.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
            ${list.slice(0, 3).map(v => `<span style="font-size:0.74rem;color:var(--text-secondary);white-space:nowrap;">${_esc(v)}</span>`).join('')}
            ${list.length > 3 ? `<span style="font-size:0.7rem;color:var(--text-muted);">+${list.length - 3}</span>` : ''}
        </div>`;
    }

    function _paintLotYymmdd(value) {
        return _normalizePaintLot(value);
    }

    function _lotsFromPaintWork(w) {
        if (Array.isArray(w.lots) && w.lots.length > 0) {
            const paintLots = [...new Set(w.lots.map(function(l) {
                return _paintLotYymmdd((l && (l.paintDate || l.paintLot)) || w.date || '');
            }).filter(function(v) { return v && v !== '-'; }))];
            const injLots = [...new Set(w.lots.map(function(l) {
                return String((l && l.lotNo) || '').trim();
            }).filter(Boolean))];
            return {
                paintLot: paintLots.join(', ') || _paintLotYymmdd(w.date || ''),
                injLot: injLots.join(', ') || (w.lotNo || '-')
            };
        }
        return {
            paintLot: _paintLotYymmdd(w.date || ''),
            injLot: String(w.lotNo || '').trim() || '-'
        };
    }

    function _lotsFromLaserWork(w) {
        if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
            const paintLots = [...new Set(w.paintLots.map(function(l) {
                return _paintLotYymmdd((l && (l.paintDate || l.paintLot)) || w.paintDate || w.date || '');
            }).filter(function(v) { return v && v !== '-'; }))];
            const injLots = [...new Set(w.paintLots.map(function(l) {
                return String((l && l.lotNo) || '').trim();
            }).filter(Boolean))];
            return {
                paintLot: paintLots.join(', ') || _paintLotYymmdd(w.paintDate || w.date || ''),
                injLot: injLots.join(', ') || String(w.paintLot || w.lotNo || '').trim() || '-'
            };
        }
        return {
            paintLot: _paintLotYymmdd(w.paintDate || w.residualPaintLot || w.date || ''),
            injLot: String(w.paintLot || w.lotNo || '').trim() || '-'
        };
    }

    function _buildAfterLaserFlowRows() {
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const drainMap = _buildAfterLaserDrainMap();

        const inspGoodMap = {};
        laserInsps.forEach(function(insp) {
            if (!insp.workLogId) return;
            const good = Math.max(0, (Number(insp.inspQty) || 0) - (Number(insp.failQty) || 0));
            inspGoodMap[insp.workLogId] = (inspGoodMap[insp.workLogId] || 0) + good;
        });

        let incomingRows = [];
        let outgoingRows = [];

        laserWorks.forEach(function(w) {
            if (_isResidualOnlyRecord(w)) return;
            const prodKey = `${w.carModel || ''}||${w.partName || ''}`;
            if (!drainMap[prodKey]) return;
            const lots = _lotsFromLaserWork(w);
            const date = _dateTime(w.date || '', w.endTime || w.startTime || '') || (w.date || '-');
            const base = {
                carModel: w.carModel || '-',
                partName: w.partName || '-',
                color: w.color || '-',
                date: date,
                paintLot: lots.paintLot,
                injLot: lots.injLot,
                key: _productKey(w.carModel || '', w.partName || '', w.color || '')
            };
            if (w.isManualOut) {
                const qty = Number(w.quantity) || 0;
                if (qty <= 0) return;
                outgoingRows.push(Object.assign({}, base, {
                    qty: qty,
                    route: w.isWipLotAdjust ? 'LOT 보정' : '수동 출고',
                    note: w.note || w.machine || ''
                }));
                return;
            }
            const qty = (w.id && (w.id in inspGoodMap)) ? inspGoodMap[w.id] : (Number(w.quantity) || 0);
            if (qty <= 0) return;
            incomingRows.push(Object.assign({}, base, {
                qty: qty,
                route: w.isWipLotAdjust ? 'LOT 보정' : (w.isManual ? '수동 입고' : '레이져 완료'),
                note: w.machine || w.note || ''
            }));
        });

        paintWorks.forEach(function(w) {
            const prodKey = `${w.carModel || ''}||${w.partName || ''}`;
            const drainLine = drainMap[prodKey];
            if (!drainLine) return;
            if ((w.line || '').trim() !== drainLine) return;
            const qty = _paintingWipConsumptionQty(w);
            if (qty <= 0) return;
            const lots = _lotsFromPaintWork(w);
            outgoingRows.push({
                carModel: w.carModel || '-',
                partName: w.partName || '-',
                color: w.color || '-',
                date: _dateTime(w.date || '', w.endTime || w.startTime || '') || (w.date || '-'),
                qty: qty,
                paintLot: lots.paintLot,
                injLot: lots.injLot,
                route: '도장 투입',
                note: w.line || w.note || '',
                key: _productKey(w.carModel || '', w.partName || '', w.color || '')
            });
        });

        incomingRows = incomingRows.map(function(row) {
            const reset = _getAfterWipHistoryReset(row.carModel, row.partName, row.color);
            if (reset && _isBeforeHistoryReset(row.date, reset.historyResetAt)) {
                return Object.assign({}, row, { beforeReset: true });
            }
            return row;
        });
        outgoingRows = outgoingRows.map(function(row) {
            const reset = _getAfterWipHistoryReset(row.carModel, row.partName, row.color);
            if (reset && _isBeforeHistoryReset(row.date, reset.historyResetAt)) {
                return Object.assign({}, row, { beforeReset: true });
            }
            return row;
        });
        incomingRows.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        outgoingRows.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        return { incomingRows: incomingRows, outgoingRows: outgoingRows };
    }

    function _afterLaserFlowHistHtml() {
        const { incomingRows, outgoingRows } = _buildAfterLaserFlowRows();
        const emptyRow = function(label, colSpan) {
            return `<tr><td colspan="${colSpan}" style="text-align:center;color:var(--text-muted);padding:18px;font-size:0.84rem;">${label}</td></tr>`;
        };
        // 입고/출고 표 — 글자수 맞춤 (품명·컬러 공백/깨짐 방지). fixed+% col 사용 금지
        const ioColgroup = '';
        const ioTableStyle = 'font-size:0.85rem;width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;';
        const thNowrap = 'white-space:nowrap;padding:8px 10px;';
        const rowHtml = function(r, kind) {
            const qtyColor = kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)';
            const border = kind === 'in' ? 'var(--accent-green)' : 'var(--accent-blue)';
            const encKey = r.key || _productKey(r.carModel, r.partName, r.color || '');
            const routeLabel = r.beforeReset ? ((r.route || '-') + ' · 리셋 이전') : (r.route || '-');
            const rowOpacity = r.beforeReset ? 'opacity:0.72;' : '';
            const noteText = (r.note || '') + (r.beforeReset ? ' (리셋 이전 기록)' : '');
            return `<tr style="border-left:3px solid ${border};cursor:pointer;${rowOpacity}"
                        onclick="LaserWipModule.showWipDetail('${encKey}', event)"
                        onmouseover="this.style.background='rgba(139,92,246,0.06)'"
                        onmouseout="this.style.background=''">
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.date || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(r.carModel || '-')}</strong></td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.partName || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.color && r.color !== '-' ? r.color : '-')}</td>
                <td style="text-align:right;color:${qtyColor};font-weight:700;white-space:nowrap;padding:8px 10px;">${UIUtils.formatNumber(r.qty || 0)}</td>
                <td style="font-family:monospace;font-size:0.8rem;color:var(--accent-green);white-space:nowrap;padding:8px 10px;">${_esc(r.paintLot || '-')}</td>
                <td style="font-family:monospace;font-size:0.8rem;white-space:nowrap;padding:8px 10px;">${_esc(r.injLot || '-')}</td>
                <td style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;padding:8px 10px;" title="${_esc(routeLabel)}">${_esc(routeLabel)}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;padding:8px 10px;" title="${_esc(noteText)}">${_esc(r.note || '')}${r.beforeReset ? ' <span style="color:#94a3b8;">(리셋 이전 기록)</span>' : ''}</td>
            </tr>`;
        };

        if (!incomingRows.length && !outgoingRows.length) {
            return `<p style="color:var(--text-muted);font-size:0.88rem;padding:24px;text-align:center;">
                레이져 후 도장 공정이 있는 제품의 입출고 이력이 없습니다.
            </p>`;
        }

        const incomingBody = incomingRows.length
            ? incomingRows.map(function(r) { return rowHtml(r, 'in'); }).join('')
            : emptyRow('입고 내역이 없습니다.', 9);
        const outgoingBody = outgoingRows.length
            ? outgoingRows.map(function(r) { return rowHtml(r, 'out'); }).join('')
            : emptyRow('출고 내역이 없습니다.', 9);

        return `
            <div style="display:flex;flex-direction:column;gap:18px;padding:16px;">
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;font-size:0.95rem;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-green);">input</span>
                            입고현황
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:500;">(레이져 완료 · 수동입고)</span>
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">${incomingRows.length}건</span>
                    </div>
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table" style="${ioTableStyle}">
                            ${ioColgroup}
                            <thead>
                                <tr>
                                    <th style="${thNowrap}">입고일</th>
                                    <th style="${thNowrap}">차종</th>
                                    <th style="${thNowrap}">품명</th>
                                    <th style="${thNowrap}">컬러</th>
                                    <th style="text-align:right;${thNowrap}">입고수량</th>
                                    <th style="${thNowrap}">도장 LOT</th>
                                    <th style="${thNowrap}">사출 LOT</th>
                                    <th style="${thNowrap}">경로</th>
                                    <th style="${thNowrap}">비고</th>
                                </tr>
                            </thead>
                            <tbody>${incomingBody}</tbody>
                        </table>
                    </div>
                </div>
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <h4 style="margin:0;display:flex;align-items:center;gap:6px;font-size:0.95rem;">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">output</span>
                            출고현황
                            <span style="font-size:0.75rem;color:var(--text-muted);font-weight:500;">(도장 투입 · 수동출고)</span>
                        </h4>
                        <span style="font-size:0.75rem;color:var(--text-muted);">${outgoingRows.length}건</span>
                    </div>
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table" style="${ioTableStyle}">
                            ${ioColgroup}
                            <thead>
                                <tr>
                                    <th style="${thNowrap}">출고일</th>
                                    <th style="${thNowrap}">차종</th>
                                    <th style="${thNowrap}">품명</th>
                                    <th style="${thNowrap}">컬러</th>
                                    <th style="text-align:right;${thNowrap}">출고수량</th>
                                    <th style="${thNowrap}">도장 LOT</th>
                                    <th style="${thNowrap}">사출 LOT</th>
                                    <th style="${thNowrap}">경로</th>
                                    <th style="${thNowrap}">비고</th>
                                </tr>
                            </thead>
                            <tbody>${outgoingBody}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function _afterLaserRow(r) {
        const wip = r.wip;
        const displayWip = Math.max(0, Number(wip) || 0);
        const excessWip = wip < 0 ? Math.abs(Number(wip) || 0) : 0;
        const wipColor = wip > 0 ? 'var(--accent-green)' : (wip < 0 ? 'var(--accent-red)' : 'var(--text-muted)');
        let statusBadge;
        if (wip > 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.12);color:var(--accent-green);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">hourglass_empty</span> 도장 투입 대기
            </span>`;
        } else if (excessWip > 0) {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.12);color:var(--accent-red);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">error</span> 출고 초과 ${excessWip.toLocaleString('ko-KR')}
            </span>`;
        } else {
            statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:var(--bg-secondary);color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;">check_circle</span> 소진완료
            </span>`;
        }
        const rowBg = wip > 0 ? '' : (wip < 0 ? 'background:rgba(239,68,68,0.04);' : 'background:var(--bg-secondary);opacity:0.7;');
        const encKey = _productKey(r.carModel || '', r.partName || '', r.color || '');
        return `<tr style="border-bottom:1px solid var(--border-color);${rowBg}cursor:pointer;"
                    onclick="LaserWipModule.showWipDetail('${encKey}', event)"
                    onmouseover="this.style.background='rgba(139,92,246,0.07)'"
                    onmouseout="this.style.background='${wip > 0 ? '' : (wip < 0 ? 'rgba(239,68,68,0.04)' : 'var(--bg-secondary)')}'">
            <td style="padding:10px 14px;font-weight:600;">${r.carModel || '-'}</td>
            <td style="padding:10px 14px;">${r.partName || '-'}</td>
            <td style="padding:10px 14px;">
                ${r.color ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg-secondary);font-size:0.82rem;">${r.color}</span>` : '-'}
            </td>
            <td style="padding:10px 14px;">${_listCell(r.laserDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.paintDates)}</td>
            <td style="padding:10px 14px;">${_listCell(r.injectionLots)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-purple);">${UIUtils.formatNumber(r.laserQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:var(--accent-blue);">${UIUtils.formatNumber(r.paintBQty)}</td>
            <td style="padding:10px 14px;text-align:right;font-size:1rem;font-weight:700;color:${wipColor};">${displayWip.toLocaleString('ko-KR')}</td>
            <td style="padding:10px 14px;text-align:center;">${statusBadge}</td>
        </tr>`;
    }

    // ── 공정명 정규화 ────────────────────────────────────────────────────
    function _normProc(v) {
        const s = (v || '').trim();
        if (/^도장.?A$/i.test(s)) return '도장-A';
        if (/^도장.?B$/i.test(s)) return '도장-B';
        if (/^레이[져저]$/i.test(s)) return '레이져';
        return s;
    }

    function _productProcessSeq(p) {
        return ['process1', 'process2', 'process3', 'process4']
            .map(k => _normProc(p[k] || ''))
            .filter(Boolean);
    }

    function _hasLaserProcess(p) {
        return _productProcessSeq(p).includes('레이져');
    }

    function _getProcessAfterLaser(p) {
        const seq = _productProcessSeq(p);
        const idx = seq.findIndex(v => v === '레이져');
        if (idx < 0 || idx === seq.length - 1) return '';
        return seq[idx + 1];
    }

    // 레이져 후 재공품(도장-B 투입 대기): T1xx LENS / T1xx PARK / P702 Lens 등
    function _isAfterLaserWipProduct(p) {
        return _getProcessAfterLaser(p) === '도장-B';
    }

    // 도장-A(BK) → 레이저 → 도장-B(CLEAR) 제품: 공정별 컬러(BK/CLEAR)를 제품 마스터 color(BK+CLEAR)로 통합 집계
    function _findProductsForPart(carModel, partName) {
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(function(p) {
            return String(p.carModel || '').trim() === car && String(p.partName || '').trim() === part;
        });
    }

    function _isDualCoatLaserProduct(prod) {
        if (!prod) return false;
        const seq = _productProcessSeq(prod);
        return seq.includes('도장-A') && seq.includes('레이져') && seq.includes('도장-B');
    }

    function _resolveWipColorKey(carModel, partName, recordColor) {
        const rc = String(recordColor || '').trim();
        const products = _findProductsForPart(carModel, partName);
        if (!products.length) return rc;

        const byExact = products.find(function(p) { return String(p.color || '').trim() === rc; });
        const dual = products.find(_isDualCoatLaserProduct);
        const prod = byExact || dual || products[0];

        if (_isDualCoatLaserProduct(prod) && prod.color) {
            const canonical = String(prod.color).trim();
            const aliases = new Set([canonical]);
            if (prod.paintColorA) aliases.add(String(prod.paintColorA).trim());
            if (prod.paintColorB) aliases.add(String(prod.paintColorB).trim());
            if (!rc || aliases.has(rc)) return canonical;
        }
        return rc || String(prod.color || '').trim();
    }

    function _wipColorDisplayHtml(carModel, partName, canonicalColor) {
        const cc = String(canonicalColor || '').trim();
        const products = _findProductsForPart(carModel, partName);
        const prod = products.find(function(p) { return String(p.color || '').trim() === cc; })
            || products.find(_isDualCoatLaserProduct) || products[0];
        if (!prod || !_isDualCoatLaserProduct(prod)) {
            return cc ? _esc(cc) : '';
        }
        const a = String(prod.paintColorA || '').trim();
        const b = String(prod.paintColorB || '').trim();
        const main = _esc(cc || prod.color || '-');
        if (a && b && a !== b) {
            return `${main}<div style="font-size:0.62rem;color:var(--text-muted);margin-top:1px;white-space:nowrap;">A:${_esc(a)} · B:${_esc(b)}</div>`;
        }
        return main;
    }

    // 레이져 잔량 대상: 제조공정에 레이져가 포함된 전체 제품
    // T1xx LENS/PARK처럼 다음 공정이 도장-B인 제품도 실제 레이져 잔량이 발생하므로 포함한다.
    function _getResidualProducts() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const residualKeys = new Set();

        // 기존 잔량·수기조정 이력이 있는 제품은 제품 마스터의 공정 설정이 바뀌거나
        // 일시적으로 비어도 등록 목록에서 갑자기 사라지지 않게 유지한다.
        (Storage.getAll(STORE_LASER) || []).forEach(function(w) {
            const packUnit = _num(w.packUnit);
            const goodQty = _num(w.inspectionGoodQty) || _num(w.completedQty) || _num(w.quantity);
            const hasCalculatedResidual = packUnit > 0 && goodQty % packUnit > 0;
            if (!w.isResidualManualIn && !w.isResidualManualOut &&
                !w.isResidualLotAdjust && !_num(w.laserResidualQty) && !hasCalculatedResidual) return;
            residualKeys.add(`${w.carModel || ''}||${w.partName || ''}||${w.color || ''}`);
        });

        return products.filter(function(p) {
            if (_hasLaserProcess(p)) return true;
            return residualKeys.has(`${p.carModel || ''}||${p.partName || ''}||${p.color || ''}`);
        });
    }

    // ── 레이져 직후 공정이 도장(A/B)인 제품 맵 구성 ─────────────────────
    // 반환: { 'carModel||partName': '도장-A' | '도장-B' }
    function _buildAfterLaserDrainMap() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const map = {};
        products.forEach(p => {
            const seq = ['process1','process2','process3','process4']
                .map(k => _normProc(p[k] || '')).filter(Boolean);
            const idxLaser = seq.findIndex(v => v === '레이져');
            if (idxLaser < 0 || idxLaser === seq.length - 1) return;
            const next = seq[idxLaser + 1];
            if (next === '도장-A' || next === '도장-B') {
                map[`${p.carModel||''}||${p.partName||''}`] = next;
            }
        });
        return map;
    }

    // ── 레이져 후 WIP 계산 ────────────────────────────────────────────────
    // laserQty / paintBQty = 전체 이력 합계(기록 유지).
    // wip(현재 재공) = 이력만 리셋이 있으면 스냅샷+이후 입출고, 없으면 laserQty-paintBQty.
    function _calcWip(opts) {
        opts = opts || {};
        const ignoreHistoryReset = !!opts.ignoreHistoryReset;
        const laserWorks = Storage.getAll(STORE_LASER) || [];
        const laserInsps = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];
        const paintWorks = Storage.getAll(STORE_PAINT) || [];
        const drainMap   = _buildAfterLaserDrainMap();

        // workLogId → 검사 양품수 (inspQty - failQty)
        const inspGoodMap = {};
        laserInsps.forEach(function(insp) {
            if (!insp.workLogId) return;
            const good = Math.max(0, (Number(insp.inspQty) || 0) - (Number(insp.failQty) || 0));
            inspGoodMap[insp.workLogId] = (inspGoodMap[insp.workLogId] || 0) + good;
        });

        const laserMap = {};

        function _wipBucketKey(carModel, partName, recordColor) {
            const canon = _resolveWipColorKey(carModel, partName, recordColor);
            return `${carModel || ''}||${partName || ''}||${canon}`;
        }

        laserWorks.forEach(w => {
            // 레이져 잔량 수기/보정 기록은 후재공 집계에 넣지 않는다 (잔량 탭 전용)
            if (_isResidualOnlyRecord(w)) return;
            const prodKey = `${w.carModel||''}||${w.partName||''}`;
            if (!drainMap[prodKey]) return; // 레이져→도장 구조 아닌 제품 제외
            const canonColor = _resolveWipColorKey(w.carModel, w.partName, w.color);
            const key = _wipBucketKey(w.carModel, w.partName, w.color);
            if (!laserMap[key]) laserMap[key] = {
                carModel: w.carModel||'', partName: w.partName||'', color: canonColor,
                laserQty: 0, paintBQty: 0, drainLine: drainMap[prodKey],
                laserDates: [], paintDates: [], injectionLots: []
            };
            if (w.isManualOut) {
                laserMap[key].paintBQty += Number(w.quantity) || 0;
            } else {
                // 검사 양품수 우선 사용, 검사 기록 없으면 작업수량 fallback
                const goodQty = (w.id && (w.id in inspGoodMap))
                    ? inspGoodMap[w.id]
                    : Number(w.quantity) || 0;
                laserMap[key].laserQty += goodQty;
                laserMap[key].laserDates.push(_dateTime(w.date || '', w.startTime || w.endTime || ''));
                if (Array.isArray(w.paintLots) && w.paintLots.length > 0) {
                    w.paintLots.forEach(lot => {
                        laserMap[key].paintDates.push(lot && lot.paintDate ? lot.paintDate : '');
                        laserMap[key].injectionLots.push(lot && lot.lotNo ? lot.lotNo : '');
                    });
                } else {
                    laserMap[key].paintDates.push(w.paintDate || '');
                    laserMap[key].injectionLots.push(w.paintLot || w.lotNo || '');
                }
            }
        });

        paintWorks.forEach(w => {
            const prodKey   = `${w.carModel||''}||${w.partName||''}`;
            const drainLine = drainMap[prodKey];
            if (!drainLine) return;
            if ((w.line||'').trim() !== drainLine) return; // 해당 제품의 drain 공정과 일치하는 것만
            const key = _wipBucketKey(w.carModel, w.partName, w.color);
            if (!laserMap[key]) return;
            laserMap[key].paintBQty += _paintingWipConsumptionQty(w);
        });

        return Object.values(laserMap)
            .map(r => {
                const rawWip = r.laserQty - r.paintBQty;
                const histReset = ignoreHistoryReset
                    ? null
                    : _getAfterWipHistoryReset(r.carModel, r.partName, r.color || '');
                const historyResetApplied = !!(histReset && histReset.historyOnly && histReset.historyResetAt);
                // 현재 재공 = 보관 LOT 합 (이력 이벤트 FIFO 재생). 상세 상단·LOT 표와 동일.
                const lotRowsAll = _calcWipLotDetail(r.carModel, r.partName, r.color || '', opts);
                let wip = _wipQtyFromLotRows(lotRowsAll);
                let paintLotSummary = '-';
                let unassignedQty = 0;
                if (wip > 0) {
                    const lotRows = lotRowsAll.filter(function(l) { return (Number(l.balance) || 0) > 0; });
                    const labels = [];
                    lotRows.forEach(function(l) {
                        if (_isUnassignedPaintLot(l.paintLot) || _isUnassignedInjLot(l.lotNo)) {
                            unassignedQty += Math.max(0, Number(l.balance) || 0);
                        } else {
                            labels.push(l.paintLot);
                        }
                    });
                    // LOT 행이 없으면 재공 전량을 미지정으로 본다
                    if (!lotRows.length) unassignedQty = Math.max(0, wip);
                    paintLotSummary = unassignedQty > 0 && !labels.length
                        ? 'LOT 미지정'
                        : _paintLotSummaryText(labels.concat(unassignedQty > 0 ? ['LOT 미지정'] : []));
                }
                if (paintLotSummary === '-' && !historyResetApplied) {
                    paintLotSummary = _paintLotSummaryText(r.paintDates || []);
                }
                return Object.assign({}, r, {
                    wip: wip,
                    rawWip: rawWip,
                    historyResetApplied: historyResetApplied,
                    paintLotSummary: paintLotSummary,
                    unassignedQty: unassignedQty
                });
            })
            .filter(r => r.laserQty > 0)
            .sort((a, b) => {
                const cm = (a.carModel||'').localeCompare(b.carModel||'');
                return cm !== 0 ? cm : (a.partName||'').localeCompare(b.partName||'');
            });
    }

    // ── 외부 공개 API ─────────────────────────────────────────────────────

    /**
     * 차종+품명+컬러 기준 레이져 후 재공 재고 조회
     * production-plan.js 도장-B 모달에서 호출용
     */
    function getWipStock(carModel, partName, color) {
        // color가 있으면 해당 컬러만, 없으면 차종+품명 합산
        return _calcWip()
            .filter(r => {
                const cmOk = !carModel || r.carModel === carModel;
                const pnOk = !partName || r.partName === partName;
                const clOk = !color || _wipColorMatches(r.carModel, r.partName, r.color, color);
                return cmOk && pnOk && clOk;
            })
            .reduce((s, r) => s + Math.max(0, r.wip), 0);
    }

    /**
     * 레이져 후 재공 LOT 잔량 (도장 LOT / 사출 LOT / 수량)
     * 생산계획 도장-B 모달 LOT 구분 표시용
     */
    function getWipLotDetail(carModel, partName, color) {
        const rows = _calcWip().filter(function(r) {
            const cmOk = !carModel || r.carModel === carModel;
            const pnOk = !partName || r.partName === partName;
            const clOk = !color || _wipColorMatches(r.carModel, r.partName, r.color, color);
            return cmOk && pnOk && clOk && (Number(r.wip) || 0) > 0;
        });
        const lots = [];
        rows.forEach(function(r) {
            _calcWipLotDetail(r.carModel, r.partName, r.color || '').forEach(function(l) {
                const bal = Math.max(0, Number(l.balance) || 0);
                if (bal <= 0) return;
                lots.push({
                    carModel: r.carModel || '',
                    partName: r.partName || '',
                    color: r.color || '',
                    paintLot: l.paintLot || '-',
                    lotNo: l.lotNo || '-',
                    balance: bal
                });
            });
        });
        return lots.sort(function(a, b) {
            return String(a.paintLot).localeCompare(String(b.paintLot))
                || String(a.lotNo).localeCompare(String(b.lotNo));
        });
    }

    function refresh() {
        _repairCorruptedLaserWorkRecords().then(function(repaired) {
            return _ensureAfterWipHistoryResetsLoaded(true).then(function() {
                _renderTabContent();
                if (repaired > 0) {
                    UIUtils.toast('손상된 레이저 기록 ' + repaired + '건을 자동 복구했습니다.', 'success');
                } else {
                    UIUtils.toast('재공품 현황을 새로고침했습니다.', 'info');
                }
            });
        });
    }

    function openManualInput() {
        if (!_canEditWip()) {
            UIUtils.toast('관리자·레이져운영자만 레이져 대기품 수량을 수정할 수 있습니다.', 'warning');
            return;
        }
        if (typeof LaserStandbyModule === 'undefined' || typeof LaserStandbyModule.openStandbyInModal !== 'function') {
            UIUtils.toast('레이져 대기품 수동입고 화면을 열 수 없습니다.', 'warning');
            return;
        }
        LaserStandbyModule.openStandbyInModal();
    }

    // ── 레이져 후 재공품 수기 등록 ──────────────────────────────────────

    function _getPaintBProducts() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => {
            const next = _getProcessAfterLaser(p);
            return next === '도장-A' || next === '도장-B';
        });
    }

    function openAfterLaserInput(prefill) {
        const products  = _getPaintBProducts();
        const carModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);
        const fg = (flex) => `class="form-group" style="flex:${flex};margin-bottom:0;min-width:0;"`;

        UIUtils.showModal('레이져 후 재공품 수기 등록', `
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary);">
                <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">info</span>
                레이져 완료 수량을 수기로 등록합니다. 도장-B 공정이 있는 제품만 선택 가능합니다.
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px 10px;align-items:flex-end;">
                <div ${fg('0 1 148px')}>
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwAfterDate" value="${today}">
                </div>
                <div ${fg('1 1 88px')}>
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwAfterCarModel" onchange="LaserWipModule.onAfterCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div ${fg('1.6 1 140px')}>
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwAfterPartName" onchange="LaserWipModule.onAfterPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div ${fg('1.2 1 110px')}>
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwAfterColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
                <div ${fg('0 1 108px')}>
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwAfterInjectionLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 120px')}>
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwAfterPaintDate" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div ${fg('0 1 118px')}>
                    <label class="form-label">수량 (EA) <span style="color:var(--accent-red);">*</span></label>
                    <input type="number" class="form-input" id="lwAfterQty" min="1" placeholder="0">
                </div>
                <div ${fg('2 1 160px')}>
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwAfterNote" placeholder="수기등록">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LaserWipModule.saveAfterLaserInput()">등록</button>
        `, 'min(720px, calc(100vw - 32px))');
        _applyPrefillSelects(prefill, 'lwAfterCarModel', 'lwAfterPartName', 'lwAfterColor', onAfterCarChange, onAfterPartChange);
    }

    function onAfterCarChange() {
        const carModel  = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const products  = _getPaintBProducts().filter(p => !carModel || p.carModel === carModel);
        const partNames = [...new Set(products.map(p => p.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwAfterColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';

        // LOT 필드 초기화
        const injLotEl = document.getElementById('lwAfterInjectionLot');
        const paintDateEl = document.getElementById('lwAfterPaintDate');
        if (injLotEl) injLotEl.value = '';
        if (paintDateEl) paintDateEl.value = '';
    }

    function onAfterPartChange() {
        const carModel = (document.getElementById('lwAfterCarModel')  || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const products = _getPaintBProducts().filter(p =>
            (!carModel || p.carModel === carModel) && (!partName || p.partName === partName)
        );
        const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwAfterColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');

        // 기존 작업 실적이 있으면 참고용으로 최근 LOT 1건만 자동 채워준다(직접 수정 가능).
        // 필드가 YYMMDD 단일 입력으로 필수화되어 여러 값을 콤마로 채우지 않는다.
        // 실적이 없어도 도장 생산과 무관하게 사용자가 직접 입력할 수 있어야 하므로 비워둔다.
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName);
        const injLotEl = document.getElementById('lwAfterInjectionLot');
        const paintDateEl = document.getElementById('lwAfterPaintDate');
        const injLots = wip ? (Array.isArray(wip.injectionLots) ? wip.injectionLots : []).filter(Boolean) : [];
        const paintDates = wip ? (Array.isArray(wip.paintDates) ? wip.paintDates : []).filter(Boolean) : [];
        if (injLotEl) injLotEl.value = injLots.length > 0 ? _normalizePaintLot(injLots[injLots.length - 1]).replace('-', '') : '';
        if (paintDateEl) paintDateEl.value = paintDates.length > 0 ? _normalizePaintLot(paintDates[paintDates.length - 1]).replace('-', '') : '';
    }

    async function saveAfterLaserInput() {
        const date     = (document.getElementById('lwAfterDate')     || {}).value || '';
        const carModel = (document.getElementById('lwAfterCarModel') || {}).value || '';
        const partName = (document.getElementById('lwAfterPartName') || {}).value || '';
        const color    = (document.getElementById('lwAfterColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwAfterQty')  || {}).value || '0', 10);
        const note     = ((document.getElementById('lwAfterNote') || {}).value || '').trim() || '수기등록';
        const injectionLot = ((document.getElementById('lwAfterInjectionLot') || {}).value || '').trim();
        const paintDate = ((document.getElementById('lwAfterPaintDate') || {}).value || '').trim();

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheck = _assertMasterColor(carModel, partName, color);
        if (!colorCheck.ok) {
            UIUtils.toast(colorCheck.message, 'warning');
            return;
        }
        // ✓ 사출 LOT, 도장 작업LOT은 도장 생산 실적과 무관하게 직접 입력 가능하되 필수값이며 YYMMDD 형식이어야 한다.
        if (!injectionLot) {
            UIUtils.toast('사출 LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwAfterInjectionLot')?.focus();
            return;
        }
        const injLotErr = _lotValidationMessage(injectionLot);
        if (injLotErr) {
            UIUtils.toast('사출 LOT: ' + injLotErr, 'warning');
            document.getElementById('lwAfterInjectionLot')?.focus();
            return;
        }
        if (!paintDate) {
            UIUtils.toast('도장 작업LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwAfterPaintDate')?.focus();
            return;
        }
        const paintLotErr = _lotValidationMessage(paintDate);
        if (paintLotErr) {
            UIUtils.toast('도장 작업LOT: ' + paintLotErr, 'warning');
            document.getElementById('lwAfterPaintDate')?.focus();
            return;
        }

        const record = { date, carModel, partName, color: colorCheck.color, quantity, machine: '', note, isManual: true, lotNo: injectionLot, paintDate: _normalizePaintLot(paintDate) === '-' ? paintDate : _normalizePaintLot(paintDate), author: _currentUserName() };

        try {
            await Storage.add(STORE_LASER, record);
        } catch (e) {
            console.error('레이져 후 재공품 수기 등록 실패:', e);
            UIUtils.toast('저장 중 오류가 발생했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
            return;
        }
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 수기 등록 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    // ── 레이져 후 재공품 출고 ───────────────────────────────────────────

    function openAfterLaserOut(prefill) {
        const rows      = _calcWip().filter(r => r.wip > 0);
        const carModels = [...new Set(rows.map(r => r.carModel).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const today     = new Date().toISOString().slice(0, 10);

        UIUtils.showModal('레이져 후 재공품 출고', `
            <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.82rem;color:var(--accent-red);display:flex;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:1rem;flex-shrink:0;">arrow_upward</span>
                레이져 완료 재공품을 도장-B 투입 전에 수동으로 출고 처리합니다.
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">날짜</label>
                    <input type="date" class="form-input" id="lwOutDate" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="lwOutCarModel" onchange="LaserWipModule.onOutCarChange()">
                        <option value="">-- 차종 선택 --</option>
                        ${carModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="lwOutPartName" onchange="LaserWipModule.onOutPartChange()">
                        <option value="">-- 품명 선택 --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="lwOutColor">
                        <option value="">-- 컬러 선택 --</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwOutInjectionLot" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
                <div class="form-group">
                    <label class="form-label">도장 작업LOT <span style="color:var(--accent-red);">*</span></label>
                    <input type="text" class="form-input" id="lwOutPaintDate" placeholder="YYMMDD" maxlength="6" inputmode="numeric"
                        oninput="LaserWipModule._validateLotFormat(this)" onblur="LaserWipModule._checkLotFormat(this)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">출고 수량 (EA) <span style="color:var(--accent-red);">*</span></label>
                    <input type="number" class="form-input" id="lwOutQty" min="1" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input type="text" class="form-input" id="lwOutNote" placeholder="수기 출고">
                </div>
            </div>
            <div id="lwOutStockInfo" style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;"></div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:var(--accent-red);border-color:var(--accent-red);"
                onclick="LaserWipModule.saveAfterLaserOut()">출고 등록</button>
        `, 'lg');
        _applyPrefillSelects(prefill, 'lwOutCarModel', 'lwOutPartName', 'lwOutColor', onOutCarChange, onOutPartChange);
    }

    function onOutCarChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel));
        const partNames = [...new Set(rows.map(r => r.partName).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutPartName');
        if (sel) sel.innerHTML = '<option value="">-- 품명 선택 --</option>' + partNames.map(n => `<option value="${n}">${n}</option>`).join('');
        const colSel = document.getElementById('lwOutColor');
        if (colSel) colSel.innerHTML = '<option value="">-- 컬러 선택 --</option>';
        const info = document.getElementById('lwOutStockInfo');
        if (info) info.textContent = '';

        // LOT 필드 초기화
        const injLotEl = document.getElementById('lwOutInjectionLot');
        const paintDateEl = document.getElementById('lwOutPaintDate');
        if (injLotEl) injLotEl.value = '';
        if (paintDateEl) paintDateEl.value = '';
    }

    function onOutPartChange() {
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const rows     = _calcWip().filter(r => r.wip > 0 && (!carModel || r.carModel === carModel) && (!partName || r.partName === partName));
        const colors   = [...new Set(rows.map(r => r.color).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'ko'));
        const sel = document.getElementById('lwOutColor');
        if (sel) sel.innerHTML = '<option value="">-- 컬러 선택 --</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
        const match = rows.find(r => r.partName === partName);
        const info  = document.getElementById('lwOutStockInfo');
        if (info && match) info.innerHTML = `현재 재공품: <strong style="color:var(--accent-purple);">${UIUtils.formatNumber(match.wip)} EA</strong>`;

        // 기존 작업 실적이 있으면 참고용으로 최근 LOT 1건만 자동 채워준다(직접 수정 가능).
        // 필드가 YYMMDD 단일 입력으로 필수화되어 여러 값을 콤마로 채우지 않는다.
        // 실적이 없어도 도장 생산과 무관하게 사용자가 직접 입력할 수 있어야 하므로 비워둔다.
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName);
        const injLotEl = document.getElementById('lwOutInjectionLot');
        const paintDateEl = document.getElementById('lwOutPaintDate');
        const injLots = wip ? (Array.isArray(wip.injectionLots) ? wip.injectionLots : []).filter(Boolean) : [];
        const paintDates = wip ? (Array.isArray(wip.paintDates) ? wip.paintDates : []).filter(Boolean) : [];
        if (injLotEl) injLotEl.value = injLots.length > 0 ? _normalizePaintLot(injLots[injLots.length - 1]).replace('-', '') : '';
        if (paintDateEl) paintDateEl.value = paintDates.length > 0 ? _normalizePaintLot(paintDates[paintDates.length - 1]).replace('-', '') : '';
    }

    async function saveAfterLaserOut() {
        const date     = (document.getElementById('lwOutDate')     || {}).value || '';
        const carModel = (document.getElementById('lwOutCarModel') || {}).value || '';
        const partName = (document.getElementById('lwOutPartName') || {}).value || '';
        const color    = (document.getElementById('lwOutColor')    || {}).value || '';
        const quantity = parseInt((document.getElementById('lwOutQty')  || {}).value || '0', 10);
        const note     = ((document.getElementById('lwOutNote') || {}).value || '').trim() || '수기 출고';
        const injectionLot = ((document.getElementById('lwOutInjectionLot') || {}).value || '').trim();
        const paintDate = ((document.getElementById('lwOutPaintDate') || {}).value || '').trim();

        if (!date || !carModel || !partName || !quantity || quantity <= 0) {
            UIUtils.toast('날짜, 차종, 품명, 수량(1 이상)은 필수입니다.', 'warning');
            return;
        }
        const colorCheckOut2 = _assertMasterColor(carModel, partName, color);
        if (!colorCheckOut2.ok) {
            UIUtils.toast(colorCheckOut2.message, 'warning');
            return;
        }
        // ✓ 사출 LOT, 도장 작업LOT은 도장 생산 실적과 무관하게 직접 입력 가능하되 필수값이며 YYMMDD 형식이어야 한다.
        if (!injectionLot) {
            UIUtils.toast('사출 LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwOutInjectionLot')?.focus();
            return;
        }
        const injLotErr = _lotValidationMessage(injectionLot);
        if (injLotErr) {
            UIUtils.toast('사출 LOT: ' + injLotErr, 'warning');
            document.getElementById('lwOutInjectionLot')?.focus();
            return;
        }
        if (!paintDate) {
            UIUtils.toast('도장 작업LOT을 입력해 주세요.', 'warning');
            document.getElementById('lwOutPaintDate')?.focus();
            return;
        }
        const paintLotErr = _lotValidationMessage(paintDate);
        if (paintLotErr) {
            UIUtils.toast('도장 작업LOT: ' + paintLotErr, 'warning');
            document.getElementById('lwOutPaintDate')?.focus();
            return;
        }
        const wip = _calcWip().find(r => r.carModel === carModel && r.partName === partName && (!colorCheckOut2.color || r.color === colorCheckOut2.color));
        if (wip && quantity > wip.wip) {
            UIUtils.toast(`출고 수량(${quantity})이 현재 재공품(${wip.wip})을 초과합니다.`, 'warning');
            return;
        }

        const paintDateNorm = _normalizePaintLot(paintDate);
        const record = { date, carModel, partName, color: colorCheckOut2.color, quantity, machine: '', note, isManual: true, isManualOut: true, lotNo: injectionLot, paintDate: paintDateNorm === '-' ? paintDate : paintDateNorm, author: _currentUserName() };

        try {
            await Storage.add(STORE_LASER, record);
        } catch (e) {
            console.error('레이져 후 재공품 수기 출고 실패:', e);
            UIUtils.toast('저장 중 오류가 발생했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류'), 'error');
            return;
        }
        UIUtils.closeModal();
        UIUtils.toast(`레이져 후 재공품 출고 완료 — ${partName} ${quantity}EA`, 'success');
        refresh();
    }

    function init(container) {
        render(container);
    }

    function _activeTabId() { return _activeTab; }

    // 레이져 후 다음 공정이 도장(A/B)인 제품 여부 — laser.js에서 출하대기 유입 차단용
    function isAfterLaserDrainProduct(carModel, partName) {
        return !!_buildAfterLaserDrainMap()[`${carModel||''}||${partName||''}`];
    }

    function getResidualQty(carModel, partName, color) {
        const rows = _calcLaserResidualWip();
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        const clr = String(color || '').trim();
        // 1) 차종+품명+컬러 정확 매칭
        let match = rows.find(r =>
            String(r.carModel || '').trim() === car &&
            String(r.partName || '').trim() === part &&
            String(r.color || '').trim() === clr
        );
        // 2) 컬러 없으면 차종+품명 합산
        if (!match && !clr) {
            const same = rows.filter(r =>
                String(r.carModel || '').trim() === car &&
                String(r.partName || '').trim() === part
            );
            if (same.length) {
                return same.reduce((s, r) => s + (Number(r.residualQty) || 0), 0);
            }
        }
        // 3) 컬러 불일치 시 차종+품명 폴백 (도장 컬러 vs 제품 컬러 표기 차이)
        if (!match) {
            const same = rows.filter(r =>
                String(r.carModel || '').trim() === car &&
                String(r.partName || '').trim() === part
            );
            if (same.length === 1) match = same[0];
            else if (same.length > 1 && clr) {
                // 정규화 컬러로 재시도
                const canon = _resolveWipColorKey(car, part, clr);
                match = same.find(r => String(r.color || '').trim() === clr)
                    || same.find(r => _resolveWipColorKey(r.carModel, r.partName, r.color) === canon)
                    || null;
            }
        }
        return match ? Math.max(0, Number(match.residualQty) || 0) : 0;
    }

    /** 검사 폼 등: 이력 리셋 로드 후 최신 레이져잔량 반환 */
    async function getResidualQtyAsync(carModel, partName, color) {
        await _ensureResidualHistoryResetsLoaded();
        return getResidualQty(carModel, partName, color);
    }

    function isResidualHistoryResetsLoaded() {
        return !!_residualHistoryResetsLoaded;
    }

    async function ensureResidualReady() {
        return _ensureResidualHistoryResetsLoaded();
    }

    return { init, render, refresh, switchTab, openTab, _activeTabId, isAfterLaserDrainProduct, openManualInput,
             openAfterLaserInput, onAfterCarChange, onAfterPartChange, saveAfterLaserInput,
             openAfterLaserOut, onOutCarChange, onOutPartChange, saveAfterLaserOut,
             openEditManualEntry, saveEditManualEntry, removeManualEntry,
             onEditManualCarChange, onEditManualPartChange,
             openResidualInput, onResidualInCarChange, onResidualInPartChange, saveResidualInput,
             openResidualOut, onResidualOutCarChange, onResidualOutPartChange, onResidualOutColorChange, onResidualOutLotPick, saveResidualOut,
             openEditResidualManualEntry, saveEditResidualManualEntry, removeResidualManualEntry,
             onEditResidualCarChange, onEditResidualPartChange,
             openEditLaserWorkIdentity, saveEditLaserWorkIdentity,
             onEditLaserIdCarChange, onEditLaserIdPartChange,
             getWipStock, getWipLotDetail, _calcWip, showWipDetail, showResidualDetail,
             confirmResetAfterWip, executeResetAfterWip,
             confirmResetResidual, executeResetResidual,
             getResidualQty, getResidualQtyAsync, ensureResidualReady, isResidualHistoryResetsLoaded,
             _calcLaserResidualWip,
             adjustAfterLaserFromPopup, adjustResidualFromPopup,
             openAdjustAfterLaserModal, saveAdjustAfterLaserModal,
             openAdjustResidualModal, saveAdjustResidualModal,
             openAdjustAfterLaserLotModal, saveAdjustAfterLaserLotModal,
             openAdjustResidualSingleLotModal, saveAdjustResidualSingleLotModal,
             openAdjustResidualLotModal, saveAdjustResidualLotModal,
             addAdjustResAllLotRow, removeAdjustResAllLotRow, onAdjustResAllLotQtyInput, onAdjustResAllTotalQtyInput,
             openAssignResidualLotModal, saveAssignResidualLotModal, confirmDeleteUnassignedResidual,
             _openAfterLaserOutForPart, _openAfterLaserInForPart,
             _openResidualOutForPart, _openResidualInForPart,
             _validateLotFormat, _checkLotFormat };
})();
