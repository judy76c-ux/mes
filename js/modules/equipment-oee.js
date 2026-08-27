/**
 * 설비종합효율 (OEE) — 도장 A/B라인
 *
 * 사내 엑셀 「월별 설비종합효율 현황_MTBF_MTTR」의 계산 체계를 그대로 옮기되,
 * 입력 검증을 붙이고 수량·고장 데이터는 MES 실적에서 자동으로 끌어온다.
 *
 * 계산 체인 (엑셀 행 순서와 동일)
 *   조업시간 − 관리LOSS = 부하시간 − 정지LOSS = 가동시간 − 속도LOSS = 성능가동시간
 *
 * 저장 원칙: **LOSS 시간(분)만 저장**한다.
 *   모델명·C/T·CVT·생산수·양품수·고장이력은 원본 스토어에서 매번 파생한다.
 *   실적은 소급 수정되므로(외관검사 양품수를 며칠 뒤 고치는 일이 흔하다) 스냅샷을 뜨면
 *   아무도 OEE 화면을 다시 열지 않아 수치가 조용히 어긋난다 — 현행 엑셀이 그 상태다.
 */

// ── 순수 계산기 ──────────────────────────────────────────────────────────────
// 일별·월별 화면이 절대 어긋나지 않도록 계산은 여기 한 곳에서만 한다.
var OeeCalc = (function () {
    'use strict';

    const MGMT_FIELDS = [
        { k: 'rest',         label: '휴식·식사' },
        { k: 'meeting',      label: '회의·교육·조회' },
        { k: 'plannedMaint', label: '계획정비·청소' },
        { k: 'noPlan',       label: '생산계획없음' },
        { k: 'etc',          label: '기타(정전)' }
    ];
    const STOP_FIELDS = [
        { k: 'breakdown', label: '설비고장' },
        { k: 'quality',   label: '품질문제' },
        { k: 'material',  label: '자재결품' }
    ];
    const SPEED_FIELDS = [
        { k: 'slowdown',   label: '설비 속도 저하' },
        { k: 'minorStop',  label: '순간정지(공정문제)' },
        { k: 'idle',       label: '공회전(응급)' },
        { k: 'itemChange', label: 'ITEM 교체' }
    ];

    function _n(v) { return Number(v) || 0; }
    function _sumGroup(obj, fields) {
        return fields.reduce(function (s, f) { return s + _n(obj && obj[f.k]); }, 0);
    }

    /**
     * 제품 마스터에서 해당 라인의 C/T·CVT를 찾는다.
     * 알고리즘은 생산계획의 calcEndTime(js/modules/production-plan.js)과 동일하게 맞춘다 —
     * 두 화면이 서로 다른 C/T를 쓰면 계획 소요시간과 OEE 이론생산이 어긋난다.
     */
    function resolveCtCvt(product, line) {
        if (!product) return { ctSec: null, cvt: null };
        var num = function (v) {
            var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
            return isNaN(n) ? null : n;
        };
        for (var i = 1; i <= 4; i++) {
            if (product['process' + i] === line && product['ct' + i] && product['cvt' + i]) {
                return { ctSec: num(product['ct' + i]), cvt: num(product['cvt' + i]) };
            }
        }
        // 라인 일치 공정이 없을 때의 하위 호환 순서 (생산계획과 동일)
        var order = [2, 3, 1, 4];
        for (var j = 0; j < order.length; j++) {
            var n = order[j];
            if (product['ct' + n] && product['cvt' + n]) {
                return { ctSec: num(product['ct' + n]), cvt: num(product['cvt' + n]) };
            }
        }
        return { ctSec: null, cvt: null };
    }

    /**
     * @param {object} i 입력값
     *   operatingMin, mgmtLoss{}, stopLoss{}, speedLoss{},
     *   ctSec, cvt, actualQty, goodQty, planQty,
     *   breakdownCount, breakdownMin, inspectionCount, downtimeBreakdownMin
     */
    function compute(i) {
        i = i || {};
        var flags = [];
        var add = function (code, level, msg) { flags.push({ code: code, level: level, msg: msg }); };

        var operatingMin   = _n(i.operatingMin);
        var mgmtLossTotal  = _sumGroup(i.mgmtLoss, MGMT_FIELDS);
        var loadMin        = operatingMin - mgmtLossTotal;          // 부하시간
        var stopLossTotal  = _sumGroup(i.stopLoss, STOP_FIELDS);
        var runMin         = loadMin - stopLossTotal;               // 가동시간
        var speedLossTotal = _sumGroup(i.speedLoss, SPEED_FIELDS);
        var netRunMin      = runMin - speedLossTotal;               // 성능가동시간(정미시간)

        var ctSec     = i.ctSec == null ? null : _n(i.ctSec);
        var cvt       = i.cvt == null ? null : _n(i.cvt);
        var actualQty = _n(i.actualQty);
        var goodQty   = _n(i.goodQty);

        // ※ CVT(1사이클 거치수량)로 나눠야 개당 시간이 된다.
        //   엑셀은 C/T를 그대로 곱해서 B라인(C/T 45, CVT 27) 기준 27배 틀린 값을 낸다.
        var ctPerPiece = (ctSec != null && cvt != null && cvt > 0) ? (ctSec / cvt) : null;
        var theoreticalQty = (ctPerPiece && ctPerPiece > 0 && runMin > 0)
            ? (runMin * 60) / ctPerPiece : null;

        var availability = loadMin > 0 ? (runMin / loadMin) : null;
        var performance  = (runMin > 0 && ctPerPiece)
            ? (actualQty * ctPerPiece) / (runMin * 60) : null;
        var quality      = actualQty > 0 ? (goodQty / actualQty) : null;

        // ── 입력 검증 ────────────────────────────────────────────────
        if (operatingMin <= 0) add('OPERATING_ZERO', 'error', '조업시간이 0입니다 — 계산할 수 없습니다');
        if (loadMin   < 0)     add('LOAD_NEGATIVE',  'error', '관리LOSS 합계가 조업시간을 초과합니다');
        if (runMin    < 0)     add('RUN_NEGATIVE',   'error', '정지LOSS 합계가 부하시간을 초과합니다');
        if (netRunMin < 0)     add('NET_NEGATIVE',   'error', '속도LOSS 합계가 가동시간을 초과합니다');
        if (availability != null && availability > 1) {
            add('AVAIL_OVER', 'error', '시간가동율이 100%를 넘습니다 — 입력 오류');
        }
        if (performance != null && performance > 1) {
            add('PERF_OVER', performance > 1.2 ? 'error' : 'warn',
                '성능가동율이 100%를 넘습니다 — C/T·CVT 또는 가동시간을 확인하세요');
        }
        if (actualQty > 0 && goodQty > actualQty) {
            add('QUAL_OVER', 'error', '양품수가 실제 생산수보다 많습니다');
        }
        if (!ctPerPiece) add('CT_MISSING', 'warn', '제품 마스터에 C/T·CVT가 없어 성능가동율을 낼 수 없습니다');
        if (actualQty > 0 && _n(i.inspectionCount) === 0) {
            add('NO_INSPECTION', 'warn', '외관검사 미입력 — 양품율 미확정');
        }
        if (actualQty === 0 && loadMin > 0) {
            add('NO_ACTUAL', 'warn', '가동시간은 있으나 생산실적이 0입니다');
        }
        if (i.downtimeBreakdownMin != null &&
            Math.abs(_n(i.stopLoss && i.stopLoss.breakdown) - _n(i.downtimeBreakdownMin)) > 10) {
            add('DOWNTIME_DRIFT', 'warn',
                '비가동이력(' + _n(i.downtimeBreakdownMin) + '분)과 입력한 설비고장 시간이 다릅니다');
        }

        var hasError = flags.some(function (f) { return f.level === 'error'; });

        // 개별 비율은 **자르지 않고 실제 계산값 그대로** 돌려준다 — 화면에서 빨강으로 보여
        // 입력이 틀렸다는 사실 자체가 드러나야 한다. 100%로 잘라 두면 그럴듯한 거짓값이 된다.
        // (분모가 0 이하라 수학적으로 정의되지 않는 경우에만 위에서 이미 null이 된다.)
        // 다만 합성지표인 OEE는 오류가 있으면 숫자를 내놓지 않는다 —
        // 그래야 그럴듯하지만 틀린 값이 월별 집계로 흘러들지 않는다(현행 엑셀의 실패 지점).
        var oee = (!hasError && availability != null && performance != null && quality != null)
            ? availability * performance * quality : null;

        var breakdownCount = _n(i.breakdownCount);
        var breakdownMin   = _n(i.breakdownMin);

        return {
            operatingMin: operatingMin,
            mgmtLossTotal: mgmtLossTotal,   loadMin: loadMin,
            stopLossTotal: stopLossTotal,   runMin: runMin,
            speedLossTotal: speedLossTotal, netRunMin: netRunMin,
            ctSec: ctSec, cvt: cvt, ctPerPiece: ctPerPiece,
            theoreticalQty: theoreticalQty,
            actualQty: actualQty, goodQty: goodQty, planQty: _n(i.planQty),
            availability: availability,
            performance:  performance,
            quality:      quality,
            oee: oee,
            breakdownCount: breakdownCount,
            breakdownMin: breakdownMin,
            mtbf: breakdownCount > 0 ? (runMin / breakdownCount) : null,
            mttr: breakdownCount > 0 ? (breakdownMin / breakdownCount) : null,
            flags: flags,
            hasError: hasError,
            ok: !hasError
        };
    }

    /**
     * 월별/통합 집계 — **입력값을 먼저 합산한 뒤 compute를 1회** 호출한다.
     * 일별 OEE의 평균을 내면 30분 가동한 날과 480분 가동한 날의 가중치가 같아지고,
     * 나쁜 날이 평균 뒤에 숨는다.
     */
    function sumInputs(list) {
        var out = {
            operatingMin: 0,
            mgmtLoss: {}, stopLoss: {}, speedLoss: {},
            actualQty: 0, goodQty: 0, planQty: 0,
            breakdownCount: 0, breakdownMin: 0, inspectionCount: 0,
            ctSec: null, cvt: null
        };
        MGMT_FIELDS.forEach(function (f) { out.mgmtLoss[f.k] = 0; });
        STOP_FIELDS.forEach(function (f) { out.stopLoss[f.k] = 0; });
        SPEED_FIELDS.forEach(function (f) { out.speedLoss[f.k] = 0; });

        // 가중평균 C/T 산출용 — 모델이 날마다 다르므로 단순 평균은 의미가 없다.
        var ctWeightedSum = 0, ctWeightQty = 0;

        (list || []).forEach(function (i) {
            if (!i) return;
            out.operatingMin += _n(i.operatingMin);
            MGMT_FIELDS.forEach(function (f) { out.mgmtLoss[f.k]  += _n(i.mgmtLoss  && i.mgmtLoss[f.k]); });
            STOP_FIELDS.forEach(function (f) { out.stopLoss[f.k]  += _n(i.stopLoss  && i.stopLoss[f.k]); });
            SPEED_FIELDS.forEach(function (f) { out.speedLoss[f.k]+= _n(i.speedLoss && i.speedLoss[f.k]); });
            out.actualQty      += _n(i.actualQty);
            out.goodQty        += _n(i.goodQty);
            out.planQty        += _n(i.planQty);
            out.breakdownCount += _n(i.breakdownCount);
            out.breakdownMin   += _n(i.breakdownMin);
            out.inspectionCount+= _n(i.inspectionCount);

            var cpp = (i.ctSec != null && i.cvt) ? (_n(i.ctSec) / _n(i.cvt)) : null;
            if (cpp && _n(i.actualQty) > 0) {
                ctWeightedSum += cpp * _n(i.actualQty);
                ctWeightQty   += _n(i.actualQty);
            }
        });

        // 합산 결과를 compute에 넘길 땐 개당초(ctPerPiece)를 CVT=1인 C/T로 환산해 전달한다.
        if (ctWeightQty > 0) { out.ctSec = ctWeightedSum / ctWeightQty; out.cvt = 1; }
        return out;
    }

    return {
        compute: compute,
        sumInputs: sumInputs,
        resolveCtCvt: resolveCtCvt,
        MGMT_FIELDS: MGMT_FIELDS,
        STOP_FIELDS: STOP_FIELDS,
        SPEED_FIELDS: SPEED_FIELDS
    };
})();


