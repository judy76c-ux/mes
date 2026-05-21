/**
 * IndexedDB 래퍼 모듈 (확장)
 * 전체 생산 공정 관리를 위한 스토어 추가
 */

const DB = (function() {
    const DB_NAME = 'ProductionMES_DB';
    const DB_VERSION = 41;
    let db = null;

    // 스토어 이름 - 전체 공정에 대응
    const STORES = {
        // 기본 마스터 데이터
        PRODUCTS: 'products', // 제품 마스터
        DEFECT_TYPES: 'defect_types', // 불량 유형 마스터
        PAINT_MATERIALS: 'paint_materials', // 도료 마스터
        INJECTION_MATERIALS: 'injection_materials', // 사출자재 마스터
        RAW_MATERIALS: 'raw_materials',             // 원재료 마스터 (사내 생산용)

        // 생산 계획
        PRODUCTION_PLANS: 'production_plans', // 생산 계획 지시서

        // 수입검사
        INJECTION_INSPECTIONS: 'injection_inspections', // 사출 수입검사일지
        INJECTION_INVENTORY: 'injection_inventory', // 사출 창고 재고
        PAINT_INCOMING_INSPECTIONS: 'paint_incoming_inspections', // 도료 수입검사일지

        // 자재 창고 (도료 등)
        PAINT_INVENTORY: 'paint_inventory', // 도료 창고 재고

        // 도장 공정
        PAINTING_INCOMING: 'painting_incoming', // 도장 입고
        PAINTING_WORK: 'painting_work', // 도장 작업일지
        PAINTING_INSPECTIONS: 'painting_inspections', // 도장 검사 (불량 집계)
        PAINTING_OUTGOING: 'painting_outgoing', // 도장품 출고

        // 사출 공정
        INJECTION_WORK_LOG: 'injection_work_log', // 사출 작업일지
        MOLD_CHANGE_LOG: 'injection_mold_changes',    // 금형 교체 이력
        RAW_MAT_CHANGE_LOG: 'injection_raw_mat_changes', // 원재료 변경 이력

        // 레이져 공정
        LASER_WORK_LOG: 'laser_work_log', // 레이져 작업일지
        LASER_INSPECTIONS: 'laser_inspections', // 레이져 검사일지

        // 출하 공정
        SHIPPING_STANDBY: 'shipping_standby', // 출하검사 대기
        SHIPPING_INSPECTIONS: 'shipping_inspections', // 출하검사 일지

        // 제품 창고
        PRODUCT_INVENTORY: 'product_inventory', // 제품 창고 재고
        PRODUCT_OUTGOING: 'product_outgoing', // 제품 출고

        // 영업 관리
        SALES_DELIVERY: 'sales_delivery', // 납품 관리
        SALES_DELIVERY_PLAN: 'sales_delivery_plan', // 납품 계획
        SALES_PURCHASE: 'sales_purchase', // 매입 관리
        SALES_OUTSOURCING: 'sales_outsourcing', // 외주처 관리
        JIG_USAGE_HISTORY: 'zig_usage_history', // Jig 사용 이력

        // JIG 수명 관리
        JIG_MASTER: 'jig_master', // JIG 마스터 (모델명, 도입일, 수명 주기)
        JIG_LOG: 'jig_log',       // JIG 사용/이력 로그

        // 생산 관리
        PROD_STANDARDS: 'prod_standards', // 제조 관리 표준 (NEW)
        PROD_CONDITIONS: 'prod_conditions', // 작업조건 관리
        PROD_QUALITY_CHECK: 'prod_quality_check', // 초중종물 관리
        PROD_EQUIPMENT: 'prod_equipment', // 설비 관리
        PROD_SUB_MATERIALS: 'prod_sub_materials', // 부자재 입고/소진 관리
        PROD_QUALITY_PERFORMANCE: 'prod_quality_performance', // 품질 실적/목표/개선대책 관리
        PROD_LIMIT_SAMPLES: 'prod_limit_samples', // 마스터/한도 견본 대장

        // 검사자/작업자 관리
        INSPECTORS: 'inspectors', // 자격인증 검사자
        OPERATORS: 'operators', // 현장 작업자 (NEW)

        // 원재료 재고 (입출고 원장)
        RAW_MATERIAL_INVENTORY: 'raw_material_inventory',

        // 설비관리 (v21)
        EQUIP_MASTER:       'equip_master',
        EQUIP_SPARE:        'equip_spare',
        EQUIP_CHECK_ITEM:   'equip_check_item',
        EQUIP_CHECK_RECORD: 'equip_check_record',
        EQUIP_ISSUE:        'equip_issue',
        EQUIP_DOWNTIME:     'equip_downtime',

        // SQ 점검관리 (v22)
        EQUIP_SQ_STD:       'equip_sq_std',   // SQ 관리기준 설정 (line+category key)
        EQUIP_SQ_LOG:       'equip_sq_log',   // SQ 점검 기록
        EQUIP_ILLUMINATION_LOG: 'equip_illumination_log', // 조도 점검 기록
        EQUIP_CONVEYOR_STD: 'equip_conveyor_std', // 컨베이어 규정 속도 설정
        EQUIP_FPROOF_LOG: 'equip_fproof_log', // F/PROOF 일일 C/SHEET 기록
        EQUIP_AIR_FILTER_LOG: 'equip_air_filter_log', // 압축에어필터 교체 실적
        EQUIP_SUPPLY_FILTER_LOG: 'equip_supply_filter_log', // 급기필터 교체 실적
        EQUIP_DRYER_CLEAN_LOG: 'equip_dryer_clean_log', // 건조로 청소 실적

        // SPC 관리 (v23)
        PROD_SPC_DATA:      'prod_spc_data',  // 도막두께/공정품질 SPC 측정 데이터

        // 3정5S 관리 (v25)
        S5_INSPECTIONS: 's5_inspections', // 3정5S 점검 일지
        S5_ISSUES:      's5_issues',      // 지적사항·시정조치

        // 도료 배합 관리 기준표 (v28)
        PAINT_USAGE_STD: 'paint_usage_std', // 도료 사용량 기준표
        PAINT_MIX_STD:   'paint_mix_std',   // 배합기준표 (주제+경화제+신너)

        // 작업 표준서 (v32)
        WORK_STANDARDS: 'work_standards',   // 공정별 작업 표준서

        // 사출 수입검사 기준 사진 (v34)
        INJ_INSP_STANDARDS: 'inj_insp_standards', // 차종/품명별 검사기준 사진

        // 사출컬러 기준서 파일 (v36)
        INJECT_COLOR_STD: 'inject_color_standards', // 사출품 COLOR 기준서 파일 이력

        // 사출컬러 기준서 편집 데이터 (v37)
        INJECT_COLOR_STD_DATA: 'inject_color_std_data', // 기준서 편집 내용

        // 파지 기준서 편집 데이터 (v38)
        PAJI_STD_DATA: 'paji_std_data', // 제품 파지 기준서 편집 내용

        // 세척 소모품 교체관리 기준서 데이터 (v39)
        WASH_CONSUMABLE_DATA: 'wash_consumable_data',

        // 교반시간 작업기준서 데이터 (v40)
        AGIT_STD_DATA: 'agit_std_data',

        // 잔여도료 포장방법 작업기준서 데이터 (v41)
        REMAIN_PAINT_DATA: 'remain_paint_data',

        // 설정
        CONFIG: 'config'
    };

    // ══════════════════════════════════════════════════════════════
    // Schema Validator
    // ══════════════════════════════════════════════════════════════
    //
    // 각 스토어에 저장할 수 있는 필드와 규칙을 정의합니다.
    //
    // 규칙(rule) 속성:
    //   required    {boolean}  true 이면 값 없을 때 저장 차단
    //   type        {string}   'string' | 'number' | 'boolean' | 'array'
    //   enum        {Array}    허용 값 목록 — 목록 외 값 저장 차단
    //   min         {number}   숫자 최솟값 — 미달 시 저장 차단
    //   pattern     {RegExp}   문자열 형식 — 불일치 시 경고만 (저장 허용)
    //   patternDesc {string}   pattern 설명 (사람이 읽을 수 있는 형식)
    //   label       {string}   오류 메시지에 표시할 한글 필드명
    //
    // 스키마가 없는 스토어(CONFIG, OPERATORS, INSPECTORS 등)는 검사를 생략합니다.
    // ──────────────────────────────────────────────────────────────
    const SCHEMAS = {

        // ── 마스터 데이터 ──────────────────────────────────────────
        [STORES.PRODUCTS]: {
            name:    { required: true,  type: 'string', label: '제품명' }
        },
        [STORES.DEFECT_TYPES]: {
            name:    { required: true,  type: 'string', label: '불량유형명' }
        },
        [STORES.PAINT_MATERIALS]: {
            name:     { required: true,  type: 'string', label: '도료명'  },
            supplier: { required: true,  type: 'string', label: '공급사'  }
        },
        [STORES.INJECTION_MATERIALS]: {
            injPartName: { required: true,  type: 'string', label: '사출부품명' }
        },
        [STORES.RAW_MATERIALS]: {
            name:    { required: true,  type: 'string', label: '원재료명' }
        },

        // ── 생산 계획 ──────────────────────────────────────────────
        [STORES.PRODUCTION_PLANS]: {
            date:     { required: true,  type: 'string', label: '계획일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명'   },
            planQty:  { required: true,  type: 'number', label: '계획수량', min: 1 }
        },

        // ── 수입 검사 ──────────────────────────────────────────────
        [STORES.INJECTION_INSPECTIONS]: {
            date:        { required: true,  type: 'string', label: '검사일',
                           pattern: /^\d{4}-\d{2}-\d{2}/, patternDesc: 'YYYY-MM-DD' },
            partName:    { required: true,  type: 'string', label: '부품명'   },
            incomingQty: { required: true,  type: 'number', label: '입고수량', min: 0 }
        },
        [STORES.PAINT_INCOMING_INSPECTIONS]: {
            date:      { required: true,  type: 'string', label: '검사일',
                         pattern: /^\d{4}-\d{2}-\d{2}/, patternDesc: 'YYYY-MM-DD' },
            paintName: { required: true,  type: 'string', label: '도료명'  },
            verdict:   { required: false, type: 'string', label: '판정',
                         enum: ['합격', '불합격'] }
        },

        // ── 재고 입출고 ────────────────────────────────────────────
        [STORES.INJECTION_INVENTORY]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}/, patternDesc: 'YYYY-MM-DD' },
            type:     { required: true,  type: 'string', label: '유형',
                        enum: ['입고', '출고'] },
            partName: { required: true,  type: 'string', label: '부품명' },
            quantity: { required: true,  type: 'number', label: '수량',   min: 0 }
        },
        [STORES.PAINT_INVENTORY]: {
            date:       { required: true,  type: 'string', label: '날짜',
                          pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            type:       { required: true,  type: 'string', label: '유형',
                          enum: ['입고', '출고'] },
            materialId: { required: true,  type: 'string', label: '도료 ID' },
            quantity:   { required: true,  type: 'number', label: '수량',   min: 0 }
        },
        [STORES.PRODUCT_INVENTORY]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            type:     { required: true,  type: 'string', label: '유형',
                        enum: ['입고', '출고'] },
            partName: { required: true,  type: 'string', label: '부품명' },
            quantity: { required: true,  type: 'number', label: '수량',   min: 0 }
        },
        [STORES.RAW_MATERIAL_INVENTORY]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            type:     { required: true,  type: 'string', label: '유형',
                        enum: ['입고', '출고'] },
            quantity: { required: true,  type: 'number', label: '수량',   min: 0 }
        },

        // ── 도장 공정 ──────────────────────────────────────────────
        [STORES.PAINTING_WORK]: {
            date:     { required: true,  type: 'string', label: '작업일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명' },
            line:     { required: false, type: 'string', label: '라인',
                        enum: ['도장-A', '도장-B'] }
        },
        [STORES.PAINTING_INSPECTIONS]: {
            date:     { required: true,  type: 'string', label: '검사일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },

        // ── 레이져 공정 ────────────────────────────────────────────
        [STORES.LASER_WORK_LOG]: {
            date:     { required: true,  type: 'string', label: '작업일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            machine:  { required: false, type: 'string', label: '설비',
                        enum: ['1호기', '2호기', '3호기'] },
            quantity: { required: true,  type: 'number', label: '수량',   min: 0 }
        },
        [STORES.LASER_INSPECTIONS]: {
            date:     { required: true,  type: 'string', label: '검사일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },

        // ── 출하 공정 ──────────────────────────────────────────────
        [STORES.SHIPPING_STANDBY]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명' },
            quantity: { required: true,  type: 'number', label: '수량',   min: 0 },
            status:   { required: false, type: 'string', label: '상태',
                        enum: ['대기', '검사중', '합격', '불합격', '출하완료', '완료'] }
        },
        [STORES.SHIPPING_INSPECTIONS]: {
            date:     { required: true,  type: 'string', label: '검사일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명'  },
            result:   { required: false, type: 'string', label: '판정',
                        enum: ['합격', '불합격', '보류'] }
        },
        [STORES.PRODUCT_OUTGOING]: {
            date:     { required: true,  type: 'string', label: '출고일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명' },
            quantity: { required: true,  type: 'number', label: '수량',   min: 1 }
        },

        // ── 영업 관리 ──────────────────────────────────────────────
        [STORES.SALES_DELIVERY]: {
            date:     { required: true,  type: 'string', label: '납품일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '부품명'   },
            qty:      { required: true,  type: 'number', label: '납품수량', min: 1 }
        },
        [STORES.SALES_DELIVERY_PLAN]: {
            date:     { required: true,  type: 'string', label: '납품계획일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            partName: { required: true,  type: 'string', label: '품명' },
            planQty:  { required: true,  type: 'number', label: '계획수량', min: 1 }
        },
        [STORES.SALES_PURCHASE]: {
            date:     { required: true,  type: 'string', label: '매입일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },
        [STORES.SALES_OUTSOURCING]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },

        // ── 사출 공정 ──────────────────────────────────────────────
        [STORES.INJECTION_WORK_LOG]: {
            date:     { required: true,  type: 'string', label: '작업일',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },
        [STORES.MOLD_CHANGE_LOG]: {
            date:     { required: true,  type: 'string', label: '교체일자',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            machine:  { required: true,  type: 'string', label: '사출기' },
            newMoldNo:{ required: true,  type: 'string', label: '신 금형번호' },
            reason:   { required: true,  type: 'string', label: '교체사유' }
        },
        [STORES.RAW_MAT_CHANGE_LOG]: {
            date:        { required: true,  type: 'string', label: '변경일자',
                           pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            machine:     { required: true,  type: 'string', label: '사출기' },
            newMaterial: { required: true,  type: 'string', label: '변경 원재료명' },
            reason:      { required: true,  type: 'string', label: '변경사유' }
        },

        // ── 생산 관리 ──────────────────────────────────────────────
        [STORES.PROD_CONDITIONS]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },
        [STORES.PROD_QUALITY_CHECK]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },
        [STORES.PROD_EQUIPMENT]: {
            date:     { required: true,  type: 'string', label: '날짜',
                        pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' }
        },
        [STORES.PROD_SUB_MATERIALS]: {
            date:      { required: true,  type: 'string', label: '입고일자',
                         pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            itemName:  { required: true,  type: 'string', label: '부자재명' },
            quantity:  { required: true,  type: 'number', label: '입고수량', min: 0 },
            unit:      { required: true,  type: 'string', label: '단위' }
        },
        [STORES.PROD_QUALITY_PERFORMANCE]: {
            date:      { required: true,  type: 'string', label: '실적월',
                         pattern: /^\d{4}-\d{2}-\d{2}$/, patternDesc: 'YYYY-MM-DD' },
            category:  { required: true,  type: 'string', label: '실적구분',
                         enum: ['process', 'customer', 'outsourcing'] },
            inputQty:  { required: false, type: 'number', label: '대상수량', min: 0 },
            defectQty: { required: false, type: 'number', label: '불량수', min: 0 }
        }
        // EQUIP_MASTER, EQUIP_SPARE, EQUIP_CHECK_ITEM, EQUIP_CHECK_RECORD,
        // EQUIP_ISSUE, EQUIP_DOWNTIME — 설비관리 서브 스토어, 스키마 미정의
        // CONFIG, OPERATORS, INSPECTORS, PROD_STANDARDS —
        // 저장 형식이 다양하거나 내부 관리용이므로 스키마 미정의 (검사 생략)
    };

    /**
     * 스토어 데이터 유효성 검사
     *
     * 동작:
     *   - 스키마가 없는 스토어 → 즉시 반환 (검사 생략)
     *   - required 필드 누락   → Error throw  (저장 차단)
     *   - type 불일치          → Error throw  (저장 차단)
     *   - enum 외 값           → Error throw  (잘못된 상태값 방지)
     *   - min 미달             → Error throw  (음수 수량 방지)
     *   - pattern 불일치       → console.warn (경고만, 저장 허용)
     *
     * @param {string} storeName
     * @param {object} data
     * @throws {Error} 유효성 검사 실패 시
     */
    function validate(storeName, data) {
        const schema = SCHEMAS[storeName];
        if (!schema) return; // 스키마 미정의 스토어는 검사 생략

        const hardErrors = []; // 저장을 차단하는 오류
        const warnings   = []; // 경고만 (저장 허용)

        for (const [field, rules] of Object.entries(schema)) {
            const val   = data[field];
            const label = rules.label || field;
            const isEmpty = val === undefined || val === null || val === '';

            // ── ① 필수 항목 누락 ────────────────────────────────
            if (rules.required && isEmpty) {
                hardErrors.push(`'${label}' 항목이 누락되었습니다 (필드: ${field})`);
                continue; // 이후 규칙 생략
            }
            if (isEmpty) continue; // 선택 항목이 비어 있으면 나머지 검사 생략

            // ── ② 타입 검사 ────────────────────────────────────
            if (rules.type) {
                const actualType = Array.isArray(val) ? 'array' : typeof val;
                if (actualType !== rules.type) {
                    hardErrors.push(
                        `'${label}' 타입 오류: ${rules.type} 필요, ` +
                        `${actualType}(${JSON.stringify(val)}) 입력됨`
                    );
                    continue;
                }
            }

            // ── ③ 열거형(enum) 검사 ─────────────────────────────
            if (rules.enum && !rules.enum.includes(val)) {
                hardErrors.push(
                    `'${label}' 값 오류: [${rules.enum.join(', ')}] 중 하나여야 하는데 ` +
                    `"${val}" 입력됨`
                );
            }

            // ── ④ 최솟값 검사 (number) ──────────────────────────
            if (rules.min !== undefined && typeof val === 'number' && val < rules.min) {
                hardErrors.push(
                    `'${label}' 값 오류: 최솟값 ${rules.min} 이상이어야 하는데 ${val} 입력됨`
                );
            }

            // ── ⑤ 패턴 검사 (string) — 경고만, 저장 허용 ────────
            if (rules.pattern && typeof val === 'string' && !rules.pattern.test(val)) {
                warnings.push(
                    `'${label}' 형식 권장(${rules.patternDesc || rules.pattern}), ` +
                    `현재 값: "${val}"`
                );
            }
        }

        // 경고 출력 (저장은 계속 진행)
        if (warnings.length > 0) {
            console.warn(
                `[Schema:${storeName}] 형식 경고 (저장은 허용됨):\n  ` +
                warnings.join('\n  ')
            );
        }

        // 오류가 하나라도 있으면 저장 차단
        if (hardErrors.length > 0) {
            throw new Error(
                `[Schema:${storeName}] 유효성 오류 (${hardErrors.length}건):\n  ` +
                hardErrors.join('\n  ')
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // Role-Based Access Control (RBAC)
    // ══════════════════════════════════════════════════════════════
    //
    // 삭제 연산(remove · clear)에 대해 스토어별 최소 권한을 강제합니다.
    // 읽기(getAll · getById)와 쓰기(save · saveAll)는 권한 제한 없음.
    //
    // 역할 계층 (숫자가 클수록 높은 권한):
    //   admin(4) > manager(3) > operator(2) > viewer(1)
    //
    // 사용법:
    //   DB.setRole('manager');          // 역할 설정
    //   DB.getRole();                   // 현재 역할 조회
    //   DB.ROLES                        // 역할 상수 참조
    //
    // 기본값 'admin' → 기존 코드(setRole 미호출)는 영향 없음
    // ──────────────────────────────────────────────────────────────

    /** 현재 사용자 역할 (기본값: 'admin' — 기존 코드 호환성 유지) */
    let _currentRole = 'admin';

    /** 역할 상수 */
    const ROLES = {
        ADMIN:    'admin',
        MANAGER:  'manager',
        OPERATOR: 'operator',
        VIEWER:   'viewer'
    };

    /** 역할별 권한 레벨 (숫자가 클수록 높은 권한) */
    const ROLE_LEVELS = {
        admin:    4,
        manager:  3,
        operator: 2,
        viewer:   1
    };

    /**
     * 스토어별 삭제 권한 정책
     *
     * remove : 단건 삭제(DB.remove)에 필요한 최소 역할
     * clear  : 전체 초기화(DB.clear)에 필요한 최소 역할
     *
     * 정책 근거:
     *   - 마스터 데이터 / 검사 기록 / 영업 재무 데이터
     *       → 변경 영향 범위가 넓어 manager/admin 제한
     *   - 재고 원장 (입출고 이력)
     *       → 단건 삭제는 operator 허용, 전체 초기화는 admin 제한
     *   - 일상 작업 로그 (도장·사출·레이져)
     *       → 단건 삭제 operator, 전체 초기화 manager
     *   - CONFIG (시스템 설정)
     *       → 모든 삭제 연산 admin 전용
     */
    const STORE_DELETE_POLICY = {
        // ── 마스터 데이터 ──────────────────────────────────────────
        [STORES.PRODUCTS]:                   { remove: 'manager', clear: 'admin'   },
        [STORES.DEFECT_TYPES]:               { remove: 'manager', clear: 'admin'   },
        [STORES.PAINT_MATERIALS]:            { remove: 'manager', clear: 'admin'   },
        [STORES.INJECTION_MATERIALS]:        { remove: 'manager', clear: 'admin'   },
        [STORES.RAW_MATERIALS]:              { remove: 'manager', clear: 'admin'   },
        [STORES.INSPECTORS]:                 { remove: 'manager', clear: 'admin'   },
        [STORES.OPERATORS]:                  { remove: 'manager', clear: 'admin'   },
        [STORES.PROD_STANDARDS]:             { remove: 'manager', clear: 'admin'   },
        // ── 생산 계획 ──────────────────────────────────────────────
        [STORES.PRODUCTION_PLANS]:           { remove: 'manager', clear: 'admin'   },
        // ── 수입 검사 기록 (품질 추적 필수) ──────────────────────
        [STORES.INJECTION_INSPECTIONS]:      { remove: 'manager', clear: 'admin'   },
        [STORES.PAINT_INCOMING_INSPECTIONS]: { remove: 'manager', clear: 'admin'   },
        [STORES.PAINTING_INSPECTIONS]:       { remove: 'manager', clear: 'admin'   },
        [STORES.LASER_INSPECTIONS]:          { remove: 'manager', clear: 'admin'   },
        [STORES.SHIPPING_INSPECTIONS]:       { remove: 'manager', clear: 'admin'   },
        // ── 재고 원장 (무결성 보호) ────────────────────────────────
        [STORES.INJECTION_INVENTORY]:        { remove: 'operator', clear: 'admin'  },
        [STORES.PAINT_INVENTORY]:            { remove: 'operator', clear: 'admin'  },
        [STORES.PRODUCT_INVENTORY]:          { remove: 'operator', clear: 'admin'  },
        [STORES.RAW_MATERIAL_INVENTORY]:     { remove: 'operator', clear: 'admin'  },
        // ── 출하 · 출고 ────────────────────────────────────────────
        [STORES.SHIPPING_STANDBY]:           { remove: 'operator', clear: 'manager'},
        [STORES.PRODUCT_OUTGOING]:           { remove: 'manager',  clear: 'admin'  },
        // ── 일상 작업 로그 ─────────────────────────────────────────
        [STORES.PAINTING_WORK]:              { remove: 'operator', clear: 'manager'},
        [STORES.PAINTING_INCOMING]:          { remove: 'operator', clear: 'manager'},
        [STORES.PAINTING_OUTGOING]:          { remove: 'operator', clear: 'manager'},
        [STORES.INJECTION_WORK_LOG]:         { remove: 'operator', clear: 'manager'},
        [STORES.MOLD_CHANGE_LOG]:            { remove: 'operator', clear: 'manager'},
        [STORES.RAW_MAT_CHANGE_LOG]:         { remove: 'operator', clear: 'manager'},
        [STORES.LASER_WORK_LOG]:             { remove: 'operator', clear: 'manager'},
        // ── 생산 관리 ──────────────────────────────────────────────
        [STORES.PROD_CONDITIONS]:            { remove: 'operator', clear: 'manager'},
        [STORES.PROD_QUALITY_CHECK]:         { remove: 'operator', clear: 'manager'},
        [STORES.PROD_EQUIPMENT]:             { remove: 'manager',  clear: 'admin'  },
        [STORES.PROD_SUB_MATERIALS]:         { remove: 'operator', clear: 'manager'},
        [STORES.PROD_QUALITY_PERFORMANCE]:   { remove: 'operator', clear: 'manager'},
        [STORES.PROD_LIMIT_SAMPLES]:         { remove: 'operator', clear: 'manager'},
        // ── 영업 관리 (재무 데이터) ────────────────────────────────
        [STORES.SALES_DELIVERY]:             { remove: 'manager',  clear: 'admin'  },
        [STORES.SALES_DELIVERY_PLAN]:        { remove: 'manager',  clear: 'admin'  },
        [STORES.SALES_PURCHASE]:             { remove: 'manager',  clear: 'admin'  },
        [STORES.SALES_OUTSOURCING]:          { remove: 'manager',  clear: 'admin'  },
        // ── 설비관리 (v21) ─────────────────────────────────────────
        [STORES.EQUIP_MASTER]:       { remove: 'manager',  clear: 'admin'   },
        [STORES.EQUIP_SPARE]:        { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_CHECK_ITEM]:   { remove: 'manager',  clear: 'admin'   },
        [STORES.EQUIP_CHECK_RECORD]: { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_ISSUE]:        { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_DOWNTIME]:     { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_SQ_STD]:       { remove: 'manager',  clear: 'admin'   },
        [STORES.EQUIP_SQ_LOG]:       { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_ILLUMINATION_LOG]: { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_CONVEYOR_STD]: { remove: 'manager',  clear: 'admin'   },
        [STORES.EQUIP_FPROOF_LOG]: { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_AIR_FILTER_LOG]: { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_SUPPLY_FILTER_LOG]: { remove: 'operator', clear: 'manager' },
        [STORES.EQUIP_DRYER_CLEAN_LOG]: { remove: 'operator', clear: 'manager' },
        // ── SPC 관리 (v23) ────────────────────────────────────────
        [STORES.PROD_SPC_DATA]:      { remove: 'operator', clear: 'manager' },
        // ── 3정5S 관리 (v25) ──────────────────────────────────────
        [STORES.S5_INSPECTIONS]:     { remove: 'operator', clear: 'manager' },
        [STORES.S5_ISSUES]:          { remove: 'operator', clear: 'manager' },
        // ── 작업 표준서 (v32) ─────────────────────────────────────
        [STORES.WORK_STANDARDS]:             { remove: 'manager',  clear: 'admin'  },
        // ── 수입검사 기준 사진 (v34) ───────────────────────────────
        [STORES.INJ_INSP_STANDARDS]:         { remove: 'manager',  clear: 'admin'  },
        // ── 사출컬러 기준서 (v36) ──────────────────────────────────
        [STORES.INJECT_COLOR_STD]:           { remove: 'manager',  clear: 'admin'  },
        // ── 시스템 설정 ────────────────────────────────────────────
        [STORES.CONFIG]:                     { remove: 'admin',    clear: 'admin'  }
    };

    /** 정책 미정의 스토어의 기본값 (가장 엄격하게) */
    const DEFAULT_DELETE_POLICY = { remove: 'manager', clear: 'admin' };

    /**
     * 삭제 권한 검사
     *
     * 현재 역할(_currentRole)이 스토어의 해당 연산에 필요한
     * 최소 역할을 충족하지 못하면 Error를 throw합니다.
     *
     * @param {string}           storeName  대상 스토어 이름
     * @param {'remove'|'clear'} operation  수행할 연산 종류
     * @throws {Error} 권한 부족 시
     */
    function checkDeletePermission(storeName, operation) {
        const policy        = STORE_DELETE_POLICY[storeName] || DEFAULT_DELETE_POLICY;
        const requiredRole  = policy[operation] || 'admin';
        const currentRole   = _currentRole || 'viewer';

        const requiredLevel = ROLE_LEVELS[requiredRole] ?? 4; // 미알려진 → 최고 요구
        const currentLevel  = ROLE_LEVELS[currentRole]  ?? 0; // 미알려진 → 권한 없음

        if (currentLevel < requiredLevel) {
            const opKo = operation === 'clear' ? '전체 초기화' : '단건 삭제';
            throw new Error(
                `[RBAC] 권한 부족 — '${storeName}' ${opKo}에는 ` +
                `'${requiredRole}' 이상 권한이 필요합니다 (현재: '${currentRole}').\n` +
                `DB.setRole('${requiredRole}') 로 권한을 변경하거나 관리자에게 요청하세요.`
            );
        }
    }

    /**
     * 현재 사용자 역할 설정
     * @param {'admin'|'manager'|'operator'|'viewer'} role
     * @throws {Error} 알 수 없는 역할 지정 시
     */
    function setRole(role) {
        if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role)) {
            throw new Error(
                `[RBAC] 알 수 없는 역할: "${role}"\n` +
                `허용 역할: ${Object.keys(ROLE_LEVELS).join(', ')}`
            );
        }
        const prev = _currentRole;
        _currentRole = role;
        console.info(`[RBAC] 역할 변경: '${prev}' → '${role}'`);
    }

    /**
     * 현재 사용자 역할 조회
     * @returns {'admin'|'manager'|'operator'|'viewer'}
     */
    function getRole() {
        return _currentRole;
    }

    // DB 초기화
    async function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            // 15초 안에 DB가 열리지 않으면 강제 종료
            const timeout = setTimeout(() => {
                reject(new Error('DB 연결 시간 초과(15초). 브라우저를 닫고 다시 열어주세요.'));
            }, 15000);

            request.onerror = (event) => {
                clearTimeout(timeout);
                reject(event.target.error);
            };

            // 다른 탭이 구버전 DB를 점유 중일 때 → 즉시 에러 반환
            request.onblocked = () => {
                clearTimeout(timeout);
                console.warn('[DB] 업그레이드 차단됨 — 다른 탭을 모두 닫고 새로고침하세요.');
                reject(new Error('다른 탭이 DB를 사용 중입니다. 모든 탭을 닫고 새로고침 해주세요.'));
            };

            request.onsuccess = () => {
                clearTimeout(timeout);
                db = request.result;
                // 다른 탭에서 버전 업 시 현재 탭 연결 해제 → 자동 새로고침
                db.onversionchange = () => {
                    db.close();
                    db = null;
                    location.reload();
                };
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                const upgradeTx = event.target.transaction;

                // 업그레이드 트랜잭션이 중단될 경우 즉시 에러 반환
                upgradeTx.onabort = () => {
                    clearTimeout(timeout);
                    reject(new Error('DB 업그레이드 중단: ' + (upgradeTx.error?.message || '알 수 없는 오류') + ' — DB 초기화가 필요할 수 있습니다.'));
                };

                // 제품 마스터
                if (!database.objectStoreNames.contains(STORES.PRODUCTS)) {
                    database.createObjectStore(STORES.PRODUCTS, {
                        keyPath: 'id'
                    });
                }

                // 불량 유형 마스터
                if (!database.objectStoreNames.contains(STORES.DEFECT_TYPES)) {
                    database.createObjectStore(STORES.DEFECT_TYPES, {
                        keyPath: 'id'
                    });
                }

                // 도료 마스터
                if (!database.objectStoreNames.contains(STORES.PAINT_MATERIALS)) {
                    database.createObjectStore(STORES.PAINT_MATERIALS, {
                        keyPath: 'id'
                    });
                }

                // 생산 계획 지시서
                if (!database.objectStoreNames.contains(STORES.PRODUCTION_PLANS)) {
                    const store = database.createObjectStore(STORES.PRODUCTION_PLANS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('status', 'status', {
                        unique: false
                    });
                    store.createIndex('productId', 'productId', { unique: false }); // v19
                } else {
                    // v19: 기존 스토어에 productId 인덱스 추가
                    const store = upgradeTx.objectStore(STORES.PRODUCTION_PLANS);
                    if (!store.indexNames.contains('productId')) {
                        store.createIndex('productId', 'productId', { unique: false });
                    }
                }

                // 사출 수입검사
                if (!database.objectStoreNames.contains(STORES.INJECTION_INSPECTIONS)) {
                    const store = database.createObjectStore(STORES.INJECTION_INSPECTIONS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 사출 창고 재고
                if (!database.objectStoreNames.contains(STORES.INJECTION_INVENTORY)) {
                    const store = database.createObjectStore(STORES.INJECTION_INVENTORY, {
                        keyPath: 'id'
                    });
                    store.createIndex('productId', 'productId', { unique: false });
                    store.createIndex('injMaterialId', 'injMaterialId', { unique: false }); // v19
                } else {
                    // v19: 기존 스토어에 injMaterialId 인덱스 추가
                    const store = upgradeTx.objectStore(STORES.INJECTION_INVENTORY);
                    if (!store.indexNames.contains('injMaterialId')) {
                        store.createIndex('injMaterialId', 'injMaterialId', { unique: false });
                    }
                }

                // 도료 수입검사일지
                if (!database.objectStoreNames.contains(STORES.PAINT_INCOMING_INSPECTIONS)) {
                    const store = database.createObjectStore(STORES.PAINT_INCOMING_INSPECTIONS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 도료 창고 재고
                if (!database.objectStoreNames.contains(STORES.PAINT_INVENTORY)) {
                    const store = database.createObjectStore(STORES.PAINT_INVENTORY, {
                        keyPath: 'id'
                    });
                    store.createIndex('materialId', 'materialId', {
                        unique: false
                    });
                }

                // 도장 입고
                if (!database.objectStoreNames.contains(STORES.PAINTING_INCOMING)) {
                    const store = database.createObjectStore(STORES.PAINTING_INCOMING, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 도장 작업일지
                if (!database.objectStoreNames.contains(STORES.PAINTING_WORK)) {
                    const store = database.createObjectStore(STORES.PAINTING_WORK, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 도장 검사 (불량 집계)
                if (!database.objectStoreNames.contains(STORES.PAINTING_INSPECTIONS)) {
                    const store = database.createObjectStore(STORES.PAINTING_INSPECTIONS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('productId', 'productId', {
                        unique: false
                    });
                }

                // 도장품 출고
                if (!database.objectStoreNames.contains(STORES.PAINTING_OUTGOING)) {
                    const store = database.createObjectStore(STORES.PAINTING_OUTGOING, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 출하검사 대기
                if (!database.objectStoreNames.contains(STORES.SHIPPING_STANDBY)) {
                    const store = database.createObjectStore(STORES.SHIPPING_STANDBY, {
                        keyPath: 'id'
                    });
                    store.createIndex('status', 'status', {
                        unique: false
                    });
                }

                // Jig 사용 이력
                if (!database.objectStoreNames.contains(STORES.JIG_USAGE_HISTORY)) {
                    const store = database.createObjectStore(STORES.JIG_USAGE_HISTORY, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('sourceModule', 'sourceModule', {
                        unique: false
                    });
                }

                // 제품 창고 재고
                if (!database.objectStoreNames.contains(STORES.PRODUCT_INVENTORY)) {
                    const store = database.createObjectStore(STORES.PRODUCT_INVENTORY, {
                        keyPath: 'id'
                    });
                    store.createIndex('productId', 'productId', {
                        unique: false
                    });
                }

                // 제품 출고
                if (!database.objectStoreNames.contains(STORES.PRODUCT_OUTGOING)) {
                    const store = database.createObjectStore(STORES.PRODUCT_OUTGOING, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 사출자재 마스터
                if (!database.objectStoreNames.contains(STORES.INJECTION_MATERIALS)) {
                    const store = database.createObjectStore(STORES.INJECTION_MATERIALS, {
                        keyPath: 'id'
                    });
                    store.createIndex('productIds', 'productIds', { unique: false, multiEntry: true }); // v19
                } else {
                    // v19: 기존 스토어에 productIds 인덱스 추가 (multiEntry: array 각 요소로 조회 가능)
                    const store = upgradeTx.objectStore(STORES.INJECTION_MATERIALS);
                    if (!store.indexNames.contains('productIds')) {
                        store.createIndex('productIds', 'productIds', { unique: false, multiEntry: true });
                    }
                }

                // 원재료 마스터 (사내 생산용)
                if (!database.objectStoreNames.contains(STORES.RAW_MATERIALS)) {
                    database.createObjectStore(STORES.RAW_MATERIALS, {
                        keyPath: 'id'
                    });
                }

                // 설정
                if (!database.objectStoreNames.contains(STORES.CONFIG)) {
                    database.createObjectStore(STORES.CONFIG, {
                        keyPath: 'key'
                    });
                }

                // 검사자 관리
                if (!database.objectStoreNames.contains(STORES.INSPECTORS)) {
                    database.createObjectStore(STORES.INSPECTORS, {
                        keyPath: 'id'
                    });
                }

                // 사출 작업일지
                if (!database.objectStoreNames.contains(STORES.INJECTION_WORK_LOG)) {
                    const store = database.createObjectStore(STORES.INJECTION_WORK_LOG, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 레이져 작업일지
                if (!database.objectStoreNames.contains(STORES.LASER_WORK_LOG)) {
                    const store = database.createObjectStore(STORES.LASER_WORK_LOG, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 레이져 검사일지
                if (!database.objectStoreNames.contains(STORES.LASER_INSPECTIONS)) {
                    const store = database.createObjectStore(STORES.LASER_INSPECTIONS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                }

                // 납품 관리
                if (!database.objectStoreNames.contains(STORES.SALES_DELIVERY)) {
                    const store = database.createObjectStore(STORES.SALES_DELIVERY, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('customer', 'customer', {
                        unique: false
                    });
                }

                // 납품 계획
                if (!database.objectStoreNames.contains(STORES.SALES_DELIVERY_PLAN)) {
                    const store = database.createObjectStore(STORES.SALES_DELIVERY_PLAN, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('customer', 'customer', {
                        unique: false
                    });
                    store.createIndex('partName', 'partName', {
                        unique: false
                    });
                }

                // 매입 관리
                if (!database.objectStoreNames.contains(STORES.SALES_PURCHASE)) {
                    const store = database.createObjectStore(STORES.SALES_PURCHASE, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('category', 'category', {
                        unique: false
                    });
                }

                // 외주처 관리
                if (!database.objectStoreNames.contains(STORES.SALES_OUTSOURCING)) {
                    const store = database.createObjectStore(STORES.SALES_OUTSOURCING, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('partner', 'partner', {
                        unique: false
                    });
                }

                // 현장 작업자 (NEW)
                if (!database.objectStoreNames.contains(STORES.OPERATORS)) {
                    const store = database.createObjectStore(STORES.OPERATORS, {
                        keyPath: 'id'
                    });
                    store.createIndex('name', 'name', {
                        unique: false
                    });
                }

                // 작업조건 관리
                if (!database.objectStoreNames.contains(STORES.PROD_CONDITIONS)) {
                    const store = database.createObjectStore(STORES.PROD_CONDITIONS, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('equipment', 'equipment', {
                        unique: false
                    });
                }

                // 초중종물 관리
                if (!database.objectStoreNames.contains(STORES.PROD_QUALITY_CHECK)) {
                    const store = database.createObjectStore(STORES.PROD_QUALITY_CHECK, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('type', 'type', {
                        unique: false
                    });
                }

                // 설비 관리
                if (!database.objectStoreNames.contains(STORES.PROD_EQUIPMENT)) {
                    const store = database.createObjectStore(STORES.PROD_EQUIPMENT, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('equipment', 'equipment', {
                        unique: false
                    });
                }

                // 원재료 재고 (입출고 원장)
                if (!database.objectStoreNames.contains(STORES.RAW_MATERIAL_INVENTORY)) {
                    const store = database.createObjectStore(STORES.RAW_MATERIAL_INVENTORY, {
                        keyPath: 'id'
                    });
                    store.createIndex('date', 'date', {
                        unique: false
                    });
                    store.createIndex('matId', 'matId', {
                        unique: false
                    });
                }

                // 제조 관리 표준
                if (!database.objectStoreNames.contains(STORES.PROD_STANDARDS)) {
                    database.createObjectStore(STORES.PROD_STANDARDS, { keyPath: 'id' });
                }

                // 금형 교체 이력 (v20)
                if (!database.objectStoreNames.contains(STORES.MOLD_CHANGE_LOG)) {
                    const store = database.createObjectStore(STORES.MOLD_CHANGE_LOG, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('machine', 'machine', { unique: false });
                    store.createIndex('plannedDate', 'plannedDate', { unique: false });
                }

                // 원재료 변경 이력 (v20)
                if (!database.objectStoreNames.contains(STORES.RAW_MAT_CHANGE_LOG)) {
                    const store = database.createObjectStore(STORES.RAW_MAT_CHANGE_LOG, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('machine', 'machine', { unique: false });
                    store.createIndex('plannedDate', 'plannedDate', { unique: false });
                }

                // JIG 마스터
                if (!database.objectStoreNames.contains(STORES.JIG_MASTER)) {
                    const store = database.createObjectStore(STORES.JIG_MASTER, { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                }

                // JIG 사용/이력 로그
                if (!database.objectStoreNames.contains(STORES.JIG_LOG)) {
                    const store = database.createObjectStore(STORES.JIG_LOG, { keyPath: 'id' });
                    store.createIndex('jigId', 'jigId', { unique: false });
                    store.createIndex('date',  'date',  { unique: false });
                }

                // ── 설비관리 (v21) ─────────────────────────────────
                if (!database.objectStoreNames.contains(STORES.EQUIP_MASTER)) {
                    const store = database.createObjectStore(STORES.EQUIP_MASTER, { keyPath: 'id' });
                    store.createIndex('line', 'line', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_SPARE)) {
                    const store = database.createObjectStore(STORES.EQUIP_SPARE, { keyPath: 'id' });
                    store.createIndex('equipId', 'equipId', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_CHECK_ITEM)) {
                    const store = database.createObjectStore(STORES.EQUIP_CHECK_ITEM, { keyPath: 'id' });
                    store.createIndex('equipId', 'equipId', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_CHECK_RECORD)) {
                    const store = database.createObjectStore(STORES.EQUIP_CHECK_RECORD, { keyPath: 'id' });
                    store.createIndex('equipId', 'equipId', { unique: false });
                    store.createIndex('date',    'date',    { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_ISSUE)) {
                    const store = database.createObjectStore(STORES.EQUIP_ISSUE, { keyPath: 'id' });
                    store.createIndex('equipId', 'equipId', { unique: false });
                    store.createIndex('date',    'date',    { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_DOWNTIME)) {
                    const store = database.createObjectStore(STORES.EQUIP_DOWNTIME, { keyPath: 'id' });
                    store.createIndex('equipId', 'equipId', { unique: false });
                    store.createIndex('date',    'date',    { unique: false });
                }

                // ── SQ 점검관리 (v22) ──────────────────────────────
                if (!database.objectStoreNames.contains(STORES.EQUIP_SQ_STD)) {
                    const store = database.createObjectStore(STORES.EQUIP_SQ_STD, { keyPath: 'id' });
                    store.createIndex('lineCategory', 'lineCategory', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_SQ_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_SQ_LOG, { keyPath: 'id' });
                    store.createIndex('lineCategory', 'lineCategory', { unique: false });
                    store.createIndex('date',         'date',         { unique: false });
                }

                // ── 조도 점검관리 (v25) ───────────────────────────
                if (!database.objectStoreNames.contains(STORES.EQUIP_ILLUMINATION_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_ILLUMINATION_LOG, { keyPath: 'id' });
                    store.createIndex('year',     'year',     { unique: false });
                    store.createIndex('date',     'date',     { unique: false });
                    store.createIndex('pointKey', 'pointKey', { unique: false });
                }

                // ── 컨베이어 규정 속도 설정 (v27) ────────────────
                if (!database.objectStoreNames.contains(STORES.EQUIP_CONVEYOR_STD)) {
                    const store = database.createObjectStore(STORES.EQUIP_CONVEYOR_STD, { keyPath: 'id' });
                    store.createIndex('line', 'line', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_FPROOF_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_FPROOF_LOG, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('itemKey', 'itemKey', { unique: false });
                    store.createIndex('yearMonth', 'yearMonth', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_AIR_FILTER_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_AIR_FILTER_LOG, { keyPath: 'id' });
                    store.createIndex('year', 'year', { unique: false });
                    store.createIndex('month', 'month', { unique: false });
                    store.createIndex('filterKey', 'filterKey', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_SUPPLY_FILTER_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_SUPPLY_FILTER_LOG, { keyPath: 'id' });
                    store.createIndex('year', 'year', { unique: false });
                    store.createIndex('month', 'month', { unique: false });
                    store.createIndex('filterKey', 'filterKey', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.EQUIP_DRYER_CLEAN_LOG)) {
                    const store = database.createObjectStore(STORES.EQUIP_DRYER_CLEAN_LOG, { keyPath: 'id' });
                    store.createIndex('year', 'year', { unique: false });
                    store.createIndex('month', 'month', { unique: false });
                    store.createIndex('cleanKey', 'cleanKey', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                }

                // ── SPC 관리 (v23) ─────────────────────────────────
                if (!database.objectStoreNames.contains(STORES.PROD_SPC_DATA)) {
                    const store = database.createObjectStore(STORES.PROD_SPC_DATA, { keyPath: 'id' });
                    store.createIndex('date',     'date',     { unique: false });
                    store.createIndex('carModel', 'carModel', { unique: false });
                    store.createIndex('item',     'item',     { unique: false });
                }

                // ── 부자재 관리 (v24) ──────────────────────────────
                if (!database.objectStoreNames.contains(STORES.PROD_SUB_MATERIALS)) {
                    const store = database.createObjectStore(STORES.PROD_SUB_MATERIALS, { keyPath: 'id' });
                    store.createIndex('date',     'date',     { unique: false });
                    store.createIndex('itemName', 'itemName', { unique: false });
                    store.createIndex('partName', 'partName', { unique: false });
                    store.createIndex('lotNo',    'lotNo',    { unique: false });
                }

                // ── 품질 실적관리 (v26) ───────────────────────────
                if (!database.objectStoreNames.contains(STORES.PROD_QUALITY_PERFORMANCE)) {
                    const store = database.createObjectStore(STORES.PROD_QUALITY_PERFORMANCE, { keyPath: 'id' });
                    store.createIndex('date',       'date',       { unique: false });
                    store.createIndex('year',       'year',       { unique: false });
                    store.createIndex('month',      'month',      { unique: false });
                    store.createIndex('category',   'category',   { unique: false });
                    store.createIndex('process',    'process',    { unique: false });
                    store.createIndex('line',       'line',       { unique: false });
                    store.createIndex('partName',   'partName',   { unique: false });
                    store.createIndex('defectType', 'defectType', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.PROD_LIMIT_SAMPLES)) {
                    const store = database.createObjectStore(STORES.PROD_LIMIT_SAMPLES, { keyPath: 'id' });
                    store.createIndex('ledgerType', 'ledgerType', { unique: false });
                    store.createIndex('carModel',   'carModel',   { unique: false });
                    store.createIndex('partName',   'partName',   { unique: false });
                    store.createIndex('sampleNo',   'sampleNo',   { unique: false });
                    store.createIndex('status',     'status',     { unique: false });
                    store.createIndex('date',       'date',       { unique: false });
                }

                // ── 3정5S 관리 (v25) ───────────────────────────────
                if (!database.objectStoreNames.contains(STORES.S5_INSPECTIONS)) {
                    const store = database.createObjectStore(STORES.S5_INSPECTIONS, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('area', 'area', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.S5_ISSUES)) {
                    const store = database.createObjectStore(STORES.S5_ISSUES, { keyPath: 'id' });
                    store.createIndex('date',   'date',   { unique: false });
                    store.createIndex('area',   'area',   { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                }

                // ── 도료 배합 관리 기준표 (v28) ──────────────────────
                if (!database.objectStoreNames.contains(STORES.PAINT_USAGE_STD)) {
                    const store = database.createObjectStore(STORES.PAINT_USAGE_STD, { keyPath: 'id' });
                    store.createIndex('carModel',  'carModel',  { unique: false });
                    store.createIndex('paintType', 'paintType', { unique: false });
                }
                if (!database.objectStoreNames.contains(STORES.PAINT_MIX_STD)) {
                    const store = database.createObjectStore(STORES.PAINT_MIX_STD, { keyPath: 'id' });
                    store.createIndex('carModel',  'carModel',  { unique: false });
                    store.createIndex('paintType', 'paintType', { unique: false });
                }

                // ── 작업 표준서 (v32) ─────────────────────────────────
                if (!database.objectStoreNames.contains(STORES.WORK_STANDARDS)) {
                    const store = database.createObjectStore(STORES.WORK_STANDARDS, { keyPath: 'id' });
                    store.createIndex('processNo',   'processNo',   { unique: false });
                    store.createIndex('processName', 'processName', { unique: false });
                    store.createIndex('model',       'model',       { unique: false });
                }

                // ── 사출 수입검사 기준 사진 (v34) ─────────────────────
                if (!database.objectStoreNames.contains(STORES.INJ_INSP_STANDARDS)) {
                    const store = database.createObjectStore(STORES.INJ_INSP_STANDARDS, { keyPath: 'id' });
                    store.createIndex('carModel',  'carModel',  { unique: false });
                    store.createIndex('partName',  'partName',  { unique: false });
                    store.createIndex('photoType', 'photoType', { unique: false });
                }

                // ── 사출컬러 기준서 파일 이력 (v36) ───────────────────
                if (!database.objectStoreNames.contains(STORES.INJECT_COLOR_STD)) {
                    const store = database.createObjectStore(STORES.INJECT_COLOR_STD, { keyPath: 'id' });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                }

                // ── 사출컬러 기준서 편집 데이터 (v37) ─────────────────
                if (!database.objectStoreNames.contains(STORES.INJECT_COLOR_STD_DATA)) {
                    database.createObjectStore(STORES.INJECT_COLOR_STD_DATA, { keyPath: 'id' });
                }

                // ── 파지 기준서 편집 데이터 (v38) ──────────────────────
                if (!database.objectStoreNames.contains(STORES.PAJI_STD_DATA)) {
                    database.createObjectStore(STORES.PAJI_STD_DATA, { keyPath: 'id' });
                }

                // ── 세척 소모품 교체관리 기준서 (v39) ──────────────────
                if (!database.objectStoreNames.contains(STORES.WASH_CONSUMABLE_DATA)) {
                    database.createObjectStore(STORES.WASH_CONSUMABLE_DATA, { keyPath: 'id' });
                }

                // ── 교반시간 작업기준서 (v40) ───────────────────────────
                if (!database.objectStoreNames.contains(STORES.AGIT_STD_DATA)) {
                    database.createObjectStore(STORES.AGIT_STD_DATA, { keyPath: 'id' });
                }

                // ── 잔여도료 포장방법 작업기준서 (v41) ──────────────────
                if (!database.objectStoreNames.contains(STORES.REMAIN_PAINT_DATA)) {
                    database.createObjectStore(STORES.REMAIN_PAINT_DATA, { keyPath: 'id' });
                }
            };
        });
    }

    // DB 연결 보장
    async function ensureDB() {
        if (!db) {
            await init();
        }
    }

    // --- 범용 CRUD ---
    async function getAll(storeName) {
        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function getById(storeName, id) {
        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function save(storeName, data) {
        // ── 유효성 검사 (스키마 정의된 스토어만, 동기 실행) ────────
        validate(storeName, data);

        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveAll(storeName, dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        // ── 유효성 검사: 전체 배열을 먼저 검사 후 DB 열기 ──────────
        // (일부만 저장된 불완전 상태 방지)
        dataArray.forEach((item, i) => {
            try {
                validate(storeName, item);
            } catch (e) {
                throw new Error(`[saveAll:${storeName}] 항목 #${i} 유효성 오류: ${e.message}`);
            }
        });

        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            dataArray.forEach(data => store.put(data));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function remove(storeName, id) {
        // ── 권한 검사 (동기, DB 열기 전 빠른 실패) ──────────────────
        checkDeletePermission(storeName, 'remove');

        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function clear(storeName) {
        // ── 권한 검사 (동기, DB 열기 전 빠른 실패) ──────────────────
        checkDeletePermission(storeName, 'clear');

        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 인덱스 조회
    async function getByIndex(storeName, indexName, value) {
        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // 설정 전용
    async function getConfig(key) {
        await ensureDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.CONFIG, 'readonly');
            const store = tx.objectStore(STORES.CONFIG);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    async function setConfig(key, value) {
        await save(STORES.CONFIG, {
            key,
            value
        });
    }

    /**
     * 여러 스토어를 단일 IDB 트랜잭션으로 원자적 처리
     *
     * 모든 작업이 성공해야 커밋되며, 하나라도 실패하면 전체 롤백.
     *
     * operations 배열 항목 형식:
     *   { store: string, op: 'put',    data: object }  ← 추가/수정 (upsert)
     *   { store: string, op: 'delete', id:   string }  ← 단건 삭제
     *   { store: string, op: 'clear'                }  ← 스토어 전체 초기화
     *
     * @param  {Array<{store:string, op:string, data?:object, id?:string}>} operations
     * @returns {Promise<Array>}  각 작업 결과 배열 (put→key, delete/clear→undefined)
     *
     * @example
     *   await DB.executeTransaction([
     *     { store: DB.STORES.INJECTION_INVENTORY,  op: 'put',    data: inventoryItem },
     *     { store: DB.STORES.PRODUCTION_PLANS,     op: 'put',    data: updatedPlan   },
     *     { store: DB.STORES.INJECTION_INSPECTIONS, op: 'delete', id: oldInspId      },
     *   ]);
     */
    async function executeTransaction(operations) {
        if (!Array.isArray(operations) || operations.length === 0) return [];
        await ensureDB();

        return new Promise((resolve, reject) => {
            // ── 관련 스토어 목록 추출 (중복 제거) ─────────────────────
            const storeNames = [...new Set(operations.map(op => op.store))];

            // 존재하지 않는 스토어 사전 검증 (트랜잭션 생성 전 빠른 실패)
            for (const name of storeNames) {
                if (!db.objectStoreNames.contains(name)) {
                    return reject(new Error(
                        `[executeTransaction] 알 수 없는 스토어: "${name}"\n` +
                        `사용 가능한 스토어: ${[...db.objectStoreNames].join(', ')}`
                    ));
                }
            }

            // ── 트랜잭션 생성 ────────────────────────────────────────
            let tx;
            try {
                tx = db.transaction(storeNames, 'readwrite');
            } catch (e) {
                return reject(new Error(`[executeTransaction] 트랜잭션 생성 실패: ${e.message}`));
            }

            const results = new Array(operations.length).fill(undefined);

            tx.oncomplete = () => resolve(results);
            tx.onerror    = () => reject(new Error(
                `[executeTransaction] 트랜잭션 오류: ${tx.error?.message || '알 수 없음'}`
            ));
            tx.onabort    = () => reject(new Error(
                `[executeTransaction] 트랜잭션 중단: ${tx.error?.message || '알 수 없음'}`
            ));

            // ── 각 작업 실행 ─────────────────────────────────────────
            for (let i = 0; i < operations.length; i++) {
                const { store: storeName, op, data, id } = operations[i];
                const objectStore = tx.objectStore(storeName);
                let req;

                try {
                    switch (op) {
                        case 'put':
                            if (!data || typeof data !== 'object') {
                                tx.abort();
                                return reject(new Error(
                                    `[executeTransaction] 'put' 작업 #${i}에 data 객체 필요 (store: ${storeName})`
                                ));
                            }
                            // ── 유효성 검사 ────────────────────────────────────
                            try { validate(storeName, data); }
                            catch (e) {
                                tx.abort();
                                return reject(new Error(
                                    `[executeTransaction] 작업 #${i} 유효성 오류: ${e.message}`
                                ));
                            }
                            req = objectStore.put(data);
                            break;

                        case 'delete':
                            if (id === undefined || id === null) {
                                tx.abort();
                                return reject(new Error(
                                    `[executeTransaction] 'delete' 작업 #${i}에 id 필요 (store: ${storeName})`
                                ));
                            }
                            // ── 권한 검사 ────────────────────────────────────
                            try { checkDeletePermission(storeName, 'remove'); }
                            catch (e) {
                                tx.abort();
                                return reject(new Error(
                                    `[executeTransaction] 작업 #${i} 권한 오류: ${e.message}`
                                ));
                            }
                            req = objectStore.delete(id);
                            break;

                        case 'clear':
                            // ── 권한 검사 ────────────────────────────────────
                            try { checkDeletePermission(storeName, 'clear'); }
                            catch (e) {
                                tx.abort();
                                return reject(new Error(
                                    `[executeTransaction] 작업 #${i} 권한 오류: ${e.message}`
                                ));
                            }
                            req = objectStore.clear();
                            break;

                        default:
                            tx.abort();
                            return reject(new Error(
                                `[executeTransaction] 지원하지 않는 op: "${op}" (작업 #${i})\n` +
                                `지원 op: 'put' | 'delete' | 'clear'`
                            ));
                    }
                } catch (e) {
                    tx.abort();
                    return reject(new Error(
                        `[executeTransaction] 작업 #${i} 실행 오류 (store: ${storeName}, op: ${op}): ${e.message}`
                    ));
                }

                // 인덱스를 클로저로 캡처해 비동기 콜백에서 올바른 위치에 저장
                (function capture(idx, r) {
                    r.onsuccess = () => { results[idx] = r.result; };
                    r.onerror   = () => {
                        // 개별 요청 오류 → tx.onerror 가 처리하지만 즉시 로그
                        console.error(`[executeTransaction] 요청 오류 (idx=${idx}, store=${storeName}):`, r.error);
                    };
                })(i, req);
            }
        });
    }

    /**
     * 페이징·정렬 공통 헬퍼 (getAll / getAllPaged 내부 공유)
     *
     * @param {Array}  all                    원본 데이터 배열
     * @param {object} [options]
     * @param {number}  [options.page=1]       조회 페이지 (1-based)
     * @param {number}  [options.pageSize=50]  페이지당 최대 항목 수
     * @param {object}  [options.sort]         정렬 옵션
     * @param {string}   options.sort.field    정렬 기준 필드명
     * @param {'asc'|'desc'} [options.sort.order='asc'] 정렬 방향
     * @returns {{ data:Array, total:number, page:number, pageSize:number, totalPages:number }}
     */
    function _applyPaging(all, { page = 1, pageSize = 50, sort = null } = {}) {
        let arr = sort
            ? [...all].sort((a, b) => {
                const av = a[sort.field] ?? '';
                const bv = b[sort.field] ?? '';
                const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                return sort.order === 'desc' ? -cmp : cmp;
            })
            : all;

        const total      = arr.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage   = Math.min(Math.max(1, page), totalPages);
        const start      = (safePage - 1) * pageSize;

        return {
            data:       arr.slice(start, start + pageSize),
            total,
            page:       safePage,
            pageSize,
            totalPages
        };
    }

    /**
     * 페이징된 데이터 조회 (IDB 레이어)
     *
     * 기존 getAll()은 그대로 유지 — 이 함수는 대용량 스토어의 UI 테이블 렌더링에 사용
     *
     * @param {string} storeName
     * @param {object} [options]
     * @param {number}  [options.page=1]
     * @param {number}  [options.pageSize=50]
     * @param {object}  [options.sort]
     * @param {string}   options.sort.field
     * @param {'asc'|'desc'} [options.sort.order='asc']
     * @returns {Promise<{data:Array, total:number, page:number, pageSize:number, totalPages:number}>}
     *
     * @example
     *   const { data, total, page, totalPages } = await DB.getAllPaged(
     *     DB.STORES.PAINT_INVENTORY,
     *     { page: 2, pageSize: 50, sort: { field: 'date', order: 'desc' } }
     *   );
     */
    async function getAllPaged(storeName, options = {}) {
        await ensureDB();
        const all = await new Promise((resolve, reject) => {
            const tx  = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        });
        return _applyPaging(all, options);
    }

    // DB 전체 삭제 (손상/잠금 상태 복구용)
    function deleteDatabase() {
        return new Promise((resolve, reject) => {
            if (db) {
                db.close();
                db = null;
            }
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            // 다른 연결이 있어도 강제 진행
            req.onblocked = () => resolve();
        });
    }

    return {
        init,
        STORES,
        getAll,
        getById,
        save,
        saveAll,
        remove,
        clear,
        getByIndex,
        getConfig,
        setConfig,
        deleteDatabase,
        executeTransaction,
        SCHEMAS,    // 스키마 정의 (외부 참조·테스트용)
        validate,   // 유효성 검사 함수 (외부 직접 호출용)
        ROLES,                  // 역할 상수 { ADMIN, MANAGER, OPERATOR, VIEWER }
        setRole,                // 현재 역할 변경
        getRole,                // 현재 역할 조회
        STORE_DELETE_POLICY,    // 스토어별 삭제 권한 정책 (외부 참조용)
        getAllPaged              // 페이징 조회
    };
})();