// ── 화면 모듈 ────────────────────────────────────────────────────────────────
var EquipmentOeeModule = (function () {
    'use strict';

    const STORE      = DB.STORES.EQUIP_OEE_DAILY;
    const PLAN_STORE = DB.STORES.PRODUCTION_PLANS;
    const WORK_STORE = DB.STORES.PAINTING_WORK;
    const INSP_STORE = DB.STORES.PAINTING_INSPECTIONS;
    const PROD_STORE = DB.STORES.PRODUCTS;
    const DT_STORE   = DB.STORES.EQUIP_DOWNTIME;
    const EQ_STORE   = DB.STORES.EQUIP_MASTER;

    const LINES = ['도장-A', '도장-B'];
    const OP_MIN_CONFIG_KEY = 'oeeDefaultOperatingMin';
    const DEFAULT_OP_MIN = 480;   // 8h − 식사·휴게 제외 전 기준값

    // 비가동이력 category → LOSS 항목 (엑셀 분류와 1:1로 맞아떨어진다)
    const DT_CATEGORY_MAP = {
        '고장':     { group: 'stopLoss', key: 'breakdown' },
        '품질불량': { group: 'stopLoss', key: 'quality' },
        '자재부족': { group: 'stopLoss', key: 'material' },
        '예방정비': { group: 'mgmtLoss', key: 'plannedMaint' },
        '기타':     { group: 'mgmtLoss', key: 'etc' }
    };

    let _state = {
        ym: '',              // 'YYYY-MM'
        line: 'ALL',         // 'ALL' | '도장-A' | '도장-B'
        view: 'daily'        // 'daily' | 'monthly'
    };
    let _charts = {};
    let _opMinConfig = null;
    let _cacheWarmUnsub = null;
    let _editCtx = null;     // 입력 모달 컨텍스트

    // ── 유틸 ────────────────────────────────────────────────────────
    // UIUtils.formatNumber(0)은 '-'를 반환한다. LOSS 분에서 0은 의미 있는 값이라 그대로 써야 한다.
    function _fmt(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
    function _fmt1(n) { return (Number(n) || 0).toFixed(1); }
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pct(v) { return v == null ? '-' : (v * 100).toFixed(1) + '%'; }
    function _today() { return (typeof UIUtils !== 'undefined' && UIUtils.today) ? UIUtils.today() : new Date().toISOString().slice(0, 10); }
    function _curYm() { return _today().slice(0, 7); }

    /**
     * 라인 표기 통일. 스토어마다 어휘가 다르다 —
     *   생산계획·도장실적: '도장-A' / 설비마스터: '도장A라인' / 엑셀: 'A라인'
     */
    function _normLine(v) {
        var s = String(v == null ? '' : v).replace(/\s/g, '');
        if (!s) return null;
        if (/도장[-]?B|\(B\)|^B라인$|^B$/i.test(s)) return '도장-B';
        if (/도장[-]?A|\(A\)|^A라인$|^A$/i.test(s)) return '도장-A';
        return null;
    }

    function _daysInMonth(ym) {
        var p = String(ym || '').split('-');
        var y = Number(p[0]), m = Number(p[1]);
        if (!y || !m) return 0;
        return new Date(y, m, 0).getDate();
    }
    function _dateStr(ym, day) {
        return ym + '-' + String(day).padStart(2, '0');
    }

    function _canWrite() {
        return typeof AuthModule !== 'undefined'
            && typeof AuthModule.canWritePage === 'function'
            && AuthModule.canWritePage('equipment-oee');
    }
    function _actor() {
        try {
            var u = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser) ? AuthModule.getCurrentUser() : null;
            return u ? { id: u.id || u.username || '', name: u.name || u.displayName || '' } : { id: '', name: '' };
        } catch (e) { return { id: '', name: '' }; }
    }

    // ── 기본 조업시간 설정 ──────────────────────────────────────────
    async function _loadOpMinConfig() {
        if (_opMinConfig) return _opMinConfig;
        try {
            _opMinConfig = (await Storage.getConfigValue(OP_MIN_CONFIG_KEY)) || {};
        } catch (e) { _opMinConfig = {}; }
        return _opMinConfig;
    }
    function _defaultOpMin(line) {
        var c = _opMinConfig || {};
        var v = Number(c[line]);
        return v > 0 ? v : DEFAULT_OP_MIN;
    }

    // ── 파생 데이터 ─────────────────────────────────────────────────
    /** 설비ID → 라인 (비가동이력에는 line 필드가 없어 설비 마스터로 조인해야 한다) */
    function _equipLineMap() {
        var map = {};
        (Storage.getAll(EQ_STORE) || []).forEach(function (e) {
            if (e && e.id) map[String(e.id)] = _normLine(e.line);
        });
        return map;
    }

    /** 해당 일자·라인의 비가동이력 집계 */
    function _downtimeFor(dateStr, line) {
        var map = _equipLineMap();
        var out = { byLoss: {}, breakdownCount: 0, breakdownMin: 0, unassigned: 0, rows: [] };
        (Storage.getAll(DT_STORE) || []).forEach(function (d) {
            if (!d || String(d.date || '').slice(0, 10) !== dateStr) return;
            var dl = map[String(d.equipId)];
            if (!dl) {
                // 설비가 삭제돼 라인을 알 수 없는 건. 버리면 설비를 지울 때마다 MTBF가 좋아진다.
                out.unassigned += Number(d.duration) || 0;
                if (line !== 'ALL') return;
            } else if (line !== 'ALL' && dl !== line) return;

            var min = Number(d.duration) || 0;
            var m = DT_CATEGORY_MAP[d.category];
            if (m) out.byLoss[m.group + '.' + m.key] = (out.byLoss[m.group + '.' + m.key] || 0) + min;
            if (d.category === '고장') { out.breakdownCount++; out.breakdownMin += min; }
            out.rows.push(d);
        });
        return out;
    }

    /** 해당 일자·라인의 도장 실적(생산수) */
    function _workFor(dateStr, line) {
        var qty = 0, models = {};
        (Storage.getAll(WORK_STORE) || []).forEach(function (w) {
            if (!w || String(w.date || '').slice(0, 10) !== dateStr) return;
            var wl = _normLine(w.line);
            if (line !== 'ALL' && wl !== line) return;
            // 도장 작업일지의 productionQty가 1차 근거, 없으면 투입수량으로 대체
            var q = Number(w.productionQty) || Number(w.inputQty) || 0;
            qty += q;
            var name = [w.carModel, w.partName, w.color].filter(Boolean).join(' ');
            if (name) models[name] = (models[name] || 0) + q;
        });
        return { qty: qty, models: models };
    }

    /**
     * 해당 **생산일자**·라인의 외관검사 양품수.
     * 검사 레코드의 date는 검사일이라 다음날인 경우가 있다 → paintingDate(생산일)로 집계한다.
     * 검사 레코드에는 line이 없어 workId로 도장 작업일지를 조인한다.
     */
    function _inspectionFor(dateStr, line) {
        var workLine = {};
        (Storage.getAll(WORK_STORE) || []).forEach(function (w) {
            if (w && w.id) workLine[String(w.id)] = _normLine(w.line);
        });
        var good = 0, count = 0;
        (Storage.getAll(INSP_STORE) || []).forEach(function (it) {
            if (!it) return;
            var pd = String(it.paintingDate || '').slice(0, 10);
            if (pd !== dateStr) return;
            var il = workLine[String(it.workId)];
            if (line !== 'ALL' && il && il !== line) return;
            if (line !== 'ALL' && !il) return;   // 라인을 특정할 수 없는 건은 라인별 집계에서 제외
            good += Number(it.goodQty) || 0;
            count++;
        });
        return { goodQty: good, count: count };
    }

    /** 해당 일자·라인의 생산계획 — 모델명(최대 수량 기준)과 계획수량 */
    function _planFor(dateStr, line) {
        var qty = 0, best = null, bestQty = -1, top = null;
        (Storage.getAll(PLAN_STORE) || []).forEach(function (p) {
            if (!p || String(p.date || '').slice(0, 10) !== dateStr) return;
            var pl = _normLine(p.line);
            if (line !== 'ALL' && pl !== line) return;
            var q = Number(p.planQty) || 0;
            qty += q;
            if (q > bestQty) {
                bestQty = q; best = p;
                top = [p.carModel, p.partName, p.color].filter(Boolean).join(' ');
            }
        });
        return { qty: qty, model: top || '', plan: best };
    }

    /** 모델명 → 제품 마스터 → C/T·CVT */
    function _ctCvtFor(planRec, line, fallbackModelName) {
        var products = Storage.getAll(PROD_STORE) || [];
        var prod = null;
        if (planRec) {
            prod = products.find(function (p) {
                return p.carModel === planRec.carModel && p.partName === planRec.partName
                    && (p.color === planRec.color || !planRec.color || !p.color);
            }) || products.find(function (p) {
                return p.carModel === planRec.carModel && p.partName === planRec.partName;
            });
        }
        if (!prod && fallbackModelName) {
            prod = products.find(function (p) {
                return fallbackModelName.indexOf(p.partName) >= 0 && fallbackModelName.indexOf(p.carModel) >= 0;
            });
        }
        var lineForCt = (line === 'ALL') ? '도장-A' : line;
        return OeeCalc.resolveCtCvt(prod, lineForCt);
    }

    // ── 하루치 입력값 조립 ──────────────────────────────────────────
    function _recordFor(dateStr, line) {
        return (Storage.getAll(STORE) || []).find(function (r) {
            return r && r.date === dateStr && r.line === line;
        }) || null;
    }

    /**
     * 한 날짜·한 라인의 계산 입력값을 만든다.
     * 저장된 LOSS 시간 + 실적에서 파생한 수량/고장을 합쳐 OeeCalc.compute에 넘길 형태로 반환.
     */
    function _buildInputs(dateStr, line) {
        var rec = _recordFor(dateStr, line);
        var dt   = _downtimeFor(dateStr, line);
        var work = _workFor(dateStr, line);
        var insp = _inspectionFor(dateStr, line);
        var plan = _planFor(dateStr, line);

        var ov = (rec && rec.overrides) || {};
        var modelName = ov.model || plan.model
            || Object.keys(work.models).sort(function (a, b) { return work.models[b] - work.models[a]; })[0] || '';
        var ct = _ctCvtFor(plan.plan, line, modelName);

        var inputs = {
            operatingMin: rec ? Number(rec.operatingMin) || 0 : 0,
            mgmtLoss:  (rec && rec.mgmtLoss)  || {},
            stopLoss:  (rec && rec.stopLoss)  || {},
            speedLoss: (rec && rec.speedLoss) || {},
            ctSec:     ov.ctSec != null ? Number(ov.ctSec) : ct.ctSec,
            cvt:       ov.cvt   != null ? Number(ov.cvt)   : ct.cvt,
            actualQty: ov.actualQty != null ? Number(ov.actualQty) : work.qty,
            goodQty:   ov.goodQty   != null ? Number(ov.goodQty)   : insp.goodQty,
            planQty:   ov.planQty   != null ? Number(ov.planQty)   : plan.qty,
            breakdownCount: dt.breakdownCount,
            breakdownMin:   dt.breakdownMin,
            inspectionCount: insp.count,
            downtimeBreakdownMin: rec ? (dt.byLoss['stopLoss.breakdown'] || 0) : null
        };
        return {
            rec: rec, inputs: inputs, model: modelName,
            dt: dt, work: work, insp: insp, plan: plan,
            hasRecord: !!rec,
            hasActivity: (work.qty > 0 || plan.qty > 0 || dt.rows.length > 0)
        };
    }

    /** 통합('ALL')은 A·B 입력값을 합산한 뒤 한 번 계산한다 (평균 아님) */
    function _dayCell(dateStr, line) {
        if (line !== 'ALL') {
            var d = _buildInputs(dateStr, line);
            return { day: d, inputs: d.inputs, result: OeeCalc.compute(d.inputs), model: d.model, hasRecord: d.hasRecord, hasActivity: d.hasActivity };
        }
        var parts = LINES.map(function (l) { return _buildInputs(dateStr, l); });
        // 입력된 라인만 합산한다. 미입력 라인의 생산수만 끌어오면 대응하는 부하시간이 없어
        // 성능가동율이 부풀려진다(생산은 있는데 가동시간은 없는 상태).
        var recorded = parts.filter(function (p) { return p.hasRecord; });
        var summed = OeeCalc.sumInputs(recorded.map(function (p) { return p.inputs; }));
        return {
            day: null, parts: parts, inputs: summed, result: OeeCalc.compute(summed),
            model: recorded.map(function (p) { return p.model; }).filter(Boolean).join(' / '),
            hasRecord: recorded.length > 0,
            hasActivity: parts.some(function (p) { return p.hasActivity; })
        };
    }

    /** 한 달치 집계 (월별 화면 및 통합 합계용) */
    function _monthCell(ym, line) {
        var n = _daysInMonth(ym);
        var list = [];
        var errorDays = 0, filledDays = 0, activeDays = 0;
        for (var d = 1; d <= n; d++) {
            var cell = _dayCell(_dateStr(ym, d), line);
            if (cell.hasActivity) activeDays++;
            // 입력이 없는 날(휴무·미입력)은 조업시간 0이라 계산상 오류로 잡히지만 '오류'가 아니다.
            // 오류 판정은 실제 입력이 있는 날에만 한다.
            if (!cell.hasRecord) continue;
            filledDays++;
            if (cell.result.hasError) { errorDays++; continue; }   // 오류일은 집계에서 제외
            list.push(cell.inputs);
        }
        var summed = OeeCalc.sumInputs(list);
        return {
            inputs: summed, result: OeeCalc.compute(summed),
            errorDays: errorDays, filledDays: filledDays, activeDays: activeDays, includedDays: list.length
        };
    }

    // ── 렌더링: 계산 체인 매트릭스 (일별·월별 공용) ────────────────
    /**
     * @param cols [{label, sub, cell, onclick, state}]
     */
    function _renderChainMatrix(cols, opts) {
        opts = opts || {};
        var pad = 'padding:4px 8px;';
        var numTd = 'padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;';
        var lbl = function (text, indent, strong, extra) {
            return '<td style="' + pad + 'white-space:nowrap;position:sticky;left:0;z-index:2;background:var(--bg-primary);'
                + (indent ? 'padding-left:' + (8 + indent * 12) + 'px;' : '')
                + (strong ? 'font-weight:700;' : 'color:var(--text-secondary);')
                + (extra || '') + '">' + text + '</td>';
        };

        var rows = [];
        var pushRow = function (labelHtml, getter, rowStyle) {
            var tds = cols.map(function (c) {
                return '<td style="' + numTd + (rowStyle || '') + '">' + getter(c) + '</td>';
            }).join('');
            rows.push('<tr>' + labelHtml + tds + '</tr>');
        };

        // 모델명
        pushRow(lbl('모델명 <span style="opacity:.5;">🔒</span>', 0, false),
            function (c) {
                var m = c.cell.model || '-';
                return '<span style="font-size:0.74rem;color:var(--text-muted);">' + _esc(m.length > 14 ? m.slice(0, 13) + '…' : m) + '</span>';
            });

        pushRow(lbl('조업시간(분)', 0, true), function (c) { return _fmt(c.cell.result.operatingMin); },
            'font-weight:700;');

        OeeCalc.MGMT_FIELDS.forEach(function (f) {
            pushRow(lbl(f.label, 1), function (c) { return _fmt((c.cell.inputs.mgmtLoss || {})[f.k]); });
        });
        pushRow(lbl('관리LOSS 합계', 1, false, 'font-style:italic;'),
            function (c) { return _fmt(c.cell.result.mgmtLossTotal); }, 'color:var(--text-muted);');

        pushRow(lbl('부하시간(분)', 0, true), function (c) {
            var v = c.cell.result.loadMin;
            return '<span style="' + (v < 0 ? 'color:var(--accent-red);' : '') + '">' + _fmt(v) + '</span>';
        }, 'font-weight:700;background:rgba(37,99,235,.04);');

        OeeCalc.STOP_FIELDS.forEach(function (f) {
            pushRow(lbl(f.label, 1), function (c) { return _fmt((c.cell.inputs.stopLoss || {})[f.k]); });
        });
        pushRow(lbl('정지LOSS 합계', 1, false, 'font-style:italic;'),
            function (c) { return _fmt(c.cell.result.stopLossTotal); }, 'color:var(--text-muted);');

        pushRow(lbl('가동시간(분)', 0, true), function (c) {
            var v = c.cell.result.runMin;
            return '<span style="' + (v < 0 ? 'color:var(--accent-red);' : '') + '">' + _fmt(v) + '</span>';
        }, 'font-weight:700;background:rgba(37,99,235,.04);');

        OeeCalc.SPEED_FIELDS.forEach(function (f) {
            pushRow(lbl(f.label, 1), function (c) { return _fmt((c.cell.inputs.speedLoss || {})[f.k]); });
        });
        pushRow(lbl('속도LOSS 합계', 1, false, 'font-style:italic;'),
            function (c) { return _fmt(c.cell.result.speedLossTotal); }, 'color:var(--text-muted);');

        pushRow(lbl('성능가동시간(분)', 0, true), function (c) {
            var v = c.cell.result.netRunMin;
            return '<span style="' + (v < 0 ? 'color:var(--accent-red);' : '') + '">' + _fmt(v) + '</span>';
        }, 'font-weight:700;background:rgba(37,99,235,.04);');

        pushRow(lbl('C/T(초) · CVT <span style="opacity:.5;">🔒</span>', 0), function (c) {
            var r = c.cell.result;
            if (r.ctSec == null) return '<span style="color:var(--text-muted);">-</span>';
            return '<span style="font-size:0.74rem;">' + _fmt1(r.ctSec) + (r.cvt ? ' · ' + _fmt(r.cvt) : '') + '</span>';
        });
        pushRow(lbl('이론 생산계획(EA) <span style="opacity:.5;">🔒</span>', 0), function (c) {
            var v = c.cell.result.theoreticalQty;
            return v == null ? '<span style="color:var(--text-muted);">-</span>' : _fmt(Math.round(v));
        });
        pushRow(lbl('실제 생산수(EA) <span style="opacity:.5;">🔒</span>', 0),
            function (c) { return _fmt(c.cell.result.actualQty); });
        pushRow(lbl('양품수(EA) <span style="opacity:.5;">🔒</span>', 0),
            function (c) { return _fmt(c.cell.result.goodQty); });

        var pctCell = function (v, flagCode, cell) {
            if (v == null) {
                var noInsp = flagCode === 'quality' && (cell.result.flags || []).some(function (f) { return f.code === 'NO_INSPECTION'; });
                return '<span style="color:var(--text-muted);font-size:0.72rem;">' + (noInsp ? '검사 미완료' : '-') + '</span>';
            }
            var over = v > 1;
            return '<span style="' + (over ? 'color:var(--accent-red);font-weight:700;' : '') + '">' + (v * 100).toFixed(1) + '</span>';
        };
        pushRow(lbl('양품율 (%)', 0), function (c) { return pctCell(c.cell.result.quality, 'quality', c.cell); });
        pushRow(lbl('시간가동율 (%)', 0), function (c) { return pctCell(c.cell.result.availability, 'availability', c.cell); });
        pushRow(lbl('성능가동율 (%)', 0), function (c) { return pctCell(c.cell.result.performance, 'performance', c.cell); });

        pushRow(lbl('설비종합효율 (%)', 0, true), function (c) {
            var v = c.cell.result.oee;
            if (v == null) {
                return '<span style="color:var(--accent-red);font-size:0.72rem;font-weight:700;">계산불가</span>';
            }
            var p = v * 100;
            var col = p >= 85 ? 'var(--accent-green)' : (p >= 70 ? '#b45309' : 'var(--accent-red)');
            return '<span style="color:' + col + ';font-weight:800;">' + p.toFixed(1) + '</span>';
        }, 'font-weight:800;background:rgba(16,185,129,.06);');

        pushRow(lbl('설비고장 횟수', 0), function (c) { return _fmt(c.cell.result.breakdownCount); });
        pushRow(lbl('M.T.B.F (분)', 0), function (c) {
            var v = c.cell.result.mtbf;
            return v == null ? '<span style="color:var(--text-muted);">-</span>' : _fmt(Math.round(v));
        });
        pushRow(lbl('M.T.T.R (분)', 0), function (c) {
            var v = c.cell.result.mttr;
            return v == null ? '<span style="color:var(--text-muted);">-</span>' : _fmt(Math.round(v));
        });

        var headTds = cols.map(function (c) {
            var bg = '', title = '';
            if (c.state === 'error')      { bg = 'background:rgba(239,68,68,.14);'; title = '입력 오류'; }
            else if (c.state === 'missing') { bg = 'background:rgba(245,158,11,.16);'; title = '실적은 있으나 미입력'; }
            else if (c.state === 'off')   { bg = 'background:var(--bg-secondary);opacity:.5;'; title = '휴무'; }
            else if (c.state === 'ok')    { bg = 'background:rgba(16,185,129,.10);'; }
            return '<th style="padding:5px 8px;white-space:nowrap;text-align:right;' + bg
                + (c.onclick ? 'cursor:pointer;' : '') + '"'
                + (c.onclick ? ' onclick="' + c.onclick + '"' : '')
                + ' title="' + _esc(title || c.label) + '">'
                + '<div style="font-weight:700;">' + _esc(c.label) + '</div>'
                + (c.sub ? '<div style="font-size:0.66rem;color:var(--text-muted);font-weight:400;">' + _esc(c.sub) + '</div>' : '')
                + '</th>';
        }).join('');

        return '<div class="data-table-wrapper" style="overflow-x:auto;">'
            + '<table class="data-table" style="font-size:0.8rem;min-width:100%;">'
            + '<thead><tr>'
            + '<th style="padding:5px 8px;position:sticky;left:0;z-index:3;background:var(--bg-primary);text-align:left;white-space:nowrap;">구분</th>'
            + headTds + '</tr></thead>'
            + '<tbody>' + rows.join('') + '</tbody></table></div>';
    }

    // ── 렌더링: 일별 ────────────────────────────────────────────────
    function _renderDaily() {
        var ym = _state.ym, line = _state.line;
        var n = _daysInMonth(ym);
        var cols = [];
        for (var d = 1; d <= n; d++) {
            var ds = _dateStr(ym, d);
            var cell = _dayCell(ds, line);
            // 미입력일은 오류가 아니다 — 입력이 있는 날만 오류 판정한다
            var state = 'off';
            if (cell.hasRecord) state = cell.result.hasError ? 'error' : 'ok';
            else if (cell.hasActivity) state = 'missing';
            cols.push({
                label: String(d),
                sub: ['일', '월', '화', '수', '목', '금', '토'][new Date(ds).getDay()],
                cell: cell, state: state,
                onclick: (line === 'ALL') ? '' : "EquipmentOeeModule.openDayModal('" + ds + "')"
            });
        }
        // 합계 열 — 일별 합계는 월별 표의 해당 월 값과 반드시 같아야 한다
        var m = _monthCell(ym, line);
        cols.push({ label: '합계', sub: '', cell: { inputs: m.inputs, result: m.result, model: '' }, state: '' });

        var hint = (line === 'ALL')
            ? '<span style="color:var(--text-muted);font-size:0.8rem;">통합 탭에서는 입력할 수 없습니다 — A라인/B라인 탭에서 날짜를 클릭하세요.</span>'
            : '<span style="color:var(--text-muted);font-size:0.8rem;">날짜 머리글을 클릭하면 그날 입력 화면이 열립니다.</span>';

        return _qualityBanner(m) + '<div style="margin:6px 0 8px;">' + hint + '</div>' + _renderChainMatrix(cols);
    }

    // ── 렌더링: 월별 ────────────────────────────────────────────────
    function _renderMonthly() {
        var year = _state.ym.slice(0, 4), line = _state.line;
        var cols = [];
        var monthly = [];
        for (var m = 1; m <= 12; m++) {
            var ym = year + '-' + String(m).padStart(2, '0');
            var cell = _monthCell(ym, line);
            monthly.push(cell);
            cols.push({
                label: m + '월', sub: '',
                cell: { inputs: cell.inputs, result: cell.result, model: '' },
                state: cell.errorDays > 0 ? 'error' : (cell.filledDays > 0 ? 'ok' : 'off'),
                onclick: "EquipmentOeeModule.setMonth('" + ym + "')"
            });
        }
        var yearSum = OeeCalc.sumInputs(monthly.map(function (c) { return c.inputs; }));
        cols.push({ label: '합계', sub: year, cell: { inputs: yearSum, result: OeeCalc.compute(yearSum), model: '' }, state: '' });

        return _renderChainMatrix(cols)
            + '<div class="card" style="margin-top:14px;padding:14px;">'
            + '<h4 style="margin:0 0 10px;font-size:0.92rem;">월별 추이</h4>'
            + '<div style="height:240px;"><canvas id="oeeTrendChart"></canvas></div>'
            + '</div>';
    }

    // ── 데이터 품질 배너 ────────────────────────────────────────────
    function _qualityBanner(m) {
        var parts = [];
        if (m.errorDays > 0) parts.push('<strong style="color:var(--accent-red);">계산 불가 ' + m.errorDays + '일</strong>이 집계에서 제외되었습니다');
        var missing = m.activeDays - m.filledDays;
        if (missing > 0) parts.push('실적은 있으나 <strong style="color:#b45309;">미입력 ' + missing + '일</strong>');
        if (!parts.length) return '';
        return '<div style="margin-bottom:10px;padding:9px 12px;border-radius:8px;border:1px solid rgba(245,158,11,.4);'
            + 'background:rgba(245,158,11,.08);font-size:0.82rem;line-height:1.5;">⚠ ' + parts.join(' · ') + '</div>';
    }

    // ── 렌더링: 타일 ────────────────────────────────────────────────
    function _tiles() {
        var m = _monthCell(_state.ym, _state.line);
        var r = m.result;
        var prevYm = (function (ym) {
            var p = ym.split('-'); var y = Number(p[0]), mo = Number(p[1]) - 1;
            if (mo < 1) { mo = 12; y--; }
            return y + '-' + String(mo).padStart(2, '0');
        })(_state.ym);
        var prev = _monthCell(prevYm, _state.line).result;

        var tile = function (icon, accent, title, val, unit, sub) {
            return '<div style="flex:1 1 150px;min-width:150px;padding:12px 14px;border-radius:10px;'
                + 'border:1px solid var(--border-color);background:var(--bg-primary);">'
                + '<div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-secondary);font-weight:600;">'
                + '<span class="material-symbols-outlined" style="font-size:15px;color:' + accent + ';">' + icon + '</span>' + _esc(title) + '</div>'
                + '<div style="margin-top:5px;font-size:1.5rem;font-weight:800;color:' + accent + ';line-height:1.15;">' + val
                + '<span style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-left:3px;">' + unit + '</span></div>'
                + '<div style="margin-top:3px;font-size:0.72rem;color:var(--text-muted);">' + sub + '</div></div>';
        };

        var oeeP = r.oee == null ? null : r.oee * 100;
        var oeeColor = oeeP == null ? 'var(--text-muted)' : (oeeP >= 85 ? 'var(--accent-green)' : (oeeP >= 70 ? '#b45309' : 'var(--accent-red)'));
        var delta = '';
        if (oeeP != null && prev.oee != null) {
            var d = oeeP - prev.oee * 100;
            delta = (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + 'p (전월 대비)';
        } else { delta = '전월 자료 없음'; }

        var totalLoss = r.mgmtLossTotal + r.stopLossTotal + r.speedLossTotal;

        return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">'
            + tile('speed', oeeColor, '설비종합효율', oeeP == null ? '-' : oeeP.toFixed(1), '%', delta)
            + tile('schedule', '#2563eb', '시간가동율', _pct(r.availability).replace('%', ''), '%', _fmt(r.runMin) + ' / ' + _fmt(r.loadMin) + ' 분')
            + tile('bolt', '#7c3aed', '성능가동율', _pct(r.performance).replace('%', ''), '%', '실제 ' + _fmt(r.actualQty) + ' EA')
            + tile('verified', '#059669', '양품율', _pct(r.quality).replace('%', ''), '%', '양품 ' + _fmt(r.goodQty) + ' EA')
            + tile('timer', '#0891b2', 'M.T.B.F', r.mtbf == null ? '-' : Math.round(r.mtbf).toLocaleString('ko-KR'), '분', '고장 ' + _fmt(r.breakdownCount) + '회')
            + tile('build', '#ea580c', 'M.T.T.R', r.mttr == null ? '-' : Math.round(r.mttr).toLocaleString('ko-KR'), '분', '수리 ' + _fmt(r.breakdownMin) + '분')
            + tile('trending_down', '#dc2626', '총 LOSS', _fmt(totalLoss), '분',
                   '관리 ' + _fmt(r.mgmtLossTotal) + ' · 정지 ' + _fmt(r.stopLossTotal) + ' · 속도 ' + _fmt(r.speedLossTotal))
            + tile('fact_check', '#475569', '입력 완료율',
                   m.activeDays > 0 ? Math.round(m.filledDays / m.activeDays * 100) : 0, '%',
                   '입력 ' + m.filledDays + ' / 실적 ' + m.activeDays + '일' + (m.errorDays ? ' · 오류 ' + m.errorDays + '일' : ''))
            + '</div>';
    }

    // ── 렌더링: 비계획정지 조치이력 ────────────────────────────────
    function _downtimeHistory() {
        var ym = _state.ym, line = _state.line;
        var n = _daysInMonth(ym);
        var rows = [];
        for (var d = 1; d <= n; d++) {
            var ds = _dateStr(ym, d);
            var dt = _downtimeFor(ds, line);
            dt.rows.forEach(function (r) {
                if (r.category === '예방정비') return;   // 계획정비는 '비계획정지'가 아니다
                rows.push({ date: ds, rec: r });
            });
        }
        var body = rows.length
            ? rows.map(function (x, i) {
                var r = x.rec;
                return '<tr>'
                    + '<td style="text-align:center;">' + (i + 1) + '</td>'
                    + '<td style="white-space:nowrap;">' + _esc(x.date) + '</td>'
                    + '<td style="text-align:right;">' + _fmt(r.duration) + '분</td>'
                    + '<td>' + _esc(r.category || '-') + '</td>'
                    + '<td>' + _esc(r.cause || '-') + '</td>'
                    + '<td>' + _esc(r.action || '-') + '</td>'
                    + '<td>' + _esc(r.actionPerson || '-') + '</td>'
                    + '</tr>';
            }).join('')
            : '<tr><td colspan="7" style="text-align:center;padding:22px;color:var(--text-muted);">해당 월의 비계획 정지 이력이 없습니다.</td></tr>';

        return '<div class="card" style="margin-top:14px;padding:14px;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
            + '<h4 style="margin:0;font-size:0.92rem;">비계획 재가동 정지 이력</h4>'
            + '<button class="btn btn-sm btn-outline" onclick="EquipmentOeeModule.gotoEquipment()">'
            + '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">open_in_new</span> 설비관리에서 등록</button>'
            + '</div>'
            + '<div class="data-table-wrapper"><table class="data-table" style="font-size:0.82rem;">'
            + '<thead><tr><th>순</th><th>날짜</th><th style="text-align:right;">비가동시간</th><th>구분</th><th>원인</th><th>조치내용</th><th>조치자</th></tr></thead>'
            + '<tbody>' + body + '</tbody></table></div></div>';
    }

    // ── 렌더링: 정의 ────────────────────────────────────────────────
    function _definitions() {
        return '<details style="margin-top:14px;padding:12px 14px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);">'
            + '<summary style="cursor:pointer;font-size:0.85rem;font-weight:700;color:var(--text-secondary);">용어 정의 (TPM 설비종합효율)</summary>'
            + '<div style="margin-top:10px;font-size:0.8rem;line-height:1.9;color:var(--text-secondary);">'
            + '<div><strong>조업시간</strong> = 설비가 가질 수 있는 시간 − 식사시간·쉬는시간·교대시간</div>'
            + '<div><strong>부하시간</strong> = 조업시간 − 계획정지 (교육, 조회, 조합활동, 예방정비, 청소)</div>'
            + '<div><strong>가동시간</strong> = 부하시간 − 정지로스 (설비고장, 품질문제, 자재결품)</div>'
            + '<div><strong>정미(성능가동)시간</strong> = 가동시간 − 속도로스 (설비속도저하, 순간정지, 공회전, 준비교체/컬러체인지)</div>'
            + '<div><strong>가치가동시간</strong> = 정미가동시간 − 불량로스 (초기수율, 불량, REWORK)</div>'
            + '<hr style="border:none;border-top:1px solid var(--border-color);margin:8px 0;">'
            + '<div><strong>설비종합효율(OEE)</strong> = 시간가동율 × 성능가동율 × 양품율 &nbsp;<span style="color:var(--text-muted);">(세계 최고 수준 85% 이상)</span></div>'
            + '<div><strong>M.T.B.F</strong> (Mean Time Between Failures) = 가동시간 ÷ 고장 횟수 — 평균 고장간격</div>'
            + '<div><strong>M.T.T.R</strong> (Mean Time To Repair) = 총 수리시간 ÷ 고장 횟수 — 평균 수리시간</div>'
            + '</div></details>';
    }

    // ── 메인 렌더 ───────────────────────────────────────────────────
    function render(container) {
        if (!_state.ym) _state.ym = _curYm();
        var el = container || document.getElementById('contentArea');
        if (!el) return;

        _loadOpMinConfig().then(function () { _paint(el); });
        _paint(el);

        if (_cacheWarmUnsub) { try { _cacheWarmUnsub(); } catch (e) {} _cacheWarmUnsub = null; }
        if (typeof Storage.onCacheWarm === 'function') {
            _cacheWarmUnsub = Storage.onCacheWarm(function (storeName) {
                if (['equip_oee_daily', 'equip_downtime', 'equip_master',
                     'painting_work', 'painting_inspections', 'production_plans', 'products'].indexOf(storeName) >= 0) {
                    var c = document.getElementById('contentArea');
                    if (c && document.getElementById('oeeRoot')) _paint(c);
                }
            });
        }
    }

    function _paint(el) {
        var lineTab = function (key, label) {
            var on = _state.line === key;
            return '<button class="btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline') + '" '
                + 'onclick="EquipmentOeeModule.setLine(\'' + key + '\')">' + label + '</button>';
        };
        var viewTab = function (key, label) {
            var on = _state.view === key;
            return '<button class="btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline') + '" '
                + 'onclick="EquipmentOeeModule.setView(\'' + key + '\')">' + label + '</button>';
        };

        var ready = (typeof Storage.isStoreReady !== 'function') || Storage.isStoreReady(STORE);
        var bodyHtml = ready
            ? (_tiles() + (_state.view === 'daily' ? _renderDaily() : _renderMonthly()) + _downtimeHistory() + _definitions())
            : '<div style="padding:40px;text-align:center;color:var(--text-muted);">데이터를 불러오는 중입니다…</div>';

        el.innerHTML =
            '<div id="oeeRoot" class="fade-in-up">'
            + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;">'
            + '<input type="month" class="form-input" style="width:160px;" value="' + _esc(_state.ym) + '" '
            + 'onchange="EquipmentOeeModule.setMonth(this.value)">'
            + '<div style="display:flex;gap:4px;">' + lineTab('ALL', '통합') + lineTab('도장-A', 'A라인') + lineTab('도장-B', 'B라인') + '</div>'
            + '<div style="display:flex;gap:4px;">' + viewTab('daily', '일별') + viewTab('monthly', '월별') + '</div>'
            + '<div style="flex:1;"></div>'
            + (_canWrite()
                ? '<button class="btn btn-sm btn-outline" onclick="EquipmentOeeModule.openOpMinSettings()">'
                  + '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">settings</span> 기본 조업시간</button>'
                  + '<button class="btn btn-sm btn-primary" onclick="EquipmentOeeModule.openDayModal()">'
                  + '<span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit_calendar</span> 일별 입력</button>'
                : '')
            + '</div>'
            + bodyHtml
            + '</div>';

        _drawCharts();
    }

    // ── 차트 ────────────────────────────────────────────────────────
    function _destroyCharts() {
        Object.keys(_charts).forEach(function (k) {
            try { _charts[k] && _charts[k].destroy(); } catch (e) {}
        });
        _charts = {};
    }

    function _drawCharts() {
        _destroyCharts();
        if (typeof Chart === 'undefined') return;
        var cv = document.getElementById('oeeTrendChart');
        if (!cv) return;

        var year = _state.ym.slice(0, 4);
        var labels = [], oee = [], av = [], pf = [], ql = [];
        for (var m = 1; m <= 12; m++) {
            var c = _monthCell(year + '-' + String(m).padStart(2, '0'), _state.line);
            labels.push(m + '월');
            oee.push(c.result.oee == null ? null : +(c.result.oee * 100).toFixed(1));
            av.push(c.result.availability == null ? null : +(c.result.availability * 100).toFixed(1));
            pf.push(c.result.performance == null ? null : +(c.result.performance * 100).toFixed(1));
            ql.push(c.result.quality == null ? null : +(c.result.quality * 100).toFixed(1));
        }
        var thin = function (label, data, color) {
            return { label: label, data: data, borderColor: color, backgroundColor: color,
                     borderWidth: 1.5, pointRadius: 2, tension: 0.2, spanGaps: true };
        };
        _charts.trend = new Chart(cv, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    thin('시간가동율', av, 'rgba(37,99,235,.45)'),
                    thin('성능가동율', pf, 'rgba(124,58,237,.45)'),
                    thin('양품율', ql, 'rgba(5,150,105,.45)'),
                    { label: 'OEE', data: oee, borderColor: '#dc2626', backgroundColor: '#dc2626',
                      borderWidth: 3, pointRadius: 4, tension: 0.2, spanGaps: true }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                // max를 110으로 둬서 100% 초과 이상치가 천장에 붙지 않고 눈에 보이도록 한다
                scales: {
                    y: { min: 0, max: 110, ticks: { callback: function (v) { return v + '%'; }, font: { size: 10 } },
                         grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // ── 입력 모달 ───────────────────────────────────────────────────
    function openDayModal(dateStr) {
        if (!_canWrite()) { UIUtils.toast('입력 권한이 없습니다.', 'warning'); return; }
        var line = _state.line;
        if (line === 'ALL') {
            UIUtils.toast('A라인 또는 B라인 탭을 선택한 뒤 입력하세요.', 'warning');
            return;
        }
        var ds = dateStr || (_state.ym === _curYm() ? _today() : _dateStr(_state.ym, 1));
        var d = _buildInputs(ds, line);
        var rec = d.rec;
        var dt = d.dt;

        // 저장된 값이 없으면 비가동이력에서 끌어와 채운다 (작업자의 확인이 곧 대사 절차)
        var pick = function (group, key) {
            if (rec && rec[group] && rec[group][key] != null) return Number(rec[group][key]) || 0;
            return dt.byLoss[group + '.' + key] || 0;
        };
        var opMin = rec ? (Number(rec.operatingMin) || 0) : _defaultOpMin(line);

        _editCtx = { date: ds, line: line, derived: d };

        var numInput = function (id, val, hint) {
            return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">'
                + '<label style="flex:1;font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">' + _esc(hint) + '</label>'
                + '<input type="number" class="form-input" id="' + id + '" value="' + val + '" min="0" '
                + 'style="width:88px;text-align:right;" oninput="EquipmentOeeModule.recalcPreview()"></div>';
        };
        var group = function (title, color, rowsHtml) {
            return '<div style="flex:1 1 200px;min-width:200px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;">'
                + '<div style="font-size:0.78rem;font-weight:700;color:' + color + ';margin-bottom:7px;">' + title + '</div>'
                + rowsHtml + '</div>';
        };

        var mgmtRows = OeeCalc.MGMT_FIELDS.map(function (f) {
            return numInput('oeeM_' + f.k, pick('mgmtLoss', f.k), f.label);
        }).join('');
        var stopRows = OeeCalc.STOP_FIELDS.map(function (f) {
            return numInput('oeeS_' + f.k, pick('stopLoss', f.k), f.label);
        }).join('');
        var speedRows = OeeCalc.SPEED_FIELDS.map(function (f) {
            return numInput('oeeP_' + f.k, (rec && rec.speedLoss && rec.speedLoss[f.k] != null) ? Number(rec.speedLoss[f.k]) || 0 : 0, f.label);
        }).join('');

        var autoRow = function (label, val, extra) {
            return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.8rem;padding:3px 0;">'
                + '<span style="color:var(--text-secondary);">' + _esc(label) + ' <span style="opacity:.5;">🔒</span></span>'
                + '<strong>' + val + '</strong></div>' + (extra || '');
        };

        var body =
            '<div style="padding:2px 0;">'
            + '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;padding:9px 12px;background:var(--bg-secondary);border-radius:8px;">'
            + '<strong style="font-size:0.92rem;">' + _esc(ds) + '</strong>'
            + '<span class="badge badge-outline">' + _esc(line) + '</span>'
            + '<span style="color:var(--text-muted);font-size:0.8rem;">' + _esc(d.model || '모델 미지정') + '</span>'
            + '</div>'

            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
            + '<label style="font-size:0.84rem;font-weight:700;white-space:nowrap;">조업시간 (분)</label>'
            + '<input type="number" class="form-input" id="oeeOperatingMin" value="' + opMin + '" min="0" '
            + 'style="width:110px;text-align:right;font-weight:700;" oninput="EquipmentOeeModule.recalcPreview()">'
            + '<span style="font-size:0.75rem;color:var(--text-muted);">기본값 ' + _fmt(_defaultOpMin(line)) + '분 · 특근일만 수정</span>'
            + '</div>'

            + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">'
            + group('관리 LOSS', '#b45309', mgmtRows)
            + group('정지 LOSS (시간가동)', '#dc2626', stopRows)
            + group('성능가동 LOSS (속도)', '#7c3aed', speedRows)
            + '</div>'

            + '<div style="display:flex;flex-wrap:wrap;gap:8px;">'
            + '<div style="flex:1 1 220px;min-width:220px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;">'
            + '<div style="font-size:0.78rem;font-weight:700;color:var(--accent-blue);margin-bottom:7px;">실적 자동 연동</div>'
            + autoRow('모델명', _esc(d.model || '-'))
            + autoRow('C/T · CVT', d.inputs.ctSec == null ? '<span style="color:var(--accent-red);">미등록</span>'
                : _fmt1(d.inputs.ctSec) + '초 · ' + _fmt(d.inputs.cvt))
            + autoRow('계획수량', _fmt(d.plan.qty) + ' EA')
            + autoRow('실제 생산수', _fmt(d.work.qty) + ' EA')
            + autoRow('양품수', d.insp.count === 0
                ? '<span style="color:#b45309;">검사 미입력</span>' : _fmt(d.insp.goodQty) + ' EA')
            + autoRow('설비고장', _fmt(dt.breakdownCount) + '회 · ' + _fmt(dt.breakdownMin) + '분')
            + '<div style="margin-top:6px;font-size:0.71rem;color:var(--text-muted);line-height:1.45;">'
            + '실적·검사·비가동이력에서 자동 산출됩니다. 값이 다르면 해당 화면에서 원본을 수정하세요.</div>'
            + '</div>'
            + '<div style="flex:1 1 220px;min-width:220px;padding:10px 12px;border:1px solid rgba(16,185,129,.3);'
            + 'border-radius:8px;background:rgba(16,185,129,.04);">'
            + '<div style="font-size:0.78rem;font-weight:700;color:var(--accent-green);margin-bottom:7px;">계산 결과</div>'
            + '<div id="oeePreview"></div>'
            + '</div>'
            + '</div>'

            + '<div style="margin-top:10px;">'
            + '<label class="form-label" style="font-size:0.8rem;">비고</label>'
            + '<input type="text" class="form-input" id="oeeNote" value="' + _esc((rec && rec.note) || '') + '">'
            + '</div>'
            + '</div>';

        UIUtils.showModal('설비종합효율 일별 입력', body,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>'
            + (rec ? '<button class="btn btn-danger" onclick="EquipmentOeeModule.remove(\'' + rec.id + '\')">삭제</button>' : '')
            + '<button class="btn btn-primary" onclick="EquipmentOeeModule.save()">저장</button>',
            'lg');

        setTimeout(recalcPreview, 30);
    }

    function _readForm() {
        var g = function (id) { return Number((document.getElementById(id) || {}).value) || 0; };
        var mgmtLoss = {}, stopLoss = {}, speedLoss = {};
        OeeCalc.MGMT_FIELDS.forEach(function (f) { mgmtLoss[f.k] = g('oeeM_' + f.k); });
        OeeCalc.STOP_FIELDS.forEach(function (f) { stopLoss[f.k] = g('oeeS_' + f.k); });
        OeeCalc.SPEED_FIELDS.forEach(function (f) { speedLoss[f.k] = g('oeeP_' + f.k); });
        return { operatingMin: g('oeeOperatingMin'), mgmtLoss: mgmtLoss, stopLoss: stopLoss, speedLoss: speedLoss };
    }

    function recalcPreview() {
        if (!_editCtx) return;
        var el = document.getElementById('oeePreview');
        if (!el) return;
        var form = _readForm();
        var d = _editCtx.derived;
        var inputs = Object.assign({}, d.inputs, form, {
            downtimeBreakdownMin: d.dt.byLoss['stopLoss.breakdown'] || 0
        });
        var r = OeeCalc.compute(inputs);

        var row = function (label, val, strong) {
            return '<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:2px 0;'
                + (strong ? 'font-weight:800;' : '') + '">'
                + '<span style="color:var(--text-secondary);">' + label + '</span><span>' + val + '</span></div>';
        };
        var neg = function (v) {
            return '<span style="' + (v < 0 ? 'color:var(--accent-red);font-weight:700;' : '') + '">' + _fmt(v) + '분</span>';
        };
        var oeeHtml = r.oee == null
            ? '<span style="color:var(--accent-red);">계산 불가</span>'
            : '<span style="color:' + (r.oee * 100 >= 85 ? 'var(--accent-green)' : (r.oee * 100 >= 70 ? '#b45309' : 'var(--accent-red)')) + ';">'
              + (r.oee * 100).toFixed(1) + '%</span>';

        var flagsHtml = r.flags.length
            ? '<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">'
              + r.flags.map(function (f) {
                  var c = f.level === 'error' ? 'var(--accent-red)' : '#b45309';
                  return '<div style="font-size:0.71rem;color:' + c + ';line-height:1.35;">'
                      + (f.level === 'error' ? '⛔ ' : '⚠ ') + _esc(f.msg) + '</div>';
              }).join('') + '</div>'
            : '';

        el.innerHTML =
            row('부하시간', neg(r.loadMin))
            + row('가동시간', neg(r.runMin))
            + row('성능가동시간', neg(r.netRunMin))
            + '<hr style="border:none;border-top:1px solid var(--border-color);margin:5px 0;">'
            + row('시간가동율', _pct(r.availability))
            + row('성능가동율', _pct(r.performance))
            + row('양품율', r.quality == null && d.insp.count === 0 ? '<span style="color:#b45309;">검사 미완료</span>' : _pct(r.quality))
            + row('설비종합효율', oeeHtml, true)
            + '<hr style="border:none;border-top:1px solid var(--border-color);margin:5px 0;">'
            + row('M.T.B.F', r.mtbf == null ? '-' : _fmt(Math.round(r.mtbf)) + '분')
            + row('M.T.T.R', r.mttr == null ? '-' : _fmt(Math.round(r.mttr)) + '분')
            + flagsHtml;
    }

    async function save() {
        if (!_editCtx) return;
        if (!_canWrite()) { UIUtils.toast('입력 권한이 없습니다.', 'warning'); return; }
        var form = _readForm();
        if (form.operatingMin <= 0) {
            UIUtils.toast('조업시간을 입력하세요.', 'warning');
            var el = document.getElementById('oeeOperatingMin'); if (el) el.focus();
            return;
        }
        var rec = _editCtx.derived.rec;
        var payload = {
            date: _editCtx.date,
            line: _editCtx.line,
            operatingMin: form.operatingMin,
            mgmtLoss: form.mgmtLoss,
            stopLoss: form.stopLoss,
            speedLoss: form.speedLoss,
            note: ((document.getElementById('oeeNote') || {}).value || '').trim(),
            writer: _actor()
        };
        try {
            if (rec) await Storage.update(STORE, rec.id, payload);
            else await Storage.add(STORE, payload);
            UIUtils.closeModal();
            UIUtils.toast(_editCtx.date + ' ' + _editCtx.line + ' 저장되었습니다.', 'success');
            _editCtx = null;
            _paint(document.getElementById('contentArea'));
        } catch (e) {
            console.error('[EquipmentOeeModule] 저장 실패:', e);
            UIUtils.toast('저장 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    function remove(id) {
        if (!_canWrite()) { UIUtils.toast('삭제 권한이 없습니다.', 'warning'); return; }
        UIUtils.confirm('이 날짜의 입력 기록을 삭제하시겠습니까?', async function () {
            try {
                await Storage.remove(STORE, id);
                UIUtils.closeModal();
                UIUtils.toast('삭제되었습니다.', 'success');
                _editCtx = null;
                _paint(document.getElementById('contentArea'));
            } catch (e) {
                UIUtils.toast('삭제 실패: ' + (e && e.message ? e.message : e), 'error');
            }
        });
    }

    // ── 기본 조업시간 설정 ──────────────────────────────────────────
    function openOpMinSettings() {
        if (!_canWrite()) { UIUtils.toast('설정 권한이 없습니다.', 'warning'); return; }
        var rows = LINES.map(function (l) {
            return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">'
                + '<label style="width:80px;font-size:0.85rem;font-weight:600;">' + _esc(l) + '</label>'
                + '<input type="number" class="form-input" id="oeeOp_' + l + '" value="' + _defaultOpMin(l) + '" min="0" '
                + 'style="width:110px;text-align:right;"><span style="font-size:0.8rem;color:var(--text-muted);">분 / 일</span></div>';
        }).join('');
        UIUtils.showModal('기본 조업시간 설정',
            '<div style="padding:4px 0;">'
            + '<div style="margin-bottom:10px;padding:9px 12px;border-radius:8px;background:var(--bg-secondary);font-size:0.81rem;line-height:1.55;color:var(--text-secondary);">'
            + '일별 입력 화면을 열 때 이 값이 조업시간 기본값으로 채워집니다. 특근·단축근무일은 그날 화면에서 직접 수정하세요.</div>'
            + rows + '</div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>'
            + '<button class="btn btn-primary" onclick="EquipmentOeeModule.saveOpMinSettings()">저장</button>',
            'sm');
    }

    async function saveOpMinSettings() {
        var cfg = {};
        LINES.forEach(function (l) {
            cfg[l] = Number((document.getElementById('oeeOp_' + l) || {}).value) || DEFAULT_OP_MIN;
        });
        try {
            await Storage.setConfigValue(OP_MIN_CONFIG_KEY, cfg);
            _opMinConfig = cfg;
            UIUtils.closeModal();
            UIUtils.toast('기본 조업시간이 저장되었습니다.', 'success');
        } catch (e) {
            UIUtils.toast('저장 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    // ── 이동 ────────────────────────────────────────────────────────
    function gotoEquipment() {
        try { sessionStorage.setItem('prodEquipmentMode', 'general'); } catch (e) {}
        Router.navigate('prod-equipment');
    }

    // ── 상태 변경 ───────────────────────────────────────────────────
    function setMonth(v) { if (v) { _state.ym = v; _state.view = 'daily'; _paint(document.getElementById('contentArea')); } }
    function setLine(v)  { _state.line = v; _paint(document.getElementById('contentArea')); }
    function setView(v)  { _state.view = v; _paint(document.getElementById('contentArea')); }

    /** 대시보드 등 외부에서 이번 달 OEE를 가져갈 때 사용 */
    function getMonthlySummary(ym, line) {
        return _monthCell(ym || _curYm(), line || 'ALL');
    }

    return {
        render: render,
        init: render,
        setMonth: setMonth,
        setLine: setLine,
        setView: setView,
        openDayModal: openDayModal,
        recalcPreview: recalcPreview,
        save: save,
        remove: remove,
        openOpMinSettings: openOpMinSettings,
        saveOpMinSettings: saveOpMinSettings,
        gotoEquipment: gotoEquipment,
        getMonthlySummary: getMonthlySummary
    };
})();
