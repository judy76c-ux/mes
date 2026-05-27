/**
 * 생산 관리 모듈 (작업조건 관리, 초중종물 관리, 설비관리)
 */

const ProdUtils = {
    renderMain(container, title, desc, onAdd, onExport, filterHTML, tableID, headers) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="${onAdd}">
                            <span class="material-symbols-outlined">add</span> 등록
                        </button>
                    </div>
                </div>

                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    ${filterHTML}
                </div>

                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        ${headers.map(h => `<th>${h}</th>`).join('')}
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="${tableID}Body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

/**
 * 0) 제조 관리 표준 (ProdStandardsModule)
 * 공정별 탭 + 차종/품목별 파라미터 값 입력
 */
var ProdStandardsModule = (function() {
    const STORE = DB.STORES.PROD_STANDARDS;

    // ── 공정/세부공정/파라미터 정의 ──────────────────────────────
    // ── 공정 설정 ─────────────────────────────────────────────────
    // itemType: 'prod' → 관리항목-제품 컬럼 / 'proc' → 관리항목-공정 컬럼
    // spec / method / cycle / special : 관리계획서 기본값 (저장값 없을 때 표시)
    const PROCESS_CONFIG = {

        // ══ 공정번호 10 ══════════════════════════════════════════════
        '수입검사': {
            icon: 'fact_check', color: 'var(--accent-blue)',
            procNo: 10,
            stationNos: { '도료 입고': 10, '사출소재 입고': 10 },
            stations: {
                '도료 입고': [
                    { key:'di_cond',   label:'용기상태',     itemType:'prod', unit:'-',     special:'',  spec:'외형의 부식 및 훼손 등의 결함이 없을 것',                             method:'육안',              cycle:''       },
                    { key:'di_lotno',  label:'Lot No 확인',  itemType:'prod', unit:'-',     special:'',  spec:'성적서와 라벨의 Lot No가 같을 것',                                    method:'육안',              cycle:''       },
                    { key:'di_expiry', label:'유효기간',     itemType:'prod', unit:'개월',  special:'',  spec:'유효기간 12개월 이내일 것',                                           method:'육안',              cycle:''       },
                    { key:'di_cert',   label:'성적서',       itemType:'prod', unit:'-',     special:'',  spec:'성적서 수령 (M/SHEET, 시험결과 이상없을 것)',                         method:'육안',              cycle:''       },
                    { key:'di_color',  label:'색상',         itemType:'prod', unit:'-',     special:'△', spec:'도료 LOT 변경시 기준 시편대비 이색감 없을 것. LOT별 COLOR 편차 없을 것.', method:'육안, 색차계',   cycle:''       },
                    { key:'di_temp',   label:'보관온도',     itemType:'prod', unit:'℃',    special:'',  spec:'10~30℃',                                                              method:'온도계',            cycle:'2회/일' },
                ],
                '사출소재 입고': [
                    { key:'si_mat',    label:'재질',          itemType:'prod', unit:'-',     special:'',  spec:'PC',                                                                  method:'M/SHEET',                   cycle:'1회/6개월' },
                    { key:'si_app',    label:'외관',          itemType:'prod', unit:'-',     special:'',  spec:'BURR, SINK MARK 및 유해한 흠이 없을 것. 외관 긁힘이 없을 것. LASER CUTTING 흠이 없을 것.', method:'육안',  cycle:'10EA/LOT'  },
                    { key:'si_dim',    label:'치수',          itemType:'prod', unit:'mm',    special:'◎', spec:'① 18.1+0,-0.25㎜  ② 22.1+0,-0.2㎜',                                 method:'V/C',                       cycle:'5EA/LOT'   },
                    { key:'si_match',  label:'MATCHING 결합', itemType:'prod', unit:'-',     special:'',  spec:'SWITCH와 COVER간 유동 및 간섭이 없을 것',                             method:'조립상대물(마스터 샘플)',    cycle:'5EA/LOT'   },
                    { key:'si_pack',   label:'포장상태',      itemType:'prod', unit:'-',     special:'',  spec:'포장 BOX 내부 오염 없을 것. 포장용기 수량 이상 없을 것.',              method:'육안',                      cycle:'3Box/LOT'  },
                ],
            }
        },

        // ══ 공정번호 20 ══════════════════════════════════════════════
        '보관': {
            icon: 'warehouse', color: 'var(--accent-teal, #0d9488)',
            procNo: 20,
            stationNos: { '도료창고 (위험물)': 20, '사출 창고': 20 },
            stations: {
                '도료창고 (위험물)': [
                    { key:'dc_temp',   label:'보관온도',   itemType:'proc', unit:'℃', special:'',  spec:'10~30℃',               method:'온도계',    cycle:'2회/일' },
                    { key:'dc_fifo',   label:'선입선출',   itemType:'proc', unit:'-',  special:'',  spec:'제조순으로 선입선출이 이루어질 것', method:'유효라벨', cycle:'1회'    },
                ],
                '사출 창고': [
                    { key:'sc_temp',   label:'보관온도',       itemType:'proc', unit:'℃', special:'',  spec:'',  method:'온도계', cycle:''     },
                    { key:'sc_fifo',   label:'선입선출',       itemType:'proc', unit:'-',  special:'',  spec:'제조순으로 선입선출이 이루어질 것', method:'육안', cycle:'' },
                    { key:'sc_stack',  label:'적재 높이',      itemType:'proc', unit:'단', special:'',  spec:'',  method:'육안',   cycle:''     },
                    { key:'sc_period', label:'최대 보관 기간', itemType:'proc', unit:'일', special:'',  spec:'',  method:'육안',   cycle:''     },
                ],
            }
        },

        // ══ 공정번호 30~120 (도장(A) 세부공정) ════════════════════════
        '도장(A)': {
            icon: 'format_paint', color: 'var(--accent-orange)',
            procNo: 30,   // 대표번호 (로딩 기준)
            storeLine: 'A라인',
            // 도장 세부공정별 공정번호 (관리계획서 기준)
            stationNos: {
                '로딩':       30,
                '세척':       40,
                '제전':       50,
                '배합':       60,
                '하도 공급':  60,
                '상도 공급':  60,
                '하도 스프레이': 70,
                '상도 스프레이': 70,
                '건조':      100,
                '언로딩':    110,
                '포장':      110,
                '도장 검사': 120,
            },
            stations: {
                '로딩': [
                    { key:'ld_press',  label:'컨베이어압력',    itemType:'proc', unit:'MPa',       special:'',  spec:'0.4~0.6 Mpa',                              method:'압력게이지',  cycle:'1회/일'  },
                    { key:'ld_speed',  label:'컨베이어속도',    itemType:'proc', unit:'RPM',       special:'',  spec:'490 (±30) RPM  〈컨베이어 속도 기준서〉',  method:'육안',        cycle:'2회/일'  },
                    { key:'ld_cover',  label:'봉커버/체인오염', itemType:'proc', unit:'-',         special:'',  spec:'봉커버 / 컨베이어오염 상태 확인',          method:'육안',        cycle:'2회/일'  },
                    { key:'ld_jig',    label:'JIG 수명',        itemType:'proc', unit:'-',         special:'',  spec:'JIG 교체주기 준수 〈JIG 관리대장 준한 것〉',method:'육안',        cycle:'1회/LOT' },
                    { key:'ld_grip',   label:'파지 위치',       itemType:'proc', unit:'-',         special:'',  spec:'〈제품 파지 작업기준서〉 도장면에 접촉을 최소화 할 것.', method:'육안', cycle:'1회/LOT' },
                    { key:'ld_glove',  label:'장갑 교환',       itemType:'proc', unit:'-',         special:'',  spec:'적절 용도 장갑사용 및 오염 교체',          method:'육안',        cycle:''        },
                ],
                '세척': [
                    { key:'wsh_temp',  label:'세척 온도',   itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계',  cycle:'' },
                    { key:'wsh_time',  label:'세척 시간',   itemType:'proc', unit:'sec', special:'',  spec:'',  method:'타이머',  cycle:'' },
                    { key:'wsh_conc',  label:'세척제 농도', itemType:'proc', unit:'%',   special:'',  spec:'',  method:'농도계',  cycle:'' },
                ],
                '제전': [
                    { key:'ion_volt',  label:'제전기 전압', itemType:'proc', unit:'kV',      special:'',  spec:'',  method:'전압계',     cycle:'' },
                    { key:'ion_air',   label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'',  spec:'',  method:'압력게이지', cycle:'' },
                ],
                '배합': [
                    { key:'mix_main',  label:'주제 비율',   itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_hard',  label:'경화제 비율', itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_thin',  label:'희석제 비율', itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_visc',  label:'점도',        itemType:'proc', unit:'sec', special:'',  spec:'',  method:'포드컵',  cycle:'' },
                ],
                '하도 공급': [
                    { key:'ls_press',  label:'공급 압력', itemType:'proc', unit:'MPa',    special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ls_flow',   label:'유량',      itemType:'proc', unit:'cc/min', special:'', spec:'', method:'유량계',     cycle:'' },
                    { key:'ls_visc',   label:'점도',      itemType:'proc', unit:'sec',    special:'', spec:'', method:'포드컵',     cycle:'' },
                ],
                '상도 공급': [
                    { key:'us_press',  label:'공급 압력', itemType:'proc', unit:'MPa',    special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'us_flow',   label:'유량',      itemType:'proc', unit:'cc/min', special:'', spec:'', method:'유량계',     cycle:'' },
                    { key:'us_visc',   label:'점도',      itemType:'proc', unit:'sec',    special:'', spec:'', method:'포드컵',     cycle:'' },
                ],
                '하도 스프레이': [
                    { key:'hs_dis',    label:'토출량',      itemType:'proc', unit:'cc/min',  special:'', spec:'', method:'중량법',     cycle:'' },
                    { key:'hs_pat',    label:'패턴 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'hs_air',    label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'hs_rpm',    label:'스핀들 RPM',  itemType:'proc', unit:'rpm',     special:'', spec:'', method:'타코미터',   cycle:'' },
                    { key:'hs_app',    label:'외관',        itemType:'prod', unit:'-',       special:'', spec:'', method:'육안',       cycle:'' },
                ],
                '상도 스프레이': [
                    { key:'ss_dis',    label:'토출량',      itemType:'proc', unit:'cc/min',  special:'', spec:'', method:'중량법',     cycle:'' },
                    { key:'ss_pat',    label:'패턴 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ss_air',    label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ss_rpm',    label:'스핀들 RPM',  itemType:'proc', unit:'rpm',     special:'', spec:'', method:'타코미터',   cycle:'' },
                    { key:'ss_app',    label:'외관',        itemType:'prod', unit:'-',       special:'', spec:'', method:'육안',       cycle:'' },
                ],
                '건조': [
                    { key:'ov_z1',     label:'Zone 1 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z2',     label:'Zone 2 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z3',     label:'Zone 3 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z4',     label:'Zone 4 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z5',     label:'Zone 5 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z6',     label:'Zone 6 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z7',     label:'Zone 7 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z8',     label:'Zone 8 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_time',   label:'건조 시간',   itemType:'proc', unit:'min', special:'',  spec:'',  method:'타이머', cycle:'' },
                ],
                '언로딩': [
                    { key:'ul_speed',  label:'컨베이어 속도', itemType:'proc', unit:'Hz',  special:'',  spec:'',  method:'육안',   cycle:'' },
                    { key:'ul_cool',   label:'냉각 시간',     itemType:'proc', unit:'min', special:'',  spec:'',  method:'타이머', cycle:'' },
                ],
                '도장 검사': [
                    { key:'ins_app',   label:'외관',      itemType:'prod', unit:'-',   special:'',  spec:'',  method:'육안',     cycle:'' },
                    { key:'ins_thick', label:'도막 두께', itemType:'prod', unit:'μm',  special:'',  spec:'',  method:'도막 두께계', cycle:'' },
                    { key:'ins_adh',   label:'밀착력',    itemType:'prod', unit:'등급',special:'',  spec:'',  method:'크로스컷', cycle:'' },
                ],
                '포장': [
                    { key:'pk_app',    label:'외관',      itemType:'prod', unit:'-', special:'', spec:'', method:'육안', cycle:'' },
                    { key:'pk_qty',    label:'수량',      itemType:'prod', unit:'EA',special:'', spec:'', method:'육안', cycle:'' },
                    { key:'pk_label',  label:'라벨',      itemType:'prod', unit:'-', special:'', spec:'', method:'육안', cycle:'' },
                ],
            }
        },

        // ══ 공정번호 31~120 (도장(B) 세부공정) ════════════════════════
        '도장(B)': {
            icon: 'format_paint', color: '#d97706',
            procNo: 31,   // 대표번호 (로딩 기준)
            storeLine: 'B라인',
            // 도장 세부공정별 공정번호 (관리계획서 기준)
            stationNos: {
                '로딩':       30,
                '세척':       40,
                '제전':       50,
                '배합':       60,
                '하도 공급':  60,
                '상도 공급':  60,
                '하도 스프레이': 70,
                '상도 스프레이': 70,
                '건조':      100,
                '언로딩':    110,
                '포장':      110,
                '도장 검사': 120,
            },
            stations: {
                '로딩': [
                    { key:'ld_press',  label:'컨베이어압력',    itemType:'proc', unit:'MPa',       special:'',  spec:'0.4~0.6 Mpa',                              method:'압력게이지',  cycle:'1회/일'  },
                    { key:'ld_speed',  label:'컨베이어속도',    itemType:'proc', unit:'RPM',       special:'',  spec:'490 (±30) RPM  〈컨베이어 속도 기준서〉',  method:'육안',        cycle:'2회/일'  },
                    { key:'ld_cover',  label:'봉커버/체인오염', itemType:'proc', unit:'-',         special:'',  spec:'봉커버 / 컨베이어오염 상태 확인',          method:'육안',        cycle:'2회/일'  },
                    { key:'ld_jig',    label:'JIG 수명',        itemType:'proc', unit:'-',         special:'',  spec:'JIG 교체주기 준수 〈JIG 관리대장 준한 것〉',method:'육안',        cycle:'1회/LOT' },
                    { key:'ld_grip',   label:'파지 위치',       itemType:'proc', unit:'-',         special:'',  spec:'〈제품 파지 작업기준서〉 도장면에 접촉을 최소화 할 것.', method:'육안', cycle:'1회/LOT' },
                    { key:'ld_glove',  label:'장갑 교환',       itemType:'proc', unit:'-',         special:'',  spec:'적절 용도 장갑사용 및 오염 교체',          method:'육안',        cycle:''        },
                ],
                '세척': [
                    { key:'wsh_temp',  label:'세척 온도',   itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계',  cycle:'' },
                    { key:'wsh_time',  label:'세척 시간',   itemType:'proc', unit:'sec', special:'',  spec:'',  method:'타이머',  cycle:'' },
                    { key:'wsh_conc',  label:'세척제 농도', itemType:'proc', unit:'%',   special:'',  spec:'',  method:'농도계',  cycle:'' },
                ],
                '제전': [
                    { key:'ion_volt',  label:'제전기 전압', itemType:'proc', unit:'kV',      special:'',  spec:'',  method:'전압계',     cycle:'' },
                    { key:'ion_air',   label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'',  spec:'',  method:'압력게이지', cycle:'' },
                ],
                '배합': [
                    { key:'mix_main',  label:'주제 비율',   itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_hard',  label:'경화제 비율', itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_thin',  label:'희석제 비율', itemType:'proc', unit:'wt%', special:'',  spec:'',  method:'중량계',  cycle:'' },
                    { key:'mix_visc',  label:'점도',        itemType:'proc', unit:'sec', special:'',  spec:'',  method:'포드컵',  cycle:'' },
                ],
                '하도 공급': [
                    { key:'ls_press',  label:'공급 압력', itemType:'proc', unit:'MPa',    special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ls_flow',   label:'유량',      itemType:'proc', unit:'cc/min', special:'', spec:'', method:'유량계',     cycle:'' },
                    { key:'ls_visc',   label:'점도',      itemType:'proc', unit:'sec',    special:'', spec:'', method:'포드컵',     cycle:'' },
                ],
                '상도 공급': [
                    { key:'us_press',  label:'공급 압력', itemType:'proc', unit:'MPa',    special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'us_flow',   label:'유량',      itemType:'proc', unit:'cc/min', special:'', spec:'', method:'유량계',     cycle:'' },
                    { key:'us_visc',   label:'점도',      itemType:'proc', unit:'sec',    special:'', spec:'', method:'포드컵',     cycle:'' },
                ],
                '하도 스프레이': [
                    { key:'hs_dis',    label:'토출량',      itemType:'proc', unit:'cc/min',  special:'', spec:'', method:'중량법',     cycle:'' },
                    { key:'hs_pat',    label:'패턴 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'hs_air',    label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'hs_rpm',    label:'스핀들 RPM',  itemType:'proc', unit:'rpm',     special:'', spec:'', method:'타코미터',   cycle:'' },
                    { key:'hs_app',    label:'외관',        itemType:'prod', unit:'-',       special:'', spec:'', method:'육안',       cycle:'' },
                ],
                '상도 스프레이': [
                    { key:'ss_dis',    label:'토출량',      itemType:'proc', unit:'cc/min',  special:'', spec:'', method:'중량법',     cycle:'' },
                    { key:'ss_pat',    label:'패턴 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ss_air',    label:'에어 압력',   itemType:'proc', unit:'kgf/cm²', special:'', spec:'', method:'압력게이지', cycle:'' },
                    { key:'ss_rpm',    label:'스핀들 RPM',  itemType:'proc', unit:'rpm',     special:'', spec:'', method:'타코미터',   cycle:'' },
                    { key:'ss_app',    label:'외관',        itemType:'prod', unit:'-',       special:'', spec:'', method:'육안',       cycle:'' },
                ],
                '건조': [
                    { key:'ov_z1',     label:'Zone 1 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z2',     label:'Zone 2 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z3',     label:'Zone 3 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z4',     label:'Zone 4 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z5',     label:'Zone 5 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z6',     label:'Zone 6 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z7',     label:'Zone 7 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_z8',     label:'Zone 8 온도', itemType:'proc', unit:'℃',  special:'',  spec:'',  method:'온도계', cycle:'' },
                    { key:'ov_time',   label:'건조 시간',   itemType:'proc', unit:'min', special:'',  spec:'',  method:'타이머', cycle:'' },
                ],
                '언로딩': [
                    { key:'ul_speed',  label:'컨베이어 속도', itemType:'proc', unit:'Hz',  special:'',  spec:'',  method:'육안',   cycle:'' },
                    { key:'ul_cool',   label:'냉각 시간',     itemType:'proc', unit:'min', special:'',  spec:'',  method:'타이머', cycle:'' },
                ],
                '도장 검사': [
                    { key:'ins_app',   label:'외관',      itemType:'prod', unit:'-',   special:'',  spec:'',  method:'육안',     cycle:'' },
                    { key:'ins_thick', label:'도막 두께', itemType:'prod', unit:'μm',  special:'',  spec:'',  method:'도막 두께계', cycle:'' },
                    { key:'ins_adh',   label:'밀착력',    itemType:'prod', unit:'등급',special:'',  spec:'',  method:'크로스컷', cycle:'' },
                ],
                '포장': [
                    { key:'pk_app',    label:'외관',      itemType:'prod', unit:'-', special:'', spec:'', method:'육안', cycle:'' },
                    { key:'pk_qty',    label:'수량',      itemType:'prod', unit:'EA',special:'', spec:'', method:'육안', cycle:'' },
                    { key:'pk_label',  label:'라벨',      itemType:'prod', unit:'-', special:'', spec:'', method:'육안', cycle:'' },
                ],
            }
        },

        // ══ 공정번호 130 ══════════════════════════════════════════════
        '레이져': {
            icon: 'bolt', color: 'var(--accent-purple, #8b5cf6)',
            procNo: 130,
            stationNos: { '레이져': 130, '공정 검사': 100, '레이져 검사': 100 },
            stations: {
                '공정 검사': [
                    { key:'lc_app',   label:'외관',      itemType:'prod', unit:'-',   special:'', spec:'', method:'육안',        cycle:'' },
                    { key:'lc_mark',  label:'마킹 상태', itemType:'prod', unit:'-',   special:'', spec:'', method:'육안',        cycle:'' },
                    { key:'lc_light', label:'조명 상태', itemType:'proc', unit:'Lux', special:'', spec:'', method:'조도계',      cycle:'' },
                ],
                '레이져': [
                    { key:'la_power',  label:'레이져 출력', itemType:'proc', unit:'W',    special:'',  spec:'',  method:'출력계',   cycle:'' },
                    { key:'la_speed',  label:'마킹 속도',   itemType:'proc', unit:'mm/s', special:'',  spec:'',  method:'육안',     cycle:'' },
                    { key:'la_freq',   label:'주파수',      itemType:'proc', unit:'kHz',  special:'',  spec:'',  method:'측정기',   cycle:'' },
                    { key:'la_focus',  label:'Focus 높이',  itemType:'proc', unit:'mm',   special:'',  spec:'',  method:'측정',     cycle:'' },
                    { key:'la_pos',    label:'마킹 위치',   itemType:'prod', unit:'-',    special:'',  spec:'',  method:'육안',     cycle:'' },
                    { key:'la_pass',   label:'마킹 횟수',   itemType:'proc', unit:'회',   special:'',  spec:'',  method:'육안',     cycle:'' },
                ],
            }
        },

        // ══ 공정번호 140 ══════════════════════════════════════════════
        '출하검사': {
            icon: 'local_shipping', color: 'var(--accent-green)',
            procNo: 140,
            stationNos: { '출하검사': 140, '신뢰성': 120, '신뢰성 검사': 120 },
            stations: {
                '신뢰성': [
                    { key:'rel_adh',   label:'밀착력',    itemType:'prod', unit:'등급', special:'', spec:'', method:'크로스컷',    cycle:'' },
                    { key:'rel_hum',   label:'내습성',    itemType:'prod', unit:'-',    special:'', spec:'', method:'항온항습기',  cycle:'' },
                    { key:'rel_heat',  label:'내열성',    itemType:'prod', unit:'℃',   special:'', spec:'', method:'오븐',        cycle:'' },
                    { key:'rel_cold',  label:'내한성',    itemType:'prod', unit:'℃',   special:'', spec:'', method:'항온항습기',  cycle:'' },
                    { key:'rel_uv',    label:'내후성(UV)',itemType:'prod', unit:'h',    special:'', spec:'', method:'UV 시험기',   cycle:'' },
                ],
                '출하검사': [
                    { key:'sh_app',    label:'외관',           itemType:'prod', unit:'-',   special:'',  spec:'',  method:'육안',     cycle:''       },
                    { key:'sh_thick',  label:'도막 두께',      itemType:'prod', unit:'μm',  special:'',  spec:'',  method:'도막 두께계', cycle:''    },
                    { key:'sh_adh',    label:'밀착력',         itemType:'prod', unit:'등급',special:'',  spec:'',  method:'크로스컷', cycle:''       },
                    { key:'sh_color',  label:'색상',           itemType:'prod', unit:'-',   special:'△', spec:'',  method:'육안, 색차계', cycle:''   },
                    { key:'sh_cnt',    label:'샘플 검사 수량', itemType:'prod', unit:'EA',  special:'',  spec:'',  method:'육안',     cycle:''       },
                    { key:'sh_cert',   label:'성적서',         itemType:'prod', unit:'-',   special:'',  spec:'',  method:'확인',     cycle:''       },
                ],
            }
        },

        // ══ 공정번호 150 ══════════════════════════════════════════════
        '출하': {
            icon: 'deployed_code', color: 'var(--accent-teal, #0d9488)',
            procNo: 150,
            stationNos: { '출하': 150 },
            stations: {
                '출하': [
                    { key:'out_qty',    label:'출하 수량',   itemType:'prod', unit:'EA',  special:'',  spec:'납품 발주서와 수량 일치',              method:'육안',   cycle:'출하 시마다' },
                    { key:'out_dest',   label:'납품처 확인', itemType:'prod', unit:'-',   special:'',  spec:'납품처 및 납품 주소 확인',             method:'납품서', cycle:'출하 시마다' },
                    { key:'out_pack',   label:'포장 상태',   itemType:'prod', unit:'-',   special:'',  spec:'포장 훼손·오염 없을 것',               method:'육안',   cycle:'출하 시마다' },
                    { key:'out_label',  label:'라벨 확인',   itemType:'prod', unit:'-',   special:'',  spec:'품번·품명·수량·LOT No 라벨 정확히 부착', method:'육안', cycle:'출하 시마다' },
                    { key:'out_doc',    label:'서류 구비',   itemType:'prod', unit:'-',   special:'',  spec:'납품서·성적서·거래명세서 구비',         method:'확인',   cycle:'출하 시마다' },
                ],
            }
        },
    };

    // 공정 표시 고정 순서 (제품별 사용 공정 선택 기준)
    const CANONICAL_PROCESS_ORDER = [
        '수입검사', '보관', '도장(A)', '레이져', '도장(B)', '출하검사', '출하'
    ];

    // 모든 제품에 공통 적용되는 필수 공정
    const COMMON_PROCESSES = new Set(['수입검사', '보관', '출하검사', '출하']);

    const DOC_CONTROL_PLAN = 'control-plan';
    const STANDARD_DOC_KIND = 'linked_standard';
    const STANDARD_DOC_TYPES = {
        'film-thickness': {
            label: '도막두께 기준서',
            icon: 'layers',
            desc: '하도/상도 스프레이 공정의 도막두께 기준을 관리계획서 항목과 연결합니다.',
            columns: [
                { key:'process', label:'연결 공정', type:'select', options:['하도 스프레이','상도 스프레이','스프레이1','스프레이2','도장 검사','출하검사'] },
                { key:'layer', label:'구분', type:'select', options:['하도','상도','전체'] },
                { key:'target', label:'목표 두께' },
                { key:'min', label:'하한' },
                { key:'max', label:'상한' },
                { key:'unit', label:'단위', defaultValue:'μm' },
                { key:'method', label:'측정방법', defaultValue:'도막 두께계' },
                { key:'cycle', label:'주기' },
                { key:'linkedItem', label:'관리계획서 항목', type:'cp-select' },
                { key:'note', label:'비고' },
            ]
        },
        'color-gloss': {
            label: '색차/광택 기준서',
            icon: 'palette',
            desc: '차종별 색차와 광택 판정 기준을 관리계획서 색상/검사 항목과 연결합니다.',
            columns: [
                { key:'process', label:'연결 공정', type:'select', options:['도장 검사','출하검사','도료 입고','상도 스프레이'] },
                { key:'standardColor', label:'표준색/시편' },
                { key:'deltaE', label:'ΔE 기준' },
                { key:'lRange', label:'L* 범위' },
                { key:'aRange', label:'a* 범위' },
                { key:'bRange', label:'b* 범위' },
                { key:'glossRange', label:'광택 기준' },
                { key:'method', label:'측정방법', defaultValue:'색차계, 광택계' },
                { key:'linkedItem', label:'관리계획서 항목', type:'cp-select' },
                { key:'note', label:'비고' },
            ]
        },
        'filter-mesh': {
            label: '여과망 기준서',
            icon: 'filter_alt',
            desc: '도료 여과망 사양, 교체주기, 적용 공정을 관리합니다.',
            columns: [
                { key:'process', label:'연결 공정', type:'select', options:['배합','도료공급','하도 공급','상도 공급','하도 스프레이','상도 스프레이'] },
                { key:'paintName', label:'도료명' },
                { key:'meshSpec', label:'여과망 사양' },
                { key:'stage', label:'적용 위치' },
                { key:'replaceCycle', label:'교체주기' },
                { key:'checkMethod', label:'확인방법', defaultValue:'육안' },
                { key:'linkedItem', label:'관리계획서 항목', type:'cp-select' },
                { key:'note', label:'비고' },
            ]
        },
        'mixing': {
            label: '배합 기준서',
            icon: 'science',
            desc: '제품별 도료 배합 기준과 적용 조건을 관리합니다.',
            columns: []  /* 전용 렌더러 사용 — PaintMixModule.renderFormulaAsStandard() */
        },
        'paint-usage': {
            label: '사용량 기준표',
            icon: 'straighten',
            desc: '제품별 도료 사용량 기준표입니다.',
            columns: []  /* 전용 렌더러 사용 — PaintMixModule.renderUsageAsStandard() */
        },
    };

    // 현재 선택 상태
    let _curProcess  = '수입검사';
    let _curStation  = '도료 입고';
    let _curLine     = 'A라인';
    let _curCarModel = '';
    let _curPartName = '';
    // CP 공정 흐름 선택 (파싱 기준) — 초기값: 모든 공정 포함
    let _cpSelectedFlow = [...CANONICAL_PROCESS_ORDER];
    let _cpUploadLine   = 'A라인'; // _cpSelectedFlow에서 파생 (하위호환용)
    let _curDocType  = DOC_CONTROL_PLAN;
    let _stdView     = 'summary';
    let _standardMergeView = true;
    let _stdEditContext = null;
    let _extraRows   = [];   // 추가 파라미터 행 [{ key, label, unit }]
    let _pendingDrawing = null; // 업로드 대기 중인 도면 { name, data(base64) }

    // ── 유틸 ─────────────────────────────────────────────────────
    function _recordKey(carModel, partName, process, station, line) {
        return [carModel, partName, process, station, line || ''].join('||');
    }

    function _getRecord(carModel, partName, process, station, line) {
        const all = Storage.getAll(STORE);
        const key = _recordKey(carModel, partName, process, station, line);
        let found = all.find(r => _recordKey(r.carModel, r.partName, r.process, r.station, r.line) === key);
        if (!found) {
            // Backward compat: old records may use '도장' + line instead of new name
            if (process === '도장(A)') {
                const oldKey = _recordKey(carModel, partName, '도장', station, 'A라인');
                found = all.find(r => _recordKey(r.carModel, r.partName, r.process, r.station, r.line) === oldKey);
            } else if (process === '도장(B)') {
                const oldKey = _recordKey(carModel, partName, '도장', station, 'B라인');
                found = all.find(r => _recordKey(r.carModel, r.partName, r.process, r.station, r.line) === oldKey);
            }
        }
        return found || null;
    }

    function _productOptions(selectedCar, selectedPart) {
        const products = Storage.getAll(DB.STORES.PRODUCTS);
        const cars = [...new Set(products.map(p => p.carModel).filter(Boolean))];
        const parts = products.filter(p => !selectedCar || p.carModel === selectedCar).map(p => p.partName).filter(Boolean);
        return { cars, parts };
    }

    // ── 렌더 ─────────────────────────────────────────────────────
    // HTML 속성 이스케이프 헬퍼
    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function _jsArg(s) {
        return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
    }

    function _countUnique(rows, keyFn) {
        const set = new Set();
        (rows || []).forEach(row => {
            const key = keyFn(row);
            if (key) set.add(key);
        });
        return set.size;
    }

    function _standardRecordCount(type) {
        return (Storage.getAll(STORE) || [])
            .filter(r => r._docKind === STANDARD_DOC_KIND && r.standardType === type && Array.isArray(r.rows))
            .reduce((sum, r) => sum + Math.max(1, r.rows.length), 0);
    }

    function _renderStandardsSummary(container) {
        if (window.Router && typeof Router.setPageTitle === 'function') {
            Router.setPageTitle('제조 관리 표준');
        }

        const allStandards = Storage.getAll(STORE) || [];
        const cpRows = allStandards.filter(r => r._docKind !== STANDARD_DOC_KIND);
        const cpProductCount = _countUnique(cpRows, r => `${r.carModel || ''}||${r.partName || ''}`);
        const workStandardCount = (Storage.getAll(DB.STORES.WORK_STANDARDS) || []).length;
        const standardCards = Object.entries(STANDARD_DOC_TYPES).map(([key, cfg]) => ({
            key,
            label: cfg.label,
            icon: cfg.icon,
            count: _standardRecordCount(key),
            desc: cfg.desc || '기준서 항목을 관리합니다.'
        }));

        const cardBase = `
            border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);
            padding:18px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px;min-height:150px;
        `;
        const actionBtn = `
            margin-top:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;
            padding:8px 12px;border-radius:8px;border:1px solid var(--accent-blue);
            background:rgba(59,130,246,.08);color:var(--accent-blue);font-weight:700;font-size:.82rem;cursor:pointer;
        `;

        container.innerHTML = `
            <div class="fade-in-up">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap;">
                    <div style="color:var(--text-muted);font-size:.92rem;">
                        관리계획서, 작업표준서, 기준서 등록 현황을 한 화면에서 확인합니다.
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-bottom:18px;">
                    <div style="${cardBase}border-top:4px solid var(--accent-blue);">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="material-symbols-outlined" style="font-size:26px;color:var(--accent-blue);">description</span>
                            <div style="font-weight:800;">관리계획서</div>
                        </div>
                        <div style="font-size:2rem;font-weight:900;color:var(--text-primary);">${cpProductCount.toLocaleString()}</div>
                        <div style="font-size:.82rem;color:var(--text-muted);">등록 품목 수 · 관리항목 ${cpRows.length.toLocaleString()}건</div>
                        <button style="${actionBtn}" onclick="ProdStandardsModule.selectDocType('${DOC_CONTROL_PLAN}')">
                            관리계획서 열기
                        </button>
                    </div>

                    <div style="${cardBase}border-top:4px solid #7c3aed;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="material-symbols-outlined" style="font-size:26px;color:#7c3aed;">assignment</span>
                            <div style="font-weight:800;">작업 표준서</div>
                        </div>
                        <div style="font-size:2rem;font-weight:900;color:var(--text-primary);">${workStandardCount.toLocaleString()}</div>
                        <div style="font-size:.82rem;color:var(--text-muted);">공정별 작업 표준서 등록 수</div>
                        <button style="${actionBtn}border-color:#7c3aed;color:#7c3aed;background:rgba(124,58,237,.08);" onclick="Router.navigate('work-standard')">
                            작업 표준서 열기
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 style="display:flex;align-items:center;gap:8px;margin:0;">
                            <span class="material-symbols-outlined">folder_managed</span>
                            기준서 현황
                        </h3>
                    </div>
                    <div class="card-body">
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                            ${standardCards.map(card => `
                                <button onclick="ProdStandardsModule.selectDocType('${card.key}')"
                                    style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                        <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                            <span class="material-symbols-outlined" style="font-size:22px;color:var(--accent-blue);">${card.icon}</span>
                                            ${card.label}
                                        </span>
                                        <span style="font-size:1.25rem;font-weight:900;color:var(--accent-blue);">${card.count.toLocaleString()}</span>
                                    </div>
                                    <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">${card.desc}</div>
                                </button>
                            `).join('')}

                            <!-- 사출컬러 기준서 카드 -->
                            <button onclick="Router.navigate('inject-color-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #0ea5e9;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#0ea5e9;">palette</span>
                                        사출컬러 기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#0ea5e9;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">사출품 COLOR 기준서 — A/B라인별 도장컬러·사출컬러 기준 및 실사 사진 관리</div>
                            </button>

                            <!-- 제품 파지 기준서 카드 -->
                            <button onclick="Router.navigate('paji-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #16a34a;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#16a34a;">back_hand</span>
                                        제품 파지 기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#16a34a;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">로딩 공정 파지 위치 기준서 — A/B라인별 제품 파지 구역 기준 및 실사 사진 관리</div>
                            </button>

                            <!-- 세척 소모품 관리 기준서 카드 -->
                            <button onclick="Router.navigate('wash-consumable')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #0e7490;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#0e7490;">cleaning_services</span>
                                        세척 소모품 관리 기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#0e7490;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">세척 소모품 교체관리 기준서 — A/B라인별 소모품 교체 주기·사용 방법·폐기 방법 관리</div>
                            </button>

                            <!-- 건조 및 셋팅룸 온도 기준서 카드 -->
                            <button onclick="Router.navigate('drying-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #b45309;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#b45309;">local_fire_department</span>
                                        건조 및 셋팅룸 온도 기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#b45309;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">A/B라인 차종·품명별 컨베이어 속도 및 Flash Off OVEN(#1-1·#2·#3) / MAIN OVEN(#4~#8) 온도 설정 기준 — ±5℃ 허용</div>
                            </button>

                            <!-- 로봇 프로그램 기준서 카드 -->
                            <button onclick="Router.navigate('robot-pg-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #7c3aed;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#7c3aed;">precision_manufacturing</span>
                                        로봇 프로그램 기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#7c3aed;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">A라인(Robot 1~6) / B라인(Robot 1~4) 레이저 프로그램명·컨트롤러번호·스핀들 속도 기준표 — 행 추가/삭제/수정 가능</div>
                            </button>

                            <!-- 교반시간 작업기준서 카드 -->
                            <button onclick="Router.navigate('agit-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #d97706;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#d97706;">blender</span>
                                        교반시간 작업기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#d97706;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">배합공정 교반시간 기준서 — 도료 종류별 교반 시간·RPM 기준 및 교반 순서·방법 관리</div>
                            </button>

                            <!-- 잔여도료 작업기준서 카드 -->
                            <button onclick="Router.navigate('remain-paint')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #7c3aed;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#7c3aed;">format_color_fill</span>
                                        잔여도료 작업기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#7c3aed;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">잔여 도료 포장 방법 기준서 — 라벨 표기·사용기한 작성·포장 방법(랩핑/커버) 관리</div>
                            </button>

                            <!-- 점도 측정 작업기준서 카드 -->
                            <button onclick="Router.navigate('viscosity-std')"
                                style="text-align:left;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);padding:15px;cursor:pointer;border-left:4px solid #0891b2;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                                    <span style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--text-primary);">
                                        <span class="material-symbols-outlined" style="font-size:22px;color:#0891b2;">speed</span>
                                        점도 측정 작업기준서
                                    </span>
                                    <span style="font-size:0.68rem;background:#0891b2;color:#fff;border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;">편집가능</span>
                                </div>
                                <div style="font-size:.78rem;color:var(--text-muted);line-height:1.45;">배합공정 도료 점도 측정 기준서 — 점도계 사용법·측정 절차·조정 방법 관리</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function render(container) {
        _stdView = 'summary';
        _renderStandardsSummary(container);
    }

    function _renderStandardsDetail(container) {
        _stdView = 'detail';
        if (window.Router && typeof Router.setPageTitle === 'function') {
            Router.setPageTitle(`<button class="topbar-back-link" onclick="ProdStandardsModule.render(document.getElementById('contentArea'))"><span class="material-symbols-outlined">arrow_back</span> 제조 관리 표준 돌아가기</button>`);
        }
        const { cars } = _productOptions();
        const carOpts = cars.map(c => `<option value="${c}" ${c === _curCarModel ? 'selected' : ''}>${c}</option>`).join('');

        container.innerHTML = `
            <div class="fade-in-up">
                ${_renderDocTypeTabs()}

                ${_curDocType === DOC_CONTROL_PLAN ? `
                ${_renderCpHistorySection()}

                <!-- 차종/품명 선택 + 관리계획서 업로드 -->
                <div class="card" style="margin-bottom:16px;">
                    <div class="card-body" style="padding:16px;">
                        <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap;">
                            <div class="form-group" style="margin:0; min-width:160px;">
                                <label class="form-label" style="font-weight:700;">차종 선택</label>
                                <select class="form-select" id="psCarModelSel" onchange="ProdStandardsModule.onCarChange()">
                                    <option value="">-- 차종 선택 --</option>
                                    ${carOpts}
                                </select>
                            </div>
                            <div class="form-group" style="margin:0; min-width:160px;">
                                <label class="form-label" style="font-weight:700;">품명 선택</label>
                                <select class="form-select" id="psPartNameSel" onchange="ProdStandardsModule.onPartChange()">
                                    <option value="">-- 품명 선택 --</option>
                                </select>
                            </div>

                            <!-- 구분선 -->
                            <div style="width:1px; height:38px; background:var(--border-color); flex-shrink:0;"></div>

                            <!-- CP 공정 흐름 선택 -->
                            <div class="form-group" style="margin:0; flex:1; min-width:280px;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
                                    <label class="form-label" style="font-weight:700; white-space:nowrap; margin:0;">
                                        <span class="material-symbols-outlined" style="font-size:13px; vertical-align:middle;">route</span>
                                        CP 공정 흐름 선택
                                    </label>
                                    <button class="btn btn-secondary btn-sm" onclick="ProdStandardsModule.openStationManager()"
                                        style="display:flex; align-items:center; gap:5px; font-size:12px; white-space:nowrap;">
                                        <span class="material-symbols-outlined" style="font-size:15px;">tune</span>
                                        세부공정 관리
                                    </button>
                                </div>
                                <div id="cpFlowSelectorContainer">${_cpFlowSelectorHtml()}</div>
                            </div>

                            <!-- 관리계획서 업로드 상태 + 버튼 -->
                            <div id="psCpStatusBadge" style="display:none;"></div>

                            <input type="file" id="cpUploadInput" accept=".xlsx,.xls"
                                style="display:none;" onchange="ProdStandardsModule.onControlPlanUpload(this)">
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- CP 형식 통합 파라미터 테이블 / 기준서 테이블 -->
                <div class="card" id="psParamCard">
                    <div class="card-body" style="padding:0;">
                        <div id="psParamContent" style="padding:20px;">
                            <p style="color:var(--text-muted); text-align:center; padding:30px;">차종과 품명을 먼저 선택하세요.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 차종이 이미 선택된 상태면 품명 목록도 채우기
        if (_curCarModel) {
            const partSel = document.getElementById('psPartNameSel');
            if (partSel) {
                const products = Storage.getAll(DB.STORES.PRODUCTS);
                const parts = products
                    .filter(p => p.carModel === _curCarModel && p.partName)
                    .map(p => p.partName);
                partSel.innerHTML =
                    `<option value="">-- 품명 선택 --</option>` +
                    parts.map(p =>
                        `<option value="${p}" ${p === _curPartName ? 'selected' : ''}>${p}</option>`
                    ).join('');
            }
        }

        // 현재 라인의 커스텀 설정 로드 (미로드 시에만)
        _ensureCarConfig(_curLine || 'A라인');
        // CP 이력 캐시가 없으면 DB에서 비동기 로드 (완료 시 배지 자동 갱신)
        if (_cpHistCache === null) _initCpHistCache();

        _updateBadge();
        if (_curDocType === DOC_CONTROL_PLAN) {
            if (_curCarModel && _curPartName) _renderParamTable();
        } else {
            _renderLinkedStandardTable();
        }
    }

    // _renderSubTabs: 탭 제거로 더 이상 사용 안 함 (하위 호환 유지)
    function _renderSubTabs() { }

    function _renderDocTypeTabs() {
        const stdTabs = Object.entries(STANDARD_DOC_TYPES).map(([key, cfg]) => ({
            key, label: cfg.label, icon: cfg.icon
        }));
        return `
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin:0 0 14px;">
                <button class="btn ${_curDocType === DOC_CONTROL_PLAN ? 'btn-primary' : 'btn-outline'} btn-sm"
                    onclick="ProdStandardsModule.selectDocType('${DOC_CONTROL_PLAN}')"
                    style="display:flex; align-items:center; gap:5px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">description</span>
                    관리계획서
                </button>
                <button class="btn btn-outline btn-sm"
                    onclick="Router.navigate('work-standard')"
                    style="display:flex; align-items:center; gap:5px; border-color:#7c3aed; color:#7c3aed;">
                    <span class="material-symbols-outlined" style="font-size:16px;">assignment</span>
                    작업표준서
                    <span class="material-symbols-outlined" style="font-size:13px; opacity:0.7;">open_in_new</span>
                </button>
                ${stdTabs.map(t => `
                    <button class="btn ${_curDocType === t.key ? 'btn-primary' : 'btn-outline'} btn-sm"
                        onclick="ProdStandardsModule.selectDocType('${t.key}')"
                        style="display:flex; align-items:center; gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">${t.icon}</span>
                        ${t.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    // ── 특별특성 토글 (공백 → ◎ → △ → 공백 순환) ────────────────
    function toggleSpecial(key) {
        const btn = document.getElementById('psParam_special_' + key);
        if (!btn) return;
        const states = ['', '◎', '△'];
        const cur  = btn.dataset.value || '';
        const next = states[(states.indexOf(cur) + 1) % states.length];
        btn.dataset.value = next;
        btn.textContent   = next;
        if (next === '◎') {
            btn.style.background  = '#dc2626';
            btn.style.color       = '#fff';
            btn.style.borderColor = '#dc2626';
        } else if (next === '△') {
            btn.style.background  = '#f59e0b';
            btn.style.color       = '#fff';
            btn.style.borderColor = '#f59e0b';
        } else {
            btn.style.background  = 'transparent';
            btn.style.color       = 'var(--text-muted)';
            btn.style.borderColor = 'var(--border-color)';
        }
    }

    // ── F/P 토글 (공백 ↔ O) ──────────────────────────────────────
    function toggleFp(key) {
        const btn = document.getElementById('psParam_fp_' + key);
        if (!btn) return;
        const next = btn.dataset.value ? '' : 'O';
        btn.dataset.value = next;
        btn.textContent   = next;
        if (next) {
            btn.style.background  = 'var(--accent-green, #16a34a)';
            btn.style.color       = '#fff';
            btn.style.borderColor = 'var(--accent-green, #16a34a)';
        } else {
            btn.style.background  = 'transparent';
            btn.style.color       = 'var(--text-muted)';
            btn.style.borderColor = 'var(--border-color)';
        }
    }

    // ── CP 형식 통합 파라미터 테이블 ──────────────────────────────
    // 공정명(rowspan) │ 공정번호(station rowspan) │ 설비명(station rowspan) │ No │ 관리항목(제품/공정) │ 특별특성 │ 규격 │ 확인방법 │ 주기 │ 관리방안
    function _renderParamTable() {
        const el = document.getElementById('psParamContent');
        if (!el) return;
        if (!_curCarModel || !_curPartName) {
            el.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:30px;">차종과 품명을 먼저 선택하세요.</p>`;
            return;
        }

        // CP 등록 여부 확인 — 저장 데이터가 하나도 없으면 안내 메시지만 표시
        const allStds = Storage.getAll(DB.STORES.PROD_STANDARDS);
        const hasData = allStds.some(s =>
            s.carModel === _curCarModel && s.partName === _curPartName && s._docKind !== STANDARD_DOC_KIND);
        if (!hasData) {
            el.innerHTML = `
                <div style="text-align:center; padding:48px 20px; color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:48px; display:block; margin-bottom:12px; opacity:.35;">description</span>
                    <div style="font-size:15px; font-weight:600; margin-bottom:6px;">관리계획서 미등록</div>
                    <div style="font-size:13px;">[${_curCarModel}] ${_curPartName}의 CP 파라미터가 없습니다.<br>위 버튼으로 관리계획서를 업로드하세요.</div>
                </div>`;
            return;
        }

        // ★ CP 저장 레코드 전체 미리 로드 (숨김 스테이션 포함 표시에 활용)
        const _allSavedStds = Storage.getAll(DB.STORES.PROD_STANDARDS)
            .filter(s => s.carModel === _curCarModel && s.partName === _curPartName && s._docKind !== STANDARD_DOC_KIND);

        // CP 임포트 여부 판별: _fromCpImport 레코드가 하나라도 있으면 "CP 모드"
        // CP 모드에서는 레코드 없는 PROCESS_CONFIG 고정 스테이션 행을 숨김
        const _isCpMode = _allSavedStds.some(s => s._fromCpImport);

        // 전체 공정 × 스테이션 구조 빌드 (rowspan 계산 포함)
        // ★ CP 모드: 모든 라인(도장(A)/도장(B) 동시) 조회. 레코드 없는 행은 아래에서 제외
        //   수동 모드: 현재 _curLine 기준 필터 적용 (기존 동작 유지)
        const carCfg = _isCpMode ? _getCarConfig('') : _getCarConfig(_curLine || '');
        const allGroups = [];
        const cpSortNo = (v) => {
            const m = String(v || '').trim().match(/^(\d+)(?:\s*[._\-\/]\s*(\d+))?/);
            if (!m) return Number.MAX_SAFE_INTEGER;
            return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0);
        };

        Object.entries(carCfg).forEach(([procName, cfg]) => {
            const color  = cfg.color || 'var(--accent-blue)';
            const icon   = cfg.icon  || 'settings';
            const line   = cfg.storeLine ? cfg.storeLine : '';
            let totalProcRows = 0;
            const stationGroups = [];
            const processedStations = new Set();

            Object.entries(cfg.stations).forEach(([stName, fixedParams]) => {
                processedStations.add(stName);
                const rec        = _getRecord(_curCarModel, _curPartName, procName, stName, line);

                // ★ CP 모드: 레코드가 없는 PROCESS_CONFIG 고정 스테이션은 표시 생략
                if (_isCpMode && !rec) return;

                const stNo = (rec && rec.rawProcNo != null && rec.rawProcNo !== '')
                    ? rec.rawProcNo
                    : (cfg.stationNos && cfg.stationNos[stName] != null
                        ? cfg.stationNos[stName] : cfg.procNo || '');
                const saved      = rec ? (rec.params       || {}) : {};
                const savedCust  = rec ? (rec.customParams || []) : [];

                // ★ CP 임포트 레코드: customParams만 표시 (파싱 결과와 1:1 일치)
                // 수동 입력 레코드 또는 레코드 없음: PROCESS_CONFIG 고정 파라미터 + 커스텀
                let allParams;
                if (rec && rec._fromCpImport) {
                    allParams = savedCust.map(cp => ({
                        key: cp.key, label: cp.label,
                        unit: cp.unit || '', itemType: cp.itemType || 'prod', _custom: true
                    }));
                } else {
                    allParams = [...fixedParams];
                    savedCust.forEach(cp => {
                        if (!allParams.find(p => p.key === cp.key))
                            allParams.push({ key: cp.key, label: cp.label, unit: cp.unit || '', itemType: 'prod', _custom: true });
                    });
                }

                if (allParams.length === 0) return;  // 파라미터 없으면 제외
                stationGroups.push({ stName, stNo, params: allParams, saved, rec, line, savedCust });
                totalProcRows += allParams.length;
            });

            // ★ carCfg에 없지만 DB에 레코드가 있는 스테이션 추가 (숨김 스테이션 · CP 원본 스테이션)
            _allSavedStds
                .filter(s => s.process === procName
                          && !processedStations.has(s.station)
                          && (cfg.storeLine ? s.line === (line || '') : true))
                .forEach(rec => {
                    const stName    = rec.station;
                    const stNo      = (rec.rawProcNo != null && rec.rawProcNo !== '')
                        ? rec.rawProcNo : cfg.procNo || '';
                    const saved     = rec.params       || {};
                    const savedCust = rec.customParams || [];
                    // ★ CP 임포트 레코드: customParams만 사용
                    // 수동 레코드: 원본 PROCESS_CONFIG 고정 파라미터 + 커스텀
                    let allParams;
                    if (rec._fromCpImport) {
                        allParams = savedCust.map(cp => ({
                            key: cp.key, label: cp.label,
                            unit: cp.unit || '', itemType: cp.itemType || 'prod', _custom: true
                        }));
                    } else {
                        const baseFixed = (PROCESS_CONFIG[procName]
                            && PROCESS_CONFIG[procName].stations
                            && PROCESS_CONFIG[procName].stations[stName]) || [];
                        allParams = [...baseFixed];
                        savedCust.forEach(cp => {
                            if (!allParams.find(p => p.key === cp.key))
                                allParams.push({ key: cp.key, label: cp.label, unit: cp.unit || '', itemType: 'prod', _custom: true });
                        });
                    }
                    if (allParams.length > 0 || Object.keys(saved).length > 0) {
                        stationGroups.push({ stName, stNo, params: allParams, saved, rec, line, savedCust, _fromRecord: true });
                        totalProcRows += allParams.length;
                    }
                });

            // ★ rawProcNo 기준 오름차순 정렬 (CP 원본 공정 순서 유지)
            stationGroups.sort((a, b) => cpSortNo(a.stNo) - cpSortNo(b.stNo));
            totalProcRows = stationGroups.reduce((sum, sg) => sum + sg.params.length, 0);

            const firstProcNo = stationGroups.reduce((min, sg) => Math.min(min, cpSortNo(sg.stNo)), Number.MAX_SAFE_INTEGER);
            allGroups.push({ procName, cfg, color, icon, totalProcRows, stationGroups, firstProcNo });
        });

        if (_isCpMode) {
            allGroups.sort((a, b) => a.firstProcNo - b.firstProcNo);
        }

        // 테이블 행 생성
        // 열 순서: 공정번호 | 공정명 | 설비명 | No | 관리항목(제품/공정) | 특별특성 | F/P | 관리기준(규격/확인방법/주기/관리방안)
        let tbody = '';
        allGroups.forEach((g, gIdx) => {
            let procNameShown = false; // 공정명을 이미 표시했는지 여부

            g.stationGroups.forEach((sg, sgIdx) => {
                // ★ 짝수 음영: 스테이션별 stNo 기준 (rawProcNo 반영)
                const isEvenProc = (parseFloat(sg.stNo) % 2 === 0);
                const evenBg     = isEvenProc ? 'background:rgba(0,0,0,0.028);' : '';

                sg.params.forEach((param, pidx) => {
                    const sv        = sg.saved[param.key] || {};
                    const isNo1     = pidx === 0;   // No=1 행 (세부공정 그룹의 시작)
                    const showProc  = isNo1 && !procNameShown; // 공정명은 공정 내 첫 No=1에만

                    let defProd   = sv.itemProd || '';
                    let defProc   = sv.itemProc || '';
                    // 제품/공정 중복 표시 방지: 동일한 값이면 itemType에 맞는 쪽만 표시
                    if (defProd && defProc && defProd.replace(/\s+/g,'') === defProc.replace(/\s+/g,'')) {
                        if (param.itemType === 'proc') defProd = '';  // 공정 타입 → 제품열 비움
                        else                           defProc = '';  // 제품 타입(기본) → 공정열 비움
                    }
                    // ★ CP 모드 커스텀 파라미터: placeholder를 비움 (label이 중복 표시되는 혼란 방지)
                    const phProd    = param._custom ? '' : (param.itemType === 'prod' ? param.label : '');
                    const phProc    = param._custom ? '' : (param.itemType === 'proc' ? param.label : '');
                    const vSpec     = sv.value   || '';
                    const vSpecial  = sv.special  || '';
                    const vFp       = sv.fp       || '';
                    // 저장값 없으면 세부공정 관리에서 정의한 기본값으로 대체
                    const vMethod   = sv.method   || param.method      || '';
                    const vCycle    = sv.cycle    || param.cycle        || '';
                    const vControl  = sv.control  || param.controlPlan || '';

                    // No=1 행 구분선 + 세부공정 간격
                    const topBorder  = isNo1 ? `border-top:2px solid ${g.color};` : '';
                    const topPad     = isNo1 ? 'padding-top:9px;' : '';   // 세부공정 구분 간격

                    // 특별특성 버튼 스타일 (◎=빨강, △=주황, 공백=회색)
                    const specialStyle = vSpecial === '◎'
                        ? 'background:#dc2626; color:#fff; border-color:#dc2626;'
                        : vSpecial === '△'
                            ? 'background:#f59e0b; color:#fff; border-color:#f59e0b;'
                            : 'background:transparent; color:var(--text-muted); border-color:var(--border-color);';

                    // F/P 버튼 스타일
                    const fpStyle = vFp
                        ? 'background:var(--accent-green,#16a34a); color:#fff; border-color:var(--accent-green,#16a34a);'
                        : 'background:transparent; color:var(--text-muted); border-color:var(--border-color);';

                    tbody += `<tr>`;

                    // ① 공정번호 — No=1 행에만 표시, 나머지 빈 셀
                    tbody += `<td style="text-align:center; vertical-align:middle; width:44px;
                                   ${topBorder} ${topPad}
                                   ${isNo1 ? `background:${g.color}0d; border-right:1px solid ${g.color}33;` : `${evenBg} border-right:1px solid var(--border-color);`}
                                   padding:${isNo1?'9px 6px 4px':'4px 6px'};">
                        ${isNo1 ? `<div style="font-weight:900; font-size:15px; color:${g.color}; line-height:1.1;">${sg.stNo}</div>` : ''}
                    </td>`;

                    // ② 공정명 — 공정 내 첫 No=1 행에만 표시
                    tbody += `<td style="text-align:center; vertical-align:middle; min-width:36px;
                                   ${topBorder} ${topPad}
                                   ${showProc ? `background:${g.color}11; border-right:2px solid ${g.color}55;` : `${evenBg} border-right:1px solid var(--border-color);`}
                                   padding:${showProc ? '9px 6px 4px' : isNo1 ? '9px 4px 4px' : '2px 4px'};">
                        ${showProc ? `
                            <span class="material-symbols-outlined"
                                style="font-size:13px; color:${g.color}; display:block; margin-bottom:2px;">${g.icon}</span>
                            <span style="font-weight:800; font-size:10px; color:${g.color};
                                         white-space:nowrap; display:block;">${g.procName}</span>
                        ` : ''}
                    </td>`;
                    if (showProc) procNameShown = true;

                    // ③ 세부공정 — No=1 행에만 표시
                    tbody += `<td style="vertical-align:middle; min-width:36px; white-space:nowrap;
                                   ${topBorder} ${topPad}
                                   ${isNo1 ? `background:${g.color}07;` : evenBg}
                                   padding:${isNo1?'9px 5px 2px':'2px 5px'}; font-size:11px;">
                        ${isNo1 ? `<span style="color:${g.color}; font-weight:600;">${sg.stName}</span>` : ''}
                    </td>`;

                    // ④ 설비명 — No=1 행에만 표시 (DB에 저장된 equipName)
                    const equipName = sg.rec ? (sg.rec.equipName || '') : '';
                    tbody += `<td style="vertical-align:middle; min-width:36px; white-space:nowrap;
                                   ${topBorder} ${topPad}
                                   ${isNo1 && equipName ? `background:${g.color}04;` : evenBg}
                                   padding:${isNo1?'9px 5px 2px':'2px 5px'}; font-size:11px; color:var(--text-muted);">
                        ${isNo1 && equipName ? `<span>${_esc(equipName)}</span>` : ''}
                    </td>`;

                    // ⑤ 나머지 열 (per-param) — 입력칸 폭은 내용에 맞게 자동
                    const inStyle  = 'height:26px; font-size:11px; width:100%; box-sizing:border-box;';
                    const tdBase   = `${topBorder} ${evenBg}`;
                    const tdPad    = isNo1 ? 'padding:9px 4px 2px;' : 'padding:2px 4px;';
                    tbody += `
                        <td style="text-align:center; color:var(--text-muted); font-size:11px;
                                   white-space:nowrap; ${tdPad} ${tdBase}">${pidx + 1}</td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle} color:var(--accent-blue); font-weight:600;"
                                id="psParam_itemProd_${param.key}"
                                value="${_esc(defProd)}" placeholder="${_esc(phProd)}">
                        </td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle} color:var(--accent-orange);"
                                id="psParam_itemProc_${param.key}"
                                value="${_esc(defProc)}" placeholder="${_esc(phProc)}">
                        </td>
                        <td style="text-align:center; ${tdPad} ${tdBase}">
                            <button type="button"
                                id="psParam_special_${param.key}"
                                data-value="${_esc(vSpecial)}"
                                onclick="ProdStandardsModule.toggleSpecial('${param.key}')"
                                style="min-width:34px; height:26px; border-radius:4px; border:1px solid;
                                       cursor:pointer; font-weight:800; font-size:13px;
                                       line-height:1; ${specialStyle}">
                                ${_esc(vSpecial)}
                            </button>
                        </td>
                        <td style="text-align:center; ${tdPad} ${tdBase}">
                            <button type="button"
                                id="psParam_fp_${param.key}"
                                data-value="${_esc(vFp)}"
                                onclick="ProdStandardsModule.toggleFp('${param.key}')"
                                style="min-width:34px; height:26px; border-radius:4px; border:1px solid;
                                       cursor:pointer; font-weight:800; font-size:13px;
                                       line-height:1; ${fpStyle}">
                                ${_esc(vFp)}
                            </button>
                        </td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle}"
                                id="psParam_val_${param.key}"
                                value="${_esc(vSpec)}" placeholder="규격 / 기준값">
                        </td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle}"
                                id="psParam_method_${param.key}"
                                value="${_esc(vMethod)}" placeholder="확인방법">
                        </td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle}"
                                id="psParam_cycle_${param.key}"
                                value="${_esc(vCycle)}" placeholder="주기">
                        </td>
                        <td style="${tdPad} ${tdBase}">
                            <input type="text" class="form-input"
                                style="${inStyle}"
                                id="psParam_control_${param.key}"
                                value="${_esc(vControl)}" placeholder="관리방안">
                        </td>
                    </tr>`;
                });
            });
        });

        // 저장 여부
        const anyRec = Storage.getAll(STORE).some(r =>
            r.carModel === _curCarModel && r.partName === _curPartName && r._docKind !== STANDARD_DOC_KIND);
        const statusBadge = anyRec
            ? `<span style="font-size:12px; color:var(--accent-green);">● 저장 데이터 있음</span>`
            : `<span style="font-size:12px; color:var(--text-muted);">● 미입력</span>`;

        // 품번: CP 업로드 이력에서 가져오기
        const _histForPart = _loadCpHistory().find(h => h.carModel === _curCarModel && h.partName === _curPartName);
        const _partNo = (_histForPart && _histForPart.partNo) ? _histForPart.partNo : '';

        // 도면 섹션 (수입검사/사출소재 입고 기준)
        const drawRec = _getRecord(_curCarModel, _curPartName, '수입검사', '사출소재 입고', '');

        // 개정이력 비동기 로드 후 렌더 (화면에 placeholder 먼저 그리고 교체)
        _loadRevHist(_curCarModel, _curPartName).then(() => {
            const ph = document.getElementById('revHistSection');
            if (ph) ph.outerHTML = _renderRevHistSection_sync();
        });

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;
                        margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-weight:700; font-size:15px;">${_esc(_curCarModel)} / ${_esc(_curPartName)}</span>
                    ${_partNo ? `<span style="font-size:13px; color:var(--text-muted);">·</span>
                    <span style="font-size:13px; font-weight:600; color:var(--text-muted);">${_esc(_partNo)}</span>` : ''}
                    ${statusBadge}
                </div>
                <button class="btn btn-primary btn-sm" onclick="ProdStandardsModule.saveAllParams()">
                    <span class="material-symbols-outlined" style="font-size:15px;">save</span> 전체 저장
                </button>
            </div>

            <!-- 개정이력 섹션 (비동기 로드 후 교체) -->
            <div id="revHistSection" class="card" style="margin-bottom:16px; opacity:.5;">
                <div style="padding:14px 18px; color:var(--text-muted); font-size:13px;">개정 이력 로딩 중...</div>
            </div>

            <div class="data-table-wrapper" style="overflow-x:auto;">
                <table class="data-table" style="width:100%; font-size:12px; border-collapse:collapse; table-layout:auto;">
                    <thead>
                        <tr>
                            <th rowspan="2" style="width:1%; white-space:nowrap; text-align:center; vertical-align:middle; padding:4px 6px;">공정<br>번호</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; text-align:center; vertical-align:middle; padding:4px 5px; font-size:10px;">주공정</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; vertical-align:middle; padding:4px 5px; font-size:10px;">세부공정</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; vertical-align:middle; padding:4px 5px; font-size:10px;">설비명</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; text-align:center; vertical-align:middle; padding:4px 5px;">No</th>
                            <th colspan="2" style="text-align:center; border-bottom:1px solid var(--border-color); padding:4px 8px; white-space:nowrap;">관리 항목</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; text-align:center; vertical-align:middle; padding:4px 6px;">특별<br>특성</th>
                            <th rowspan="2" style="width:1%; white-space:nowrap; text-align:center; vertical-align:middle; padding:4px 6px;">F/P</th>
                            <th colspan="4" style="text-align:center; border-bottom:1px solid var(--border-color); padding:4px 8px; white-space:nowrap;">관리 기준</th>
                        </tr>
                        <tr>
                            <th style="width:6%; font-size:11px; color:var(--accent-blue);   background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">제 품</th>
                            <th style="width:6%; font-size:11px; color:var(--accent-orange); background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">공 정</th>
                            <th style="width:18%; font-size:11px; background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">규격 / 기준값</th>
                            <th style="width:8%;  font-size:11px; background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">확인방법</th>
                            <th style="width:6%;  font-size:11px; background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">주기</th>
                            <th style="width:10%; font-size:11px; background:var(--bg-secondary); padding:3px 6px; white-space:nowrap;">관리방안</th>
                        </tr>
                    </thead>
                    <tbody id="psParamTbody">
                        ${tbody}
                    </tbody>
                </table>
            </div>

            <!-- 도면 파일 섹션 -->
            <div class="ps-drawing-section" style="margin-top:20px;">
                ${_drawingSectionHtml(drawRec)}
            </div>
        `;
    }

    function _getLinkedStandardRecord(type, carModel = _curCarModel, partName = _curPartName) {
        return Storage.getAll(STORE).find(r =>
            r._docKind === STANDARD_DOC_KIND &&
            r.standardType === type &&
            r.carModel === carModel &&
            r.partName === partName
        ) || null;
    }

    function _standardTargetProcesses(type = _curDocType) {
        const cfg = STANDARD_DOC_TYPES[type];
        const processCol = cfg && cfg.columns.find(c => c.key === 'process');
        return processCol && Array.isArray(processCol.options) ? processCol.options : [];
    }

    function _getCpParamOptions(carModel = _curCarModel, partName = _curPartName, type = _curDocType) {
        const targetProcesses = _standardTargetProcesses(type);
        const records = Storage.getAll(STORE)
            .filter(r => r.carModel === carModel && r.partName === partName && r._docKind !== STANDARD_DOC_KIND)
            .filter(r => targetProcesses.length === 0 || targetProcesses.includes(r.station) || targetProcesses.includes(r.process));
        const opts = [];
        records.forEach(r => {
            const params = r.customParams && r.customParams.length
                ? r.customParams
                : Object.keys(r.params || {}).map(k => {
                    const sv = (r.params || {})[k] || {};
                    return { key:k, label:sv.itemProd || sv.itemProc || k };
                });
            params.forEach(p => {
                const label = p.label || p.itemProd || p.itemProc || p.key;
                opts.push({
                    value: [r.process || '', r.station || '', label].filter(Boolean).join(' / '),
                    label: [r.process || '', r.station || '', label].filter(Boolean).join(' / ')
                });
            });
        });
        return opts;
    }

    function _allProductRows() {
        const seen = new Set();
        return Storage.getAll(DB.STORES.PRODUCTS)
            .filter(p => p.carModel && p.partName)
            .filter(p => {
                const key = `${p.carModel}||${p.partName}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => String(a.carModel).localeCompare(String(b.carModel), 'ko') ||
                            String(a.partName).localeCompare(String(b.partName), 'ko'));
    }

    function _renderLinkedStandardTable() {
        const el = document.getElementById('psParamContent');
        if (!el) return;

        /* 배합/사용 기준표 — PaintMixModule 전용 렌더러 위임 */
        if (_curDocType === 'mixing') { PaintMixModule.renderFormulaAsStandard(el); return; }
        if (_curDocType === 'paint-usage') { PaintMixModule.renderUsageAsStandard(el); return; }

        const cfg = STANDARD_DOC_TYPES[_curDocType];
        if (!cfg) return;
        const mergeable = _isMergeableStandard(_curDocType);
        const products = _allProductRows();
        const allRows = [];
        products.forEach(p => {
            const rec = _getLinkedStandardRecord(_curDocType, p.carModel, p.partName);
            const rows = rec && Array.isArray(rec.rows) ? rec.rows : [];
            const cpOptions = _getCpParamOptions(p.carModel, p.partName, _curDocType);
            if (rows.length) {
                rows.forEach((row, idx) => allRows.push({ product:p, row, idx, cpCount:cpOptions.length }));
            } else {
                allRows.push({ product:p, row:null, idx:-1, cpCount:cpOptions.length });
            }
        });
        const mergedRows = mergeable ? _mergeStandardRows(allRows, cfg) : [];
        const registeredCount = allRows.filter(entry => entry.row).length;

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:16px;">
                        <span class="material-symbols-outlined" style="font-size:20px; color:var(--accent-blue);">${cfg.icon}</span>
                        ${cfg.label}
                    </div>
                    <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">
                        전 차종 기준 · 관리계획서의 ${_standardTargetProcesses().join(', ')} 공정 항목만 모아서 입력
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${mergeable ? `
                        <button class="btn btn-outline btn-sm" onclick="ProdStandardsModule.toggleStandardMergeView()">
                            <span class="material-symbols-outlined" style="font-size:15px;">${_standardMergeView ? 'view_list' : 'compress'}</span>
                            ${_standardMergeView ? '개별 보기' : '병합 보기'}
                        </button>
                    ` : ''}
                    <button class="btn btn-primary btn-sm" onclick="ProdStandardsModule.openStandardPrintPage()">
                        <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
                    </button>
                </div>
            </div>
            <div style="margin-bottom:14px; padding:12px 14px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary); color:var(--text-muted); font-size:13px;">
                ${cfg.desc}
            </div>
            ${mergeable && _standardMergeView ? `
                <div style="margin-bottom:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px; color:var(--text-muted);">
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid var(--border-color);border-radius:999px;background:#fff;">
                        <span class="material-symbols-outlined" style="font-size:15px;color:var(--accent-blue);">compress</span>
                        동일 기준 병합 표시
                    </span>
                    <span>등록 기준 ${registeredCount}건 → 병합 ${mergedRows.length}건</span>
                    <span>수정/삭제는 개별 보기에서 진행합니다.</span>
                </div>
            ` : ''}
            ${products.length ? `
                <div class="data-table-wrapper" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%; font-size:12px; min-width:1180px;">
                        <thead>
                            ${mergeable && _standardMergeView ? _mergedStandardHeaderHtml(cfg) : _standardHeaderHtml(cfg)}
                        </thead>
                        <tbody>
                            ${mergeable && _standardMergeView
                                ? _mergedStandardRowsHtml(mergedRows, cfg)
                                : _standardRowsHtml(allRows, cfg)}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align:center; padding:44px 20px; color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:44px; display:block; margin-bottom:10px; opacity:.35;">note_add</span>
                    <div style="font-weight:700; margin-bottom:6px;">등록된 제품 마스터가 없습니다</div>
                    <div style="font-size:13px;">제품 마스터에 차종과 품명을 먼저 등록하세요.</div>
                </div>
            `}
        `;
    }

    function _isMergeableStandard(type = _curDocType) {
        return type === 'film-thickness' || type === 'color-gloss';
    }

    function _standardHeaderHtml(cfg) {
        return `
            <tr>
                <th style="width:44px; text-align:center;">No</th>
                <th style="min-width:100px;">차종</th>
                <th style="min-width:130px;">품명</th>
                <th style="width:90px; text-align:center;">CP 항목</th>
                ${cfg.columns.map(c => `<th>${c.label}</th>`).join('')}
                <th style="width:100px; text-align:center;">작업</th>
            </tr>`;
    }

    function _standardRowsHtml(allRows, cfg) {
        return allRows.map((entry, rowNo) => `
            <tr>
                <td style="text-align:center; font-weight:700;">${rowNo + 1}</td>
                <td style="font-weight:700;">${_esc(entry.product.carModel)}</td>
                <td>${_esc(entry.product.partName)}</td>
                <td style="text-align:center;">
                    <span style="font-weight:700; color:${entry.cpCount ? 'var(--accent-green)' : 'var(--text-muted)'};">${entry.cpCount}</span>
                </td>
                ${entry.row
                    ? cfg.columns.map(c => `<td>${_esc(entry.row[c.key] || '')}</td>`).join('')
                    : `<td colspan="${cfg.columns.length}" style="color:var(--text-muted); text-align:center;">아직 등록된 기준이 없습니다.</td>`}
                <td style="text-align:center; white-space:nowrap;">
                    <button class="btn btn-sm ${entry.row ? 'btn-outline' : 'btn-primary'}"
                        onclick="ProdStandardsModule.openStandardRowModal('${_jsArg(entry.product.carModel)}','${_jsArg(entry.product.partName)}',${entry.idx})">
                        ${entry.row ? '수정' : '입력'}
                    </button>
                    ${entry.row ? `<button class="btn btn-sm" style="border:1px solid var(--accent-red); color:var(--accent-red); background:transparent;" onclick="ProdStandardsModule.deleteStandardRow('${_jsArg(entry.product.carModel)}','${_jsArg(entry.product.partName)}',${entry.idx})">삭제</button>` : ''}
                </td>
            </tr>
        `).join('');
    }

    function _standardMergeKey(entry, cfg) {
        if (!entry.row) return '';
        return cfg.columns.map(c => String(entry.row[c.key] || '').trim()).join('||');
    }

    function _mergeStandardRows(allRows, cfg) {
        const map = new Map();
        allRows.filter(entry => entry.row).forEach(entry => {
            const key = _standardMergeKey(entry, cfg);
            const cur = map.get(key) || {
                key,
                row: entry.row,
                cpCount: 0,
                entries: [],
                products: new Map()
            };
            cur.cpCount += Number(entry.cpCount) || 0;
            cur.entries.push(entry);
            const productKey = `${entry.product.carModel}||${entry.product.partName}`;
            cur.products.set(productKey, entry.product);
            map.set(key, cur);
        });
        return [...map.values()].sort((a, b) =>
            String(a.row.process || '').localeCompare(String(b.row.process || ''), 'ko') ||
            String(a.row.layer || a.row.standardColor || '').localeCompare(String(b.row.layer || b.row.standardColor || ''), 'ko') ||
            b.entries.length - a.entries.length
        );
    }

    function _mergedStandardHeaderHtml(cfg) {
        return `
            <tr>
                <th style="width:44px; text-align:center;">No</th>
                <th style="min-width:260px;">적용 차종/품명</th>
                <th style="width:76px; text-align:center;">적용수</th>
                ${cfg.columns.map(c => `<th>${c.label}</th>`).join('')}
                <th style="width:90px; text-align:center;">작업</th>
            </tr>`;
    }

    function _mergedProductListHtml(group) {
        const products = [...group.products.values()];
        const visible = products.slice(0, 8);
        const hidden = Math.max(0, products.length - visible.length);
        return `
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${visible.map(p => `
                    <span title="${_esc(p.carModel)} / ${_esc(p.partName)}"
                        style="display:inline-flex;max-width:190px;padding:3px 7px;border-radius:999px;background:#eef4ff;color:#2563eb;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${_esc(p.carModel)} / ${_esc(p.partName)}
                    </span>
                `).join('')}
                ${hidden ? `<span style="padding:3px 7px;border-radius:999px;background:var(--bg-secondary);color:var(--text-muted);font-weight:700;">외 ${hidden}건</span>` : ''}
            </div>`;
    }

    function _mergedStandardRowsHtml(mergedRows, cfg) {
        if (!mergedRows.length) {
            return `<tr><td colspan="${cfg.columns.length + 4}" style="text-align:center;color:var(--text-muted);padding:30px;">등록된 기준이 없습니다. 개별 보기에서 기준을 먼저 입력하세요.</td></tr>`;
        }
        return mergedRows.map((group, idx) => `
            <tr>
                <td style="text-align:center;font-weight:800;">${idx + 1}</td>
                <td>${_mergedProductListHtml(group)}</td>
                <td style="text-align:center;font-weight:800;color:var(--accent-blue);">${group.entries.length}</td>
                ${cfg.columns.map(c => `<td>${_esc(group.row[c.key] || '')}</td>`).join('')}
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="ProdStandardsModule.toggleStandardMergeView()">개별 수정</button>
                </td>
            </tr>
        `).join('');
    }

    function toggleStandardMergeView() {
        _standardMergeView = !_standardMergeView;
        _renderLinkedStandardTable();
    }

    function _standardInputHtml(col, value, carModel = _curCarModel, partName = _curPartName) {
        const val = _esc(value || col.defaultValue || '');
        if (col.type === 'select') {
            return `<select class="form-select" id="std_${col.key}">
                <option value="">-- 선택 --</option>
                ${(col.options || []).map(o => `<option value="${_esc(o)}" ${o === value ? 'selected' : ''}>${_esc(o)}</option>`).join('')}
            </select>`;
        }
        if (col.type === 'cp-select') {
            const opts = _getCpParamOptions(carModel, partName, _curDocType);
            return `<select class="form-select" id="std_${col.key}">
                <option value="">-- 관리계획서 항목 선택 --</option>
                ${opts.map(o => `<option value="${_esc(o.value)}" ${o.value === value ? 'selected' : ''}>${_esc(o.label)}</option>`).join('')}
            </select>`;
        }
        return `<input type="text" class="form-input" id="std_${col.key}" value="${val}">`;
    }

    function openStandardRowModal(carModel, partName, index) {
        const cfg = STANDARD_DOC_TYPES[_curDocType];
        if (!cfg) return;
        if (!carModel || !partName) {
            UIUtils.toast('차종과 품명을 확인할 수 없습니다.', 'warning');
            return;
        }
        _stdEditContext = { carModel, partName, index: Number(index) };
        const rec = _getLinkedStandardRecord(_curDocType, carModel, partName);
        const rows = rec && Array.isArray(rec.rows) ? rec.rows : [];
        const row = Number(index) >= 0 ? (rows[Number(index)] || {}) : {};
        const body = `
            <div style="margin-bottom:12px; padding:10px 12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary); font-size:13px;">
                <strong>${_esc(carModel)}</strong> / ${_esc(partName)}
            </div>
            <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;">
                ${cfg.columns.map(col => `
                    <div class="form-group" style="${col.key === 'note' || col.key === 'linkedItem' ? 'grid-column:1 / -1;' : ''}">
                        <label class="form-label">${col.label}</label>
                        ${_standardInputHtml(col, row[col.key], carModel, partName)}
                    </div>
                `).join('')}
            </div>
        `;
        UIUtils.showModal(
            `${cfg.label} ${Number(index) >= 0 ? '수정' : '등록'}`,
            body,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="ProdStandardsModule.saveStandardRow()">저장</button>`,
            'lg'
        );
    }

    async function saveStandardRow() {
        const cfg = STANDARD_DOC_TYPES[_curDocType];
        if (!cfg) return;
        const ctx = _stdEditContext;
        if (!ctx || !ctx.carModel || !ctx.partName) {
            UIUtils.toast('저장할 차종/품명 정보가 없습니다.', 'warning');
            return;
        }
        const row = {};
        cfg.columns.forEach(col => {
            const el = document.getElementById('std_' + col.key);
            row[col.key] = el ? String(el.value || '').trim() : '';
        });
        if (!Object.values(row).some(Boolean)) {
            UIUtils.toast('저장할 기준 내용을 입력하세요.', 'warning');
            return;
        }

        const existing = _getLinkedStandardRecord(_curDocType, ctx.carModel, ctx.partName);
        const rows = existing && Array.isArray(existing.rows) ? [...existing.rows] : [];
        if (ctx.index >= 0 && rows[ctx.index]) rows[ctx.index] = row;
        else rows.push(row);

        const payload = {
            _docKind: STANDARD_DOC_KIND,
            standardType: _curDocType,
            standardLabel: cfg.label,
            carModel: ctx.carModel,
            partName: ctx.partName,
            rows,
            updatedAt: UIUtils.now()
        };
        if (existing) await Storage.update(STORE, existing.id, payload);
        else await Storage.add(STORE, payload);

        UIUtils.closeModal();
        _stdEditContext = null;
        UIUtils.toast('기준서가 저장되었습니다.', 'success');
        _renderLinkedStandardTable();
    }

    async function deleteStandardRow(carModel, partName, index) {
        const existing = _getLinkedStandardRecord(_curDocType, carModel, partName);
        if (!existing || !Array.isArray(existing.rows) || !existing.rows[index]) return;
        if (!confirm('선택한 기준을 삭제하시겠습니까?')) return;
        const rows = existing.rows.filter((_, i) => i !== index);
        await Storage.update(STORE, existing.id, { ...existing, rows, updatedAt: UIUtils.now() });
        UIUtils.toast('삭제되었습니다.', 'success');
        _renderLinkedStandardTable();
    }

    function exportStandardDoc() {
        const cfg = STANDARD_DOC_TYPES[_curDocType];
        const records = Storage.getAll(STORE).filter(r =>
            r._docKind === STANDARD_DOC_KIND && r.standardType === _curDocType && Array.isArray(r.rows));
        const exportRows = [];
        records.forEach(rec => {
            rec.rows.forEach(row => {
                exportRows.push([rec.carModel || '', rec.partName || '', ...cfg.columns.map(c => row[c.key] || '')]);
            });
        });
        if (!cfg || exportRows.length === 0) {
            UIUtils.toast('내보낼 기준서 데이터가 없습니다.', 'warning');
            return;
        }
        const headers = ['차종', '품명', ...cfg.columns.map(c => c.label)];
        Storage.exportToCSV(headers, exportRows, `${cfg.label}_전차종`);
    }

    function _standardPrintRows(type) {
        const cfg = STANDARD_DOC_TYPES[type];
        if (!cfg) return [];
        const products = _allProductRows();
        const rows = [];
        products.forEach(p => {
            const rec = _getLinkedStandardRecord(type, p.carModel, p.partName);
            const savedRows = rec && Array.isArray(rec.rows) ? rec.rows : [];
            if (savedRows.length) {
                savedRows.forEach(row => rows.push({ carModel:p.carModel, partName:p.partName, data:row }));
            } else {
                rows.push({ carModel:p.carModel, partName:p.partName, data:{} });
            }
        });
        return rows;
    }

    function _printColumnLabel(col) {
        if (col.key === 'process') return '공정';
        if (col.key === 'linkedItem') return '관리계획서 항목';
        return col.label;
    }

    function _printDocNo(type) {
        const seq = Object.keys(STANDARD_DOC_TYPES).indexOf(type) + 1;
        return `KC-P-STD-${String(seq).padStart(2, '0')}`;
    }

    function _formatPrintDate(date) {
        const d = date || new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}. ${mm}. ${dd}`;
    }

    function openStandardPrintPage() {
        const cfg = STANDARD_DOC_TYPES[_curDocType];
        if (!cfg) return;
        const rows = _standardPrintRows(_curDocType);
        if (rows.length === 0) {
            UIUtils.toast('인쇄할 제품 마스터가 없습니다.', 'warning');
            return;
        }

        const printCols = cfg.columns.filter(c => c.key !== 'note');
        const half = Math.ceil(rows.length / 2);
        const chunks = [rows.slice(0, half), rows.slice(half)];
        const today = _formatPrintDate();
        const subtitle = cfg.label.replace(/\s*기준서\s*$/, ' 관리');

        const tableHtml = (chunk) => `
            <table class="standard-table">
                <thead>
                    <tr>
                        <th class="col-car">차종</th>
                        <th class="col-part">품명</th>
                        ${printCols.map(c => `<th>${_esc(_printColumnLabel(c))}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${chunk.map(entry => `
                        <tr>
                            <td>${_esc(entry.carModel)}</td>
                            <td>${_esc(entry.partName)}</td>
                            ${printCols.map(c => `<td>${_esc(entry.data[c.key] || '')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const win = window.open('', '_blank', 'width=1400,height=900,scrollbars=yes,resizable=yes');
        if (!win) {
            UIUtils.toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'warning');
            return;
        }

        win.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${_esc(cfg.label)} 인쇄</title>
<style>
@page { size: A3 landscape; margin: 8mm; }
* { box-sizing: border-box; }
body {
    margin: 0;
    background: #ececec;
    color: #000;
    font-family: "Malgun Gothic", "맑은 고딕", Arial, sans-serif;
}
.toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 14px;
    background: #202124;
}
.toolbar button {
    border: 1px solid #d0d7de;
    background: #fff;
    color: #111;
    border-radius: 4px;
    padding: 7px 14px;
    font-weight: 700;
    cursor: pointer;
}
.sheet {
    width: 420mm;
    min-height: 297mm;
    margin: 10px auto;
    background: #fff;
    border: 1px solid #000;
}
.doc-header {
    display: grid;
    grid-template-columns: 260px 1fr 370px;
    border-bottom: 2px solid #000;
}
.meta-grid {
    display: grid;
    grid-template-columns: 110px 150px;
    grid-template-rows: 78px 78px;
}
.meta-grid div,
.approval div {
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
}
.meta-label { font-size: 23px; }
.meta-value { font-size: 18px; }
.title-box {
    border-right: 1px solid #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 34px;
}
.title-main { font-size: 30px; letter-spacing: 0; }
.title-sub { font-size: 30px; letter-spacing: 0; }
.approval {
    display: grid;
    grid-template-columns: 36px repeat(3, 1fr);
    grid-template-rows: 52px 104px;
}
.approval .vertical {
    grid-row: 1 / 3;
    writing-mode: vertical-rl;
    text-orientation: upright;
    font-size: 17px;
    letter-spacing: 3px;
    border-right: 1px solid #000;
}
.approval .sign-title {
    font-size: 15px;
    letter-spacing: 8px;
}
.approval .sign-cell { position: relative; }
.approval .stamp {
    position: absolute;
    left: 36px;
    right: 36px;
    top: 6px;
    height: 44px;
    border: 1px solid #6ea8ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 400;
}
.content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px;
    padding-top: 8px;
}
.standard-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 12px;
}
.standard-table th,
.standard-table td {
    border: 1px solid #000;
    height: 32px;
    padding: 3px 5px;
    text-align: center;
    vertical-align: middle;
    word-break: keep-all;
    overflow-wrap: anywhere;
}
.standard-table th {
    background: #d6dde6;
    font-weight: 700;
    height: 42px;
}
.standard-table .col-car { width: 74px; }
.standard-table .col-part { width: 88px; }
@media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet {
        width: auto;
        min-height: auto;
        margin: 0;
        border: 1px solid #000;
        page-break-after: avoid;
    }
    .standard-table {
        font-size: 10.5px;
    }
    .standard-table th,
    .standard-table td {
        height: 27px;
        padding: 2px 4px;
    }
}
</style>
</head>
<body>
<div class="toolbar">
    <button onclick="window.print()">인쇄</button>
    <button onclick="window.close()">닫기</button>
</div>
<section class="sheet">
    <header class="doc-header">
        <div class="meta-grid">
            <div class="meta-label">문서번호</div>
            <div class="meta-value">${_esc(_printDocNo(_curDocType))}</div>
            <div class="meta-label">제정일</div>
            <div class="meta-value">${_esc(today)}</div>
        </div>
        <div class="title-box">
            <div class="title-main">작업기준서</div>
            <div class="title-sub">${_esc(subtitle)}</div>
        </div>
        <div class="approval">
            <div class="vertical">결재</div>
            <div class="sign-title">작성</div>
            <div class="sign-title">검토</div>
            <div class="sign-title">승인</div>
            <div class="sign-cell"><div class="stamp">내부 결재</div></div>
            <div class="sign-cell"></div>
            <div class="sign-cell"></div>
        </div>
    </header>
    <main class="content">
        <div>${tableHtml(chunks[0])}</div>
        <div>${tableHtml(chunks[1])}</div>
    </main>
</section>
<script>
window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 250);
});
</script>
</body>
</html>`);
        win.document.close();
    }

    // ── 도면 파일 섹션 HTML ───────────────────────────────────────
    function _drawingSectionHtml(rec) {
        // _remove 플래그가 있으면 삭제 상태 → 도면 없음으로 표시
        const drawing = (_pendingDrawing && !_pendingDrawing._remove)
                      ? _pendingDrawing
                      : (!_pendingDrawing && rec && rec.drawing ? rec.drawing : null);
        const hasDrw  = !!(drawing && drawing.data);
        return `
        <div style="margin-top:24px; border-top:2px solid var(--accent-blue); padding-top:18px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue); font-size:20px;">picture_as_pdf</span>
                <span style="font-weight:700; font-size:15px; color:var(--accent-blue);">도면 파일 (PDF)</span>
            </div>

            ${hasDrw ? `
            <!-- 도면 있음 -->
            <div style="display:flex; align-items:center; gap:12px; padding:14px 16px;
                        background:var(--bg-secondary); border-radius:10px; border:1px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="font-size:32px; color:var(--accent-red);">picture_as_pdf</span>
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:14px;">${drawing.name}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                        업로드: ${drawing.uploadedAt ? drawing.uploadedAt.substring(0,16) : '-'}
                        &nbsp;·&nbsp; ${drawing.size ? (drawing.size / 1024).toFixed(0) + ' KB' : ''}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="ProdStandardsModule.openDrawingViewer()"
                    style="display:flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:15px;">open_in_new</span> 열기
                </button>
                <button class="btn btn-outline btn-sm" onclick="ProdStandardsModule.changeDrawing()"
                    style="display:flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 교체
                </button>
                <button class="btn btn-sm" style="border:1px solid var(--accent-red); color:var(--accent-red); background:transparent;"
                    onclick="ProdStandardsModule.removeDrawing()">
                    <span class="material-symbols-outlined" style="font-size:15px;">delete</span>
                </button>
            </div>
            ` : `
            <!-- 도면 없음 -->
            <div id="psDrawDropZone"
                style="border:2px dashed var(--border-color); border-radius:10px; padding:30px;
                       text-align:center; cursor:pointer; transition:border-color .2s;"
                onclick="document.getElementById('psDrawFileInput').click()"
                ondragover="event.preventDefault(); this.style.borderColor='var(--accent-blue)';"
                ondragleave="this.style.borderColor='var(--border-color)';"
                ondrop="event.preventDefault(); this.style.borderColor='var(--border-color)'; ProdStandardsModule.onDrawingDrop(event);">
                <span class="material-symbols-outlined" style="font-size:36px; color:var(--text-muted); display:block; margin-bottom:8px;">upload_file</span>
                <div style="font-weight:600; color:var(--text-muted);">PDF 파일을 클릭하거나 드래그하여 업로드</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">지원 형식: PDF</div>
            </div>
            `}
            <input type="file" id="psDrawFileInput" accept=".pdf,application/pdf" style="display:none;"
                onchange="ProdStandardsModule.onDrawingFileChange(this)">
        </div>
        `;
    }

    // ── 도면 파일 함수 ────────────────────────────────────────────
    function onDrawingFileChange(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            UIUtils.toast('PDF 파일만 업로드 가능합니다.', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            _pendingDrawing = {
                name: file.name,
                data: e.target.result,   // base64 data URL
                size: file.size,
                uploadedAt: UIUtils.now()
            };
            // 도면 섹션만 갱신
            _refreshDrawingSection();
        };
        reader.readAsDataURL(file);
    }

    function onDrawingDrop(event) {
        const file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        const fakeInput = { files: [file] };
        onDrawingFileChange(fakeInput);
    }

    function changeDrawing() {
        const inp = document.getElementById('psDrawFileInput');
        if (inp) inp.click();
    }

    function removeDrawing() {
        UIUtils.confirm('도면 파일을 삭제하시겠습니까?', async () => {
            _pendingDrawing = { _remove: true, name: null, data: null };
            _refreshDrawingSection();
        });
    }

    function _refreshDrawingSection() {
        // 도면은 수입검사/사출소재 입고 기준으로 고정
        const rec = _getRecord(_curCarModel, _curPartName, '수입검사', '사출소재 입고', '');
        const wrapper = document.querySelector('.ps-drawing-section');
        if (!wrapper) return;
        wrapper.innerHTML = _drawingSectionHtml(rec);
    }

    function openDrawingViewer() {
        // 현재 _pendingDrawing 또는 저장된 도면 가져오기
        const line = _getCarConfig(_curLine || '')[_curProcess] && _getCarConfig(_curLine || '')[_curProcess].lines ? _curLine : '';
        const rec  = _getRecord(_curCarModel, _curPartName, _curProcess, _curStation, line);
        const drawing = (_pendingDrawing && !_pendingDrawing._remove) ? _pendingDrawing
                      : (rec && rec.drawing ? rec.drawing : null);
        if (!drawing || !drawing.data) {
            UIUtils.toast('도면 파일이 없습니다.', 'warning');
            return;
        }

        // base64 → Blob URL
        const b64 = drawing.data.split(',')[1];
        const byteChars = atob(b64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob    = new Blob([byteArr], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        const title = `${_curCarModel} / ${_curPartName} — ${drawing.name}`;
        const win = window.open('', '_blank',
            'width=1100,height=860,scrollbars=yes,resizable=yes,menubar=no,toolbar=no');
        if (!win) { UIUtils.toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'warning'); return; }

        win.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{display:flex;flex-direction:column;height:100vh;background:#2b2b2b;font-family:'Segoe UI',sans-serif;}
  .toolbar{
    background:#1a1a2e;color:#fff;padding:10px 18px;
    display:flex;align-items:center;gap:10px;
    box-shadow:0 2px 8px rgba(0,0,0,.5);
    flex-shrink:0;
    user-select:none;
  }
  .toolbar .title{font-size:13px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}
  .toolbar button{
    background:#2d3561;color:#fff;border:none;border-radius:6px;
    padding:6px 14px;font-size:13px;cursor:pointer;
    display:flex;align-items:center;gap:4px;transition:background .15s;
  }
  .toolbar button:hover{background:#3d4d8a;}
  .toolbar .zoom-label{
    min-width:52px;text-align:center;font-size:14px;font-weight:700;
    background:#111;padding:4px 10px;border-radius:6px;
  }
  .toolbar .sep{width:1px;height:24px;background:#3a3a5c;margin:0 4px;}
  .viewer{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:20px;}
  .pdf-outer{display:flex;justify-content:center;}
  .pdf-scaler{transform-origin:top center;transition:transform .18s ease;}
  embed,iframe{display:block;border:none;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.5);}
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="zoomOut()" title="축소 (-)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M7 9h5v1H7z"/></svg>
    축소
  </button>
  <div class="zoom-label" id="zoomLabel">100%</div>
  <button onclick="zoomIn()" title="확대 (+)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M7 9h5v1H7z"/><path d="M9 7v5h1V7z"/></svg>
    확대
  </button>
  <button onclick="resetZoom()" title="원래 크기">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
    초기화
  </button>
  <button onclick="fitWidth()" title="너비 맞춤">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v2H5v14h14v-6h2v8H3V3zm14 0h4v4h-2V5.41l-7.29 7.3-1.42-1.42L17.59 4H15V2z"/></svg>
    너비맞춤
  </button>
  <div class="sep"></div>
  <button onclick="printPdf()" title="인쇄">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
    인쇄
  </button>
  <div class="sep"></div>
  <div class="title">${title}</div>
</div>
<div class="viewer" id="viewer">
  <div class="pdf-outer">
    <div class="pdf-scaler" id="scaler">
      <embed id="pdfEmbed" src="${blobUrl}" type="application/pdf"
        width="900" height="1150">
    </div>
  </div>
</div>
<script>
  var scale = 1;
  var STEP  = 0.15;
  var MIN   = 0.3;
  var MAX   = 3.5;
  var scaler    = document.getElementById('scaler');
  var zoomLabel = document.getElementById('zoomLabel');
  var viewer    = document.getElementById('viewer');

  function applyScale() {
    scaler.style.transform = 'scale(' + scale + ')';
    // 스케일 후 실제 크기로 outer 높이 보정
    var embed = document.getElementById('pdfEmbed');
    var h = embed ? embed.offsetHeight * scale : 0;
    scaler.parentElement.style.height = (h + 40) + 'px';
    scaler.parentElement.style.width  = (embed ? embed.offsetWidth * scale : 900) + 'px';
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }
  function zoomIn()    { scale = Math.min(MAX, parseFloat((scale + STEP).toFixed(2))); applyScale(); }
  function zoomOut()   { scale = Math.max(MIN, parseFloat((scale - STEP).toFixed(2))); applyScale(); }
  function resetZoom() { scale = 1; applyScale(); }
  function fitWidth()  {
    var vw  = viewer.clientWidth - 40;
    var ew  = 900;
    scale   = parseFloat((vw / ew).toFixed(2));
    applyScale();
  }
  function printPdf()  {
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = '${blobUrl}';
    document.body.appendChild(iframe);
    iframe.onload = function() { iframe.contentWindow.print(); };
  }

  // 마우스 휠 줌 (Ctrl + 휠)
  viewer.addEventListener('wheel', function(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  }, { passive: false });

  // 키보드 단축키
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomIn(); }
    if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOut(); }
    if (e.ctrlKey && e.key === '0') { e.preventDefault(); resetZoom(); }
  });

  window.addEventListener('load', function() { applyScale(); });
<\/script>
</body>
</html>`);
        win.document.close();
    }

    // 추가 파라미터 행 삽입
    function addParamRow() {
        const cfg = _getCarConfig(_curLine || '')[_curProcess];
        if (!cfg) return;
        const stationNames = Object.keys(cfg.stations);
        if (!_curStation || !cfg.stations[_curStation]) _curStation = stationNames[0];
        const params = cfg.stations[_curStation];
        const line = cfg.storeLine ? cfg.storeLine : '';

        const newKey = 'custom_' + Date.now();
        _extraRows.push({ key: newKey, label: '', unit: '' });

        // 기존 저장 데이터
        const rec = _getRecord(_curCarModel, _curPartName, _curProcess, _curStation, line);
        const saved = rec ? (rec.params || {}) : {};

        const tbody = document.getElementById('psParamTbody');
        if (!tbody) { _renderParamTable(); return; }

        const rowIdx = params.length + _extraRows.length;
        const tr = document.createElement('tr');
        tr.id = 'psExtraRow_' + newKey;
        tr.innerHTML = `
            <td style="text-align:center; color:var(--accent-orange); font-size:12px;">${rowIdx}</td>
            <td style="border-right:1px dashed var(--border-color);">
                <input type="text" class="form-input" style="height:28px; font-size:12px; font-weight:600;"
                    id="psParam_itemProd_${newKey}" value="" placeholder="제품 관리항목"></td>
            <td>
                <input type="text" class="form-input" style="height:28px; font-size:12px;"
                    id="psParam_itemProc_${newKey}" value="" placeholder="공정 관리항목"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px; text-align:center; width:56px;"
                id="psParam_special_${newKey}" value="" placeholder="F/P"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px; text-align:center;"
                id="psExtra_unit_${newKey}" value="" placeholder="단위"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px;"
                id="psParam_val_${newKey}" value="" placeholder="기준값"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px;"
                id="psParam_range_${newKey}" value="" placeholder="예: 20~30"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px;"
                id="psParam_method_${newKey}" value="" placeholder="육안/측정기"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px;"
                id="psParam_cycle_${newKey}" value="" placeholder="1회/일"></td>
            <td><input type="text" class="form-input" style="height:28px; font-size:12px;"
                id="psParam_control_${newKey}" value="" placeholder="관리방안"></td>
            <td>
                <div style="display:flex; flex-direction:column; gap:2px; font-size:11px;">
                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="psParam_resp_prod_${newKey}" style="width:13px;height:13px;"> 생산
                    </label>
                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="psParam_resp_mat_${newKey}"  style="width:13px;height:13px;"> 자재
                    </label>
                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                        <input type="checkbox" id="psParam_resp_qc_${newKey}"   style="width:13px;height:13px;"> QC
                    </label>
                </div>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-danger" style="padding:2px 6px;"
                    onclick="ProdStandardsModule.removeExtraRow('${newKey}')">
                    <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        // 포커스 이동
        const labelInput = document.getElementById('psParam_itemProd_' + newKey);
        if (labelInput) labelInput.focus();
    }

    // 추가 파라미터 행 삭제
    function removeExtraRow(key) {
        _extraRows = _extraRows.filter(r => r.key !== key);
        const row = document.getElementById('psExtraRow_' + key);
        if (row) row.remove();

        // 번호 재정렬
        const cfg = _getCarConfig(_curLine || '')[_curProcess];
        const fixedCount = cfg ? Object.keys(cfg.stations[_curStation] || {}).length : 0;
        // params 배열 길이
        const paramsLen = cfg && cfg.stations[_curStation] ? cfg.stations[_curStation].length : 0;
        _extraRows.forEach((r, i) => {
            const tr = document.getElementById('psExtraRow_' + r.key);
            if (tr) {
                const numCell = tr.querySelector('td:first-child');
                if (numCell) numCell.textContent = paramsLen + i + 1;
            }
        });
    }

    // ── 이벤트 핸들러 ─────────────────────────────────────────────
    async function onCarChange() {
        const sel = document.getElementById('psCarModelSel');
        _curCarModel = sel ? sel.value : '';
        _curPartName = '';
        _pendingDrawing = null;
        _extraRows = [];
        // 차종 변경 시 품명 미선택 → 흐름 초기화
        _cpSelectedFlow = [...CANONICAL_PROCESS_ORDER];
        _syncCpLineFromFlow();
        _refreshCpFlowUI();

        // 품명 드롭다운 업데이트
        const partSel = document.getElementById('psPartNameSel');
        if (partSel) {
            const products = Storage.getAll(DB.STORES.PRODUCTS);
            const parts = products.filter(p => !_curCarModel || p.carModel === _curCarModel).map(p => p.partName).filter(Boolean);
            partSel.innerHTML = `<option value="">-- 품명 선택 --</option>` +
                parts.map(p => `<option value="${p}">${p}</option>`).join('');
        }

        // 라인별 커스텀 설정 미리 로드 (이후 렌더링에서 동기로 사용)
        await _ensureCarConfig(_curLine || 'A라인');

        _updateBadge();
        if (_curDocType === DOC_CONTROL_PLAN) _renderParamTable();
        else _renderLinkedStandardTable();
    }

    function onPartChange() {
        const sel = document.getElementById('psPartNameSel');
        _curPartName = sel ? sel.value : '';
        _pendingDrawing = null;   // 품명 변경 시 도면 초기화
        _extraRows = [];

        // 공정 흐름 자동 결정: 제품 공정사양 → 저장 파라미터 → CP 이력 → 기본값(전체) 순 우선
        if (_curCarModel && _curPartName) {
            // ① 제품 정보의 공정별 사양(process1~4)에서 흐름 추출 — 최우선 기준
            // 제품 공정명(도장-A/도장-B/레이저) → CP 흐름명(도장(A)/도장(B)/레이져) 매핑
            const PROD_PROC_MAP = { '도장-A': '도장(A)', '도장-B': '도장(B)', '레이저': '레이져' };
            const prodInfo = (Storage.getAll(DB.STORES.PRODUCTS) || []).find(
                p => p.carModel === _curCarModel && p.partName === _curPartName
            );
            const prodMappedProcs = prodInfo
                ? [prodInfo.process1, prodInfo.process2, prodInfo.process3, prodInfo.process4]
                    .filter(Boolean)
                    .map(p => PROD_PROC_MAP[p])
                    .filter(Boolean)
                : [];

            if (prodMappedProcs.length > 0) {
                // 제품 공정사양 기준으로 canonical 순서에서 해당 공정만 포함
                _cpSelectedFlow = CANONICAL_PROCESS_ORDER.filter(p =>
                    COMMON_PROCESSES.has(p) || prodMappedProcs.includes(p)
                );
            } else {
                // ② 제품 정보 없거나 매핑 불가 → 저장된 파라미터 레코드에서 추출
                const savedRecs = Storage.getAll(STORE).filter(
                    s => s.carModel === _curCarModel && s.partName === _curPartName
                         && s._docKind !== STANDARD_DOC_KIND
                );
                if (savedRecs.length > 0) {
                    const usedProcs = new Set(savedRecs.map(r => r.process));
                    const flowFromData = CANONICAL_PROCESS_ORDER.filter(p =>
                        COMMON_PROCESSES.has(p) || usedProcs.has(p)
                    );
                    savedRecs.forEach(r => {
                        if (!flowFromData.includes(r.process)) flowFromData.push(r.process);
                    });
                    _cpSelectedFlow = flowFromData;
                } else {
                    // ③ 저장 데이터도 없음 → CP 이력 복원
                    const hist = _loadCpHistory().find(
                        h => h.carModel === _curCarModel && h.partName === _curPartName
                    );
                    if (hist && Array.isArray(hist.flow) && hist.flow.length > 0) {
                        _cpSelectedFlow = hist.flow;
                    } else {
                        // ④ 이력도 없음 → 전체 기본 흐름(도장(A)→레이져→도장(B) 포함)
                        _cpSelectedFlow = [...CANONICAL_PROCESS_ORDER];
                    }
                }
            }
            _syncCpLineFromFlow();
            _refreshCpFlowUI();
        }

        _updateBadge();
        if (_curDocType === DOC_CONTROL_PLAN) _renderParamTable();
        else _renderLinkedStandardTable();
    }

    function selectDocType(type) {
        _curDocType = STANDARD_DOC_TYPES[type] ? type : DOC_CONTROL_PLAN;
        _pendingDrawing = null;
        _extraRows = [];
        _renderStandardsDetail(document.getElementById('contentArea'));
    }

    function _updateBadge() {
        const badge = document.getElementById('psSelectedBadge');
        if (badge) {
            if (_curCarModel && _curPartName) {
                badge.style.display = 'block';
                badge.textContent = `${_curCarModel} · ${_curPartName}`;
            } else {
                badge.style.display = 'none';
            }
        }

        // 관리계획서 업로드 상태 + 버튼
        const cpBadge = document.getElementById('psCpStatusBadge');
        if (!cpBadge) return;
        if (!_curCarModel || !_curPartName) {
            cpBadge.style.display = 'none';
            return;
        }

        // 이력(파일 업로드 기록) + 실제 저장 데이터를 모두 확인 → 실제 데이터 유무가 기준
        const history  = _loadCpHistory();
        const histFound = history.find(h => h.carModel === _curCarModel && h.partName === _curPartName);
        const allStds   = Storage.getAll(DB.STORES.PROD_STANDARDS);
        const cpStds    = allStds.filter(s =>
            s.carModel === _curCarModel && s.partName === _curPartName && s._docKind !== STANDARD_DOC_KIND);
        const hasSaved  = cpStds.length > 0;
        // importId: 이력에서 먼저 찾고 없으면 실제 레코드에서 추출
        const importId  = (histFound && histFound.importId) ||
                          (cpStds.find(Boolean) || {}).importId || '';

        cpBadge.style.display    = 'flex';
        cpBadge.style.alignItems = 'center';
        cpBadge.style.gap        = '10px';

        if (hasSaved) {
            // ── 파라미터 데이터 있음 ──────────────────────────────
            const subLabel = histFound
                ? `${histFound.fileName} · ${(histFound.uploadedAt||'').substring(0,10)}`
                : `직접 입력 · ${_curCarModel} / ${_curPartName}`;
            cpBadge.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;
                            padding:8px 14px; border-radius:8px;
                            background:#dcfce7; border:1.5px solid #16a34a; color:#15803d;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:#16a34a;">task_alt</span>
                    <div>
                        <div style="font-weight:700; font-size:13px;">파라미터 등록됨</div>
                        <div style="font-size:11px; opacity:.85;">${subLabel}</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="document.getElementById('cpUploadInput').click()"
                    style="display:flex; align-items:center; gap:4px; font-size:12px; white-space:nowrap;
                           border-color:#16a34a; color:#15803d;">
                    <span class="material-symbols-outlined" style="font-size:14px;">upload_file</span>
                    ${histFound ? '재업로드' : '관리계획서 업로드'}
                </button>
                <button class="btn btn-sm btn-outline" title="파라미터 값 초기화 (이력·매핑 유지)"
                    onclick="ProdStandardsModule.resetCpParams('${importId}','${_esc(_curCarModel)}','${_esc(_curPartName)}')"
                    style="display:flex; align-items:center; gap:4px; font-size:12px; white-space:nowrap;
                           border-color:var(--accent-orange); color:var(--accent-orange);">
                    <span class="material-symbols-outlined" style="font-size:14px;">restart_alt</span>
                    파라미터 초기화
                </button>`;
        } else {
            // ── 파라미터 데이터 없음 ──────────────────────────────
            cpBadge.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;
                            padding:8px 14px; border-radius:8px;
                            background:#fef9c3; border:1.5px solid #ca8a04; color:#92400e;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:#ca8a04;">warning</span>
                    <div>
                        <div style="font-weight:700; font-size:13px;">관리계획서 미등록</div>
                        <div style="font-size:11px; opacity:.85;">${_curCarModel} / ${_curPartName}</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="document.getElementById('cpUploadInput').click()"
                    style="display:flex; align-items:center; gap:4px; font-size:12px; white-space:nowrap;">
                    <span class="material-symbols-outlined" style="font-size:14px;">upload_file</span>
                    관리계획서 업로드
                </button>`;
        }
    }

    function selectProcess(name) {
        _curProcess = name;
        _extraRows = [];
        _pendingDrawing = null;
        const carCfg = _getCarConfig(_curLine || '');
        const cfg = carCfg[name];
        if (cfg) {
            const stationNames = Object.keys(cfg.stations);
            _curStation = stationNames[0];
        }

        // 탭 버튼 활성화
        Object.keys(carCfg).forEach(n => {
            const btn = document.getElementById('psTab_' + n);
            if (btn) btn.className = `btn ${n === name ? 'btn-primary' : 'btn-outline'}`;
        });

        _renderSubTabs();
        _renderParamTable();
    }

    function selectStation(name) {
        _curStation = name;
        _extraRows = [];
        _renderSubTabs();
        _renderParamTable();
    }

    function selectLine(name) {
        _curLine = name;
        _extraRows = [];
        _renderSubTabs();
        _renderParamTable();
    }

    // ── 저장 ─────────────────────────────────────────────────────
    async function saveParams() {
        if (!_curCarModel || !_curPartName) {
            UIUtils.toast('차종과 품명을 선택하세요.', 'warning');
            return;
        }
        const cfg = _getCarConfig(_curLine || '')[_curProcess];
        if (!cfg) return;

        const stationNames = Object.keys(cfg.stations);
        if (!_curStation || !cfg.stations[_curStation]) _curStation = stationNames[0];
        const params = cfg.stations[_curStation];
        const line = cfg.storeLine ? cfg.storeLine : '';

        // 파라미터 한 항목 수집 헬퍼
        function _collectParam(key) {
            const g = id => (document.getElementById(id) || {});
            return {
                itemProd: g('psParam_itemProd_' + key).value || '',
                itemProc: g('psParam_itemProc_' + key).value || '',
                value:    g('psParam_val_'      + key).value || '',
                range:    g('psParam_range_'    + key).value || '',
                special:  g('psParam_special_'  + key).value || '',
                method:   g('psParam_method_'   + key).value || '',
                cycle:    g('psParam_cycle_'    + key).value || '',
                control:  g('psParam_control_'  + key).value || '',
                action:   g('psParam_action_'   + key).value || '',
                resp: {
                    prod: !!(g('psParam_resp_prod_' + key).checked),
                    mat:  !!(g('psParam_resp_mat_'  + key).checked),
                    qc:   !!(g('psParam_resp_qc_'   + key).checked),
                },
            };
        }

        // 기본 파라미터 수집
        const paramData = {};
        params.forEach(p => {
            paramData[p.key] = _collectParam(p.key);
        });

        // 추가 파라미터 수집 (itemProd/itemProc/unit도 같이 저장)
        const customParamDefs = [];
        _extraRows.forEach(r => {
            const unitEl     = document.getElementById('psExtra_unit_' + r.key);
            const itemProdEl = document.getElementById('psParam_itemProd_' + r.key);
            const itemProcEl = document.getElementById('psParam_itemProc_' + r.key);
            const itemProd = itemProdEl ? itemProdEl.value.trim() : '';
            const itemProc = itemProcEl ? itemProcEl.value.trim() : '';
            const label    = itemProd || itemProc;  // 대표 레이블 (하위 호환)
            const unit     = unitEl   ? unitEl.value.trim() : r.unit;
            if (!label) return; // 둘 다 비어 있으면 스킵
            customParamDefs.push({ key: r.key, label, itemProd, itemProc, unit });
            paramData[r.key] = _collectParam(r.key);
        });

        const existing = _getRecord(_curCarModel, _curPartName, _curProcess, _curStation, line);

        // 도면 파일 처리
        let drawingToSave = existing ? (existing.drawing || null) : null;
        if (_pendingDrawing) {
            if (_pendingDrawing._remove) {
                drawingToSave = null;
            } else {
                drawingToSave = _pendingDrawing;
            }
        }

        const payload = {
            carModel:     _curCarModel,
            partName:     _curPartName,
            process:      _curProcess,
            station:      _curStation,
            line:         line,
            params:       paramData,
            customParams: customParamDefs,
            drawing:      drawingToSave,
            updatedAt:    UIUtils.now()
        };

        if (existing) {
            await Storage.update(STORE, existing.id, payload);
        } else {
            await Storage.add(STORE, payload);
        }

        _pendingDrawing = null;   // 저장 완료 후 초기화
        UIUtils.toast('저장되었습니다.', 'success');
        _renderParamTable();
    }

    // ── 전체 공정 일괄 저장 (CP 형식 통합 테이블용) ─────────────
    async function saveAllParams() {
        if (!_curCarModel || !_curPartName) {
            UIUtils.toast('차종과 품명을 선택하세요.', 'warning');
            return;
        }

        const g = id => (document.getElementById(id) || {});
        let savedCount = 0;

        for (const [procName, cfg] of Object.entries(_getCarConfig(_curLine || ''))) {
            const line = cfg.storeLine ? cfg.storeLine : '';

            for (const [stName, fixedParams] of Object.entries(cfg.stations)) {
                const existing  = _getRecord(_curCarModel, _curPartName, procName, stName, line);
                const prevSaved = existing ? (existing.params || {}) : {};
                const savedCust = existing ? (existing.customParams || []) : [];

                const paramData = {};

                // 고정 파라미터: 화면 input에서 수집 (없으면 기존 저장값 유지)
                fixedParams.forEach(p => {
                    const iProd    = g('psParam_itemProd_'  + p.key);
                    const iProc    = g('psParam_itemProc_'  + p.key);
                    const iSpec    = g('psParam_val_'       + p.key);
                    const iSpecial = g('psParam_special_'   + p.key);
                    const iFp      = g('psParam_fp_'        + p.key);
                    const iMethod  = g('psParam_method_'    + p.key);
                    const iCycle   = g('psParam_cycle_'     + p.key);
                    const iControl = g('psParam_control_'   + p.key);
                    const prev     = prevSaved[p.key] || {};
                    const _n = s => String(s||'').replace(/\s+/g,'');
                    let _vProd = iProd.value !== undefined ? iProd.value : (prev.itemProd || '');
                    let _vProc = iProc.value !== undefined ? iProc.value : (prev.itemProc || '');
                    // 중복 방지: 같은 값이면 itemType에 맞는 쪽만 저장
                    if (_vProd && _vProc && _n(_vProd) === _n(_vProc)) {
                        if (p.itemType === 'prod') _vProc = '';
                        else                       _vProd = '';
                    }
                    paramData[p.key] = {
                        itemProd: _vProd,
                        itemProc: _vProc,
                        value:    iSpec.value    !== undefined ? iSpec.value    : (prev.value    || ''),
                        range:    prev.range  || '',
                        special:  iSpecial ? (iSpecial.dataset ? (iSpecial.dataset.value || '') : (iSpecial.value || '')) : (prev.special || ''),
                        fp:       iFp       ? (iFp.dataset      ? (iFp.dataset.value      || '') : (iFp.value      || '')) : (prev.fp      || ''),
                        method:   iMethod.value  !== undefined ? iMethod.value  : (prev.method   || ''),
                        cycle:    iCycle.value   !== undefined ? iCycle.value   : (prev.cycle    || ''),
                        control:  iControl.value !== undefined ? iControl.value : (prev.control  || ''),
                        action:   prev.action || '',
                        resp:     prev.resp   || { prod:false, mat:false, qc:false },
                    };
                });

                // 커스텀 파라미터: input 있으면 업데이트, 없으면 기존 값 유지
                savedCust.forEach(cp => {
                    const prev = prevSaved[cp.key] || {};
                    const gv   = id => { const el = g(id); return el.value !== undefined ? el.value : ''; };
                    paramData[cp.key] = {
                        itemProd: gv('psParam_itemProd_' + cp.key) || prev.itemProd || '',
                        itemProc: gv('psParam_itemProc_' + cp.key) || prev.itemProc || '',
                        value:    gv('psParam_val_'      + cp.key) || prev.value    || '',
                        special:  gv('psParam_special_'  + cp.key) || prev.special  || '',
                        fp:       gv('psParam_fp_'       + cp.key) || prev.fp       || '',
                        method:   gv('psParam_method_'   + cp.key) || prev.method   || '',
                        cycle:    gv('psParam_cycle_'    + cp.key) || prev.cycle    || '',
                        control:  gv('psParam_control_'  + cp.key) || prev.control  || '',
                        range:    prev.range  || '',
                        action:   prev.action || '',
                        resp:     prev.resp   || { prod:false, mat:false, qc:false },
                    };
                });

                // 도면 (수입검사/사출소재 입고에만 적용)
                let drawingToSave = existing ? (existing.drawing || null) : null;
                if (procName === '수입검사' && stName === '사출소재 입고' && _pendingDrawing) {
                    drawingToSave = _pendingDrawing._remove ? null : _pendingDrawing;
                }

                const payload = {
                    carModel:     _curCarModel,
                    partName:     _curPartName,
                    process:      procName,
                    station:      stName,
                    line,
                    params:       paramData,
                    customParams: savedCust,
                    drawing:      drawingToSave,
                    updatedAt:    UIUtils.now(),
                };

                if (existing) {
                    await Storage.update(STORE, existing.id, payload);
                } else {
                    await Storage.add(STORE, payload);
                }
                savedCount++;
            }
        }

        _pendingDrawing = null;
        UIUtils.toast(`전체 저장 완료 (${savedCount}개 공정/세부공정)`, 'success');
        _renderParamTable();
    }

    // ══════════════════════════════════════════════════════════════
    // 관리계획서 (Control Plan) 엑셀 업로드 & 파싱
    // ══════════════════════════════════════════════════════════════

    // ── 공정명 정규화 맵 (관리계획서 실제 텍스트 기준) ─────────
    // 키: 엑셀에 나타날 수 있는 모든 표현 (공백·대소문자 무시 매칭)
    const _PROCESS_MAP = [
        { keys: ['수입검사','수입 검사','incoming','incomming'],                                       sys: '수입검사' },
        { keys: ['보관','저장','storage'],                                                             sys: '보관'     },
        // ★ 도장 A/B 명시 — 반드시 일반 '도장' 항목보다 앞에 위치해야 함 (우선 매칭)
        { keys: ['도장(a)','도장a','도장-a','도장 (a)','도장 a','a라인도장','(a)도장'],              sys: '도장(A)'  },
        { keys: ['도장(b)','도장b','도장-b','도장 (b)','도장 b','b라인도장','(b)도장'],              sys: '도장(B)'  },
        { keys: ['도장','painting','coating','도장공정'],                                             sys: '__도장__' }, // 명시 없는 경우 → flow 기준 결정
        { keys: ['레이져','레이저','laser','lase','마킹','marking'],                                  sys: '레이져'   },
        { keys: ['출하검사','출하 검사','shipping inspection'],                                       sys: '출하검사' },
        { keys: ['출하','shipping','outgoing','출고'],                                                 sys: '출하'     },
    ];

    // ── 스테이션 정규화 맵 (관리계획서 실제 텍스트 기준) ────────
    // ※ sys 값은 반드시 PROCESS_CONFIG의 stations 키와 일치해야 함
    const _STATION_MAP = [
        // ── 수입검사 하위 ─────────────────────────────────────────
        { keys: ['도료입고','도료 입고','paint입고','paint incoming','도료수입'],  sys: '도료 입고'         },
        { keys: ['사출소재입고','사출 소재 입고','소재입고','사출입고','사출소재'], sys: '사출소재 입고'     },

        // ── 보관 하위 ─────────────────────────────────────────────
        { keys: ['위험물창고','위험물','도료창고','도료저장','paint창고'],         sys: '도료창고 (위험물)' },
        { keys: ['사출창고','소재창고','사출소재창고','injection창고'],            sys: '사출 창고'         },

        // ── 도장 하위 ─────────────────────────────────────────────
        { keys: ['로딩','loading','load'],                               sys: '로딩'      },
        { keys: ['세척','washing','wash','세정'],                        sys: '세척'      },
        { keys: ['제전','이온','ionizer','ion'],                         sys: '제전'      },
        { keys: ['배합','mixing','mix','조색'],                          sys: '배합'      },
        { keys: ['도료공급','페인트공급','paint공급','공급펌프'],                                   sys: '도료공급'      },
        { keys: ['하도공급','하도 공급','lower공급','하도supply','ls공급'],                        sys: '하도 공급'     },
        { keys: ['상도공급','상도 공급','upper공급','상도supply','us공급'],                        sys: '상도 공급'     },
        { keys: ['하도스프레이','하도 스프레이','하도spray','lower spray','lowerspray'],           sys: '하도 스프레이' },
        { keys: ['상도스프레이','상도 스프레이','상도spray','upper spray','upperspray'],           sys: '상도 스프레이' },
        { keys: ['스프레이1','spray1','1booth','#1부스','booth1','1스프레이','1번부스'],           sys: '스프레이1'     },
        { keys: ['스프레이2','spray2','2booth','#2부스','booth2','2스프레이','2번부스'],           sys: '스프레이2'     },
        { keys: ['건조','oven','ir존','uv존','열풍','경화'],                                       sys: '건조'          },
        { keys: ['언로딩','unloading','unload'],                                                   sys: '언로딩'        },
        { keys: ['포장','packing','packaging','pack'],                                             sys: '포장'          },
        { keys: ['도장검사','외관검사','finish검사'],                                             sys: '도장 검사'     },
        // ── 레이져 하위 ──────────────────────────────────────────────
        { keys: ['레이져','레이저','laser','lase','마킹','marking'],                               sys: '레이져'        },
        { keys: ['공정검사','공정 검사','레이져검사','laser검사','lasercheck'],                    sys: '공정 검사'     },
        // ── 출하검사 하위 ────────────────────────────────────────────
        { keys: ['출하검사','출하 검사','shipping inspection'],                                    sys: '출하검사'      },
        { keys: ['신뢰성','신뢰성검사','reliabilitytest','reliability','내구성'],                  sys: '신뢰성'        },
        // ── 출하 하위 ────────────────────────────────────────────────
        { keys: ['출하','출고','shipping','outgoing','납품'],                                      sys: '출하'          },
    ];

    function _explicitPaintProcessFromText(str) {
        if (!str) return null;
        const s = String(str).replace(/[\s\u00a0\u3000]+/g, '').toLowerCase();
        const compact = s.replace(/[()\[\]{}_\-\/\\]/g, '');

        // CP 원본에 도장 A/B가 명시된 경우에는 라인/학습 매핑보다 원본을 최우선한다.
        if (s.includes('도장(b)') || s.includes('도장-b') || s.includes('도장_b') ||
            s.includes('b라인') || s.includes('b-line') || s.includes('b_line') ||
            compact.includes('도장b') || compact.includes('b도장') ||
            compact.includes('paintb') || compact.includes('paintingb') || compact.includes('coatingb')) {
            return '도장(B)';
        }
        if (s.includes('도장(a)') || s.includes('도장-a') || s.includes('도장_a') ||
            s.includes('a라인') || s.includes('a-line') || s.includes('a_line') ||
            compact.includes('도장a') || compact.includes('a도장') ||
            compact.includes('painta') || compact.includes('paintinga') || compact.includes('coatinga')) {
            return '도장(A)';
        }
        return null;
    }

    function _normalizeProcess(str, line) {
        if (!str) return null;
        const explicitPaint = _explicitPaintProcessFromText(str);
        if (explicitPaint) return explicitPaint;

        // 공백 제거 후 소문자 비교
        const s = str.replace(/\s+/g, '').toLowerCase();
        for (const entry of _PROCESS_MAP) {
            if (entry.keys.some(k => s.includes(k.replace(/\s+/g,'').toLowerCase()))) {
                if (entry.sys === '__도장__') {
                    // ── 일반 '도장' 텍스트: flow 또는 원문 힌트로 라인 결정 ──
                    const paintInFlow = (_cpSelectedFlow || []).filter(p => p.startsWith('도장'));
                    if (paintInFlow.length === 1) return paintInFlow[0];
                    if (paintInFlow.length > 1) {
                        // 원문에 A/B 힌트 포함 여부 재확인 (key 매칭보다 넓은 범위)
                        if (s.includes('(b)') || s.includes('-b') || /도장.*b/.test(s) || /b.*도장/.test(s)) return '도장(B)';
                        if (s.includes('(a)') || s.includes('-a') || /도장.*a/.test(s) || /a.*도장/.test(s)) return '도장(A)';
                        // ★ A/B 힌트 없이 도장 여러 개 → null 반환해 procNo 역조회에 맡김
                        //   (paintInFlow[0] 기본값 반환 시 sysProcessByText 우선순위로
                        //    procNo 역조회 결과가 무시되어 도장(B)→도장(A) 오매핑 발생)
                        return null;
                    }
                    // flow에 도장 없음 → fallback
                    const l = line || _cpParsedLine || _cpUploadLine || 'A라인';
                    return l === 'B라인' ? '도장(B)' : '도장(A)';
                }
                return entry.sys;
            }
        }
        return null;
    }

    function _normalizeStation(str, sysProcess) {
        if (!str) return null;
        const norm  = s => (s || '').replace(/\s+/g, '').toLowerCase();
        const sNorm = norm(str);

        // 해당 공정(process)의 실제 station 키 목록 (커스텀 포함, 공백 무시 정규화)
        const procCfg     = sysProcess ? _getCarConfig('')[sysProcess] : null;
        const stationKeys = procCfg ? Object.keys(procCfg.stations) : [];

        // ① 공정 내 station 키와 정규화 완전일치 (공백 차이 해소)
        const exactInProc = stationKeys.find(k => norm(k) === sNorm);
        if (exactInProc) return exactInProc;

        // ② STATION_MAP 조회
        let mapped = null;
        for (const entry of _STATION_MAP) {
            if (entry.keys.some(k => sNorm.includes(norm(k)))) { mapped = entry.sys; break; }
        }

        if (mapped && procCfg) {
            // ③ mapped 결과가 해당 공정에 존재하는지 확인 (공백 무시)
            const mappedNorm  = norm(mapped);
            const matchedKey  = stationKeys.find(k => norm(k) === mappedNorm);
            if (matchedKey) return matchedKey; // 실제 키(공백 포함)로 반환

            // ④ mapped가 공정에 없음 → 공정 내 유사 키 탐색 (키워드 포함 관계)
            const fuzzy = stationKeys.find(k => {
                const kn = norm(k);
                return sNorm.includes(kn) || kn.includes(sNorm) ||
                    // "검사" 계열 키워드 공통 포함
                    (sNorm.includes('검사') && kn.includes('검사'));
            });
            if (fuzzy) return fuzzy;

            // ⑤ 공정 내에서 매칭 불가 → null 반환 (불일치 표시)
            return null;
        }

        return mapped; // 공정 컨텍스트 없으면 STATION_MAP 결과 그대로
    }

    function _parseProcNoBase(procNo) {
        const s = String(procNo || '').trim();
        if (!s) return null;

        // Excel/form variants: 60, 60.0, 60_1, 60-2, 60 / 1
        const m = s.match(/^(\d+)(?:\s*(?:[._\-\/]\s*\d+)?|\s*)$/);
        if (m) return parseInt(m[1], 10);

        // Some sheets format the value as free text, e.g. "공정번호 60".
        const loose = s.match(/\d+/);
        return loose ? parseInt(loose[0], 10) : null;
    }

    function _stationTextMatchesName(text, stationName) {
        if (!text || !stationName) return false;
        const source = String(text).replace(/\s+/g, '').toLowerCase();
        const target = String(stationName).replace(/\s+/g, '').toLowerCase();
        if (!source || !target) return false;
        return source.includes(target) || target.includes(source);
    }

    // ── 공정번호 역조회 ──────────────────────────────────────────
    // PROCESS_CONFIG 의 stationNos 를 역방향으로 탐색
    // procNo → { sysProcess, sysStation } 반환 (없으면 null)
    // 복수 공정에 같은 번호가 있을 경우를 대비해 sysProcessHint 로 좁힘
    function _lookupByProcNo(procNo, sysProcessHint, line, stationHint) {
        const no = _parseProcNoBase(procNo);
        if (no == null || isNaN(no)) return null;

        const refCfg = _getCarConfig(line || '');
        // 힌트가 있으면 해당 공정 먼저 시도
        const candidates = sysProcessHint
            ? [sysProcessHint, ...Object.keys(refCfg).filter(k => k !== sysProcessHint)]
            : Object.keys(refCfg);

        for (const procName of candidates) {
            const cfg = refCfg[procName];
            if (!cfg || !cfg.stationNos) continue;
            const entries = Object.entries(cfg.stationNos).filter(([, v]) => v === no);
            if (entries.length === 1) {
                // 유일한 스테이션 → 확실한 결과
                return { sysProcess: procName, sysStation: entries[0][0] };
            }
            if (entries.length > 1) {
                const textMapped = _normalizeStation(stationHint || '', procName);
                if (textMapped && entries.some(([name]) => name === textMapped)) {
                    return { sysProcess: procName, sysStation: textMapped };
                }

                const textMatched = entries.find(([name]) => _stationTextMatchesName(stationHint, name));
                if (textMatched) {
                    return { sysProcess: procName, sysStation: textMatched[0] };
                }

                // 동일 procNo를 공유하는 스테이션이 여러 개(예: 수입검사 procNo=10)
                // 공정만 확정, 스테이션은 텍스트 기반 매핑에 맡김
                return { sysProcess: procName, sysStation: null };
            }
        }
        return null;
    }

    function _extractUnit(spec) {
        if (!spec) return '-';
        const m = spec.match(/(℃|°C|%RH|%|Mpa|MPa|kgf\/cm²|mm|cm|m|rpm|Hz|kHz|W|sec|min|μm|EA|개월|일|회)/);
        return m ? m[1] : '-';
    }

    // 업로드된 워크북을 전역 보관 (시트 선택 후 재사용)
    let _cpWorkbook      = null;
    let _cpParsedGroups  = null;   // 파싱 결과 임시 보관
    let _cpParsedCarModel = '';    // 현재 미리보기 모달의 차종 (매핑·검증에 사용)
    let _cpParsedLine    = '';     // 현재 미리보기 모달의 라인 (설정 조회에 사용)
    let _cpCurrentMeta  = null;   // 현재 파싱 파일 메타 (fileName, sheetName)

    // ── 라인별 커스텀 설정 DB 관리 (A라인 / B라인) ──────────────────
    const CUSTOM_STATION_KEY_PFX  = 'prod_custom_stations__';  // + line
    const HIDDEN_STATION_KEY_PFX  = 'prod_hidden_stations__';  // + line
    const CUSTOM_PROCESS_KEY_PFX  = 'prod_custom_processes__'; // + line
    const PROCESS_ORDER_KEY_PFX   = 'prod_process_order__';    // + line
    const STATION_ORDER_KEY_PFX   = 'prod_station_order__';    // + line → { proc: [stName,...] }
    const _SM_LINES = ['A라인', 'B라인'];  // 지원 라인

    let _customStationsCache  = {};  // { line: [{process,station,params}] }
    let _hiddenStationsCache  = {};  // { line: [{process,station}] }
    let _customProcessesCache = {};  // { line: [{name}] }
    let _processOrderCache    = {};  // { line: ['공정명1','공정명2',...] }
    let _stationOrderCache    = {};  // { line: { proc: ['세부공정1',...] } }
    let _carConfigCache       = {};  // { line: effectiveProcessConfig } — 빌드 캐시

    // 공정 탭 드래그&드롭 순서 변경
    let _smProcDragSrc     = null;  // 드래그 중인 공정명
    let _smProcDragOverIdx = -1;    // hover 중인 탭 인덱스
    let _smCurrentProcOrder = [];   // 현재 렌더링된 공정 순서 배열 (인덱스 → 공정명)

    // 세부공정 행 드래그&드롭 순서 변경
    let _smStDragSrc      = null;   // 드래그 중인 세부공정명
    let _smStDragOverIdx  = -1;     // hover 중인 행 인덱스
    let _smCurrentStOrder = [];     // 현재 렌더링된 세부공정 순서 (인덱스 → 세부공정명)

    /** 특정 라인의 커스텀·숨김 데이터를 DB에서 로드 */
    async function _loadCarConfig(line) {
        if (!line) return;
        try {
            const val = await DB.getConfig(CUSTOM_STATION_KEY_PFX + line);
            _customStationsCache[line] = Array.isArray(val) ? val : [];
        } catch(e) { _customStationsCache[line] = []; }
        try {
            const hid = await DB.getConfig(HIDDEN_STATION_KEY_PFX + line);
            _hiddenStationsCache[line] = Array.isArray(hid) ? hid : [];
        } catch(e) { _hiddenStationsCache[line] = []; }
        try {
            const procs = await DB.getConfig(CUSTOM_PROCESS_KEY_PFX + line);
            _customProcessesCache[line] = Array.isArray(procs) ? procs : [];
        } catch(e) { _customProcessesCache[line] = []; }
        try {
            const ord = await DB.getConfig(PROCESS_ORDER_KEY_PFX + line);
            _processOrderCache[line] = Array.isArray(ord) ? ord : [];
        } catch(e) { _processOrderCache[line] = []; }
        try {
            const stOrd = await DB.getConfig(STATION_ORDER_KEY_PFX + line);
            _stationOrderCache[line] = (stOrd && typeof stOrd === 'object' && !Array.isArray(stOrd)) ? stOrd : {};
        } catch(e) { _stationOrderCache[line] = {}; }
        delete _carConfigCache[line];
        delete _carConfigCache['__all__'];
    }

    /** 로드 안 된 라인이면 비동기 로드. 항상 A/B 양 라인 로드 (도장A/도장B 통합 뷰 지원) */
    async function _ensureCarConfig(line) {
        // Always load both A라인 and B라인 (needed for 도장A/도장B unified view)
        const toLoad = ['A라인', 'B라인'];
        await Promise.all(toLoad.map(async l => {
            if (_customStationsCache[l] === undefined) {
                await _loadCarConfig(l);
            }
        }));
        // Also load the specific line if given and different
        if (line && !toLoad.includes(line) && _customStationsCache[line] === undefined) {
            await _loadCarConfig(line);
        }
    }

    function _getCustomStations(line)  { return _customStationsCache[line]  || []; }
    function _getHiddenStations(line)  { return _hiddenStationsCache[line]   || []; }
    function _getCustomProcesses(line) { return _customProcessesCache[line]  || []; }

    async function _saveCustomStationsToDB(line, list) {
        _customStationsCache[line] = list;
        delete _carConfigCache[line];
        delete _carConfigCache['__all__'];
        await DB.setConfig(CUSTOM_STATION_KEY_PFX + line, list);
    }
    async function _saveHiddenStationsToDB(line, list) {
        _hiddenStationsCache[line] = list;
        delete _carConfigCache[line];
        delete _carConfigCache['__all__'];
        await DB.setConfig(HIDDEN_STATION_KEY_PFX + line, list);
    }
    async function _saveCustomProcessesToDB(line, list) {
        _customProcessesCache[line] = list;
        delete _carConfigCache[line];
        delete _carConfigCache['__all__'];
        await DB.setConfig(CUSTOM_PROCESS_KEY_PFX + line, list);
    }

    function _getProcessOrder(line) { return _processOrderCache[line] || []; }
    async function _saveProcessOrderToDB(line, order) {
        _processOrderCache[line] = order;
        await DB.setConfig(PROCESS_ORDER_KEY_PFX + line, order);
    }

    function _getStationOrder(line, proc) {
        return ((_stationOrderCache[line] || {})[proc]) || [];
    }
    async function _saveStationOrderToDB(line, proc, order) {
        if (!_stationOrderCache[line]) _stationOrderCache[line] = {};
        _stationOrderCache[line][proc] = order;
        await DB.setConfig(STATION_ORDER_KEY_PFX + line, _stationOrderCache[line]);
    }
    /** 세부공정 목록을 저장된 순서 기준으로 반환. 순서에 없는 것은 정의 순서(canonical) 그대로 */
    function _smGetOrderedStations(line, proc) {
        const cfg = (_getCarConfig('')[proc]) || { stations: {} };
        const allSt = Object.keys(cfg.stations);  // canonical definition order
        const order = _getStationOrder('A라인', proc);  // user-saved order
        if (!order || order.length === 0) return allSt;  // no saved order → use canonical
        const inOrder    = order.filter(s => allSt.includes(s));
        const notInOrder = allSt.filter(s => !inOrder.includes(s));  // preserve canonical order
        return [...inOrder, ...notInOrder];
    }

    // ── 세부공정 행 드래그&드롭 ─────────────────────────────────────

    function _smStDragStart(e, idx) {
        _smStDragSrc = _smCurrentStOrder[idx];
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        setTimeout(() => {
            const tr = document.getElementById('smStRow_' + idx);
            if (tr) { tr.style.opacity = '0.4'; tr.style.transition = 'opacity .15s'; }
        }, 0);
    }

    function _smStDragOver(e, idx) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (_smStDragOverIdx === idx) return;
        if (_smStDragOverIdx >= 0) {
            const prev = document.getElementById('smStRow_' + _smStDragOverIdx);
            if (prev) prev.style.outline = '';
        }
        _smStDragOverIdx = idx;
        if (_smCurrentStOrder[idx] !== _smStDragSrc) {
            const tr = document.getElementById('smStRow_' + idx);
            if (tr) { tr.style.outline = '2px solid var(--accent-blue)'; tr.style.outlineOffset = '-2px'; }
        }
    }

    async function _smStDrop(e, targetIdx) {
        e.preventDefault();
        const srcName    = _smStDragSrc;
        const targetName = _smCurrentStOrder[targetIdx];
        _smStDragSrc     = null;
        _smStDragOverIdx = -1;
        if (!srcName || srcName === targetName) return;
        const proc    = _smActiveProc;
        const ordered = _smGetOrderedStations('', proc);
        const si = ordered.indexOf(srcName);
        const ti = ordered.indexOf(targetName);
        if (si < 0 || ti < 0) return;
        ordered.splice(si, 1);
        ordered.splice(ti, 0, srcName);
        await _saveStationOrderToDB('A라인', proc, ordered);  // use 'A라인' as unified key
        _smRefresh();
    }

    function _smStDragEnd(e, idx) {
        const tr = document.getElementById('smStRow_' + idx);
        if (tr) { tr.style.opacity = ''; tr.style.transition = ''; }
        if (_smStDragOverIdx >= 0) {
            const prev = document.getElementById('smStRow_' + _smStDragOverIdx);
            if (prev) prev.style.outline = '';
        }
        _smStDragSrc     = null;
        _smStDragOverIdx = -1;
    }

    /** 공정 목록을 저장된 순서 기준으로 반환. canonical 순서 우선, 커스텀 공정은 뒤에 추가 */
    function _smGetOrderedProcs(line) {
        // line param kept for compat but ignored — now uses unified config + canonical order
        const carCfg = _getCarConfig('');  // unified: all processes
        const allProcs = Object.keys(carCfg);
        // Saved user order (if any) — use 'A라인' key for unified (backward compat)
        const savedOrder = _getProcessOrder('A라인');
        // Build ordered list: canonical order first, then any custom processes
        const canonicalInConfig = CANONICAL_PROCESS_ORDER.filter(p => allProcs.includes(p));
        const customProcs = allProcs.filter(p => !CANONICAL_PROCESS_ORDER.includes(p));
        // Merge with saved order overlay
        const baseOrder = [...canonicalInConfig, ...customProcs];
        const savedOverlay = savedOrder.filter(p => baseOrder.includes(p));
        const notInSaved = baseOrder.filter(p => !savedOverlay.includes(p));
        return [...savedOverlay, ...notInSaved];
    }

    // ── 공정 탭 드래그&드롭 ─────────────────────────────────────────

    function _smProcDragStart(e, idx) {
        _smProcDragSrc = _smCurrentProcOrder[idx];
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        setTimeout(() => {
            const el = document.getElementById('smProcTab_' + idx);
            if (el) { el.style.opacity = '0.4'; el.style.transition = 'opacity .15s'; }
        }, 0);
    }

    function _smProcDragOver(e, idx) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (_smProcDragOverIdx === idx) return;
        if (_smProcDragOverIdx >= 0) {
            const prev = document.getElementById('smProcTab_' + _smProcDragOverIdx);
            if (prev) prev.style.outline = '';
        }
        _smProcDragOverIdx = idx;
        if (_smCurrentProcOrder[idx] !== _smProcDragSrc) {
            const el = document.getElementById('smProcTab_' + idx);
            if (el) { el.style.outline = '2px solid var(--accent-blue)'; el.style.outlineOffset = '2px'; }
        }
    }

    async function _smProcDrop(e, targetIdx) {
        e.preventDefault();
        const srcName    = _smProcDragSrc;
        const targetName = _smCurrentProcOrder[targetIdx];
        _smProcDragSrc     = null;
        _smProcDragOverIdx = -1;
        if (!srcName || srcName === targetName) return;

        const ordered = _smGetOrderedProcs('');
        const si = ordered.indexOf(srcName);
        const ti = ordered.indexOf(targetName);
        if (si < 0 || ti < 0) return;
        ordered.splice(si, 1);
        ordered.splice(ti, 0, srcName);
        await _saveProcessOrderToDB('A라인', ordered);  // use 'A라인' as unified key
        _smRefresh();
    }

    function _smProcDragEnd(e, idx) {
        const el = document.getElementById('smProcTab_' + idx);
        if (el) { el.style.opacity = ''; el.style.transition = ''; }
        if (_smProcDragOverIdx >= 0) {
            const prev = document.getElementById('smProcTab_' + _smProcDragOverIdx);
            if (prev) prev.style.outline = '';
        }
        _smProcDragSrc     = null;
        _smProcDragOverIdx = -1;
    }

    /** 공정명 → 커스텀 데이터 저장 라인 키 반환 ('A라인'|'B라인') */
    function _getStorageLine(procName) {
        const def = PROCESS_CONFIG[procName];
        if (def && def.storeLine) return def.storeLine;
        return 'A라인';  // 공유 공정(수입검사·보관·레이져·출하검사)은 A라인 키로 통합 저장 (하위호환)
    }

    /**
     * 유효 PROCESS_CONFIG 반환.
     * 기본 PROCESS_CONFIG 딥클론 위에 라인별 커스텀(추가 공정·스테이션, 숨김)을 적용.
     * line: 'A라인' | 'B라인' | '' ('' = 모든 공정 포함, 통합 뷰)
     */
    function _getCarConfig(line) {
        line = line || '';
        const cacheKey = line || '__all__';
        if (_carConfigCache[cacheKey]) return _carConfigCache[cacheKey];

        // Deep clone base config (only processes matching the line filter)
        const base = PROCESS_CONFIG;
        const cfg = {};
        for (const [procName, procDef] of Object.entries(base)) {
            // If line filter: include shared (no storeLine) or matching storeLine
            if (line && procDef.storeLine && procDef.storeLine !== line) continue;
            cfg[procName] = JSON.parse(JSON.stringify(procDef));
        }

        // Apply customs: use EACH process's own storeLine for lookup
        for (const procName of Object.keys(cfg)) {
            const sl = _getStorageLine(procName);
            const hidden = _hiddenStationsCache[sl] || [];
            const customs = _customStationsCache[sl] || [];

            // Hidden stations — also match old '도장' process name for backward compat
            hidden.forEach(h => {
                const matchProc = h.process === procName ||
                    (procName === '도장(A)' && h.process === '도장') ||
                    (procName === '도장(B)' && h.process === '도장');
                if (matchProc && cfg[procName].stations[h.station]) {
                    delete cfg[procName].stations[h.station];
                    if (cfg[procName].stationNos) delete cfg[procName].stationNos[h.station];
                }
            });

            // Custom stations
            customs.forEach(c => {
                const matchProc = c.process === procName ||
                    (procName === '도장(A)' && c.process === '도장') ||
                    (procName === '도장(B)' && c.process === '도장');
                if (matchProc && cfg[procName]) {
                    cfg[procName].stations[c.station] = c.params || [];
                }
            });
        }

        // Add user-defined custom processes
        const linesToCheck = line ? [line] : ['A라인', 'B라인'];
        linesToCheck.forEach(sl => {
            (_customProcessesCache[sl] || []).forEach(cp => {
                if (!cfg[cp.name]) {
                    cfg[cp.name] = {
                        icon: cp.icon || 'settings',
                        color: cp.color || 'var(--accent-blue)',
                        procNo: 0, stationNos: {}, stations: {},
                        storeLine: sl
                    };
                }
            });
        });

        _carConfigCache[cacheKey] = cfg;
        return cfg;
    }

    /** 커스텀 스테이션이 기본값인지 여부 */
    function _isBaseStation(line, proc, st) {
        if (PROCESS_CONFIG[proc] && PROCESS_CONFIG[proc].stations[st]) return true;
        // backward compat: 도장 A/B 라인은 도장 기본값으로 확인
        if ((proc === '도장(A)' || proc === '도장(B)') && PROCESS_CONFIG['도장(A)'] && PROCESS_CONFIG['도장(A)'].stations[st]) return true;
        return false;
    }

    // ── 세부공정 관리 모달 ──────────────────────────────────────────
    let _smLine         = 'A라인';  // DERIVED from _smActiveProc — not user-selected
    let _smActiveProc   = null;
    /** 활성 공정의 storeLine 반환 (저장 키 결정용) */
    function _smGetLine() { return _getStorageLine(_smActiveProc || ''); }
    let _smEditState    = null;
    let _smProcFormMode = false;
    let _smProcFormState = { name: '' };
    let _smDragSrcIdx  = -1;   // 드래그 중인 파라미터 인덱스
    let _smDragOverIdx = -1;   // 현재 hover 중인 대상 인덱스
    let _smCopyState   = { visible: false, srcLine: '', srcProc: '', srcStation: '' }; // 파라미터 복사 패널 상태

    function openStationManager() {
        _smEditState    = null;
        _smProcFormMode = false;
        // showModal 은 1회만 호출 — 이후 탭/폼 전환은 DOM 직접 업데이트
        UIUtils.showModal(
            '세부공정 관리',
            '<div id="smBody" style="min-height:200px;">로딩 중...</div>',
            '<button class="btn btn-secondary" id="smFooterBtn" onclick="UIUtils.closeModal()">닫기</button>',
            'md'
        );
        // 양 라인 설정 로드 후 렌더
        Promise.all([_ensureCarConfig('A라인'), _ensureCarConfig('B라인')]).then(() => {
            const orderedProcs = _smGetOrderedProcs('');
            _smActiveProc = _smActiveProc || orderedProcs[0];
            _smLine = _smGetLine();
            _smRefresh();
        });
    }

    /** 모달 body/footer를 현재 상태에 맞게 DOM 업데이트 (showModal 재호출 없음) */
    function _smRefresh() {
        const bodyEl   = document.getElementById('smBody');
        const footerEl = document.getElementById('modalFooter');
        if (!bodyEl) return;

        if (_smProcFormMode) {
            bodyEl.innerHTML = _smBuildProcFormHtml();
            if (footerEl) footerEl.innerHTML = `
                <button class="btn btn-secondary" onclick="ProdStandardsModule._smCancelProcForm()">취소</button>
                <button class="btn btn-primary" onclick="ProdStandardsModule._smSaveProcess()">공정 저장</button>`;
        } else if (_smEditState) {
            bodyEl.innerHTML = _smBuildFormHtml();
            if (footerEl) footerEl.innerHTML = `
                <button class="btn btn-secondary" onclick="ProdStandardsModule._smBackToList()">취소</button>
                <button class="btn btn-primary" onclick="ProdStandardsModule._smSaveStation()">저장</button>`;
        } else {
            bodyEl.innerHTML = _smBuildListHtml();
            if (footerEl) footerEl.innerHTML = `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
                <button class="btn btn-primary" onclick="ProdStandardsModule._smSaveAndClose()">저장</button>`;
        }
    }

    function _smBuildListHtml() {
        const proc = _smActiveProc;
        const carCfg     = _getCarConfig('');  // unified: all processes
        // 저장된 순서 기준 정렬 (canonical 순서 우선)
        const processKeys = _smGetOrderedProcs('');
        _smCurrentProcOrder = processKeys;   // 드래그 핸들러에서 인덱스→공정명 참조용
        // 전체 커스텀 수 집계 (A+B 합산)
        const customsA    = _getCustomStations('A라인');
        const customsB    = _getCustomStations('B라인');
        const customProcsA = _getCustomProcesses('A라인');
        const customProcsB = _getCustomProcesses('B라인');
        const totalCustoms = customsA.length + customsB.length + customProcsA.length + customProcsB.length;

        // 공정 흐름 표시기 — 공통 공정(실선)과 선택 공정(점선)을 구분
        const _flowItems = CANONICAL_PROCESS_ORDER.map((p, i) => {
            const isCommon = COMMON_PROCESSES.has(p);
            const inCfg    = !!carCfg[p];
            const isActive = p === proc;
            const isLast   = i === CANONICAL_PROCESS_ORDER.length - 1;
            const arrow    = isLast ? '' : '<span style="color:var(--text-muted); font-size:10px; margin:0 1px;">→</span>';
            const bg       = isActive ? 'var(--accent-blue)'
                           : isCommon ? 'var(--bg-secondary)'
                           : (inCfg   ? 'rgba(var(--accent-orange-rgb,234,88,12),0.08)' : 'transparent');
            const border   = isActive ? 'var(--accent-blue)'
                           : isCommon ? 'var(--border-color)'
                           : (inCfg   ? 'var(--accent-orange)' : 'var(--border-color)');
            const color    = isActive ? '#fff'
                           : isCommon ? 'var(--text-primary)' : (inCfg ? 'var(--accent-orange)' : 'var(--text-muted)');
            const style    = `border-style:${isCommon ? 'solid' : 'dashed'};`;
            const title    = isCommon ? `${p} (공통 필수 공정)` : (inCfg ? `${p} (선택 공정)` : `${p} (미사용)`);
            const opacity  = (!isCommon && !inCfg) ? 'opacity:0.4;' : '';
            return `<span style="font-size:11px; padding:2px 8px; border-radius:10px; white-space:nowrap;
                                 background:${bg}; color:${color};
                                 border:1px ${style.replace('border-style:','').replace(';','')} ${border};
                                 ${opacity}" title="${title}">${p}</span>${arrow}`;
        });
        // 커스텀 공정 (CANONICAL 외)
        const _customFlowItems = Object.keys(carCfg).filter(p => !CANONICAL_PROCESS_ORDER.includes(p)).map(p => {
            const isActive = p === proc;
            return `<span style="font-size:11px; padding:2px 8px; border-radius:10px; white-space:nowrap;
                                 background:${isActive ? 'var(--accent-blue)' : 'var(--bg-secondary)'};
                                 color:${isActive ? '#fff' : 'var(--text-primary)'};
                                 border:1px dashed ${isActive ? 'var(--accent-blue)' : 'var(--border-color)'};"
                        title="${p} (커스텀 공정)">${p}</span>`;
        });
        const lineSelectorHtml = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:10px; flex-wrap:wrap;">
                <span style="font-size:11px; font-weight:600; color:var(--text-muted); white-space:nowrap;">공정 흐름:</span>
                ${_flowItems.join('')}
                ${_customFlowItems.length ? '<span style="color:var(--text-muted);font-size:10px;margin:0 2px;">+</span>' + _customFlowItems.join('') : ''}
                <span style="font-size:10px; color:var(--text-muted); margin-left:6px; white-space:nowrap;">
                    실선=공통 · 점선=선택${totalCustoms > 0 ? ` · 커스텀 ${totalCustoms}개` : ''}
                </span>
            </div>`;

        const tabs = processKeys.map((p, idx) => {
            const isActive   = p === proc;
            // 커스텀 공정: PROCESS_CONFIG에 없는 공정
            const isCustomPr = !PROCESS_CONFIG[p];
            const borderColor = isActive ? 'var(--accent-blue)' : 'var(--border-color)';
            const bgColor     = isActive ? 'var(--accent-blue)' : 'transparent';
            const fgColor     = isActive ? '#fff' : 'var(--text-color)';
            // 공통 드래그 wrapper 속성
            const wrapBase = `id="smProcTab_${idx}" draggable="true"
                ondragstart="ProdStandardsModule._smProcDragStart(event,${idx})"
                ondragend="ProdStandardsModule._smProcDragEnd(event,${idx})"
                ondragover="ProdStandardsModule._smProcDragOver(event,${idx})"
                ondrop="ProdStandardsModule._smProcDrop(event,${idx})"`;
            if (isCustomPr) {
                return `<div ${wrapBase}
                    style="display:inline-flex; align-items:stretch; border-radius:6px; overflow:hidden;
                           border:1.5px solid ${borderColor}; cursor:grab;">
                    <button onclick="ProdStandardsModule._smSelectProc('${_esc(p)}')"
                        ondragstart="event.stopPropagation()"
                        style="padding:5px 10px; font-size:12px; font-weight:600; cursor:pointer;
                               border:none; background:${bgColor}; color:${fgColor};">${p}</button>
                    <button onclick="ProdStandardsModule._smDeleteProcess('${_esc(p)}')"
                        ondragstart="event.stopPropagation()"
                        title="공정 삭제"
                        style="padding:5px 6px; font-size:11px; cursor:pointer; border:none;
                               border-left:1px solid ${isActive ? 'rgba(255,255,255,0.4)' : 'var(--border-color)'};
                               background:${bgColor};
                               color:${isActive ? 'rgba(255,255,255,0.85)' : 'var(--accent-red)'};">
                        <span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">close</span>
                    </button>
                </div>`;
            }
            return `<div ${wrapBase}
                style="display:inline-block; cursor:grab; border-radius:6px;">
                <button onclick="ProdStandardsModule._smSelectProc('${_esc(p)}')"
                    ondragstart="event.stopPropagation()"
                    style="padding:5px 12px; border-radius:6px; font-size:12px; font-weight:600;
                           cursor:pointer; border:1.5px solid ${borderColor};
                           background:${bgColor}; color:${fgColor};">${p}</button>
            </div>`;
        }).join('');

        // 저장된 순서 기준 세부공정 정렬 (없으면 가나다순)
        const sortedStations = _smGetOrderedStations('', proc);
        _smCurrentStOrder = sortedStations;   // 드래그 핸들러 참조용
        const rows = sortedStations.map((stName, idx) => {
            const pCount = (carCfg[proc] || { stations: {} }).stations[stName]?.length ?? 0;
            return `<tr id="smStRow_${idx}" style="border-top:1px solid var(--border-color);"
                ondragover="ProdStandardsModule._smStDragOver(event,${idx})"
                ondrop="ProdStandardsModule._smStDrop(event,${idx})">
                <td draggable="true"
                    ondragstart="ProdStandardsModule._smStDragStart(event,${idx})"
                    ondragend="ProdStandardsModule._smStDragEnd(event,${idx})"
                    style="padding:6px 8px; text-align:center; cursor:grab; color:var(--text-muted); user-select:none;">
                    <span class="material-symbols-outlined" style="font-size:17px; vertical-align:middle; pointer-events:none;">drag_indicator</span>
                </td>
                <td style="padding:7px 12px; font-weight:600;">${stName}</td>
                <td style="padding:7px 12px; text-align:center;">${pCount}</td>
                <td style="padding:7px 12px; text-align:center; white-space:nowrap;">
                    <button class="btn btn-sm" title="편집" style="padding:2px 8px; font-size:11px;"
                        onclick="ProdStandardsModule._smShowForm('${_esc(proc)}','${_esc(stName)}')">
                        <span class="material-symbols-outlined" style="font-size:12px;">edit</span>
                    </button>
                    <button class="btn btn-sm" title="삭제" style="padding:2px 8px; font-size:11px;
                                border:1px solid var(--accent-red); color:var(--accent-red);"
                        onclick="ProdStandardsModule._smDeleteStation('${_esc(proc)}','${_esc(stName)}')">
                        <span class="material-symbols-outlined" style="font-size:12px;">delete</span>
                    </button>
                </td>
            </tr>`;
        }).join('');

        return `
            ${lineSelectorHtml}
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; align-items:center;">
                ${tabs}
                <button onclick="ProdStandardsModule._smShowProcForm()"
                    title="공정 추가"
                    style="padding:5px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
                           border:1.5px dashed var(--accent-blue); background:transparent;
                           color:var(--accent-blue); display:inline-flex; align-items:center; gap:3px;">
                    <span class="material-symbols-outlined" style="font-size:13px;">add</span>공정
                </button>
            </div>
            <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:8px; margin-bottom:14px;">
                <table style="width:100%; font-size:13px; border-collapse:collapse;">
                    <thead style="background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:7px 6px; width:22px;"></th>
                            <th style="padding:7px 12px; text-align:left;">세부공정명</th>
                            <th style="padding:7px 12px; text-align:center;">파라미터수</th>
                            <th style="padding:7px 12px; text-align:center; width:90px;">편집/삭제</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <button class="btn btn-primary" style="font-size:12px;"
                onclick="ProdStandardsModule._smShowForm('${_esc(proc)}', null)">
                <span class="material-symbols-outlined" style="font-size:14px;">add</span>
                세부공정 추가
            </button>`;
    }

    function _smSelectProc(proc) {
        _smActiveProc = proc;
        _smLine       = _smGetLine();  // derive storeLine from selected proc
        _smEditState  = null;
        _smRefresh();
    }

    async function _smChangeLine(line) {
        // No longer used as user action — kept for internal compat
        _smLine = line;
        _smEditState  = null;
        _smProcFormMode = false;
        await _ensureCarConfig(line);
        _smActiveProc = _smGetOrderedProcs('')[0] || null;
        _smLine = _smGetLine();
        _smRefresh();
    }

    /** 추가/편집 폼 표시 */
    function _smShowForm(proc, stName) {
        const cfg = _getCarConfig('')[proc] || { stations: {} };
        const existingParams = stName ? (cfg.stations[stName] || []) : [];
        _smEditState = {
            process:     proc,
            origStation: stName,
            station:     stName || '',
            params:      existingParams.map(p => ({ ...p }))
        };
        // 복사 패널 초기화
        _smCopyState = { visible: false, srcLine: '', srcProc: '', srcStation: '' };
        _smRefresh();
    }

    /** CP 파싱 결과 + 저장된 커스텀 파라미터에서 관리방안 후보 수집 */
    function _smGetControlPlanOptions() {
        const vals = new Set();
        // 1. CP 파싱 결과 (가장 최신 import 기준)
        if (_cpParsedGroups) {
            _cpParsedGroups.forEach(g => {
                (g.params || []).forEach(p => {
                    if (p.control && p.control.trim()) vals.add(p.control.trim());
                    if (p.action  && p.action.trim())  vals.add(p.action.trim());
                });
            });
        }
        // 2. 모든 차종의 커스텀 세부공정 파라미터
        Object.values(_customStationsCache).forEach(stations => {
            if (!Array.isArray(stations)) return;
            stations.forEach(st => {
                (st.params || []).forEach(p => {
                    if (p.controlPlan && p.controlPlan.trim()) vals.add(p.controlPlan.trim());
                    if (p.control     && p.control.trim())     vals.add(p.control.trim());
                });
            });
        });
        return [...vals].sort((a, b) => a.localeCompare(b, 'ko'));
    }

    // ── 파라미터 복사 패널 ───────────────────────────────────────────
    function _smToggleCopyPanel() {
        _smCopyState.visible = !_smCopyState.visible;
        if (!_smCopyState.visible) {
            _smCopyState.srcProc    = '';
            _smCopyState.srcStation = '';
        }
        _smRefresh();
    }

    function _smCopySrcLineChange(line) {
        // kept for backward compat (no longer used in UI)
        _smCopyState.srcProc    = '';
        _smCopyState.srcStation = '';
        const procSel = document.getElementById('smCopySrcProc');
        const stSel   = document.getElementById('smCopySrcStation');
        if (procSel) {
            const procList = _smGetOrderedProcs('');
            procSel.innerHTML = `<option value="">-- 공정 선택 --</option>` +
                procList.map(p => `<option value="${_esc(p)}">${p}</option>`).join('');
        }
        if (stSel) stSel.innerHTML = `<option value="">-- 세부공정 선택 --</option>`;
    }

    function _smCopySrcProcChange(proc) {
        _smCopyState.srcProc    = proc;
        _smCopyState.srcStation = '';
        const stSel = document.getElementById('smCopySrcStation');
        if (!stSel) return;
        const stations = proc ? _smGetOrderedStations('', proc) : [];
        stSel.innerHTML = `<option value="">-- 세부공정 선택 --</option>` +
            stations.map(s => `<option value="${_esc(s)}">${s}</option>`).join('');
    }

    function _smCopySrcStationChange(station) {
        _smCopyState.srcStation = station;
    }

    async function _smApplyCopy(mode) {
        const procSel = document.getElementById('smCopySrcProc');
        const stSel   = document.getElementById('smCopySrcStation');
        const proc    = procSel ? procSel.value : '';
        const station = stSel  ? stSel.value   : '';
        if (!proc || !station) {
            UIUtils.toast('공정과 세부공정을 선택하세요.', 'warning');
            return;
        }
        const carCfg     = _getCarConfig('');  // unified config
        const srcStation = carCfg[proc] && carCfg[proc].stations && carCfg[proc].stations[station];
        const srcParams  = Array.isArray(srcStation) ? srcStation : (srcStation ? Object.values(srcStation) : []);
        if (!srcParams.length) {
            UIUtils.toast('복사할 파라미터가 없습니다.', 'warning');
            return;
        }
        const copied = srcParams.map((p, i) => ({
            ...p,
            key: 'c_copy_' + Date.now() + '_' + i
        }));
        _smEditState.params = copied;
        _smCopyState.visible    = false;
        _smCopyState.srcLine    = '';
        _smCopyState.srcProc    = '';
        _smCopyState.srcStation = '';
        UIUtils.toast(`파라미터 ${copied.length}개 복사 완료`, 'success');
        _smRefresh();
    }

    function _smBuildFormHtml() {
        const st = _smEditState;
        if (!st) return '';
        const isNew = !st.origStation;

        const paramRows = st.params.map((p, i) => `
            <tr id="smPRow_${i}" style="border-top:1px solid var(--border-color);"
                ondragover="ProdStandardsModule._smParamDragOver(event,${i})"
                ondrop="ProdStandardsModule._smParamDrop(event,${i})">
                <td draggable="true"
                    ondragstart="ProdStandardsModule._smParamDragStart(event,${i})"
                    ondragend="ProdStandardsModule._smParamDragEnd(event,${i})"
                    style="padding:3px 6px; text-align:center; cursor:grab; color:var(--text-muted); user-select:none;">
                    <span class="material-symbols-outlined" style="font-size:17px; vertical-align:middle; pointer-events:none;">drag_indicator</span>
                </td>
                <td style="padding:3px 4px;">
                    <input type="text" value="${_esc(p.label||'')}" placeholder="항목명"
                        style="width:100%; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        oninput="ProdStandardsModule._smParamInput(${i},'label',this.value)">
                </td>
                <td style="padding:3px 4px;">
                    <input type="text" value="${_esc(p.unit||'')}" placeholder="단위"
                        style="width:60px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        oninput="ProdStandardsModule._smParamInput(${i},'unit',this.value)">
                </td>
                <td style="padding:3px 4px;">
                    <select style="padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        onchange="ProdStandardsModule._smParamInput(${i},'itemType',this.value)">
                        <option value="prod" ${p.itemType==='prod'?'selected':''}>제품</option>
                        <option value="proc" ${p.itemType==='proc'?'selected':''}>공정</option>
                    </select>
                </td>
                <td style="padding:3px 4px;">
                    <input type="text" value="${_esc(p.method||'')}" placeholder="확인방법"
                        style="width:80px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        oninput="ProdStandardsModule._smParamInput(${i},'method',this.value)">
                </td>
                <td style="padding:3px 4px;">
                    <input type="text" list="smCycleList" value="${_esc(p.cycle||'')}" placeholder="주기"
                        style="width:90px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        oninput="ProdStandardsModule._smParamInput(${i},'cycle',this.value)">
                </td>
                <td style="padding:3px 4px;">
                    <input type="text" list="smControlPlanList" value="${_esc(p.controlPlan||'')}" placeholder="관리방안"
                        style="width:110px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                        oninput="ProdStandardsModule._smParamInput(${i},'controlPlan',this.value)">
                </td>
                <td style="padding:3px 4px; text-align:center;">
                    <button style="border:none; background:none; cursor:pointer; color:var(--accent-red);"
                        onclick="ProdStandardsModule._smRemoveParam(${i})">
                        <span class="material-symbols-outlined" style="font-size:15px;">remove_circle</span>
                    </button>
                </td>
            </tr>`).join('');

        const controlPlanOptions = _smGetControlPlanOptions()
            .map(v => `<option value="${_esc(v)}">`)
            .join('');

        return `
            <datalist id="smControlPlanList">${controlPlanOptions}</datalist>
            <datalist id="smCycleList">
                <option value="수시">
                <option value="전수">
                <option value="1회/일">
                <option value="2회/일">
                <option value="3회/일">
                <option value="1회/주">
                <option value="1회/월">
                <option value="1회/분기">
                <option value="1회/6개월">
                <option value="1회/년">
                <option value="1EA/LOT">
                <option value="3EA/LOT">
                <option value="5EA/LOT">
                <option value="10EA/LOT">
                <option value="3Box/LOT">
                <option value="초·중·종">
                <option value="변경시">
            </datalist>
            <div style="font-weight:700; font-size:15px; margin-bottom:14px;">
                ${isNew ? '+ 세부공정 추가' : '세부공정 편집'} —
                <span style="color:var(--accent-blue);">${st.process}</span>
            </div>
            <div style="margin-bottom:14px;">
                <div class="form-group" style="margin:0; max-width:280px;">
                    <label class="form-label" style="font-size:12px;">세부공정명</label>
                    <input type="text" id="smStName" class="form-input" value="${_esc(st.station)}"
                        placeholder="예) 하도 공급" style="font-size:13px;">
                </div>
            </div>
            <div style="font-weight:600; font-size:13px; margin-bottom:6px;">파라미터 목록</div>
            <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:8px; margin-bottom:10px;">
                <table style="width:100%; font-size:12px; border-collapse:collapse; min-width:500px;">
                    <thead style="background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:5px 6px; width:22px;"></th>
                            <th style="padding:5px 8px; text-align:left;">항목명</th>
                            <th style="padding:5px 8px; text-align:left;">단위</th>
                            <th style="padding:5px 8px; text-align:left;">관리항목</th>
                            <th style="padding:5px 8px; text-align:left;">확인방법</th>
                            <th style="padding:5px 8px; text-align:left;">주기</th>
                            <th style="padding:5px 8px; text-align:left;">관리방안</th>
                            <th style="padding:5px 8px; width:30px;"></th>
                        </tr>
                    </thead>
                    <tbody id="smParamTbody">${paramRows}</tbody>
                </table>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button class="btn btn-secondary" style="font-size:12px;" onclick="ProdStandardsModule._smAddParam()">
                    <span class="material-symbols-outlined" style="font-size:13px;">add</span> 파라미터 추가
                </button>
                <button class="btn btn-secondary" style="font-size:12px;" onclick="ProdStandardsModule._smToggleCopyPanel()">
                    <span class="material-symbols-outlined" style="font-size:13px;">content_copy</span>
                    다른 공정에서 복사${_smCopyState.visible ? ' ▲' : ' ▼'}
                </button>
            </div>
            ${_smBuildCopyPanelHtml()}`;
    }

    function _smBuildCopyPanelHtml() {
        if (!_smCopyState.visible) return '';

        const srcProc   = _smCopyState.srcProc;
        const procList  = _smGetOrderedProcs('');  // unified: all processes
        const stationList = srcProc ? _smGetOrderedStations('', srcProc) : [];

        const procOptions = procList
            .map(p => `<option value="${_esc(p)}" ${p === srcProc ? 'selected' : ''}>${p}</option>`)
            .join('');
        const stationOptions = stationList
            .map(s => `<option value="${_esc(s)}" ${s === _smCopyState.srcStation ? 'selected' : ''}>${s}</option>`)
            .join('');

        return `
        <div id="smCopyPanel" style="margin-top:10px; padding:12px 14px; background:var(--bg-secondary);
            border:1px solid var(--border-color); border-radius:8px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:10px; color:var(--accent-blue);">
                <span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">content_copy</span>
                &nbsp;다른 공정에서 파라미터 복사해 오기
            </div>
            <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
                <div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:3px;">공정 선택</div>
                    <select id="smCopySrcProc" style="padding:4px 8px; border:1px solid var(--border-color);
                        border-radius:6px; font-size:12px; min-width:120px;"
                        onchange="ProdStandardsModule._smCopySrcProcChange(this.value)">
                        <option value="">-- 공정 선택 --</option>
                        ${procOptions}
                    </select>
                </div>
                <div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:3px;">세부공정 선택</div>
                    <select id="smCopySrcStation" style="padding:4px 8px; border:1px solid var(--border-color);
                        border-radius:6px; font-size:12px; min-width:140px;"
                        onchange="ProdStandardsModule._smCopySrcStationChange(this.value)">
                        <option value="">-- 세부공정 선택 --</option>
                        ${stationOptions}
                    </select>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-primary" style="font-size:12px; padding:4px 12px;"
                        onclick="if(confirm('현재 파라미터를 선택한 세부공정의 파라미터로 교체할까요?')) ProdStandardsModule._smApplyCopy('replace')">
                        <span class="material-symbols-outlined" style="font-size:13px;">content_copy</span> 복사해 오기
                    </button>
                    <button class="btn btn-secondary" style="font-size:12px; padding:4px 10px;"
                        onclick="ProdStandardsModule._smToggleCopyPanel()">취소</button>
                </div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">
                ※ 선택한 세부공정의 파라미터로 현재 파라미터 목록을 교체합니다.
            </div>
        </div>`;
    }

    function _smBackToList() {
        _smEditState = null;
        _smCopyState = { visible: false, srcLine: '', srcProc: '', srcStation: '' };
        _smRefresh();
    }

    /** 목록 화면에서 저장 후 닫기 — 메인 파라미터 테이블도 재렌더링 */
    function _smSaveAndClose() {
        UIUtils.closeModal();
        // 세부공정 설정 변경이 메인 표에 반영되도록 재렌더
        if (typeof _renderParamTable === 'function') _renderParamTable();
        UIUtils.toast('세부공정 설정이 저장되었습니다.', 'success');
    }

    // ── 공정 추가/삭제 ──────────────────────────────────────────────
    function _smShowProcForm() {
        _smProcFormState = { name: '' };
        _smProcFormMode  = true;
        _smRefresh();
    }

    function _smCancelProcForm() {
        _smProcFormMode = false;
        _smRefresh();
    }

    function _smBuildProcFormHtml() {
        const s = _smProcFormState;
        return `
            <div style="font-weight:700; font-size:15px; margin-bottom:18px;">
                <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; color:var(--accent-blue);">add_circle</span>
                &nbsp;새 공정 추가
            </div>
            <div style="margin-bottom:18px;">
                <div class="form-group" style="margin:0; max-width:280px;">
                    <label class="form-label" style="font-size:12px;">공정명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" id="smProcName" class="form-input" value="${_esc(s.name)}"
                        placeholder="예) 프라이머" style="font-size:13px;">
                </div>
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin:0;">
                공정을 추가한 뒤 세부공정 추가 버튼으로 세부공정을 등록하세요.
            </p>`;
    }

    async function _smSaveProcess() {
        const nameEl = document.getElementById('smProcName');
        const name   = (nameEl ? nameEl.value : '').trim();
        if (!name) { UIUtils.toast('공정명을 입력하세요', 'error'); return; }
        const line   = _smGetLine();  // derive from current active proc
        const carCfg = _getCarConfig('');
        if (carCfg[name]) { UIUtils.toast(`'${name}' 공정이 이미 존재합니다`, 'error'); return; }

        const list = [..._getCustomProcesses(line), { name }];
        await _saveCustomProcessesToDB(line, list);

        _smActiveProc   = name;
        _smLine         = _smGetLine();
        _smProcFormMode = false;
        UIUtils.toast(`'${name}' 공정이 추가됐습니다 (${line})`, 'success');
        _smRefresh();
    }

    async function _smDeleteProcess(proc) {
        const line = _getStorageLine(proc);
        const customProcs = _getCustomProcesses(line);
        if (!customProcs.some(cp => cp.name === proc)) {
            UIUtils.toast('기본 공정은 삭제할 수 없습니다', 'error');
            return;
        }
        if (!window.confirm(`'${proc}' 공정을 삭제할까요?\n해당 공정의 커스텀 세부공정도 함께 삭제됩니다.`)) return;

        await _saveCustomProcessesToDB(line, customProcs.filter(cp => cp.name !== proc));
        const newSt = _getCustomStations(line).filter(c => c.process !== proc);
        await _saveCustomStationsToDB(line, newSt);

        if (_smActiveProc === proc) {
            _smActiveProc = _smGetOrderedProcs('')[0] || null;
        }
        UIUtils.toast(`'${proc}' 공정 삭제 완료`, 'success');
        _smRefresh();
    }

    // ── 파라미터 행 드래그&드롭 순서 변경 ──────────────────────────

    function _smParamDragStart(e, idx) {
        _smDragSrcIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        // 드래그 시작 행 흐리게
        setTimeout(() => {
            const tr = document.getElementById('smPRow_' + idx);
            if (tr) { tr.style.opacity = '0.35'; tr.style.transition = 'opacity .15s'; }
        }, 0);
    }

    function _smParamDragOver(e, idx) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (_smDragOverIdx === idx) return;
        // 이전 하이라이트 제거
        if (_smDragOverIdx >= 0) {
            const prev = document.getElementById('smPRow_' + _smDragOverIdx);
            if (prev) prev.style.outline = '';
        }
        _smDragOverIdx = idx;
        const tr = document.getElementById('smPRow_' + idx);
        if (tr && idx !== _smDragSrcIdx) {
            tr.style.outline = '2px solid var(--accent-blue)';
            tr.style.outlineOffset = '-2px';
        }
    }

    function _smParamDrop(e, targetIdx) {
        e.preventDefault();
        const srcIdx = _smDragSrcIdx;
        _smDragSrcIdx  = -1;
        _smDragOverIdx = -1;
        if (srcIdx < 0 || srcIdx === targetIdx || !_smEditState) return;
        // params 배열 순서 변경
        const params = _smEditState.params;
        const [moved] = params.splice(srcIdx, 1);
        params.splice(targetIdx, 0, moved);
        _smRefresh();
    }

    function _smParamDragEnd(e, idx) {
        // 드롭 취소 시에도 상태 정리
        const tr = document.getElementById('smPRow_' + idx);
        if (tr) { tr.style.opacity = ''; tr.style.transition = ''; }
        if (_smDragOverIdx >= 0) {
            const prev = document.getElementById('smPRow_' + _smDragOverIdx);
            if (prev) { prev.style.outline = ''; }
        }
        _smDragSrcIdx  = -1;
        _smDragOverIdx = -1;
    }

    function _smParamInput(idx, field, val) {
        if (!_smEditState || !_smEditState.params[idx]) return;
        _smEditState.params[idx][field] = val;
    }

    function _smAddParam() {
        if (!_smEditState) return;
        const i = _smEditState.params.length;
        const key = 'c_' + Date.now() + '_' + i;
        _smEditState.params.push({ key, label:'', unit:'', itemType:'proc', special:'', spec:'', method:'', cycle:'', controlPlan:'' });
        // tbody에 행 추가
        const tbody = document.getElementById('smParamTbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.id = 'smPRow_' + i;
        tr.style.borderTop = '1px solid var(--border-color)';
        tr.setAttribute('ondragover', `ProdStandardsModule._smParamDragOver(event,${i})`);
        tr.setAttribute('ondrop',     `ProdStandardsModule._smParamDrop(event,${i})`);
        tr.innerHTML = `
            <td draggable="true"
                ondragstart="ProdStandardsModule._smParamDragStart(event,${i})"
                ondragend="ProdStandardsModule._smParamDragEnd(event,${i})"
                style="padding:3px 6px; text-align:center; cursor:grab; color:var(--text-muted); user-select:none;">
                <span class="material-symbols-outlined" style="font-size:17px; vertical-align:middle; pointer-events:none;">drag_indicator</span>
            </td>
            <td style="padding:3px 4px;">
                <input type="text" value="" placeholder="항목명"
                    style="width:100%; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    oninput="ProdStandardsModule._smParamInput(${i},'label',this.value)">
            </td>
            <td style="padding:3px 4px;">
                <input type="text" value="" placeholder="단위"
                    style="width:60px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    oninput="ProdStandardsModule._smParamInput(${i},'unit',this.value)">
            </td>
            <td style="padding:3px 4px;">
                <select style="padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    onchange="ProdStandardsModule._smParamInput(${i},'itemType',this.value)">
                    <option value="prod">제품</option>
                    <option value="proc" selected>공정</option>
                </select>
            </td>
            <td style="padding:3px 4px;">
                <input type="text" value="" placeholder="확인방법"
                    style="width:80px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    oninput="ProdStandardsModule._smParamInput(${i},'method',this.value)">
            </td>
            <td style="padding:3px 4px;">
                <input type="text" list="smCycleList" value="" placeholder="주기"
                    style="width:90px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    oninput="ProdStandardsModule._smParamInput(${i},'cycle',this.value)">
            </td>
            <td style="padding:3px 4px;">
                <input type="text" list="smControlPlanList" value="" placeholder="관리방안"
                    style="width:110px; padding:3px 5px; border:1px solid var(--border-color); border-radius:4px; font-size:12px;"
                    oninput="ProdStandardsModule._smParamInput(${i},'controlPlan',this.value)">
            </td>
            <td style="padding:3px 4px; text-align:center;">
                <button style="border:none; background:none; cursor:pointer; color:var(--accent-red);"
                    onclick="ProdStandardsModule._smRemoveParam(${i})">
                    <span class="material-symbols-outlined" style="font-size:15px;">remove_circle</span>
                </button>
            </td>`;
        tbody.appendChild(tr);
    }

    function _smRemoveParam(idx) {
        if (!_smEditState) return;
        _smEditState.params.splice(idx, 1);
        _smRefresh(); // 인덱스 재정렬 필요 → 폼 재렌더
    }

    async function _smSaveStation() {
        const st = _smEditState;
        if (!st) return;
        const stName = (document.getElementById('smStName') || {}).value || st.station;

        if (!stName.trim()) { UIUtils.toast('세부공정명을 입력하세요.', 'warning'); return; }

        // 파라미터 key 정리 (빈 항목 제거, key 자동 생성)
        const params = st.params
            .filter(p => p.label && p.label.trim())
            .map((p, i) => ({
                key:         p.key || ('c_' + stName.replace(/\s/g,'') + '_' + i),
                label:       p.label.trim(),
                unit:        p.unit || '-',
                itemType:    p.itemType || 'proc',
                special:     p.special || '',
                spec:        p.spec    || '',
                method:      p.method  || '',
                cycle:       p.cycle   || '',
                controlPlan: p.controlPlan || ''
            }));

        // 커스텀 목록 갱신 (공정의 storeLine 기준)
        const line = _smGetLine();
        let customs = _getCustomStations(line).filter(
            c => !(c.process === st.process && c.station === st.origStation)
        );
        customs.push({ process: st.process, station: stName, params });
        await _saveCustomStationsToDB(line, customs);

        UIUtils.toast(`[${st.process}] ${stName} 세부공정 저장 완료`, 'success');
        _smEditState = null;
        _smActiveProc = st.process;
        _smRefresh();
    }

    async function _smDeleteStation(proc, stName) {
        if (!window.confirm(`[${proc}] '${stName}' 세부공정을 삭제할까요?`)) return;

        const line = _getStorageLine(proc);

        // ① 커스텀 목록에서 제거 (추가·덮어쓰기된 항목 삭제)
        const wasCustom = _getCustomStations(line).some(
            c => c.process === proc && c.station === stName
        );
        if (wasCustom) {
            await _saveCustomStationsToDB(line,
                _getCustomStations(line).filter(
                    c => !(c.process === proc && c.station === stName)
                )
            );
        }

        // ② PROCESS_CONFIG 기본 스테이션이면 숨김 목록에 추가 (커스텀 제거만으로는 원본이 복원되므로)
        if (PROCESS_CONFIG[proc] && PROCESS_CONFIG[proc].stations && PROCESS_CONFIG[proc].stations[stName]) {
            const hidden = _getHiddenStations(line).filter(
                h => !(h.process === proc && h.station === stName)
            );
            hidden.push({ process: proc, station: stName });
            await _saveHiddenStationsToDB(line, hidden);
        }

        // ③ 세부공정 순서 캐시에서도 제거
        await _saveStationOrderToDB('A라인', proc,
            _getStationOrder('A라인', proc).filter(s => s !== stName)
        );

        UIUtils.toast(`'${stName}' 삭제 완료`, 'success');
        _smRefresh();
    }

    // ── 개정 이력 관리 (차종·품명별) ─────────────────────────────
    const REV_HIST_KEY_PFX = 'prod_rev_hist__';  // + carModel + '__' + partName
    let _revHistCache = null;   // 현재 선택된 차종/품명의 개정이력
    let _revHistKey   = '';

    async function _loadRevHist(carModel, partName) {
        const key = REV_HIST_KEY_PFX + (carModel||'') + '__' + (partName||'');
        if (_revHistKey === key && _revHistCache !== null) return _revHistCache;
        try {
            const val = await DB.getConfig(key);
            _revHistCache = Array.isArray(val) ? val : [];
        } catch(e) {
            _revHistCache = [];
        }
        _revHistKey = key;
        return _revHistCache;
    }

    async function _saveRevHist(carModel, partName, list) {
        const key = REV_HIST_KEY_PFX + (carModel||'') + '__' + (partName||'');
        _revHistCache = list;
        _revHistKey   = key;
        await DB.setConfig(key, list);
    }

    /** 개정이력 행 추가 */
    async function addRevRow() {
        if (!_curCarModel || !_curPartName) {
            UIUtils.toast('차종과 품명을 먼저 선택하세요.', 'warning');
            return;
        }
        const list = await _loadRevHist(_curCarModel, _curPartName);
        const nextNo = list.length > 0 ? (Math.max(...list.map(r => r.no || 0)) + 1) : 1;
        list.push({ no: nextNo, date: '', reason: '' });
        await _saveRevHist(_curCarModel, _curPartName, list);
        _refreshRevSection();
    }

    /** 개정이력 셀 변경 */
    async function revInput(no, field, val) {
        if (!_curCarModel || !_curPartName) return;
        const list = await _loadRevHist(_curCarModel, _curPartName);
        const row = list.find(r => r.no === no);
        if (row) {
            row[field] = val;
            await _saveRevHist(_curCarModel, _curPartName, list);
        }
    }

    /** 개정이력 행 삭제 */
    async function deleteRevRow(no) {
        if (!_curCarModel || !_curPartName) return;
        const list = await _loadRevHist(_curCarModel, _curPartName);
        const newList = list.filter(r => r.no !== no);
        await _saveRevHist(_curCarModel, _curPartName, newList);
        _refreshRevSection();
    }

    /** 개정이력 섹션만 새로고침 */
    function _refreshRevSection() {
        const el = document.getElementById('revHistSection');
        if (el) el.outerHTML = _renderRevHistSection_sync();
    }

    /** 개정이력 섹션 HTML (동기 — _revHistCache 사용) */
    function _renderRevHistSection_sync() {
        const list = _revHistCache || [];
        const rows = list.map(r => `
            <tr id="revRow_${r.no}">
                <td style="text-align:center; font-weight:700; width:48px; padding:4px 6px;">${r.no}</td>
                <td style="padding:3px 5px;">
                    <input type="date" class="form-input" style="height:28px; font-size:12px; width:130px;"
                        value="${_esc(r.date || '')}"
                        onchange="ProdStandardsModule.revInput(${r.no},'date',this.value)">
                </td>
                <td style="padding:3px 5px;">
                    <input type="text" class="form-input" style="height:28px; font-size:12px; width:100%;"
                        value="${_esc(r.reason || '')}" placeholder="개정 사유를 입력하세요"
                        oninput="ProdStandardsModule.revInput(${r.no},'reason',this.value)">
                </td>
                <td style="text-align:center; padding:3px 5px; width:40px;">
                    <button type="button" title="행 삭제"
                        onclick="ProdStandardsModule.deleteRevRow(${r.no})"
                        style="background:transparent; border:1px solid var(--accent-red); color:var(--accent-red);
                               border-radius:4px; padding:2px 6px; cursor:pointer; font-size:12px; height:26px;">
                        <span class="material-symbols-outlined" style="font-size:13px;">delete</span>
                    </button>
                </td>
            </tr>`).join('');

        const emptyMsg = list.length === 0
            ? `<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px;">
                    개정 이력이 없습니다. 행 추가 버튼으로 등록하세요.
               </td></tr>` : '';

        return `<div id="revHistSection" class="card" style="margin-bottom:16px;">
            <div style="padding:12px 18px; border-bottom:1px solid var(--border-color);
                        display:flex; align-items:center; gap:8px;">
                <span class="material-symbols-outlined" style="font-size:17px; color:var(--accent-purple,#7c3aed);">rate_review</span>
                <span style="font-weight:700; font-size:14px;">개정 이력</span>
                <span style="margin-left:6px; background:var(--accent-purple,#7c3aed); color:#fff;
                    border-radius:10px; padding:1px 8px; font-size:12px;">${list.length}</span>
                <button type="button"
                    onclick="ProdStandardsModule.addRevRow()"
                    style="margin-left:auto; display:flex; align-items:center; gap:4px;
                           background:var(--accent-purple,#7c3aed); color:#fff; border:none;
                           border-radius:6px; padding:5px 12px; cursor:pointer; font-size:12px; font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:14px;">add</span> 행 추가
                </button>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table" style="font-size:13px; width:100%;">
                    <thead>
                        <tr>
                            <th style="width:48px; text-align:center;">NO</th>
                            <th style="width:140px;">개정일자</th>
                            <th>개정 사유</th>
                            <th style="width:40px;"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}${emptyMsg}</tbody>
                </table>
            </div>
        </div>`;
    }

    // ── 업로드 이력 CRUD (DB.setConfig / DB.getConfig 직접 사용) ──
    const CP_HISTORY_KEY    = 'cp_history';
    const CP_USER_MAP_PREFIX = 'cp_user_map__';   // + carModel + '__' + partName
    let _cpHistCache    = null;  // null = DB에서 아직 로드 안 됨
    let _cpUserMapCache = {};    // { 'carModel||partName': entry[] }

    // 첫 렌더 시 비동기로 DB에서 이력 로드 → 완료 후 배지 갱신
    async function _initCpHistCache() {
        try {
            const val = await DB.getConfig(CP_HISTORY_KEY);
            _cpHistCache = Array.isArray(val) ? val : [];
        } catch(e) {
            _cpHistCache = [];
        }
        _updateBadge();
    }

    function _loadCpHistory() {
        return _cpHistCache || [];
    }

    async function _saveCpHistory(entry) {
        if (_cpHistCache === null) _cpHistCache = [];
        // 현재 선택된 공정 흐름을 이력에 포함
        entry.flow = _cpSelectedFlow ? [..._cpSelectedFlow] : [...CANONICAL_PROCESS_ORDER];
        // 동일 차종/품명 중복 제거 후 최신순 삽입
        _cpHistCache = _cpHistCache.filter(
            h => !(h.carModel === entry.carModel && h.partName === entry.partName)
        );
        _cpHistCache.unshift(entry);
        await DB.setConfig(CP_HISTORY_KEY, _cpHistCache);
    }

    async function deleteCpHistory(importId) {
        // 이력 항목 제거
        if (_cpHistCache === null) _cpHistCache = [];
        _cpHistCache = _cpHistCache.filter(e => e.importId !== importId);
        await DB.setConfig(CP_HISTORY_KEY, _cpHistCache);

        // 해당 importId 로 저장된 파라미터 레코드도 제거
        const standards = Storage.getAll(DB.STORES.PROD_STANDARDS);
        for (const s of standards) {
            if (s.importId === importId) {
                await Storage.remove(DB.STORES.PROD_STANDARDS, s.id);
            }
        }
        UIUtils.toast('이력 및 관련 파라미터가 삭제되었습니다.', 'success');
        _renderStandardsDetail(document.getElementById('contentArea'));
    }

    function _renderCpHistorySection() {
        const list = _loadCpHistory();
        if (list.length === 0) return '';

        const rows = list.map(e => `
            <tr>
                <td style="font-weight:600;">${e.fileName}</td>
                <td style="color:var(--text-muted); font-size:12px;">${e.sheetName || '-'}</td>
                <td>${e.carModel || '-'} / ${e.partName || '-'}</td>
                <td style="font-size:12px; color:var(--text-muted);">${e.partNo || '-'}</td>
                <td style="font-size:12px;">${e.uploadedAt ? e.uploadedAt.substring(0,16) : '-'}</td>
                <td style="text-align:center;">
                    ${(e.groups||[]).map(g =>
                        `<span style="display:inline-block; background:var(--bg-secondary);
                            border-radius:4px; padding:1px 6px; font-size:11px; margin:1px;">
                            ${g.process}·${g.station}(${g.count})</span>`
                    ).join('')}
                </td>
                <td style="text-align:center; white-space:nowrap;">
                    ${(() => {
                        const stds = Storage.getAll(DB.STORES.PROD_STANDARDS);
                        const hasSaved = stds.some(s =>
                            s.carModel === e.carModel && s.partName === e.partName && s._docKind !== STANDARD_DOC_KIND);
                        return hasSaved
                            ? `<button class="btn btn-sm" title="파라미터 값 초기화 (이력·매핑 유지)"
                                style="border:1px solid var(--accent-orange); color:var(--accent-orange);
                                       background:transparent; padding:2px 8px; margin-right:4px;"
                                onclick="ProdStandardsModule.resetCpParams('${e.importId}','${_esc(e.carModel || '')}','${_esc(e.partName || '')}')">
                                <span class="material-symbols-outlined" style="font-size:13px;">restart_alt</span>
                               </button>`
                            : `<span style="font-size:11px; color:var(--text-muted); margin-right:8px;">데이터 없음</span>`;
                    })()}
                    <button class="btn btn-sm" title="이력 및 파라미터 완전 삭제"
                        style="border:1px solid var(--accent-red); color:var(--accent-red);
                               background:transparent; padding:2px 8px;"
                        onclick="UIUtils.confirm('이 이력과 관련 파라미터를 모두 삭제할까요?', () => ProdStandardsModule.deleteCpHistory('${e.importId}'))">
                        <span class="material-symbols-outlined" style="font-size:13px;">delete</span>
                    </button>
                </td>
            </tr>`).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div style="padding:12px 18px; border-bottom:1px solid var(--border-color);
                        display:flex; align-items:center; gap:8px; cursor:pointer;"
                 onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display==='none' ? 'block' : 'none'">
                <span class="material-symbols-outlined" style="font-size:17px; color:var(--accent-blue);">history</span>
                <span style="font-weight:700; font-size:14px;">관리계획서 업로드 이력</span>
                <span style="margin-left:6px; background:var(--accent-blue); color:#fff;
                    border-radius:10px; padding:1px 8px; font-size:12px;">${list.length}</span>
                <span class="material-symbols-outlined" style="margin-left:auto; font-size:18px; color:var(--text-muted);">expand_more</span>
            </div>
            <div style="display:none;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:13px;">
                        <thead>
                            <tr>
                                <th>파일명</th>
                                <th>시트명</th>
                                <th>차종 / 품명</th>
                                <th>품번</th>
                                <th>업로드 일시</th>
                                <th>공정·항목</th>
                                <th style="width:90px; text-align:center;">초기화 / 삭제</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── CP 공정 흐름 선택 헬퍼 ─────────────────────────────────────

    /** _cpSelectedFlow → _cpUploadLine 동기화 (하위호환) */
    function _syncCpLineFromFlow() {
        const paints = (_cpSelectedFlow || []).filter(p => p.startsWith('도장'));
        _cpUploadLine = (paints.length === 1 && paints[0] === '도장(B)') ? 'B라인' : 'A라인';
    }

    /** 공정 흐름 선택 UI 내용 HTML (container 안에 주입) */
    function _cpFlowSelectorHtml() {
        const chips = [];
        const sel   = _cpSelectedFlow || [];
        const unsel = CANONICAL_PROCESS_ORDER.filter(
            p => !COMMON_PROCESSES.has(p) && !sel.includes(p)
        );

        sel.forEach((p, idx) => {
            const isCommon = COMMON_PROCESSES.has(p);
            const arrow = idx === 0 ? '' : '<span style="color:var(--text-muted);font-size:10px;margin:0 1px;">→</span>';
            if (isCommon) {
                chips.push(`${arrow}<span style="font-size:11px;padding:2px 8px;border-radius:10px;
                    background:var(--bg-secondary);color:var(--text-primary);
                    border:1px solid var(--border-color);white-space:nowrap;">${p}</span>`);
            } else {
                // 선택 공정: 이동 버튼 + 제거 버튼
                const prevIsOpt = idx > 0 && !COMMON_PROCESSES.has(sel[idx - 1]);
                const nextIsOpt = idx < sel.length - 1 && !COMMON_PROCESSES.has(sel[idx + 1]);
                const btnStyle  = 'padding:0 2px;font-size:10px;border:none;background:transparent;cursor:pointer;color:var(--accent-orange);line-height:1;';
                const moveLeft  = prevIsOpt ? `<button onclick="ProdStandardsModule._moveCpFlowProc('${_esc(p)}',-1)" title="앞으로" style="${btnStyle}">◀</button>` : '';
                const moveRight = nextIsOpt ? `<button onclick="ProdStandardsModule._moveCpFlowProc('${_esc(p)}',1)"  title="뒤로" style="${btnStyle}">▶</button>` : '';
                const remove    = `<button onclick="ProdStandardsModule._toggleCpFlowProc('${_esc(p)}')" title="제거" style="${btnStyle}font-size:12px;">×</button>`;
                chips.push(`${arrow}<span style="display:inline-flex;align-items:center;gap:1px;
                    font-size:11px;padding:1px 3px 1px 8px;border-radius:10px;
                    background:var(--accent-orange,#ea580c)22;color:var(--accent-orange,#ea580c);
                    border:1px solid var(--accent-orange,#ea580c);white-space:nowrap;">
                    ${moveLeft}${p}${moveRight}${remove}</span>`);
            }
        });

        // 미선택 optional 공정: [+ 추가] 버튼
        const addBtns = unsel.map(p =>
            `<button onclick="ProdStandardsModule._toggleCpFlowProc('${_esc(p)}')"
                style="font-size:11px;padding:2px 8px;border-radius:10px;cursor:pointer;
                       background:transparent;color:var(--text-muted);
                       border:1px dashed var(--border-color);">+ ${p}</button>`
        ).join('');

        return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            ${chips.join('')}
            ${unsel.length ? `<span style="color:var(--text-muted);font-size:10px;margin-left:4px;">│</span>${addBtns}` : ''}
        </div>`;
    }

    /** 선택 공정 흐름 DOM 갱신 */
    function _refreshCpFlowUI() {
        const el = document.getElementById('cpFlowSelectorContainer');
        if (el) el.innerHTML = _cpFlowSelectorHtml();
        // 프리뷰 모달의 흐름 표시도 갱신
        const el2 = document.getElementById('cpPreviewFlowContainer');
        if (el2) el2.innerHTML = _cpPreviewFlowHtml();
    }

    /** 선택 공정 토글 (optional만) */
    function _toggleCpFlowProc(procName) {
        if (COMMON_PROCESSES.has(procName)) return;
        const idx = _cpSelectedFlow.indexOf(procName);
        if (idx >= 0) {
            _cpSelectedFlow = _cpSelectedFlow.filter(p => p !== procName);
        } else {
            // canonical 순서에 맞는 위치에 삽입
            const ci = CANONICAL_PROCESS_ORDER.indexOf(procName);
            let ins  = _cpSelectedFlow.length;
            for (let i = 0; i < _cpSelectedFlow.length; i++) {
                if (CANONICAL_PROCESS_ORDER.indexOf(_cpSelectedFlow[i]) > ci) { ins = i; break; }
            }
            _cpSelectedFlow = [..._cpSelectedFlow.slice(0, ins), procName, ..._cpSelectedFlow.slice(ins)];
        }
        _syncCpLineFromFlow();
        _refreshCpFlowUI();
        // 미리보기 모달이 열려 있으면 즉시 재검증
        if (_cpParsedGroups) {
            _rerenderValidationTbody();
            const diagEl = document.getElementById('cpDiagSummary');
            if (diagEl) diagEl.innerHTML = _cpDiagnosticSummaryHtml(_cpParsedGroups);
            _refreshGroupsPreview();
        }
    }

    /** 선택 공정 순서 변경 (optional만, dir: -1 앞으로 / +1 뒤로) */
    function _moveCpFlowProc(procName, dir) {
        const idx = _cpSelectedFlow.indexOf(procName);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= _cpSelectedFlow.length) return;
        const arr = [..._cpSelectedFlow];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        _cpSelectedFlow = arr;
        _syncCpLineFromFlow();
        _refreshCpFlowUI();
        if (_cpParsedGroups) {
            _rerenderValidationTbody();
            const diagEl = document.getElementById('cpDiagSummary');
            if (diagEl) diagEl.innerHTML = _cpDiagnosticSummaryHtml(_cpParsedGroups);
            _refreshGroupsPreview();
        }
    }

    /** 미리보기 모달의 공정 흐름 표시 HTML (메인 툴바와 동일하게 ×·이동 버튼 포함) */
    function _cpPreviewFlowHtml() {
        const sel   = _cpSelectedFlow || [];
        const unsel = CANONICAL_PROCESS_ORDER.filter(p => !COMMON_PROCESSES.has(p) && !sel.includes(p));
        const btnS  = 'padding:0 2px;font-size:10px;border:none;background:transparent;cursor:pointer;color:var(--accent-orange,#ea580c);line-height:1;';

        const chips = sel.map((p, idx) => {
            const isCommon = COMMON_PROCESSES.has(p);
            const arrow = idx === 0 ? '' : '<span style="color:var(--text-muted);font-size:10px;margin:0 1px;">→</span>';
            if (isCommon) {
                return `${arrow}<span style="font-size:11px;padding:2px 8px;border-radius:10px;
                    background:var(--bg-secondary);color:var(--text-primary);
                    border:1px solid var(--border-color);white-space:nowrap;">${p}</span>`;
            }
            // 선택 공정: 이전·다음이 optional일 때만 이동 버튼 표시
            const prevIsOpt = idx > 0 && !COMMON_PROCESSES.has(sel[idx - 1]);
            const nextIsOpt = idx < sel.length - 1 && !COMMON_PROCESSES.has(sel[idx + 1]);
            const ml = prevIsOpt ? `<button onclick="ProdStandardsModule._moveCpFlowProc('${_esc(p)}',-1)" title="앞으로" style="${btnS}">◀</button>` : '';
            const mr = nextIsOpt ? `<button onclick="ProdStandardsModule._moveCpFlowProc('${_esc(p)}',1)"  title="뒤로"  style="${btnS}">▶</button>` : '';
            const mx = `<button onclick="ProdStandardsModule._toggleCpFlowProc('${_esc(p)}')" title="제거" style="${btnS}font-size:12px;">×</button>`;
            return `${arrow}<span style="display:inline-flex;align-items:center;gap:1px;
                font-size:11px;padding:1px 3px 1px 8px;border-radius:10px;
                background:var(--accent-orange,#ea580c)22;color:var(--accent-orange,#ea580c);
                border:1px solid var(--accent-orange,#ea580c);white-space:nowrap;">
                ${ml}${p}${mr}${mx}</span>`;
        }).join('');

        const addBtns = unsel.map(p =>
            `<button onclick="ProdStandardsModule._toggleCpFlowProc('${_esc(p)}')"
                style="font-size:11px;padding:2px 8px;border-radius:10px;cursor:pointer;
                       background:transparent;color:var(--text-muted);border:1px dashed var(--border-color);">+ ${p}</button>`
        ).join('');

        return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            ${chips}
            ${unsel.length ? `<span style="color:var(--text-muted);font-size:10px;margin-left:2px;">│</span>${addBtns}` : ''}
        </div>`;
    }

    /** @deprecated - 하위호환용 (A/B 라인 변경 → 이제 flow로 처리) */
    function _setCpUploadLine(line) {
        // 기존 A/B 라인 선택 → flow에서 도장 공정을 해당 라인으로 교체
        const targetProc = line === 'B라인' ? '도장(B)' : '도장(A)';
        const otherProc  = line === 'B라인' ? '도장(A)' : '도장(B)';
        // 다른 라인 도장이 있으면 교체, 없으면 추가
        if (_cpSelectedFlow.includes(otherProc) && !_cpSelectedFlow.includes(targetProc)) {
            _cpSelectedFlow = _cpSelectedFlow.map(p => p === otherProc ? targetProc : p);
        } else if (!_cpSelectedFlow.includes(targetProc)) {
            _toggleCpFlowProc(targetProc);
            return;
        }
        _syncCpLineFromFlow();
        _refreshCpFlowUI();
    }

    function onControlPlanUpload(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const fileName = file.name;   // 파일명 보관
        input.value = '';

        if (!window.XLSX) {
            UIUtils.toast('SheetJS 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.', 'warning');
            return;
        }

        UIUtils.toast('파일 읽는 중...', 'info');
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                _cpWorkbook    = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                _cpCurrentMeta = { fileName };   // 파일명 저장
                const names    = _cpWorkbook.SheetNames;

                        // 공정 키워드로 관리계획서 시트 자동 탐지
                const CP_KW = ['수입검사','보관','도장','레이져','레이저','출하검사'];
                let autoSheet = null;
                let bestScore = 0;

                names.forEach(name => {
                    try {
                        const rows = XLSX.utils.sheet_to_json(
                            _cpWorkbook.Sheets[name], { header:1, defval:'', raw:false }
                        );
                        const flat = rows.slice(0, 60).map(r => r.join('')).join('');
                        const score = CP_KW.filter(k => flat.includes(k)).length;
                        console.log(`[CP] 시트 "${name}" 키워드 점수:`, score);
                        if (score > bestScore) { bestScore = score; autoSheet = name; }
                    } catch(e) {}
                });

                if (autoSheet && bestScore >= 1) {
                    // 자동 감지 성공 → 바로 파싱
                    UIUtils.toast(`"${autoSheet}" 시트를 자동 감지했습니다.`, 'info');
                    setTimeout(async () => {
                        const parsed = _parseControlPlan(_cpWorkbook, autoSheet);
                        if (parsed) await _showImportPreview(parsed);
                    }, 100);
                } else {
                    // 자동 감지 실패 → 수동 선택 모달
                    _showSheetSelector(names);
                }
            } catch(err) {
                console.error('CP parse error:', err);
                UIUtils.toast('파일 파싱 오류: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _showSheetSelector(names) {
        // 공정 키워드가 있는 시트를 자동 추천
        const PROC_KW = ['수입검사','보관','도장','레이져','레이저','출하검사'];
        const recommended = names.find(name => {
            try {
                const rows = XLSX.utils.sheet_to_json(
                    _cpWorkbook.Sheets[name], { header: 1, defval: '', raw: false }
                );
                const flat = rows.slice(0, 40).map(r => r.join('')).join('');
                return PROC_KW.some(k => flat.includes(k));
            } catch(e) { return false; }
        });

        const body = `
            <div style="padding:8px 0;">
                <p style="margin-bottom:16px; color:var(--text-muted);">
                    이 파일에 <strong>${names.length}개</strong> 시트가 있습니다.<br>
                    파싱할 <strong>관리계획서 시트</strong>를 선택하세요.
                </p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${names.map((name, i) => {
                        const isRec = name === recommended;
                        return `
                        <button onclick="ProdStandardsModule._selectSheet('${name.replace(/'/g,"\\'")}')"
                            style="text-align:left; padding:12px 16px; border-radius:8px; cursor:pointer;
                                   border:2px solid ${isRec ? 'var(--accent-blue)' : 'var(--border-color)'};
                                   background:${isRec ? 'var(--accent-blue)11' : 'var(--bg-primary)'};
                                   font-size:14px; transition:border-color .15s;">
                            <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; margin-right:6px; color:${isRec ? 'var(--accent-blue)' : 'var(--text-muted)'};">
                                ${isRec ? 'check_circle' : 'description'}
                            </span>
                            <strong>${name}</strong>
                            ${isRec ? ' &nbsp;<span style="font-size:12px; color:var(--accent-blue);">← 권장</span>' : ''}
                        </button>`;
                    }).join('')}
                </div>
            </div>`;

        UIUtils.showModal(
            '시트 선택',
            body,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>`,
            'sm'
        );
    }

    function _selectSheet(sheetName) {
        UIUtils.closeModal();
        if (!_cpWorkbook) { UIUtils.toast('파일을 다시 업로드해 주세요.', 'warning'); return; }
        if (_cpCurrentMeta) _cpCurrentMeta.sheetName = sheetName;   // 시트명 저장
        UIUtils.toast(`"${sheetName}" 시트 파싱 중...`, 'info');
        setTimeout(async () => {
            try {
                const parsed = _parseControlPlan(_cpWorkbook, sheetName);
                if (parsed) await _showImportPreview(parsed);
            } catch(err) {
                console.error(err);
                UIUtils.toast('파싱 오류: ' + err.message, 'error');
            }
        }, 50);
    }

    // 셀 텍스트 정규화 (공백·줄바꿈·특수공백 제거, 소문자)
    function _norm(v) {
        return String(v || '').replace(/[\s\u00a0\u3000]+/g, '').toLowerCase();
    }
    // 셀 원본값 (trim만)
    function _t(v) { return String(v || '').trim(); }

    function _parseControlPlan(wb, sheetName) {
        const name  = sheetName || wb.SheetNames[0];
        const sheet = wb.Sheets[name];
        console.log('[CP] 파싱 시트:', name);

        /* SheetJS: raw:false → 날짜·숫자를 문자열로, defval:'' → 빈 셀 = '' */
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

        // ── 디버그 출력 (F12 콘솔에서 확인) ──────────────────────
        console.group('[관리계획서 파싱]');
        console.log('총 행수:', rows.length);
        rows.slice(0, 30).forEach((r, i) => {
            const cells = r.map((c, ci) => `[${ci}]${String(c).substring(0,15)}`).filter(s => !s.endsWith(']')).join('  ');
            if (cells) console.log(`row${String(i+1).padStart(2,'0')}: ${cells}`);
        });
        console.groupEnd();

        // ── 1. 메타 정보 ─────────────────────────────────────────
        const meta = { model: '', partName: '', partNo: '' };
        for (let i = 0; i < Math.min(15, rows.length); i++) {
            const r = rows[i];
            for (let j = 0; j < r.length; j++) {
                const n = _norm(r[j]);
                // 값은 같은 행에서 비어있지 않은 다음 셀
                const nextVal = () => {
                    for (let k = j+1; k < Math.min(j+5, r.length); k++) {
                        const v = _t(r[k]);
                        if (v) return v;
                    }
                    return '';
                };
                if (!meta.model    && (n==='모델'))                     meta.model    = nextVal();
                if (!meta.partName && (n==='부품명'||n==='품명'))       meta.partName = nextVal();
                if (!meta.partNo   && (n==='품번'  ||n==='품번호'))     meta.partNo   = nextVal();
            }
        }

        // ── 2. 공정명 열 찾기 (헤더 불필요 – 공정 키워드 직접 탐색) ──
        // 알려진 공정 키워드가 가장 많이 나오는 열 = 공정열
        // 관리계획서 공정명 열에 실제로 나타나는 텍스트 (관리계획서 기준)
        const PROC_KW = [
            '수입검사', '수입 검사',
            '보관',
            '도장', '도장공정',
            '레이져', '레이저', 'laser', 'LASER', '마킹',
            '출하검사', '출하 검사',
        ];

        const colScore = {}; // colIndex → 공정키워드 출현 가중 점수
        const _procKwNorm = PROC_KW.map(k => k.replace(/\s+/g,'').toLowerCase());
        rows.forEach(row => {
            row.forEach((cell, ci) => {
                const v = _t(cell);
                const vn = v.replace(/\s+/g,'').toLowerCase();
                if (!vn || vn.length > 12) return;
                const isExact = _procKwNorm.some(k => vn === k);
                const isIncl  = _procKwNorm.some(k => vn.includes(k));
                // 완전일치=2점, 부분포함=1점 — 세부공정 열이 "도장(로딩)" 등으로 점수 훔치는 것 방지
                if (isExact)      colScore[ci] = (colScore[ci] || 0) + 2;
                else if (isIncl)  colScore[ci] = (colScore[ci] || 0) + 1;
            });
        });

        console.log('[CP] 공정열 후보:', colScore);

        if (Object.keys(colScore).length === 0) {
            UIUtils.toast('공정명(수입검사·보관·도장…)을 찾을 수 없습니다. 파일을 확인하세요.', 'warning');
            return null;
        }

        // 점수 기준 정렬 → 동점이면 왼쪽(작은 열 번호) 우선
        const scoreSorted = Object.entries(colScore)
            .sort((a, b) => b[1] - a[1] || parseInt(a[0]) - parseInt(b[0]));

        // processCol 후보: 점수 최고 열
        let processCol = parseInt(scoreSorted[0][0]);

        // ── processCol 검증 ──────────────────────────────────────
        // 해당 열의 실제 값들이 _PROCESS_MAP 에서 정규화되는지 확인
        // 점수 1짜리 단일 열이고, 정규화 실패 시 다음 후보로 교체
        const _validateProcCol = (ci) => rows.some(r => {
            const v = _t(r[ci]).replace(/\s+/g,'').toLowerCase();
            return v && _PROCESS_MAP.some(e => e.keys.some(k => v.includes(k.replace(/\s+/g,'').toLowerCase())));
        });

        if (!_validateProcCol(processCol)) {
            // 다른 후보 열에서 검증 통과하는 첫 번째 열로 교체
            const alt = scoreSorted.slice(1).find(([ci]) => _validateProcCol(parseInt(ci)));
            if (alt) processCol = parseInt(alt[0]);
        }
        console.log('[CP] 공정열 후보:', colScore);
        console.log('[CP] 공정열 확정:', processCol);

        // ── 3. 나머지 열 위치 추론 ───────────────────────────────
        // 전략: 공정열을 기준으로 헤더 행에서 키워드 탐색
        //       헤더가 없으면 스크린샷 기준 상대 오프셋으로 추정
        const col = {
            process:  processCol,
            procNo:   -1,   // 공정번호
            flowDiag: -1,   // 공정 흐름도
            subProc:  -1,   // 세부공정 (로딩/세척/도료 등) — PROCESS_CONFIG station 키 매핑용
            station:  -1,   // 설비명 (컨베어/롤러세척기 등) — 표시용
            no:       -1,   // NO (항목 번호)
            itemProd: -1,   // 관리항목-제품
            itemProc: -1,   // 관리항목-공정
            special:  -1,   // 특별특성 (◎△☆)
            fp:       -1,   // F/P (FMEA 등급)
            spec:     -1,   // 규격
            method:   -1,   // 확인방법
            cycle:    -1,   // 주기
            control:  -1,   // 관리방안
            action:   -1,   // 조치사항
        };

        // 전체 행을 스캔해 키워드로 열 탐색 (헤더 30행 이내)
        // ※ n.length 제한 없음 — 한국어 헤더는 15자 초과 빈번 (관리기준(규격), 관리항목(제품특성) 등)
        for (let i = 0; i < Math.min(30, rows.length); i++) {
            rows[i].forEach((cell, ci) => {
                const n = _norm(cell);
                if (!n) return;
                // 공정번호: 공정열 왼쪽에 위치. '공정번호' 완전일치만 — '번호'/'no' 단독은 항목번호와 혼동
                if (col.procNo   < 0 && (n==='공정번호'||n==='공정no'||n==='프로세스번호') && ci <= processCol) col.procNo = ci;
                // 공정 흐름도
                if (col.flowDiag < 0 && n.includes('흐름도'))                                        col.flowDiag = ci;
                // 주공정 헤더 → processCol 보정 (엑셀에 '주공정' 헤더가 있으면 그 열이 processCol)
                if (n==='주공정' && ci !== processCol && _validateProcCol(ci)) processCol = ci;
                // 세부공정 — 공정명(주공정) 오른쪽, station 매핑에 사용
                if (col.subProc  < 0 && ci > processCol && ci <= processCol + 4 &&
                    (n==='세부공정'||n.includes('세부공정')||n==='공정(세부)'||
                     n==='작업명'||n==='작업공정'||n.includes('세부작업')||
                     n==='세부'||n.includes('subprocess')||n.includes('sub공정')))                   col.subProc = ci;
                // 설비명 — 세부공정 오른쪽, 실제 설비명(표시용)
                if (col.station  < 0 && ci > processCol &&
                    (n==='설비명'||n==='설비'||n==='공정설비명'||n.includes('설비명')))                col.station = ci;
                // 항목 번호 (공정열 오른쪽)
                if (col.no       < 0 && (n==='no'||n==='항목번호'||n==='번호') && ci > processCol+1) col.no      = ci;
                // 특별특성 (◎△☆ 등 기호) — f/p는 별도
                if (col.special  < 0 && (n.includes('특별특성')||n==='특별'||n.includes('특성기호'))) col.special = ci;
                // F/P (FMEA 등급 문자 — 특별특성과 별도 열)
                if (col.fp       < 0 && (n==='f/p'||n==='fp'||n==='fmea'||n.includes('f/p'))) col.fp = ci;
                // 관리항목-제품 — processCol+3 이상에서만 (subProc/station/No 영역 제외)
                if (col.itemProd < 0 && ci >= processCol+3 &&
                    (n==='제품'||n.includes('제품특성')||n.includes('제품관리')||
                     (n.includes('관리항목')&&n.includes('제품'))))                                   col.itemProd = ci;
                // 관리항목-공정 — processCol+3 이상, '공정' 단독은 세부공정 열과 혼동 방지용 하한선
                if (col.itemProc < 0 && ci >= processCol+3 && ci !== processCol &&
                    (n==='공정'||n.includes('공정특성')||n.includes('공정관리')||
                     (n.includes('관리항목')&&n.includes('공정'))))                                   col.itemProc = ci;
                // 규격 — '규격', '규격및기준', '관리기준(규격)', '기준값' 등
                // ※ '관리기준' 단독은 그룹 헤더 셀이므로 제외
                if (col.spec     < 0 && ci > processCol+1 &&
                    (n==='규격'||n.includes('규격및')||n.includes('규격/')||n.includes('기준값')||
                     (n.includes('관리기준')&&n.includes('규격'))))                                  col.spec = ci;
                // 확인방법 — '검사/확인방법', '측정방법' 등
                if (col.method   < 0 &&
                    (n.includes('확인방법')||n.includes('검사방법')||n.includes('측정방법')))         col.method  = ci;
                // 주기
                if (col.cycle    < 0 && (n.includes('주기')||n==='검사주기'||n==='관리주기'))        col.cycle   = ci;
                // 관리방안 / 관리기준
                if (col.control  < 0 && ci > processCol &&
                    (n.includes('관리방안')||n.includes('관리방법')||n==='관리'||n.includes('처리방법'))) col.control = ci;
                // 조치사항
                if (col.action   < 0 && n.includes('조치'))                                          col.action  = ci;
            });
        }
        // 주공정 헤더로 processCol이 갱신됐을 수 있으므로 col.process 동기화
        col.process = processCol;

        // ── col.procNo 검증: 실제 공정번호 값(PROCESS_CONFIG stationNos) 포함 여부 ──
        const _knownProcNos = new Set();
        Object.values(PROCESS_CONFIG).forEach(cfg => {
            if (cfg.stationNos) Object.values(cfg.stationNos).forEach(v => _knownProcNos.add(v));
            if (cfg.procNo) _knownProcNos.add(cfg.procNo);
        });
        const _hasProcNoVals = (ci) => rows.some(r => {
            const n = parseInt(_t(r[ci]));
            return !isNaN(n) && _knownProcNos.has(n);
        });
        if (col.procNo < 0 || !_hasProcNoVals(col.procNo)) {
            col.procNo = -1;
            // 공정명 열 왼쪽에서 공정번호 값이 있는 열 탐색
            for (let ci = 0; ci < processCol; ci++) {
                if (_hasProcNoVals(ci)) { col.procNo = ci; break; }
            }
        }

        // spec이 method/cycle 같은 열로 오탐됐을 때 보정
        if (col.spec > 0 && col.spec === col.method)  col.spec = -1;
        if (col.spec > 0 && col.spec === col.cycle)   col.spec = -1;
        if (col.spec > 0 && col.spec === col.control) col.spec = -1;

        console.log('[CP] 열 위치 탐색 결과:', JSON.stringify(col));

        // 열 못 찾은 경우 → 스크린샷 기준 상대 오프셋 추정
        // (공정열이 E=4라면: station=5, no=6, itemProd=7, itemProc=8, spec=12, method=16, cycle=17)
        // 폴백 오프셋 — CP 표준 열 순서:
        // 공정번호 | ○ | 공정명 | 세부공정 | 설비명 | No | 제품 | 공정 | 특별 | F/P | 규격 | 확인방법 | 주기 | 관리방안 | ...
        const pc = processCol;
        if (col.procNo   < 0) col.procNo   = pc > 0 ? pc - 1 : 0; // 공정번호는 공정명 왼쪽
        if (col.subProc  < 0) col.subProc  = pc + 1;   // 세부공정
        if (col.station  < 0) col.station  = pc + 2;   // 설비명
        if (col.no       < 0) col.no       = pc + 3;
        if (col.itemProd < 0) col.itemProd = pc + 4;
        if (col.itemProc < 0) col.itemProc = pc + 5;
        if (col.special  < 0) col.special  = pc + 6;
        if (col.fp       < 0) col.fp       = pc + 7;
        if (col.spec     < 0) col.spec     = pc + 8;
        if (col.method   < 0) col.method   = pc + 9;
        if (col.cycle    < 0) col.cycle    = pc + 10;
        if (col.control  < 0) col.control  = pc + 11;
        if (col.action   < 0 || col.action === col.spec) col.action = pc + 15;

        console.log('[CP] 최종 열 위치:', JSON.stringify(col));

        // ── 4. 데이터 파싱 ───────────────────────────────────────
        // 공정 키워드가 첫 등장하는 행부터 파싱 시작
        let dataStart = 0;
        for (let i = 0; i < rows.length; i++) {
            const v = _t(rows[i][processCol]);
            const vn2 = v.replace(/\s+/g,'');
            if (vn2.length <= 10 && PROC_KW.some(k => vn2.includes(k.replace(/\s+/g,'')))) { dataStart = i; break; }
        }
        console.log('[CP] 데이터 시작행:', dataStart);

        const items = [];
        let lastProcess = '', lastSubProc = '', lastStation = '', lastProcNo = '';
        let lastMethod = '', lastCycle = '', lastControl = '', lastAction = '';
        let lastStationKey = '';

        for (let i = dataStart; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.join('').trim() === '') continue;

            // ── No 열 확인 — "1"이면 새 세부공정 그룹의 시작 ──────
            const noVal      = col.no >= 0 ? _t(row[col.no]) : '';
            const isGroupStart = /^0*1\.?$/.test(noVal.trim()); // "1", "01", "1." 등

            // fill-down (공정명 / 세부공정 / 설비명 / 공정번호)
            // No=1 행은 병합 셀의 첫 행 → rSubProc / rStation 값이 있을 가능성 높음
            const rProcess  = _t(row[col.process]);
            const rSubProc  = col.subProc >= 0 ? _t(row[col.subProc]) : '';
            const rStation  = col.station >= 0 ? _t(row[col.station]) : '';
            const rProcNo   = col.procNo  >= 0 ? _t(row[col.procNo])  : '';

            // No=1인데 세부공정 셀이 비어있으면 → 같은 행 processCol 우측을 스캔해
            // _STATION_MAP 에 매칭되는 후보를 찾아 강제 갱신
            if (isGroupStart && !rSubProc) {
                for (let k = processCol + 1; k <= processCol + 4 && k < row.length; k++) {
                    const cand = _t(row[k]);
                    if (!cand) continue;
                    const cn = cand.replace(/\s+/g,'').toLowerCase();
                    const hit = _STATION_MAP.find(e =>
                        e.keys.some(key => cn.includes(key.replace(/\s+/g,'').toLowerCase()))
                    );
                    if (hit) { lastSubProc = cand; break; }
                }
            }

            // 공정번호가 바뀌면 세부공정/설비명 캐시 리셋 (새 공정 시작)
            if (rProcNo && rProcNo !== lastProcNo) {
                lastSubProc = '';
                lastStation = '';
            }

            const process   = rProcess  || lastProcess;
            const subProc   = rSubProc  || lastSubProc;
            const station   = rStation  || lastStation;  // 설비명 (표시용)
            const procNo    = rProcNo   || lastProcNo;
            if (rProcess)  lastProcess  = rProcess;
            if (rSubProc)  lastSubProc  = rSubProc;
            if (rStation)  lastStation  = rStation;
            if (rProcNo)   lastProcNo   = rProcNo;

            // ── 그룹 경계 판단 ─────────────────────────────────────
            // ① stationKey 변화 (세부공정/설비명이 바뀜)
            // ② No=1 (번호가 리셋 → 새 세부공정 그룹)
            // 두 조건 중 하나라도 해당하면 관리기준 fill-down 초기화
            const stationKey = process + '||' + (subProc || station);
            if (stationKey !== lastStationKey || isGroupStart) {
                lastMethod = ''; lastCycle = ''; lastControl = ''; lastAction = '';
                lastStationKey = stationKey;
            }

            // 관리항목 수집 (제품/공정 열 분리)
            const rawItemProd = col.itemProd >= 0 ? _t(row[col.itemProd]) : '';
            const rawItemProc = col.itemProc >= 0 ? _t(row[col.itemProc]) : '';
            let itemName = rawItemProd || rawItemProc;
            if (!itemName) continue;
            // 숫자만인 항목(NO 열 등) 제외
            if (/^\d+$/.test(itemName)) continue;

            // ── 헤더 키워드 행 제외 ────────────────────────────────
            // 열 헤더 텍스트가 데이터 행으로 잘못 파싱되는 경우 제거
            const _HEADER_KW = ['확인방법','검사방법','측정방법','주기','검사주기','관리주기',
                '관리방안','관리방법','처리방법','규격','기준값','특별특성','특별','조치사항',
                '담당','f/p','fp','fmea','설비명','설비','no','번호','항목번호',
                '관리기준','관리항목','제품특성','공정특성'];
            const _itemNorm = itemName.replace(/[\s\(\)\[\]\/]/g,'').toLowerCase();
            if (_HEADER_KW.some(k => _itemNorm === k)) continue;

            // ── 제품/공정 중복값 정리 ──────────────────────────────
            let itemProd = /^\d+$/.test(rawItemProd) ? '' : rawItemProd;
            let itemProc = /^\d+$/.test(rawItemProc) ? '' : rawItemProc;
            // 양쪽에 동일한 값이면 공정 특성 우선 유지 (도장 공정은 대부분 공정 특성)
            if (itemProd && itemProc &&
                itemProd.replace(/\s+/g,'') === itemProc.replace(/\s+/g,'')) {
                itemProd = '';
            }

            // 규격 수집 (해당 열 + 좌우 2칸 스캔)
            let spec = _t(row[col.spec]);
            if (!spec) {
                for (let k = col.spec - 2; k <= col.spec + 3; k++) {
                    if (k >= 0 && k < row.length && k !== col.itemProd && k !== col.itemProc) {
                        const v = _t(row[k]);
                        if (v && !/^\d$/.test(v) && v !== itemName) { spec = v; break; }
                    }
                }
            }

            const special = col.special >= 0 ? _t(row[col.special]) : '';
            const fp      = col.fp      >= 0 ? _t(row[col.fp])      : '';

            // fill-down: 관리기준(확인방법/주기/관리방안/조치사항) — 병합 셀 대응
            const rMethod  = col.method  >= 0 ? _t(row[col.method])  : '';
            const rCycle   = col.cycle   >= 0 ? _t(row[col.cycle])   : '';
            const rControl = col.control >= 0 ? _t(row[col.control]) : '';
            const rAction  = col.action  >= 0 ? _t(row[col.action])  : '';
            const method  = rMethod  || lastMethod;
            const cycle   = rCycle   || lastCycle;
            const control = rControl || lastControl;
            const action  = rAction  || lastAction;
            if (rMethod)  lastMethod  = rMethod;
            if (rCycle)   lastCycle   = rCycle;
            if (rControl) lastControl = rControl;
            if (rAction)  lastAction  = rAction;

            // ── 공정+스테이션 결정 ────────────────────────────────
            // 우선순위:
            //   sysProcess: ① 주공정 텍스트 → ② procNo 역조회
            //   sysStation: ① 세부공정 텍스트 매핑 → ② procNo 역조회
            //               ③ 원본 텍스트 그대로(커스텀 스테이션)
            // ※ 세부공정 텍스트가 설비명/약어로 들어오는 CP가 많아 공정번호를
            //    원문 커스텀 저장보다 먼저 사용한다.

            const sysProcessByText = _normalizeProcess(process, _cpParsedLine || _cpUploadLine || '');
            const rawStationText   = subProc || station || '';
            const sysStationByText = _normalizeStation(rawStationText, sysProcessByText || '');

            // ★ CP 파싱 시에는 라인 필터 없이 전체 공정 대상으로 역조회
            //   (_curLine='A라인' 전달 시 _getCarConfig('A라인')이 도장(B)를 제외해
            //    도장(B) procNo가 도장(A)로 잘못 매핑되는 문제 방지)
            const fromProcNo = _lookupByProcNo(procNo, sysProcessByText, '', rawStationText);

            const sysProcess = sysProcessByText
                || (fromProcNo && fromProcNo.sysProcess)
                || null;
            if (!sysProcess) continue;

            // sysStation: 텍스트 매핑 → 원본 텍스트 → procNo 역조회 순
            const sysStation = sysStationByText
                || (fromProcNo && fromProcNo.sysStation)
                || rawStationText                             // 끝까지 미매칭이면 원본 텍스트 사용
                || null;
            if (!sysStation) {
                console.warn(`[CP row${i}] station 미결정 → 건너뜀. procNo=${procNo}, process=${process}, subProc=${subProc}`);
                continue;
            }

            console.log(`[CP row${i}] procNo=${procNo} | process=${process}→${sysProcess} | subProc=${subProc}→${sysStation} | item=${itemName}`);

            items.push({
                sysProcess, sysStation,
                procNo,
                rawProcNo:   procNo,          // 원본 문자열(60_1 등 보존)
                rawProcess:  process,         // 엑셀 원본 주공정 텍스트 (매핑 학습용)
                rawStation:  rawStationText,  // 엑셀 원본 세부공정 텍스트 (매핑 학습용)
                itemNo:      noVal,           // 엑셀 원본 No
                equipName:   station,
                itemName, itemProd, itemProc, spec, special, fp, method, cycle, control, action
            });
        }

        console.log('[CP] 파싱 완료 →', items.length, '개 항목');
        items.slice(0,10).forEach((it,i) => console.log(` [${i}]`, it.sysProcess, '/', it.sysStation, `(공정번호:${it.procNo})`, '|', it.itemName, '|', it.spec));

        // ── 5. 그룹핑 ─────────────────────────────────────────────
        const groupMap = {};
        items.forEach(item => {
            // rawProcNo 포함 → "60", "60_1", "60_2" 등 서로 다른 그룹으로 분리
            const key = item.sysProcess + '||' + item.sysStation + '||' + item.rawProcNo;
            if (!groupMap[key]) groupMap[key] = {
                process:    item.sysProcess,
                station:    item.sysStation,
                procNo:     item.procNo,
                rawProcNo:  item.rawProcNo,
                rawProcess: item.rawProcess || '',  // 매핑 학습용 원본 텍스트
                rawStation: item.rawStation || '',  // 매핑 학습용 원본 텍스트
                equipName:  item.equipName || '',
                params: []
            };
            groupMap[key].params.push({
                customKey: 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
                itemNo:   item.itemNo || '',          // 엑셀 원본 No (임의 생성 X)
                label:    item.itemName,
                itemProd: item.itemProd || '',        // 관리항목-제품
                itemProc: item.itemProc || '',        // 관리항목-공정
                unit:     _extractUnit(item.spec),
                value:    item.spec,
                range:    '',
                special:  item.special || '',         // 특별특성 (◎△☆)
                fp:       item.fp      || '',         // F/P
                method:   item.method  || '',
                cycle:    item.cycle   || '',
                control:  item.control || '',
                action:   item.action  || '',
                resp:     { prod: false, mat: false, qc: false },
            });
        });

        const groups = Object.values(groupMap);
        if (groups.length === 0) {
            UIUtils.toast('파싱된 항목이 없습니다. F12 콘솔 내용을 캡처해 공유해 주세요.', 'warning');
            return null;
        }

        // ── 파싱 검증 로그 ────────────────────────────────────────
        const _tmpCfg = _getCarConfig(_curLine || '');
        console.group('[CP] 파싱 검증 — 감지된 그룹');
        groups.forEach(g => {
            const inConfig = _tmpCfg[g.process] && _tmpCfg[g.process].stations[g.station];
            const status = inConfig ? '✅ 일치' : '⚠️ 미매칭(커스텀 저장)';
            console.log(`공정번호:${g.rawProcNo} | ${g.process} / ${g.station} | 설비:${g.equipName||'-'} | 항목:${g.params.length}개 | ${status}`);
        });
        console.groupEnd();

        return { meta, groups, totalParams: items.length };
    }

    // ── 프리뷰 모달 ───────────────────────────────────────────────
    async function _showImportPreview(parsed) {
        const { meta, groups, totalParams } = parsed;

        // ── 저장된 사용자 매핑 자동 적용 ─────────────────────────
        const initCar  = _curCarModel || meta.model    || '';
        const initPart = _curPartName || meta.partName || '';
        let appliedCount = 0;
        if (initCar && initPart) {
            await _loadUserMap(initCar, initPart);
            appliedCount = _applyUserMap(groups, initCar, initPart);
        }

        _cpParsedGroups   = groups;            // 모듈 변수에 저장 (onclick 인자 대신 사용)
        _cpParsedCarModel = initCar;           // 차종 보관 (DB 레코드 저장에 사용)
        _cpParsedLine     = _cpUploadLine || _curLine || 'A라인'; // 하위호환용
        // 선택된 흐름에 포함된 모든 라인 설정 로드
        await Promise.all(
            (_cpSelectedFlow || []).filter(p => p.startsWith('도장')).map(p => {
                const sl = (PROCESS_CONFIG[p] || {}).storeLine || 'A라인';
                return _ensureCarConfig(sl);
            })
        );
        // 품번 메타에 저장 (확정 시 이력에 포함)
        if (_cpCurrentMeta && meta.partNo) _cpCurrentMeta.partNo = meta.partNo;

        // (line toggle 제거 — 공정 흐름 선택으로 대체)

        const metaHtml = `
            <div style="background:var(--bg-secondary); border-radius:10px; padding:14px 18px; margin-bottom:18px;
                        display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">모델</div>
                    <div style="font-weight:700; font-size:15px;">${meta.model || '(미확인)'}</div>
                </div>
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">부품명</div>
                    <div style="font-weight:700; font-size:15px;">${meta.partName || '(미확인)'}</div>
                </div>
                <div>
                    <div style="font-size:11px; color:var(--text-muted);">품번</div>
                    <div style="font-size:13px;">${meta.partNo || '-'}</div>
                </div>
                <!-- 공정 흐름 선택 (검증 기준 변경 가능) -->
                <div style="border-left:1px solid var(--border-color); padding-left:20px; flex:1; min-width:220px;">
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:5px; font-weight:600;">
                        <span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">route</span>
                        공정 흐름 (클릭으로 추가/제거)
                    </div>
                    <div id="cpPreviewFlowContainer">${_cpPreviewFlowHtml()}</div>
                </div>
                <div style="margin-left:auto; text-align:right;">
                    <div style="font-size:11px; color:var(--text-muted);">파싱된 항목</div>
                    <div style="font-weight:700; font-size:18px; color:var(--accent-blue);">${totalParams}개</div>
                </div>
            </div>`;

        // ── 파싱 검증 요약 테이블 (편집 가능) ───────────────────
        const validationRows = groups.map((g, i) => {
            const statusBadge  = _cpGroupStatusBadge(g, initCar);
            const stSelectHtml = _cpStationSelectHtml(i, g.process, g.station, initCar);
            return `<tr style="border-top:1px solid var(--border-color);" id="cpGrpRow_${i}">
                <td style="padding:3px 6px;">
                    <input type="text" value="${_esc(g.rawProcNo||'')}"
                        style="width:52px; padding:2px 5px; border:1px solid var(--border-color);
                               border-radius:4px; font-size:12px; text-align:center; background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'rawProcNo',this.value)">
                </td>
                <td style="padding:3px 6px;">
                    <select style="padding:2px 5px; border:1px solid var(--border-color);
                                   border-radius:4px; font-size:12px; background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'process',this.value)">
                        ${Object.keys(_getCarConfig('')).map(p =>
                            `<option value="${p}" ${p===g.process?'selected':''}>${p}</option>`
                        ).join('')}
                    </select>
                </td>
                <td style="padding:3px 6px;" id="cpGrpStation_${i}">
                    ${stSelectHtml}
                </td>
                <td style="padding:3px 6px;">
                    <input type="text" value="${_esc(g.equipName||'')}"
                        style="width:96px; padding:2px 5px; border:1px solid var(--border-color);
                               border-radius:4px; font-size:12px; background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'equipName',this.value)">
                </td>
                <td style="padding:3px 8px; text-align:center; color:var(--text-muted);">${g.params.length}</td>
                <td style="padding:3px 8px;" id="cpGrpStatus_${i}">${statusBadge}</td>
            </tr>`;
        }).join('');

        const mappingBadgeHtml = appliedCount > 0
            ? `<span id="cpMappingBadge" style="background:var(--accent-blue)22;color:var(--accent-blue);
                            border-radius:10px;padding:1px 8px;font-size:11px;white-space:nowrap;">
                🔖 저장 매핑 ${appliedCount}건 적용</span>`
            : `<span id="cpMappingBadge" style="color:var(--text-muted);font-size:11px;">저장된 매핑 없음</span>`;

        const diagSummary = _cpDiagnosticSummaryHtml(groups);

        const validationHtml = `
        <div style="margin-bottom:14px; border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">
            <div style="display:flex; align-items:center; gap:8px; padding:8px 14px;
                        background:var(--bg-secondary); border-bottom:1px solid var(--border-color); flex-wrap:wrap;">
                <span style="font-weight:700; font-size:13px; color:var(--accent-blue);">
                    📋 공정 매핑 확인 · 수정
                </span>
                <span style="font-size:11px; color:var(--text-muted);">
                    — 그룹 ${groups.length}개 · 잘못된 항목을 수정 후 재파싱하세요
                </span>
                ${mappingBadgeHtml}
                <button onclick="ProdStandardsModule._refreshGroupsPreview()"
                    style="margin-left:auto; padding:4px 12px; border-radius:6px; font-size:12px;
                           font-weight:600; cursor:pointer; border:1.5px solid var(--accent-green);
                           background:var(--accent-green)22; color:var(--accent-green);
                           display:inline-flex; align-items:center; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">sync</span>
                    매핑 확인 완료 · 재파싱
                </button>
            </div>
            <div style="padding:10px 14px 0;">
                <div id="cpDiagSummary">${diagSummary}</div>
            </div>
            <div style="overflow-x:auto; padding:0 0 6px;">
                <table style="width:100%; font-size:12px; border-collapse:collapse;">
                    <colgroup>
                        <col style="width:60px;">
                        <col style="width:130px;">
                        <col style="width:150px;">
                        <col style="width:100px;">
                        <col style="width:52px;">
                        <col style="min-width:260px;">
                    </colgroup>
                    <thead style="background:var(--bg-secondary);">
                        <tr>
                            <th style="padding:5px 8px; text-align:center; white-space:nowrap; font-size:11px;">공정번호</th>
                            <th style="padding:5px 8px; text-align:left;   white-space:nowrap; font-size:11px;">주공정</th>
                            <th style="padding:5px 8px; text-align:left;   white-space:nowrap; font-size:11px;">세부공정</th>
                            <th style="padding:5px 8px; text-align:left;   white-space:nowrap; font-size:11px;">설비명</th>
                            <th style="padding:5px 8px; text-align:center; white-space:nowrap; font-size:11px;">항목수</th>
                            <th style="padding:5px 8px; text-align:left;   font-size:11px;">상태 · 진단</th>
                        </tr>
                    </thead>
                    <tbody id="cpValidationTbody">${validationRows}</tbody>
                </table>
            </div>
        </div>`;

        const groupsHtml = _buildGroupsPreviewHtml(groups);

        // 차종/품명 입력 (메타에서 못 읽었거나 수정 필요한 경우)
        const carModelVal = _curCarModel || meta.model || '';
        const partNameVal = _curPartName || meta.partName || '';
        const products = Storage.getAll(DB.STORES.PRODUCTS);
        const cars  = [...new Set(products.map(p => p.carModel).filter(Boolean))];
        const parts = products.filter(p => !carModelVal || p.carModel === carModelVal).map(p => p.partName).filter(Boolean);

        const formHtml = `
            <div style="background:var(--accent-blue)11; border:1px solid var(--accent-blue)44;
                        border-radius:10px; padding:14px 18px; margin-bottom:18px;">
                <div style="font-weight:700; margin-bottom:10px; color:var(--accent-blue);">
                    <span class="material-symbols-outlined" style="font-size:15px; vertical-align:middle;">info</span>
                    저장할 차종 · 품명을 확인하세요
                </div>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <div class="form-group" style="margin:0; flex:1; min-width:140px;">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="cpImportCar" onchange="ProdStandardsModule._cpImportPartChange()">
                            <option value="">-- 차종 선택 --</option>
                            ${cars.map(c => `<option value="${c}" ${c===carModelVal?'selected':''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0; flex:1; min-width:140px;">
                        <label class="form-label">품명</label>
                        <select class="form-select" id="cpImportPart"
                            onchange="ProdStandardsModule._cpImportPartSelected()">
                            <option value="">-- 품명 선택 --</option>
                            ${parts.map(p => `<option value="${p}" ${p===partNameVal?'selected':''}>${p}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="margin-top:10px; font-size:12px; color:var(--text-muted);">
                    ※ 기존에 입력된 파라미터는 덮어쓰지 않고 <strong>새 항목만 추가</strong>됩니다.
                </div>
            </div>`;

        const body = `
            <div style="max-height:72vh; overflow-y:auto; padding-right:6px;">
                ${formHtml}
                ${metaHtml}
                ${validationHtml}
                <div id="cpGroupsPreview">${groupsHtml}</div>
            </div>`;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdStandardsModule._confirmImport()">
                <span class="material-symbols-outlined" style="font-size:15px;">download_done</span>
                파라미터 가져오기
            </button>`;

        UIUtils.showModal('관리계획서 파싱 결과 확인', body, footer, 'xl');
    }

    /** CP 형식 평면 미리보기 테이블 HTML 생성 (분리된 헬퍼) */
    function _buildGroupsPreviewHtml(groups, carModel) {
        const carCfg = _getCarConfig('');
        const previewRows = [];
        groups.forEach(g => {
            const cfg    = carCfg[g.process];
            const color  = cfg ? cfg.color : 'var(--accent-blue)';
            const icon   = cfg ? cfg.icon  : 'settings';
            const stNo   = g.procNo || (cfg && cfg.stationNos && cfg.stationNos[g.station] != null
                ? cfg.stationNos[g.station] : (cfg ? cfg.procNo : ''));

            // 매핑 일치 여부 — 공백 무시 정규화 후 비교
            const _normK = s => (s||'').replace(/\s+/g,'').toLowerCase();
            const matched = cfg && (cfg.stations[g.station] ||
                Object.keys(cfg.stations).some(k => _normK(k) === _normK(g.station)));
            const rowBg   = matched ? '' : 'background:var(--accent-orange)08;';

            g.params.forEach((p, i) => {
                const isFirst  = i === 0;
                const topStyle = isFirst
                    ? `border-top:2px solid ${color};`
                    : `border-top:1px solid ${color}22;`;

                let row = `<tr style="${topStyle}${isFirst ? rowBg : ''}">`;

                const dispProcNo = g.rawProcNo || stNo;
                row += `<td style="text-align:center; vertical-align:middle; padding:4px 6px; width:42px;
                                   border-right:1px solid ${color}33;
                                   ${isFirst ? `background:${color}0d;` : ''}">
                    ${isFirst ? `<div style="font-weight:900; font-size:14px; color:${color}; line-height:1.1;">${dispProcNo !== '' && dispProcNo != null ? dispProcNo : '-'}</div>` : ''}
                </td>`;

                row += `<td style="text-align:center; vertical-align:middle; padding:${isFirst?'5px 8px':'3px'};
                                   border-right:2px solid ${color}44;
                                   ${isFirst ? `background:${color}11;` : ''}">
                    ${isFirst ? `
                        <span class="material-symbols-outlined"
                            style="font-size:13px; color:${color}; display:block; margin-bottom:2px;">${icon}</span>
                        <span style="font-weight:800; font-size:11px; color:${color}; white-space:nowrap;">${g.process}</span>
                    ` : ''}
                </td>`;

                row += `<td style="vertical-align:middle; padding:${isFirst?'4px 8px':'3px'};
                                   font-size:12px; white-space:nowrap;
                                   ${isFirst ? `background:${color}07; border-left:3px solid ${color}55;` : 'border-left:3px solid transparent;'}">
                    ${isFirst ? `<span style="color:${color}; font-weight:600;">${g.station || '-'}</span>
                        ${!matched && isFirst
                            ? `<span style="font-size:10px; color:var(--accent-orange); display:block;">⚠️ 미매핑</span>`
                            : ''}` : ''}
                </td>`;

                row += `<td style="vertical-align:middle; padding:${isFirst?'4px 8px':'3px'};
                                   font-size:11px; white-space:nowrap; color:var(--text-muted);
                                   ${isFirst && g.equipName ? `background:${color}04;` : ''}">
                    ${isFirst ? (g.equipName || '-') : ''}
                </td>`;

                row += `
                    <td style="padding:4px 6px; text-align:center; color:var(--text-muted); font-size:11px;">${p.itemNo || (i + 1)}</td>
                    <td style="padding:4px 8px; font-weight:600; color:var(--accent-blue);">${p.itemProd || ''}</td>
                    <td style="padding:4px 8px; color:var(--accent-orange);">${p.itemProc || ''}</td>
                    <td style="padding:4px 6px; text-align:center;">${p.special || '-'}</td>
                    <td style="padding:4px 6px; text-align:center; color:var(--text-muted);">${p.fp || '-'}</td>
                    <td style="padding:4px 8px;">${p.value || '-'}</td>
                    <td style="padding:4px 8px; color:var(--text-muted);">${p.method || '-'}</td>
                    <td style="padding:4px 8px; color:var(--text-muted);">${p.cycle || '-'}</td>
                    <td style="padding:4px 8px; color:var(--text-muted);">${p.control || '-'}</td>
                </tr>`;
                previewRows.push(row);
            });
        });

        // 매핑 요약 배지
        const total     = groups.length;
        const matched   = groups.filter(g => carCfg[g.process] && carCfg[g.process].stations[g.station]).length;
        const unmatched = total - matched;
        const summaryHtml = `
            <div style="display:flex; align-items:center; gap:10px; padding:7px 14px;
                        background:var(--bg-secondary); border-bottom:1px solid var(--border-color); flex-wrap:wrap;">
                <span style="font-size:12px; font-weight:700;">📊 파싱 결과</span>
                <span style="font-size:11px; background:var(--accent-green)22; color:var(--accent-green);
                             border-radius:10px; padding:1px 9px;">✅ 매핑됨 ${matched}건</span>
                ${unmatched > 0
                    ? `<span style="font-size:11px; background:var(--accent-orange)22; color:var(--accent-orange);
                                   border-radius:10px; padding:1px 9px;">⚠️ 미매핑 ${unmatched}건</span>`
                    : ''}
                <span style="font-size:11px; color:var(--text-muted); margin-left:4px;">
                    총 파라미터 ${groups.reduce((a,g)=>a+g.params.length,0)}개
                </span>
            </div>`;

        return `
        <div style="border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">
            ${summaryHtml}
            <div style="overflow-x:auto;">
                <table style="width:100%; font-size:12px; border-collapse:collapse; min-width:920px;">
                    <thead style="background:var(--bg-secondary);">
                        <tr>
                            <th rowspan="2" style="padding:6px 6px; text-align:center; vertical-align:middle; width:42px; border-bottom:2px solid var(--border-color); white-space:nowrap;">공정<br>번호</th>
                            <th rowspan="2" style="padding:6px 8px; text-align:center; vertical-align:middle; min-width:68px; border-bottom:2px solid var(--border-color);">주공정</th>
                            <th rowspan="2" style="padding:6px 8px; text-align:left; vertical-align:middle; min-width:68px; border-bottom:2px solid var(--border-color);">세부공정</th>
                            <th rowspan="2" style="padding:6px 8px; text-align:left; vertical-align:middle; min-width:60px; border-bottom:2px solid var(--border-color); color:var(--text-muted);">설비명</th>
                            <th rowspan="2" style="padding:6px 5px; text-align:center; vertical-align:middle; width:26px; border-bottom:2px solid var(--border-color);">No</th>
                            <th colspan="2" style="padding:5px 8px; text-align:center; font-weight:700; border-bottom:1px solid var(--border-color);">관리 항목</th>
                            <th rowspan="2" style="padding:6px 6px; text-align:center; vertical-align:middle; width:38px; border-bottom:2px solid var(--border-color);">특별<br>특성</th>
                            <th rowspan="2" style="padding:6px 6px; text-align:center; vertical-align:middle; width:38px; border-bottom:2px solid var(--border-color);">F/P</th>
                            <th colspan="4" style="padding:5px 8px; text-align:center; font-weight:700; border-bottom:1px solid var(--border-color);">관리 기준</th>
                        </tr>
                        <tr style="background:var(--bg-secondary);">
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; color:var(--accent-blue);   border-bottom:2px solid var(--border-color); min-width:88px;">제 품</th>
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; color:var(--accent-orange); border-bottom:2px solid var(--border-color); min-width:100px;">공 정</th>
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; border-bottom:2px solid var(--border-color); min-width:180px;">규격 / 기준값</th>
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; border-bottom:2px solid var(--border-color); min-width:80px;">확인방법</th>
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; border-bottom:2px solid var(--border-color); min-width:50px;">주기</th>
                            <th style="padding:4px 8px; font-size:11px; font-weight:600; border-bottom:2px solid var(--border-color); min-width:84px;">관리방안</th>
                        </tr>
                    </thead>
                    <tbody>${previewRows.join('')}</tbody>
                </table>
            </div>
        </div>`;
    }

    /** 공정 매핑 수정 후 미리보기 테이블 새로고침 */
    function _refreshGroupsPreview() {
        const wrap = document.getElementById('cpGroupsPreview');
        if (!wrap || !_cpParsedGroups) return;
        const car = _cpParsedCarModel;
        wrap.innerHTML = _buildGroupsPreviewHtml(_cpParsedGroups, car);
        UIUtils.toast('재파싱 완료 — 미리보기가 업데이트됐습니다', 'success');
        const carCfg  = _getCarConfig('');
        const total   = _cpParsedGroups.length;
        const matched = _cpParsedGroups.filter(g => carCfg[g.process] && carCfg[g.process].stations[g.station]).length;
        if (total > 0 && matched < total) {
            UIUtils.toast(`⚠️ 미매핑 ${total - matched}건 — 공정 매핑을 수정하거나 세부공정을 추가하세요`, 'warning');
        }
    }

    function _cpImportCarChange() {
        const car  = (document.getElementById('cpImportCar') || {}).value || '';
        const partSel = document.getElementById('cpImportPart');
        if (!partSel) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS);
        const parts = products.filter(p => !car || p.carModel === car).map(p => p.partName).filter(Boolean);
        partSel.innerHTML = `<option value="">-- 품명 선택 --</option>` +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // ── 사용자 정의 매핑 학습 (품명별 DB 저장) ────────────────────

    /** 품명별 매핑을 DB에서 로드 → 캐시에 보관 */
    async function _loadUserMap(carModel, partName) {
        const cacheKey = carModel + '||' + partName;
        if (_cpUserMapCache[cacheKey] !== undefined) return _cpUserMapCache[cacheKey];
        try {
            const val = await DB.getConfig(CP_USER_MAP_PREFIX + carModel + '__' + partName);
            _cpUserMapCache[cacheKey] = Array.isArray(val) ? val : [];
        } catch(e) {
            _cpUserMapCache[cacheKey] = [];
        }
        return _cpUserMapCache[cacheKey];
    }

    /** 캐시에서 매핑 동기 반환 */
    function _getUserMap(carModel, partName) {
        return _cpUserMapCache[carModel + '||' + partName] || [];
    }

    /** 현재 그룹 목록을 품명별 매핑으로 저장 (학습) */
    async function _saveUserMap(carModel, partName, groups) {
        const entries = groups.map(g => ({
            rawProcNo:  g.rawProcNo  || '',
            rawProcess: g.rawProcess || '',
            rawStation: g.rawStation || '',
            sysProcess: g.process,
            sysStation: g.station,
            equipName:  g.equipName  || ''
        }));
        const cacheKey = carModel + '||' + partName;
        _cpUserMapCache[cacheKey] = entries;
        await DB.setConfig(CP_USER_MAP_PREFIX + carModel + '__' + partName, entries);
    }

    /**
     * 저장된 매핑을 groups에 적용.
     * 매칭 키: rawProcNo + rawProcess + rawStation 조합
     * @returns {number} 적용된 건수
     */
    function _applyUserMap(groups, carModel, partName) {
        const mapping = _getUserMap(carModel, partName);
        if (!mapping || mapping.length === 0) return 0;
        let applied = 0;
        groups.forEach(g => {
            const entry = mapping.find(e =>
                e.rawProcNo  === (g.rawProcNo  || '') &&
                e.rawProcess === (g.rawProcess || '') &&
                e.rawStation === (g.rawStation || '')
            );
            if (entry) {
                const explicitPaint = _explicitPaintProcessFromText(g.rawProcess || '');
                g.process   = explicitPaint || entry.sysProcess;
                g.station   = entry.sysStation;
                g.equipName = entry.equipName;
                applied++;
            }
        });
        return applied;
    }

    /** 검증 테이블 tbody만 재렌더 (품명 변경 시 매핑 재적용 후 호출) */
    function _rerenderValidationTbody() {
        const tbody = document.getElementById('cpValidationTbody');
        if (!tbody || !_cpParsedGroups) return;
        const car = _cpParsedCarModel;
        tbody.innerHTML = _cpParsedGroups.map((g, i) => {
            const statusBadge  = _cpGroupStatusBadge(g, car);
            const stSelectHtml = _cpStationSelectHtml(i, g.process, g.station, car);
            return `<tr style="border-top:1px solid var(--border-color);" id="cpGrpRow_${i}">
                <td style="padding:3px 6px;">
                    <input type="text" value="${_esc(g.rawProcNo||'')}"
                        style="width:52px;padding:2px 5px;border:1px solid var(--border-color);
                               border-radius:4px;font-size:12px;text-align:center;background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'rawProcNo',this.value)">
                </td>
                <td style="padding:3px 6px;">
                    <select style="padding:2px 5px;border:1px solid var(--border-color);
                                   border-radius:4px;font-size:12px;background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'process',this.value)">
                        ${Object.keys(_getCarConfig('')).map(p =>
                            `<option value="${p}" ${p===g.process?'selected':''}>${p}</option>`
                        ).join('')}
                    </select>
                </td>
                <td style="padding:3px 6px;" id="cpGrpStation_${i}">${stSelectHtml}</td>
                <td style="padding:3px 6px;">
                    <input type="text" value="${_esc(g.equipName||'')}"
                        style="width:96px;padding:2px 5px;border:1px solid var(--border-color);
                               border-radius:4px;font-size:12px;background:var(--bg-primary);"
                        onchange="ProdStandardsModule._cpGroupEdit(${i},'equipName',this.value)">
                </td>
                <td style="padding:3px 8px;text-align:center;color:var(--text-muted);">${g.params.length}</td>
                <td style="padding:3px 8px;" id="cpGrpStatus_${i}">${statusBadge}</td>
            </tr>`;
        }).join('');
    }

    /** 품명 변경 시 매핑 재적용 + 파트 드롭다운 갱신 */
    async function _cpImportPartChange() {
        // 기존 차종 드롭다운 갱신 (기존 _cpImportCarChange 역할 유지)
        const car  = (document.getElementById('cpImportCar')  || {}).value || '';
        const partSel = document.getElementById('cpImportPart');
        if (!partSel) return;
        const products = Storage.getAll(DB.STORES.PRODUCTS);
        const parts = products.filter(p => !car || p.carModel === car).map(p => p.partName).filter(Boolean);
        partSel.innerHTML = `<option value="">-- 품명 선택 --</option>` +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    /** 품명 select 변경 → 저장된 매핑 재적용 */
    async function _cpImportPartSelected() {
        const car  = (document.getElementById('cpImportCar')  || {}).value || '';
        const part = (document.getElementById('cpImportPart') || {}).value || '';
        if (!car || !part || !_cpParsedGroups) return;
        await _loadUserMap(car, part);
        const cnt = _applyUserMap(_cpParsedGroups, car, part);
        _rerenderValidationTbody();
        // 배지 갱신
        const badge = document.getElementById('cpMappingBadge');
        if (badge) {
            badge.innerHTML = cnt > 0
                ? `<span style="background:var(--accent-blue)22;color:var(--accent-blue);
                                border-radius:10px;padding:1px 8px;font-size:11px;">🔖 저장 매핑 ${cnt}건 적용</span>`
                : `<span style="color:var(--text-muted);font-size:11px;">저장된 매핑 없음</span>`;
        }
    }

    /**
     * 파라미터 값 초기화 (이력·매핑은 유지, PROD_STANDARDS만 삭제)
     */
    async function resetCpParams(importId, carModel, partName) {
        UIUtils.confirm(
            `[${carModel}] ${partName}의 파라미터 값을 모두 초기화할까요?\n이력과 매핑 정보는 유지됩니다.`,
            async () => {
                const standards = Storage.getAll(DB.STORES.PROD_STANDARDS);
                let cnt = 0;
                for (const s of standards) {
                    if (s.carModel === carModel && s.partName === partName && s._docKind !== STANDARD_DOC_KIND) {
                        await Storage.remove(DB.STORES.PROD_STANDARDS, s.id);
                        cnt++;
                    }
                }
                UIUtils.toast(`[${partName}] 파라미터 ${cnt}건 초기화 완료.`, 'success');
                _renderStandardsDetail(document.getElementById('contentArea'));
            }
        );
    }

    // ── 검증 테이블 편집 헬퍼 ────────────────────────────────────

    /** 그룹의 상태 배지 HTML 반환 (미매칭 이유 포함) */
    function _cpGroupStatusBadge(g, carModel) {
        const carCfg   = _getCarConfig('');
        const cfg      = carCfg[g.process];
        const rawProc  = g.rawProcess || '';   // CP 파일의 원본 주공정 텍스트
        const rawSt    = g.rawStation || '';   // CP 파일의 원본 세부공정 텍스트
        // 선택된 공정 흐름 기준 MES 등록 공정 목록
        const flowProcs = (_cpSelectedFlow || []);
        const allProcs  = Object.keys(carCfg).filter(p => flowProcs.includes(p));
        // 흐름에 없는 공정: 별도 경고
        const notInFlow = cfg && !flowProcs.includes(g.process);

        // ── ⚠️ 흐름 밖 공정 ──────────────────────────────────────
        if (notInFlow) {
            return `<div style="color:var(--accent-orange,#ea580c); font-size:11px; line-height:1.6;">
                        ⚠️ <b>흐름 외 공정</b><br>
                        <div style="font-size:10px; color:var(--text-secondary,#555); line-height:1.5; margin-top:2px;">
                            <b>${g.process}</b>가 선택된 공정 흐름에 없습니다.<br>
                            <span style="color:#c0392b;">→ 위 "공정 흐름"에서 해당 공정을 추가하거나,<br>
                            &nbsp;&nbsp;&nbsp;공정 드롭다운에서 올바른 공정으로 변경하세요.</span>
                        </div>
                    </div>`;
        }

        // ── ❌ 주공정 미등록 ──────────────────────────────────────
        if (!cfg) {
            const hint = rawProc && rawProc !== g.process
                ? `CP 원본: <b style="color:#ef4444;">"${rawProc}"</b> → 자동매칭: <b>"${g.process}"</b>`
                : `CP 공정명: <b style="color:#ef4444;">"${g.process}"</b>`;
            const mesList = allProcs.length
                ? `선택 흐름 공정: ${allProcs.map(p => `<b>${p}</b>`).join(' · ')}`
                : 'MES에 등록된 공정 없음';
            return `<div style="color:var(--accent-red,#ef4444); font-size:11px; line-height:1.6;">
                        ❌ <b>주공정 불일치</b><br>
                        <div style="font-size:10px; color:var(--text-secondary,#555); line-height:1.5; margin-top:2px;">
                            ${hint}<br>
                            ${mesList}<br>
                            <span style="color:#c0392b;">→ 위 드롭다운에서 올바른 공정을 선택하거나,<br>
                            &nbsp;&nbsp;&nbsp;공정 흐름에 해당 공정을 추가하세요.</span>
                        </div>
                    </div>`;
        }

        // ── ⚠️ 세부공정 미등록 ─────────────────────────────────────
        // 공백 무시 정규화 후 재비교 (키 표기 차이 허용)
        const _normSt = s => (s || '').replace(/\s+/g, '').toLowerCase();
        const stationExact = cfg.stations[g.station];
        const stationFuzzy = !stationExact
            ? Object.keys(cfg.stations).find(k => _normSt(k) === _normSt(g.station))
            : null;
        // g.station을 실제 키로 보정 (공백 차이 해소)
        if (!stationExact && stationFuzzy) g.station = stationFuzzy;

        if (!stationExact && !stationFuzzy) {
            const defined = Object.keys(cfg.stations);
            const hint = rawSt && rawSt !== g.station
                ? `CP 원본: <b style="color:#e67e22;">"${rawSt}"</b> → 자동매칭: <b>"${g.station}"</b>`
                : `CP 세부공정명: <b style="color:#e67e22;">"${g.station}"</b>`;
            const mesList = defined.length
                ? `MES 등록 세부공정(${g.process}): ${defined.map(s => `<b>${s}</b>`).join(' · ')}`
                : `'${g.process}' 공정에 등록된 세부공정 없음`;
            return `<div style="color:var(--accent-orange,#e67e22); font-size:11px; line-height:1.6;">
                        ⚠️ <b>세부공정 불일치</b><br>
                        <div style="font-size:10px; color:var(--text-secondary,#555); line-height:1.5; margin-top:2px;">
                            ${hint}<br>
                            ${mesList}<br>
                            <span style="color:#c0392b;">→ 위 드롭다운에서 올바른 세부공정을 선택하거나,<br>
                            &nbsp;&nbsp;&nbsp;CP 파일의 세부공정명을 MES 등록명으로 수정하세요.</span>
                        </div>
                    </div>`;
        }

        // ── ⚠️ 자동변환 확인 필요 ────────────────────────────────
        // 원본 텍스트와 MES명이 다르면 업로드된 CP의 수정/확인이 필요한 상태로 표시
        // (줄바꿈·연속공백 정규화 후 비교 — 줄바꿈만 다른 경우는 완전일치로 처리)
        const _normRawLocal = s => (s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        const procChanged = rawProc && _normRawLocal(rawProc) !== g.process;
        const stChanged   = rawSt   && _normRawLocal(rawSt)   !== g.station;
        if (procChanged || stChanged) {
            const lines = [];
            if (procChanged) lines.push(`공정: "${_normRawLocal(rawProc)}" → <b>${g.process}</b>`);
            if (stChanged)   lines.push(`세부공정: "${_normRawLocal(rawSt)}" → <b>${g.station}</b>`);
            return `<div style="color:var(--accent-orange,#e67e22); font-size:11px; line-height:1.6;">
                        ⚠️ <b>자동변환 확인 필요</b><br>
                        <div style="font-size:10px; color:#92400e; line-height:1.5; margin-top:2px;">
                            ${lines.join('<br>')}<br>
                            <span style="color:#c0392b;">→ CP 파일의 표기를 MES 등록명과 맞춰 수정하세요.</span>
                        </div>
                    </div>`;
        }
        return `<span style="color:var(--accent-green,#22c55e); font-size:11px; white-space:nowrap;">✅ 완전 일치</span>`;
    }

    /**
     * @deprecated — 공정 흐름 선택으로 대체. 하위호환 유지용.
     * 직접 호출 시 _cpSelectedFlow에서 첫 도장 라인을 변경하고 재검증.
     */
    async function _cpChangeParsedLine(line) {
        await _ensureCarConfig(line);
        _cpParsedLine = line;
        _cpUploadLine = line;
        // 대응하는 도장 공정이 flow에 없으면 추가
        const targetProc = line === 'B라인' ? '도장(B)' : '도장(A)';
        if (!_cpSelectedFlow.includes(targetProc)) {
            _toggleCpFlowProc(targetProc);
        }
        _rerenderValidationTbody();
        const diagEl = document.getElementById('cpDiagSummary');
        if (diagEl && _cpParsedGroups) diagEl.innerHTML = _cpDiagnosticSummaryHtml(_cpParsedGroups);
        _refreshGroupsPreview();
    }

    /**
     * 공정매핑 진단 요약 패널 HTML 생성
     * - 미등록 주공정 / 세부공정 불일치 항목을 유형별로 집계
     * - CP 파일 수정 가이드 제시
     */
    /**
     * raw 문자열과 matched 문자열의 비가시 차이를 HTML로 설명
     * 예: 앞뒤 공백, 전각공백, 다중공백, 대소문자 등
     */
    function _diffHint(raw, matched) {
        if (!raw || raw === matched) return '';
        const reasons = [];

        // 앞뒤 공백
        const trimmed = raw.trim();
        const hasLeading  = raw.length > 0 && raw[0] !== trimmed[0];
        const hasTrailing = raw.length > 0 && raw[raw.length - 1] !== trimmed[trimmed.length - 1];
        if (hasLeading || hasTrailing) {
            const mark = hasLeading && hasTrailing ? '앞뒤' : hasLeading ? '앞' : '뒤';
            reasons.push(`${mark}에 공백 문자 포함`);
        }

        // 전각 공백 (U+3000)
        if (/　/.test(raw)) reasons.push('전각공백(　) 포함');

        // 다중 공백
        if (/  /.test(raw)) reasons.push('연속 공백 포함');

        // 탭 문자
        if (/\t/.test(raw)) reasons.push('탭(Tab) 문자 포함');

        // 줄바꿈 (이미 _normRaw로 제거됐으므로 여기엔 안 올 수 있으나 방어적으로 표시)
        if (/[\r\n]/.test(raw)) reasons.push('줄바꿈(개행) 포함');

        // 대소문자 차이만 남은 경우
        if (!reasons.length && raw.replace(/\s+/g,'').toLowerCase() === matched.replace(/\s+/g,'').toLowerCase()) {
            reasons.push('공백 위치 차이');
        }

        if (!reasons.length) reasons.push('표기 차이');

        // 원본을 시각화: 공백→·, 전각공백→□, 탭→→, 줄바꿈→↵
        const visual = raw
            .replace(/　/g,    '<span style="background:#fee2e2;color:#b91c1c;border-radius:2px;padding:0 1px;">□</span>')
            .replace(/\r?\n/g, '<span style="background:#fee2e2;color:#b91c1c;border-radius:2px;padding:0 1px;">↵</span>')
            .replace(/\t/g,    '<span style="background:#fee2e2;color:#b91c1c;border-radius:2px;padding:0 1px;">→</span>')
            .replace(/ /g,     '<span style="background:#fef3c7;color:#92400e;border-radius:2px;padding:0 1px;">·</span>');

        return `<div style="font-size:10px;margin-top:3px;line-height:1.6;">
            <span style="color:#7c3aed;font-weight:600;">원본:</span>
            <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;letter-spacing:.05em;">${visual}</code><br>
            <span style="color:#92400e;">⚠ ${reasons.join(', ')}</span>
        </div>`;
    }

    function _cpDiagnosticSummaryHtml(groups) {
        const carCfg  = _getCarConfig('');
        const _normSt = s => (s || '').replace(/\s+/g, '').toLowerCase();

        // 항목 분류
        const badProc  = [];  // 주공정 미등록
        const badSt    = [];  // 세부공정 불일치
        const autoConv = [];  // 자동변환 확인 필요
        const perfect  = [];  // 완전 일치

        // 줄바꿈·앞뒤공백 제거 후 비교용 정규화 (Excel 셀 내 Alt+Enter 등 무시)
        const _normRaw = s => (s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

        groups.forEach((g, i) => {
            const cfg     = carCfg[g.process];
            const rawProc = g.rawProcess || '';
            const rawSt   = g.rawStation || '';
            // 줄바꿈 제거 후 비교값
            const normProc = _normRaw(rawProc);
            const normSt   = _normRaw(rawSt);
            if (!cfg) {
                badProc.push({ i, rawProc: normProc, matched: g.process });
            } else if (!cfg.stations[g.station] &&
                       !Object.keys(cfg.stations).some(k => _normSt(k) === _normSt(g.station))) {
                const defined = Object.keys(cfg.stations);
                badSt.push({ i, rawSt: normSt, matched: g.station, proc: g.process, defined });
            } else if ((normProc && normProc !== g.process) || (normSt && normSt !== g.station)) {
                const definedSts = cfg ? Object.keys(cfg.stations) : [];
                autoConv.push({ i, rawProc: normProc, rawSt: normSt, proc: g.process, st: g.station, defined: definedSts });
            } else {
                perfect.push(i);
            }
        });

        const total = groups.length;
        const issueCount = badProc.length + badSt.length + autoConv.length;

        // 이슈 없으면 심플 OK 박스
        if (issueCount === 0) {
            return `<div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px;
                                padding:10px 16px; margin-bottom:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="font-size:18px;">✅</span>
                        <span style="font-weight:700; color:#166534; font-size:13px;">
                            전체 ${total}개 그룹 매핑 이상 없음
                        </span>
                    </div>`;
        }

        // 이슈 상세 섹션 빌드
        let detailHtml = '';

        if (badProc.length) {
            // 주공정 불일치: CP 원본명 기준으로 유니크하게 그룹화
            const byRaw = {};
            badProc.forEach(b => {
                const key = b.rawProc || b.matched;
                if (!byRaw[key]) byRaw[key] = [];
                byRaw[key].push(`#${b.i + 1}`);
            });
            const allProcs = Object.keys(carCfg);
            detailHtml += `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700; color:#b91c1c; font-size:12px; margin-bottom:4px;">
                    ❌ 주공정 불일치 (${badProc.length}건) — CP 파일 수정 필요
                </div>
                <table style="width:100%; font-size:11px; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#fee2e2;">
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fca5a5;">CP 파일의 공정명</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fca5a5;">MES 등록 공정명</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fca5a5;">해당 그룹</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fca5a5;">조치 방법</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(byRaw).map(([raw, rows]) => `
                        <tr style="background:#fff;">
                            <td style="padding:3px 8px; border:1px solid #fca5a5; color:#b91c1c; font-weight:700;">"${raw}"</td>
                            <td style="padding:3px 8px; border:1px solid #fca5a5; color:#166534;">${allProcs.map(p=>`<b>${p}</b>`).join(' · ') || '없음'}</td>
                            <td style="padding:3px 8px; border:1px solid #fca5a5; color:var(--text-muted);">${rows.join(', ')}</td>
                            <td style="padding:3px 8px; border:1px solid #fca5a5;">
                                CP의 <b>"${raw}"</b>을 MES 공정명 중 하나로 수정하거나,<br>
                                아래 드롭다운에서 올바른 공정을 선택하세요.
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        if (badSt.length) {
            // 세부공정 불일치: 공정별로 그룹화
            const byProc = {};
            badSt.forEach(b => {
                if (!byProc[b.proc]) byProc[b.proc] = [];
                byProc[b.proc].push(b);
            });
            detailHtml += `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700; color:#92400e; font-size:12px; margin-bottom:4px;">
                    ⚠️ 세부공정 불일치 (${badSt.length}건) — CP 파일 수정 필요
                </div>
                <table style="width:100%; font-size:11px; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#fef3c7;">
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d;">주공정</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d;">CP 파일의 세부공정명</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d;">MES 등록 세부공정</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d;">해당 그룹</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(byProc).map(([proc, items]) =>
                            items.map((b, bi) => `
                            <tr style="background:#fff;">
                                ${bi === 0 ? `<td style="padding:3px 8px; border:1px solid #fcd34d; vertical-align:top;" rowspan="${items.length}"><b>${proc}</b></td>` : ''}
                                <td style="padding:3px 8px; border:1px solid #fcd34d; color:#92400e; font-weight:700;">"${b.rawSt || b.matched}"</td>
                                <td style="padding:3px 8px; border:1px solid #fcd34d; color:#166534;">${b.defined.map(s=>`<b>${s}</b>`).join(' · ') || '없음'}</td>
                                <td style="padding:3px 8px; border:1px solid #fcd34d; color:var(--text-muted);">#${b.i + 1}</td>
                            </tr>`).join('')
                        ).join('')}
                    </tbody>
                </table>
                <div style="font-size:10px; color:#92400e; margin-top:4px; line-height:1.5;">
                    → CP 파일의 세부공정명을 MES 등록명으로 수정하거나, 드롭다운에서 올바른 세부공정을 선택하세요.
                </div>
            </div>`;
        }

        if (autoConv.length) {
            detailHtml += `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700; color:#92400e; font-size:12px; margin-bottom:4px;">
                    ⚠️ 자동변환 확인 필요 (${autoConv.length}건) — CP 파일 표기 수정 권장
                </div>
                <table style="width:100%; font-size:11px; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#fef3c7;">
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d; white-space:nowrap;">구분</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d; white-space:nowrap;">CP 파일 원본</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d; white-space:nowrap;">자동 매칭값</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d;">MES 설정 세부공정 목록</th>
                            <th style="padding:3px 8px; text-align:left; border:1px solid #fcd34d; white-space:nowrap;">그룹</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${autoConv.map(a => `
                        ${a.rawProc && a.rawProc !== a.proc ? `
                        <tr style="background:#fff;">
                            <td style="padding:3px 8px; border:1px solid #fcd34d; white-space:nowrap;">주공정</td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d; color:#92400e; font-weight:700; white-space:nowrap;">"${a.rawProc}"</td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d;">
                                <span style="color:#166534; font-weight:700;">${a.proc}</span>
                                ${_diffHint(a.rawProc, a.proc)}
                            </td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d; color:var(--text-muted); font-size:10px;">—</td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d; color:var(--text-muted); white-space:nowrap;">#${a.i + 1}</td>
                        </tr>` : ''}
                        ${a.rawSt && a.rawSt !== a.st ? `
                        <tr style="background:#fff;">
                            <td style="padding:3px 8px; border:1px solid #fcd34d; white-space:nowrap;">세부공정</td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d; color:#92400e; font-weight:700; white-space:nowrap;">"${a.rawSt}"</td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d;">
                                <span style="color:#166534; font-weight:700;">${a.st}</span>
                                ${_diffHint(a.rawSt, a.st)}
                            </td>
                            <td style="padding:4px 8px; border:1px solid #fcd34d; line-height:1.7;">
                                ${(a.defined || []).map(s =>
                                    s === a.st
                                    ? `<span style="background:#dcfce7;color:#166534;font-weight:700;
                                                   padding:0 4px;border-radius:3px;margin:1px;display:inline-block;">${s} ✓</span>`
                                    : `<span style="color:var(--text-muted);padding:0 3px;display:inline-block;">${s}</span>`
                                ).join(' · ')}
                            </td>
                            <td style="padding:3px 8px; border:1px solid #fcd34d; color:var(--text-muted); white-space:nowrap;">#${a.i + 1}</td>
                        </tr>` : ''}
                        `).join('')}
                    </tbody>
                </table>
                <div style="font-size:10px; color:#92400e; margin-top:4px; line-height:1.5;">
                    → <b style="color:#166534;">초록색 ✓</b> 이 자동 매칭된 MES 등록명입니다. CP 파일의 표기를 이 명칭과 동일하게 수정하면 불일치가 해소됩니다.
                </div>
            </div>`;
        }

        return `<div style="background:#fff7ed; border:1.5px solid #fb923c; border-radius:8px;
                            padding:12px 16px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                        <span style="font-size:18px;">⚠️</span>
                        <span style="font-weight:700; color:#9a3412; font-size:13px;">
                            매핑 불일치 ${issueCount}건 — 업로드된 CP 파일 수정 또는 드롭다운 수정이 필요합니다
                        </span>
                        <span style="font-size:11px; color:var(--text-muted); margin-left:auto;">
                            전체 ${total}건 중 확인 필요 ${issueCount}건
                            ${autoConv.length ? `· 자동변환 확인 ${autoConv.length}건` : ''}
                            · 정상 ${perfect.length}건
                        </span>
                    </div>
                    ${detailHtml}
                    <div style="font-size:11px; color:#7c3aed; background:#f5f3ff; border-radius:6px;
                                padding:6px 10px; line-height:1.6;">
                        💡 <b>해결 방법 선택</b><br>
                        ① <b>즉시 적용</b>: 아래 표의 드롭다운에서 공정 · 세부공정을 직접 수정 → <b style="color:var(--accent-green);">매핑 확인 완료 · 재파싱</b> 클릭<br>
                        ② <b>근본 수정</b>: CP 엑셀 파일에서 공정명/세부공정명을 MES 등록명과 동일하게 수정 후 재업로드
                    </div>
                </div>`;
    }

    /** 세부공정 select HTML 반환 (idx: 그룹 인덱스) */
    function _cpStationSelectHtml(idx, processName, selectedStation, carModel) {
        const cfg = _getCarConfig('')[processName];
        const defined = cfg ? Object.keys(cfg.stations) : [];
        // 기존값이 목록에 없으면 커스텀으로 포함
        const all = [...defined];
        if (selectedStation && !defined.includes(selectedStation)) all.push(selectedStation);
        return `<select style="padding:2px 5px; border:1px solid var(--border-color);
                               border-radius:4px; font-size:12px; background:var(--bg-primary);"
            onchange="ProdStandardsModule._cpGroupEdit(${idx},'station',this.value)">
            ${all.map(s => `<option value="${s}" ${s===selectedStation?'selected':''}>${s}</option>`).join('')}
            ${!selectedStation ? `<option value="" selected disabled>-- 선택 --</option>` : ''}
        </select>`;
    }

    /**
     * 검증 테이블 셀 변경 핸들러
     * field: 'rawProcNo' | 'process' | 'station' | 'equipName'
     */
    function _cpGroupEdit(idx, field, val) {
        if (!_cpParsedGroups || !_cpParsedGroups[idx]) return;
        _cpParsedGroups[idx][field] = val;
        const car = _cpParsedCarModel;

        // 주공정 변경 → 세부공정 드롭다운 + 값 재설정
        if (field === 'process') {
            const cfg = _getCarConfig('')[val];
            const firstSt = cfg ? Object.keys(cfg.stations)[0] : val;
            _cpParsedGroups[idx].station = firstSt;
            const stCell = document.getElementById('cpGrpStation_' + idx);
            if (stCell) stCell.innerHTML = _cpStationSelectHtml(idx, val, firstSt, car);
        }

        // 상태 배지 갱신
        const statusCell = document.getElementById('cpGrpStatus_' + idx);
        if (statusCell) statusCell.innerHTML = _cpGroupStatusBadge(_cpParsedGroups[idx], car);
    }

    async function _confirmImport() {
        const groups = _cpParsedGroups;
        if (!groups || groups.length === 0) {
            UIUtils.toast('가져올 파라미터 데이터가 없습니다.', 'warning');
            return;
        }

        const carModel  = (document.getElementById('cpImportCar')  || {}).value || '';
        const partName  = (document.getElementById('cpImportPart') || {}).value || '';
        if (!carModel || !partName) {
            UIUtils.toast('차종과 품명을 선택하세요.', 'warning');
            return;
        }

        const fileName  = (_cpCurrentMeta || {}).fileName   || '';
        const sheetName = (_cpCurrentMeta || {}).sheetName  || '';

        // ── 기존 데이터 무조건 삭제 후 덮어쓰기 (확인 없음) ─────
        const importId = 'imp_' + Date.now();

        const allStandards = Storage.getAll(DB.STORES.PROD_STANDARDS);
        for (const s of allStandards) {
            if (s.carModel === carModel && s.partName === partName && s._docKind !== STANDARD_DOC_KIND) {
                await Storage.remove(DB.STORES.PROD_STANDARDS, s.id);
            }
        }

        // 공정 설정 (line 판별에만 사용)
        const importCarCfg = _getCarConfig(_curLine || '');

        // ── 동일 (process, station) 그룹 병합 ────────────────────────
        // rawProcNo가 다른 같은 세부공정 그룹(예: 70_1 / 70_2)을
        // 하나의 레코드로 합쳐 렌더링 시 파라미터 누락을 방지
        const mergeMap = {};
        for (const g of groups) {
            const mk = g.process + '||' + g.station;
            if (!mergeMap[mk]) {
                mergeMap[mk] = { ...g, params: [...g.params] };
            } else {
                // 파라미터 추가 (seenLabels 로 중복 제거는 아래 저장 루프에서)
                mergeMap[mk].params.push(...g.params);
                // 설비명이 다를 경우 병합 표기
                if (g.equipName && g.equipName !== mergeMap[mk].equipName) {
                    mergeMap[mk].equipName = [mergeMap[mk].equipName, g.equipName]
                        .filter(Boolean).join(' / ');
                }
            }
        }
        const mergedGroups = Object.values(mergeMap);

        let savedCount = 0;
        for (const g of mergedGroups) {
            // 공정 설정이 전혀 없으면 스킵 (알 수 없는 공정)
            const cfg = importCarCfg[g.process] || PROCESS_CONFIG[g.process];
            if (!cfg) continue;

            const line = cfg.storeLine ? cfg.storeLine : '';

            // ★ 새 등록 절차: PROCESS_CONFIG 매칭 없이 CP 항목을 그대로 저장
            // 모든 항목 → customParams 로 직접 저장 (파싱 결과 창과 1:1 일치)
            const newCustom = [];
            const newParams = {};
            const seenLabels = new Set();

            g.params.forEach(p => {
                // label이 비어있으면 itemProd → itemProc → itemNo 순으로 대체
                const effectiveLabel = (p.label || '').trim()
                    || (p.itemProd || '').trim()
                    || (p.itemProc || '').trim()
                    || (p.itemNo   || '').trim();
                if (!effectiveLabel) return;          // 완전히 빈 항목 제외
                if (seenLabels.has(effectiveLabel)) return; // 동일 라벨 중복 제외
                seenLabels.add(effectiveLabel);

                const key = p.customKey || ('cp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));

                // 관리항목 제품/공정 중복 제거
                let iProd = p.itemProd || '';
                let iProc = p.itemProc || '';
                if (iProd && iProc && iProd.replace(/\s+/g,'') === iProc.replace(/\s+/g,'')) {
                    iProd = '';  // 중복 시 제품 쪽 제거 (공정 우선)
                }

                // itemType 결정: 어느 열에 값이 있는지에 따라 설정
                // (렌더링 시 placeholder 오표시 방지)
                const itemType = iProc ? 'proc' : 'prod';

                newCustom.push({
                    key,
                    label:    effectiveLabel,  // label 비어있을 경우 itemProd/itemProc로 대체
                    itemProd: iProd,
                    itemProc: iProc,
                    unit:     p.unit    || '',
                    itemNo:   p.itemNo  || '',
                    itemType,              // ★ 반드시 저장
                });
                newParams[key] = {
                    itemNo:   p.itemNo  || '',
                    itemProd: iProd,
                    itemProc: iProc,
                    value:    p.value   || '',
                    range:    p.range   || '',
                    special:  p.special || '',
                    fp:       p.fp      || '',
                    method:   p.method  || '',
                    cycle:    p.cycle   || '',
                    control:  p.control || '',
                    resp:     p.resp    || { prod:false, mat:false, qc:false },
                };
            });

            const payload = {
                carModel, partName,
                process:        g.process,
                station:        g.station,
                equipName:      g.equipName || '',
                rawProcNo:      g.rawProcNo  || null,
                line,
                params:         newParams,
                customParams:   newCustom,
                _fromCpImport:  true,      // ★ CP 임포트 식별 플래그
                importId,
                cpSource:       { fileName, sheetName },
                updatedAt:      UIUtils.now()
            };
            await Storage.add(STORE, payload);
            savedCount++;
        }

        // ── 이력 저장 ─────────────────────────────────────────────
        await _saveCpHistory({
            importId,
            fileName,
            sheetName,
            carModel,
            partName,
            partNo:    (_cpCurrentMeta || {}).partNo || '',
            uploadedAt: UIUtils.now(),
            paramCount: mergedGroups.reduce((s, g) => s + g.params.length, 0),
            groups: mergedGroups.map(g => ({ process: g.process, station: g.station, count: g.params.length }))
        });

        // ── 사용자 정의 매핑 학습 저장 ────────────────────────────
        await _saveUserMap(carModel, partName, mergedGroups);

        UIUtils.closeModal();
        UIUtils.toast(`${savedCount}개 공정 파라미터가 저장되었습니다.`, 'success');

        // UI 갱신
        _curCarModel = carModel;
        _curPartName = partName;
        _pendingDrawing = null;
        _extraRows = [];
        _renderStandardsDetail(document.getElementById('contentArea'));
    }

    return {
        render,
        onCarChange,
        onPartChange,
        selectDocType,
        selectProcess,   // 하위 호환 유지 (외부 참조 가능성)
        selectStation,
        selectLine,
        saveParams,      // 단일 공정 저장 (하위 호환)
        saveAllParams,   // 전체 공정 일괄 저장 (CP 통합 테이블용)
        addParamRow,
        removeExtraRow,
        onDrawingFileChange,
        onDrawingDrop,
        changeDrawing,
        removeDrawing,
        openDrawingViewer,
        onControlPlanUpload,
        _setCpUploadLine,
        _cpChangeParsedLine,
        _toggleCpFlowProc,
        _moveCpFlowProc,
        _showSheetSelector,
        _selectSheet,
        _cpImportCarChange,
        _cpImportPartChange,
        _cpImportPartSelected,
        _cpGroupEdit,
        _confirmImport,
        deleteCpHistory,
        resetCpParams,
        openStationManager,
        _smSelectProc,
        _smShowForm,
        _smBackToList,
        _smSaveAndClose,
        _smAddParam,
        _smRemoveParam,
        _smParamInput,
        _smParamDragStart,
        _smParamDragOver,
        _smParamDrop,
        _smParamDragEnd,
        _smProcDragStart,
        _smProcDragOver,
        _smProcDrop,
        _smProcDragEnd,
        _smStDragStart,
        _smStDragOver,
        _smStDrop,
        _smStDragEnd,
        _smSaveStation,
        _smDeleteStation,
        _smShowProcForm,
        _smCancelProcForm,
        _smSaveProcess,
        _smDeleteProcess,
        _smChangeLine,
        _smToggleCopyPanel,
        _smCopySrcLineChange,
        _smCopySrcProcChange,
        _smCopySrcStationChange,
        _smApplyCopy,
        _refreshGroupsPreview,
        toggleSpecial,
        toggleFp,
        addRevRow,
        revInput,
        deleteRevRow,
        openStandardRowModal,
        saveStandardRow,
        deleteStandardRow,
        exportStandardDoc,
        openStandardPrintPage,
        toggleStandardMergeView,
    };
})();

/**
 * 1) 작업조건 관리 (ProdConditionsModule) - 도장-A/도장-B C/SHEET 기반 고도화
 */
var ProdConditionsModule = (function() {
    const STORE = DB.STORES.PROD_CONDITIONS;
    const CSHEET_SHARED_A = [
        ['기본 조건', 'MAIN CONVEYOR', '컨베이어 속도', '수치 입력', 'text'],
        ['기본 조건', 'MAIN CONVEYOR', '봉커버 및 체인 오염', 'OK / NG', 'check'],
        ['로딩', 'LOADING', 'Grip 장착 상태', 'OK / NG', 'check'],
        ['로딩', 'LOADING', '작업자 장갑 오염', 'OK / NG', 'check'],
        ['언로딩', 'UNLOADING', 'Grip 장착 상태', 'OK / NG', 'check'],
        ['언로딩', 'UNLOADING', '작업자 장갑 오염', 'OK / NG', 'check'],
        ['세척', '세척기', '1차 세척 장갑 오염', 'OK / NG', 'check'],
        ['세척', '세척기', 'IPA 통 청결 및 수량', 'OK / NG', 'check'],
        ['세척', '세척기', 'IPA 공급 상태', 'OK / NG', 'check'],
        ['세척', '세척기', 'IPA 적심 주기', '분/회 입력', 'text'],
        ['Booth 공조', '공조', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 항온', '항온항습', '온도 / 습도', '수치 입력', 'text'],
        ['ION Room', '제전실', '온도 / 습도', '수치 입력', 'text'],
        ['IR 건조', 'IR', '품명 / SV / PV', '수치 입력', 'text'],
        ['건조 경화', 'Oven', 'Flash / Setting / Cure 조건', '수치 입력', 'text'],
        ['ION', '#1 ION', '제전건 위치 및 에어압력', 'OK / NG 또는 수치', 'text'],
        ['도료 공급', 'Paint Supply', '필터 / 잔량 / Pot life', 'OK / NG 또는 수치', 'text'],
        ['배합실', 'Mix Room', '교반 시간 / 점도 / 보관 온도', '수치 입력', 'text']
    ];
    const CSHEET_ROBOT_A = [1, 2, 3, 4, 5, 6].flatMap(n => ([
        [`Robot #${n}`, `Robot #${n}`, '로봇 P.G / 도조건 P.G', '프로그램 확인', 'text'],
        [`Robot #${n}`, `Robot #${n}`, '무하압력 / 패턴압력 / AOPR', '수치 입력', 'text'],
        [`Robot #${n}`, `Robot #${n}`, 'Gear Pump / 회전드라이빙', '수치 입력', 'text']
    ]));
    const CSHEET_BOOTH_A = [1, 2, 3, 4, 5].flatMap(n => ([
        [`Booth #${n}`, `Booth #${n}`, '수위 및 물 순환 상태', 'OK / NG', 'check'],
        [`Booth #${n}`, `Booth #${n}`, 'Air Balance / 배기 상태', 'OK / NG 또는 수치', 'text']
    ]));
    const CSHEET_B = [
        ['기본 조건', 'MAIN CONVEYOR', '컨베이어 속도', '수치 입력', 'text'],
        ['기본 조건', 'MAIN CONVEYOR', '지그 / 체인 오염', 'OK / NG', 'check'],
        ['로딩', 'LOADING', 'Grip 장착 및 작업자 장갑', 'OK / NG', 'check'],
        ['언로딩', 'UNLOADING', 'Grip 장착 및 작업자 장갑', 'OK / NG', 'check'],
        ['세척', '세척기', 'IPA / Air blow / Tekrek 상태', 'OK / NG', 'check'],
        ['Booth 공조', '1 Booth', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 공조', '2 Booth', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 공조', '3 Booth', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 공조', '4 Booth', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 공조', 'UV Booth', '급기 / 배기', '수치 입력', 'text'],
        ['Booth 항온', '항온항습', '온도 / 습도', '수치 입력', 'text'],
        ['ION', '#1 ION', '제전건 위치 및 에어압력', 'OK / NG 또는 수치', 'text'],
        ['Robot #1', 'Robot #1', 'AGB / BINKS 도장 조건', '프로그램 및 압력 입력', 'text'],
        ['Robot #2', 'Robot #2', 'AGB / BINKS 도장 조건', '프로그램 및 압력 입력', 'text'],
        ['Robot #3', 'Robot #3', 'AGB / BINKS 도장 조건', '프로그램 및 압력 입력', 'text'],
        ['Robot #4', 'Robot #4', 'AGB / BINKS 도장 조건', '프로그램 및 압력 입력', 'text'],
        ['UV', 'UV LAMP', 'Lamp 전류', '13±2A 확인', 'text'],
        ['도료 공급', 'Paint Supply', '필터 / 잔량 / Pot life', 'OK / NG 또는 수치', 'text'],
        ['배합실', 'Mix Room', '교반 시간 / 점도 / 보관 온도', '수치 입력', 'text']
    ];
    const CSHEET_TEMPLATES = {
        'A-KNOB': { label: 'A라인 KNOB', line: 'A-LINE', items: [...CSHEET_SHARED_A, ['세척', '세척기', 'Knob Tekrek / Roller 상태', 'OK / NG', 'check'], ...CSHEET_ROBOT_A, ...CSHEET_BOOTH_A] },
        'A-COVER': { label: 'A라인 COVER', line: 'A-LINE', items: [...CSHEET_SHARED_A, ['세척', '세척기', 'Cover Tekrek / Air blow 상태', 'OK / NG', 'check'], ...CSHEET_ROBOT_A, ...CSHEET_BOOTH_A] },
        'B-LINE': { label: 'B라인', line: 'B-LINE', items: CSHEET_B }
    };

    function _esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function _templateKey(d = {}) {
        if (d.csType && CSHEET_TEMPLATES[d.csType]) return d.csType;
        if (d.line === 'B-LINE') return 'B-LINE';
        return 'A-KNOB';
    }

    function _templateItems(key, saved = []) {
        const byId = new Map((saved || []).map(item => [item.id, item]));
        return (CSHEET_TEMPLATES[key] || CSHEET_TEMPLATES['A-KNOB']).items.map((row, idx) => {
            const id = `${key}-${idx + 1}`;
            const prev = byId.get(id) || {};
            return {
                id,
                section: row[0],
                process: row[1],
                item: row[2],
                spec: row[3],
                type: row[4],
                value: prev.value || '',
                result: prev.result || '',
                note: prev.note || ''
            };
        });
    }

    function _summary(items = []) {
        const total = items.length;
        const done = items.filter(item => (item.type === 'check' ? item.result : item.value || item.result)).length;
        const ng = items.filter(item => item.result === 'NG').length;
        return { total, done, ng };
    }

    function _lineLabel(d = {}) {
        const key = _templateKey(d);
        return (CSHEET_TEMPLATES[key] || {}).label || (d.line === 'B-LINE' ? 'B라인' : 'A라인');
    }

    function search() {
        const start = document.getElementById('pcFilterStart').value;
        const end = document.getElementById('pcFilterEnd').value;
        const line = document.getElementById('pcFilterLine').value;

        let data = Storage.getByDateRange(STORE, start, end)
            .filter(d => !d._docKind);
        if (line) data = data.filter(d => d.line === line || d.csType === line);
        data.sort((a, b) => b.date.localeCompare(a.date));

        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('pcTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => {
                const sum = _summary(d.checkItems || []);
                return `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${_esc(d.date)}</td>
                    <td><span class="badge ${d.line === 'A-LINE' ? 'badge-info' : 'badge-warning'}">${_esc(_lineLabel(d))}</span></td>
                    <td style="font-weight:600;">${_esc(d.carModel || '-')} / ${_esc(d.partName || '-')}</td>
                    <td>${_esc(d.convSpeed || '-')}</td>
                    <td style="font-size:12px;max-width:300px;">
                        <span style="font-weight:700;color:var(--accent-blue);">${sum.done}</span> / ${sum.total || 0} 완료
                        ${sum.ng ? `<span style="margin-left:8px;color:var(--accent-red);font-weight:700;">NG ${sum.ng}</span>` : ''}
                    </td>
                    <td>${_esc(d.operator || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdConditionsModule.edit('${d.id}')">상세/수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdConditionsModule.remove('${d.id}')">삭제</button>
                    </td>
                </tr>
            `}).join('');
    }

    function fillForm(d = {}) {
        const selectedType = _templateKey(d);
        const items = _templateItems(selectedType, d.checkItems || []);
        const sum = _summary(items);

        return `
            <div style="max-height: 74vh; overflow-y: auto; padding-right: 10px;">
                <div style="position:sticky;top:0;z-index:2;background:#fff;border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:12px;box-shadow:0 4px 10px rgba(15,23,42,0.06);">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
                        <div style="font-weight:800;color:var(--text-primary);">공정 조건 C/S 일별 기록</div>
                        <div id="pcProgressText" style="font-size:0.85rem;font-weight:700;color:var(--accent-blue);">${sum.done} / ${sum.total} 완료</div>
                    </div>
                    <div style="height:8px;background:var(--bg-secondary);border-radius:999px;overflow:hidden;">
                        <div id="pcProgressBar" style="height:100%;width:${sum.total ? Math.round(sum.done / sum.total * 100) : 0}%;background:var(--accent-blue);"></div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">기록일자 <span style="color:var(--accent-red)">*</span></label>
                        <input type="date" class="form-input" id="pcDate" value="${_esc(d.date || UIUtils.today())}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">C/S 양식 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="pcCsType" onchange="ProdConditionsModule.toggleLine(this.value)">
                            ${Object.entries(CSHEET_TEMPLATES).map(([key, tpl]) => `<option value="${key}" ${selectedType === key ? 'selected' : ''}>${tpl.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <input type="text" class="form-input" id="pcCarModel" value="${_esc(d.carModel || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">품명</label>
                        <input type="text" class="form-input" id="pcPartName" value="${_esc(d.partName || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">작업자</label>
                        <input type="text" class="form-input" id="pcOperator" value="${_esc(d.operator || '')}" placeholder="기록인">
                    </div>
                </div>

                <div style="margin:16px 0 10px; font-weight:700; color:var(--accent-blue); display:flex; align-items:center; gap:8px;">
                     <span class="material-symbols-outlined">fact_check</span> 왼쪽 위부터 아래 순서로 입력
                </div>

                <div id="pcLineSpecificContent">
                    ${renderLineSpecificFields(selectedType, { ...d, checkItems: items })}
                </div>
            </div>
        `;
    }

    function renderLineSpecificFields(type, d = {}) {
        const items = d.checkItems || _templateItems(type, []);
        let current = '';
        return items.map((item, idx) => {
            const section = item.section !== current
                ? (current = item.section, `<div style="margin:14px 0 8px;padding:8px 10px;background:var(--bg-secondary);border-left:4px solid var(--accent-blue);border-radius:6px;font-weight:800;">${_esc(item.section)}</div>`)
                : '';
            const input = item.type === 'check'
                ? `<div class="pc-check-group" data-id="${item.id}" data-result="${_esc(item.result)}" style="display:flex;gap:6px;">
                       <button type="button" class="btn btn-sm ${item.result === 'OK' ? 'btn-success' : 'btn-outline'}" onclick="ProdConditionsModule.setCheck('${item.id}','OK')">OK</button>
                       <button type="button" class="btn btn-sm ${item.result === 'NG' ? 'btn-danger' : 'btn-outline'}" onclick="ProdConditionsModule.setCheck('${item.id}','NG')">NG</button>
                   </div>`
                : `<input type="text" class="form-input pc-value-input" data-id="${item.id}" value="${_esc(item.value)}" placeholder="${_esc(item.spec)}" oninput="ProdConditionsModule.updateProgress()">`;
            return `
                ${section}
                <div class="pc-csheet-row" data-id="${item.id}" data-type="${item.type}" data-section="${_esc(item.section)}" data-process="${_esc(item.process)}" data-item="${_esc(item.item)}" data-spec="${_esc(item.spec)}"
                     style="display:grid;grid-template-columns:42px 1fr 1.1fr 1.2fr 1fr;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;background:#fff;">
                    <div style="font-weight:800;color:var(--text-muted);">${idx + 1}</div>
                    <div style="font-weight:700;">${_esc(item.process)}</div>
                    <div>${_esc(item.item)}</div>
                    <div style="font-size:0.82rem;color:var(--text-muted);">${_esc(item.spec)}</div>
                    <div>${input}</div>
                    <textarea class="form-textarea pc-note-input" data-id="${item.id}" rows="1" placeholder="비고" style="grid-column:2 / 6;min-height:34px;">${_esc(item.note)}</textarea>
                </div>
            `;
        }).join('');
    }

    function toggleLine(type) {
        const content = document.getElementById('pcLineSpecificContent');
        if (!content) return;
        content.innerHTML = renderLineSpecificFields(type, { checkItems: _templateItems(type, []) });
        updateProgress();
    }

    function setCheck(id, result) {
        const group = document.querySelector(`.pc-check-group[data-id="${id}"]`);
        if (!group) return;
        group.dataset.result = result;
        group.querySelectorAll('button').forEach(btn => {
            btn.className = `btn btn-sm ${btn.textContent.trim() === result ? (result === 'OK' ? 'btn-success' : 'btn-danger') : 'btn-outline'}`;
        });
        updateProgress();
    }

    function updateProgress() {
        const items = _collectCsheetItems();
        const sum = _summary(items);
        const text = document.getElementById('pcProgressText');
        const bar = document.getElementById('pcProgressBar');
        if (text) text.textContent = `${sum.done} / ${sum.total} 완료${sum.ng ? ` · NG ${sum.ng}` : ''}`;
        if (bar) bar.style.width = `${sum.total ? Math.round(sum.done / sum.total * 100) : 0}%`;
    }

    function _collectCsheetItems() {
        return [...document.querySelectorAll('.pc-csheet-row')].map(row => {
            const id = row.dataset.id;
            const type = row.dataset.type;
            const group = row.querySelector('.pc-check-group');
            return {
                id,
                section: row.dataset.section || '',
                process: row.dataset.process || '',
                item: row.dataset.item || '',
                spec: row.dataset.spec || '',
                type,
                value: row.querySelector(`.pc-value-input[data-id="${id}"]`)?.value.trim() || '',
                result: group?.dataset.result || '',
                note: row.querySelector(`.pc-note-input[data-id="${id}"]`)?.value.trim() || ''
            };
        });
    }

    function collectData() {
        const csType = document.getElementById('pcCsType').value;
        const tpl = CSHEET_TEMPLATES[csType] || CSHEET_TEMPLATES['A-KNOB'];
        const checkItems = _collectCsheetItems();
        const convItem = checkItems.find(item => item.item.includes('컨베이어 속도'));
        const data = {
            date: document.getElementById('pcDate').value,
            line: tpl.line,
            csType,
            carModel: document.getElementById('pcCarModel').value.trim(),
            partName: document.getElementById('pcPartName').value.trim(),
            convSpeed: convItem ? convItem.value : '',
            operator: document.getElementById('pcOperator').value.trim(),
            checkItems,
            updatedAt: new Date().toISOString()
        };

        return data;
    }

    function openAddModal() {
        const host = document.getElementById('pcInlineFormHost');
        if (!host) return;
        host.style.display = '';
        host.innerHTML = `
            <div class="card" style="margin-bottom:14px;border:1px solid var(--accent-blue);">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="font-weight:700;">공정 조건 C/S 등록</div>
                    <button class="btn btn-sm btn-outline" onclick="ProdConditionsModule.closeInlineForm()">닫기</button>
                </div>
                <div class="card-body">${fillForm()}</div>
                <div class="card-footer" style="display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn btn-secondary" onclick="ProdConditionsModule.closeInlineForm()">취소</button>
                    <button class="btn btn-primary" onclick="ProdConditionsModule.saveNew()">등록</button>
                </div>
            </div>
        `;
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeInlineForm() {
        const host = document.getElementById('pcInlineFormHost');
        if (!host) return;
        host.innerHTML = '';
        host.style.display = 'none';
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.line) {
            UIUtils.toast('필수 항목을 입력하세요.', 'warning');
            return;
        }
        await Storage.add(STORE, data);
        closeInlineForm();
        search();
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal({
            title: '공정 조건 C/S 수정',
            body: fillForm(d),
            footer: `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdConditionsModule.saveEdit('${id}')">저장</button>`,
            size: '1352px',
            noBackdropClose: true
        });
    }

    async function saveEdit(id) {
        const data = collectData();
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            search();
        });
    }

    function exportData() {
        const data = Storage.getAll(STORE).filter(d => !d._docKind);
        const headers = ['일자', '양식', '차종', '품명', '컨베이어속도', '완료', '전체', 'NG', '작업자'];
        const rows = data.map(d => {
            const sum = _summary(d.checkItems || []);
            return [d.date, _lineLabel(d), d.carModel, d.partName, d.convSpeed, sum.done, sum.total, sum.ng, d.operator];
        });
        Storage.exportToCSV(headers, rows, '공정조건기록');
    }

    // ══════════════════════════════════════════════════════════════════
    // 사출컬러 기준서 관리
    // ══════════════════════════════════════════════════════════════════
    const CS_STORE = DB.STORES.INJECT_COLOR_STD;

    function _fmtSize(bytes) {
        if (!bytes) return '-';
        if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return Math.round(bytes / 1024) + ' KB';
    }

    function _appendColorStdSection(container) {
        const wrap = container.querySelector('.fade-in-up');
        if (!wrap) return;
        const el = document.createElement('div');
        el.id = 'colorStdSection';
        el.style.marginTop = '20px';
        _refreshColorStdHTML(el);
        wrap.appendChild(el);
    }

    function _refreshColorStdSection() {
        const el = document.getElementById('colorStdSection');
        if (el) _refreshColorStdHTML(el);
    }

    function _refreshColorStdHTML(el) {
        const files = (Storage.getAll(CS_STORE) || [])
            .sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));

        const rows = files.length === 0
            ? `<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:0.85rem;">
                   <span class="material-symbols-outlined" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;">folder_open</span>
                   업로드된 기준서가 없습니다.
               </div>`
            : `<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);">파일명</th>
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);">업로드일</th>
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);">업로드자</th>
                        <th style="padding:7px 12px;text-align:right;font-weight:600;color:var(--text-secondary);">크기</th>
                        <th style="padding:7px 12px;text-align:center;font-weight:600;color:var(--text-secondary);">작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${files.map((f, i) => `
                    <tr style="border-top:1px solid var(--border-color);${i === 0 ? 'background:rgba(52,211,153,0.05);' : ''}">
                        <td style="padding:8px 12px;">
                            <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;color:var(--accent-green);margin-right:5px;">description</span>
                            <span style="font-weight:${i === 0 ? '700' : '400'};">${f.filename || '-'}</span>
                            ${i === 0 ? `<span style="margin-left:7px;background:var(--accent-green);color:#fff;border-radius:4px;padding:1px 7px;font-size:0.68rem;font-weight:700;">현행</span>` : ''}
                        </td>
                        <td style="padding:8px 12px;">${f.uploadDate || '-'}</td>
                        <td style="padding:8px 12px;">${f.uploadedBy || '-'}</td>
                        <td style="padding:8px 12px;text-align:right;color:var(--text-muted);">${_fmtSize(f.fileSize)}</td>
                        <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline"
                                onclick="ProdConditionsModule.downloadColorStd('${f.id}')"
                                style="margin-right:4px;">
                                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">download</span> 다운로드
                            </button>
                            <button class="btn btn-sm btn-danger"
                                onclick="ProdConditionsModule.removeColorStd('${f.id}')">삭제</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
               </table>`;

        el.innerHTML = `
        <div class="card">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue);font-size:20px;">palette</span>
                    <span style="font-weight:700;font-size:0.95rem;">사출컬러 기준서</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);">사출품 COLOR 기준서 파일 이력 관리</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button class="btn btn-success"
                            onclick="ProdConditionsModule.openColorStdViewer()"
                            style="display:flex;align-items:center;gap:5px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">visibility</span> 기준서 보기
                    </button>
                    <input type="file" id="colorStdFileInput"
                           accept=".xlsx,.xls"
                           style="display:none"
                           onchange="ProdConditionsModule.uploadColorStd(this)">
                    <button class="btn btn-primary"
                            onclick="document.getElementById('colorStdFileInput').click()">
                        <span class="material-symbols-outlined">upload_file</span> 기준서 업로드
                    </button>
                </div>
            </div>
            <div class="card-body" style="padding:0;">${rows}</div>
        </div>`;
    }

    async function uploadColorStd(input) {
        const file = input.files[0];
        if (!file) return;
        const maxMB = 20;
        if (file.size > maxMB * 1024 * 1024) {
            UIUtils.toast(`파일 크기가 ${maxMB}MB를 초과합니다.`, 'warning');
            input.value = '';
            return;
        }

        UIUtils.toast('업로드 중...', 'info');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const record = {
                    filename:   file.name,
                    uploadDate: UIUtils.today(),
                    uploadedBy: (typeof AuthModule !== 'undefined' && AuthModule.currentUser
                                    ? (AuthModule.currentUser() || {}).name : '') || '-',
                    fileSize:   file.size,
                    mimeType:   file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    fileBlob:   new Blob([e.target.result], { type: file.type })
                };
                await Storage.add(CS_STORE, record);
                UIUtils.toast(`"${file.name}" 업로드 완료`, 'success');
                input.value = '';
                _refreshColorStdSection();
            } catch (err) {
                console.error(err);
                UIUtils.toast('업로드 실패: ' + err.message, 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('파일 읽기 실패', 'error');
        reader.readAsArrayBuffer(file);
    }

    function downloadColorStd(id) {
        const rec = Storage.getById(CS_STORE, id);
        if (!rec) { UIUtils.toast('파일을 찾을 수 없습니다.', 'error'); return; }

        const blob = rec.fileBlob instanceof Blob
            ? rec.fileBlob
            : new Blob([rec.fileBlob], { type: rec.mimeType || 'application/octet-stream' });

        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = rec.filename || 'color_standard.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function removeColorStd(id) {
        const rec = Storage.getById(CS_STORE, id);
        const name = rec ? rec.filename : '파일';
        UIUtils.confirm(`"${name}" 을(를) 삭제하시겠습니까?`, async () => {
            await Storage.remove(CS_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _refreshColorStdSection();
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 사출컬러 기준서 뷰어
    // ──────────────────────────────────────────────────────────────────────
    const _IMG = p => `assets/inject-color-std/${p}`;

    // 이미지-제품 매핑 (Excel xl/media/ → 제품 그룹)
    // A라인 섹션1: 차종별 사출품 COLOR 기준
    const _A1 = [
        {
            car:'GOLF7', part:'KNOB류',
            colors:[
                { paint:'WHI',      inject:'DYS QAW', img:_IMG('image4.png') },
                { paint:'WHITE',    inject:'GRAY',    img:_IMG('image6.png') }
            ]
        },
        {
            car:'XFD', part:'1,3 SPOT',
            colors:[
                { paint:'BLACK',    inject:'GRAY',    img:_IMG('image7.png') },
                { paint:'WHITE',    inject:'GRAY',    img:_IMG('image8.png') }
            ]
        },
        {
            car:'A3 / A3 PA', part:'Knob류',
            colors:[
                { paint:'6PS',      inject:'AZ3',     img:_IMG('image3.png') },
                { paint:'WHITE',    inject:'WHITE',   img:null }
            ]
        },
        {
            car:'Q2', part:'KNOB류',
            colors:[
                { paint:'BC5',      inject:'ET1',     img:_IMG('image5.png') },
                { paint:'S/M GRAY', inject:'S/M GRAY',img:null }
            ]
        },
        {
            car:'A3 / A3 PA', part:'PAO COVER',
            colors:[
                { paint:'6PS',      inject:'AZ3',     img:_IMG('image10.png') },
                { paint:'WHITE',    inject:'WHITE',   img:null }
            ]
        },
        {
            car:'Q2', part:'PAO COVER',
            colors:[
                { paint:'BC5',      inject:'ET1',     img:_IMG('image11.png') },
                { paint:'S/M GRAY', inject:'S/M GRAY',img:null }
            ]
        }
    ];

    // A라인 섹션2
    const _A2 = [
        {
            car:'T1XX', part:'Lens',
            colors:[
                { paint:'BLACK',    inject:'-', img:_IMG('image13.png') },
                { paint:'CLEAR/BK', inject:'-', img:null }
            ]
        },
        {
            car:'T1XX', part:'P-BUTTON',
            colors:[
                { paint:'BLACK',    inject:'-', img:_IMG('image12.png') },
                { paint:'WHITE',    inject:'-', img:null }
            ]
        },
        {
            car:'P702', part:'M-BUTTON',
            colors:[
                { paint:'BLACK',    inject:'-', img:_IMG('image15.png') },
                { paint:'white',    inject:'-', img:null }
            ]
        },
        {
            car:'P702', part:'LENS',
            colors:[
                { paint:'BLACK',    inject:'-', img:_IMG('image14.png') },
                { paint:'WHITE',    inject:'-', img:null }
            ]
        },
        {
            car:'J34A', part:'LH, RH',
            colors:[
                { paint:'02 WHITE', inject:'-', img:_IMG('image18.png') },
                { paint:'750 GRAY', inject:'-', img:_IMG('image9.png')  },
                { paint:'WHITE',    inject:'-', img:null },
                { paint:'S/M GRAY', inject:'-', img:null }
            ]
        }
    ];

    // B라인 섹션1: A8 / A3 / Q2
    const _B1 = [
        {
            car:'A8', part:'HOUSING',
            colors:[
                { paint:'1PH', inject:'GRAY',  img:_IMG('image24.png') },
                { paint:'6PS', inject:'BLACK', img:_IMG('image25.png') },
                { paint:'1KF', inject:'BEIGE', img:_IMG('image28.png') }
            ]
        },
        {
            car:'A8', part:'UPPER CASE',
            colors:[
                { paint:'1PH', inject:'GRAY',  img:_IMG('image22.png') },
                { paint:'6PS', inject:'BLACK', img:_IMG('image27.png') },
                { paint:'1KF', inject:'BEIGE', img:_IMG('image29.png') }
            ]
        },
        {
            car:'A8', part:'LOWER CASE',
            colors:[
                { paint:'1PH', inject:'GRAY',  img:_IMG('image23.png') },
                { paint:'6PS', inject:'BLACK', img:_IMG('image26.png') },
                { paint:'1KF', inject:'BEIGE', img:_IMG('image30.png') }
            ]
        },
        {
            car:'A3', part:'E-CALL COVER',
            colors:[
                { paint:'6PS',  inject:'RED', img:_IMG('image32.png') },
                { paint:'AZ3',  inject:'RED', img:null },
                { paint:'BC5',  inject:'RED', img:null },
                { paint:'ET1',  inject:'RED', img:null }
            ]
        },
        {
            car:'A3', part:'PA E-CALL COVER',
            colors:[
                { paint:'BC5',  inject:'RED', img:_IMG('image21.png') },
                { paint:'ET1',  inject:'RED', img:null }
            ]
        },
        {
            car:'Q2', part:'E-CALL COVER',
            colors:[
                { paint:'BC5',  inject:'RED', img:null },
                { paint:'ET1',  inject:'RED', img:null }
            ]
        }
    ];

    // B라인 섹션2
    const _B2 = [
        {
            car:'A3, Q2', part:'LENS',
            colors:[{ paint:'투명(CLEAR)', inject:'-', img:_IMG('image20.png') }]
        },
        {
            car:'T1XX', part:'IL-BUTTON',
            colors:[{ paint:'BLACK', inject:'-', img:_IMG('image19.png') }]
        },
        {
            car:'CHEVY / GMC', part:'EMBLEM',
            colors:[{ paint:'BLACK', inject:'-', img:_IMG('image31.png') }]
        }
    ];

    const _ACTION = {
        ko: '계획과 상이한 사출 컬러시 라인 정지 후 관리자 통보 후 조치 기준에 맞는 컬러로 사출물을 투입한다.',
        ru: 'При несоответствии цвета литья плану линия останавливается, уведомляется руководитель, затем вводится материал нужного цвета.',
        en: 'If the injection color differs from the plan, the line stops, the manager is notified, and the correct color is used.'
    };

    function _colorTag(paint, inject) {
        const pStyle = 'display:inline-block;padding:2px 8px;border-radius:3px;font-size:0.75rem;font-weight:600;margin:2px;';
        const pColor = _paintTagColor(paint);
        const iColor = _injectTagColor(inject);
        let html = `<span style="${pStyle}background:${pColor.bg};color:${pColor.fg};">도장 ${paint}</span>`;
        if (inject && inject !== '-') {
            html += `<br><span style="${pStyle}background:${iColor.bg};color:${iColor.fg};margin-top:3px;">사출 ${inject}</span>`;
        }
        return html;
    }

    function _paintTagColor(c) {
        const s = (c || '').toUpperCase();
        if (s.includes('WHITE') || s.includes('WHI') || s.includes('02 WHITE'))
            return { bg:'#e8f0fe', fg:'#1a56db' };
        if (s.includes('BLACK') || s.includes('BK') || s.includes('CLEAR/BK'))
            return { bg:'#1f2937', fg:'#f9fafb' };
        if (s.includes('GRAY') || s.includes('GREY') || s.includes('S/M'))
            return { bg:'#e5e7eb', fg:'#374151' };
        if (s.includes('RED'))  return { bg:'#fee2e2', fg:'#dc2626' };
        if (s.includes('6PS') || s.includes('BC5') || s.includes('1PH') || s.includes('1KF'))
            return { bg:'#dbeafe', fg:'#1e40af' };
        if (s.includes('투명') || s.includes('CLEAR'))
            return { bg:'#f0fdf4', fg:'#166534' };
        return { bg:'#f3f4f6', fg:'#374151' };
    }

    function _injectTagColor(c) {
        const s = (c || '').toUpperCase();
        if (s.includes('GRAY') || s.includes('DYS') || s.includes('AZ3'))
            return { bg:'#f3f4f6', fg:'#6b7280' };
        if (s.includes('BLACK') || s.includes('ET1'))
            return { bg:'#111827', fg:'#e5e7eb' };
        if (s.includes('WHITE'))    return { bg:'#eff6ff', fg:'#2563eb' };
        if (s.includes('BEIGE'))    return { bg:'#fef3c7', fg:'#92400e' };
        if (s.includes('RED'))      return { bg:'#fee2e2', fg:'#dc2626' };
        return { bg:'#f9fafb', fg:'#374151' };
    }

    function _productCard(group) {
        const colors = group.colors;
        const colsHtml = colors.map(c => {
            const imgHtml = c.img
                ? `<div style="text-align:center;margin-bottom:8px;">
                     <img src="${c.img}" alt="${c.paint}"
                          style="max-width:100%;max-height:130px;object-fit:contain;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;"
                          onclick="this.requestFullscreen&&this.requestFullscreen()"
                          onerror="this.style.display='none';this.nextSibling.style.display='block'">
                     <div style="display:none;height:80px;line-height:80px;background:#f9fafb;border-radius:6px;border:1px dashed #d1d5db;color:#9ca3af;font-size:0.75rem;">이미지 없음</div>
                   </div>`
                : `<div style="height:80px;line-height:80px;text-align:center;background:#f9fafb;border-radius:6px;border:1px dashed #d1d5db;color:#9ca3af;font-size:0.75rem;margin-bottom:8px;">사진</div>`;
            return `<div style="flex:1;min-width:90px;text-align:center;">
                ${imgHtml}
                <div style="margin-top:4px;">${_colorTag(c.paint, c.inject)}</div>
            </div>`;
        }).join('');

        return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:10px;">
            <div style="background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;padding:8px 12px;display:flex;align-items:center;gap:8px;">
                <span class="material-symbols-outlined" style="font-size:15px;">directions_car</span>
                <strong style="font-size:0.85rem;">${group.car}</strong>
                <span style="opacity:0.7;font-size:0.75rem;">│</span>
                <span style="font-size:0.8rem;opacity:0.9;">${group.part}</span>
            </div>
            <div style="padding:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                ${colsHtml}
            </div>
        </div>`;
    }

    function _actionSection() {
        return `
        <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin-top:4px;">
            <div style="font-weight:700;color:#92400e;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                부적합시 조치사항
            </div>
            <div style="display:grid;gap:6px;">
                <div style="display:flex;gap:8px;align-items:baseline;">
                    <span style="font-size:0.68rem;background:#92400e;color:#fff;border-radius:3px;padding:1px 5px;white-space:nowrap;flex-shrink:0;">KOR</span>
                    <span style="font-size:0.82rem;color:#78350f;">${_ACTION.ko}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:baseline;">
                    <span style="font-size:0.68rem;background:#6b7280;color:#fff;border-radius:3px;padding:1px 5px;white-space:nowrap;flex-shrink:0;">RUS</span>
                    <span style="font-size:0.82rem;color:#4b5563;">${_ACTION.ru}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:baseline;">
                    <span style="font-size:0.68rem;background:#1e40af;color:#fff;border-radius:3px;padding:1px 5px;white-space:nowrap;flex-shrink:0;">ENG</span>
                    <span style="font-size:0.82rem;color:#1e3a8a;">${_ACTION.en}</span>
                </div>
            </div>
        </div>`;
    }

    function openColorStdViewer() {
        const aLineHtml = `
            <div>
                <div style="font-size:0.7rem;color:#6b7280;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
                    📌 섹션 1 — GOLF7 / XFD / A3 PA / Q2 계열
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
                    ${_A1.map(_productCard).join('')}
                </div>
                <div style="font-size:0.7rem;color:#6b7280;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin:14px 0 10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
                    📌 섹션 2 — T1XX / P702 / J34A 계열
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
                    ${_A2.map(_productCard).join('')}
                </div>
                ${_actionSection()}
            </div>`;

        const bLineHtml = `
            <div>
                <div style="font-size:0.7rem;color:#6b7280;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
                    📌 섹션 1 — A8 / A3 / Q2 계열
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
                    ${_B1.map(_productCard).join('')}
                </div>
                <div style="font-size:0.7rem;color:#6b7280;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin:14px 0 10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
                    📌 섹션 2 — A3,Q2 / T1XX / CHEVY,GMC 계열
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
                    ${_B2.map(_productCard).join('')}
                </div>
                ${_actionSection()}
            </div>`;

        const bodyHtml = `
        <style>
            #csViewer { font-family:'Inter',sans-serif; }
            #csViewer .cs-tab-btn { cursor:pointer;padding:7px 18px;border:none;border-radius:20px;font-size:0.82rem;font-weight:600;transition:all 0.2s; }
            #csViewer .cs-tab-btn.active { background:var(--accent-blue,#2563eb);color:#fff; }
            #csViewer .cs-tab-btn:not(.active) { background:#f3f4f6;color:#374151; }
        </style>
        <div id="csViewer">
            <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:16px 20px;border-radius:8px;margin-bottom:14px;color:#fff;">
                <div style="font-size:0.7rem;opacity:0.7;margin-bottom:4px;">공정 : 로딩 | 제조라인 선택</div>
                <div style="font-size:1.1rem;font-weight:700;margin-bottom:2px;">사출품 COLOR 기준서</div>
                <div style="font-size:0.75rem;opacity:0.8;">도장 컬러별 도장 적합성인 은폐력 및 색차 기준을 맞추기 위함</div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:14px;">
                <button class="cs-tab-btn active" id="csTabA" onclick="ProdConditionsModule._csSwitch('A')">🅰 A라인</button>
                <button class="cs-tab-btn" id="csTabB" onclick="ProdConditionsModule._csSwitch('B')">🅱 B라인</button>
            </div>
            <div id="csContentA">${aLineHtml}</div>
            <div id="csContentB" style="display:none;">${bLineHtml}</div>
        </div>`;

        UIUtils.openModal({
            title: '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;color:#2563eb;">palette</span>사출컬러 기준서',
            body: bodyHtml,
            size: 'xxl',
            footer: `<button class="btn btn-outline" onclick="UIUtils.closeModal()">닫기</button>`
        });

        setTimeout(() => {
            const c = document.querySelector('#modal .modal-container');
            if (c) {
                c.style.setProperty('width',      '90vw', 'important');
                c.style.setProperty('max-height', '88vh', 'important');
            }
            const body = document.querySelector('#modal .modal-body');
            if (body) {
                body.style.setProperty('overflow-y', 'auto', 'important');
                body.style.setProperty('max-height', '76vh', 'important');
            }
        }, 0);
    }

    function _csSwitch(line) {
        const a = document.getElementById('csContentA');
        const b = document.getElementById('csContentB');
        const tabA = document.getElementById('csTabA');
        const tabB = document.getElementById('csTabB');
        if (!a || !b) return;
        if (line === 'A') {
            a.style.display = ''; b.style.display = 'none';
            tabA.classList.add('active'); tabB.classList.remove('active');
        } else {
            b.style.display = ''; a.style.display = 'none';
            tabB.classList.add('active'); tabA.classList.remove('active');
        }
    }

        return {
        render(container) {
            const filterHTML = `
                <div class="form-group">
                    <label class="form-label">시작일</label>
                    <input type="date" class="form-input" id="pcFilterStart" value="${UIUtils.monthAgo()}">
                </div>
                <div class="form-group">
                    <label class="form-label">종료일</label>
                    <input type="date" class="form-input" id="pcFilterEnd" value="${UIUtils.today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">라인</label>
                    <select class="form-select" id="pcFilterLine">
                        <option value="">전체 라인</option>
                        <option value="A-KNOB">A라인 KNOB</option>
                        <option value="A-COVER">A라인 COVER</option>
                        <option value="B-LINE">B라인</option>
                    </select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-outline" onclick="ProdConditionsModule.search()">
                        <span class="material-symbols-outlined">search</span> 조회
                    </button>
                </div>
            `;
            const headers = ['No', '일자', '라인', '차종/품명', '컨베이어', '작업항목 확인', '작업자'];
            ProdUtils.renderMain(container, '작업조건 관리', '공정조건 C/SHEET 기반의 매일 정밀 작업 조건을 기록합니다.', 'ProdConditionsModule.openAddModal()', 'ProdConditionsModule.exportData()', filterHTML, 'pcTable', headers);
            const tableEl = document.getElementById('pcTable');
            const tableWrap = tableEl ? (tableEl.closest('.card') || tableEl.parentElement) : null;
            if (tableWrap && !document.getElementById('pcInlineFormHost')) {
                const host = document.createElement('div');
                host.id = 'pcInlineFormHost';
                host.style.display = 'none';
                tableWrap.parentElement.insertBefore(host, tableWrap);
            }
            search();
        },
        search,
        openAddModal,
        closeInlineForm,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData,
        toggleLine,
        setCheck,
        updateProgress,
        uploadColorStd,
        downloadColorStd,
        removeColorStd,
        openColorStdViewer,
        _csSwitch
    };
})();

/**
 * 2) 배합/사용 이력 (PaintMixModule)
 */
var PaintMixModule = (function() {
    const STORE           = DB.STORES.PROD_CONDITIONS;
    const USAGE_STORE     = DB.STORES.PAINT_USAGE_STD;
    const MIX_STD_STORE   = DB.STORES.PAINT_MIX_STD;
    const PAINT_INV_STORE = DB.STORES.PAINT_INVENTORY;
    const PAINT_MAT_STORE = DB.STORES.PAINT_MATERIALS;
    const PAINT_WORK_STORE = DB.STORES.PAINTING_WORK;
    const PRODUCT_STORE   = DB.STORES.PRODUCTS;
    const DOC_KIND = 'paint_mix';

    const _esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _js  = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

    let _curTab = 'history';

    /* ─── 탭 전환 ─────────────────────────────────────────────── */
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-actions" id="pmixPageActions"></div>
            </div>

            <div id="pmixPane_formula" style="display:none;"></div>
            <div id="pmixPane_history"></div>
            <div id="pmixPane_residual" style="display:none;"></div>
        </div>`;

        _curTab = 'history';
        renderHistoryTab();
    }

    function switchTab(tab) {
        _curTab = tab;
        ['usage','history','residual'].forEach(t => {
            const btn  = document.getElementById('pmixTabBtn_' + t);
            const pane = document.getElementById('pmixPane_' + t);
            if (btn)  btn.className  = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-outline');
            if (pane) pane.style.display = t === tab ? '' : 'none';
        });
        /* formula pane은 제조관리표준 > 배합기준서에서만 사용 */
        const fp = document.getElementById('pmixPane_formula');
        if (fp) fp.style.display = 'none';
        if (tab === 'usage')    renderUsageTab();
        if (tab === 'history')  renderHistoryTab();
        if (tab === 'residual') renderResidualTab();
    }

    /* ══════════════════════════════════════════════════════
       TAB 1 ── 도료 사용량 기준표
    ══════════════════════════════════════════════════════ */
    function _usageStds() { return Storage.getAll(USAGE_STORE) || []; }

    /* 첨부 기준표 기본 데이터 (최초 1회 자동 시딩) */
    const _DEFAULT_USAGE = [
        { carModel:'GOLF-7', partName:'KNOB',              line:'A', baseCoat:1,    topCoat:1.5  },
        { carModel:'A3',     partName:'KNOB',              line:'A', baseCoat:0.6,  topCoat:1    },
        { carModel:'A3',     partName:'PAO COVER',         line:'A', baseCoat:1,    topCoat:1.6  },
        { carModel:'A3',     partName:'EC COVER',          line:'B', baseCoat:1,    topCoat:1.5  },
        { carModel:'Q2',     partName:'KNOB',              line:'A', baseCoat:1,    topCoat:1    },
        { carModel:'Q2',     partName:'PAO COVER',         line:'A', baseCoat:1,    topCoat:1.6  },
        { carModel:'Q2',     partName:'EC COVER',          line:'B', baseCoat:1,    topCoat:1.5  },
        { carModel:'A3 PA',  partName:'KNOB',              line:'A', baseCoat:0.6,  topCoat:1    },
        { carModel:'A3 PA',  partName:'EC COVER',          line:'B', baseCoat:1,    topCoat:1    },
        { carModel:'A8',     partName:'HOUSING',           line:'B', baseCoat:null, topCoat:10   },
        { carModel:'A8',     partName:'UPPER',             line:'B', baseCoat:null, topCoat:10   },
        { carModel:'A8',     partName:'LOWER',             line:'B', baseCoat:null, topCoat:10   },
        { carModel:'A8',     partName:'MAKE UP BEZEL',     line:'B', baseCoat:null, topCoat:1    },
        { carModel:'XFD',    partName:'1SPOT',             line:'A', baseCoat:1,    topCoat:1    },
        { carModel:'XFD',    partName:'3SPOT',             line:'A', baseCoat:1,    topCoat:4    },
        { carModel:'J34A',   partName:'KNOB',              line:'A', baseCoat:1,    topCoat:1    },
        { carModel:'T1XX',   partName:'LENS-BLACK',        line:'A', baseCoat:1,    topCoat:1    },
        { carModel:'T1XX',   partName:'LENS-UV',           line:'B', baseCoat:1,    topCoat:2    },
        { carModel:'T1XX',   partName:'P BUTTON BLACK',    line:'A', baseCoat:1,    topCoat:1    },
        { carModel:'T1XX',   partName:'P BUTTON CLEAR',    line:'B', baseCoat:1,    topCoat:1    },
        { carModel:'T1XX',   partName:'IL BLACK',          line:'B', baseCoat:null, topCoat:1    },
        { carModel:'T1XX',   partName:'IL CLEAR',          line:'B', baseCoat:null, topCoat:1    },
        { carModel:'T1XX',   partName:'DECO #1',           line:'B', baseCoat:2,    topCoat:0.06 },
        { carModel:'T1XX',   partName:'DECO #2',           line:'B', baseCoat:2,    topCoat:0.06 },
        { carModel:'T1XX',   partName:'DECO #3',           line:'B', baseCoat:1,    topCoat:0.03 },
        { carModel:'T1XX',   partName:'LINER',             line:'B', baseCoat:1,    topCoat:0.03 },
        { carModel:'C223',   partName:'DECO HOR VANE LH',  line:'B', baseCoat:1,    topCoat:0.02 },
        { carModel:'C223',   partName:'DECO HOR VANE RH',  line:'B', baseCoat:2,    topCoat:0.04 },
        { carModel:'C223',   partName:'KNOB DECO CTR',     line:'B', baseCoat:1,    topCoat:0.02 },
        { carModel:'C223',   partName:'KNOB DECO OTR',     line:'B', baseCoat:1,    topCoat:0.02 },
        { carModel:'C223',   partName:'X VANE',            line:'B', baseCoat:2,    topCoat:null },
        { carModel:'FORD',   partName:'P702 LENS BLACK',   line:'A', baseCoat:2,    topCoat:4    },
        { carModel:'FORD',   partName:'P702 LENS CLEAR',   line:'B', baseCoat:1,    topCoat:3    },
        { carModel:'FORD',   partName:'P702 BUTTON M',     line:'A', baseCoat:1,    topCoat:null },
        { carModel:'FORD',   partName:'P702 BUTTON N',     line:'A', baseCoat:1,    topCoat:null },
        { carModel:'C300',   partName:'T/G BADGE',         line:'B', baseCoat:1,    topCoat:5    },
    ];

    async function _seedUsageIfEmpty() {
        if (_usageStds().length > 0) return;
        for (const d of _DEFAULT_USAGE) {
            await Storage.add(USAGE_STORE, { ...d, note:'', updatedAt: new Date().toISOString() });
        }
    }

    function renderUsageTab() {
        const pane = document.getElementById('pmixPane_usage');
        if (!pane) return;
        const acts = document.getElementById('pmixPageActions');
        if (acts) acts.innerHTML = `
            <button class="btn btn-primary" onclick="PaintMixModule.openUsageModal()">
                <span class="material-symbols-outlined">add</span> 기준 등록
            </button>
`;

        pane.innerHTML = `
        <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:12px;">
            <div class="form-group">
                <label class="form-label">차종</label>
                <select class="form-select" id="pusCarFilter">
                    <option value="">전체</option>${_carOptions('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">라인</label>
                <select class="form-select" id="pusLineFilter">
                    <option value="">전체</option>
                    <option value="A">A라인</option>
                    <option value="B">B라인</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">제품명</label>
                <input type="text" class="form-input" id="pusPartFilter" placeholder="제품명 검색...">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="PaintMixModule.filterUsage()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        </div>
        <div class="card">
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" id="pusTable">
                        <thead>
                            <tr>
                                <th rowspan="2" style="text-align:center;vertical-align:middle;">차종</th>
                                <th rowspan="2" style="vertical-align:middle;">제품명</th>
                                <th rowspan="2" style="text-align:center;vertical-align:middle;">생산<br>라인</th>
                                <th colspan="2" style="text-align:center;background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
                                    개당 주제 도료 소요량 (g)
                                </th>
                                <th rowspan="2" style="vertical-align:middle;">비고</th>
                                <th rowspan="2" style="text-align:center;vertical-align:middle;">작업</th>
                            </tr>
                            <tr>
                                <th style="text-align:center;color:#dc2626;min-width:70px;">하도</th>
                                <th style="text-align:center;color:#16a34a;min-width:70px;">상도</th>
                            </tr>
                        </thead>
                        <tbody id="pusBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        _seedUsageIfEmpty().then(() => filterUsage());
    }

    function filterUsage() {
        const car  = document.getElementById('pusCarFilter')?.value  || '';
        const line = document.getElementById('pusLineFilter')?.value || '';
        const part = (document.getElementById('pusPartFilter')?.value || '').trim().toLowerCase();
        const rows = _usageStds()
            .filter(r => !car  || r.carModel === car)
            .filter(r => !line || r.line     === line)
            .filter(r => !part || (r.partName||'').toLowerCase().includes(part))
            .sort((a,b) => {
                const ORDER = ['GOLF-7','A3','Q2','A3 PA','A8','XFD','J34A','T1XX','C223','FORD','C300'];
                const ia = ORDER.indexOf(a.carModel), ib = ORDER.indexOf(b.carModel);
                const ca = ia >= 0 ? ia : 999, cb = ib >= 0 ? ib : 999;
                if (ca !== cb) return ca - cb;
                return (a.partName||'').localeCompare(b.partName||'', 'ko');
            });
        const tbody = document.getElementById('pusBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">
                등록된 사용량 기준이 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="PaintMixModule.openUsageModal()">
                    <span class="material-symbols-outlined">add</span> 첫 기준 등록
                </button></td></tr>`;
            return;
        }
        /* 차종 rowspan 계산 */
        const spanMap = {};
        let curCar = null, curSpan = 0, startIdx = 0;
        rows.forEach((r, i) => {
            if (r.carModel !== curCar) {
                if (curCar !== null) spanMap[startIdx] = curSpan;
                curCar = r.carModel; curSpan = 1; startIdx = i;
            } else { curSpan++; }
        });
        if (curCar !== null) spanMap[startIdx] = curSpan;

        const _fmtVal = v => (v === null || v === undefined || v === '')
            ? `<span style="color:var(--text-muted);">-</span>`
            : `<strong>${v}</strong>`;

        tbody.innerHTML = rows.map((r, i) => {
            const carCell = spanMap.hasOwnProperty(i)
                ? `<td rowspan="${spanMap[i]}" style="font-weight:700;vertical-align:middle;text-align:center;background:var(--bg-secondary);border-right:2px solid var(--border-color);">${_esc(r.carModel)}</td>`
                : '';
            const lineBadge = r.line === 'A'
                ? `<span class="badge badge-blue"  style="font-size:0.78rem;">A</span>`
                : r.line === 'B'
                ? `<span class="badge badge-green" style="font-size:0.78rem;">B</span>`
                : `<span style="color:var(--text-muted);">-</span>`;
            return `<tr>
                ${carCell}
                <td><strong>${_esc(r.partName)}</strong></td>
                <td style="text-align:center;">${lineBadge}</td>
                <td style="text-align:center;color:#dc2626;font-weight:600;">${_fmtVal(r.baseCoat)}</td>
                <td style="text-align:center;color:#16a34a;font-weight:600;">${_fmtVal(r.topCoat)}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${_esc(r.note||'')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="PaintMixModule.openUsageModal('${_js(r.id)}')">수정</button>
                    <button class="btn btn-sm btn-danger"  onclick="PaintMixModule.removeUsage('${_js(r.id)}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    function openUsageModal(id) {
        const r = id ? (_usageStds().find(x => x.id === id) || {}) : {};
        const isEdit = !!id;
        UIUtils.showModal(isEdit ? '사용량 기준 수정' : '도료 사용량 기준 등록', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
                <label class="form-label">차종 <span style="color:var(--danger)">*</span></label>
                <select class="form-select" id="pusM_car">
                    <option value="">선택</option>${_carOptions(r.carModel||'')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">제품명 <span style="color:var(--danger)">*</span></label>
                <input type="text" class="form-input" id="pusM_part" value="${_esc(r.partName||'')}"
                    placeholder="예) KNOB, PAO COVER">
            </div>
            <div class="form-group">
                <label class="form-label">생산 라인 <span style="color:var(--danger)">*</span></label>
                <select class="form-select" id="pusM_line">
                    <option value="">선택</option>
                    <option value="A" ${r.line==='A'?'selected':''}>A라인</option>
                    <option value="B" ${r.line==='B'?'selected':''}>B라인</option>
                </select>
            </div>
            <div class="form-group"></div>
            <div class="form-group">
                <label class="form-label" style="color:#dc2626;font-weight:600;">
                    하도 소요량 (g)
                </label>
                <input type="number" class="form-input" id="pusM_base"
                    value="${r.baseCoat ?? ''}" step="0.01" min="0" placeholder="없으면 비워두세요">
            </div>
            <div class="form-group">
                <label class="form-label" style="color:#16a34a;font-weight:600;">
                    상도 소요량 (g)
                </label>
                <input type="number" class="form-input" id="pusM_top"
                    value="${r.topCoat ?? ''}" step="0.01" min="0" placeholder="없으면 비워두세요">
            </div>
            <div class="form-group" style="grid-column:span 2;">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="pusM_note" value="${_esc(r.note||'')}">
            </div>
        </div>`,
        `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
         <button class="btn btn-primary"   onclick="PaintMixModule.saveUsage(${isEdit?`'${_js(id)}'`:'null'})">
             ${isEdit?'저장':'등록'}
         </button>`);
    }

    function saveUsage(id) {
        const carModel = document.getElementById('pusM_car')?.value    || '';
        const partName = document.getElementById('pusM_part')?.value.trim() || '';
        const line     = document.getElementById('pusM_line')?.value   || '';
        const baseRaw  = document.getElementById('pusM_base')?.value;
        const topRaw   = document.getElementById('pusM_top')?.value;
        const note     = document.getElementById('pusM_note')?.value.trim() || '';
        if (!carModel || !partName || !line) {
            UIUtils.toast('차종 · 제품명 · 라인은 필수입니다.', 'error'); return;
        }
        const baseCoat = (baseRaw !== '' && baseRaw != null) ? parseFloat(baseRaw) : null;
        const topCoat  = (topRaw  !== '' && topRaw  != null) ? parseFloat(topRaw)  : null;
        const rec = { carModel, partName, line, baseCoat, topCoat, note, updatedAt: new Date().toISOString() };
        if (id) Storage.update(USAGE_STORE, { ...rec, id });
        else    Storage.add(USAGE_STORE, rec);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
        filterUsage();
    }

    function removeUsage(id) {
        UIUtils.confirm('이 사용량 기준을 삭제할까요?', () => {
            Storage.remove(USAGE_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            filterUsage();
        });
    }

    function exportUsage() {
        const rows = _usageStds().map(r => [
            r.carModel, r.partName, r.line||'',
            r.baseCoat ?? '', r.topCoat ?? '', r.note||''
        ]);
        Storage.exportToCSV(['차종','제품명','라인','하도(g)','상도(g)','비고'], rows, '도료사용량기준표');
    }

    /* ══════════════════════════════════════════════════════
       TAB 2 ── 배합기준표  (A라인 도료 배합 작업 기준서 구조)
       데이터 구조: { carModel, partName, line, primers:[], colors:[] }
    ══════════════════════════════════════════════════════ */
    function _mixStds() { return Storage.getAll(MIX_STD_STORE) || []; }

    /* ── A라인 기본 데이터 (최초 1회 자동 시딩) ── */
    const _DEFAULT_FORMULAS = [
      { line:'A', carModel:'A3(PA)', partName:'Knob 공용 / PAO Cover / E-CALL cover',
        primers:[{ note:'', company:'Noroo', paint:'NAL#100 차폐 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'-', hardenerRatio:'', hardenerTol:'', thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%', viscLow:'10.5', viscHigh:'12.0' }],
        colors:[
          { company:'Noroo', paint:'NAU-700 6PS',       paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'15%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'80%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' },
          { company:'Noroo', paint:'NAU-700 AZ3',       paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'15%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'70%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' },
        ]
      },
      { line:'A', carModel:'GOLF7', partName:'Knob 공용',
        primers:[{ note:'', company:'Noroo', paint:'NAL#100 차폐 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'-', hardenerRatio:'', hardenerTol:'', thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%', viscLow:'10.5', viscHigh:'12.0' }],
        colors:[
          { company:'Noroo', paint:'NAU-700 WHI',       paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'15%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'70%', thinnerTol:'±10%', viscLow:'11.0', viscHigh:'12.0' },
          { company:'노루비', paint:'NAU-700 DYS',      paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'15%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'70%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' },
          { company:'안양',   paint:'NAU-700 GRAY(XFD)',paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'12%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' },
        ]
      },
      { line:'A', carModel:'XFD', partName:'1 Spot / 3 Spot',
        primers:[{ note:'1액형 프라이머 (1K one-component primer)', company:'Noroo', paint:'NAL#100 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'-', hardenerRatio:'', hardenerTol:'', thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%', viscLow:'10.5', viscHigh:'12.0' }],
        colors:[
          { company:'Noroo', paint:'UTS78(A)(F)-BLACK(XFD)',      paintRatio:'100%', paintTol:'±5%', hardener:'958(HMC) C.A', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KCD희석제', thinnerRatio:'60%', thinnerTol:'±10%', viscLow:'지건&표준', viscHigh:'11.0' },
          { company:'KCC',   paint:'UTS578(A)(F)-GREY(J71E75)',   paintRatio:'100%', paintTol:'±5%', hardener:'958(HMC) C.A', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KCD희석제', thinnerRatio:'표준',  thinnerTol:'',     viscLow:'표준',     viscHigh:'11.0' },
          { company:'KCC',   paint:'UTS578(A)(F)-BLACK(J71E02)',  paintRatio:'100%', paintTol:'±5%', hardener:'958(HMC) C.A', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KCD희석제', thinnerRatio:'표준',  thinnerTol:'',     viscLow:'표준',     viscHigh:'11.0' },
        ]
      },
      { line:'A', carModel:'J34A', partName:'Knob 공용',
        primers:[{ note:'', company:'Noroo', paint:'NAL#100 차폐 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'-', hardenerRatio:'', hardenerTol:'', thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%', viscLow:'표준', viscHigh:'표준' }],
        colors:[]
      },
      { line:'A', carModel:'T1XX', partName:'Lens 하단',
        primers:[],
        colors:[{ company:'PPG', paint:'SHIELDING BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'XPH800002', hardenerRatio:'10%', hardenerTol:'±2%', thinner:'KR-RUT-080', thinnerRatio:'60%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'T1XX', partName:'P-Button',
        primers:[],
        colors:[{ company:'Noroo', paint:'DAU#자폐 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'DH-230 경화제', hardenerRatio:'10%', hardenerTol:'±2%', thinner:'DR-705 신나', thinnerRatio:'70%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'T1XX', partName:'LOWER UMBRELLA cover side / Emblem',
        primers:[{ note:'', company:'ppg', paint:'MY#200 PRIMER BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'KR-RUH-1252', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }],
        colors:[{ company:'Noroo', paint:'S/T LT JET BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'KR-RUH-1464', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'T1XX', partName:'COVER SIDE',
        primers:[{ note:'', company:'ppg', paint:'MY#200 PRIMER BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'KR-RUH-1252', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }],
        colors:[{ company:'Noroo', paint:'S/T LT JET BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'KR-RUH-1464', hardenerRatio:'11%', hardenerTol:'±2%', thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'P702', partName:'M-Button',
        primers:[{ note:'', company:'Noroo', paint:'NUH#1100 base white', paintRatio:'100%', paintTol:'±5%', hardener:'DH-230', hardenerRatio:'10%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'표준', viscHigh:'표준' }],
        colors:[{ company:'Noroo', paint:'NAU-700 B/K', paintRatio:'100%', paintTol:'±5%', hardener:'DH 우레탄 경화제(230)', hardenerRatio:'15%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'80%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'P702', partName:'LENS',
        primers:[{ note:'', company:'Noroo', paint:'NUH#1100 base white', paintRatio:'100%', paintTol:'±5%', hardener:'DH-230', hardenerRatio:'10%', hardenerTol:'±2%', thinner:'DR-705', thinnerRatio:'50%', thinnerTol:'±10%', viscLow:'표준', viscHigh:'표준' }],
        colors:[{ company:'Noroo', paint:'DAU#자폐 BASE BLACK', paintRatio:'100%', paintTol:'±5%', hardener:'DH-230 경화제', hardenerRatio:'10%', hardenerTol:'±2%', thinner:'DR-705 신나', thinnerRatio:'70%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' }]
      },
      { line:'A', carModel:'리비안', partName:'OTR TRIM BREAK UP GARNISH CAP-2ND,LH 외',
        primers:[
          { note:'', company:'유림특수화학', paint:'TBDK-00003', paintRatio:'100%', paintTol:'±20%', hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%', thinner:'SOL-04127', thinnerRatio:'15%', thinnerTol:'±10%', viscLow:'표준', viscHigh:'표준' },
          { note:'', company:'유림특수화학', paint:'TBDN00001',  paintRatio:'100%', paintTol:'±20%', hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%', thinner:'SOL-04127', thinnerRatio:'15%', thinnerTol:'±10%', viscLow:'10.0', viscHigh:'11.0' },
        ],
        colors:[
          { company:'유림특수', paint:'TTMK-00006(GB칼라)', paintRatio:'100%', paintTol:'±5%', hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%', thinner:'SOL-04127', thinnerRatio:'55%', thinnerTol:'±5%', viscLow:'10.0', viscHigh:'12.0' },
          { company:'수화학',   paint:'TTMN00003(BB칼라)', paintRatio:'100%', paintTol:'±5%', hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%', thinner:'SOL-04127', thinnerRatio:'60%', thinnerTol:'±5%', viscLow:'10.0', viscHigh:'12.0' },
        ]
      },
    ];

    /* ── B라인 기본 데이터 (최초 1회 자동 시딩) ── */
    const _DEFAULT_FORMULAS_B = [
      /* A3 / E-Call Cover */
      { line:'B', carModel:'A3', partName:'E-Call Cover',
        primers:[{ note:'1액형 프라이머 1K (one-component) primer',
          company:'Noroo', paint:'NAL#100 차폐', paintRatio:'100%', paintTol:'±5%',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[
          { company:'Noroo', paint:'NAU-700 6PS', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-230', hardenerRatio:'15%', hardenerTol:'±2%',
            thinner:'DR-705', thinnerRatio:'80%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
          { company:'Noroo', paint:'NAU-700 AZ3', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-230', hardenerRatio:'15%', hardenerTol:'±2%',
            thinner:'DR-705', thinnerRatio:'60%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
        ]
      },
      /* Q2 / E-Call Cover */
      { line:'B', carModel:'Q2', partName:'E-Call Cover',
        primers:[{ note:'1액형 프라이머 1K (one-component) primer',
          company:'Noroo', paint:'NAL#100 차폐', paintRatio:'100%', paintTol:'±5%',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'DR-705', thinnerRatio:'100%', thinnerTol:'±10%',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[
          { company:'Noroo', paint:'NAU-700 ET1', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-230', hardenerRatio:'15%', hardenerTol:'±2%',
            thinner:'DR-705', thinnerRatio:'70%', thinnerTol:'±5%',
            viscLow:'지건&표준', viscHigh:'표준' },
          { company:'Noroo', paint:'NAU-700 BC5', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-230', hardenerRatio:'15%', hardenerTol:'±2%',
            thinner:'DR-705', thinnerRatio:'60%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
        ]
      },
      /* A8 / Bezel */
      { line:'B', carModel:'A8', partName:'Bezel',
        primers:[],
        colors:[
          { company:'Noroo', paint:'DR-247 Silver', paintRatio:'100%', paintTol:'±5%',
            hardener:'DB경화제(BTX-FREE)', hardenerRatio:'20%', hardenerTol:'±2%',
            thinner:'T-911', thinnerRatio:'100%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
        ]
      },
      /* A8 / Housing Upper Case Lower Case */
      { line:'B', carModel:'A8', partName:'Housing Upper Case Lower Case',
        primers:[],
        colors:[
          { company:'KCC', paint:'UT578(A)(f) 1PH', paintRatio:'100%', paintTol:'±5%',
            hardener:'958(HMC)CA', hardenerRatio:'11%', hardenerTol:'±2%',
            thinner:'KCD희석제', thinnerRatio:'50%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
          { company:'KCC', paint:'UT578(A)(f) 1KF', paintRatio:'100%', paintTol:'±5%',
            hardener:'958(HMC)CA', hardenerRatio:'11%', hardenerTol:'±2%',
            thinner:'KCD희석제', thinnerRatio:'50%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
          { company:'Noroo', paint:'NAU-700 6PS', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-230', hardenerRatio:'10%', hardenerTol:'±2%',
            thinner:'DR-705', thinnerRatio:'80%', thinnerTol:'±10%',
            viscLow:'지건&표준', viscHigh:'표준' },
        ]
      },
      /* T1XX / LENS 상단 */
      { line:'B', carModel:'T1XX', partName:'LENS 상단',
        primers:[{ note:'',
          company:'PPG', paint:'INTEC#100(BK)', paintRatio:'100%', paintTol:'±5%',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'KR-RUT-080F', thinnerRatio:'18%', thinnerTol:'-10%',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[
          { company:'kcc', paint:'KUT-1000(L) UV', paintRatio:'100%', paintTol:'',
            hardener:'', hardenerRatio:'', hardenerTol:'',
            thinner:'', thinnerRatio:'', thinnerTol:'',
            viscLow:'표준', viscHigh:'표준' },
        ]
      },
      /* T1XX / P-Button 상단 */
      { line:'B', carModel:'T1XX', partName:'P-Button 상단',
        primers:[{ note:'',
          company:'PPG', paint:'INTEC#100', paintRatio:'100%', paintTol:'±5%',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'KR-RUT-080F', thinnerRatio:'18%', thinnerTol:'-10%',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[
          { company:'Noroo', paint:'SY#6000', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-350(BTXF)', hardenerRatio:'50%', hardenerTol:'±2%',
            thinner:'600TD', thinnerRatio:'35%', thinnerTol:'±10%',
            viscLow:'10.0', viscHigh:'11.0' },
        ]
      },
      /* T1XX / IL-Button */
      { line:'B', carModel:'T1XX', partName:'IL-Button',
        primers:[{ note:'',
          company:'PPG', paint:'B/C PIANO BLACK', paintRatio:'100%', paintTol:'',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'080F(BTX-F)', thinnerRatio:'60%', thinnerTol:'±10%',
          viscLow:'10', viscHigh:'11' }],
        colors:[
          { company:'Noroo', paint:'SY#6000', paintRatio:'100%', paintTol:'±5%',
            hardener:'DH-350(BTXF)', hardenerRatio:'50%', hardenerTol:'±2%',
            thinner:'600TD', thinnerRatio:'35%', thinnerTol:'±10%',
            viscLow:'10.0', viscHigh:'11.0' },
        ]
      },
      /* T1XX / LOWER UMBRELLA cover side BEZEL */
      { line:'B', carModel:'T1XX', partName:'LOWER UMBRELLA cover side BEZEL',
        primers:[{ note:'',
          company:'ppg', paint:'MY#200 PRIMER BLACK', paintRatio:'100%', paintTol:'±5%',
          hardener:'KR-RUH-1252', hardenerRatio:'11%', hardenerTol:'±2%',
          thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%',
          viscLow:'10.0', viscHigh:'11.0' }],
        colors:[
          { company:'ppg', paint:'S/T LT JET BLACK', paintRatio:'100%', paintTol:'±5%',
            hardener:'KR-RUH-1464', hardenerRatio:'11%', hardenerTol:'±2%',
            thinner:'DR-570희석제(BTX-FREE)', thinnerRatio:'50%', thinnerTol:'±10%',
            viscLow:'10.0', viscHigh:'11.0' },
        ]
      },
      /* T1XX / DECO#1 */
      { line:'B', carModel:'T1XX', partName:'DECO#1',
        primers:[],
        colors:[{ company:'Noroo KC', paint:'NUH3000 CR-CLEAR', paintRatio:'100%', paintTol:'',
          hardener:'NL-S00(KC)', hardenerRatio:'20%', hardenerTol:'',
          thinner:'DR-570 (PC)', thinnerRatio:'50~60%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* T1XX / DECO#2 */
      { line:'B', carModel:'T1XX', partName:'DECO#2',
        primers:[],
        colors:[{ company:'Noroo KC', paint:'NUH3000 CR-CLEAR', paintRatio:'100%', paintTol:'',
          hardener:'NL-S00(KC)', hardenerRatio:'20%', hardenerTol:'',
          thinner:'DR-570 (PC)', thinnerRatio:'50~60%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* T1XX / DECO#3 */
      { line:'B', carModel:'T1XX', partName:'DECO#3',
        primers:[],
        colors:[{ company:'Noroo KC', paint:'NUH3000 CR-CLEAR', paintRatio:'100%', paintTol:'',
          hardener:'NL-S00(KC)', hardenerRatio:'20%', hardenerTol:'',
          thinner:'DR-570 (PC)', thinnerRatio:'50~60%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* T1XX / LINER */
      { line:'B', carModel:'T1XX', partName:'LINER',
        primers:[],
        colors:[{ company:'Noroo KC', paint:'NUH3000 CR-CLEAR', paintRatio:'100%', paintTol:'',
          hardener:'NL-S00(KC)', hardenerRatio:'20%', hardenerTol:'',
          thinner:'DR-570 (PC)', thinnerRatio:'50~60%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* EMBLEM / RS */
      { line:'B', carModel:'EMBLEM', partName:'RS',
        primers:[],
        colors:[{ company:'Origin', paint:'716D TX LS KAI', paintRatio:'100%', paintTol:'',
          hardener:'ECOZ', hardenerRatio:'12.5%', hardenerTol:'',
          thinner:'ECOZ #55', thinnerRatio:'50~150%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* EMBLEM / GMC CHEVY */
      { line:'B', carModel:'EMBLEM', partName:'GMC CHEVY',
        primers:[{ note:'',
          company:'PPG', paint:'MY#200 PRIMER BLACK', paintRatio:'100%', paintTol:'',
          hardener:'KR-RUH-1252', hardenerRatio:'12.5%', hardenerTol:'',
          thinner:'KR-RUT-080', thinnerRatio:'50%', thinnerTol:'±10%',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[{ company:'PPG', paint:'ZET BLACK', paintRatio:'100%', paintTol:'',
          hardener:'KR-RUH-1464', hardenerRatio:'20%', hardenerTol:'',
          thinner:'KR-RUT-080', thinnerRatio:'40%', thinnerTol:'±10%',
          viscLow:'11.0', viscHigh:'12.0' }]
      },
      /* P702 / LENS */
      { line:'B', carModel:'P702', partName:'LENS',
        primers:[{ note:'',
          company:'PPG', paint:'INTEC#100', paintRatio:'100%', paintTol:'±5%',
          hardener:'-', hardenerRatio:'', hardenerTol:'',
          thinner:'KR-RUT-080F', thinnerRatio:'', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }],
        colors:[{ company:'NOROO', paint:'SY#6000', paintRatio:'100%', paintTol:'±5%',
          hardener:'DH-350(BTXF)', hardenerRatio:'50%', hardenerTol:'±2%',
          thinner:'600TD', thinnerRatio:'35%', thinnerTol:'±10%',
          viscLow:'지건&표준', viscHigh:'표준' }]
      },
      /* C223 / CTR/OTR */
      { line:'B', carModel:'C223', partName:'CTR/OTR', primers:[], colors:[] },
      /* C223 / X-VANE */
      { line:'B', carModel:'C223', partName:'X-VANE',
        primers:[],
        colors:[{ company:'Origin', paint:'7890 SR KR-2', paintRatio:'100%', paintTol:'±5%',
          hardener:'ECOZ2', hardenerRatio:'12.5%', hardenerTol:'±2%',
          thinner:'ECOZ #55', thinnerRatio:'70%', thinnerTol:'±10%',
          viscLow:'10.0', viscHigh:'표준' }]
      },
      /* C223 / DECO HOR */
      { line:'B', carModel:'C223', partName:'DECO HOR', primers:[], colors:[] },
      /* C223 / VANE LH/RH */
      { line:'B', carModel:'C223', partName:'VANE LH/RH',
        primers:[],
        colors:[{ company:'Noroo KC', paint:'NUH3000 CR-CLEAR', paintRatio:'100%', paintTol:'',
          hardener:'NL-500(KC)', hardenerRatio:'20%', hardenerTol:'',
          thinner:'DR-570 (PC)', thinnerRatio:'45~50%', thinnerTol:'',
          viscLow:'표준', viscHigh:'표준' }]
      },
      /* 리비안 / TRIM BREAK UP GARNISH FR ASSY FR BACK 외 3종 */
      { line:'B', carModel:'리비안', partName:'TRIM BREAK UP GARNISH FR ASSY FR BACK 외 3종',
        primers:[
          { note:'', company:'유림특수화학', paint:'TBDK-00003', paintRatio:'100%', paintTol:'±20%',
            hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%',
            thinner:'SOL-04127', thinnerRatio:'15%', thinnerTol:'±5%',
            viscLow:'10.0', viscHigh:'11.0' },
          { note:'', company:'수화학', paint:'TBDN00001', paintRatio:'100%', paintTol:'',
            hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%',
            thinner:'SOL-04127', thinnerRatio:'15%', thinnerTol:'±5%',
            viscLow:'표준', viscHigh:'표준' },
        ],
        colors:[
          { company:'유림특수', paint:'TTMK-00006(GB칼라)', paintRatio:'100%', paintTol:'±5%',
            hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%',
            thinner:'SOL-04127', thinnerRatio:'75%', thinnerTol:'±5%',
            viscLow:'10.0', viscHigh:'12.0' },
          { company:'수화학', paint:'TTMN00003(BB칼라)', paintRatio:'100%', paintTol:'',
            hardener:'HAR-08100', hardenerRatio:'20%', hardenerTol:'±2%',
            thinner:'SOL-04127', thinnerRatio:'75%', thinnerTol:'±5%',
            viscLow:'표준', viscHigh:'표준' },
        ]
      },
    ];

    async function _seedFormulaIfEmpty() {
      const existing = _mixStds();
      if (!existing.some(r => r.line === 'A')) {
        for (const d of _DEFAULT_FORMULAS)
          await Storage.add(MIX_STD_STORE, { ...d, updatedAt: new Date().toISOString() });
      }
      if (!existing.some(r => r.line === 'B')) {
        for (const d of _DEFAULT_FORMULAS_B)
          await Storage.add(MIX_STD_STORE, { ...d, updatedAt: new Date().toISOString() });
      }
    }

    /* 모달 내 동적 행 임시 상태 */
    let _editPrimers      = [];
    let _editColors       = [];
    let _editProductNames = [];   /* 이 기준이 적용되는 DB 제품 partName 목록 */

    /* ── 표시용 헬퍼 ── */
    function _fmtPaint(name, ratio, tol) {
        if (!name) return '<span style="color:var(--text-muted);">-</span>';
        let s = _esc(name);
        if (ratio) {
            s += `<br><small style="color:var(--accent-blue);font-weight:600;">${_esc(ratio)}`;
            if (tol) s += ` <span style="color:var(--text-muted);font-weight:400;">(${_esc(tol)})</span>`;
            s += '</small>';
        }
        return s;
    }
    function _fmtVisc(low, high) {
        if (!low && !high) return '<span style="color:var(--text-muted);">-</span>';
        if (!high || low === high) return `<strong>${_esc(String(low||high))}</strong>`;
        return `<strong>${_esc(String(low))}~${_esc(String(high))}</strong>`;
    }
    function _primerRowHtml(p) {
        if (!p) return '<td></td><td></td><td></td><td></td><td></td><td></td>';
        return `<td style="font-size:0.74rem;color:var(--text-muted);padding:4px 6px;">${_esc(p.note||'')}</td>
        <td style="text-align:center;font-weight:600;padding:4px 6px;">${_esc(p.company||'-')}</td>
        <td style="padding:4px 6px;">${_fmtPaint(p.paint, p.paintRatio, p.paintTol)}</td>
        <td style="padding:4px 6px;">${_fmtPaint(p.hardener, p.hardenerRatio, p.hardenerTol)}</td>
        <td style="padding:4px 6px;">${_fmtPaint(p.thinner, p.thinnerRatio, p.thinnerTol)}</td>
        <td style="text-align:center;padding:4px 6px;">${_fmtVisc(p.viscLow, p.viscHigh)}</td>`;
    }
    function _colorRowHtml(c) {
        if (!c) return '<td></td><td></td><td></td><td></td><td></td>';
        return `<td style="text-align:center;font-weight:600;padding:4px 6px;">${_esc(c.company||'-')}</td>
        <td style="padding:4px 6px;">${_fmtPaint(c.paint, c.paintRatio, c.paintTol)}</td>
        <td style="padding:4px 6px;">${_fmtPaint(c.hardener, c.hardenerRatio, c.hardenerTol)}</td>
        <td style="padding:4px 6px;">${_fmtPaint(c.thinner, c.thinnerRatio, c.thinnerTol)}</td>
        <td style="text-align:center;padding:4px 6px;">${_fmtVisc(c.viscLow, c.viscHigh)}</td>`;
    }

    function renderFormulaTab() {
        const pane = document.getElementById('pmixPane_formula');
        if (!pane) return;
        const acts = document.getElementById('pmixPageActions');
        if (acts) acts.innerHTML = `
            <button class="btn btn-primary" onclick="PaintMixModule.openFormulaModal()">
                <span class="material-symbols-outlined">add</span> 기준 등록
            </button>
`;

        pane.innerHTML = `
        <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:12px;">
            <div class="form-group">
                <label class="form-label">라인</label>
                <select class="form-select" id="pfsLineFilter" style="min-width:90px;">
                    <option value="">전체</option>
                    <option value="A">A라인</option>
                    <option value="B">B라인</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">차종</label>
                <select class="form-select" id="pfsCarFilter" onchange="PaintMixModule.onFormulaCarChange()">
                    <option value="">전체</option>${_carOptions('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">제품 선택</label>
                <select class="form-select" id="pfsPartFilter" style="min-width:180px;">
                    <option value="">전체 제품</option>
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="PaintMixModule.filterFormula()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        </div>
        <div class="card">
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper" style="overflow-x:auto;">
                    <table class="data-table" id="pfsTable"
                           style="min-width:1060px;font-size:0.81rem;border-collapse:collapse;border:1px solid var(--border-color);">
                        <colgroup>
                            <col style="width:42px">   <!-- 라인 -->
                            <col style="width:65px">   <!-- 차종 -->
                            <col style="width:110px">  <!-- 제품명 -->
                            <col style="width:130px">  <!-- P-주제 -->
                            <col style="width:90px">   <!-- P-경화제 -->
                            <col style="width:85px">   <!-- P-신너 -->
                            <col style="width:65px">   <!-- P-점도 -->
                            <col style="width:130px">  <!-- C-주제 -->
                            <col style="width:90px">   <!-- C-경화제 -->
                            <col style="width:85px">   <!-- C-신너 -->
                            <col style="width:65px">   <!-- C-점도 -->
                            <col style="width:88px">   <!-- 작업 -->
                        </colgroup>
                        <thead>
                            <tr>
                                <th rowspan="2" style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:6px 4px;text-align:center;vertical-align:middle;">라인</th>
                                <th rowspan="2" style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:6px 6px;vertical-align:middle;">차종</th>
                                <th rowspan="2" style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:6px 6px;vertical-align:middle;">제품명</th>
                                <th colspan="4" style="background:var(--bg-tertiary);color:#b45309;font-weight:700;border:1px solid var(--border-color);border-left:3px solid #d97706;padding:5px 8px;text-align:center;">▶ PRIMER (하도)</th>
                                <th colspan="4" style="background:var(--bg-tertiary);color:#166534;font-weight:700;border:1px solid var(--border-color);border-left:3px solid #16a34a;padding:5px 8px;text-align:center;">▶ COLOR (상도)</th>
                                <th rowspan="2" style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:6px 4px;text-align:center;vertical-align:middle;">작업</th>
                            </tr>
                            <tr>
                                <th style="background:var(--bg-tertiary);color:#92400e;border:1px solid var(--border-color);border-left:3px solid #d97706;padding:4px 6px;font-size:0.74rem;font-weight:600;">주제</th>
                                <th style="background:var(--bg-tertiary);color:#92400e;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">경화제</th>
                                <th style="background:var(--bg-tertiary);color:#92400e;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">신너</th>
                                <th style="background:var(--bg-tertiary);color:#92400e;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">점도</th>
                                <th style="background:var(--bg-tertiary);color:#166534;border:1px solid var(--border-color);border-left:3px solid #16a34a;padding:4px 6px;font-size:0.74rem;font-weight:600;">주제</th>
                                <th style="background:var(--bg-tertiary);color:#166534;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">경화제</th>
                                <th style="background:var(--bg-tertiary);color:#166534;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">신너</th>
                                <th style="background:var(--bg-tertiary);color:#166534;border:1px solid var(--border-color);padding:4px 6px;font-size:0.74rem;font-weight:600;">점도</th>
                            </tr>
                        </thead>
                        <tbody id="pfsBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        _seedFormulaIfEmpty().then(() => filterFormula());
    }

    /* 컴팩트 그룹 테이블 헬퍼 — 주제|경화제|신너|점도 열 정렬 */
    function _compactGroupHtml(items, isPrimer) {
        if (!items || !items.length) {
            return `<span style="color:var(--text-muted);font-size:0.78rem;">${isPrimer ? '없음 (1액형)' : '-'}</span>`;
        }
        const hdrBg  = isPrimer ? '#fef3c7' : '#dcfce7';
        const hdrClr = isPrimer ? '#92400e' : '#166534';
        const sepClr = isPrimer ? '#fcd34d' : '#86efac';
        const TH = `padding:2px 5px;font-size:0.70rem;font-weight:700;color:${hdrClr};`
                 + `background:${hdrBg};border-bottom:2px solid ${sepClr};white-space:nowrap;`;
        const TD = `padding:3px 5px;vertical-align:top;font-size:0.77rem;line-height:1.5;`;
        const dataRows = items.map((p, idx) => {
            const rowBg = idx % 2 === 1 ? `background:rgba(0,0,0,0.025);` : '';
            /* 주제 */
            let subj = '';
            if (p.company) subj += `<span style="color:var(--text-muted);font-size:0.70rem;">${_esc(p.company)} </span>`;
            subj += `<strong>${_esc(p.paint||'')}</strong>`;
            if (p.paintRatio) {
                subj += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.paintRatio)}`;
                if (p.paintTol) subj += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.paintTol)})</span>`;
                subj += '</span>';
            }
            /* 경화제 */
            let hard = (p.hardener && p.hardener !== '-')
                ? `<strong>${_esc(p.hardener)}</strong>` : `<span style="color:var(--text-muted);">-</span>`;
            if (p.hardener && p.hardener !== '-' && p.hardenerRatio) {
                hard += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.hardenerRatio)}`;
                if (p.hardenerTol) hard += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.hardenerTol)})</span>`;
                hard += '</span>';
            }
            /* 신너 */
            let thin = p.thinner
                ? `<strong>${_esc(p.thinner)}</strong>` : `<span style="color:var(--text-muted);">-</span>`;
            if (p.thinner && p.thinnerRatio) {
                thin += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.thinnerRatio)}`;
                if (p.thinnerTol) thin += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.thinnerTol)})</span>`;
                thin += '</span>';
            }
            /* 점도 */
            let visc = '<span style="color:var(--text-muted);">-</span>';
            if (p.viscLow || p.viscHigh) {
                const vs = (p.viscHigh && p.viscHigh !== p.viscLow)
                    ? `${_esc(String(p.viscLow||''))}~${_esc(String(p.viscHigh))}`
                    : _esc(String(p.viscLow || p.viscHigh));
                visc = `<strong style="color:#d97706;">${vs}</strong>`;
            }
            return `<tr style="${rowBg}">
                <td style="${TD}">${subj}</td>
                <td style="${TD}border-left:1px solid var(--border-color);">${hard}</td>
                <td style="${TD}border-left:1px solid var(--border-color);">${thin}</td>
                <td style="${TD}border-left:1px solid var(--border-color);white-space:nowrap;">${visc}</td>
            </tr>`;
        }).join('');
        return `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;table-layout:fixed;">
            <colgroup>
                <col style="width:40%"><col style="width:22%">
                <col style="width:22%"><col style="width:16%">
            </colgroup>
            <thead><tr>
                <th style="${TH}">주제</th>
                <th style="${TH}border-left:1px solid ${sepClr};">경화제</th>
                <th style="${TH}border-left:1px solid ${sepClr};">신너</th>
                <th style="${TH}border-left:1px solid ${sepClr};white-space:nowrap;">점도</th>
            </tr></thead>
            <tbody>${dataRows}</tbody>
        </table>`;
    }

    function filterFormula() {
        const line = document.getElementById('pfsLineFilter')?.value || '';
        const car  = document.getElementById('pfsCarFilter')?.value  || '';
        const selectedProduct = document.getElementById('pfsPartFilter')?.value || '';
        const CAR_ORDER = ['GOLF7','GOLF-7','A3','A3(PA)','Q2','A3 PA','A8','XFD','J34A','T1XX','DECO','EMBLEM','C223','FORD','P702','C300','리비안'];
        let rows = _mixStds()
            .filter(r => !line || r.line === line)
            .filter(r => !car  || r.carModel === car)
            .filter(r => {
                if (!selectedProduct) return true;
                /* productNames 배열 우선 일치, 없으면 partName 텍스트 포함 (하위호환) */
                const inLinked = (r.productNames || []).includes(selectedProduct);
                const inText   = (r.partName || '').toLowerCase().includes(selectedProduct.toLowerCase());
                return inLinked || inText;
            })
            .sort((a, b) => {
                const ai = CAR_ORDER.indexOf(a.carModel);
                const bi = CAR_ORDER.indexOf(b.carModel);
                if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
                return (a.partName||'').localeCompare(b.partName||'', 'ko');
            });
        const tbody = document.getElementById('pfsBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text-muted);">
                등록된 배합기준이 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="PaintMixModule.openFormulaModal()">
                    <span class="material-symbols-outlined">add</span> 첫 기준 등록
                </button></td></tr>`;
            return;
        }
        /* 차종 교대 음영 */
        const CAR_BG = ['#f8fafd', '#eef2f7'];
        const B  = 'border:1px solid var(--border-color);';
        const TD = `${B}padding:5px 7px;vertical-align:top;font-size:0.79rem;line-height:1.5;`;

        /* 단일 도료 항목 → 각 열 값 포맷 */
        const fmtSubj = p => {
            if (!p || !p.paint) return `<span style="color:var(--text-muted);">-</span>`;
            let s = '';
            if (p.company) s += `<span style="color:var(--text-muted);font-size:0.70rem;">${_esc(p.company)} </span>`;
            s += `<strong>${_esc(p.paint)}</strong>`;
            if (p.paintRatio) {
                s += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.paintRatio)}`;
                if (p.paintTol) s += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.paintTol)})</span>`;
                s += '</span>';
            }
            return s;
        };
        const fmtHard = p => {
            if (!p || !p.hardener || p.hardener === '-') return `<span style="color:var(--text-muted);">-</span>`;
            let s = `<strong>${_esc(p.hardener)}</strong>`;
            if (p.hardenerRatio) {
                s += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.hardenerRatio)}`;
                if (p.hardenerTol) s += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.hardenerTol)})</span>`;
                s += '</span>';
            }
            return s;
        };
        const fmtThin = p => {
            if (!p || !p.thinner) return `<span style="color:var(--text-muted);">-</span>`;
            let s = `<strong>${_esc(p.thinner)}</strong>`;
            if (p.thinnerRatio) {
                s += ` <span style="color:var(--accent-blue);font-size:0.72rem;font-weight:600;">${_esc(p.thinnerRatio)}`;
                if (p.thinnerTol) s += `<span style="color:var(--text-muted);font-weight:400;">(${_esc(p.thinnerTol)})</span>`;
                s += '</span>';
            }
            return s;
        };
        const fmtVisc = p => {
            if (!p || (!p.viscLow && !p.viscHigh)) return `<span style="color:var(--text-muted);">-</span>`;
            const vs = (p.viscHigh && p.viscHigh !== p.viscLow)
                ? `${_esc(String(p.viscLow||''))}~${_esc(String(p.viscHigh))}`
                : _esc(String(p.viscLow || p.viscHigh));
            return `<strong style="color:#d97706;">${vs}</strong>`;
        };

        /* 행 렌더링 전 검증 데이터 일괄 로드 (행마다 재조회 방지) */
        const _vMats    = Storage.getAll(PAINT_MAT_STORE) || [];
        const _vQuality = Storage.getAll(DB.STORES.PROD_QUALITY_CHECK) || [];

        let prevCar = null, carIdx = -1;
        tbody.innerHTML = rows.map(r => {
            if (r.carModel !== prevCar) { carIdx++; prevCar = r.carModel; }
            const bg = CAR_BG[carIdx % 2];
            const S  = `background:${bg};`;   /* 공통 배경 */
            const primers = r.primers || [];
            const colors  = r.colors  || [];
            const N = Math.max(primers.length || 1, colors.length || 1);

            /* ── 행별 검증 상태 (미니 표시용) ── */
            const _paintNames = [
                ...(r.primers||[]).flatMap(p => [p.paint, p.hardener !== '-' ? p.hardener : null, p.thinner].filter(Boolean)),
                ...(r.colors ||[]).flatMap(c => [c.paint, c.hardener !== '-' ? c.hardener : null, c.thinner].filter(Boolean))
            ];
            const _matchedCnt = _paintNames.filter(nm =>
                _vMats.some(m => m.name && (
                    m.name.toLowerCase() === nm.toLowerCase() ||
                    nm.toLowerCase().includes(m.name.toLowerCase()) ||
                    m.name.toLowerCase().includes(nm.toLowerCase())
                ))
            ).length;
            const _paintSt = _paintNames.length === 0 ? 'none'
                           : _matchedCnt === _paintNames.length ? 'ok'
                           : _matchedCnt > 0 ? 'partial' : 'fail';
            const _tmplOk  = _vQuality.some(d => d._docKind === 'quality_template' && d.carModel === r.carModel);

            const _paintDot = _paintSt === 'ok'      ? `<span title="도료 전체 매칭" style="color:#16a34a;font-size:14px;">●</span>`
                            : _paintSt === 'partial'  ? `<span title="도료 일부 미매칭 (${_matchedCnt}/${_paintNames.length})" style="color:#f59e0b;font-size:14px;">●</span>`
                            : _paintSt === 'fail'     ? `<span title="도료 미매칭" style="color:#dc2626;font-size:14px;">●</span>`
                            : `<span title="도료 미입력" style="color:var(--border-color);font-size:14px;">●</span>`;
            const _tmplDot  = _tmplOk
                            ? `<span title="관리계획서 있음" style="color:#16a34a;font-size:12px;">■</span>`
                            : `<span title="관리계획서 없음" style="color:#dc2626;font-size:12px;">■</span>`;

            const lineBadge = r.line === 'A'
                ? `<span class="badge badge-blue"  style="font-size:0.78rem;">A</span>`
                : r.line === 'B'
                ? `<span class="badge badge-green" style="font-size:0.78rem;">B</span>`
                : `<span style="color:var(--text-muted);">-</span>`;

            const trList = [];
            for (let i = 0; i < N; i++) {
                const p   = primers[i] || null;
                const c   = colors[i]  || null;
                const isF = i === 0;
                const RS  = isF && N > 1 ? ` rowspan="${N}"` : '';
                let tr = '<tr>';
                /* ── 좌측 고정 셀 (첫 행만) ── */
                if (isF) {
                    tr += `<td${RS} style="${TD}${S}text-align:center;vertical-align:middle;">${lineBadge}</td>`;
                    tr += `<td${RS} style="${TD}${S}font-weight:700;vertical-align:middle;">${_esc(r.carModel)}</td>`;
                    tr += `<td${RS} style="${TD}${S}vertical-align:middle;line-height:1.4;">${_esc(r.partName)}</td>`;
                }
                /* ── PRIMER 4열 ── */
                if (primers.length === 0 && isF) {
                    tr += `<td colspan="4" style="${TD}${S}border-left:3px solid #d97706;color:var(--text-muted);font-size:0.78rem;vertical-align:middle;">없음 (1액형)</td>`;
                } else if (p) {
                    const BLP = i === 0 ? 'border-left:3px solid #d97706;' : '';
                    tr += `<td style="${TD}${S}${BLP}">${fmtSubj(p)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtHard(p)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtThin(p)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtVisc(p)}</td>`;
                } else {
                    tr += `<td colspan="4" style="${TD}${S}"></td>`;
                }
                /* ── COLOR 4열 ── */
                if (colors.length === 0 && isF) {
                    tr += `<td colspan="4" style="${TD}${S}border-left:3px solid #16a34a;color:var(--text-muted);font-size:0.78rem;vertical-align:middle;">-</td>`;
                } else if (c) {
                    const BLC = i === 0 ? 'border-left:3px solid #16a34a;' : '';
                    tr += `<td style="${TD}${S}${BLC}">${fmtSubj(c)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtHard(c)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtThin(c)}</td>`;
                    tr += `<td style="${TD}${S}">${fmtVisc(c)}</td>`;
                } else {
                    tr += `<td colspan="4" style="${TD}${S}"></td>`;
                }
                /* ── 우측 작업 버튼 (첫 행만) ── */
                if (isF) {
                    tr += `<td${RS} style="${TD}${S}text-align:center;vertical-align:middle;white-space:nowrap;min-width:100px;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:4px;" title="도료매칭 | 관리계획서">
                            ${_paintDot}${_tmplDot}
                        </div>
                        <button class="btn btn-sm btn-outline" style="font-size:0.74rem;padding:2px 7px;" onclick="PaintMixModule.showFormulaValidation('${_js(r.id)}')">검증</button><br>
                        <button class="btn btn-sm btn-outline" style="margin-top:3px;" onclick="PaintMixModule.openFormulaModal('${_js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger"  onclick="PaintMixModule.removeFormula('${_js(r.id)}')">삭제</button>
                    </td>`;
                }
                tr += '</tr>';
                trList.push(tr);
            }
            return trList.join('');
        }).join('');
    }

    /* ── 모달 내 동적 행 입력 ── */
    function _primerRowInput(p, idx) {
        p = p || {};
        const v = k => _esc(p[k] || '');
        return `<tr style="background:#fffdf0;">
            <td style="text-align:center;color:var(--text-muted);padding:3px 5px;font-size:0.75rem;">${idx+1}</td>
            <td style="padding:3px 4px;"><input type="text" class="form-input" id="pr_company_${idx}" value="${v('company')}" placeholder="메이커" style="width:70px;font-size:0.76rem;padding:3px 5px;"></td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="pr_paint_${idx}" value="${v('paint')}" placeholder="도료명" style="width:130px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_paintRatio_${idx}" value="${v('paintRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_paintTol_${idx}" value="${v('paintTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="pr_hardener_${idx}" value="${v('hardener')}" placeholder="경화제" style="width:130px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_hardenerRatio_${idx}" value="${v('hardenerRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_hardenerTol_${idx}" value="${v('hardenerTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="pr_thinner_${idx}" value="${v('thinner')}" placeholder="신너" style="width:110px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_thinnerRatio_${idx}" value="${v('thinnerRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="pr_thinnerTol_${idx}" value="${v('thinnerTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="pr_viscLow_${idx}" value="${v('viscLow')}" placeholder="하한" style="width:52px;font-size:0.76rem;padding:3px 5px;">
                    <span>~</span>
                    <input type="text" class="form-input" id="pr_viscHigh_${idx}" value="${v('viscHigh')}" placeholder="상한" style="width:52px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" onclick="PaintMixModule._delPrimerRow(${idx})" style="padding:2px 7px;">×</button>
            </td>
        </tr>`;
    }
    function _colorRowInput(c, idx) {
        c = c || {};
        const v = k => _esc(c[k] || '');
        return `<tr style="background:#f5fef7;">
            <td style="text-align:center;color:var(--text-muted);padding:3px 5px;font-size:0.75rem;">${idx+1}</td>
            <td style="padding:3px 4px;"><input type="text" class="form-input" id="co_company_${idx}" value="${v('company')}" placeholder="메이커" style="width:70px;font-size:0.76rem;padding:3px 5px;"></td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="co_paint_${idx}" value="${v('paint')}" placeholder="도료명" style="width:140px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_paintRatio_${idx}" value="${v('paintRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_paintTol_${idx}" value="${v('paintTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="co_hardener_${idx}" value="${v('hardener')}" placeholder="경화제" style="width:130px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_hardenerRatio_${idx}" value="${v('hardenerRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_hardenerTol_${idx}" value="${v('hardenerTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="co_thinner_${idx}" value="${v('thinner')}" placeholder="신너" style="width:110px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_thinnerRatio_${idx}" value="${v('thinnerRatio')}" placeholder="비율" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                    <input type="text" class="form-input" id="co_thinnerTol_${idx}" value="${v('thinnerTol')}" placeholder="허용차" style="width:55px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;">
                <div style="display:flex;gap:2px;align-items:center;">
                    <input type="text" class="form-input" id="co_viscLow_${idx}" value="${v('viscLow')}" placeholder="하한" style="width:52px;font-size:0.76rem;padding:3px 5px;">
                    <span>~</span>
                    <input type="text" class="form-input" id="co_viscHigh_${idx}" value="${v('viscHigh')}" placeholder="상한" style="width:52px;font-size:0.76rem;padding:3px 5px;">
                </div>
            </td>
            <td style="padding:3px 4px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" onclick="PaintMixModule._delColorRow(${idx})" style="padding:2px 7px;">×</button>
            </td>
        </tr>`;
    }

    function _renderPrimerRows() {
        const tb = document.getElementById('pfsPrimerRows');
        if (!tb) return;
        if (!_editPrimers.length) {
            tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:10px;font-size:0.82rem;">
                프라이머 없음 (1액형 또는 하도 미적용)</td></tr>`;
            return;
        }
        tb.innerHTML = _editPrimers.map((p, i) => _primerRowInput(p, i)).join('');
    }
    function _renderColorRows() {
        const tb = document.getElementById('pfsColorRows');
        if (!tb) return;
        if (!_editColors.length) {
            tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:10px;font-size:0.82rem;">
                컬러 없음</td></tr>`;
            return;
        }
        tb.innerHTML = _editColors.map((c, i) => _colorRowInput(c, i)).join('');
    }

    function _readPrimerRows() {
        const arr = [];
        let i = 0;
        while (document.getElementById(`pr_company_${i}`) !== null) {
            arr.push({
                note:          '',
                company:       document.getElementById(`pr_company_${i}`)?.value.trim()       || '',
                paint:         document.getElementById(`pr_paint_${i}`)?.value.trim()         || '',
                paintRatio:    document.getElementById(`pr_paintRatio_${i}`)?.value.trim()    || '',
                paintTol:      document.getElementById(`pr_paintTol_${i}`)?.value.trim()      || '',
                hardener:      document.getElementById(`pr_hardener_${i}`)?.value.trim()      || '',
                hardenerRatio: document.getElementById(`pr_hardenerRatio_${i}`)?.value.trim() || '',
                hardenerTol:   document.getElementById(`pr_hardenerTol_${i}`)?.value.trim()   || '',
                thinner:       document.getElementById(`pr_thinner_${i}`)?.value.trim()       || '',
                thinnerRatio:  document.getElementById(`pr_thinnerRatio_${i}`)?.value.trim()  || '',
                thinnerTol:    document.getElementById(`pr_thinnerTol_${i}`)?.value.trim()    || '',
                viscLow:       document.getElementById(`pr_viscLow_${i}`)?.value.trim()       || '',
                viscHigh:      document.getElementById(`pr_viscHigh_${i}`)?.value.trim()      || '',
            });
            i++;
        }
        _editPrimers = arr;
    }
    function _readColorRows() {
        const arr = [];
        let i = 0;
        while (document.getElementById(`co_company_${i}`) !== null) {
            arr.push({
                company:       document.getElementById(`co_company_${i}`)?.value.trim()       || '',
                paint:         document.getElementById(`co_paint_${i}`)?.value.trim()         || '',
                paintRatio:    document.getElementById(`co_paintRatio_${i}`)?.value.trim()    || '',
                paintTol:      document.getElementById(`co_paintTol_${i}`)?.value.trim()      || '',
                hardener:      document.getElementById(`co_hardener_${i}`)?.value.trim()      || '',
                hardenerRatio: document.getElementById(`co_hardenerRatio_${i}`)?.value.trim() || '',
                hardenerTol:   document.getElementById(`co_hardenerTol_${i}`)?.value.trim()   || '',
                thinner:       document.getElementById(`co_thinner_${i}`)?.value.trim()       || '',
                thinnerRatio:  document.getElementById(`co_thinnerRatio_${i}`)?.value.trim()  || '',
                thinnerTol:    document.getElementById(`co_thinnerTol_${i}`)?.value.trim()    || '',
                viscLow:       document.getElementById(`co_viscLow_${i}`)?.value.trim()       || '',
                viscHigh:      document.getElementById(`co_viscHigh_${i}`)?.value.trim()      || '',
            });
            i++;
        }
        _editColors = arr;
    }

    function _addPrimerRow() { _readPrimerRows(); _editPrimers.push({}); _renderPrimerRows(); }
    function _delPrimerRow(idx) { _readPrimerRows(); _editPrimers.splice(idx, 1); _renderPrimerRows(); }
    function _addColorRow()  { _readColorRows();  _editColors.push({});  _renderColorRows();  }
    function _delColorRow(idx)  { _readColorRows();  _editColors.splice(idx, 1);  _renderColorRows();  }

    function openFormulaModal(id) {
        const r = id ? (_mixStds().find(x => x.id === id) || {}) : {};
        const isEdit = !!id;
        _editPrimers      = (r.primers      || []).map(p => ({...p}));
        _editColors       = (r.colors       || []).map(c => ({...c}));
        _editProductNames = (r.productNames || []).slice();

        UIUtils.showModal(isEdit ? '배합기준 수정' : '배합기준 등록', `
        <div style="display:grid;grid-template-columns:100px 1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="form-group">
                <label class="form-label">라인 <span style="color:var(--danger)">*</span></label>
                <select class="form-select" id="pfsM_line">
                    <option value="">선택</option>
                    <option value="A" ${r.line==='A'?'selected':''}>A라인</option>
                    <option value="B" ${r.line==='B'?'selected':''}>B라인</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">차종 <span style="color:var(--danger)">*</span></label>
                <select class="form-select" id="pfsM_car" onchange="PaintMixModule._onFormulaModalCarChange()">
                    <option value="">선택</option>${_carOptions(r.carModel||'')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">배합기준 이름 <span style="color:var(--danger)">*</span></label>
                <input type="text" class="form-input" id="pfsM_part" value="${_esc(r.partName||'')}" placeholder="예) Knob 공용 / PAO Cover">
            </div>
        </div>

        <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:14px;background:var(--bg-secondary);">
            <div style="font-size:0.83rem;font-weight:700;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px;">link</span>
                적용 제품 연결
                <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem;">— 이 배합기준이 적용되는 제품을 선택하세요 (관리계획서 연동에 사용)</span>
            </div>
            <div id="pfsM_productList" style="display:flex;flex-wrap:wrap;gap:7px;min-height:28px;">
                ${r.carModel ? '' : '<span style="color:var(--text-muted);font-size:0.83rem;">차종을 먼저 선택하세요</span>'}
            </div>
        </div>

        <div style="background:#fffbeb;border:1px solid #d97706;border-radius:8px;padding:12px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <strong style="color:#92400e;font-size:0.88rem;">◎ PRIMER (하도)</strong>
                <button type="button" class="btn btn-sm btn-outline" style="border-color:#d97706;color:#92400e;padding:3px 10px;" onclick="PaintMixModule._addPrimerRow()">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">add</span> 행 추가
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                    <thead>
                        <tr style="background:#fef3c7;color:#92400e;">
                            <th style="padding:4px 5px;border:1px solid #fcd34d;width:28px;">No</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;min-width:75px;">메이커</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;min-width:250px;">도료명 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;min-width:250px;">경화제 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;min-width:235px;">희석신너 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;min-width:120px;">점도(초) 하한~상한</th>
                            <th style="padding:4px 5px;border:1px solid #fcd34d;width:38px;">삭제</th>
                        </tr>
                    </thead>
                    <tbody id="pfsPrimerRows"></tbody>
                </table>
            </div>
        </div>

        <div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;padding:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <strong style="color:#15803d;font-size:0.88rem;">◎ COLOR (상도)</strong>
                <button type="button" class="btn btn-sm btn-outline" style="border-color:#16a34a;color:#15803d;padding:3px 10px;" onclick="PaintMixModule._addColorRow()">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">add</span> 행 추가
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                    <thead>
                        <tr style="background:#dcfce7;color:#15803d;">
                            <th style="padding:4px 5px;border:1px solid #86efac;width:28px;">No</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;min-width:75px;">메이커</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;min-width:260px;">도료명 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;min-width:250px;">경화제 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;min-width:235px;">희석신너 / 비율 / 허용차</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;min-width:120px;">점도(초) 하한~상한</th>
                            <th style="padding:4px 5px;border:1px solid #86efac;width:38px;">삭제</th>
                        </tr>
                    </thead>
                    <tbody id="pfsColorRows"></tbody>
                </table>
            </div>
        </div>`,
        `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
         <button class="btn btn-primary"   onclick="PaintMixModule.saveFormula(${isEdit?`'${_js(id)}'`:'null'})">
             ${isEdit?'저장':'등록'}
         </button>`);

        _renderPrimerRows();
        _renderColorRows();
        /* 수정 시: 기존 차종으로 제품 체크박스 즉시 렌더 */
        if (r.carModel) setTimeout(_onFormulaModalCarChange, 50);
    }

    function saveFormula(id) {
        const line     = document.getElementById('pfsM_line')?.value || '';
        const carModel = document.getElementById('pfsM_car')?.value  || '';
        const partName = document.getElementById('pfsM_part')?.value.trim() || '';
        if (!line || !carModel || !partName) {
            UIUtils.toast('라인 · 차종 · 배합기준 이름은 필수입니다.', 'error'); return;
        }
        _readPrimerRows();
        _readColorRows();
        const productNames = [...document.querySelectorAll('input[name="pfsM_product"]:checked')].map(cb => cb.value);
        const rec = { line, carModel, partName, productNames, primers: _editPrimers, colors: _editColors, updatedAt: new Date().toISOString() };
        if (id) Storage.update(MIX_STD_STORE, { ...rec, id });
        else    Storage.add(MIX_STD_STORE, rec);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
        filterFormula();
    }

    function removeFormula(id) {
        UIUtils.confirm('이 배합기준을 삭제할까요?', () => {
            Storage.remove(MIX_STD_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            filterFormula();
        });
    }

    function exportFormula() {
        const stds = _mixStds();
        const headers = ['라인','차종','제품명','구분','No','메이커','도료명','비율','허용차','경화제','비율','허용차','희석신너','비율','허용차','점도하한','점도상한'];
        const rows = [];
        stds.forEach(r => {
            (r.primers||[]).forEach((p,i) => rows.push([r.line||'',r.carModel,r.partName,'PRIMER',i+1,p.company||'',p.paint||'',p.paintRatio||'',p.paintTol||'',p.hardener||'',p.hardenerRatio||'',p.hardenerTol||'',p.thinner||'',p.thinnerRatio||'',p.thinnerTol||'',p.viscLow||'',p.viscHigh||'']));
            (r.colors||[]).forEach((c,i)  => rows.push([r.line||'',r.carModel,r.partName,'COLOR', i+1,c.company||'',c.paint||'',c.paintRatio||'',c.paintTol||'',c.hardener||'',c.hardenerRatio||'',c.hardenerTol||'',c.thinner||'',c.thinnerRatio||'',c.thinnerTol||'',c.viscLow||'',c.viscHigh||'']));
            if (!(r.primers||[]).length && !(r.colors||[]).length) rows.push([r.line||'',r.carModel,r.partName,'','','','','','','','','','','','','','']);
        });
        Storage.exportToCSV(headers, rows, '도료배합기준표');
    }

    /* ══════════════════════════════════════════════════════
       TAB 3 ── 배합 / 사용 이력 (기존 기능 유지)
    ══════════════════════════════════════════════════════ */
    function _tabButtons(active) {
        const acts = document.getElementById('pmixPageActions');
        if (!acts) return;
        acts.innerHTML = `
            <div style="display:flex;gap:6px;margin-right:8px;">
                <button id="pmixTabBtn_history" class="btn btn-sm ${active === 'history' ? 'btn-primary' : 'btn-outline'}" onclick="PaintMixModule.switchTab('history')">
                    <span class="material-symbols-outlined" style="font-size:16px;">receipt_long</span> 배합/사용 이력
                </button>
                <button id="pmixTabBtn_residual" class="btn btn-sm ${active === 'residual' ? 'btn-primary' : 'btn-outline'}" onclick="PaintMixModule.switchTab('residual')">
                    <span class="material-symbols-outlined" style="font-size:16px;">inventory_2</span> 도료 잔량
                </button>
            </div>
            ${active === 'history' ? `
            <button class="btn btn-primary" onclick="PaintMixModule.openManualModal()">
                <span class="material-symbols-outlined">science</span> 수기 등록
            </button>
` : ''}
            ${active === 'residual' ? `` : ''}`;
    }

    function renderHistoryTab() {
        const pane = document.getElementById('pmixPane_history');
        if (!pane) return;
        _tabButtons('history');

        pane.innerHTML = `
        <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="pmixStart" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="pmixEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">차종</label>
                <select class="form-select" id="pmixCarFilter">
                    <option value="">전체</option>${_carOptions('')}
                </select>
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="PaintMixModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        </div>
        <div class="stat-cards" id="pmixStats"></div>
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header">
                <h4><span class="material-symbols-outlined">format_paint</span> 도장 생산실적 연동 대상</h4>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>작업일</th><th>라인</th><th>차종</th><th>품명</th><th>컬러</th><th>생산 LOT</th><th>생산수량</th><th>도료정보</th><th>작업</th>
                        </tr></thead>
                        <tbody id="pmixWorkBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">
                <h4><span class="material-symbols-outlined">receipt_long</span> 배합/사용 이력</h4>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>No</th><th>일자</th><th>라인</th><th>차종/품명</th><th>생산 LOT</th><th>도료 사용</th><th>총 사용량(g)</th><th>작업자</th><th>작업</th>
                        </tr></thead>
                        <tbody id="pmixBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        search();
    }

    function search() {
        const start = document.getElementById('pmixStart')?.value || '';
        const end   = document.getElementById('pmixEnd')?.value || '';
        const car   = document.getElementById('pmixCarFilter')?.value || '';
        const works = (Storage.getAll(PAINT_WORK_STORE) || [])
            .filter(w => (!start || w.date >= start) && (!end || w.date <= end))
            .filter(w => !car || w.carModel === car)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const mixes = _mixes()
            .filter(m => (!start || m.date >= start) && (!end || m.date <= end))
            .filter(m => !car || m.carModel === car)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderStats(works, mixes);
        renderWorkTable(works);
        renderMixTable(mixes);
    }

    function renderStats(works, mixes) {
        const issuedWorkIds = new Set(mixes.map(m => m.workId).filter(Boolean));
        const totalUsageG = mixes.reduce((s, m) => s + (m.usages || []).reduce((a, u) => a + (Number(u.usageG) || 0), 0), 0);
        const el = document.getElementById('pmixStats');
        if (!el) return;
        el.innerHTML = `
            <div class="stat-card blue"><div class="stat-card-value">${works.length}</div><div class="stat-card-label">도장 작업 건수</div></div>
            <div class="stat-card green"><div class="stat-card-value">${mixes.length}</div><div class="stat-card-label">배합 기록</div></div>
            <div class="stat-card orange"><div class="stat-card-value">${works.filter(w => !issuedWorkIds.has(w.id)).length}</div><div class="stat-card-label">미등록 작업</div></div>
            <div class="stat-card purple"><div class="stat-card-value">${UIUtils.formatNumber(totalUsageG)}g</div><div class="stat-card-label">총 사용량(g)</div></div>
        `;
    }

    function renderWorkTable(works) {
        const tbody = document.getElementById('pmixWorkBody');
        if (!tbody) return;
        if (!works.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;">해당 기간의 도장 작업실적이 없습니다.</td></tr>`;
            return;
        }
        const mixed = new Set(_mixes().map(m => m.workId).filter(Boolean));
        tbody.innerHTML = works.map(w => {
            const product = _findProduct(w);
            const comps = _paintComponents(product);
            const lotDisplay = (w.lots && w.lots.length > 0)
                ? w.lots.map(l => l.lotNo).filter(Boolean).join(', ')
                : (w.lotNo || '-');
            return `
                <tr>
                    <td>${_esc(w.date || '-')}</td>
                    <td>${_esc(w.line || '-')}</td>
                    <td><strong>${_esc(w.carModel || '-')}</strong></td>
                    <td>${_esc(w.partName || '-')}</td>
                    <td>${_esc(w.color || '-')}</td>
                    <td style="font-family:monospace;font-size:0.8rem;">${_esc(lotDisplay)}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(w.productionQty || 0)}</td>
                    <td>${comps.length ? `<span class="badge badge-success">${comps.length}개</span>` : '<span class="badge badge-warning">미등록</span>'}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm ${mixed.has(w.id) ? 'btn-outline' : 'btn-primary'}" onclick="PaintMixModule.openFromWork('${_js(w.id)}')">${mixed.has(w.id) ? '재등록' : '배합 등록'}</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function renderMixTable(mixes) {
        const tbody = document.getElementById('pmixBody');
        if (!tbody) return;
        if (!mixes.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;">배합 기록이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = mixes.map((m, i) => {
            const totalG = (m.usages || []).reduce((s, u) => s + (Number(u.usageG) || 0), 0);
            const totalCans = (m.usages || []).reduce((s, u) => s + (Number(u.warehouseCans) || 0), 0);
            const summary = (m.usages || []).map(u => {
                const usageG = Number(u.usageG) || 0;
                const cans = Number(u.warehouseCans) || 0;
                const parts = [];
                if (usageG > 0) parts.push(`사용 ${UIUtils.formatNumber(usageG)}g`);
                if (cans > 0) parts.push(`출고 ${cans}캔`);
                return `${_esc(u.paintName || '-')} ${_esc(u.prodLot || u.lotNo || '-')}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
            }).join('<br>');
            return `
                <tr>
                    <td>${mixes.length - i}</td>
                    <td>${_esc(m.date || '-')}</td>
                    <td>${_esc(m.line || '-')}</td>
                    <td><strong>${_esc(m.carModel || '-')}</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">${_esc(m.partName || '-')}</span></td>
                    <td style="font-family:monospace;font-size:0.8rem;">${_esc(m.productionLot || '-')}</td>
                    <td style="font-size:0.8rem;line-height:1.5;">${summary || '-'}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(totalG)}g${totalCans > 0 ? `<br><span style="font-size:0.75rem;color:var(--text-muted);">출고 ${totalCans}캔</span>` : ''}</td>
                    <td>${_esc(m.operator || '-')}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="PaintMixModule.edit('${_js(m.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="PaintMixModule.remove('${_js(m.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function renderResidualTab() {
        const pane = document.getElementById('pmixPane_residual');
        if (!pane) return;
        _tabButtons('residual');
        pane.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h4><span class="material-symbols-outlined">inventory_2</span> 도료 창고 LOT별 잔량</h4>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:0.85rem;">
                        <thead><tr>
                            <th>공급사</th><th>도료명</th><th>제조 LOT</th><th>입고 LOT</th>
                            <th>포장</th><th>창고잔량(KG)</th><th>포장수</th><th>개봉잔량</th><th>상태</th><th>작업</th>
                        </tr></thead>
                        <tbody id="pmixResidualBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
        renderResidualStock();
    }

    function exportResidualData() {
        const rows = _paintLotStockRows().map(r => {
            const p = _packState(r.balance, r.packUnit);
            return [r.supplier || '', r.paintName || '', r.prodLot || '', r.lotNo || '', r.packUnit ? r.packUnit + ' KG/캔' : '', r.balance, p.packText, p.openText, p.status];
        });
        Storage.exportToCSV(['공급사','도료명','제조LOT','입고LOT','포장','창고잔량(KG)','포장수','개봉잔량','상태'], rows, '도료잔량현황');
    }

    function renderResidualStock() {
        const tbody = document.getElementById('pmixResidualBody');
        if (!tbody) return;
        const rows = _paintLotStockRows();
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;">잔여 도료 재고가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const p = _packState(r.balance, r.packUnit);
            const badge = p.status === '소량' ? 'warning' : (p.status === '개봉' ? 'info' : 'success');
            return `
                <tr>
                    <td>${_esc(r.supplier || '-')}</td>
                    <td><strong>${_esc(r.paintName || '-')}</strong><div style="font-size:0.75rem;color:var(--text-muted);">${_esc([r.paintType, r.paintSpec].filter(Boolean).join(' · '))}</div></td>
                    <td style="font-family:monospace;">${_esc(r.prodLot || '-')}</td>
                    <td style="font-family:monospace;color:var(--text-secondary);">${_esc(r.lotNo || '-')}</td>
                    <td>${r.packUnit ? `${UIUtils.formatNumber(r.packUnit)} KG/포` : '-'}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${UIUtils.formatNumber(r.balance)} KG</td>
                    <td>${p.packText}</td>
                    <td style="text-align:right;">${p.openText}</td>
                    <td>${UIUtils.badge(p.status, badge)}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="PaintMixModule.openResidualAdjust('${_js(r.materialId)}','${_js(r.prodLot)}')">잔량 조정</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function _mixes() {
        return (Storage.getAll(STORE) || []).filter(d => d._docKind === DOC_KIND);
    }

    function _num(v) {
        const n = Number(String(v ?? '').replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function _roundQty(v) {
        return Math.round((_num(v) + Number.EPSILON) * 1000) / 1000;
    }

    function _packState(balance, packUnit) {
        const qty = _roundQty(balance);
        const unit = _num(packUnit);
        if (!unit) {
            return { packText: '-', openText: `${UIUtils.formatNumber(qty)} KG`, status: '확인' };
        }
        const full = Math.floor(qty / unit);
        const open = _roundQty(qty - (full * unit));
        const packText = `${UIUtils.formatNumber(full)}포${open > 0 ? ` + ${UIUtils.formatNumber(open)}KG` : ''}`;
        let status = '미개봉';
        if (open > 0 && qty < unit) status = '소량';
        else if (open > 0) status = '개봉';
        return {
            packText,
            openText: open > 0 ? `${UIUtils.formatNumber(open)} KG` : '-',
            status
        };
    }

    function _paintLotStockRows() {
        const mats = Storage.getAll(PAINT_MAT_STORE) || [];
        const map = {};
        (Storage.getAll(PAINT_INV_STORE) || []).forEach(r => {
            if (!r.materialId) return;
            const mat = mats.find(m => m.id === r.materialId);
            const prodLot = r.prodLot || r.lotNo || '미표기';
            const key = `${r.materialId}__${prodLot}`;
            if (!map[key]) {
                map[key] = {
                    materialId: r.materialId,
                    prodLot,
                    lotNo: r.lotNo || '',
                    supplier: mat ? mat.supplier || '' : '',
                    paintName: mat ? mat.name || '' : '(삭제된 도료)',
                    paintType: mat ? mat.paintType || '' : '',
                    paintSpec: mat ? mat.paintSpec || '' : '',
                    packUnit: mat ? _num(mat.packUnit) : 0,
                    balance: 0
                };
            }
            if (!map[key].lotNo && r.lotNo) map[key].lotNo = r.lotNo;
            if (r.type === '출고') map[key].balance -= _num(r.quantity);
            else map[key].balance += _num(r.quantity);
        });
        return Object.values(map)
            .map(r => ({ ...r, balance: _roundQty(r.balance) }))
            .filter(r => r.balance > 0)
            .sort((a, b) =>
                (a.supplier || '').localeCompare(b.supplier || '', 'ko') ||
                (a.paintName || '').localeCompare(b.paintName || '', 'ko') ||
                (a.prodLot || '').localeCompare(b.prodLot || '')
            );
    }

    function _carOptions(selected) {
        const products = Storage.getAll(PRODUCT_STORE) || [];
        const works = Storage.getAll(PAINT_WORK_STORE) || [];
        const cars = [...new Set([...products.map(p => p.carModel), ...works.map(w => w.carModel)].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return cars.map(c => `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`).join('');
    }

    /* ── 배합기준표 필터 차종 변경 → 제품 SELECT 동적 갱신 ── */
    function onFormulaCarChange() {
        const car = document.getElementById('pfsCarFilter')?.value || '';
        const sel = document.getElementById('pfsPartFilter');
        if (!sel) return;

        /* PRODUCTS store의 partName + 기존 기준서의 partName + productNames 배열 항목 */
        const fromProducts = (Storage.getAll(PRODUCT_STORE) || [])
            .filter(p => !car || p.carModel === car)
            .map(p => p.partName);
        const fromFormulas = (_mixStds())
            .filter(r => !car || r.carModel === car)
            .flatMap(r => [(r.partName || ''), ...(r.productNames || [])]);
        const allNames = [...new Set([...fromProducts, ...fromFormulas].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));

        sel.innerHTML = '<option value="">전체 제품</option>' +
            allNames.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');
    }

    /* ── 배합기준 등록/수정 모달 내 차종 변경 → 제품 체크박스 갱신 ── */
    function _onFormulaModalCarChange() {
        const car       = document.getElementById('pfsM_car')?.value || '';
        const container = document.getElementById('pfsM_productList');
        if (!container) return;

        const partNames = [...new Set(
            (Storage.getAll(PRODUCT_STORE) || [])
                .filter(p => p.carModel === car)
                .map(p => p.partName)
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'ko'));

        if (!car) {
            container.innerHTML = '<span style="color:var(--text-muted);font-size:0.83rem;">차종을 먼저 선택하세요</span>';
            return;
        }
        if (!partNames.length) {
            container.innerHTML = '<span style="color:var(--text-muted);font-size:0.83rem;">이 차종으로 등록된 제품이 없습니다 — 설정 > 제품 등록 후 이용하세요</span>';
            return;
        }
        container.innerHTML = partNames.map(pn => `
            <label style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
                          background:var(--bg-primary);border:1px solid var(--border-color);
                          border-radius:6px;cursor:pointer;font-size:0.83rem;user-select:none;">
                <input type="checkbox" name="pfsM_product" value="${_esc(pn)}"
                    ${_editProductNames.includes(pn) ? 'checked' : ''}>
                ${_esc(pn)}
            </label>`).join('');
    }

    /* ── 관리계획서 연동 이동 ── */
    function viewControlPlan(carModel, partName) {
        sessionStorage.setItem('mixStd_qualityFilter_car',  carModel || '');
        sessionStorage.setItem('mixStd_qualityFilter_part', partName || '');
        Router.navigate('prod-quality');
        UIUtils.toast(`${carModel} — ${partName} 관리계획서로 이동합니다.`, 'info');
    }

    /* ── 도료명 텍스트 → PAINT_MATERIALS 매칭 (부분 포함 허용) ── */
    function _matchPaintToMat(paintText, mats) {
        if (!paintText) return null;
        const txt = paintText.toLowerCase().trim();
        return mats.find(m => {
            if (!m.name) return false;
            const mn = m.name.toLowerCase().trim();
            return mn === txt || txt.includes(mn) || mn.includes(txt);
        }) || null;
    }

    /* ── 기준서 상세 검증 데이터 생성 ── */
    function _getFormulaValidation(r) {
        const mats     = Storage.getAll(PAINT_MAT_STORE) || [];
        const qualAll  = Storage.getAll(DB.STORES.PROD_QUALITY_CHECK) || [];
        const products = Storage.getAll(PRODUCT_STORE) || [];

        /* 도료 항목 추출 (하도 primers / 상도 colors 모두) */
        const entries = [];
        (r.primers || []).forEach(p => {
            if (p.paint)                     entries.push({ coat: '하도', role: '주제',   name: p.paint,    company: p.company || '' });
            if (p.hardener && p.hardener !== '-') entries.push({ coat: '하도', role: '경화제', name: p.hardener, company: p.company || '' });
            if (p.thinner)                   entries.push({ coat: '하도', role: '희석제', name: p.thinner,  company: '' });
        });
        (r.colors || []).forEach(c => {
            if (c.paint)                     entries.push({ coat: '상도', role: '주제',   name: c.paint,    company: c.company || '' });
            if (c.hardener && c.hardener !== '-') entries.push({ coat: '상도', role: '경화제', name: c.hardener, company: c.company || '' });
            if (c.thinner)                   entries.push({ coat: '상도', role: '희석제', name: c.thinner,  company: '' });
        });

        /* 각 항목 매칭 */
        const validated = entries.map(e => ({ ...e, mat: _matchPaintToMat(e.name, mats) }));
        const matchedCnt = validated.filter(v => v.mat).length;
        const paintStatus = validated.length === 0 ? 'none'
                          : matchedCnt === validated.length ? 'ok'
                          : matchedCnt > 0 ? 'partial' : 'fail';

        /* 연결 제품 상태 */
        const linkedProducts = (r.productNames || []).map(pn => {
            const prod = products.find(p => p.carModel === r.carModel && p.partName === pn);
            const paintMatCount = (prod && prod.paintMaterials) ? prod.paintMaterials.length : 0;
            return { partName: pn, found: !!prod, paintMatCount };
        });

        /* 관리계획서 템플릿 */
        const tmplExists = qualAll.some(d => d._docKind === 'quality_template' && d.carModel === r.carModel);
        /* 발행 이력 (이 차종 + 연결 제품명 기준) */
        const issueCnt = qualAll.filter(d =>
            d._docKind !== 'quality_template' &&
            d.carModel === r.carModel &&
            (r.productNames || []).some(pn => d.partName === pn || d.partName === r.partName)
        ).length;

        return { validated, paintStatus, matchedCnt, total: validated.length, linkedProducts, tmplExists, issueCnt };
    }

    /* ── 상세 검증 모달 ── */
    function showFormulaValidation(id) {
        const r = _mixStds().find(x => x.id === id);
        if (!r) return;
        const v = _getFormulaValidation(r);

        /* 도료 검증 테이블 */
        const coatColors = { '하도': '#92400e', '상도': '#166534' };
        const coatBg     = { '하도': '#fef3c7', '상도': '#dcfce7' };
        const paintRows = v.validated.length
            ? v.validated.map(e => `
            <tr>
                <td style="padding:5px 8px;">
                    <span style="background:${coatBg[e.coat]||'#f3f4f6'};color:${coatColors[e.coat]||'#374151'};
                          padding:2px 7px;border-radius:4px;font-size:0.75rem;font-weight:700;">${_esc(e.coat)}</span>
                    <span style="color:var(--text-muted);font-size:0.78rem;margin-left:4px;">${_esc(e.role)}</span>
                </td>
                <td style="padding:5px 8px;font-size:0.8rem;">${_esc(e.company)}</td>
                <td style="padding:5px 8px;font-weight:600;font-size:0.82rem;">${_esc(e.name)}</td>
                <td style="padding:5px 8px;font-size:0.82rem;">
                    ${e.mat
                        ? `<span style="color:#16a34a;">✅</span> <strong>${_esc(e.mat.name)}</strong>
                           <span style="color:var(--text-muted);font-size:0.77rem;"> · ${_esc(e.mat.supplier||'')}</span>`
                        : `<span style="color:#dc2626;">❌ 미매칭</span>
                           <span style="color:var(--text-muted);font-size:0.77rem;"> — PAINT_MATERIALS에 없음</span>`}
                </td>
            </tr>`).join('')
            : `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">기준서에 도료 정보가 없습니다</td></tr>`;

        const paintStatusLabel = v.paintStatus === 'ok'      ? `<span style="color:#16a34a;font-weight:700;">✅ 전체 일치 (${v.matchedCnt}/${v.total})</span>`
                               : v.paintStatus === 'partial' ? `<span style="color:#d97706;font-weight:700;">⚠️ 일부 미매칭 (${v.matchedCnt}/${v.total} 매칭)</span>`
                               : v.paintStatus === 'fail'    ? `<span style="color:#dc2626;font-weight:700;">❌ 미매칭 (0/${v.total})</span>`
                               :                               `<span style="color:var(--text-muted);">– 도료 없음</span>`;

        /* 연결 제품 테이블 */
        const prodRows = v.linkedProducts.length
            ? v.linkedProducts.map(lp => `
            <tr>
                <td style="padding:5px 8px;font-weight:600;">${_esc(lp.partName)}</td>
                <td style="padding:5px 8px;">
                    ${lp.found ? `<span style="color:#16a34a;">✅ 제품 등록됨</span>` : `<span style="color:#dc2626;">❌ 제품 미등록</span>`}
                </td>
                <td style="padding:5px 8px;font-size:0.82rem;">
                    ${lp.found
                        ? (lp.paintMatCount > 0
                            ? `<span style="color:#16a34a;">✅ 도료 ${lp.paintMatCount}개 연결됨</span>`
                            : `<span style="color:#f59e0b;">⚠️ 제품에 도료 미연결</span>`)
                        : '–'}
                </td>
            </tr>`).join('')
            : `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--text-muted);">
                연결된 제품 없음 — <a href="javascript:void(0)" onclick="UIUtils.closeModal();PaintMixModule.openFormulaModal('${_js(id)}')">수정</a>에서 제품을 연결하세요
               </td></tr>`;

        /* 관리계획서 상태 */
        const tmplHtml = v.tmplExists
            ? `<span style="color:#16a34a;font-weight:700;">✅ 관리계획서 템플릿 있음</span>
               <span style="color:var(--text-muted);font-size:0.82rem;"> · 발행 이력 ${v.issueCnt}건</span>
               <button class="btn btn-sm btn-outline" style="margin-left:10px;" onclick="UIUtils.closeModal();PaintMixModule.viewControlPlan('${_js(r.carModel)}','${_js((r.productNames&&r.productNames[0])||r.partName)}')">
                   <span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span> 열기
               </button>`
            : `<span style="color:#dc2626;font-weight:700;">❌ 관리계획서 템플릿 없음</span>
               <button class="btn btn-sm btn-secondary" style="margin-left:10px;" onclick="UIUtils.closeModal();Router.navigate('prod-quality')">
                   기준설정 바로가기
               </button>`;

        UIUtils.showModal(
            `검증 — ${_esc(r.carModel)} · ${_esc(r.partName)}`,
            `<div style="display:flex;flex-direction:column;gap:14px;">

                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div style="font-weight:700;font-size:0.87rem;margin-bottom:10px;">
                        🧪 도료 일치성 검증 &nbsp; ${paintStatusLabel}
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;border:1px solid var(--border-color);">
                            <thead>
                                <tr style="background:var(--bg-tertiary);">
                                    <th style="padding:5px 8px;border:1px solid var(--border-color);">구분</th>
                                    <th style="padding:5px 8px;border:1px solid var(--border-color);">메이커</th>
                                    <th style="padding:5px 8px;border:1px solid var(--border-color);">기준서 도료명</th>
                                    <th style="padding:5px 8px;border:1px solid var(--border-color);">PAINT_MATERIALS 매칭</th>
                                </tr>
                            </thead>
                            <tbody>${paintRows}</tbody>
                        </table>
                    </div>
                    <div style="margin-top:8px;font-size:0.77rem;color:var(--text-muted);">
                        ※ 도료명 포함 텍스트 비교 — 정확한 매칭은 도료명을 동일하게 등록하세요
                    </div>
                </div>

                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div style="font-weight:700;font-size:0.87rem;margin-bottom:10px;">🔗 연결 제품 상태</div>
                    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;border:1px solid var(--border-color);">
                        <thead>
                            <tr style="background:var(--bg-tertiary);">
                                <th style="padding:5px 8px;border:1px solid var(--border-color);">제품명</th>
                                <th style="padding:5px 8px;border:1px solid var(--border-color);">등록 여부</th>
                                <th style="padding:5px 8px;border:1px solid var(--border-color);">제품 도료 연결</th>
                            </tr>
                        </thead>
                        <tbody>${prodRows}</tbody>
                    </table>
                </div>

                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;">
                    <div style="font-weight:700;font-size:0.87rem;margin-bottom:8px;">📋 관리계획서 연동 상태</div>
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">${tmplHtml}</div>
                </div>

            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'xl'
        );
    }

    function _findProduct(work) {
        const products = Storage.getAll(PRODUCT_STORE) || [];
        return products.find(p => p.carModel === work.carModel && p.partName === work.partName && (!work.color || !p.color || p.color === work.color))
            || products.find(p => p.carModel === work.carModel && p.partName === work.partName)
            || null;
    }

    function _paintComponents(product) {
        const mats = Storage.getAll(PAINT_MAT_STORE) || [];
        const rows = (product && product.paintMaterials) || [];
        const out = [];
        rows.forEach(row => {
            [
                ['mainId', '주제'],
                ['hardId', '경화제'],
                ['thinnerId', '희석제']
            ].forEach(([field, role]) => {
                const materialId = row[field] || '';
                if (!materialId) return;
                const mat = mats.find(m => m.id === materialId);
                out.push({
                    paintSpec: row.paintSpec || '',
                    role,
                    materialId,
                    paintName: mat ? mat.name : '(삭제된 도료)',
                    supplier: mat ? mat.supplier || '' : '',
                    packUnit: mat ? mat.packUnit || '' : ''
                });
            });
        });
        return out;
    }

    function _lotBalances(materialId, ignoreMixId = '') {
        const rows = Storage.getAll(PAINT_INV_STORE) || [];
        const map = {};
        rows.filter(r => r.materialId === materialId).forEach(r => {
            if (ignoreMixId && r.paintMixId === ignoreMixId) return;
            const prodLot = r.prodLot || r.lotNo || '미표기';
            const key = prodLot;
            if (!map[key]) map[key] = { prodLot, lotNo: r.lotNo || '', balance: 0 };
            if (r.type === '출고') map[key].balance -= Number(r.quantity) || 0;
            else map[key].balance += Number(r.quantity) || 0;
        });
        return Object.values(map)
            .filter(l => l.balance > 0)
            .sort((a, b) => (a.prodLot || '').localeCompare(b.prodLot || ''));
    }

    function _lotOptions(materialId, selected, ignoreMixId = '') {
        const lots = _lotBalances(materialId, ignoreMixId);
        const hasSelected = selected && !lots.some(l => l.prodLot === selected);
        return `<option value="">LOT 선택</option>` +
            (hasSelected ? `<option value="${_esc(selected)}" selected>${_esc(selected)} (기존)</option>` : '') +
            lots.map((l, i) => `<option value="${_esc(l.prodLot)}" data-balance="${l.balance}" ${l.prodLot === selected ? 'selected' : ''}>${i === 0 ? '[선입] ' : ''}${_esc(l.prodLot)} · 창고 ${UIUtils.formatNumber(l.balance)} KG</option>`).join('');
    }

    // 배합실 잔량: 해당 LOT에서 꺼낸 캔 합계g - 사용량 합계g
    function _mixRoomBalanceG(materialId, prodLot, ignoreMixId = '') {
        let takenG = 0, usedG = 0;
        (_mixes()).forEach(m => {
            if (ignoreMixId && m.id === ignoreMixId) return;
            (m.usages || []).forEach(u => {
                if (u.materialId !== materialId || u.prodLot !== prodLot) return;
                takenG += (Number(u.warehouseCans) || 0) * (Number(u.packUnit) || 0) * 1000;
                usedG  += (Number(u.usageG) || 0);
            });
        });
        return Math.max(0, _roundQty(takenG - usedG));
    }

    function _baseFromWork(work) {
        return {
            workId: work.id || '',
            date: work.date || UIUtils.today(),
            line: work.line || '',
            carModel: work.carModel || '',
            partName: work.partName || '',
            color: work.color || '',
            productionLot: work.lotNo || ((work.lots || []).map(l => l.lotNo).filter(Boolean).join(', ')),
            productionQty: Number(work.productionQty) || 0
        };
    }

    function _formHtml(data = {}, usages = []) {
        const work = data.workId ? Storage.getById(PAINT_WORK_STORE, data.workId) : null;
        const product = work ? _findProduct(work) : _findProduct(data);
        const components = usages.length ? usages : _paintComponents(product);
        const ignoreMixId = data.id || '';
        const rows = components.map((c, i) => {
            const materialId = c.materialId || '';
            const prodLot = c.prodLot || '';
            const packUnit = Number(c.packUnit) || 0;
            const warehouseCans = Number(c.warehouseCans) || 0;
            const usageG = Number(c.usageG) || 0;
            const mixRoomBal = materialId && prodLot ? _mixRoomBalanceG(materialId, prodLot, ignoreMixId) : 0;
            const afterBal = Math.max(0, mixRoomBal + warehouseCans * packUnit * 1000 - usageG);
            const afterBalDisplay = (warehouseCans > 0 || usageG > 0) ? `${UIUtils.formatNumber(afterBal)}g` : '-';
            return `
                <tr class="pmix-row" data-row="${i}" data-pack-unit="${packUnit}">
                    <td>
                        <input type="hidden" class="pmix-material-id" value="${_esc(materialId)}">
                        <input type="hidden" class="pmix-role" value="${_esc(c.role || '')}">
                        <input type="hidden" class="pmix-paint-spec" value="${_esc(c.paintSpec || '')}">
                        <strong>${_esc(c.paintName || '-')}</strong>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${_esc([c.paintSpec, c.role, c.supplier].filter(Boolean).join(' · '))}</div>
                    </td>
                    <td>
                        <select class="form-select pmix-prod-lot" style="min-width:150px;" onchange="PaintMixModule._onLotChange(this,${i})">
                            ${_lotOptions(materialId, prodLot, ignoreMixId)}
                        </select>
                    </td>
                    <td class="pmix-mix-room-bal" style="text-align:right;white-space:nowrap;">${prodLot ? `${UIUtils.formatNumber(mixRoomBal)}g` : '-'}</td>
                    <td><input type="number" class="form-input pmix-warehouse-cans" value="${warehouseCans || ''}" min="0" step="1" style="text-align:right;width:70px;" oninput="PaintMixModule._onRowCalc(${i})"></td>
                    <td><input type="number" class="form-input pmix-usage-g" value="${usageG || ''}" min="0" step="1" style="text-align:right;width:90px;" oninput="PaintMixModule._onRowCalc(${i})"></td>
                    <td class="pmix-after-bal" style="text-align:right;white-space:nowrap;">${afterBalDisplay}</td>
                    <td style="white-space:nowrap;">${_esc(packUnit ? packUnit + ' KG/캔' : '-')}</td>
                </tr>`;
        }).join('');
        return `
            <input type="hidden" id="pmixId" value="${_esc(data.id || '')}">
            <input type="hidden" id="pmixWorkId" value="${_esc(data.workId || '')}">
            <div class="form-row">
                <div class="form-group"><label class="form-label">배합일자</label><input type="date" class="form-input" id="pmixDate" value="${_esc(data.date || UIUtils.today())}"></div>
                <div class="form-group"><label class="form-label">라인</label><input type="text" class="form-input" id="pmixLine" value="${_esc(data.line || '')}"></div>
                <div class="form-group"><label class="form-label">작업자</label><input type="text" class="form-input" id="pmixOperator" value="${_esc(data.operator || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">차종</label><input type="text" class="form-input" id="pmixCarModel" value="${_esc(data.carModel || '')}"></div>
                <div class="form-group"><label class="form-label">품명</label><input type="text" class="form-input" id="pmixPartName" value="${_esc(data.partName || '')}"></div>
                <div class="form-group"><label class="form-label">컬러</label><input type="text" class="form-input" id="pmixColor" value="${_esc(data.color || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">생산 LOT</label><input type="text" class="form-input" id="pmixProductionLot" value="${_esc(data.productionLot || '')}"></div>
                <div class="form-group"><label class="form-label">생산수량</label><input type="number" class="form-input" id="pmixProductionQty" value="${data.productionQty || ''}" style="text-align:right;"></div>
                <div class="form-group"><label class="form-label">비고</label><input type="text" class="form-input" id="pmixNote" value="${_esc(data.note || '')}"></div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <div style="padding:9px 12px;background:var(--bg-secondary);font-weight:700;">도료 구성 및 LOT 사용량</div>
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead><tr><th>도료</th><th>사용 LOT</th><th>배합실잔량</th><th>창고출고(캔)</th><th>사용량(g)</th><th>사용후잔량</th><th>포장</th></tr></thead>
                        <tbody>${rows || `<tr><td colspan="7" style="text-align:center;padding:24px;">제품 기본정보에 등록된 도료 정보가 없습니다.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>`;
    }

    function _onLotChange(selectEl, rowIdx) {
        const row = document.querySelector(`.pmix-row[data-row="${rowIdx}"]`);
        if (!row) return;
        const materialId = row.querySelector('.pmix-material-id')?.value || '';
        const prodLot = selectEl.value;
        const ignoreMixId = document.getElementById('pmixId')?.value || '';
        const mixRoomBal = materialId && prodLot ? _mixRoomBalanceG(materialId, prodLot, ignoreMixId) : 0;
        const balCell = row.querySelector('.pmix-mix-room-bal');
        if (balCell) balCell.textContent = prodLot ? `${UIUtils.formatNumber(mixRoomBal)}g` : '-';
        _onRowCalc(rowIdx);
    }

    function _onRowCalc(rowIdx) {
        const row = document.querySelector(`.pmix-row[data-row="${rowIdx}"]`);
        if (!row) return;
        const packUnit = Number(row.dataset.packUnit) || 0;
        const warehouseCans = Number(row.querySelector('.pmix-warehouse-cans')?.value) || 0;
        const usageG = Number(row.querySelector('.pmix-usage-g')?.value) || 0;
        const balCell = row.querySelector('.pmix-mix-room-bal');
        const mixRoomBal = balCell ? parseFloat((balCell.textContent || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
        const afterBalCell = row.querySelector('.pmix-after-bal');
        if (!afterBalCell) return;
        if (warehouseCans === 0 && usageG === 0) {
            afterBalCell.textContent = '-';
            afterBalCell.style.color = '';
        } else {
            const afterBal = Math.max(0, mixRoomBal + warehouseCans * packUnit * 1000 - usageG);
            afterBalCell.textContent = `${UIUtils.formatNumber(afterBal)}g`;
            afterBalCell.style.color = afterBal === 0 ? 'var(--accent-red)' : '';
        }
    }

    function _collectData() {
        const ignoreMixId = document.getElementById('pmixId')?.value || '';
        const usages = [...document.querySelectorAll('.pmix-row')].map(row => {
            const materialId = row.querySelector('.pmix-material-id')?.value || '';
            const mat = (Storage.getAll(PAINT_MAT_STORE) || []).find(m => m.id === materialId);
            const prodLot = row.querySelector('.pmix-prod-lot')?.value || '';
            const packUnit = Number(row.dataset.packUnit) || 0;
            const warehouseCans = Number(row.querySelector('.pmix-warehouse-cans')?.value) || 0;
            const usageG = Number(row.querySelector('.pmix-usage-g')?.value) || 0;
            const lotInfo = _lotBalances(materialId, ignoreMixId).find(l => l.prodLot === prodLot);
            return {
                materialId,
                paintName: mat ? mat.name : '',
                supplier: mat ? mat.supplier || '' : '',
                role: row.querySelector('.pmix-role')?.value || '',
                paintSpec: row.querySelector('.pmix-paint-spec')?.value || '',
                packUnit,
                prodLot,
                lotNo: lotInfo ? lotInfo.lotNo : prodLot,
                warehouseCans,
                usageG,
                quantity: _roundQty(warehouseCans * packUnit)
            };
        }).filter(u => u.materialId && u.prodLot && (u.usageG > 0 || u.warehouseCans > 0));
        return {
            _docKind: DOC_KIND,
            workId: document.getElementById('pmixWorkId')?.value || '',
            date: document.getElementById('pmixDate')?.value || UIUtils.today(),
            line: document.getElementById('pmixLine')?.value.trim() || '',
            carModel: document.getElementById('pmixCarModel')?.value.trim() || '',
            partName: document.getElementById('pmixPartName')?.value.trim() || '',
            color: document.getElementById('pmixColor')?.value.trim() || '',
            productionLot: document.getElementById('pmixProductionLot')?.value.trim() || '',
            productionQty: Number(document.getElementById('pmixProductionQty')?.value) || 0,
            operator: document.getElementById('pmixOperator')?.value.trim() || '',
            note: document.getElementById('pmixNote')?.value.trim() || '',
            usages
        };
    }

    function openFromWork(workId) {
        const work = Storage.getById(PAINT_WORK_STORE, workId);
        if (!work) return;
        const existing = _mixes().find(m => m.workId === workId);
        if (existing) return edit(existing.id);
        const base = _baseFromWork(work);
        UIUtils.showModal('도료 배합 등록', _formHtml(base), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintMixModule.saveNew()">등록</button>
        `, 'xl');
    }

    function openManualModal() {
        UIUtils.showModal('도료 배합 수기 등록', _formHtml({ date: UIUtils.today() }), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintMixModule.saveNew()">등록</button>
        `, 'xl');
    }

    function openResidualAdjust(materialId, prodLot) {
        const row = _paintLotStockRows().find(r => r.materialId === materialId && r.prodLot === prodLot);
        if (!row) {
            UIUtils.toast('조정할 도료 LOT 재고를 찾을 수 없습니다.', 'warning');
            return;
        }
        const p = _packState(row.balance, row.packUnit);
        UIUtils.showModal('도료 잔량 실사 조정', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">도료명</label>
                    <input type="text" class="form-input" value="${_esc(row.paintName || '')}" readonly style="background:var(--bg-secondary);">
                </div>
                <div class="form-group">
                    <label class="form-label">제조 LOT</label>
                    <input type="text" class="form-input" value="${_esc(row.prodLot || '')}" readonly style="background:var(--bg-secondary);">
                </div>
                <div class="form-group">
                    <label class="form-label">포장용량</label>
                    <input type="text" class="form-input" value="${row.packUnit ? `${UIUtils.formatNumber(row.packUnit)} KG/포` : '-'}" readonly style="background:var(--bg-secondary);">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">현재 전산 잔량</label>
                    <input type="text" class="form-input" value="${UIUtils.formatNumber(row.balance)} KG (${_esc(p.packText)})" readonly style="background:var(--bg-secondary);">
                </div>
                <div class="form-group">
                    <label class="form-label">실사 잔량 (KG) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="pmixActualBalance" value="${row.balance}" min="0" step="0.001" style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">조정일자</label>
                    <input type="date" class="form-input" id="pmixAdjustDate" value="${UIUtils.today()}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">조정 사유</label>
                <input type="text" class="form-input" id="pmixAdjustNote" placeholder="예: 개봉잔량 실사, 폐기, 계량 보정">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintMixModule.saveResidualAdjust('${_js(materialId)}','${_js(prodLot)}')">저장</button>
        `, 'lg');
    }

    async function saveResidualAdjust(materialId, prodLot) {
        const row = _paintLotStockRows().find(r => r.materialId === materialId && r.prodLot === prodLot);
        if (!row) {
            UIUtils.toast('조정할 도료 LOT 재고를 찾을 수 없습니다.', 'warning');
            return;
        }
        const actual = _roundQty(document.getElementById('pmixActualBalance')?.value || 0);
        if (actual < 0) {
            UIUtils.toast('실사 잔량은 0 이상으로 입력하세요.', 'warning');
            return;
        }
        const delta = _roundQty(actual - row.balance);
        if (Math.abs(delta) < 0.001) {
            UIUtils.toast('조정할 차이가 없습니다.', 'info');
            return;
        }
        await Storage.add(PAINT_INV_STORE, {
            date: document.getElementById('pmixAdjustDate')?.value || UIUtils.today(),
            type: delta > 0 ? '입고' : '출고',
            materialId,
            lotNo: row.lotNo || prodLot,
            prodLot,
            quantity: Math.abs(delta),
            source: '도료 잔량 실사 조정',
            note: document.getElementById('pmixAdjustNote')?.value.trim() || '',
            adjustedFromBalance: row.balance,
            adjustedToBalance: actual
        });
        UIUtils.closeModal();
        UIUtils.toast('도료 잔량이 조정되었습니다.', 'success');
        search();
    }

    function _validate(data, ignoreMixId = '') {
        if (!data.date) return '배합일자를 입력하세요.';
        if (!data.usages.length) return '도료 LOT와 사용량(g)을 1개 이상 입력하세요.';
        for (const u of data.usages) {
            if (u.warehouseCans > 0) {
                const lot = _lotBalances(u.materialId, ignoreMixId).find(l => l.prodLot === u.prodLot);
                const available = lot ? Number(lot.balance) || 0 : 0;
                const required = _roundQty(u.warehouseCans * u.packUnit);
                if (required > available) {
                    return `${u.paintName || '도료'} LOT ${u.prodLot} 창고 재고가 부족합니다. 출고 필요: ${UIUtils.formatNumber(required)} KG, 가용: ${UIUtils.formatNumber(available)} KG`;
                }
            }
            if (u.usageG > 0) {
                const mixRoomBal = _mixRoomBalanceG(u.materialId, u.prodLot, ignoreMixId);
                const totalAvailG = mixRoomBal + (u.warehouseCans * u.packUnit * 1000);
                if (u.usageG > totalAvailG) {
                    return `${u.paintName || '도료'} LOT ${u.prodLot} 사용량(${UIUtils.formatNumber(u.usageG)}g)이 배합실 가용량(${UIUtils.formatNumber(totalAvailG)}g)을 초과합니다.`;
                }
            }
        }
        return '';
    }

    function _inventoryOutRemoveOps(mixId) {
        const rows = (Storage.getAll(PAINT_INV_STORE) || []).filter(r => r.paintMixId === mixId && r.type === '출고');
        return rows.map(r => ({ store: PAINT_INV_STORE, op: 'remove', id: r.id }));
    }

    function _inventoryOutOps(mixId, data) {
        return data.usages.filter(u => u.warehouseCans > 0).map(u => ({
            store: PAINT_INV_STORE,
            op: 'add',
            data: {
                date: data.date,
                type: '출고',
                materialId: u.materialId,
                lotNo: u.lotNo || u.prodLot,
                prodLot: u.prodLot,
                quantity: u.quantity,
                warehouseCans: u.warehouseCans,
                packUnit: u.packUnit,
                source: '도료 배합 창고출고',
                paintMixId: mixId,
                paintingWorkId: data.workId || '',
                carModel: data.carModel,
                partName: data.partName
            }
        }));
    }

    async function saveNew() {
        const data = _collectData();
        const err = _validate(data);
        if (err) { UIUtils.toast(err, 'warning'); return; }
        const mixId = Storage.generateId();
        await Storage.executeTransaction([
            { store: STORE, op: 'add', data: { id: mixId, ...data } },
            ..._inventoryOutOps(mixId, data)
        ]);
        UIUtils.closeModal();
        UIUtils.toast('도료 배합 사용량이 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const data = Storage.getById(STORE, id);
        if (!data) return;
        UIUtils.showModal('도료 배합 수정', _formHtml(data, data.usages || []), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PaintMixModule.saveEdit('${_js(id)}')">저장</button>
        `, 'xl');
    }

    async function saveEdit(id) {
        const data = _collectData();
        const err = _validate(data, id);
        if (err) { UIUtils.toast(err, 'warning'); return; }
        await Storage.executeTransaction([
            ..._inventoryOutRemoveOps(id),
            { store: STORE, op: 'update', id, data },
            ..._inventoryOutOps(id, data)
        ]);
        UIUtils.closeModal();
        UIUtils.toast('도료 배합 기록이 수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('도료 배합 기록을 삭제하시겠습니까?\n연결된 도료 LOT 출고 이력도 함께 삭제됩니다.', async () => {
            await Storage.executeTransaction([
                ..._inventoryOutRemoveOps(id),
                { store: STORE, op: 'remove', id }
            ]);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const rows = _mixes().flatMap(m => (m.usages || []).map(u => [
            m.date, m.line, m.carModel, m.partName, m.productionLot, u.paintSpec, u.role, u.paintName, u.prodLot, u.usageG || 0, u.warehouseCans || 0, u.packUnit || '', m.operator || '', m.note || ''
        ]));
        Storage.exportToCSV(['일자','라인','차종','품명','생산LOT','도료사양','구분','도료명','도료LOT','사용량(g)','창고출고(캔)','포장(KG/캔)','작업자','비고'], rows, '도료배합관리');
    }

    /* 제조관리표준 > 배합기준서 탭에서 호출 — formula 내용을 targetEl 안에 렌더 */
    function renderFormulaAsStandard(targetEl) {
        if (!targetEl) return;
        targetEl.innerHTML = `
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;" id="pmixPageActions"></div>
            <div id="pmixPane_formula"></div>`;
        renderFormulaTab();
    }

    /* 제조관리표준 > 사용량 기준표 탭에서 호출 */
    function renderUsageAsStandard(targetEl) {
        if (!targetEl) return;
        targetEl.innerHTML = `
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;" id="pmixPageActions"></div>
            <div id="pmixPane_usage"></div>`;
        renderUsageTab();
    }

    return {
        render, switchTab,
        filterUsage, openUsageModal, saveUsage, removeUsage, exportUsage,
        renderFormulaTab, filterFormula, onFormulaCarChange, openFormulaModal, saveFormula, removeFormula, exportFormula,
        _addPrimerRow, _delPrimerRow, _addColorRow, _delColorRow,
        _onFormulaModalCarChange, viewControlPlan, showFormulaValidation,
        renderHistoryTab, renderResidualTab, search,
        openFromWork, openManualModal,
        _onLotChange, _onRowCalc,
        renderResidualStock, exportResidualData, openResidualAdjust, saveResidualAdjust,
        saveNew, edit, saveEdit, remove, exportData,
        renderFormulaAsStandard, renderUsageAsStandard
    };
})();

/**
 * 3) 부자재 관리 (ProdSubMaterialsModule)
 *    SQ: 자재 소진에 의한 부품/부자재 누락 방지를 위한 입고 기록 기본 틀
 */
var ProdSubMaterialsModule = (function() {
    const STORE = DB.STORES.PROD_SUB_MATERIALS;
    const UNITS = ['EA', 'SET', 'BOX', 'ROLL', 'KG', 'G', 'L', 'ML', '개', '기타'];
    const CATEGORIES = ['포장재', '라벨', '테이프', '지그/소모품', '검사 부자재', '기타'];

    function render(container) {
        const filterHTML = `
            <div class="form-group">
                <label class="form-label">시작일</label>
                <input type="date" class="form-input" id="psmFilterStart" value="${UIUtils.monthAgo()}">
            </div>
            <div class="form-group">
                <label class="form-label">종료일</label>
                <input type="date" class="form-input" id="psmFilterEnd" value="${UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">부자재명</label>
                <input type="text" class="form-input" id="psmFilterItem" placeholder="예: 라벨, 박스">
            </div>
            <div class="form-group">
                <label class="form-label">대상 품명</label>
                <input type="text" class="form-input" id="psmFilterPart" placeholder="제품/품명">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-outline" onclick="ProdSubMaterialsModule.search()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
        `;
        const headers = ['No', '입고일자', '구분', '부자재명', 'LOT/관리번호', '입고수량', '거래처', '대상 품명', '확인자', '비고'];
        ProdUtils.renderMain(
            container,
            '부자재 관리',
            '부자재 입고 기록을 관리합니다. 향후 완제품 생산실적과 입고/소진량 비교검증 자료로 활용합니다.',
            'ProdSubMaterialsModule.openAddModal()',
            'ProdSubMaterialsModule.exportData()',
            filterHTML,
            'psmTable',
            headers
        );
        search();
    }

    function _rows() {
        return (Storage.getAll(STORE) || []).filter(r => !r._docKind);
    }

    function search() {
        const start = document.getElementById('psmFilterStart')?.value || '';
        const end = document.getElementById('psmFilterEnd')?.value || '';
        const item = (document.getElementById('psmFilterItem')?.value || '').trim().toLowerCase();
        const part = (document.getElementById('psmFilterPart')?.value || '').trim().toLowerCase();

        let data = _rows();
        if (start) data = data.filter(d => (d.date || '') >= start);
        if (end) data = data.filter(d => (d.date || '') <= end);
        if (item) data = data.filter(d => (d.itemName || '').toLowerCase().includes(item));
        if (part) data = data.filter(d => (d.partName || '').toLowerCase().includes(part));
        data.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
        renderTable(data);
    }

    function renderTable(data) {
        const tbody = document.getElementById('psmTableBody');
        if (!tbody) return;
        tbody.innerHTML = data.length === 0
            ? `<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--text-muted);">부자재 입고 기록이 없습니다.</td></tr>`
            : data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${_esc(d.date)}</td>
                    <td><span class="badge badge-info">${_esc(d.category || '기타')}</span></td>
                    <td style="font-weight:700;">${_esc(d.itemName)}</td>
                    <td style="font-family:monospace;font-size:.82rem;">${_esc(d.lotNo || '-')}</td>
                    <td style="text-align:right;font-weight:700;">${UIUtils.formatNumber(Number(d.quantity) || 0)} ${_esc(d.unit || '')}</td>
                    <td>${_esc(d.supplier || '-')}</td>
                    <td>${_esc(d.partName || '-')}</td>
                    <td>${_esc(d.inspector || '-')}</td>
                    <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(d.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="ProdSubMaterialsModule.edit('${_js(d.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdSubMaterialsModule.remove('${_js(d.id)}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function _formHtml(d = {}) {
        return `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);font-size:.82rem;color:var(--text-secondary);line-height:1.55;">
                    <strong style="color:var(--text-primary);">SQ 근거</strong><br>
                    제품 생산 시 자재 소진에 의한 부품 및 부자재 누락 방지를 위해 입고 이력을 기록합니다.
                    이후 소진량과 완제품 생산실적 비교검증 화면으로 확장할 수 있습니다.
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">입고일자 <span style="color:var(--accent-red)">*</span></label>
                        <input type="date" class="form-input" id="psmDate" value="${d.date || UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">구분</label>
                        <select class="form-select" id="psmCategory">
                            ${CATEGORIES.map(c => `<option value="${_esc(c)}" ${(d.category || '포장재') === c ? 'selected' : ''}>${_esc(c)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">부자재명 <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="psmItemName" value="${_esc(d.itemName || '')}" placeholder="예: 제품 라벨, 포장 박스, 보호필름">
                    </div>
                    <div class="form-group">
                        <label class="form-label">LOT/관리번호</label>
                        <input type="text" class="form-input" id="psmLotNo" value="${_esc(d.lotNo || '')}" placeholder="거래명세서/LOT/관리번호">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">입고수량 <span style="color:var(--accent-red)">*</span></label>
                        <input type="number" min="0" step="0.001" class="form-input" id="psmQuantity" value="${d.quantity ?? ''}" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">단위 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="psmUnit">
                            ${UNITS.map(u => `<option value="${_esc(u)}" ${(d.unit || 'EA') === u ? 'selected' : ''}>${_esc(u)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">거래처/입고처</label>
                        <input type="text" class="form-input" id="psmSupplier" value="${_esc(d.supplier || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">대상 품명</label>
                        <input type="text" class="form-input" id="psmPartName" value="${_esc(d.partName || '')}" placeholder="특정 제품에 대응될 경우 입력">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">확인자</label>
                        <input type="text" class="form-input" id="psmInspector" value="${_esc(d.inspector || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">입고 근거</label>
                        <input type="text" class="form-input" id="psmEvidenceNo" value="${_esc(d.evidenceNo || '')}" placeholder="거래명세서/발주번호 등">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <textarea class="form-textarea" id="psmNote" rows="3" placeholder="보관 위치, 특이사항, 확인 내용 등">${_esc(d.note || '')}</textarea>
                </div>
            </div>
        `;
    }

    function _collectData() {
        return {
            date: document.getElementById('psmDate').value,
            movementType: '입고',
            category: document.getElementById('psmCategory').value,
            itemName: document.getElementById('psmItemName').value.trim(),
            lotNo: document.getElementById('psmLotNo').value.trim(),
            quantity: Number(document.getElementById('psmQuantity').value) || 0,
            unit: document.getElementById('psmUnit').value,
            supplier: document.getElementById('psmSupplier').value.trim(),
            partName: document.getElementById('psmPartName').value.trim(),
            inspector: document.getElementById('psmInspector').value.trim(),
            evidenceNo: document.getElementById('psmEvidenceNo').value.trim(),
            note: document.getElementById('psmNote').value.trim()
        };
    }

    function _validate(data) {
        if (!data.date) return '입고일자를 입력하세요.';
        if (!data.itemName) return '부자재명을 입력하세요.';
        if (!data.quantity || data.quantity <= 0) return '입고수량을 0보다 크게 입력하세요.';
        if (!data.unit) return '단위를 선택하세요.';
        return '';
    }

    function openAddModal() {
        UIUtils.showModal('부자재 입고 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdSubMaterialsModule.saveNew()">등록</button>
        `, 'lg');
    }

    async function saveNew() {
        const data = _collectData();
        const err = _validate(data);
        if (err) { UIUtils.toast(err, 'warning'); return; }
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('부자재 입고 기록이 등록되었습니다.', 'success');
        search();
    }

    function edit(id) {
        const data = Storage.getById(STORE, id);
        if (!data) return;
        UIUtils.showModal('부자재 입고 수정', _formHtml(data), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdSubMaterialsModule.saveEdit('${_js(id)}')">저장</button>
        `, 'lg');
    }

    async function saveEdit(id) {
        const data = _collectData();
        const err = _validate(data);
        if (err) { UIUtils.toast(err, 'warning'); return; }
        await Storage.update(STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('부자재 입고 기록이 수정되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('부자재 입고 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            search();
        });
    }

    function exportData() {
        const data = _rows().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const rows = data.map(d => [
            d.date || '', d.category || '', d.itemName || '', d.lotNo || '',
            d.quantity || 0, d.unit || '', d.supplier || '', d.partName || '',
            d.inspector || '', d.evidenceNo || '', d.note || ''
        ]);
        Storage.exportToCSV(
            ['입고일자','구분','부자재명','LOT/관리번호','입고수량','단위','거래처','대상 품명','확인자','입고 근거','비고'],
            rows,
            '부자재입고관리'
        );
    }

    function _esc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function _js(s) {
        return String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
    };
})();

/**
 * 4) 초중종물 관리 (ProdQualityModule)
 */
var ProdQualityModule = (function() {
    const STORE = DB.STORES.PROD_QUALITY_CHECK;
    const PAINT_WORK_STORE = DB.STORES.PAINTING_WORK;
    const TEMPLATE_KIND   = 'quality_template';
    const ISSUE_KIND      = 'quality_issue';
    const ITEM_MASTER_KIND = 'quality_item_master';
    const PRESET_KIND     = 'quality_preset'; // 사용자 저장 프레셋


    const DEFAULT_ITEMS = [
        { key: 'film_under', label: '도막두께(하도)', unit: 'μm', spec: '', method: '도막 두께계', inputType: 'number' },
        { key: 'film_top', label: '도막두께(상도)', unit: 'μm', spec: '', method: '도막 두께계', inputType: 'number' },
        { key: 'adhesion', label: '부착력', unit: '등급', spec: '박리 없을 것', method: '크로스컷', inputType: 'text' },
        { key: 'injection_color', label: '사출품 컬러', unit: '-', spec: '기준 시편 대비 이색 없을 것', method: '육안', inputType: 'select' },
        { key: 'touch', label: '촉감', unit: '-', spec: '끈적임, 거칠음 없을 것', method: '촉감', inputType: 'select' },
        { key: 'fit_check', label: '형합 검사', unit: '-', spec: '간섭, 유격 없을 것', method: '조립 확인', inputType: 'select' },
        { key: 'appearance', label: '외관', unit: '-', spec: '흠, 이물, 흐름, 핀홀 없을 것', method: '육안', inputType: 'select' },
        { key: 'gloss', label: '광택', unit: 'GU', spec: '', method: '광택계', inputType: 'number' },
        { key: 'color_l', label: '색차 △L', unit: '△L', spec: '', method: '색차계', inputType: 'number' },
        { key: 'color_a', label: '색차 △a', unit: '△a', spec: '', method: '색차계', inputType: 'number' },
        { key: 'color_b', label: '색차 △b', unit: '△b', spec: '', method: '색차계', inputType: 'number' },
        { key: 'contamination', label: '이물/오염', unit: '-', spec: '이물 및 오염 없을 것', method: '육안', inputType: 'select' }
    ];

    const _esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _js = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="ProdQualityModule.openPresetMgmtModal()">
                            <span class="material-symbols-outlined">bookmarks</span> 프레셋 관리
                        </button>
                        <button class="btn btn-outline" onclick="ProdQualityModule.openItemListModal()">
                            <span class="material-symbols-outlined">list_alt</span> 관리항목
                        </button>
                        <button class="btn btn-secondary" onclick="ProdQualityModule.openBulkTemplateModal()">
                            <span class="material-symbols-outlined">library_add</span> 일괄 기준설정
                        </button>
                        <button class="btn btn-primary" onclick="ProdQualityModule.openAddModal()">
                            <span class="material-symbols-outlined">edit_document</span> 수기 작성
                        </button>
                    </div>
                </div>

                <!-- ── 차종별 기준 현황 ── -->
                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4><span class="material-symbols-outlined">tune</span> 차종별 기준 현황</h4>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <select class="form-select" id="pqStdFilterCar" style="height:36px;min-width:130px;" onchange="ProdQualityModule.renderStandardsCard()">
                                <option value="">전체 차종</option>
                                ${_carOptions('')}
                            </select>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div id="pqStandardsBody"></div>
                    </div>
                </div>

                <!-- ── C/S 발행 섹션 ── -->
                <div class="filter-bar" style="flex-wrap:wrap; gap:10px;">
                    <div class="form-group">
                        <label class="form-label">시작일</label>
                        <input type="date" class="form-input" id="pqFilterStart" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">종료일</label>
                        <input type="date" class="form-input" id="pqFilterEnd" value="${UIUtils.today()}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">차종</label>
                        <select class="form-select" id="pqFilterCar">
                            <option value="">전체</option>
                            ${_carOptions('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-self:flex-end;">
                        <button class="btn btn-outline" onclick="ProdQualityModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>

                <div class="stat-cards" id="pqStats"></div>

                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">format_paint</span> 도장 작업일지 기준 발행 대상</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>작업일</th><th>라인</th><th>차종</th><th>품명</th><th>컬러</th><th>생산 LOT</th><th>산출수량</th><th>작성</th><th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pqWorkBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h4><span class="material-symbols-outlined">receipt_long</span> 발행 이력</h4>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>No</th><th>발행일</th><th>구분</th><th>라인</th><th>차종/품명</th><th>LOT</th><th>항목수</th><th>상태</th><th>검사자</th><th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="pqTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        /* 배합기준표에서 관리계획서 버튼으로 진입한 경우 차종 자동 선택 */
        const preFilterCar = sessionStorage.getItem('mixStd_qualityFilter_car');
        if (preFilterCar) {
            const carSel = document.getElementById('pqFilterCar');
            if (carSel) carSel.value = preFilterCar;
            sessionStorage.removeItem('mixStd_qualityFilter_car');
            sessionStorage.removeItem('mixStd_qualityFilter_part');
        }
        renderStandardsCard();
        search();
    }

    // ── 차종별 기준 현황 카드 렌더링 ─────────────────────────────────────────
    function renderStandardsCard() {
        const el = document.getElementById('pqStandardsBody');
        if (!el) return;
        const carFilter = document.getElementById('pqStdFilterCar')?.value || '';
        const combos = _carColorCombos().filter(c => !carFilter || c.carModel === carFilter);

        if (!combos.length) {
            el.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:32px;display:block;margin-bottom:8px;opacity:.4;">tune</span>
                등록된 제품 또는 도장 작업일지가 없습니다.
            </div>`;
            return;
        }

        const configured = combos.filter(c => {
            const t = _exactTemplateFor(c.carModel, c.color);
            return t && Array.isArray(t.items) && t.items.length > 0;
        }).length;
        const total = combos.length;

        el.innerHTML = `
            <div style="display:flex;gap:8px;padding:10px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);font-size:0.82rem;flex-wrap:wrap;">
                <span style="color:var(--text-muted);">전체 <strong style="color:var(--text-primary);">${total}</strong>개 차종/컬러</span>
                <span style="color:var(--accent-green);font-weight:600;">✓ 설정완료 ${configured}</span>
                <span style="color:var(--accent-orange);font-weight:600;">⚠ 미설정 ${total - configured}</span>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>차종</th>
                            <th>컬러</th>
                            <th>대상 품목</th>
                            <th style="text-align:center;">관리항목 수</th>
                            <th style="text-align:center;">상태</th>
                            <th style="text-align:center;">기준 설정</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${combos.map(combo => {
                            const tmpl = _exactTemplateFor(combo.carModel, combo.color);
                            const itemCount = tmpl && Array.isArray(tmpl.items) ? tmpl.items.length : 0;
                            const hasTmpl = itemCount > 0;
                            const parts = combo.parts.filter(p => p !== '기준설정').join(', ') || '-';
                            return `
                                <tr style="${!hasTmpl ? 'background:rgba(251,146,60,0.04);' : ''}">
                                    <td><strong>${_esc(combo.carModel)}</strong></td>
                                    <td>${_esc(combo.color) || '<span style="color:var(--text-muted);font-size:0.8rem;">공통</span>'}</td>
                                    <td style="font-size:0.8rem;color:var(--text-muted);max-width:200px;">${_esc(parts)}</td>
                                    <td style="text-align:center;">
                                        ${hasTmpl
                                            ? `<strong style="color:var(--accent-blue);">${itemCount}</strong>`
                                            : `<span style="color:var(--text-muted);">-</span>`}
                                    </td>
                                    <td style="text-align:center;">
                                        ${hasTmpl
                                            ? `<span class="badge badge-success">✓ 설정완료</span>`
                                            : `<span class="badge badge-warning">미설정</span>`}
                                    </td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm ${hasTmpl ? 'btn-outline' : 'btn-primary'}"
                                            onclick="ProdQualityModule.openTemplateModal('${_js(combo.carModel)}','${_js(combo.color)}')">
                                            ${hasTmpl ? '수정' : '기준 설정'}
                                        </button>
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function search() {
        const start = document.getElementById('pqFilterStart').value;
        const end = document.getElementById('pqFilterEnd').value;
        const car = document.getElementById('pqFilterCar')?.value || '';

        let works = (Storage.getAll(PAINT_WORK_STORE) || [])
            .filter(w => (!start || w.date >= start) && (!end || w.date <= end))
            .filter(w => !car || w.carModel === car)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        let data = (Storage.getAll(STORE) || [])
            .filter(d => (d._docKind || ISSUE_KIND) === ISSUE_KIND)
            .filter(d => (!start || d.date >= start) && (!end || d.date <= end))
            .filter(d => !car || d.carModel === car)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        renderStats(works, data);
        renderWorkTable(works);
        renderTable(data);
    }

    function renderStats(works, issues) {
        const issuedWorkIds = new Set(issues.map(i => i.workId).filter(Boolean));
        const configuredCars = new Set(_templates().map(t => `${t.carModel || ''}||${t.color || ''}`));
        const el = document.getElementById('pqStats');
        if (!el) return;
        el.innerHTML = `
            <div class="stat-card blue"><div class="stat-card-value">${works.length}</div><div class="stat-card-label">도장 작업 건수</div></div>
            <div class="stat-card green"><div class="stat-card-value">${issues.length}</div><div class="stat-card-label">C/S 발행</div></div>
            <div class="stat-card orange"><div class="stat-card-value">${works.filter(w => !issuedWorkIds.has(w.id)).length}</div><div class="stat-card-label">미발행</div></div>
            <div class="stat-card purple"><div class="stat-card-value">${configuredCars.size}</div><div class="stat-card-label">기준설정 차종/컬러</div></div>
        `;
    }

    function renderWorkTable(works) {
        const tbody = document.getElementById('pqWorkBody');
        if (!tbody) return;
        if (!works.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;">해당 기간의 도장 작업일지가 없습니다.</td></tr>`;
            return;
        }
        const issueMap = new Map(_issues().filter(i => i.workId).map(i => [i.workId, i]));
        tbody.innerHTML = works.map(w => {
            const tmpl = _templateFor(w.carModel, w.color);
            const hasTemplate = !!tmpl;
            const issue = issueMap.get(w.id);
            return `
                <tr>
                    <td>${_esc(w.date || '-')}</td>
                    <td>${_esc(w.line || '-')}</td>
                    <td><strong>${_esc(w.carModel || '-')}</strong></td>
                    <td>${_esc(w.partName || '-')}</td>
                    <td>${_esc(w.color || '-')}</td>
                    <td style="font-family:monospace;font-size:0.8rem;">${_esc(w.lotNo || '-')}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(w.productionQty || 0)}</td>
                    <td>${issue ? '<span class="badge badge-success">작성완료</span>' : (hasTemplate ? `<span class="badge badge-info">${(tmpl.items || []).length}항목</span>` : '<span class="badge badge-warning">기본값</span>')}</td>
                    <td style="white-space:nowrap;">
                        ${issue ? `<button class="btn btn-sm btn-primary" onclick="ProdQualityModule.printIssue('${_js(issue.id)}')">인쇄</button>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="ProdQualityModule.openWriteFromWork('${_js(w.id)}')">${issue ? '재작성' : '작성'}</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function renderTable(data) {
        const tbody = document.getElementById('pqTableBody');
        tbody.innerHTML = data.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:30px;">기록이 없습니다.</td></tr>` :
            data.map((d, i) => `
                <tr>
                    <td>${data.length - i}</td>
                    <td>${_esc(d.date || '')}</td>
                    <td><span class="badge ${d.type === '초물' ? 'badge-info' : d.type === '중물' ? 'badge-warning' : 'badge-success'}">${d.type}</span></td>
                    <td>${_esc(d.line || '-')}</td>
                    <td><strong>${_esc(d.carModel || '-')}</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">${_esc(d.partName || '-')}</span></td>
                    <td style="font-family:monospace;font-size:0.8rem;">${_esc(d.lotNo || '-')}</td>
                    <td style="text-align:right;">${(d.items || []).length}</td>
                    <td><span class="badge badge-success">${_esc(d.status || '발행')}</span></td>
                    <td>${_esc(d.inspector || '-')}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-primary" onclick="ProdQualityModule.printIssue('${_js(d.id)}')">C/S 인쇄</button>
                        <button class="btn btn-sm btn-outline" onclick="ProdQualityModule.edit('${_js(d.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="ProdQualityModule.remove('${_js(d.id)}')">삭제</button>
                    </td>
                </tr>
            `).join('');
    }

    function _issues() {
        return (Storage.getAll(STORE) || []).filter(d => (d._docKind || ISSUE_KIND) === ISSUE_KIND);
    }

    function _templates() {
        return (Storage.getAll(STORE) || []).filter(d => d._docKind === TEMPLATE_KIND);
    }

    function _normText(v) {
        return String(v || '').trim();
    }

    function _templateFor(carModel, color = '') {
        const car = _normText(carModel);
        const clr = _normText(color);
        const rows = _templates().filter(t => _normText(t.carModel) === car);
        if (clr) {
            const exact = rows.find(t => _normText(t.color) === clr);
            if (exact) return exact;
        }
        return rows.find(t => !_normText(t.color)) || rows[0] || null;
    }

    function _exactTemplateFor(carModel, color = '') {
        return _templates().find(t =>
            _normText(t.carModel) === _normText(carModel) &&
            _normText(t.color) === _normText(color)
        ) || null;
    }

    function _masterItemRecord() {
        return (Storage.getAll(STORE) || []).find(d => d._docKind === ITEM_MASTER_KIND) || null;
    }

    function _masterItems() {
        const rec = _masterItemRecord();
        return rec && Array.isArray(rec.items) && rec.items.length
            ? _normalizeQualityItems(rec.items)
            : DEFAULT_ITEMS.map(item => ({ ...item }));
    }

    function _itemsForCar(carModel, color = '') {
        const tmpl = _templateFor(carModel, color);
        const items = tmpl && Array.isArray(tmpl.items) && tmpl.items.length
            ? tmpl.items
            : _masterItems().map(item => ({ ...item, selected: true }));
        return _normalizeQualityItems(items);
    }

    function _normalizeQualityItems(items = []) {
        const out = [];
        items.forEach(item => {
            if (item.key === 'color_diff' || item.label === '색차' || item.unit === 'ΔE') {
                ['L', 'a', 'b'].forEach(axis => {
                    out.push({
                        ...item,
                        key: `color_${axis.toLowerCase()}`,
                        label: `색차 △${axis}`,
                        unit: `△${axis}`,
                        method: item.method || '색차계'
                    });
                });
            } else {
                out.push(item);
            }
        });
        const seen = new Set();
        return out.filter(item => {
            const key = item.key || item.label;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function _carOptions(selected) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const workCars = (Storage.getAll(PAINT_WORK_STORE) || []).map(w => w.carModel);
        const cars = [...new Set([...products.map(p => p.carModel), ...workCars].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return cars.map(c => `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`).join('');
    }

    function _colorOptions(carModel, selected = '') {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const workColors = (Storage.getAll(PAINT_WORK_STORE) || [])
            .filter(w => !carModel || w.carModel === carModel)
            .map(w => w.color);
        const productColors = products
            .filter(p => !carModel || p.carModel === carModel)
            .map(p => p.color || p.paintColor || p.paint || p.drawingColor);
        const colors = [...new Set([...productColors, ...workColors].map(v => _normText(v)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return colors.map(c => `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`).join('');
    }

    function _carColorCombos() {
        const map = new Map();
        const add = (car, color, partName = '') => {
            car = _normText(car);
            color = _normText(color);
            if (!car) return;
            const key = `${car}||${color}`;
            const cur = map.get(key) || { carModel: car, color, parts: new Set() };
            if (partName) cur.parts.add(partName);
            map.set(key, cur);
        };
        (Storage.getAll(DB.STORES.PRODUCTS) || []).forEach(p => {
            add(p.carModel, p.color || p.paintColor || p.paint || p.drawingColor, p.partName);
        });
        (Storage.getAll(PAINT_WORK_STORE) || []).forEach(w => add(w.carModel, w.color, w.partName));
        _templates().forEach(t => add(t.carModel, t.color, '기준설정'));
        return [...map.values()]
            .sort((a, b) => a.carModel.localeCompare(b.carModel, 'ko') || a.color.localeCompare(b.color, 'ko'))
            .map(v => ({ ...v, parts: [...v.parts] }));
    }

    function _partOptions(carModel, selected) {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const workParts = (Storage.getAll(PAINT_WORK_STORE) || [])
            .filter(w => !carModel || w.carModel === carModel)
            .map(w => w.partName);
        const parts = [...new Set([...products.filter(p => !carModel || p.carModel === carModel).map(p => p.partName), ...workParts].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        return parts.map(p => `<option value="${_esc(p)}" ${p === selected ? 'selected' : ''}>${_esc(p)}</option>`).join('');
    }

    function _typeRowsHtml(values = {}) {
        return ['초물', '중물', '종물'].map(type => `
            <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;">
                <input type="checkbox" class="pq-type-check" value="${type}" ${(values.types || ['초물','중물','종물']).includes(type) ? 'checked' : ''}>
                ${type}
            </label>`).join('');
    }

    function fillForm(d = {}) {
        const items = d.items || _itemsForCar(d.carModel || '', d.color || '');
        const compactGridTop = 'display:grid;grid-template-columns:0.9fr 1fr 1.6fr;gap:8px 12px;margin-bottom:8px;';
        const compactGrid = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;margin-bottom:8px;';
        const compactGrid4 = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 12px;margin-bottom:8px;';
        const compactField = 'display:flex;align-items:center;gap:7px;min-width:0;';
        const compactLabel = 'font-size:0.82rem;font-weight:700;color:var(--text-secondary);white-space:nowrap;min-width:64px;';
        const compactInput = 'height:34px;font-size:0.8rem;min-width:0;flex:1;padding:4px 10px;line-height:1.2;';
        const compactSelect = compactInput + 'padding-right:30px;';
        return `
            <div style="${compactGridTop}">
                <div style="${compactField}">
                    <label style="${compactLabel}">발행일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="pqDate" value="${d.date || UIUtils.today()}" style="${compactInput}">
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pqCarModel" onchange="ProdQualityModule.onIssueCarChange()" style="${compactSelect}">
                        <option value="">차종 선택</option>${_carOptions(d.carModel || '')}
                    </select>
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">품명</label>
                    <select class="form-select" id="pqPartName" style="${compactSelect}">${_partOptions(d.carModel || '', d.partName || '')}</select>
                </div>
            </div>
            <div style="${compactGrid}">
                <div style="${compactField}">
                    <label style="${compactLabel}">구분</label>
                    <div style="display:flex;gap:9px;align-items:center;min-width:0;flex:1;font-size:0.8rem;">${_typeRowsHtml(d)}</div>
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">라인</label>
                    <input type="text" class="form-input" id="pqLine" value="${_esc(d.line || '')}" placeholder="예: A라인" style="${compactInput}">
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">생산 LOT</label>
                    <input type="text" class="form-input" id="pqLotNo" value="${_esc(d.lotNo || '')}" style="${compactInput}">
                </div>
            </div>
            <div style="${compactGrid4}">
                <div style="${compactField}">
                    <label style="${compactLabel}">검사자</label>
                    <input type="text" class="form-input" id="pqInspector" value="${_esc(d.inspector || '')}" style="${compactInput}">
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">컬러</label>
                    <input type="text" class="form-input" id="pqColor" value="${_esc(d.color || '')}" onchange="ProdQualityModule.onIssueCarChange()" style="${compactInput}">
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">생산수량</label>
                    <input type="number" class="form-input" id="pqProductionQty" value="${d.productionQty || ''}" style="${compactInput}text-align:right;">
                </div>
                <div style="${compactField}">
                    <label style="${compactLabel}">시간</label>
                    <input type="text" class="form-input" id="pqTime" value="${_esc(d.time || '')}" placeholder="예: 09:30" style="${compactInput}">
                </div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;margin:8px 0;">
                <div style="padding:7px 10px;background:var(--bg-secondary);font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span>발행 관리항목</span>
                    <button type="button" class="btn btn-sm btn-outline" onclick="ProdQualityModule.addIssueItemRow()" style="padding:4px 8px;font-size:0.75rem;">
                        <span class="material-symbols-outlined" style="font-size:0.95rem;">add</span> 항목 추가
                    </button>
                </div>
                <div id="pqIssueItems" style="max-height:none;overflow:visible;">
                    ${_issueItemRows(items)}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <textarea class="form-textarea" id="pqNote" rows="2" style="min-height:52px;">${_esc(d.note || '')}</textarea>
            </div>
        `;
    }

    // SPC 자동 연동 대상 수치 항목 판별
    const _SPC_NUMERIC_KEYS = new Set(['film_under','film_top','gloss','color_l','color_a','color_b']);
    function _isNumericItem(item) {
        return item.inputType === 'number'
            || _SPC_NUMERIC_KEYS.has(item.key)
            || /^(μm|GU|△L|△a|△b)$/.test((item.unit||'').trim());
    }

    function _issueItemRows(items) {
        return `
            <table class="data-table pq-issue-table" style="font-size:0.72rem;">
                <thead>
                    <tr>
                        <th style="width:22%;">관리항목</th>
                        <th>기준</th>
                        <th style="width:20%;">측정방법</th>
                        <th style="width:58px;">단위</th>
                        <th style="width:62px;background:rgba(59,130,246,0.06);color:var(--accent-blue,#3b82f6);">초물</th>
                        <th style="width:62px;background:rgba(59,130,246,0.06);color:var(--accent-blue,#3b82f6);">중물</th>
                        <th style="width:62px;background:rgba(59,130,246,0.06);color:var(--accent-blue,#3b82f6);">종물</th>
                        <th style="width:48px;">삭제</th>
                    </tr>
                </thead>
                <tbody id="pqIssueItemsBody">
                    ${items.map(item => _issueItemRowHtml(item)).join('')}
                </tbody>
            </table>`;
    }

    function _issueItemRowHtml(item = {}) {
        const isNum = _isNumericItem(item);
        const vals  = item.vals || {};
        const vInp  = (cls, val) => isNum
            ? `<td style="padding:2px 3px;background:rgba(59,130,246,0.03);">
                   <input type="number" step="0.01" class="form-input ${cls}" value="${val??''}"
                       style="width:56px;height:30px;padding:3px 5px;font-size:0.78rem;text-align:right;">
               </td>`
            : `<td style="text-align:center;color:var(--text-muted);background:rgba(59,130,246,0.03);">-</td>`;
        return `
            <tr class="pq-issue-item-row">
                <td>
                    <input type="hidden" class="pq-item-key"     value="${_esc(item.key || Storage.generateId())}">
                    <input type="hidden" class="pq-item-numeric" value="${isNum?'1':'0'}">
                    <input type="text" class="form-input pq-item-label" value="${_esc(item.label || '')}"
                        style="min-width:100px;height:30px;padding:4px 6px;font-size:0.78rem;">
                </td>
                <td><input type="text" class="form-input pq-item-spec" value="${_esc(item.spec || '')}"
                    placeholder="차종별 기준" style="height:30px;padding:4px 6px;font-size:0.78rem;"></td>
                <td><input type="text" class="form-input pq-item-method" value="${_esc(item.method || '')}"
                    style="height:30px;padding:4px 6px;font-size:0.78rem;"></td>
                <td><input type="text" class="form-input pq-item-unit" value="${_esc(item.unit || '')}"
                    style="width:54px;height:30px;padding:4px 5px;font-size:0.78rem;text-align:center;"></td>
                ${vInp('pq-item-val1', vals['초물'])}
                ${vInp('pq-item-val2', vals['중물'])}
                ${vInp('pq-item-val3', vals['종물'])}
                <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-danger"
                        onclick="ProdQualityModule.removeIssueItemRow(this)"
                        style="padding:3px 6px;font-size:0.72rem;">삭제</button>
                </td>
            </tr>`;
    }

    function addIssueItemRow() {
        const body = document.getElementById('pqIssueItemsBody');
        if (!body) return;
        body.insertAdjacentHTML('beforeend', _issueItemRowHtml({
            key: Storage.generateId(),
            label: '',
            spec: '',
            method: '',
            unit: ''
        }));
        const input = body.querySelector('tr:last-child .pq-item-label');
        if (input) input.focus();
    }

    function removeIssueItemRow(btn) {
        const rows = document.querySelectorAll('.pq-issue-item-row');
        if (rows.length <= 1) {
            UIUtils.toast('관리항목은 최소 1개 이상 필요합니다.', 'warning');
            return;
        }
        const row = btn && btn.closest ? btn.closest('.pq-issue-item-row') : null;
        if (row) row.remove();
    }

    function collectData() {
        const types = [...document.querySelectorAll('.pq-type-check:checked')].map(el => el.value);
        const items = [...document.querySelectorAll('.pq-issue-item-row')].map(row => {
            const isNum = row.querySelector('.pq-item-numeric')?.value === '1';
            const obj = {
                key:    row.querySelector('.pq-item-key')?.value    || Storage.generateId(),
                label:  row.querySelector('.pq-item-label')?.value.trim()  || '',
                spec:   row.querySelector('.pq-item-spec')?.value.trim()   || '',
                method: row.querySelector('.pq-item-method')?.value.trim() || '',
                unit:   row.querySelector('.pq-item-unit')?.value.trim()   || ''
            };
            if (isNum) {
                // 초물/중물/종물 순서는 types 배열 기준
                const typeKeys = types.length ? types : ['초물','중물','종물'];
                const raw = [
                    row.querySelector('.pq-item-val1')?.value,
                    row.querySelector('.pq-item-val2')?.value,
                    row.querySelector('.pq-item-val3')?.value
                ];
                const vals = {};
                typeKeys.forEach((t, idx) => {
                    const v = parseFloat(raw[idx]);
                    if (!isNaN(v)) vals[t] = v;
                });
                if (Object.keys(vals).length) obj.vals = vals;
            }
            return obj;
        }).filter(i => i.label);
        return {
            _docKind: ISSUE_KIND,
            date: document.getElementById('pqDate').value,
            type: types.join('/'),
            types,
            line: document.getElementById('pqLine').value.trim(),
            carModel: document.getElementById('pqCarModel').value.trim(),
            partName: document.getElementById('pqPartName').value.trim(),
            lotNo: document.getElementById('pqLotNo').value.trim(),
            color: document.getElementById('pqColor')?.value.trim() || '',
            productionQty: Number(document.getElementById('pqProductionQty')?.value) || 0,
            time: document.getElementById('pqTime')?.value.trim() || '',
            items,
            status: '발행',
            inspector: document.getElementById('pqInspector').value.trim(),
            note: document.getElementById('pqNote').value.trim()
        };
    }

    function openAddModal() {
        UIUtils.showModal('초중종물 C/S 수기 작성', fillForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdQualityModule.saveNew()">발행</button>`, 'xl');
    }

    async function saveNew() {
        const data = collectData();
        if (!data.date || !data.carModel) { UIUtils.toast('발행일자와 차종을 입력하세요.', 'warning'); return; }
        if (!data.items.length) { UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning'); return; }
        const saved = await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('초중종물 C/S가 발행되었습니다.', 'success');
        search();
        printIssue(saved.id);
    }

    function edit(id) {
        const d = Storage.getById(STORE, id);
        UIUtils.showModal('초중종물 C/S 수정', fillForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="ProdQualityModule.saveEdit('${id}')">저장</button>`, 'xl');
    }

    async function saveEdit(id) {
        const data = collectData();
        if (!data.date || !data.carModel) { UIUtils.toast('발행일자와 차종을 입력하세요.', 'warning'); return; }
        if (!data.items.length) { UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning'); return; }
        const existing = Storage.getById(STORE, id) || {};
        await Storage.update(STORE, id, { ...existing, ...data });
        UIUtils.closeModal();
        UIUtils.toast('저장되었습니다.', 'success');
        search();
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            search();
        });
    }

    function exportData() {
        const data = _issues();
        const headers = ['발행일', '구분', '라인', '차종', '품명', '생산 LOT', '항목수', '상태', '검사자', '비고'];
        const rows = data.map(d => [d.date, d.type, d.line, d.carModel, d.partName, d.lotNo, (d.items || []).length, d.status, d.inspector, d.note]);
        Storage.exportToCSV(headers, rows, '초중종물관리');
    }

    function openWriteFromWork(workId) {
        const work = Storage.getById(PAINT_WORK_STORE, workId);
        if (!work) return;
        const existing = _issues().find(i => i.workId === workId);
        const base = existing || {
            _docKind: ISSUE_KIND,
            workId,
            date: work.date || UIUtils.today(),
            type: '초물/중물/종물',
            types: ['초물', '중물', '종물'],
            line: work.line || '',
            carModel: work.carModel || '',
            partName: work.partName || '',
            color: work.color || '',
            lotNo: work.lotNo || ((work.lots || []).map(l => l.lotNo).filter(Boolean).join(', ')),
            productionQty: Number(work.productionQty) || 0,
            time: '',
            items: _itemsForCar(work.carModel, work.color).filter(item => item.selected !== false).map(item => ({ ...item })),
            status: '작성',
            inspector: '',
            note: ''
        };
        if (!base.items.length) {
            UIUtils.toast('해당 차종의 관리항목을 먼저 선택하세요.', 'warning');
            openTemplateModal(work.carModel || '', work.color || '');
            return;
        }
        UIUtils.showModal('초중종물 C/S 작성', fillForm(base), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule.saveWriteAndPrint('${_js(workId)}','${_js(existing ? existing.id : '')}')">발행</button>
        `, 'xl');
    }

    async function saveWriteAndPrint(workId, issueId = '') {
        const data = collectData();
        data.workId = workId || data.workId || '';
        data.status = '발행';
        if (!data.date || !data.carModel) { UIUtils.toast('발행일자와 차종을 입력하세요.', 'warning'); return; }
        if (!data.items.length) { UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning'); return; }
        let saved;
        if (issueId) {
            const existing = Storage.getById(STORE, issueId) || {};
            saved = await Storage.update(STORE, issueId, { ...existing, ...data });
        } else {
            saved = await Storage.add(STORE, data);
        }
        UIUtils.closeModal();
        search();
        printIssue(saved.id);
    }

    async function issueFromWork(workId) {
        const work = Storage.getById(PAINT_WORK_STORE, workId);
        if (!work) return;
        const items = _itemsForCar(work.carModel, work.color).filter(item => item.selected !== false);
        if (!items.length) {
            UIUtils.toast('해당 차종의 관리항목을 먼저 선택하세요.', 'warning');
            openTemplateModal(work.carModel || '', work.color || '');
            return;
        }
        const data = {
            _docKind: ISSUE_KIND,
            workId,
            date: work.date || UIUtils.today(),
            type: '초물/중물/종물',
            types: ['초물', '중물', '종물'],
            line: work.line || '',
            carModel: work.carModel || '',
            partName: work.partName || '',
            color: work.color || '',
            lotNo: work.lotNo || ((work.lots || []).map(l => l.lotNo).filter(Boolean).join(', ')),
            productionQty: Number(work.productionQty) || 0,
            items: items.map(item => ({ ...item })),
            status: '발행',
            inspector: '',
            note: ''
        };
        const existing = _issues().find(i => i.workId === workId);
        if (existing) await Storage.update(STORE, existing.id, data);
        else await Storage.add(STORE, data);
        UIUtils.toast('초중종물 C/S가 발행되었습니다.', 'success');
        search();
    }

    function openItemListModal() {
        UIUtils.showModal('관리항목 편집', _itemMasterFormHtml(_masterItems()), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule.saveItemMaster()">저장</button>
        `, 'xl');
    }

    function _itemMasterFormHtml(items) {
        return `
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">
                초중종물 C/S에 사용할 기본 관리항목입니다. 차종/컬러별 기준설정 화면의 기본 항목으로 사용됩니다.
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px;">
                <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.deleteCheckedMasterItems()">
                    <span class="material-symbols-outlined">delete</span> 선택 삭제
                </button>
                <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.addMasterItemRow()">
                    <span class="material-symbols-outlined">add</span> 관리항목 추가
                </button>
            </div>
            <div class="data-table-wrapper" style="max-height:60vh;overflow:auto;">
                <table class="data-table" style="font-size:0.82rem;">
                    <thead>
                        <tr>
                            <th style="width:54px;">선택</th><th>관리항목</th><th>기본 기준</th><th>측정방법</th>
                            <th style="width:90px;">단위</th><th style="width:110px;">입력유형</th>
                        </tr>
                    </thead>
                    <tbody id="pqMasterItemsBody">${items.map(item => _masterItemRowHtml(item)).join('')}</tbody>
                </table>
            </div>`;
    }

    function _masterItemRowHtml(item = {}) {
        return `
            <tr class="pq-master-item-row">
                <td style="text-align:center;"><input type="checkbox" class="pq-master-delete"></td>
                <td>
                    <input type="hidden" class="pq-master-key" value="${_esc(item.key || Storage.generateId())}">
                    <input type="text" class="form-input pq-master-label" value="${_esc(item.label || '')}" placeholder="관리항목명">
                </td>
                <td><input type="text" class="form-input pq-master-spec" value="${_esc(item.spec || '')}" placeholder="기본 기준"></td>
                <td><input type="text" class="form-input pq-master-method" value="${_esc(item.method || '')}" placeholder="측정방법"></td>
                <td><input type="text" class="form-input pq-master-unit" value="${_esc(item.unit || '')}" placeholder="단위"></td>
                <td>
                    <select class="form-select pq-master-input-type">
                        ${['number','text','select'].map(v => `<option value="${v}" ${(item.inputType || 'text') === v ? 'selected' : ''}>${v === 'number' ? '숫자' : v === 'select' ? '합/불' : '텍스트'}</option>`).join('')}
                    </select>
                </td>
            </tr>`;
    }

    function addMasterItemRow() {
        const body = document.getElementById('pqMasterItemsBody');
        if (!body) return;
        body.insertAdjacentHTML('beforeend', _masterItemRowHtml({ selected: true, inputType: 'text' }));
        body.querySelector('tr:last-child .pq-master-label')?.focus();
    }

    function deleteCheckedMasterItems() {
        const rows = [...document.querySelectorAll('.pq-master-item-row')];
        const targets = rows.filter(row => row.querySelector('.pq-master-delete')?.checked);
        if (!targets.length) {
            UIUtils.toast('삭제할 관리항목을 체크하세요.', 'warning');
            return;
        }
        if (targets.length >= rows.length) {
            UIUtils.toast('관리항목은 최소 1개 이상 남겨야 합니다.', 'warning');
            return;
        }
        targets.forEach(row => row.remove());
        UIUtils.toast(`${targets.length}개 관리항목을 삭제했습니다. 저장을 눌러 반영하세요.`, 'success');
    }

    async function saveItemMaster() {
        const items = [...document.querySelectorAll('.pq-master-item-row')].map(row => ({
            key: row.querySelector('.pq-master-key')?.value || Storage.generateId(),
            label: row.querySelector('.pq-master-label')?.value.trim() || '',
            spec: row.querySelector('.pq-master-spec')?.value.trim() || '',
            method: row.querySelector('.pq-master-method')?.value.trim() || '',
            unit: row.querySelector('.pq-master-unit')?.value.trim() || '',
            inputType: row.querySelector('.pq-master-input-type')?.value || 'text',
            selected: true
        })).filter(item => item.label);
        if (!items.length) {
            UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning');
            return;
        }
        const existing = _masterItemRecord();
        const payload = { _docKind: ITEM_MASTER_KIND, items, updatedAt: UIUtils.now() };
        if (existing) await Storage.update(STORE, existing.id, payload);
        else await Storage.add(STORE, payload);
        UIUtils.closeModal();
        UIUtils.toast('관리항목이 저장되었습니다.', 'success');
        search();
    }

    function openTemplateModal(carModel = '', color = '') {
        const selectedCar   = carModel || (document.getElementById('pqFilterCar')?.value || '');
        const selectedColor = color || '';
        const tmpl      = _templateFor(selectedCar, selectedColor);
        const hasTemplate = !!(tmpl && Array.isArray(tmpl.items) && tmpl.items.length > 0);
        const items = hasTemplate
            ? _normalizeQualityItems(tmpl.items)
            : _masterItems().map(item => ({ ...item, selected: true }));
        UIUtils.showModal('차종/컬러별 초중종물 기준설정',
            _templateFormHtml(selectedCar, selectedColor, items, hasTemplate), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule.saveTemplate()">저장</button>
        `, 'xl');
    }

    // hasTemplate: 현재 차종에 저장된 기준이 있는지 여부
    function _templateFormHtml(carModel, color, items, hasTemplate) {
        const userPresets = (Storage.getAll(STORE) || []).filter(d => d._docKind === PRESET_KIND);

        // ── 프레셋 선택 드롭다운 ──
        const presetRow = userPresets.length ? `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;
                        background:var(--bg-secondary);border-radius:8px;padding:10px 12px;border:1px solid var(--border-color);">
                <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--accent-blue);flex-shrink:0;">bookmarks</span>
                <select class="form-select" id="pqPresetSelector" style="flex:1;">
                    <option value="">프레셋 선택 — 선택 시 아래 관리항목이 자동으로 채워집니다</option>
                    ${userPresets.map(p => `<option value="${_esc(p.id)}">${_esc(p.name)} (${(p.items||[]).length}항목)</option>`).join('')}
                </select>
                <button type="button" class="btn btn-primary btn-sm" onclick="ProdQualityModule.applyPresetFromSelect()" style="white-space:nowrap;flex-shrink:0;">
                    적용
                </button>
            </div>` : `
            <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;margin-bottom:12px;
                        background:rgba(251,146,60,0.07);border-radius:8px;border:1px solid rgba(251,146,60,0.3);font-size:0.82rem;color:#92400e;">
                <span class="material-symbols-outlined" style="font-size:1rem;">info</span>
                저장된 프레셋이 없습니다. 먼저
                <button type="button" class="btn btn-outline btn-sm"
                    onclick="UIUtils.closeModal();ProdQualityModule.openPresetMgmtModal()"
                    style="font-size:0.78rem;border-color:#c2660a;color:#92400e;">
                    프레셋 관리
                </button>에서 프레셋을 만드세요.
            </div>`;

        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="pqTplCarModel" onchange="ProdQualityModule.reloadTemplateForCar()">
                        <option value="">차종 선택</option>${_carOptions(carModel)}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <select class="form-select" id="pqTplColor" onchange="ProdQualityModule.reloadTemplateForCar()">
                        <option value="">전체 컬러/공통 기준</option>${_colorOptions(carModel, color)}
                    </select>
                </div>
            </div>

            ${presetRow}

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    ${hasTemplate
                        ? `<span style="color:var(--accent-green);font-weight:600;">✓ 저장된 기준이 있습니다.</span> 항목을 수정하고 저장하세요.`
                        : `기준이 없습니다. 프레셋을 적용하거나 직접 입력하세요.`}
                    <span style="margin-left:4px;color:var(--text-muted);font-size:0.75rem;">컬러가 비어 있으면 해당 차종 공통 기준으로 사용됩니다.</span>
                </span>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.deleteCheckedTemplateItems()">
                        <span class="material-symbols-outlined">delete</span> 선택 삭제
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.addTemplateItemRow()">
                        <span class="material-symbols-outlined">add</span> 항목 추가
                    </button>
                </div>
            </div>
            <div class="data-table-wrapper" style="max-height:40vh;overflow:auto;">
                <table class="data-table" style="font-size:0.82rem;">
                    <thead><tr>
                        <th style="width:60px;">사용</th><th style="width:74px;">순서</th>
                        <th>관리항목</th><th>기준</th><th>측정방법</th><th>단위</th>
                        <th style="width:60px;">삭제</th>
                    </tr></thead>
                    <tbody id="pqTemplateItemsBody">
                        ${items.map(item => _templateItemRowHtml(item)).join('')}
                    </tbody>
                </table>
            </div>`;
    }   // ── end _templateFormHtml ──

    function _templateItemRowHtml(item = {}) {
        return `
            <tr class="pq-template-item-row">
                <td style="text-align:center;"><input type="checkbox" class="pq-tpl-selected" ${item.selected === false ? '' : 'checked'}></td>
                <td style="text-align:center;white-space:nowrap;">
                    <button type="button" class="btn btn-sm btn-outline" onclick="ProdQualityModule.moveTemplateItemRow(this, -1)" title="위로 이동" style="padding:3px 6px;min-width:28px;">↑</button>
                    <button type="button" class="btn btn-sm btn-outline" onclick="ProdQualityModule.moveTemplateItemRow(this, 1)" title="아래로 이동" style="padding:3px 6px;min-width:28px;">↓</button>
                </td>
                <td>
                    <input type="hidden" class="pq-tpl-key" value="${_esc(item.key || Storage.generateId())}">
                    <input type="text" class="form-input pq-tpl-label" value="${_esc(item.label || '')}" placeholder="관리항목명">
                </td>
                <td><input type="text" class="form-input pq-tpl-spec" value="${_esc(item.spec || '')}" placeholder="예: 15~20"></td>
                <td><input type="text" class="form-input pq-tpl-method" value="${_esc(item.method || '')}" placeholder="측정방법"></td>
                <td><input type="text" class="form-input pq-tpl-unit" value="${_esc(item.unit || '')}" style="width:90px;" placeholder="단위"></td>
                <td style="text-align:center;"><input type="checkbox" class="pq-tpl-delete"></td>
            </tr>`;
    }

    function addTemplateItemRow() {
        const body = document.getElementById('pqTemplateItemsBody');
        if (!body) return;
        body.insertAdjacentHTML('beforeend', _templateItemRowHtml({ selected: true }));
        const last = body.querySelector('tr:last-child .pq-tpl-label');
        if (last) last.focus();
    }

    function deleteCheckedTemplateItems() {
        const rows = [...document.querySelectorAll('.pq-template-item-row')];
        const targets = rows.filter(row => row.querySelector('.pq-tpl-delete')?.checked);
        if (!targets.length) {
            UIUtils.toast('삭제할 관리항목을 체크하세요.', 'warning');
            return;
        }
        if (targets.length >= rows.length) {
            UIUtils.toast('관리항목은 최소 1개 이상 남겨야 합니다.', 'warning');
            return;
        }
        targets.forEach(row => row.remove());
        UIUtils.toast(`${targets.length}개 관리항목을 삭제했습니다. 저장을 눌러 반영하세요.`, 'success');
    }

    function moveTemplateItemRow(button, direction) {
        const row = button?.closest?.('.pq-template-item-row');
        const body = document.getElementById('pqTemplateItemsBody');
        if (!row || !body) return;
        if (direction < 0) {
            const prev = row.previousElementSibling;
            if (prev) body.insertBefore(row, prev);
        } else {
            const next = row.nextElementSibling;
            if (next) body.insertBefore(next, row);
        }
    }

    function reloadTemplateForCar() {
        const car = document.getElementById('pqTplCarModel')?.value || '';
        const color = document.getElementById('pqTplColor')?.value || '';
        openTemplateModal(car, color);
    }

    // ── 드롭다운에서 프레셋 선택 후 적용 ──────────────────────────────────
    function applyPresetFromSelect() {
        const sel = document.getElementById('pqPresetSelector');
        const presetId = sel?.value;
        if (!presetId) { UIUtils.toast('적용할 프레셋을 선택하세요.', 'warning'); return; }
        applyPreset(presetId);
    }

    // ── 프레셋 관리 모달 ────────────────────────────────────────────────────
    function openPresetMgmtModal() {
        UIUtils.showModal('프레셋 관리', _presetMgmtHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
        `, 'lg');
    }

    function _presetMgmtHtml() {
        const presets = (Storage.getAll(STORE) || []).filter(d => d._docKind === PRESET_KIND);
        const listHtml = presets.length ? `
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>프레셋명</th>
                            <th style="text-align:center;">관리항목 수</th>
                            <th style="width:120px;">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${presets.map(p => `
                            <tr>
                                <td>
                                    <strong>${_esc(p.name)}</strong>
                                    ${p.items && p.items.length ? `<span style="margin-left:6px;font-size:0.75rem;color:var(--text-muted);">${p.items.map(i=>_esc(i.label)).filter(Boolean).slice(0,4).join(', ')}${p.items.length > 4 ? ' …' : ''}</span>` : ''}
                                </td>
                                <td style="text-align:center;"><strong style="color:var(--accent-blue);">${(p.items||[]).length}</strong>개</td>
                                <td style="white-space:nowrap;">
                                    <button class="btn btn-sm btn-outline" onclick="ProdQualityModule.openPresetEditModal('${_js(p.id)}')">수정</button>
                                    <button class="btn btn-sm btn-danger"  onclick="ProdQualityModule.deleteUserPreset('${_js(p.id)}')">삭제</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="text-align:center;padding:36px 20px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:10px;opacity:.35;">bookmarks</span>
                저장된 프레셋이 없습니다.<br>
                <span style="font-size:0.82rem;">프레셋을 만들면 차종별 기준 설정 시 빠르게 적용할 수 있습니다.</span>
            </div>`;

        return `
            <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
                <button class="btn btn-primary" onclick="ProdQualityModule.openPresetEditModal(null)">
                    <span class="material-symbols-outlined">add</span> 프레셋 추가
                </button>
            </div>
            ${listHtml}`;
    }

    // ── 프레셋 추가/수정 모달 ────────────────────────────────────────────────
    function openPresetEditModal(presetId) {
        const preset = presetId
            ? (Storage.getAll(STORE)||[]).find(d => d._docKind === PRESET_KIND && d.id === presetId)
            : null;
        const items = preset && preset.items && preset.items.length
            ? preset.items
            : _masterItems().map(i => ({ ...i, selected: true }));

        UIUtils.showModal(preset ? `프레셋 수정 — ${preset.name}` : '새 프레셋 추가', `
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label">프레셋 이름 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="pqPresetEditName"
                    value="${_esc(preset ? preset.name : '')}"
                    placeholder="예: 도장A라인 기준, 외관검사 기준" style="font-size:1rem;" autofocus>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                <span style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">
                    관리항목 <span id="pqPresetEditCount" style="color:var(--accent-blue);"></span>
                </span>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.deleteCheckedPresetItems()">
                        <span class="material-symbols-outlined">delete</span> 선택 삭제
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="ProdQualityModule.addPresetItemRow()">
                        <span class="material-symbols-outlined">add</span> 항목 추가
                    </button>
                </div>
            </div>
            <div class="data-table-wrapper" style="max-height:48vh;overflow:auto;">
                <table class="data-table" style="font-size:0.82rem;">
                    <thead><tr>
                        <th style="width:36px;text-align:center;">삭제</th>
                        <th>관리항목명 <span style="font-weight:400;color:var(--text-muted);font-size:0.75rem;">(C/S에 표시)</span></th>
                        <th>기준(Spec)</th>
                        <th>측정방법</th>
                        <th style="width:76px;">단위</th>
                    </tr></thead>
                    <tbody id="pqPresetEditBody">
                        ${items.map(item => _presetItemRowHtml(item)).join('')}
                    </tbody>
                </table>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule.savePresetEdit(${presetId ? `'${_js(presetId)}'` : 'null'})">
                <span class="material-symbols-outlined">save</span> 저장
            </button>
        `, 'lg');
    }

    function _presetItemRowHtml(item = {}) {
        return `
            <tr class="pq-preset-item-row">
                <td style="text-align:center;">
                    <input type="checkbox" class="pq-preset-delete">
                </td>
                <td>
                    <input type="hidden" class="pq-preset-key" value="${_esc(item.key || Storage.generateId())}">
                    <input type="text" class="form-input pq-preset-label" value="${_esc(item.label || '')}"
                        placeholder="관리항목명">
                </td>
                <td><input type="text" class="form-input pq-preset-spec" value="${_esc(item.spec || '')}"
                    placeholder="예: 15~20 / 없을 것"></td>
                <td><input type="text" class="form-input pq-preset-method" value="${_esc(item.method || '')}"
                    placeholder="육안 / 도막두께계 …"></td>
                <td><input type="text" class="form-input pq-preset-unit" value="${_esc(item.unit || '')}"
                    placeholder="μm / - …" style="width:74px;"></td>
            </tr>`;
    }

    function addPresetItemRow() {
        const body = document.getElementById('pqPresetEditBody');
        if (!body) return;
        body.insertAdjacentHTML('beforeend', _presetItemRowHtml({}));
        body.querySelector('tr:last-child .pq-preset-label')?.focus();
    }

    function deleteCheckedPresetItems() {
        const rows = [...document.querySelectorAll('.pq-preset-item-row')];
        const targets = rows.filter(r => r.querySelector('.pq-preset-delete')?.checked);
        if (!targets.length) { UIUtils.toast('삭제할 항목을 체크하세요.', 'warning'); return; }
        targets.forEach(r => r.remove());
    }

    async function savePresetEdit(presetId) {
        const name = document.getElementById('pqPresetEditName')?.value.trim();
        if (!name) { UIUtils.toast('프레셋 이름을 입력하세요.', 'warning'); return; }

        const items = [...document.querySelectorAll('.pq-preset-item-row')].map(row => ({
            key:    row.querySelector('.pq-preset-key')?.value  || Storage.generateId(),
            label:  row.querySelector('.pq-preset-label')?.value.trim()  || '',
            spec:   row.querySelector('.pq-preset-spec')?.value.trim()   || '',
            method: row.querySelector('.pq-preset-method')?.value.trim() || '',
            unit:   row.querySelector('.pq-preset-unit')?.value.trim()   || '',
            selected: true
        })).filter(i => i.label);

        if (!items.length) { UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning'); return; }

        if (presetId) {
            await Storage.update(STORE, presetId, { _docKind: PRESET_KIND, name, items, updatedAt: UIUtils.now() });
            UIUtils.toast(`"${name}" 프레셋이 수정됐습니다.`, 'success');
        } else {
            await Storage.add(STORE, { _docKind: PRESET_KIND, name, items, createdAt: UIUtils.now() });
            UIUtils.toast(`"${name}" 프레셋이 저장됐습니다.`, 'success');
        }
        openPresetMgmtModal(); // 목록으로 돌아가기
    }

    // ── 프레셋 적용 ────────────────────────────────────────────────────────
    function applyPreset(presetId) {
        // 사용자 저장 프레셋 적용
        const userPreset = (Storage.getAll(STORE) || []).find(d => d._docKind === PRESET_KIND && d.id === presetId);
        if (!userPreset) { UIUtils.toast('프레셋을 찾을 수 없습니다.', 'error'); return; }
        const items = (userPreset.items || []).map(i => ({ ...i, selected: true }));

        // 관리항목 테이블에 반영
        const body = document.getElementById('pqTemplateItemsBody');
        if (!body) return;
        body.innerHTML = items.map(item => _templateItemRowHtml(item)).join('');

        UIUtils.toast(`"${_esc(userPreset.name)}" 프레셋이 적용됐습니다. 기준값을 확인 후 저장하세요.`, 'success');

        // 현재 적용 프레셋 이름 표시
        const labelEl = document.getElementById('pqCurrentPresetLabel');
        if (labelEl) {
            labelEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;color:var(--accent-green);">check_circle</span>
                &nbsp;현재 적용된 프레셋: <strong style="color:var(--text-primary);">${_esc(userPreset.name)}</strong>`;
        }
    }

    // ── 현재 관리항목 설정을 프레셋으로 저장 ─────────────────────────────
    let _pendingPresetItems = []; // 프레셋 저장 대기 항목 (모달 간 전달용 임시 변수)

    async function saveCurrentAsPreset() {
        const rows = [...document.querySelectorAll('.pq-template-item-row')];
        _pendingPresetItems = rows.map(row => ({
            key:      row.querySelector('.pq-tpl-key')?.value           || Storage.generateId(),
            label:    row.querySelector('.pq-tpl-label')?.value.trim()  || '',
            spec:     row.querySelector('.pq-tpl-spec')?.value.trim()   || '',
            method:   row.querySelector('.pq-tpl-method')?.value.trim() || '',
            unit:     row.querySelector('.pq-tpl-unit')?.value.trim()   || '',
            selected: !!row.querySelector('.pq-tpl-selected')?.checked
        })).filter(i => i.label);

        if (!_pendingPresetItems.length) {
            UIUtils.toast('저장할 관리항목이 없습니다.', 'warning');
            return;
        }

        UIUtils.showModal('프레셋 저장', `
            <div class="form-group">
                <label class="form-label">프레셋 이름 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="pqPresetNameInput"
                    placeholder="예: A차종 기준, 일반 외관 기준" style="font-size:1rem;" autofocus>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
                    현재 관리항목 ${_pendingPresetItems.length}개가 저장됩니다.
                </div>
            </div>`, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule._confirmSavePreset()">저장</button>
        `);
    }

    async function _confirmSavePreset() {
        const name  = document.getElementById('pqPresetNameInput')?.value.trim();
        const items = _pendingPresetItems;
        if (!name)  { UIUtils.toast('프레셋 이름을 입력하세요.', 'warning'); return; }
        if (!items.length) { UIUtils.toast('저장할 항목이 없습니다.', 'warning'); return; }

        const existing = (Storage.getAll(STORE) || []).find(d => d._docKind === PRESET_KIND && d.name === name);
        if (existing) {
            await Storage.update(STORE, existing.id, { _docKind: PRESET_KIND, name, items, updatedAt: UIUtils.now() });
        } else {
            await Storage.add(STORE, { _docKind: PRESET_KIND, name, items, createdAt: UIUtils.now() });
        }
        _pendingPresetItems = [];
        UIUtils.closeModal();
        UIUtils.toast(`"${name}" 프레셋이 저장됐습니다.`, 'success');
        // 기준설정 모달 프레셋 바 새로고침
        const car   = document.getElementById('pqTplCarModel')?.value || '';
        const color = document.getElementById('pqTplColor')?.value    || '';
        openTemplateModal(car, color);
    }

    async function deleteUserPreset(presetId) {
        const preset = (Storage.getAll(STORE) || []).find(d => d._docKind === PRESET_KIND && d.id === presetId);
        if (!preset) return;
        if (!confirm(`"${preset.name}" 프레셋을 삭제하시겠습니까?`)) return;
        await Storage.delete(STORE, presetId);
        UIUtils.toast('프레셋이 삭제됐습니다.', 'success');
        openPresetMgmtModal(); // 프레셋 관리 모달 갱신
    }

    async function saveTemplate() {
        const carModel = document.getElementById('pqTplCarModel')?.value || '';
        if (!carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return; }
        const color = document.getElementById('pqTplColor')?.value || '';
        const items = [...document.querySelectorAll('.pq-template-item-row')].map(row => ({
            key: row.querySelector('.pq-tpl-key')?.value || Storage.generateId(),
            label: row.querySelector('.pq-tpl-label')?.value.trim() || '',
            spec: row.querySelector('.pq-tpl-spec')?.value.trim() || '',
            method: row.querySelector('.pq-tpl-method')?.value.trim() || '',
            unit: row.querySelector('.pq-tpl-unit')?.value.trim() || '',
            selected: !!row.querySelector('.pq-tpl-selected')?.checked
        })).filter(item => item.label);
        const existing = _exactTemplateFor(carModel, color);
        const payload = { _docKind: TEMPLATE_KIND, carModel, color, items, updatedAt: UIUtils.now() };
        if (existing) await Storage.update(STORE, existing.id, payload);
        else await Storage.add(STORE, payload);
        UIUtils.closeModal();
        UIUtils.toast('차종/컬러별 기준설정이 저장되었습니다.', 'success');
        search();
    }

    function openBulkTemplateModal() {
        const combos = _carColorCombos();
        if (!combos.length) {
            UIUtils.toast('등록할 차종/컬러 정보가 없습니다. 제품 정보 또는 도장 작업일지를 먼저 확인하세요.', 'warning');
            return;
        }
        UIUtils.showModal('차종/컬러별 기준 일괄 등록', _bulkTemplateFormHtml(combos), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ProdQualityModule.saveBulkTemplate()">일괄 저장</button>
        `, 'xl');
    }

    function _bulkTemplateFormHtml(combos) {
        const cars = [...new Set(combos.map(c => c.carModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        const items = _masterItems().map(item => ({ ...item, selected: item.selected !== false }));
        return `
            <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;min-height:56vh;">
                <div>
                    <div class="form-group" style="margin-bottom:10px;">
                        <label class="form-label">차종 필터</label>
                        <select class="form-select" id="pqBulkCarFilter" onchange="ProdQualityModule.refreshBulkTargetList()">
                            <option value="">전체 차종</option>
                            ${cars.map(car => `<option value="${_esc(car)}">${_esc(car)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <strong style="font-size:0.9rem;">등록 대상</strong>
                        <button type="button" class="btn btn-outline btn-sm" onclick="ProdQualityModule.toggleBulkTargets()">전체 선택/해제</button>
                    </div>
                    <div id="pqBulkTargetList" class="data-table-wrapper" style="max-height:48vh;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                        ${_bulkTargetRowsHtml(combos)}
                    </div>
                </div>
                <div>
                    <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">
                        왼쪽에서 차종/컬러를 선택하고, 아래 관리항목 기준을 입력하면 선택된 대상에 동일 기준이 일괄 저장됩니다.
                    </div>
                    <div class="data-table-wrapper" style="max-height:52vh;overflow:auto;">
                        <table class="data-table" style="font-size:0.8rem;">
                            <thead><tr><th style="width:56px;">사용</th><th>관리항목</th><th>기준</th><th>측정방법</th><th style="width:90px;">단위</th></tr></thead>
                            <tbody id="pqBulkItemsBody">${items.map(item => _bulkItemRowHtml(item)).join('')}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function _bulkTargetRowsHtml(combos) {
        return combos.map(combo => {
            const label = combo.color ? `${combo.carModel} / ${combo.color}` : `${combo.carModel} / 공통`;
            const count = combo.parts && combo.parts.length ? combo.parts.length : 0;
            return `
                <label class="pq-bulk-target-row" data-car="${_esc(combo.carModel)}" style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:0.82rem;cursor:pointer;">
                    <input type="checkbox" class="pq-bulk-target" data-car="${_esc(combo.carModel)}" data-color="${_esc(combo.color || '')}" checked>
                    <span style="min-width:0;">
                        <strong style="display:block;color:var(--text-primary);">${_esc(label)}</strong>
                        <span style="display:block;color:var(--text-muted);font-size:0.74rem;">품목 ${count}개</span>
                    </span>
                </label>`;
        }).join('');
    }

    function _bulkItemRowHtml(item = {}) {
        return `
            <tr class="pq-bulk-item-row">
                <td style="text-align:center;"><input type="checkbox" class="pq-bulk-selected" ${item.selected === false ? '' : 'checked'}></td>
                <td>
                    <input type="hidden" class="pq-bulk-key" value="${_esc(item.key || Storage.generateId())}">
                    <input type="text" class="form-input pq-bulk-label" value="${_esc(item.label || '')}" placeholder="관리항목명">
                </td>
                <td><input type="text" class="form-input pq-bulk-spec" value="${_esc(item.spec || '')}" placeholder="예: 15~20"></td>
                <td><input type="text" class="form-input pq-bulk-method" value="${_esc(item.method || '')}" placeholder="측정방법"></td>
                <td><input type="text" class="form-input pq-bulk-unit" value="${_esc(item.unit || '')}" placeholder="단위"></td>
            </tr>`;
    }

    function refreshBulkTargetList() {
        const filterCar = document.getElementById('pqBulkCarFilter')?.value || '';
        const list = document.getElementById('pqBulkTargetList');
        if (!list) return;
        const combos = _carColorCombos().filter(combo => !filterCar || combo.carModel === filterCar);
        list.innerHTML = _bulkTargetRowsHtml(combos);
    }

    function toggleBulkTargets() {
        const checks = [...document.querySelectorAll('.pq-bulk-target')];
        const shouldCheck = checks.some(chk => !chk.checked);
        checks.forEach(chk => { chk.checked = shouldCheck; });
    }

    async function saveBulkTemplate() {
        const targets = [...document.querySelectorAll('.pq-bulk-target:checked')].map(chk => ({
            carModel: chk.dataset.car || '',
            color: chk.dataset.color || ''
        })).filter(t => t.carModel);
        if (!targets.length) {
            UIUtils.toast('일괄 등록할 차종/컬러를 선택하세요.', 'warning');
            return;
        }
        const items = [...document.querySelectorAll('.pq-bulk-item-row')].map(row => ({
            key: row.querySelector('.pq-bulk-key')?.value || Storage.generateId(),
            label: row.querySelector('.pq-bulk-label')?.value.trim() || '',
            spec: row.querySelector('.pq-bulk-spec')?.value.trim() || '',
            method: row.querySelector('.pq-bulk-method')?.value.trim() || '',
            unit: row.querySelector('.pq-bulk-unit')?.value.trim() || '',
            selected: !!row.querySelector('.pq-bulk-selected')?.checked
        })).filter(item => item.label);
        if (!items.length) {
            UIUtils.toast('관리항목을 1개 이상 입력하세요.', 'warning');
            return;
        }
        for (const target of targets) {
            const existing = _exactTemplateFor(target.carModel, target.color);
            const payload = {
                _docKind: TEMPLATE_KIND,
                carModel: target.carModel,
                color: target.color,
                items: items.map(item => ({ ...item })),
                updatedAt: UIUtils.now()
            };
            if (existing) await Storage.update(STORE, existing.id, payload);
            else await Storage.add(STORE, payload);
        }
        UIUtils.closeModal();
        UIUtils.toast(`${targets.length}개 차종/컬러 기준을 일괄 저장했습니다.`, 'success');
        search();
    }

    function onIssueCarChange() {
        const car = document.getElementById('pqCarModel')?.value || '';
        const color = document.getElementById('pqColor')?.value || '';
        const partSel = document.getElementById('pqPartName');
        if (partSel) partSel.innerHTML = _partOptions(car, '');
        const itemsEl = document.getElementById('pqIssueItems');
        if (itemsEl) itemsEl.innerHTML = _issueItemRows(_itemsForCar(car, color).filter(i => i.selected !== false));
    }

    function printIssue(id) {
        const d = Storage.getById(STORE, id);
        if (!d) return;
        const items = _normalizeQualityItems(d.items || []);
        const typeHeaders = (d.types && d.types.length ? d.types : ['초물', '중물', '종물']);
        const measurePlaceholder = item => {
            const label = `${item.label || ''} ${item.method || ''}`;
            if (/도막|두께|film/i.test(label)) return 'Film';
            if (/색차|△L|△a|△b/i.test(label)) return item.unit || item.label || '△';
            if (/부착|cross|cut|tape/i.test(label)) return 'Tape';
            return 'OK , NG';
        };
        const specCells = item => {
            const spec = item.spec || '';
            if (/도막|두께/i.test(item.label || '')) {
                return `<td class="spec-upper">${_esc((item.label || '').replace(/도막두께|\(|\)/g, '').trim() || '상')}</td><td class="spec-lower">${_esc(spec || '(      ~      ) ' + (item.unit || ''))}</td>`;
            }
            return `<td class="spec-text" colspan="2">${_esc(spec || '기준에 준할 것')}</td>`;
        };
        const rows = items.map(item => {
            const ph = measurePlaceholder(item);
            const muted = ph === 'OK , NG' ? ' muted' : '';
            return `
                <tr>
                    <td class="check-cell"><span class="check-box"></span></td>
                    <td class="item-name">${_esc(item.label || '')}</td>
                    ${specCells(item)}
                    <td class="cycle-cell">2회/LOT<br>초중:4hr 이내</td>
                    <td class="method-cell">${_esc(item.method || '')}</td>
                    <td class="measure-cell${muted}"><span>${_esc(ph)}</span></td>
                    <td class="measure-cell${muted}"><span>${_esc(ph)}</span></td>
                    <td class="measure-cell${muted}"><span>${_esc(ph)}</span></td>
                    <td class="judge-cell">OK , NG</td>
                </tr>`;
        }).join('');
        const dateLot = `${_esc(d.date || '')}${d.lotNo ? `<br><span>${_esc(d.lotNo)}</span>` : ''}`;
        const html = `
<!doctype html><html><head><meta charset="utf-8"><title>초중종물 C/S</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,'Malgun Gothic',sans-serif;margin:10px;color:#000;background:#fff}
.print-btn{position:fixed;right:18px;top:12px;padding:8px 14px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer}
.sheet{width:1220px;margin:0 auto}
.title-row{position:relative;margin-bottom:8px}
h1{font-size:42px;letter-spacing:3px;text-align:center;margin:0 0 12px;font-weight:800}
.notes{position:absolute;right:0;top:6px;color:red;font-size:13px;line-height:1.35;font-weight:700}
.top-grid{display:grid;grid-template-columns:720px 380px;justify-content:space-between;align-items:start;margin-bottom:8px}
table{border-collapse:collapse;width:100%}
.meta th,.meta td,.sign th,.sign td{border:2px solid #000;text-align:center;padding:8px 7px;font-size:14px;height:44px}
.meta th,.sign th{background:#d9d9d9;font-weight:800}
.meta .ko{display:block;font-size:14px}.meta .en{display:block;font-size:12px}
.sign td{height:46px;background:#fff}
.main{table-layout:fixed;border:2px solid #000}
.main th,.main td{border:1.7px solid #000;text-align:center;vertical-align:middle;padding:5px 4px;font-size:14px}
.main th{background:#d9d9d9;font-weight:800}
.subhead th{background:#fff;font-weight:800}
.check-cell{width:44px}.check-box{display:inline-block;width:30px;height:30px;border:3px solid #bcbcbc;background:#f8f8f8}
.item-name{font-size:21px;font-weight:700;line-height:1.25}
.spec-upper{font-size:18px;font-weight:700}.spec-lower,.spec-text{font-size:16px;line-height:1.35}
.cycle-cell{font-size:15px;line-height:1.35;font-weight:700}.method-cell{font-size:15px;line-height:1.25}
.measure-head{background:#f2f2f2!important}.lot-head{background:#fff!important;font-size:15px!important;font-weight:500!important}
.measure-type{display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:800}
.tiny-box{width:24px;height:24px;border:3px solid #bcbcbc;background:#eee;display:inline-flex;align-items:center;justify-content:center;color:#999}
.measure-cell{height:110px}.measure-cell span{display:inline-flex;width:112px;height:100px;border:1.5px dashed #1f4e79;align-items:center;justify-content:center;color:#8ab342;font-size:31px}
.measure-cell.muted span{border:0;color:#b6b6b6;font-size:16px}
.judge-cell{font-size:18px;color:#5f6b75}
@media print{
  @page{size:A4 landscape;margin:5mm}
  body{margin:0}.print-btn{display:none}.sheet{width:100%}
  h1{font-size:34px}.notes{font-size:11px}.main th,.main td{font-size:12px}.item-name{font-size:18px}
}
</style></head><body>
<button class="print-btn" onclick="window.print()">인쇄</button>
<div class="sheet">
  <div class="title-row">
    <h1>도장 (초 · 중 · 종물) CHECK SHEET</h1>
    <div class="notes">※ 크리어(Clear) 제품은 색차 및 광택 제외<br>※ 비계획 재가동 시 종물검사 제외<br><span style="color:#111">(비계획 정지 직전 검사로 대체)</span></div>
  </div>
  <div class="top-grid">
    <table class="meta">
      <tr>
        <th><span class="ko">차종</span><span class="en">model</span></th>
        <th><span class="ko">부품</span><span class="en">Item</span></th>
        <th><span class="ko">컬러</span><span class="en">Color</span></th>
        <th><span class="ko">생산 수량</span><span class="en">LOT Volume</span></th>
        <th><span class="ko">생산일(Date)</span><span class="en">LOT NO.</span></th>
        <th><span class="ko">시간</span><span class="en">Time</span></th>
      </tr>
      <tr>
        <td><strong>${_esc(d.carModel || '')}</strong></td>
        <td><strong>${_esc(d.partName || '')}</strong></td>
        <td><strong>${_esc(d.color || '')}</strong></td>
        <td><strong>${UIUtils.formatNumber(d.productionQty || 0)}</strong></td>
        <td><strong>${dateLot}</strong></td>
        <td><strong>${_esc(d.time || ':')}</strong></td>
      </tr>
    </table>
    <table class="sign">
      <tr><th>작&nbsp;&nbsp;&nbsp;성</th><th>검&nbsp;&nbsp;&nbsp;토</th><th>승&nbsp;&nbsp;&nbsp;인</th></tr>
      <tr><td></td><td></td><td></td></tr>
    </table>
  </div>
  <table class="main">
    <colgroup>
      <col style="width:45px"><col style="width:194px"><col style="width:95px"><col style="width:136px"><col style="width:114px"><col style="width:136px"><col style="width:125px"><col style="width:125px"><col style="width:125px"><col style="width:125px">
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">검사여부</th>
        <th rowspan="2">관리 항목</th>
        <th colspan="2">관리 규격</th>
        <th>주기</th>
        <th rowspan="2">점검 방법</th>
        <th colspan="3" class="measure-head">측정 ( 측정값 / 결과 작성)</th>
        <th rowspan="2">판&nbsp;&nbsp;정</th>
      </tr>
      <tr class="subhead">
        <th>상</th><th>하</th><th>샘플 수량</th>
        <th class="lot-head"><div class="measure-type"><span class="tiny-box">✓</span>${_esc(typeHeaders[0] || '초물')}</div>LOT NO. - IP</th>
        <th class="lot-head"><div class="measure-type"><span class="tiny-box"></span>${_esc(typeHeaders[1] || '중물')}</div>LOT NO. - MP</th>
        <th class="lot-head"><div class="measure-type"><span class="tiny-box">✓</span>${_esc(typeHeaders[2] || '종물')}</div>LOT NO. - FP</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;
        const win = window.open('', '_blank');
        if (!win) { UIUtils.toast('팝업 차단을 해제하세요.', 'warning'); return; }
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 250);
    }

    return {
        render,
        search,
        openAddModal,
        saveNew,
        edit,
        saveEdit,
        remove,
        exportData
        ,openWriteFromWork
        ,saveWriteAndPrint
        ,issueFromWork
        ,openItemListModal
        ,saveItemMaster
        ,addMasterItemRow
        ,deleteCheckedMasterItems
        ,openTemplateModal
        ,openBulkTemplateModal
        ,saveTemplate
        ,saveBulkTemplate
        ,refreshBulkTargetList
        ,toggleBulkTargets
        ,moveTemplateItemRow
        ,addTemplateItemRow
        ,deleteCheckedTemplateItems
        ,addIssueItemRow
        ,removeIssueItemRow
        ,reloadTemplateForCar
        ,onIssueCarChange
        ,printIssue
        ,applyPreset
        ,applyPresetFromSelect
        ,saveCurrentAsPreset
        ,_confirmSavePreset
        ,deleteUserPreset
        ,renderStandardsCard
        ,openPresetMgmtModal
        ,openPresetEditModal
        ,addPresetItemRow
        ,deleteCheckedPresetItems
        ,savePresetEdit
    };
})();

/**
 * 5) 설비관리 (ProdEquipmentModule) — 공정별 설비 + 4개 서브탭
 *    도장A라인 / 도장B라인 × 스페어관리 / 점검항목 / 이상발생 / 비가동이력
 */
var ProdEquipmentModule = (function() {
    const ST_EQUIP  = DB.STORES.EQUIP_MASTER;
    const ST_SPARE  = DB.STORES.EQUIP_SPARE;
    const ST_CITEM  = DB.STORES.EQUIP_CHECK_ITEM;
    const ST_CREC   = DB.STORES.EQUIP_CHECK_RECORD;
    const ST_ISSUE  = DB.STORES.EQUIP_ISSUE;
    const ST_DT     = DB.STORES.EQUIP_DOWNTIME;

    const ST_SQ_STD = DB.STORES.EQUIP_SQ_STD;
    const ST_SQ_LOG = DB.STORES.EQUIP_SQ_LOG;
    const ST_LUX    = DB.STORES.EQUIP_ILLUMINATION_LOG;
    const ST_CONVEYOR = DB.STORES.EQUIP_CONVEYOR_STD;
    const ST_FPROOF = DB.STORES.EQUIP_FPROOF_LOG;
    const ST_AIR_FILTER = DB.STORES.EQUIP_AIR_FILTER_LOG;
    const ST_SUPPLY_FILTER = DB.STORES.EQUIP_SUPPLY_FILTER_LOG;
    const ST_DRYER_CLEAN = DB.STORES.EQUIP_DRYER_CLEAN_LOG;

    const LINES = ['도장A라인', '도장B라인'];
    let _line    = '도장A라인';
    let _equipId = null;
    let _subTab  = 'spare';

    // 도장(A/B) 세부공정 순서 — 제조관리 표준 기준
    const PROC_STATIONS = [
        // ── 공정 설비 ──────────────────────────────────
        { name:'로딩',        icon:'upload',                no:30  },
        { name:'세척',        icon:'water_drop',            no:40  },
        { name:'제전',        icon:'electric_bolt',         no:50  },
        { name:'배합',        icon:'science',               no:60  },
        { name:'하도 공급',   icon:'valve',                 no:60  },
        { name:'상도 공급',   icon:'valve',                 no:60  },
        { name:'하도 스프레이',icon:'blur_on',              no:70  },
        { name:'상도 스프레이',icon:'blur_on',              no:70  },
        { name:'건조',        icon:'local_fire_department', no:100 },
        { name:'언로딩',      icon:'download',              no:110 },
        { name:'포장',        icon:'inventory_2',           no:110 },
        { name:'도장 검사',   icon:'search',                no:120 },
        // ── 공통 관리 설비 ─────────────────────────────
        { name:'압축에어',    icon:'air',                   no:0, common:true },
        { name:'공조',        icon:'ac_unit',               no:0, common:true },
        { name:'소방',        icon:'fire_extinguisher',     no:0, common:true },
        { name:'전기',        icon:'power',                 no:0, common:true },
        { name:'환경',        icon:'eco',                   no:0, common:true },
    ];

    // 화면 모드
    let _mode   = 'general'; // 'general' | 'temperature' | 'illumination' | 'conveyor' | 'maintenance' | 'fproof' | 'airfilter' | 'supplyfilter' | 'dryerclean'
    let _sqTab  = 'oven';   // SQ 카테고리
    let _maintLine = '도장A라인';
    let _convLine = '도장A라인';

    const ILLUMINATION_POINTS = [
        { pointNo:1, posNo:1, location:'배합실',       category:'식별',     count:1, standard:500,  measurePlace:'배합작업대 캔 높이', purpose:'도료 color 확인 및 품질 확인', x:42,  y:170 },
        { pointNo:2, posNo:1, location:'A라인 로딩',   category:'식별',     count:1, standard:500,  measurePlace:'제품 거치 위치',       purpose:'제품 색 식별',                 x:552, y:230 },
        { pointNo:2, posNo:2, location:'A라인 언로딩', category:'식별',     count:1, standard:500,  measurePlace:'제품 거치 위치',       purpose:'제품 색 식별',                 x:612, y:230 },
        { pointNo:3, posNo:1, location:'B라인 로딩',   category:'식별',     count:1, standard:500,  measurePlace:'제품 거치 위치',       purpose:'제품 색 식별',                 x:548, y:80 },
        { pointNo:3, posNo:2, location:'B라인 언로딩', category:'식별',     count:1, standard:500,  measurePlace:'제품 거치 위치',       purpose:'제품 색 식별',                 x:596, y:112 },
        { pointNo:4, posNo:1, location:'B라인 검사대', category:'품질 검사', count:1, standard:2000, measurePlace:'검사시 제품 높이',     purpose:'외관 불량 선별',               x:628, y:66 },
        { pointNo:5, posNo:1, location:'레이저 #1',    category:'품질 검사', count:1, standard:2000, measurePlace:'검사시 제품 높이',     purpose:'외관 불량 선별',               x:652, y:110 },
        { pointNo:5, posNo:2, location:'레이저 #2',    category:'품질 검사', count:1, standard:2000, measurePlace:'검사시 제품 높이',     purpose:'외관 불량 선별',               x:654, y:160 },
        { pointNo:5, posNo:3, location:'레이저 #3',    category:'품질 검사', count:1, standard:2000, measurePlace:'검사시 제품 높이',     purpose:'외관 불량 선별',               x:654, y:210 }
    ];

    const CONVEYOR_DEFAULTS = {
        rpm: 400,
        jigInterval: 150,
        title: '컨베이어 속도에 따른 구간별 시간'
    };

    const CONVEYOR_LINE_DEFAULTS = {
        '도장A라인': { rpm: 370, jigInterval: 150 },
        '도장B라인': { rpm: 320, jigInterval: 900 }
    };

    const CONVEYOR_SPEED_CONST = {
        wheelDiameterMm: 97,
        pi: 3.14,
        pulleyRatio: 197 / 97,
        reducerRatio: 60,
        shaftRatio: 1.628
    };

    const CONVEYOR_SECTIONS = {
        '도장A라인': [
            { group:'투입/전처리', name:'로딩', distance:4321 },
            { group:'투입/전처리', name:'제전 #1', distance:1800 },
            { group:'투입/전처리', name:'-', distance:508 },
            { group:'Booth #1', name:'robot #1', distance:2250 },
            { group:'Booth #1', name:'robot #2', distance:2250 },
            { group:'Setting IR #1', name:'F/Time', distance:6595 },
            { group:'Booth #2', name:'robot #3', distance:2400 },
            { group:'Booth #2', name:'-', distance:1258 },
            { group:'Booth #3', name:'robot #4', distance:2400 },
            { group:'Setting IR #2', name:'Flash Off Time', distance:20756 },
            { group:'투입/전처리', name:'제전 #2', distance:1800 },
            { group:'투입/전처리', name:'Setting', distance:543 },
            { group:'Booth #4', name:'robot #5', distance:2400 },
            { group:'Booth #4', name:'setting', distance:1258 },
            { group:'Booth #5', name:'robot #6', distance:2400 },
            { group:'Setting IR #3', name:'Setting Time', distance:4895 },
            { group:'UV', name:'UV', distance:3520 },
            { group:'Main 건조로 IR', name:'#4', distance:5570 },
            { group:'Main 건조로 IR', name:'#5', distance:8501 },
            { group:'Main 건조로 IR', name:'#6', distance:15253 },
            { group:'Main 건조로 IR', name:'#7', distance:29136 },
            { group:'Main 건조로 IR', name:'#8', distance:24546 },
            { group:'배출', name:'냉각', distance:19115 },
            { group:'배출', name:'언로딩', distance:1831 },
            { group:'배출', name:'구동부', distance:3302 }
        ],
        '도장B라인': [
            { group:'투입/전처리', name:'로딩', distance:5418 },
            { group:'투입/전처리', name:'제전 #1', distance:1800 },
            { group:'Booth #1', name:'robot #1', distance:2400 },
            { group:'Booth #1', name:'-', distance:1258 },
            { group:'Booth #2', name:'robot #2', distance:2400 },
            { group:'Setting IR #1', name:'F.O.T', distance:7461 },
            { group:'Booth', name:'신규', distance:4500 },
            { group:'Setting IR #1', name:'F.O.T', distance:9097 },
            { group:'Booth #3', name:'robot #3', distance:2400 },
            { group:'Setting IR #2', name:'F.O.T', distance:6415 },
            { group:'Booth #4', name:'robot #4', distance:2400 },
            { group:'Setting IR #3', name:'Setting Time', distance:15188 },
            { group:'UV', name:'UV', distance:3433 },
            { group:'Main 건조로 IR', name:'#4', distance:13450 },
            { group:'Main 건조로 IR', name:'#5', distance:10950 },
            { group:'Main 건조로 IR', name:'#6', distance:19545 },
            { group:'Main 건조로 IR', name:'#7', distance:12925 },
            { group:'Main 건조로 IR', name:'#8', distance:16903 },
            { group:'배출', name:'냉각', distance:19060 },
            { group:'배출', name:'언로딩', distance:2075 },
            { group:'배출', name:'구동부', distance:3258 }
        ]
    };

    const SQ_CATS = [
        { k:'oven',        icon:'local_fire_department', label:'건조오븐 조건' }
    ];

    const FPROOF_ROWS = [
        { key:'fp01', no:1, item:'도장 부스 온습도\n및 건조로(IR)\n모니터링', standard:'온도 상하한값 확인,\n설정 온도 이탈 시 경광등\n작동 유무 확인', place:'모니터링 PC\nA,B', method:'육안', sheet:1 },
        { key:'fp02', no:2, item:'세척용 카운터', standard:'설정 횟수 도달 시\n경광등 작동 유무 확인', place:'B라인 세척', method:'육안', sheet:1 },
        { key:'fp03', no:3, item:'텐렉 카운터', standard:'설정 횟수 도달 시\n경광등 작동 유무 확인', place:'B라인 세척', method:'육안', sheet:1 },
        { key:'fp04', no:4, item:'도료 배합 시간', standard:'타이머 종료시\n경광등 작동유무 확인', place:'배합실', method:'육안', sheet:1 },
        { key:'fp05', no:5, item:'도료 배합 비율', standard:'도료 배합량 초과시\n알람 및 경고표시 확인', place:'배합실', method:'배합\nProgram', sheet:1 },
        { key:'fp06', no:1, item:'도료 가사시간 확인', standard:'타이머 종료시\n알람 작동 유무 확인', place:'모니터링 PC\nA,B', method:'청각', sheet:2 },
        { key:'fp07', no:2, item:'도료 가사시간 확인', standard:'타이머 종료시\n알람 작동 유무 확인', place:'A-2부스 왼쪽', method:'청각', sheet:2 },
        { key:'fp08', no:3, item:'도료 가사시간 확인', standard:'타이머 종료시\n알람 작동 유무 확인', place:'A-4부스 오른쪽', method:'청각', sheet:2 },
        { key:'fp09', no:4, item:'도료 가사시간 확인', standard:'타이머 종료시\n알람 작동 유무 확인', place:'B-2부스 왼쪽', method:'청각', sheet:2 },
        { key:'fp10', no:5, item:'도료 가사시간 확인', standard:'타이머 종료시\n알람 작동 유무 확인', place:'B-3부스 왼쪽', method:'청각', sheet:2 },
        { key:'fp11', no:6, item:'도료 저수위 감지', standard:'도료 저수위 발생시\n알람 및 경광등\n작동유무 확인', place:'A-1부스 오른쪽', method:'육안/청각', sheet:2 },
        { key:'fp12', no:7, item:'도료 저수위 감지', standard:'도료 저수위 발생시\n알람 및 경광등\n작동유무 확인', place:'A-2부스 왼쪽', method:'육안/청각', sheet:2 },
        { key:'fp13', no:8, item:'도료 저수위 감지', standard:'도료 저수위 발생시\n알람 및 경광등\n작동유무 확인', place:'A-4부스 오른쪽', method:'육안/청각', sheet:2 },
        { key:'fp14', no:9, item:'도료 저수위 감지', standard:'도료 저수위 발생시\n알람 및 경광등\n작동유무 확인', place:'B-2부스 왼쪽', method:'육안/청각', sheet:2 },
        { key:'fp15', no:10, item:'도료 저수위 감지', standard:'도료 저수위 발생시\n알람 및 경광등\n작동유무 확인', place:'B-3부스 왼쪽', method:'육안/청각', sheet:2 }
    ];

    const AIR_FILTER_ROWS = [
        { key:'af01', step:'1차 (1)', location:'에어쿨러 후단 #1', filter:'40A / 5㎛', count:'1EA', cycle:'1년', planMonths:[12] },
        { key:'af02', step:'2차 (2)', location:'에어 드라이어\n후단 #1', filter:'40A / 1㎛', count:'1EA', cycle:'1년', planMonths:[12] },
        { key:'af03', step:'3차 (3)', location:'에어드라이어\n후단 #2', filter:'40A / 0.01㎛', count:'1EA', cycle:'1년', planMonths:[12] },
        { key:'af04', step:'5차 (4)', location:'유수분 흡착기\n후단', filter:'40A / 0.01㎛', count:'1EA', cycle:'1년', planMonths:[12] },
        { key:'af05', step:'4차', location:'유수분 흡착기', filter:'흡착젤', count:'1개소\n2 tank', cycle:'1년', planMonths:[12] },
        { key:'af06', step:'4차', location:'현장 라인간 압축', filter:'20A / 0.01㎛', count:'12 ea', cycle:'1년', planMonths:[12] },
        { key:'af07', step:'5차', location:'제전실 A,B', filter:'20A / 0.01㎛', count:'2EA', cycle:'6개월', planMonths:[6,12] },
        { key:'af08', step:'5차', location:'로봇컨트롤내\nUtility 전단', filter:'0.01㎛', count:'10대', cycle:'1년', planMonths:[12] }
    ];

    const SUPPLY_FILTER_ROWS = [
        ...['A LINE #1','A LINE #2','A LINE #3','A LINE #4','A LINE #5','B LINE #1','B LINE #2','B LINE #3','B LINE #4']
            .map((loc, i) => ({ key:`sf01_${i+1}`, grade:'1차\n매쉬\n필터\n물청소', section:loc.split(' ')[0] + '\nLINE', position:loc.split(' ')[2], cycle:'2개월', planMonths:[1,3,5,7,9,11] })),
        ...['A LINE #1','A LINE #2','A LINE #3','A LINE #4','A LINE #5','B LINE #1','B LINE #2','B LINE #3','B LINE #4','제전UV A','제전UV B','현장']
            .map((loc, i) => ({ key:`sf02_${i+1}`, grade:'2차\nPRE', section:loc.includes('LINE') ? loc.split(' ')[0] + '\nLINE' : loc, position:loc.includes('LINE') ? loc.split(' ')[2] : '', cycle:'3개월', planMonths:[1,4,7,10] })),
        ...['A LINE #1','A LINE #2','A LINE #3','A LINE #4','A LINE #5','B LINE #1','B LINE #2','B LINE #3','B LINE #4','제전 / Uv','현장']
            .map((loc, i) => ({ key:`sf03_${i+1}`, grade:'3차\n백필터', section:loc.includes('LINE') ? loc.split(' ')[0] + '\nLINE' : loc, position:loc.includes('LINE') ? loc.split(' ')[2] : '', cycle:'12개월', planMonths:[12] })),
        ...['A LINE #1','A LINE #2','A LINE #3','A LINE #4','A LINE #5','B LINE #1','B LINE #2','B LINE #3','B LINE #4','제전 / Uv','현장']
            .map((loc, i) => ({ key:`sf04_${i+1}`, grade:'4차\n전정\n필터', section:loc.includes('LINE') ? loc.split(' ')[0] + '\nLINE' : loc, position:loc.includes('LINE') ? loc.split(' ')[2] : '', cycle:'6개월', planMonths:[6,12] })),
        { key:'sf05_1', grade:'부직포', section:'현장항온항습기', position:'', cycle:'1개월', planMonths:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { key:'sf05_2', grade:'부직포', section:'에어샤워기', position:'', cycle:'3개월', planMonths:[1,4,7,10] }
    ];

    const DRYER_CLEAN_ROWS = [
        { key:'dc_a_01', line:'A\nLINE', section:'#1', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_a_02', line:'A\nLINE', section:'#2 - 1\n#2 - 2', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_a_03', line:'A\nLINE', section:'#3', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_a_uv', line:'A\nLINE', section:'UV실', cycle:'3개월', planMonths:[2,5,8,11] },
        { key:'dc_a_main', line:'A\nLINE', section:'MAIN', cycle:'3개월', planMonths:[2,5,8,11] },
        { key:'dc_b_01', line:'B\nLINE', section:'#1', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_b_02', line:'B\nLINE', section:'#2', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_b_03', line:'B\nLINE', section:'#3', cycle:'2개월', planMonths:[1,3,5,7,9,11] },
        { key:'dc_b_uv', line:'B\nLINE', section:'UV실', cycle:'3개월', planMonths:[2,5,8,11] },
        { key:'dc_b_main', line:'B\nLINE', section:'MAIN', cycle:'3개월', planMonths:[2,5,8,11] }
    ];

    const MAINTENANCE_PLAN_ROWS = [
        { area:'라인', item:'압축에어 유수분', method:'배출구 강제 배출', detail:'누적 유수분 제거 및 확인', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'도로 공급 util', item:'GUN-AOPR 6파이 도료호스', method:'교환', detail:'오염호스교체', cycle:'2개월', months:[2,4,6,8,10,12] },
        { area:'도로 공급 util', item:'도료탱크-AOPR 8파이 도료호스', method:'교환', detail:'오염호스교체', cycle:'2개월', months:[2,4,6,8,10,12] },
        { area:'도로 공급 util', item:'다이아프램 펌프', method:'청소', detail:'내부 누적 도료 제거', cycle:'6개월', months:[6,12] },
        { area:'도로 공급 util', item:'도료라인 리턴 세정', method:'조업 후 신너 리턴', detail:'도료탱크-도장건 까지 세척신너 리턴', cycle:'주 1회', weekly:true },
        { area:'도로 공급 util', item:'FPR,AOPR', method:'분해 청소', detail:'내부 누적 도료 제거', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'도로 공급 util', item:'펌프필터', method:'교환/청소', detail:'내부 누적 도료 제거', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'제전실', item:'제전기', method:'IPA, 면봉', detail:'제전핀 청소', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'제전실', item:'벽체 / 스크린판', method:'DC-1 / 오일 닦칠', detail:'DC-1 롤러 닦칠 & 오일 분무', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'로봇', item:'컨트롤러 / 운전판넬', method:'진공청소기', detail:'내부 먼지 제거 / 컨트롤러 내부 에어', cycle:'6개월', months:[6,12] },
        { area:'로봇', item:'회전드라이빙 벨트/베어링', method:'AIR 청소 / 교체', detail:'벨트 장력 확인 및 마모 교체 / 베어링 청소 및 교체', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'배합실', item:'작업대 / 도료 분류', method:'리무버/수세미/신너', detail:'작업대 커버 교체 / 주변 청소', cycle:'2개월', months:[2,4,6,8,10,12] },
        { area:'부스', item:'부스 내부 보호랩', method:'랩교환', detail:'오염된 랩 교환', cycle:'3개월', months:[3,6,9,12] },
        { area:'부스', item:'부스내부 / 셋팅 구간 청소', method:'고압세척기 물청소', detail:'누적 오염물 제거', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'부스', item:'순환물 교체', method:'물 교체', detail:'폐수 처리 및 신규 물 공급', cycle:'6개월', months:[4,10] },
        { area:'부스', item:'워터 스크린', method:'쇠수세미/리무버', detail:'누적 고착된 도료막 제거', cycle:'6개월(폐수처리시)', months:[4,10] },
        { area:'부스', item:'침적 슬러지 제거', method:'마대/삽', detail:'침적 슬러지를 삽으로 퍼서 제거', cycle:'1개월', months:[1,2,3,4,5,6,7,8,9,10,11,12] },
        { area:'급기', item:'냉난방 확인', method:'가동 확인 / 전기 배선 확인', detail:'냉각 GAS 충전 및 작동 확인 / 급기 박스 내부 확인(전기,배수)', cycle:'6개월', months:[5,11] },
        { area:'배기', item:'배기챔버', method:'헤라, 쇠수세미', detail:'부착슬러지 제거', cycle:'6개월', months:[6,12] },
        { area:'배기', item:'배기 모터', method:'벨트 장력 및 상태 확인', detail:'벨트 장력 조정 및 교체 / 구리스 주입', cycle:'12개월', months:[12] },
        { area:'컨베어', item:'컨베어 도료이물 제거', method:'브러쉬, 고압세척', detail:'컨베어봉 도료이물제거', cycle:'6개월', months:[3,9] },
        { area:'컨베어', item:'스핀들 회전부 베어링, 벨트교환(필요시)', method:'청소기, 브러쉬, 벨트, 베어링', detail:'스핀들베어링 점검', cycle:'3개월', months:[1,4,7,10] },
        { area:'컨베어', item:'스핀들 봉 커버', method:'교체', detail:'오염된 스핀들 교체', cycle:'6개월', months:[1,7] },
        { area:'컨베어', item:'스핀들봉 정비', method:'파손된 스핀들봉 교체 / 베어링 파손 교체', detail:'스핀들봉 회전점검/교체 / 컨베어 바퀴 점검/교체', cycle:'3개월', months:[1,4,7,10] },
        { area:'작업장', item:'메인컨트롤러', method:'청소기/AIR', detail:'메인컨트롤러 내부 이물제거(감전주의)', cycle:'1년', months:[7] }
    ];

    // ── 메인 렌더 ────────────────────────────────────────────────
    function init() {}

    function render(container) {
        try {
            const pendingMode = sessionStorage.getItem('prodEquipmentMode');
            if (pendingMode === 'illumination' || pendingMode === 'conveyor' || pendingMode === 'general' || pendingMode === 'temperature' || pendingMode === 'maintenance' || pendingMode === 'fproof' || pendingMode === 'airfilter' || pendingMode === 'supplyfilter' || pendingMode === 'dryerclean') {
                _mode = pendingMode;
                sessionStorage.removeItem('prodEquipmentMode');
            }
        } catch (e) {}
        container.innerHTML = `
        <div class="fade-in-up">
            <!-- 메인 모드 탭 -->
            <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid var(--border-color);
                        border-radius:8px;overflow:hidden;width:fit-content;">
                <button id="modeTabGeneral" onclick="ProdEquipmentModule.switchMode('general')"
                    style="padding:9px 20px;border:none;cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='general'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='general'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='general'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">build</span> 설비 일반관리
                </button>
                <button id="modeTabIllumination" onclick="ProdEquipmentModule.switchMode('illumination')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='illumination'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='illumination'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='illumination'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">lightbulb</span> 조도 점검
                </button>
                <button id="modeTabTemperature" onclick="ProdEquipmentModule.switchMode('temperature')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='temperature'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='temperature'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='temperature'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">device_thermostat</span> 온도 프로파일
                </button>
                <button id="modeTabConveyor" onclick="ProdEquipmentModule.switchMode('conveyor')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='conveyor'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='conveyor'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='conveyor'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">speed</span> 컨베이어
                </button>
                <button id="modeTabMaintenance" onclick="ProdEquipmentModule.switchMode('maintenance')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='maintenance'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='maintenance'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='maintenance'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">cleaning_services</span> 정비/청소
                </button>
                <button id="modeTabFProof" onclick="ProdEquipmentModule.switchMode('fproof')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='fproof'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='fproof'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='fproof'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">fact_check</span> F/PROOF
                </button>
                <button id="modeTabAirFilter" onclick="ProdEquipmentModule.switchMode('airfilter')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='airfilter'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='airfilter'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='airfilter'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">filter_alt</span> 압축에어필터
                </button>
                <button id="modeTabSupplyFilter" onclick="ProdEquipmentModule.switchMode('supplyfilter')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='supplyfilter'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='supplyfilter'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='supplyfilter'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">air</span> 급기필터
                </button>
                <button id="modeTabDryerClean" onclick="ProdEquipmentModule.switchMode('dryerclean')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='dryerclean'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='dryerclean'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='dryerclean'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">local_fire_department</span> 건조로 청소
                </button>
                <button id="modeTabWastewater" onclick="ProdEquipmentModule.switchMode('wastewater')"
                    style="padding:9px 20px;border:none;border-left:1px solid var(--border-color);cursor:pointer;font-size:0.875rem;
                           display:flex;align-items:center;gap:6px;transition:all .15s;
                           background:${_mode==='wastewater'?'var(--accent-blue)':'var(--bg-secondary)'};
                           color:${_mode==='wastewater'?'#fff':'var(--text-secondary)'};font-weight:${_mode==='wastewater'?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:16px;">water_drop</span> 폐수처리
                </button>
            </div>

            <div id="equipLineTabs" style="display:flex;gap:8px;margin-bottom:16px;"></div>
            <div id="equipMainContent"></div>
        </div>`;
        _renderLineTabs();
        _renderMainContent();
        try {
            const pendingIllum = sessionStorage.getItem('prodEquipmentIlluminationPoint');
            if (pendingIllum && _mode === 'illumination') {
                sessionStorage.removeItem('prodEquipmentIlluminationPoint');
                const data = JSON.parse(pendingIllum);
                setTimeout(() => openIlluminationModal(data.pointKey, data.month), 0);
            }
        } catch (e) {}
    }

    function switchMode(mode) {
        _mode = mode;
        [
            ['modeTabGeneral', 'general'],
            ['modeTabIllumination', 'illumination'],
            ['modeTabTemperature', 'temperature'],
            ['modeTabConveyor', 'conveyor'],
            ['modeTabMaintenance', 'maintenance'],
            ['modeTabFProof', 'fproof'],
            ['modeTabAirFilter', 'airfilter'],
            ['modeTabSupplyFilter', 'supplyfilter'],
            ['modeTabDryerClean', 'dryerclean'],
            ['modeTabWastewater', 'wastewater']
        ].forEach(([id, key]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const active = mode === key;
            btn.style.background = active ? 'var(--accent-blue)' : 'var(--bg-secondary)';
            btn.style.color = active ? '#fff' : 'var(--text-secondary)';
            btn.style.fontWeight = active ? '600' : '400';
        });
        _renderLineTabs();
        _renderMainContent();
    }

    function _renderMainContent() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        if (_mode === 'general') {
            el.innerHTML = `
            <div style="display:flex;gap:16px;align-items:flex-start;">
                <div style="width:280px;flex-shrink:0;">
                    <div class="card" style="overflow:hidden;">
                        <div style="display:flex;justify-content:space-between;align-items:center;
                                    padding:12px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);">
                            <span style="font-weight:600;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                                <span class="material-symbols-outlined" style="font-size:18px;">build</span>설비 목록
                            </span>
                            <button class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem;"
                                onclick="ProdEquipmentModule.openEquipAddModal()">
                                <span class="material-symbols-outlined" style="font-size:15px;">add</span> 추가
                            </button>
                        </div>
                        <div id="equipListBody"></div>
                    </div>
                </div>
                <div style="flex:1;min-width:0;">
                    ${_renderPlantLayout()}
                    <div id="equipDetailPanel">
                        <div class="card" style="padding:60px 0;text-align:center;color:var(--text-muted);">
                            <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:8px;opacity:.4;">touch_app</span>
                            좌측 설비 목록에서 설비를 선택하세요
                        </div>
                    </div>
                </div>
            </div>`;
            _renderEquipList();
            if (_equipId) _renderDetail();
        } else if (_mode === 'temperature') {
            _sqTab = 'ovenprofile';
            _renderTemperatureProfile();
        } else if (_mode === 'illumination') {
            _renderIllumination();
        } else if (_mode === 'maintenance') {
            _renderMaintenance();
        } else if (_mode === 'fproof') {
            _renderFProof();
        } else if (_mode === 'airfilter') {
            _renderAirFilter();
        } else if (_mode === 'supplyfilter') {
            _renderSupplyFilter();
        } else if (_mode === 'dryerclean') {
            _renderDryerClean();
        } else if (_mode === 'wastewater') {
            WastewaterModule._renderInTab(el);
        } else {
            _renderConveyor();
        }
    }

    function _renderPlantLayout() {
        const aActive = _line === '도장A라인';
        const bActive = _line === '도장B라인';
        const lineOverlay = (line, active, left, top, width, height) => `
            <button type="button" onclick="ProdEquipmentModule.switchLine('${line}')"
                title="${line}"
                style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;
                       border:${active ? '3px solid var(--accent-blue)' : '1px solid rgba(59,130,246,.45)'};
                       border-radius:8px;background:${active ? 'rgba(59,130,246,.16)' : 'rgba(255,255,255,.2)'};
                       box-shadow:${active ? '0 10px 24px rgba(59,130,246,.18)' : 'none'};
                       cursor:pointer;z-index:3;padding:0;">
                <span style="position:absolute;right:10px;top:8px;font-size:.72rem;font-weight:800;
                             color:${active ? 'var(--accent-blue)' : 'rgba(30,41,59,.72)'};">
                    ${active ? '선택됨' : '라인 선택'}
                </span>
            </button>`;
        const procOverlay = (line, proc, left, top, width, height, color) => `
            <button type="button" onclick="ProdEquipmentModule.focusProcess('${line}', '${proc}')"
                title="${line} - ${proc}"
                style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;
                       border:1px solid ${color};border-radius:6px;background:${color}22;
                       color:#0f172a;font-size:.72rem;font-weight:800;z-index:4;cursor:pointer;
                       display:flex;align-items:center;justify-content:center;text-align:center;
                       backdrop-filter:blur(1px);">
                ${proc}
            </button>`;

        return `
            <div class="card" style="margin-bottom:16px;overflow:hidden;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-primary);">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">map</span>
                        <div>
                            <h4 style="margin:0;font-size:0.98rem;color:var(--text-primary);">현장 레이아웃</h4>
                            <p style="margin:3px 0 0;font-size:0.75rem;color:var(--text-muted);">도장 라인, 검사실, 레이저룸, 공용 설비 배치</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;font-size:0.74rem;color:var(--text-muted);">
                        <span style="display:flex;align-items:center;gap:5px;"><i style="width:12px;height:8px;background:#93c5fd;border-radius:2px;display:inline-block;"></i>Booth</span>
                        <span style="display:flex;align-items:center;gap:5px;"><i style="width:12px;height:8px;background:#f9a8d4;border-radius:2px;display:inline-block;"></i>IR</span>
                        <span style="display:flex;align-items:center;gap:5px;"><i style="width:12px;height:8px;background:#e879f9;border-radius:2px;display:inline-block;"></i>Ion</span>
                    </div>
                </div>
                <div style="padding:14px 16px;background:#f8fafc;overflow-x:auto;">
                    <div style="position:relative;width:1500px;height:560px;margin:0;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6);">
                        <svg viewBox="0 0 1500 560" width="1500" height="560" role="img" aria-label="KC 케미칼 생산 현장 레이아웃" style="display:block;">
                            <defs>
                                <filter id="equipShadow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="2" dy="2" stdDeviation="1.2" flood-color="#000" flood-opacity=".18"/>
                                </filter>
                            </defs>
                            <rect x="0" y="0" width="1500" height="560" fill="#fff"/>
                            <text x="750" y="26" text-anchor="middle" font-size="24" font-weight="900" fill="#1e2a78">KC 케미칼 주식회사</text>
                            <text x="750" y="45" text-anchor="middle" font-size="10" font-weight="700" fill="#4b5563">KOREA COMPETENT CHEMICAL Co., Ltd.</text>

                            <rect x="12" y="60" width="1456" height="430" fill="#cdc9b6" stroke="#111827" stroke-width="1"/>
                            <rect x="12" y="230" width="126" height="250" fill="#2f4f6b" stroke="#111827" stroke-width="1"/>
                            <text x="75" y="302" text-anchor="middle" font-size="24" font-weight="900" fill="#fff">배합실</text>

                            <rect x="12" y="486" width="90" height="66" fill="#9b9b9b" stroke="#111827" stroke-width="1"/>
                            <text x="57" y="532" text-anchor="middle" font-size="17" font-weight="900" fill="#111827">드라이실</text>
                            <rect x="102" y="486" width="250" height="66" fill="#bebebe" stroke="#111827" stroke-width="1"/>
                            <text x="227" y="532" text-anchor="middle" font-size="17" font-weight="900" fill="#111827">실외기</text>
                            <rect x="352" y="486" width="280" height="66" fill="#c8c8c8" stroke="#111827" stroke-width="1"/>

                            <rect x="880" y="486" width="330" height="66" fill="#bebebe" stroke="#111827" stroke-width="1"/>
                            <text x="1045" y="532" text-anchor="middle" font-size="28" font-weight="900" fill="#111827">지그 창고</text>
                            <rect x="1210" y="486" width="86" height="66" fill="#4779b5" stroke="#111827" stroke-width="1"/>
                            <text x="1253" y="526" text-anchor="middle" font-size="14" fill="#10233f">Elevator</text>
                            <rect x="1210" y="390" width="88" height="48" fill="#fff68a" stroke="#111827" stroke-width="1"/>
                            <text x="1254" y="411" text-anchor="middle" font-size="11" font-weight="700" fill="#111827">화물용</text>
                            <text x="1254" y="427" text-anchor="middle" font-size="11" font-weight="700" fill="#111827">에어샤워</text>
                            <rect x="1298" y="390" width="58" height="48" fill="#fff68a" stroke="#111827" stroke-width="1"/>
                            <text x="1327" y="411" text-anchor="middle" font-size="10" font-weight="700" fill="#111827">사람용</text>
                            <text x="1327" y="427" text-anchor="middle" font-size="10" font-weight="700" fill="#111827">에어샤워</text>
                            <rect x="1356" y="438" width="112" height="52" fill="#fff" stroke="#111827" stroke-width="3"/>

                            <rect x="1190" y="60" width="142" height="78" fill="#e3747c" stroke="#111827" stroke-width="2" filter="url(#equipShadow)"/>
                            <text x="1261" y="110" text-anchor="middle" font-size="18" font-weight="900" fill="#111827">INSPECTION</text>
                            <rect x="1340" y="60" width="128" height="350" fill="#95cf62" stroke="#65a30d" stroke-width="2" filter="url(#equipShadow)"/>
                            <text x="1404" y="244" text-anchor="middle" font-size="19" font-weight="900" fill="#111827">LASER ROOM</text>
                            <rect x="1348" y="66" width="48" height="42" fill="#e5e65c" stroke="#111827" stroke-width="2"/>
                            <rect x="1444" y="110" width="26" height="58" fill="#ef2424" stroke="#111827" stroke-width="2"/>
                            <rect x="1444" y="178" width="26" height="58" fill="#ef2424" stroke="#111827" stroke-width="2"/>
                            <rect x="1444" y="246" width="26" height="58" fill="#ef2424" stroke="#111827" stroke-width="2"/>
                            <text x="1457" y="144" text-anchor="middle" font-size="15" font-weight="800" fill="#111827">#1</text>
                            <text x="1457" y="212" text-anchor="middle" font-size="15" font-weight="800" fill="#111827">#2</text>
                            <text x="1457" y="280" text-anchor="middle" font-size="15" font-weight="800" fill="#111827">#3</text>

                            <path d="M90 66 H930 V224 H786 V192 H90 Z" fill="#f2f2f2" stroke="#111827" stroke-width="3"/>
                            <path d="M138 82 H930 V214 H850 V178 H138 Z" fill="none" stroke="#111827" stroke-width="2"/>
                            <path d="M95 292 H1032 V450 H96 Z" fill="#f5f5f5" stroke="#111827" stroke-width="3"/>
                            <path d="M132 316 H996 V438 H132 Z" fill="none" stroke="#111827" stroke-width="2"/>

                            <rect x="180" y="75" width="675" height="75" fill="#f5aecb" opacity=".72"/>
                            <rect x="200" y="86" width="722" height="24" fill="none" stroke="#ef2d2d" stroke-width="3"/>
                            <text x="245" y="104" font-size="13" font-weight="800" fill="#111827">IR #7</text>
                            <text x="455" y="104" font-size="13" font-weight="800" fill="#111827">IR #8</text>
                            <path d="M610 108 H860 V134 H180" fill="none" stroke="#111827" stroke-width="2"/>
                            <text x="760" y="126" font-size="13" font-weight="800" fill="#111827">IR #6</text>
                            <text x="390" y="146" font-size="13" font-weight="800" fill="#111827">IR #4</text>
                            <text x="628" y="146" font-size="13" font-weight="800" fill="#111827">IR #5</text>

                            <rect x="127" y="104" width="56" height="44" fill="#83d6d9" opacity=".85"/>
                            <text x="155" y="130" text-anchor="middle" font-size="12" fill="#111827">UV Room</text>
                            <rect x="127" y="404" width="60" height="44" fill="#83d6d9" opacity=".85"/>
                            <text x="157" y="430" text-anchor="middle" font-size="12" fill="#111827">UV Room</text>

                            <rect x="100" y="150" width="48" height="86" fill="#ffe3e3" opacity=".82" stroke="#111827" stroke-width="2"/>
                            <text x="124" y="183" text-anchor="middle" font-size="12" font-weight="800">IR #3</text>
                            <rect x="194" y="165" width="66" height="82" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="227" y="199" text-anchor="middle" font-size="13" font-weight="800">#4 Booth</text>
                            <rect x="276" y="160" width="68" height="80" fill="#ffe3e3" stroke="#111827" stroke-width="2"/>
                            <text x="310" y="199" text-anchor="middle" font-size="13" font-weight="800">IR #2</text>
                            <rect x="368" y="174" width="72" height="74" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="404" y="206" text-anchor="middle" font-size="13" font-weight="800">#3 Booth</text>
                            <rect x="450" y="164" width="74" height="78" fill="#ffe3e3" stroke="#111827" stroke-width="2"/>
                            <text x="487" y="211" text-anchor="middle" font-size="13" font-weight="800">IR #1-2</text>
                            <rect x="534" y="174" width="116" height="74" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="592" y="204" text-anchor="middle" font-size="13" font-weight="800">신규부스</text>
                            <text x="592" y="221" text-anchor="middle" font-size="13" font-weight="800">(미사용)</text>
                            <rect x="668" y="164" width="78" height="78" fill="#ffe3e3" stroke="#111827" stroke-width="2"/>
                            <text x="707" y="211" text-anchor="middle" font-size="13" font-weight="800">IR #1-1</text>
                            <rect x="764" y="174" width="68" height="74" fill="#c2e8e9" stroke="#111827" stroke-width="2"/>
                            <text x="798" y="206" text-anchor="middle" font-size="13" font-weight="800">#2 Booth</text>
                            <rect x="864" y="174" width="64" height="74" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="896" y="206" text-anchor="middle" font-size="13" font-weight="800">#1 Booth</text>
                            <rect x="944" y="174" width="54" height="74" fill="#9c7bbb" stroke="#111827" stroke-width="2"/>
                            <text x="971" y="206" text-anchor="middle" font-size="13" font-weight="800">#1 Ion</text>

                            <rect x="170" y="306" width="62" height="74" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="201" y="346" text-anchor="middle" font-size="13" font-weight="800">#5 Booth</text>
                            <rect x="258" y="306" width="62" height="74" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="289" y="346" text-anchor="middle" font-size="13" font-weight="800">#4 Booth</text>
                            <rect x="334" y="306" width="54" height="74" fill="#9c7bbb" stroke="#111827" stroke-width="2"/>
                            <text x="361" y="346" text-anchor="middle" font-size="13" font-weight="800">#2 Ion</text>
                            <rect x="394" y="298" width="184" height="86" fill="#ffe3e3" stroke="#111827" stroke-width="2"/>
                            <text x="486" y="354" text-anchor="middle" font-size="13" font-weight="800">IR #2</text>
                            <rect x="614" y="300" width="66" height="80" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="647" y="346" text-anchor="middle" font-size="13" font-weight="800">#3 Booth</text>
                            <rect x="722" y="300" width="66" height="80" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="755" y="346" text-anchor="middle" font-size="13" font-weight="800">#2 Booth</text>
                            <rect x="870" y="304" width="112" height="68" fill="#7fb3df" stroke="#111827" stroke-width="2"/>
                            <text x="926" y="346" text-anchor="middle" font-size="13" font-weight="800">#1 Booth</text>
                            <rect x="986" y="304" width="54" height="68" fill="#9c7bbb" stroke="#111827" stroke-width="2"/>
                            <text x="1013" y="346" text-anchor="middle" font-size="13" font-weight="800">#1 Ion</text>
                            <text x="836" y="345" text-anchor="middle" font-size="12" font-weight="800">IR #1</text>

                            <rect x="190" y="392" width="785" height="54" fill="#f5aecb" opacity=".72"/>
                            <text x="350" y="415" font-size="13" font-weight="800">IR #4</text>
                            <text x="520" y="432" font-size="13" font-weight="800">IR #5</text>
                            <text x="642" y="432" font-size="13" font-weight="800">IR #6</text>
                            <text x="760" y="432" font-size="13" font-weight="800">IR #7</text>
                            <text x="890" y="432" font-size="13" font-weight="800">IR #8</text>

                            <rect x="928" y="64" width="146" height="22" fill="#f47721" stroke="#111827" stroke-width="2"/>
                            <rect x="970" y="112" width="170" height="24" fill="#4276bb"/>
                            <rect x="1040" y="146" width="92" height="50" fill="#4276bb"/>
                            <text x="1088" y="252" text-anchor="middle" font-size="26" font-weight="900" fill="#111827">B - LINE</text>
                            <rect x="962" y="106" width="52" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="988" y="126" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">언로딩</text>
                            <rect x="1078" y="106" width="58" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1107" y="126" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">검사</text>
                            <rect x="1038" y="140" width="58" height="32" rx="6" fill="#0e7490" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1067" y="160" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">세척</text>
                            <rect x="988" y="178" width="54" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1015" y="198" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">로딩</text>

                            <rect x="1084" y="356" width="148" height="24" fill="#4276bb"/>
                            <rect x="1090" y="438" width="148" height="22" fill="#f47721" stroke="#111827" stroke-width="2"/>
                            <text x="1165" y="405" text-anchor="middle" font-size="26" font-weight="900" fill="#111827">A - LINE</text>
                            <rect x="1138" y="334" width="58" height="32" rx="6" fill="#0e7490" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1167" y="354" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">세척</text>
                            <rect x="1148" y="382" width="58" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1177" y="402" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">로딩</text>
                            <rect x="1070" y="410" width="60" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1100" y="430" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">언로딩</text>
                            <rect x="1190" y="410" width="58" height="32" rx="6" fill="#2f6ea8" stroke="#0f3c5c" stroke-width="2"/>
                            <text x="1219" y="430" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">검사</text>

                            <path d="M94 230 H126 V158 H112 V222 H148 V206 H280 V172 H330 V222 H380 V188 H486 V222 H534 V190 H628 V222 H692 V188 H730 V222 H888 V222 H966 V222 H966 V222 H1098 V90 H210 V116 H858" fill="none" stroke="#ef2d2d" stroke-width="3"/>
                            <path d="M96 402 H132 V326 H508 V350 H444 V372 H542 V348 H736 V372 H788 V336 H836 V370 H872 V330 H1030 V356 H1150 V374 H1048 V418 H1078 V438 H970 V414 H214 V438 H954" fill="none" stroke="#ef2d2d" stroke-width="3"/>
                            <path d="M214 414 H965 V436 H214 Z" fill="none" stroke="#ef2d2d" stroke-width="3"/>
                            <path d="M110 180 V96 H895 V136 H1020 V194 H930" fill="none" stroke="#ef2d2d" stroke-width="3"/>
                        </svg>

                        ${lineOverlay('도장B라인', bActive, 90, 66, 870, 184)}
                        ${lineOverlay('도장A라인', aActive, 96, 292, 936, 162)}
                        ${procOverlay('도장B라인', '세척', 1018, 136, 94, 42, '#0891b2')}
                        ${procOverlay('도장B라인', '로딩', 956, 172, 86, 42, '#2563eb')}
                        ${procOverlay('도장B라인', '언로딩', 944, 98, 92, 42, '#2563eb')}
                        ${procOverlay('도장B라인', '도장 검사', 1066, 98, 88, 42, '#2563eb')}
                        ${procOverlay('도장A라인', '세척', 1124, 326, 88, 42, '#0891b2')}
                        ${procOverlay('도장A라인', '로딩', 1136, 374, 88, 42, '#2563eb')}
                        ${procOverlay('도장A라인', '언로딩', 1056, 404, 92, 42, '#2563eb')}
                        ${procOverlay('도장A라인', '도장 검사', 1180, 404, 88, 42, '#2563eb')}
                        ${procOverlay('도장A라인', '건조', 382, 392, 594, 54, '#ec4899')}
                        ${procOverlay('도장B라인', '건조', 182, 76, 674, 74, '#ec4899')}
                        ${procOverlay(_line, '배합', 12, 230, 126, 250, '#334155')}
                    </div>
                </div>
            </div>`;
    }

    function _renderLineTabs() {
        const el = document.getElementById('equipLineTabs');
        if (!el) return;
        if (_mode === 'temperature' || _mode === 'illumination' || _mode === 'conveyor' || _mode === 'maintenance' || _mode === 'fproof' || _mode === 'airfilter' || _mode === 'supplyfilter' || _mode === 'dryerclean' || _mode === 'wastewater') {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        el.style.display = 'flex';
        el.innerHTML = LINES.map(l => `
            <button class="btn ${l === _line ? 'btn-primary' : 'btn-outline'}"
                    onclick="ProdEquipmentModule.switchLine('${l}')">
                <span class="material-symbols-outlined">precision_manufacturing</span> ${l}
            </button>`).join('');
    }

    function _renderEquipList() {
        const el = document.getElementById('equipListBody');
        if (!el) return;
        const allEquips = (Storage.getAll(ST_EQUIP) || []).filter(e => e.line === _line);

        // 공정 그룹별 렌더링
        let html = '';
        let _commonDividerShown = false;
        PROC_STATIONS.forEach(proc => {
            // 공통 설비 구역 구분선 (처음 한 번만)
            if (proc.common && !_commonDividerShown) {
                _commonDividerShown = true;
                html += `
                <div style="padding:6px 12px;background:linear-gradient(90deg,var(--accent-teal,#0d9488)18,transparent);
                            border-top:2px solid var(--accent-teal,#0d9488);border-bottom:1px solid var(--border-color);
                            display:flex;align-items:center;gap:6px;margin-top:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent-teal,#0d9488);">handyman</span>
                    <span style="font-size:0.75rem;font-weight:700;color:var(--accent-teal,#0d9488);letter-spacing:.04em;">공통 관리 설비</span>
                </div>`;
            }

            const equips = allEquips
                .filter(e => e.process === proc.name)
                .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0) || (a.name||'').localeCompare(b.name||'','ko'));

            // 공정 헤더
            const hdrBg   = proc.common ? 'var(--bg-tertiary,#f1f5f9)' : 'var(--bg-secondary)';
            const hdrColor = proc.common ? 'var(--accent-teal,#0d9488)' : 'var(--text-secondary)';
            html += `
            <div id="${_procAnchor(proc.name)}" style="padding:6px 12px 4px;background:${hdrBg};
                        border-bottom:1px solid var(--border-color);border-top:1px solid var(--border-color);
                        display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1;">
                <span style="font-size:0.78rem;font-weight:700;color:${hdrColor};
                             display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;">${proc.icon}</span>
                    ${proc.no ? `<span style="color:var(--text-muted);font-weight:400;font-size:.72rem;">${proc.no} </span>` : ''}
                    ${_esc(proc.name)}
                </span>
                <button onclick="ProdEquipmentModule.openEquipAddModal('${_esc(proc.name)}')"
                    style="padding:2px 8px;font-size:0.72rem;border:1px solid var(--accent-blue);
                           border-radius:4px;background:transparent;color:var(--accent-blue);
                           cursor:pointer;display:flex;align-items:center;gap:2px;">
                    <span class="material-symbols-outlined" style="font-size:13px;">add</span>추가
                </button>
            </div>`;

            if (equips.length === 0) {
                html += `<div style="padding:7px 14px 8px 20px;font-size:0.76rem;color:var(--text-muted);
                                     border-bottom:1px solid var(--border-color);">설비 미등록</div>`;
            } else {
                equips.forEach(e => {
                    const sel  = e.id === _equipId;
                    const sCol = e.status === '정상' ? 'var(--accent-green)' :
                                 e.status === '점검중' ? '#f59e0b' :
                                 e.status === '수리중' ? 'var(--accent-red)' : 'var(--text-muted)';
                    html += `
                    <div style="padding:7px 10px 7px 18px;
                                border-bottom:1px solid var(--border-color);
                                background:${sel ? '#eff6ff' : 'transparent'};
                                border-left:3px solid ${sel ? 'var(--accent-blue)' : 'transparent'};
                                transition:background .15s;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                            <div onclick="ProdEquipmentModule.selectEquip('${e.id}')"
                                 style="flex:1;min-width:0;cursor:pointer;">
                                <div style="display:flex;align-items:center;gap:4px;">
                                    <span style="font-weight:${sel?'700':'500'};font-size:0.85rem;
                                                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                        <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;
                                            color:var(--text-muted);margin-right:2px;">settings</span>${_esc(e.name)}
                                    </span>
                                    <span style="font-size:.68rem;font-weight:600;flex-shrink:0;color:${sCol};
                                                 background:${sCol}22;padding:1px 5px;border-radius:8px;">${e.status||'정상'}</span>
                                </div>
                                ${e.model ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:1px;padding-left:15px;">${_esc(e.model)}</div>` : ''}
                            </div>
                            <div style="display:flex;gap:2px;flex-shrink:0;">
                                <button onclick="event.stopPropagation();ProdEquipmentModule.editEquip('${e.id}')"
                                    title="수정"
                                    style="padding:3px 5px;border:1px solid var(--border-color);border-radius:4px;
                                           background:var(--bg-primary);cursor:pointer;line-height:1;">
                                    <span class="material-symbols-outlined" style="font-size:13px;color:var(--accent-blue);vertical-align:middle;">edit</span>
                                </button>
                                <button onclick="event.stopPropagation();ProdEquipmentModule.deleteEquip('${e.id}')"
                                    title="삭제"
                                    style="padding:3px 5px;border:1px solid var(--border-color);border-radius:4px;
                                           background:var(--bg-primary);cursor:pointer;line-height:1;">
                                    <span class="material-symbols-outlined" style="font-size:13px;color:var(--accent-red);vertical-align:middle;">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>`;
                });
            }
        });

        // 미분류 (process 없는 기존 데이터)
        const uncat = allEquips.filter(e => !e.process || !PROC_STATIONS.find(p => p.name === e.process));
        if (uncat.length > 0) {
            html += `
            <div style="padding:6px 12px 4px;background:var(--bg-secondary);
                        border-bottom:1px solid var(--border-color);border-top:1px solid var(--border-color);">
                <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">📦 미분류</span>
            </div>`;
            uncat.forEach(e => {
                const sel = e.id === _equipId;
                html += `
                <div style="padding:7px 10px 7px 18px;border-bottom:1px solid var(--border-color);
                            background:${sel?'#eff6ff':'transparent'};
                            border-left:3px solid ${sel?'var(--accent-blue)':'transparent'};transition:background .15s;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span onclick="ProdEquipmentModule.selectEquip('${e.id}')"
                              style="font-size:0.85rem;font-weight:${sel?'700':'500'};flex:1;cursor:pointer;">${_esc(e.name)}</span>
                        <div style="display:flex;gap:2px;flex-shrink:0;">
                            <button onclick="event.stopPropagation();ProdEquipmentModule.editEquip('${e.id}')"
                                title="수정"
                                style="padding:3px 5px;border:1px solid var(--border-color);border-radius:4px;
                                       background:var(--bg-primary);cursor:pointer;line-height:1;">
                                <span class="material-symbols-outlined" style="font-size:13px;color:var(--accent-blue);vertical-align:middle;">edit</span>
                            </button>
                            <button onclick="event.stopPropagation();ProdEquipmentModule.deleteEquip('${e.id}')"
                                title="삭제"
                                style="padding:3px 5px;border:1px solid var(--border-color);border-radius:4px;
                                       background:var(--bg-primary);cursor:pointer;line-height:1;">
                                <span class="material-symbols-outlined" style="font-size:13px;color:var(--accent-red);vertical-align:middle;">delete</span>
                            </button>
                        </div>
                    </div>
                </div>`;
            });
        }

        el.innerHTML = html;
    }

    // ── 라인 전환 ────────────────────────────────────────────────
    function switchLine(line) {
        _line    = line;
        _equipId = null;
        _renderLineTabs();
        if (_mode === 'general') {
            _renderMainContent();
        } else {
            _renderSQ();
        }
    }

    function focusProcess(line, processName) {
        _line    = line || _line;
        _equipId = null;
        _renderLineTabs();
        _renderMainContent();
        setTimeout(() => {
            const target = document.getElementById(_procAnchor(processName));
            if (!target) return;
            target.scrollIntoView({ block:'nearest', behavior:'smooth' });
            target.style.boxShadow = 'inset 3px 0 0 var(--accent-blue), 0 0 0 2px rgba(59,130,246,.16)';
            setTimeout(() => { target.style.boxShadow = ''; }, 1200);
        }, 0);
    }

    function _procAnchor(name) {
        return 'equipProc_' + encodeURIComponent(String(name || '')).replace(/%/g, '_');
    }

    // ── 설비 선택 ────────────────────────────────────────────────
    function selectEquip(id) {
        _equipId = id;
        _subTab  = 'spare';
        _renderEquipList();
        _renderDetail();
    }

    function _renderDetail() {
        const equip = Storage.getById(ST_EQUIP, _equipId);
        if (!equip) return;
        const dp = document.getElementById('equipDetailPanel');
        if (!dp) return;
        const sCol = equip.status === '정상' ? 'var(--accent-green)' :
                     equip.status === '점검중' ? '#f59e0b' :
                     equip.status === '수리중' ? 'var(--accent-red)' : 'var(--text-muted)';
        dp.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);
                        display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-weight:700;font-size:1rem;">${_esc(equip.name)}</span>
                    <span style="font-size:0.78rem;color:var(--text-muted);">${equip.line}</span>
                    ${equip.model ? `<span style="font-size:0.78rem;color:var(--text-muted);">${_esc(equip.model)}</span>` : ''}
                    <span style="font-size:0.76rem;font-weight:600;color:${sCol};
                                 background:${sCol}22;padding:2px 9px;border-radius:10px;">${equip.status || '정상'}</span>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-outline btn-sm" onclick="ProdEquipmentModule.editEquip('${equip.id}')">수정</button>
                    <button class="btn btn-danger btn-sm"  onclick="ProdEquipmentModule.deleteEquip('${equip.id}')">삭제</button>
                </div>
            </div>
            ${equip.note ? `<div style="padding:6px 16px;font-size:0.8rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">${_esc(equip.note)}</div>` : ''}

            <!-- 서브 탭 -->
            <div style="display:flex;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);">
                ${[{k:'spare',icon:'inventory',label:'스페어 관리'},
                   {k:'check',icon:'checklist',label:'점검 항목'},
                   {k:'issue',icon:'warning',label:'이상 발생'},
                   {k:'downtime',icon:'pause_circle',label:'비가동 이력'}].map(t => `
                    <button id="subTab_${t.k}" onclick="ProdEquipmentModule.switchSubTab('${t.k}')"
                            style="flex:1;padding:9px 4px;border:none;cursor:pointer;font-size:0.8rem;
                                   display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s;
                                   background:${_subTab===t.k?'#fff':'transparent'};
                                   color:${_subTab===t.k?'var(--accent-blue)':'var(--text-secondary)'};
                                   font-weight:${_subTab===t.k?'600':'400'};
                                   border-bottom:2px solid ${_subTab===t.k?'var(--accent-blue)':'transparent'};">
                        <span class="material-symbols-outlined" style="font-size:15px;">${t.icon}</span>${t.label}
                    </button>`).join('')}
            </div>
            <div id="subTabContent" style="padding:16px;"></div>
        </div>`;
        _renderSubTab();
    }

    function switchSubTab(tab) {
        _subTab = tab;
        ['spare','check','issue','downtime'].forEach(k => {
            const el = document.getElementById('subTab_' + k);
            if (!el) return;
            const active = k === tab;
            el.style.background     = active ? '#fff' : 'transparent';
            el.style.color          = active ? 'var(--accent-blue)' : 'var(--text-secondary)';
            el.style.fontWeight     = active ? '600' : '400';
            el.style.borderBottom   = active ? '2px solid var(--accent-blue)' : '2px solid transparent';
        });
        _renderSubTab();
    }

    function _renderSubTab() {
        const el = document.getElementById('subTabContent');
        if (!el) return;
        switch (_subTab) {
            case 'spare':    _renderSpareTab(el);    break;
            case 'check':    _renderCheckTab(el);    break;
            case 'issue':    _renderIssueTab(el);    break;
            case 'downtime': _renderDowntimeTab(el); break;
        }
    }

    // ════════════════════════════════════════════════════════════
    // 1) 스페어 관리
    // ════════════════════════════════════════════════════════════
    function _renderSpareTab(el) {
        const rows = (Storage.getAll(ST_SPARE) || []).filter(s => s.equipId === _equipId);
        el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <button class="btn btn-primary" onclick="ProdEquipmentModule.openSpareModal()">
                <span class="material-symbols-outlined">add</span> 스페어 추가
            </button>
        </div>
        <div class="data-table-wrapper">
            <table class="data-table" style="table-layout:fixed;">
                <colgroup>
                    <col style="width:4%"><col style="width:19%"><col style="width:12%"><col style="width:16%">
                    <col style="width:8%"><col style="width:8%"><col style="width:10%"><col style="width:11%"><col style="width:12%">
                </colgroup>
                <thead><tr>
                    <th>No</th><th>부품명</th><th>부품번호</th><th>규격/사양</th>
                    <th>최소재고</th><th>현재고</th><th>교체주기(일)</th><th>최근교체일</th><th>작업</th>
                </tr></thead>
                <tbody>
                ${rows.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-muted);">등록된 스페어 파트가 없습니다.</td></tr>` :
                rows.map((s, i) => {
                    const low = s.currentStock != null && s.minStock != null && Number(s.currentStock) <= Number(s.minStock);
                    return `<tr${low ? ' style="background:#fff5f5;"' : ''}>
                        <td>${i+1}</td>
                        <td><strong>${_esc(s.partName)}</strong>${low ? ' <span style="font-size:.7rem;color:var(--accent-red);font-weight:700;">⚠재고부족</span>' : ''}</td>
                        <td>${_esc(s.partNo||'-')}</td>
                        <td style="font-size:.8rem;">${_esc(s.spec||'-')}</td>
                        <td style="text-align:right;">${s.minStock != null ? s.minStock : '-'}</td>
                        <td style="text-align:right;font-weight:${low?'700':'400'};color:${low?'var(--accent-red)':'inherit'};">${s.currentStock != null ? s.currentStock : '-'}</td>
                        <td style="text-align:right;">${s.replaceCycle||'-'}</td>
                        <td>${s.lastReplaced||'-'}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openSpareModal('${s.id}')">수정</button>
                            <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeSpare('${s.id}')">삭제</button>
                        </td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _spareForm(s) {
        s = s || {};
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">부품명 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="sfName" value="${_esc(s.partName||'')}" placeholder="예: 에어 필터">
            </div>
            <div class="form-group">
                <label class="form-label">부품번호</label>
                <input type="text" class="form-input" id="sfNo" value="${_esc(s.partNo||'')}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">규격/사양</label>
                <input type="text" class="form-input" id="sfSpec" value="${_esc(s.spec||'')}">
            </div>
            <div class="form-group">
                <label class="form-label">교체 주기 (일)</label>
                <input type="number" class="form-input" id="sfCycle" value="${s.replaceCycle||''}" placeholder="예: 90">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">최소 재고</label>
                <input type="number" class="form-input" id="sfMin" value="${s.minStock != null ? s.minStock : ''}">
            </div>
            <div class="form-group">
                <label class="form-label">현재 재고</label>
                <input type="number" class="form-input" id="sfCur" value="${s.currentStock != null ? s.currentStock : ''}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">최근 교체일</label>
                <input type="date" class="form-input" id="sfLast" value="${s.lastReplaced||''}">
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="sfNote" value="${_esc(s.note||'')}">
            </div>
        </div>`;
    }
    function _collectSpare() {
        const minV = document.getElementById('sfMin').value;
        const curV = document.getElementById('sfCur').value;
        return {
            equipId: _equipId,
            partName: document.getElementById('sfName').value.trim(),
            partNo:   document.getElementById('sfNo').value.trim(),
            spec:     document.getElementById('sfSpec').value.trim(),
            replaceCycle: Number(document.getElementById('sfCycle').value)||null,
            minStock:     minV !== '' ? Number(minV) : null,
            currentStock: curV !== '' ? Number(curV) : null,
            lastReplaced: document.getElementById('sfLast').value,
            note:     document.getElementById('sfNote').value.trim()
        };
    }
    function openSpareModal(id) {
        const s = id ? Storage.getById(ST_SPARE, id) : null;
        UIUtils.showModal(id ? '스페어 수정' : '스페어 추가', _spareForm(s), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveSpare('${id||''}')">저장</button>`, 'md');
    }
    async function saveSpare(id) {
        const data = _collectSpare();
        if (!data.partName) { UIUtils.toast('부품명을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_SPARE, id, data);
        else    await Storage.add(ST_SPARE, data);
        UIUtils.closeModal();
        _renderSubTab();
    }
    function removeSpare(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => { await Storage.remove(ST_SPARE, id); _renderSubTab(); });
    }

    // ════════════════════════════════════════════════════════════
    // 2) 점검 항목
    // ════════════════════════════════════════════════════════════
    function _renderCheckTab(el) {
        const items   = (Storage.getAll(ST_CITEM) || []).filter(c => c.equipId === _equipId);
        const records = (Storage.getAll(ST_CREC)  || []).filter(r => r.equipId === _equipId)
                            .sort((a,b) => b.date.localeCompare(a.date));
        el.innerHTML = `
        <!-- 점검 항목 마스터 -->
        <div style="margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h5 style="margin:0;font-size:0.88rem;color:var(--text-secondary);">■ 점검 항목 목록</h5>
                <button class="btn btn-primary" onclick="ProdEquipmentModule.openCheckItemModal()">
                    <span class="material-symbols-outlined">add</span> 항목 추가
                </button>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table" style="table-layout:fixed;">
                    <colgroup>
                        <col style="width:4%"><col style="width:22%"><col style="width:20%">
                        <col style="width:22%"><col style="width:9%"><col style="width:11%"><col style="width:12%">
                    </colgroup>
                    <thead><tr><th>No</th><th>점검 항목</th><th>점검 방법</th><th>판정 기준</th><th>주기</th><th>비고</th><th>작업</th></tr></thead>
                    <tbody>
                    ${items.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">항목이 없습니다.</td></tr>` :
                    items.map((c,i) => `<tr>
                        <td>${i+1}</td>
                        <td><strong>${_esc(c.itemName)}</strong></td>
                        <td style="font-size:.8rem;">${_esc(c.method||'-')}</td>
                        <td style="font-size:.8rem;">${_esc(c.criteria||'-')}</td>
                        <td><span class="badge badge-info" style="font-size:.72rem;">${c.cycleType||'일상'}</span></td>
                        <td style="font-size:.78rem;">${_esc(c.note||'-')}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openCheckItemModal('${c.id}')">수정</button>
                            <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeCheckItem('${c.id}')">삭제</button>
                        </td>
                    </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 점검 실적 -->
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h5 style="margin:0;font-size:0.88rem;color:var(--text-secondary);">■ 점검 실적</h5>
                <button class="btn btn-secondary" onclick="ProdEquipmentModule.openCheckRecModal()">
                    <span class="material-symbols-outlined">add</span> 실적 등록
                </button>
            </div>
            <div class="data-table-wrapper">
                <table class="data-table" style="table-layout:fixed;">
                    <colgroup>
                        <col style="width:4%"><col style="width:11%"><col style="width:22%"><col style="width:9%">
                        <col style="width:20%"><col style="width:11%"><col style="width:9%"><col style="width:14%">
                    </colgroup>
                    <thead><tr><th>No</th><th>점검일</th><th>점검 항목</th><th>주기</th><th>결과/조치</th><th>점검자</th><th>판정</th><th>작업</th></tr></thead>
                    <tbody>
                    ${records.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">실적이 없습니다.</td></tr>` :
                    records.map((r,i) => `<tr>
                        <td>${records.length-i}</td>
                        <td>${r.date}</td>
                        <td>${_esc(r.itemName||'-')}</td>
                        <td style="font-size:.78rem;">${r.cycleType||'-'}</td>
                        <td style="font-size:.8rem;">${_esc(r.detail||'-')}</td>
                        <td>${_esc(r.checker||'-')}</td>
                        <td><span class="badge ${r.result==='정상'?'badge-success':r.result==='이상'?'badge-danger':'badge-warning'}">${r.result||'-'}</span></td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openCheckRecModal('${r.id}')">수정</button>
                            <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeCheckRec('${r.id}')">삭제</button>
                        </td>
                    </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function _checkItemForm(c) {
        c = c || {};
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">점검 항목 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="ciName" value="${_esc(c.itemName||'')}" placeholder="예: 오일 레벨 확인">
            </div>
            <div class="form-group">
                <label class="form-label">점검 주기</label>
                <select class="form-select" id="ciCycle">
                    ${['일상','주간','월간','분기','반기','연간'].map(t => `<option ${(c.cycleType||'일상')===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">점검 방법</label>
                <input type="text" class="form-input" id="ciMethod" value="${_esc(c.method||'')}" placeholder="예: 육안 확인">
            </div>
            <div class="form-group">
                <label class="form-label">판정 기준</label>
                <input type="text" class="form-input" id="ciCriteria" value="${_esc(c.criteria||'')}" placeholder="예: 이상음 없음">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">비고</label>
            <textarea class="form-textarea" id="ciNote" rows="2">${_esc(c.note||'')}</textarea>
        </div>`;
    }
    function _collectCheckItem() {
        return { equipId:_equipId, itemName:document.getElementById('ciName').value.trim(),
            cycleType:document.getElementById('ciCycle').value, method:document.getElementById('ciMethod').value.trim(),
            criteria:document.getElementById('ciCriteria').value.trim(), note:document.getElementById('ciNote').value.trim() };
    }
    function openCheckItemModal(id) {
        const c = id ? Storage.getById(ST_CITEM, id) : null;
        UIUtils.showModal(id ? '점검 항목 수정' : '점검 항목 추가', _checkItemForm(c), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveCheckItem('${id||''}')">저장</button>`, 'md');
    }
    async function saveCheckItem(id) {
        const data = _collectCheckItem();
        if (!data.itemName) { UIUtils.toast('점검 항목명을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_CITEM, id, data);
        else    await Storage.add(ST_CITEM, data);
        UIUtils.closeModal();
        _renderSubTab();
    }
    function removeCheckItem(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => { await Storage.remove(ST_CITEM, id); _renderSubTab(); });
    }

    function _checkRecForm(r) {
        r = r || {};
        const items = (Storage.getAll(ST_CITEM) || []).filter(c => c.equipId === _equipId);
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                <input type="date" class="form-input" id="crDate" value="${r.date||UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">점검 항목</label>
                <select class="form-select" id="crItemSel" onchange="ProdEquipmentModule._onCheckSel(this)">
                    <option value="">-- 선택 또는 직접입력 --</option>
                    ${items.map(c => `<option value="${_esc(c.itemName)}" data-cycle="${c.cycleType}"
                        ${r.itemName===c.itemName?'selected':''}>${_esc(c.itemName)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">항목명 (직접입력)</label>
                <input type="text" class="form-input" id="crItemName" value="${_esc(r.itemName||'')}" placeholder="위 선택 또는 직접 입력">
            </div>
            <div class="form-group">
                <label class="form-label">주기</label>
                <select class="form-select" id="crCycle">
                    ${['일상','주간','월간','분기','반기','연간'].map(t => `<option ${(r.cycleType||'일상')===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">판정</label>
                <select class="form-select" id="crResult">
                    ${['정상','이상','조치완료'].map(t => `<option ${(r.result||'정상')===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">점검자</label>
                <input type="text" class="form-input" id="crChecker" value="${_esc(r.checker||'')}">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">결과/조치 내용</label>
            <textarea class="form-textarea" id="crDetail" rows="2">${_esc(r.detail||'')}</textarea>
        </div>`;
    }
    function _onCheckSel(sel) {
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.value) {
            const nameEl = document.getElementById('crItemName');
            if (nameEl) nameEl.value = opt.value;
            const cyc = document.getElementById('crCycle');
            if (cyc && opt.dataset.cycle) cyc.value = opt.dataset.cycle;
        }
    }
    function _collectCheckRec() {
        const nameEl = document.getElementById('crItemName');
        return { equipId:_equipId, date:document.getElementById('crDate').value,
            itemName:(nameEl?nameEl.value.trim():''), cycleType:document.getElementById('crCycle').value,
            result:document.getElementById('crResult').value, checker:document.getElementById('crChecker').value.trim(),
            detail:document.getElementById('crDetail').value.trim() };
    }
    function openCheckRecModal(id) {
        const r = id ? Storage.getById(ST_CREC, id) : null;
        UIUtils.showModal(id ? '점검 실적 수정' : '점검 실적 등록', _checkRecForm(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveCheckRec('${id||''}')">저장</button>`, 'md');
    }
    async function saveCheckRec(id) {
        const data = _collectCheckRec();
        if (!data.date || !data.itemName) { UIUtils.toast('날짜와 항목명을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_CREC, id, data);
        else    await Storage.add(ST_CREC, data);
        UIUtils.closeModal();
        _renderSubTab();
    }
    function removeCheckRec(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => { await Storage.remove(ST_CREC, id); _renderSubTab(); });
    }

    // ════════════════════════════════════════════════════════════
    // 3) 이상 발생 및 조치
    // ════════════════════════════════════════════════════════════
    function _renderIssueTab(el) {
        const rows = (Storage.getAll(ST_ISSUE) || []).filter(s => s.equipId === _equipId)
                        .sort((a,b) => b.date.localeCompare(a.date));
        el.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <button class="btn btn-primary" onclick="ProdEquipmentModule.openIssueModal()">
                <span class="material-symbols-outlined">add</span> 이상 등록
            </button>
        </div>
        <div class="data-table-wrapper">
            <table class="data-table" style="table-layout:fixed;">
                <colgroup>
                    <col style="width:4%"><col style="width:10%"><col style="width:18%"><col style="width:17%">
                    <col style="width:17%"><col style="width:10%"><col style="width:11%"><col style="width:13%">
                </colgroup>
                <thead><tr>
                    <th>No</th><th>발생일</th><th>이상 내용</th><th>원인</th>
                    <th>조치 내용</th><th>조치일</th><th>처리 상태</th><th>작업</th>
                </tr></thead>
                <tbody>
                ${rows.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted);">이상 이력이 없습니다.</td></tr>` :
                rows.map((iss,i) => `<tr${iss.status==='발생'?' style="background:#fff5f5;"':''}>
                    <td>${rows.length-i}</td>
                    <td>${iss.date}</td>
                    <td><strong>${_esc(iss.issueName)}</strong></td>
                    <td style="font-size:.8rem;">${_esc(iss.cause||'-')}</td>
                    <td style="font-size:.8rem;">${_esc(iss.action||'-')}</td>
                    <td>${iss.actionDate||'-'}</td>
                    <td><span class="badge ${iss.status==='완료'?'badge-success':iss.status==='조치중'?'badge-warning':'badge-danger'}">${iss.status||'발생'}</span></td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openIssueModal('${iss.id}')">수정</button>
                        <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeIssue('${iss.id}')">삭제</button>
                    </td>
                </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _issueForm(iss) {
        iss = iss || {};
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">발생일 <span style="color:var(--accent-red)">*</span></label>
                <input type="date" class="form-input" id="isDate" value="${iss.date||UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">이상 내용 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="isName" value="${_esc(iss.issueName||'')}" placeholder="이상 현상 요약">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">원인 분석</label>
            <textarea class="form-textarea" id="isCause" rows="2">${_esc(iss.cause||'')}</textarea>
        </div>
        <div class="form-group">
            <label class="form-label">조치 내용</label>
            <textarea class="form-textarea" id="isAction" rows="2">${_esc(iss.action||'')}</textarea>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">조치일</label>
                <input type="date" class="form-input" id="isActDate" value="${iss.actionDate||''}">
            </div>
            <div class="form-group">
                <label class="form-label">처리 상태</label>
                <select class="form-select" id="isStatus">
                    ${['발생','조치중','완료'].map(s=>`<option ${(iss.status||'발생')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">조치자</label>
                <input type="text" class="form-input" id="isActPerson" value="${_esc(iss.actionPerson||'')}">
            </div>
            <div class="form-group">
                <label class="form-label">재발 방지 대책</label>
                <input type="text" class="form-input" id="isPrevent" value="${_esc(iss.prevent||'')}">
            </div>
        </div>`;
    }
    function _collectIssue() {
        return { equipId:_equipId, date:document.getElementById('isDate').value,
            issueName:document.getElementById('isName').value.trim(), cause:document.getElementById('isCause').value.trim(),
            action:document.getElementById('isAction').value.trim(), actionDate:document.getElementById('isActDate').value,
            status:document.getElementById('isStatus').value, actionPerson:document.getElementById('isActPerson').value.trim(),
            prevent:document.getElementById('isPrevent').value.trim() };
    }
    function openIssueModal(id) {
        const iss = id ? Storage.getById(ST_ISSUE, id) : null;
        UIUtils.showModal(id ? '이상 발생 수정' : '이상 발생 등록', _issueForm(iss), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveIssue('${id||''}')">저장</button>`, 'md');
    }
    async function saveIssue(id) {
        const data = _collectIssue();
        if (!data.date || !data.issueName) { UIUtils.toast('필수 항목을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_ISSUE, id, data);
        else    await Storage.add(ST_ISSUE, data);
        UIUtils.closeModal();
        _renderSubTab();
    }
    function removeIssue(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => { await Storage.remove(ST_ISSUE, id); _renderSubTab(); });
    }

    // ════════════════════════════════════════════════════════════
    // 4) 비가동 이력 및 조치
    // ════════════════════════════════════════════════════════════
    function _renderDowntimeTab(el) {
        const rows = (Storage.getAll(ST_DT) || []).filter(d => d.equipId === _equipId)
                        .sort((a,b) => b.date.localeCompare(a.date));
        const totalMin = rows.reduce((s,d) => s + (Number(d.duration)||0), 0);
        el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-size:0.85rem;color:var(--text-muted);">
                총 비가동: <strong style="color:var(--accent-red);">${totalMin.toLocaleString()} 분</strong>
                (${(totalMin/60).toFixed(1)} 시간)
            </div>
            <button class="btn btn-primary" onclick="ProdEquipmentModule.openDowntimeModal()">
                <span class="material-symbols-outlined">add</span> 비가동 등록
            </button>
        </div>
        <div class="data-table-wrapper">
            <table class="data-table" style="table-layout:fixed;">
                <colgroup>
                    <col style="width:4%"><col style="width:9%"><col style="width:8%"><col style="width:8%">
                    <col style="width:7%"><col style="width:10%"><col style="width:18%"><col style="width:16%">
                    <col style="width:9%"><col style="width:11%">
                </colgroup>
                <thead><tr>
                    <th>No</th><th>발생일</th><th>시작</th><th>종료</th><th>비가동(분)</th>
                    <th>분류</th><th>원인</th><th>조치</th><th>상태</th><th>작업</th>
                </tr></thead>
                <tbody>
                ${rows.length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-muted);">비가동 이력이 없습니다.</td></tr>` :
                rows.map((d,i) => `<tr>
                    <td>${rows.length-i}</td>
                    <td>${d.date}</td>
                    <td>${d.startTime||'-'}</td>
                    <td>${d.endTime||'-'}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-red);">${d.duration||0}</td>
                    <td><span class="badge badge-outline" style="font-size:.72rem;">${d.category||'-'}</span></td>
                    <td style="font-size:.8rem;">${_esc(d.cause||'-')}</td>
                    <td style="font-size:.8rem;">${_esc(d.action||'-')}</td>
                    <td><span class="badge ${d.status==='복구완료'?'badge-success':d.status==='복구중'?'badge-warning':'badge-danger'}">${d.status||'-'}</span></td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openDowntimeModal('${d.id}')">수정</button>
                        <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeDowntime('${d.id}')">삭제</button>
                    </td>
                </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _downtimeForm(d) {
        d = d || {};
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">발생일 <span style="color:var(--accent-red)">*</span></label>
                <input type="date" class="form-input" id="dtDate" value="${d.date||UIUtils.today()}">
            </div>
            <div class="form-group">
                <label class="form-label">분류</label>
                <select class="form-select" id="dtCategory">
                    ${['고장','예방정비','자재부족','품질불량','기타'].map(c=>`<option ${(d.category||'고장')===c?'selected':''}>${c}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">시작 시간</label>
                <input type="time" class="form-input" id="dtStart" value="${d.startTime||''}">
            </div>
            <div class="form-group">
                <label class="form-label">종료 시간</label>
                <input type="time" class="form-input" id="dtEnd" value="${d.endTime||''}"
                    oninput="ProdEquipmentModule._calcDt()">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">비가동 시간 (분)</label>
                <input type="number" class="form-input" id="dtDur" value="${d.duration||''}" placeholder="시작/종료 입력 시 자동계산">
            </div>
            <div class="form-group">
                <label class="form-label">처리 상태</label>
                <select class="form-select" id="dtStatus">
                    ${['비가동','복구중','복구완료'].map(s=>`<option ${(d.status||'비가동')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">원인</label>
            <textarea class="form-textarea" id="dtCause" rows="2">${_esc(d.cause||'')}</textarea>
        </div>
        <div class="form-group">
            <label class="form-label">조치 내용</label>
            <textarea class="form-textarea" id="dtAction" rows="2">${_esc(d.action||'')}</textarea>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">조치자</label>
                <input type="text" class="form-input" id="dtPerson" value="${_esc(d.actionPerson||'')}">
            </div>
            <div class="form-group">
                <label class="form-label">비고</label>
                <input type="text" class="form-input" id="dtNote" value="${_esc(d.note||'')}">
            </div>
        </div>`;
    }
    function _calcDt() {
        const s = (document.getElementById('dtStart')||{}).value;
        const e = (document.getElementById('dtEnd')||{}).value;
        if (s && e) {
            const [sh,sm] = s.split(':').map(Number);
            const [eh,em] = e.split(':').map(Number);
            let diff = (eh*60+em) - (sh*60+sm);
            if (diff < 0) diff += 1440;
            const el = document.getElementById('dtDur');
            if (el) el.value = diff;
        }
    }
    function _collectDowntime() {
        return { equipId:_equipId, date:document.getElementById('dtDate').value,
            category:document.getElementById('dtCategory').value,
            startTime:document.getElementById('dtStart').value, endTime:document.getElementById('dtEnd').value,
            duration:Number(document.getElementById('dtDur').value)||0,
            status:document.getElementById('dtStatus').value,
            cause:document.getElementById('dtCause').value.trim(), action:document.getElementById('dtAction').value.trim(),
            actionPerson:document.getElementById('dtPerson').value.trim(), note:document.getElementById('dtNote').value.trim() };
    }
    function openDowntimeModal(id) {
        const d = id ? Storage.getById(ST_DT, id) : null;
        UIUtils.showModal(id ? '비가동 이력 수정' : '비가동 이력 등록', _downtimeForm(d), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveDowntime('${id||''}')">저장</button>`, 'md');
    }
    async function saveDowntime(id) {
        const data = _collectDowntime();
        if (!data.date) { UIUtils.toast('발생일을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_DT, id, data);
        else    await Storage.add(ST_DT, data);
        UIUtils.closeModal();
        _renderSubTab();
    }
    function removeDowntime(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => { await Storage.remove(ST_DT, id); _renderSubTab(); });
    }

    // ════════════════════════════════════════════════════════════
    // 설비 마스터 CRUD
    // ════════════════════════════════════════════════════════════
    function _equipForm(e, defaultProcess) {
        e = e || {};
        const selProc = e.process || defaultProcess || '';
        return `
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">공정 라인 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="efLine">
                    ${LINES.map(l=>`<option value="${l}" ${(e.line||_line)===l?'selected':''}>${l}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">공정 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="efProcess">
                    <option value="">-- 공정 선택 --</option>
                    ${PROC_STATIONS.map(p=>`<option value="${_esc(p.name)}" ${selProc===p.name?'selected':''}>${p.name}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">설비명 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="efName" value="${_esc(e.name||'')}" placeholder="예: 컨베이어, 도장건">
            </div>
            <div class="form-group">
                <label class="form-label">모델/형식</label>
                <input type="text" class="form-input" id="efModel" value="${_esc(e.model||'')}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">설치일</label>
                <input type="date" class="form-input" id="efInstall" value="${e.installDate||''}">
            </div>
            <div class="form-group">
                <label class="form-label">상태</label>
                <select class="form-select" id="efStatus">
                    ${['정상','점검중','수리중','폐기'].map(s=>`<option ${(e.status||'정상')===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">표시 순서</label>
                <input type="number" class="form-input" id="efOrder" value="${e.sortOrder||0}" min="0">
            </div>
            <div class="form-group"></div>
        </div>
        <div class="form-group">
            <label class="form-label">비고</label>
            <textarea class="form-textarea" id="efNote" rows="2">${_esc(e.note||'')}</textarea>
        </div>`;
    }
    function _collectEquip() {
        return { line:document.getElementById('efLine').value,
            process:document.getElementById('efProcess').value,
            name:document.getElementById('efName').value.trim(),
            model:document.getElementById('efModel').value.trim(),
            installDate:document.getElementById('efInstall').value,
            status:document.getElementById('efStatus').value,
            sortOrder:Number(document.getElementById('efOrder').value)||0,
            note:document.getElementById('efNote').value.trim() };
    }
    function openEquipAddModal(defaultProcess) {
        UIUtils.showModal('설비 추가', _equipForm(null, defaultProcess), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveEquip('')">추가</button>`, 'md');
    }
    function editEquip(id) {
        const e = Storage.getById(ST_EQUIP, id);
        UIUtils.showModal('설비 수정', _equipForm(e, e && e.process), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary"   onclick="ProdEquipmentModule.saveEquip('${id}')">저장</button>`, 'md');
    }
    async function saveEquip(id) {
        const data = _collectEquip();
        if (!data.process) { UIUtils.toast('공정을 선택하세요.', 'warning'); return; }
        if (!data.name) { UIUtils.toast('설비명을 입력하세요.', 'warning'); return; }
        let saved;
        if (id) { await Storage.update(ST_EQUIP, id, data); saved = { id }; }
        else    { saved = await Storage.add(ST_EQUIP, data); _equipId = saved.id; }
        UIUtils.closeModal();
        _renderEquipList();
        if (_equipId) _renderDetail();
    }
    function deleteEquip(id) {
        UIUtils.confirm('이 설비와 관련된 모든 스페어/점검/이상/비가동 데이터도 함께 삭제됩니다.\n계속하시겠습니까?', async () => {
            for (const st of [ST_SPARE, ST_CITEM, ST_CREC, ST_ISSUE, ST_DT]) {
                const items = (Storage.getAll(st)||[]).filter(x => x.equipId === id);
                for (const item of items) await Storage.remove(st, item.id);
            }
            await Storage.remove(ST_EQUIP, id);
            _equipId = null;
            _renderEquipList();
            const dp = document.getElementById('equipDetailPanel');
            if (dp) dp.innerHTML = `
                <div class="card" style="padding:60px 0;text-align:center;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:8px;opacity:.4;">touch_app</span>
                    좌측 설비 목록에서 설비를 선택하세요
                </div>`;
        });
    }

    // ════════════════════════════════════════════════════════════
    // 조도 점검 — 월 1회 C/S 기록관리
    // ════════════════════════════════════════════════════════════
    function _renderIllumination() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('illumYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-primary);">
                <div>
                    <h4 style="margin:0;font-size:1rem;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#f59e0b;">lightbulb</span>
                        조도 점검
                    </h4>
                    <p style="margin:4px 0 0;font-size:.78rem;color:var(--text-muted);">검사·오염성 확보를 위한 조도관리 프로세스 및 월 1회 측정 기록</p>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <select class="form-select" id="illumYear" onchange="ProdEquipmentModule.renderIllumination()" style="width:110px;">
                        ${Array.from({length:5}, (_,i) => new Date().getFullYear() - 2 + i).map(y => `<option value="${y}" ${y===year?'selected':''}>${y}년</option>`).join('')}
                    </select>
                    <button class="btn btn-primary" onclick="ProdEquipmentModule.openIlluminationModal()">
                        <span class="material-symbols-outlined">add</span> 기록 등록
                    </button>
                </div>
            </div>
            <div style="padding:14px 16px;background:#f8fafc;">
                <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:14px;align-items:start;">
                    ${_illuminationLayout()}
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                            <div style="font-weight:800;margin-bottom:8px;color:var(--text-primary);">운영 기준</div>
                            <ol style="margin:0;padding-left:18px;font-size:.82rem;color:var(--text-secondary);line-height:1.65;">
                                <li>점검일은 매월 첫 주 내 09:00 ~ 10:00에 실시한다.</li>
                                <li>이상 시 조치 기록을 남긴다.</li>
                                <li>조도 기준 미만 또는 조명 이상(깜박임, 색 변화) 발생 시 보고·조치·기록한다.</li>
                            </ol>
                        </div>
                        ${_illuminationStandardTable()}
                    </div>
                </div>
            </div>
        </div>
        ${_illuminationRecordTable(year)}
        `;
    }

    function _illuminationScheduleDashboard(year, month) {
        const monthRecords = _illuminationRecords(year).filter(r => Number(r.month) === Number(month));
        const byKey = {};
        monthRecords.forEach(r => { byKey[r.pointKey] = r; });
        const done = ILLUMINATION_POINTS.filter(p => byKey[_illumKey(p)]);
        const missing = ILLUMINATION_POINTS.filter(p => !byKey[_illumKey(p)]);
        const failed = done.filter(p => Number(byKey[_illumKey(p)].lux) < Number(p.standard));
        const rate = Math.round((done.length / Math.max(ILLUMINATION_POINTS.length, 1)) * 100);
        const today = new Date();
        const dueEnd = new Date(year, month - 1, 7, 23, 59, 59);
        const isSelectedCurrentOrPast = year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth() + 1);
        const overdue = isSelectedCurrentOrPast && today > dueEnd && missing.length > 0;
        const statusColor = missing.length === 0 && failed.length === 0 ? 'var(--accent-green)' : overdue ? 'var(--accent-red)' : '#f59e0b';
        const statusText = missing.length === 0 ? (failed.length ? '기준 미달 조치 필요' : '월간 점검 완료') : overdue ? '점검 누락 발생' : '점검 예정/진행';
        return `
        <div style="display:grid;grid-template-columns:1.05fr 1.4fr;gap:12px;margin-bottom:14px;">
            <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                    <div>
                        <div style="font-size:.75rem;color:var(--text-muted);font-weight:700;">월간 스케줄 누락 방지</div>
                        <div style="margin-top:5px;font-size:1.05rem;font-weight:900;color:${statusColor};">${statusText}</div>
                        <div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${year}년 ${month}월 / 권장 점검기간: 매월 첫 주 09:00~10:00</div>
                    </div>
                    <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                                background:conic-gradient(${statusColor} ${rate}%, #e5e7eb 0);">
                        <div style="width:54px;height:54px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;
                                    font-weight:900;color:var(--text-primary);">${rate}%</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;">
                    ${[
                        ['대상', ILLUMINATION_POINTS.length, '장소'],
                        ['완료', done.length, '건'],
                        ['미등록', missing.length, '건'],
                        ['기준미달', failed.length, '건']
                    ].map(([label, val, unit]) => `
                        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:#f8fafc;text-align:center;">
                            <div style="font-size:.7rem;color:var(--text-muted);">${label}</div>
                            <div style="font-size:1.12rem;font-weight:900;color:${label==='미등록' && val ? 'var(--accent-red)' : label==='기준미달' && val ? '#f97316' : 'var(--text-primary)'};">${val}</div>
                            <div style="font-size:.68rem;color:var(--text-muted);">${unit}</div>
                        </div>`).join('')}
                </div>
            </div>
            <div style="padding:14px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:850;color:var(--text-primary);">미등록 위치</div>
                    <div style="font-size:.72rem;color:var(--text-muted);">클릭 시 해당 월 기록 등록</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:102px;overflow:auto;">
                    ${missing.length ? missing.map(p => `
                        <button type="button" class="btn btn-outline" style="padding:5px 8px;font-size:.75rem;"
                            onclick="ProdEquipmentModule.openIlluminationModal('${_illumKey(p)}', ${month})">
                            <span class="material-symbols-outlined" style="font-size:14px;color:#f59e0b;">pending_actions</span>
                            ${p.pointNo}-${p.posNo} ${_esc(p.location)}
                        </button>`).join('') : `
                        <div style="width:100%;padding:24px;text-align:center;color:var(--accent-green);font-weight:800;background:#f0fdf4;border-radius:8px;">
                            ${year}년 ${month}월 조도 점검이 모두 등록되었습니다.
                        </div>`}
                </div>
                ${failed.length ? `
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);">
                        <div style="font-size:.75rem;font-weight:800;color:#f97316;margin-bottom:6px;">기준 미달 조치 필요</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${failed.map(p => {
                                const r = byKey[_illumKey(p)];
                                return `<button type="button" class="btn btn-outline" style="padding:5px 8px;font-size:.75rem;border-color:#fed7aa;color:#c2410c;"
                                    onclick="ProdEquipmentModule.openIlluminationModal('${_illumKey(p)}', ${month})">
                                    ${p.pointNo}-${p.posNo} ${_esc(p.location)} ${r.lux}Lux
                                </button>`;
                            }).join('')}
                        </div>
                    </div>` : ''}
            </div>
        </div>`;
    }

    function _illuminationLayout() {
        const marker = p => `
            <button type="button" onclick="ProdEquipmentModule.openIlluminationModal('${_illumKey(p)}')"
                title="${p.pointNo}-${p.posNo} ${_esc(p.location)}"
                style="position:absolute;left:${p.x}px;top:${p.y}px;width:36px;height:36px;border:none;background:transparent;cursor:pointer;z-index:5;">
                <span class="material-symbols-outlined" style="position:absolute;left:3px;top:0;font-size:26px;color:#ef4444;text-shadow:0 1px 2px rgba(0,0,0,.16);">lightbulb</span>
                <span style="position:absolute;right:0;bottom:0;background:#ecfccb;border:1px solid #84cc16;border-radius:6px;padding:1px 5px;font-size:.72rem;font-weight:900;color:#1f2937;">${p.pointNo}${p.count > 1 ? '-' + p.posNo : ''}</span>
            </button>`;
        return `
        <div style="position:relative;width:740px;height:330px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;">
            <svg viewBox="0 0 740 330" width="740" height="330" style="display:block;">
                <rect x="0" y="0" width="740" height="330" fill="#fff"/>
                <rect x="14" y="28" width="706" height="252" fill="#d8d5c5" stroke="#111827" stroke-width="1"/>
                <rect x="14" y="138" width="78" height="132" fill="#324f68"/>
                <text x="53" y="188" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">배합실</text>
                <rect x="92" y="32" width="448" height="128" fill="#f3f4f6" stroke="#111827" stroke-width="2"/>
                <rect x="104" y="40" width="405" height="46" fill="#f9a8d4" opacity=".72"/>
                <path d="M112 50 H510 V72 H104 V125 H142 V106 H270 V126 H360 V104 H512 V150" fill="none" stroke="#ef4444" stroke-width="2"/>
                <rect x="122" y="82" width="54" height="48" fill="#93c5fd" stroke="#111827"/>
                <text x="149" y="110" text-anchor="middle" font-size="9" font-weight="800">#4 Booth</text>
                <rect x="206" y="88" width="54" height="48" fill="#93c5fd" stroke="#111827"/>
                <text x="233" y="116" text-anchor="middle" font-size="9" font-weight="800">#3 Booth</text>
                <rect x="360" y="88" width="54" height="48" fill="#bae6fd" stroke="#111827"/>
                <text x="387" y="116" text-anchor="middle" font-size="9" font-weight="800">#2 Booth</text>
                <rect x="430" y="88" width="54" height="48" fill="#93c5fd" stroke="#111827"/>
                <text x="457" y="116" text-anchor="middle" font-size="9" font-weight="800">#1 Booth</text>
                <rect x="494" y="88" width="44" height="48" fill="#a78bfa" stroke="#111827"/>
                <text x="516" y="116" text-anchor="middle" font-size="9" font-weight="800">Ion</text>
                <rect x="92" y="178" width="512" height="82" fill="#f3f4f6" stroke="#111827" stroke-width="2"/>
                <path d="M100 235 H520 V218 H602 V244 H548 V258 H130" fill="none" stroke="#ef4444" stroke-width="2"/>
                <rect x="126" y="184" width="54" height="50" fill="#93c5fd" stroke="#111827"/>
                <text x="153" y="213" text-anchor="middle" font-size="9" font-weight="800">#5 Booth</text>
                <rect x="216" y="184" width="54" height="50" fill="#93c5fd" stroke="#111827"/>
                <text x="243" y="213" text-anchor="middle" font-size="9" font-weight="800">#4 Booth</text>
                <rect x="330" y="184" width="54" height="50" fill="#93c5fd" stroke="#111827"/>
                <text x="357" y="213" text-anchor="middle" font-size="9" font-weight="800">#3 Booth</text>
                <rect x="440" y="184" width="68" height="50" fill="#93c5fd" stroke="#111827"/>
                <text x="474" y="213" text-anchor="middle" font-size="9" font-weight="800">#1 Booth</text>
                <rect x="520" y="184" width="44" height="50" fill="#a78bfa" stroke="#111827"/>
                <text x="542" y="213" text-anchor="middle" font-size="9" font-weight="800">Ion</text>
                <rect x="590" y="50" width="88" height="40" fill="#e5747c" stroke="#111827"/>
                <text x="634" y="75" text-anchor="middle" font-size="12" font-weight="900">INSPECTION</text>
                <rect x="602" y="104" width="108" height="144" fill="#95cf62" stroke="#65a30d"/>
                <text x="656" y="184" text-anchor="middle" font-size="14" font-weight="900">LASER</text>
                <rect x="676" y="116" width="22" height="38" fill="#ef2424" stroke="#111827"/>
                <rect x="676" y="164" width="22" height="38" fill="#ef2424" stroke="#111827"/>
                <rect x="676" y="212" width="22" height="38" fill="#ef2424" stroke="#111827"/>
                <rect x="520" y="286" width="210" height="36" fill="#b8b8b8" stroke="#111827"/>
                <text x="625" y="310" text-anchor="middle" font-size="18" font-weight="900">지그 창고</text>
                <rect x="14" y="286" width="80" height="36" fill="#9b9b9b" stroke="#111827"/>
                <text x="54" y="309" text-anchor="middle" font-size="13" font-weight="900">드라이실</text>
            </svg>
            ${ILLUMINATION_POINTS.map(marker).join('')}
        </div>`;
    }

    function _illuminationStandardTable() {
        return `
        <div class="card" style="overflow:hidden;margin:0;">
            <div style="padding:10px 12px;border-bottom:1px solid var(--border-color);font-weight:800;">조도 측정 기준</div>
            <div class="data-table-wrapper" style="max-height:250px;overflow:auto;">
                <table class="data-table" style="font-size:.78rem;">
                    <thead><tr><th>장소</th><th>위치</th><th>구분</th><th>기준</th><th>관리 목적</th></tr></thead>
                    <tbody>
                    ${ILLUMINATION_POINTS.map(p => `
                        <tr>
                            <td>${p.pointNo}-${p.posNo}</td>
                            <td style="font-weight:700;">${_esc(p.location)}</td>
                            <td>${_esc(p.category)}</td>
                            <td style="font-weight:800;">${p.standard} Lux ~</td>
                            <td>${_esc(p.purpose)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function _illuminationRecordTable(year) {
        const records = _illuminationRecords(year);
        const byKey = {};
        records.forEach(r => { byKey[_illumRecordKey(r)] = r; });
        const months = Array.from({length:12}, (_,i) => i + 1);
        return `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border-color);">
                <div>
                    <h4 style="margin:0;font-size:1rem;">조도관리 C/S 기록관리</h4>
                    <p style="margin:4px 0 0;font-size:.76rem;color:var(--text-muted);">${year}년 월별 점검 기록. 셀을 클릭하면 해당 위치/월 기록을 등록하거나 수정합니다.</p>
                </div>
            </div>
            <div class="data-table-wrapper" style="overflow:auto;">
                <table class="data-table" style="font-size:.78rem;min-width:1480px;table-layout:fixed;">
                    <thead>
                        <tr>
                            <th style="width:46px;">장소<br>NO</th>
                            <th style="width:46px;">위치<br>NO</th>
                            <th style="width:150px;">위치</th>
                            <th style="width:90px;">조도기준</th>
                            ${months.map(m => `<th style="width:92px;">${m}월<br><span style="font-size:.68rem;color:var(--text-muted);">일 / Lux</span></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${ILLUMINATION_POINTS.map(p => `
                            <tr>
                                <td>${p.pointNo}</td>
                                <td>${p.posNo}</td>
                                <td style="font-weight:700;">${_esc(p.location)}</td>
                                <td>${p.standard} ~</td>
                                ${months.map(m => {
                                    const r = byKey[`${year}_${m}_${_illumKey(p)}`];
                                    const pass = r && Number(r.lux) >= Number(p.standard);
                                    return `<td onclick="ProdEquipmentModule.openIlluminationModal('${_illumKey(p)}', ${m})"
                                               style="cursor:pointer;background:${r ? (pass ? '#f0fdf4' : '#fff7ed') : '#fff'};">
                                        ${r ? `<div style="font-weight:800;color:${pass ? 'var(--accent-green)' : '#f97316'};">${r.lux} Lux</div>
                                               <div style="font-size:.68rem;color:var(--text-muted);">${_esc((r.date||'').slice(5))}</div>` : '<span style="color:var(--text-muted);">-</span>'}
                                    </td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function _illuminationRecords(year) {
        return (Storage.getAll(ST_LUX) || []).filter(r => Number(r.year) === Number(year));
    }

    function _illumKey(p) {
        return `${p.pointNo}_${p.posNo}`;
    }

    function _illumRecordKey(r) {
        return `${r.year}_${r.month}_${r.pointKey}`;
    }

    function _illumPointByKey(key) {
        return ILLUMINATION_POINTS.find(p => _illumKey(p) === key) || ILLUMINATION_POINTS[0];
    }

    function renderIllumination() {
        _renderIllumination();
    }

    function openIlluminationModal(pointKey, month) {
        const year = Number(document.getElementById('illumYear')?.value) || new Date().getFullYear();
        const p = _illumPointByKey(pointKey || _illumKey(ILLUMINATION_POINTS[0]));
        const m = Number(month) || (new Date().getMonth() + 1);
        const existing = _illuminationRecords(year).find(r => r.month === m && r.pointKey === _illumKey(p));
        UIUtils.showModal('조도 점검 기록', _illuminationForm(existing, p, year, m), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${existing ? `<button class="btn btn-danger" onclick="ProdEquipmentModule.removeIllumination('${existing.id}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ProdEquipmentModule.saveIllumination('${existing ? existing.id : ''}')">저장</button>
        `, 'lg');
    }

    function _illuminationForm(r, p, year, month) {
        r = r || {};
        const date = r.date || `${year}-${String(month).padStart(2,'0')}-01`;
        return `
        <input type="hidden" id="illumPointKey" value="${_illumKey(p)}">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
            <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                <div style="font-size:.72rem;color:var(--text-muted);">측정 위치</div>
                <div style="font-weight:800;">${p.pointNo}-${p.posNo} ${_esc(p.location)}</div>
            </div>
            <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                <div style="font-size:.72rem;color:var(--text-muted);">조도 기준</div>
                <div style="font-weight:800;">${p.standard} Lux ~</div>
            </div>
            <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                <div style="font-size:.72rem;color:var(--text-muted);">관리 목적</div>
                <div style="font-weight:800;">${_esc(p.purpose)}</div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">측정년도</label>
                <input type="number" class="form-input" id="illumYearInput" value="${r.year || year}"></div>
            <div class="form-group"><label class="form-label">측정월</label>
                <select class="form-select" id="illumMonthInput">
                    ${Array.from({length:12}, (_,i) => i + 1).map(v => `<option value="${v}" ${(r.month || month) === v ? 'selected' : ''}>${v}월</option>`).join('')}
                </select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">측정일 <span style="color:var(--accent-red)">*</span></label>
                <input type="date" class="form-input" id="illumDate" value="${date}"></div>
            <div class="form-group"><label class="form-label">측정시간</label>
                <input type="time" class="form-input" id="illumTime" value="${r.time || '09:00'}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">측정값 (Lux) <span style="color:var(--accent-red)">*</span></label>
                <input type="number" min="0" step="1" class="form-input" id="illumLux" value="${r.lux ?? ''}"></div>
            <div class="form-group"><label class="form-label">측정자</label>
                <input class="form-input" id="illumInspector" value="${_esc(r.inspector || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">조치/비고</label>
            <textarea class="form-textarea" id="illumAction" rows="3" placeholder="기준 미만, 조명 이상, 교체/청소 등 조치사항">${_esc(r.action || '')}</textarea></div>`;
    }

    function _collectIllumination() {
        const p = _illumPointByKey(document.getElementById('illumPointKey').value);
        const lux = Number(document.getElementById('illumLux').value) || 0;
        const year = Number(document.getElementById('illumYearInput').value);
        const month = Number(document.getElementById('illumMonthInput').value);
        return {
            year,
            month,
            pointKey: _illumKey(p),
            pointNo: p.pointNo,
            posNo: p.posNo,
            location: p.location,
            category: p.category,
            standard: p.standard,
            measurePlace: p.measurePlace,
            purpose: p.purpose,
            date: document.getElementById('illumDate').value,
            time: document.getElementById('illumTime').value,
            lux,
            result: lux >= p.standard ? 'OK' : 'NG',
            inspector: document.getElementById('illumInspector').value.trim(),
            action: document.getElementById('illumAction').value.trim()
        };
    }

    async function saveIllumination(id) {
        const data = _collectIllumination();
        if (!data.date || !data.lux) { UIUtils.toast('측정일과 측정값을 입력하세요.', 'warning'); return; }
        const duplicate = (Storage.getAll(ST_LUX) || []).find(r =>
            r.id !== id && Number(r.year) === data.year && Number(r.month) === data.month && r.pointKey === data.pointKey
        );
        if (duplicate) {
            await Storage.update(ST_LUX, duplicate.id, data);
        } else if (id) {
            await Storage.update(ST_LUX, id, data);
        } else {
            await Storage.add(ST_LUX, data);
        }
        UIUtils.closeModal();
        UIUtils.toast('조도 점검 기록이 저장되었습니다.', 'success');
        _renderIllumination();
    }

    function removeIllumination(id) {
        UIUtils.confirm('조도 점검 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_LUX, id);
            UIUtils.closeModal();
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderIllumination();
        });
    }

    function exportIllumination() {
        const year = Number(document.getElementById('illumYear')?.value) || new Date().getFullYear();
        const rows = _illuminationRecords(year).sort((a,b) =>
            Number(a.month) - Number(b.month) || Number(a.pointNo) - Number(b.pointNo) || Number(a.posNo) - Number(b.posNo)
        ).map(r => [r.year, r.month, r.date, r.time || '', r.pointNo, r.posNo, r.location, r.standard, r.lux, r.result, r.inspector || '', r.action || '']);
        Storage.exportToCSV(['년도','월','측정일','측정시간','장소NO','위치NO','위치','조도기준','측정값(Lux)','판정','측정자','조치/비고'], rows, `조도점검_${year}`);
    }

    // ── 컨베이어 규정 속도 설정 ─────────────────────────────────
    function _renderConveyor() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const setting = _conveyorSetting(_convLine);
        const hasSections = _conveyorSections(_convLine).length > 0;
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;
                        padding:16px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);">
                <div>
                    <h4 style="margin:0;font-size:1.02rem;display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">speed</span>
                        컨베이어 규정 속도 설정 관리
                    </h4>
                    <p style="margin:5px 0 0;color:var(--text-muted);font-size:.78rem;">
                        RPM과 JIG 간격을 기준으로 PITCH C/T(sec), 이동속도, 구간별 소요시간을 계산합니다.
                    </p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    ${LINES.map(line => `
                        <button class="btn ${line === _convLine ? 'btn-primary' : 'btn-outline'}"
                            onclick="ProdEquipmentModule.switchConveyorLine('${line}')">
                            <span class="material-symbols-outlined">precision_manufacturing</span>${line.replace('도장','도장 ')}
                        </button>`).join('')}
                </div>
            </div>

            <div style="padding:16px;">
                <div style="display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:10px;margin-bottom:16px;max-width:520px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">RPM <span style="color:var(--accent-red)">*</span></label>
                        <input type="number" step="0.01" min="0" class="form-input" id="convRpm"
                               value="${setting.rpm}" oninput="ProdEquipmentModule.recalcConveyor()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">JIG 간격 (mm)</label>
                        <input type="number" step="0.01" min="0" class="form-input" id="convJigInterval"
                               value="${setting.jigInterval}" oninput="ProdEquipmentModule.recalcConveyor()">
                    </div>
                </div>

                <div id="convSummary">${_conveyorSummaryHtml(setting, _convLine)}</div>

                ${hasSections ? `
                    <div class="data-table-wrapper" style="margin-top:14px;overflow:auto;max-height:520px;">
                        <table class="data-table" style="min-width:980px;font-size:.78rem;">
                            <thead>
                                <tr>
                                    <th style="width:130px;">공정 구분</th>
                                    <th style="width:150px;">구간</th>
                                    <th style="width:110px;">거리(mm)</th>
                                    <th style="width:110px;">소요시간(sec)</th>
                                    <th style="width:110px;">소요시간(min)</th>
                                    <th style="width:110px;">누적시간(min)</th>
                                    <th>비고</th>
                                </tr>
                            </thead>
                            <tbody id="convCalcBody">${_conveyorTableRows(setting, _convLine)}</tbody>
                        </table>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
                        <button class="btn btn-outline" onclick="ProdEquipmentModule.exportConveyor()">
                            <span class="material-symbols-outlined">download</span>CSV
                        </button>
                        <button class="btn btn-primary" onclick="ProdEquipmentModule.saveConveyorStandard()">
                            <span class="material-symbols-outlined">save</span>표준 저장
                        </button>
                    </div>` : `
                    <div style="margin-top:14px;padding:42px 16px;text-align:center;border:1px dashed var(--border-color);
                                border-radius:8px;color:var(--text-muted);background:var(--bg-secondary);">
                        <span class="material-symbols-outlined" style="display:block;font-size:42px;margin-bottom:8px;opacity:.5;">rule</span>
                        ${_convLine} 구간별 거리 기준은 추후 등록하면 계산표가 자동 생성됩니다.
                    </div>`}
            </div>
        </div>`;
    }

    function _conveyorSections(line) {
        return CONVEYOR_SECTIONS[line] || [];
    }

    function _conveyorSetting(line) {
        const saved = (Storage.getAll(ST_CONVEYOR) || []).find(r => r._docKind === 'standard' && r.line === line);
        const merged = { ...CONVEYOR_DEFAULTS, ...(CONVEYOR_LINE_DEFAULTS[line] || {}), ...(saved || {}), line };
        merged.jigInterval = Number(merged.jigInterval ?? merged.pitch) || CONVEYOR_DEFAULTS.jigInterval;
        return merged;
    }

    function _collectConveyorSetting() {
        const n = id => Number(document.getElementById(id)?.value) || 0;
        return {
            _docKind: 'standard',
            line: _convLine,
            title: CONVEYOR_DEFAULTS.title,
            rpm: n('convRpm'),
            jigInterval: n('convJigInterval'),
            updatedAt: new Date().toISOString()
        };
    }

    function _conveyorCalc(setting, line) {
        const rpm = Number(setting.rpm) || 0;
        const jigInterval = Number(setting.jigInterval ?? setting.pitch) || 0;
        const { wheelDiameterMm, pi, pulleyRatio, reducerRatio, shaftRatio } = CONVEYOR_SPEED_CONST;
        const mmSec = rpm > 0 ? (((rpm * wheelDiameterMm * pi) / reducerRatio) / pulleyRatio) / 60 * shaftRatio : 0;
        const mMin = mmSec * 60 / 1000;
        const pitchCtSec = mmSec > 0 ? jigInterval / mmSec : 0;
        let accSec = 0;
        const rows = _conveyorSections(line).map(s => {
            const sec = mmSec > 0 ? Number(s.distance) / mmSec : 0;
            accSec += sec;
            return { ...s, sec, min: sec / 60, accMin: accSec / 60 };
        });
        const totalDistance = rows.reduce((sum, r) => sum + Number(r.distance || 0), 0);
        return { mmSec, mMin, pitchCtSec, rows, totalDistance, totalSec: accSec, totalMin: accSec / 60 };
    }

    function _fmtNum(v, digits = 1) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '-';
        return n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
    }

    function _conveyorSummaryHtml(setting, line) {
        const c = _conveyorCalc(setting, line);
        const jigCountHr = c.pitchCtSec > 0 ? 3600 / c.pitchCtSec : 0;
        const cards = [
            ['속도', `${_fmtNum(c.mmSec, 2)} mm/sec`, `${_fmtNum(c.mMin, 2)} M/min`],
            ['PITCH C/T', `${_fmtNum(c.pitchCtSec, 2)} sec`, `JIG 간격 ${_fmtNum(setting.jigInterval, 0)} mm`],
            ['JIG 횟수', `${_fmtNum(jigCountHr, 1)} ea/hr`, '3600 ÷ PITCH C/T'],
            ['총 거리', `${_fmtNum(c.totalDistance, 0)} mm`, `${_fmtNum(c.totalDistance / 1000, 2)} M`],
            ['총 소요시간', `${_fmtNum(c.totalSec, 1)} sec`, `${_fmtNum(c.totalMin, 2)} min`]
        ];
        return `
        <div style="display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:10px;">
            ${cards.map(([label, main, sub]) => `
                <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);">
                    <div style="font-size:.72rem;color:var(--text-muted);">${label}</div>
                    <div style="margin-top:4px;font-size:1.08rem;font-weight:850;color:var(--text-primary);">${main}</div>
                    <div style="margin-top:2px;font-size:.72rem;color:var(--text-muted);">${sub}</div>
                </div>`).join('')}
        </div>`;
    }

    function _conveyorTableRows(setting, line) {
        const calc = _conveyorCalc(setting, line);
        if (!calc.rows.length) return '';
        return calc.rows.map(r => `
            <tr>
                <td style="font-weight:700;">${_esc(r.group)}</td>
                <td>${_esc(r.name)}</td>
                <td style="text-align:right;">${_fmtNum(r.distance, 0)}</td>
                <td style="text-align:right;">${_fmtNum(r.sec, 2)}</td>
                <td style="text-align:right;font-weight:700;">${_fmtNum(r.min, 2)}</td>
                <td style="text-align:right;">${_fmtNum(r.accMin, 2)}</td>
                <td style="color:var(--text-muted);">RPM ${_fmtNum(setting.rpm, 2)} / JIG 간격 ${_fmtNum(setting.jigInterval, 0)} mm</td>
            </tr>`).join('');
    }

    function switchConveyorLine(line) {
        _convLine = line;
        _renderConveyor();
    }

    function recalcConveyor() {
        const setting = _collectConveyorSetting();
        const summary = document.getElementById('convSummary');
        const body = document.getElementById('convCalcBody');
        if (summary) summary.innerHTML = _conveyorSummaryHtml(setting, _convLine);
        if (body) body.innerHTML = _conveyorTableRows(setting, _convLine);
    }

    async function saveConveyorStandard() {
        const data = _collectConveyorSetting();
        if (!data.rpm || !data.jigInterval) {
            UIUtils.toast('RPM과 JIG 간격을 입력하세요.', 'warning');
            return;
        }
        const existing = (Storage.getAll(ST_CONVEYOR) || []).find(r => r._docKind === 'standard' && r.line === _convLine);
        if (existing) await Storage.update(ST_CONVEYOR, existing.id, data);
        else await Storage.add(ST_CONVEYOR, data);
        UIUtils.toast('컨베이어 규정 속도 기준이 저장되었습니다.', 'success');
        _renderConveyor();
    }

    function exportConveyor() {
        const setting = _collectConveyorSetting();
        const rows = _conveyorCalc(setting, _convLine).rows.map(r => [
            _convLine, setting.rpm, setting.jigInterval, r.group, r.name, r.distance,
            r.sec.toFixed(2), r.min.toFixed(2), r.accMin.toFixed(2)
        ]);
        Storage.exportToCSV(['라인','RPM','JIG간격(mm)','공정구분','구간','거리(mm)','소요시간(sec)','소요시간(min)','누적시간(min)'], rows, `컨베이어_규정속도_${_convLine}`);
    }

    function _renderTemperatureProfile() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('tempProfileYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:2px solid #111827;background:#fff;">
                <div>
                    <h4 style="margin:0;font-size:1.55rem;font-weight:900;letter-spacing:.04em;font-family:serif;">
                        ${year}년 IR 건조로 온도 측정
                    </h4>
                    <p style="margin:6px 0 0;font-size:.78rem;color:var(--text-muted);">정기점검 주기 3개월 · 계획 ○, 실적 V, 측정일/기록평가지/측정지 캡쳐 관리</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" class="form-input" id="tempProfileYear" value="${year}" min="2020" max="2100"
                        onchange="ProdEquipmentModule.renderTemperatureProfile()" style="width:98px;">
                    <button class="btn btn-primary" onclick="ProdEquipmentModule.openTempProfileModal()">
                        <span class="material-symbols-outlined">add</span>기록 등록
                    </button>
                    <button class="btn btn-outline" onclick="ProdEquipmentModule.exportTemperatureProfile()">
                        <span class="material-symbols-outlined">download</span>CSV
                    </button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                ${_tempProfilePlanTable(year)}
                ${_tempProfileGuide()}
                ${_tempProfileRecordList(year)}
            </div>
        </div>`;
    }

    function _tempProfileLogs(year) {
        return (Storage.getAll(ST_SQ_LOG) || [])
            .filter(r => r._docKind === 'temperature_profile' && Number(r.year) === Number(year))
            .sort((a,b) => (b.date||'').localeCompare(a.date||''));
    }

    function _tempProfilePlanTable(year) {
        const months = Array.from({length:12}, (_,i)=>i+1);
        const planMonths = [1,4,7,10];
        const logs = _tempProfileLogs(year);
        const byLineMonth = {};
        logs.forEach(r => {
            const month = Number(r.month) || Number((r.date||'').slice(5,7));
            if (month) byLineMonth[`${r.line}_${month}`] = r;
        });
        const lineRows = ['A라인', 'B라인'];
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #111827;">
            <table class="data-table" style="min-width:1160px;border-collapse:collapse;table-layout:fixed;font-size:.8rem;">
                <thead>
                    <tr>
                        <th rowspan="2" style="width:78px;border:1px solid #111827;background:#c7c09b;">라인</th>
                        <th style="width:108px;border:1px solid #111827;background:#c7c09b;">정기점검<br>주기 3개월</th>
                        ${months.map(m=>`<th style="width:78px;border:1px solid #111827;background:#c7c09b;">${m}월</th>`).join('')}
                    </tr>
                    <tr>
                        <th style="border:1px solid #111827;background:#c7c09b;">계획</th>
                        ${months.map(m=>`<th style="border:1px solid #111827;background:#c7c09b;">${planMonths.includes(m) ? '○' : ''}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${lineRows.map(line => `
                        <tr>
                            <td rowspan="2" style="border:1px solid #111827;text-align:center;font-weight:900;background:${line==='A라인'?'#c9bfdc':'#bfd3eb'};">${line}</td>
                            <td style="border:1px dotted #111827;text-align:center;font-weight:700;">측정일 (일)</td>
                            ${months.map(m => {
                                const rec = byLineMonth[`${line}_${m}`];
                                return `<td onclick="ProdEquipmentModule.openTempProfileModal('${rec ? rec.id : ''}', '${line}', ${m})"
                                    style="border:1px solid #111827;text-align:center;cursor:pointer;height:28px;background:${rec?'#f0fdf4':'#fff'};">
                                    ${rec ? `<div style="color:var(--accent-green);font-weight:900;">V</div><div style="font-size:.66rem;color:var(--text-muted);">${_esc((rec.date||'').slice(5))}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td style="border:1px dotted #111827;text-align:center;font-weight:700;height:76px;">비고<br>(기록사항)</td>
                            ${months.map(m => {
                                const rec = byLineMonth[`${line}_${m}`];
                                return `<td onclick="ProdEquipmentModule.openTempProfileModal('${rec ? rec.id : ''}', '${line}', ${m})"
                                    style="border:1px solid #111827;vertical-align:top;cursor:pointer;font-size:.68rem;line-height:1.25;padding:4px;background:${rec?'#f8fafc':'#fff'};">
                                    ${rec ? _esc(rec.note || rec.resultNote || '') : ''}
                                </td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _tempProfileGuide() {
        return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;padding:10px;border:1px solid #111827;background:#fff;font-size:.78rem;">
            <div style="line-height:1.7;">
                <div>▶ 측정 기준 : 건조로 측정은 생산에 문제 없는 구간과 시간에 투입하여야 한다.</div>
                <div>▶ 투입 위치 : A라인 #5번 부스, B라인 #4번 부스</div>
                <div>▶ 센서 부착 위치 : 도장표면, 분위기, 상하좌 제품해당 위치에 센서(CH) 부착</div>
            </div>
            <div style="line-height:1.7;">
                <div>▶ 투입시 : PWR ON 후 STR ON</div>
                <div>▶ 완료시 : STR 만 OFF <span style="color:#dc2626;">(PWR off 시 기록 삭제됨에 주의)</span></div>
                <div>▶ DATA Download : 통신Cable연결→PG download → TRS On</div>
            </div>
        </div>`;
    }

    function _tempProfileRecordList(year) {
        const logs = _tempProfileLogs(year);
        if (!logs.length) {
            return `<div class="card" style="margin-top:12px;padding:28px;text-align:center;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:6px;">thermostat</span>
                등록된 온도프로파일 기록평가지가 없습니다.
            </div>`;
        }
        return `
        <div class="card" style="margin-top:12px;overflow:hidden;">
            <div style="padding:10px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);font-weight:800;">
                기록평가지
            </div>
            <div class="data-table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>No</th><th>측정일</th><th>공정명</th><th>라인속도</th><th>측정장비</th><th>측정시간</th><th>판정</th><th>캡쳐</th><th>특이사항</th><th>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map((r,i)=>`
                        <tr>
                            <td>${logs.length-i}</td>
                            <td>${_esc(r.date||'')}</td>
                            <td>${_esc(r.line||'')}</td>
                            <td>${_esc(r.lineSpeed||'')}</td>
                            <td>${_esc(r.equipment||'')}</td>
                            <td>${_esc(r.measMinutes||'')}</td>
                            <td><span class="badge ${(r.result||'PASS')==='PASS'?'badge-success':'badge-danger'}">${_esc(r.result||'PASS')}</span></td>
                            <td>${r.imageData ? `<button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.previewTempProfileImage('${r.id}')">보기</button>` : '-'}</td>
                            <td style="font-size:.78rem;">${_esc(r.resultNote || r.note || '')}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openTempProfileModal('${r.id}')">수정</button>
                                <button class="btn btn-xs btn-danger" onclick="ProdEquipmentModule.removeTempProfile('${r.id}')">삭제</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function _tempProfileItem(id) {
        return id ? Storage.getById(ST_SQ_LOG, id) : null;
    }

    function openTempProfileModal(id, presetLine, presetMonth) {
        const year = Number(document.getElementById('tempProfileYear')?.value) || new Date().getFullYear();
        const r = _tempProfileItem(id) || {};
        const line = r.line || presetLine || 'A라인';
        const month = Number(r.month || presetMonth || 1);
        UIUtils.showModal('IR ZONE TEMP. TEST RESULT', _tempProfileForm(r, year, line, month), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${id ? `<button class="btn btn-danger" onclick="ProdEquipmentModule.removeTempProfile('${id}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ProdEquipmentModule.saveTempProfile('${id||''}')">저장</button>
        `, 'xl');
    }

    function _tempProfileForm(r, year, line, month) {
        const set = Array.isArray(r.setTemps) ? r.setTemps : [];
        const read = Array.isArray(r.readTemps) ? r.readTemps : [];
        const zoneHeaders = Array.from({length:8}, (_,i)=>`<th style="border:1px dotted #111827;background:#eef2ff;">#${i+1}</th>`).join('');
        const setCells = Array.from({length:8}, (_,i)=>`<td style="border:1px dotted #111827;"><input type="number" step="0.1" class="form-input" id="tpSet${i}" value="${set[i]??''}" style="padding:4px;text-align:center;"></td>`).join('');
        const readCells = Array.from({length:8}, (_,i)=>`<td style="border:1px dotted #111827;"><input type="number" step="0.1" class="form-input" id="tpRead${i}" value="${read[i]??''}" style="padding:4px;text-align:center;"></td>`).join('');
        return `
        <input type="hidden" id="tpYear" value="${year}">
        <input type="hidden" id="tpImageData" value="${_esc(r.imageData || '')}">
        <div class="form-row">
            <div class="form-group"><label class="form-label">측정일</label>
                <input type="date" class="form-input" id="tpDate" value="${r.date || `${year}-${String(month).padStart(2,'0')}-01`}"></div>
            <div class="form-group"><label class="form-label">공정명</label>
                <select class="form-select" id="tpLine">
                    ${['A라인','B라인'].map(v=>`<option ${(line||'A라인')===v?'selected':''}>${v}</option>`).join('')}
                </select></div>
            <div class="form-group"><label class="form-label">계획월</label>
                <input type="number" class="form-input" id="tpMonth" min="1" max="12" value="${month}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">측정 목적</label>
                <input class="form-input" id="tpPurpose" value="${_esc(r.purpose || '정기 점검')}"></div>
            <div class="form-group"><label class="form-label">측정장비</label>
                <input class="form-input" id="tpEquipment" value="${_esc(r.equipment || 'MTD-205 (MI정보기술)')}"></div>
            <div class="form-group"><label class="form-label">LINE SPEED</label>
                <input class="form-input" id="tpLineSpeed" value="${_esc(r.lineSpeed || '500RPM')}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:12px;align-items:start;">
            <div>
                <label class="form-label">측정지 캡쳐 복사 넣기</label>
                <div id="tpPasteBox" tabindex="0" onpaste="ProdEquipmentModule.handleTempProfilePaste(event)"
                    style="min-height:220px;border:2px dashed var(--border-color);border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:text;">
                    ${r.imageData ? `<img id="tpImagePreview" src="${r.imageData}" style="max-width:100%;max-height:360px;display:block;">` :
                    `<div id="tpImagePreview" style="text-align:center;color:var(--text-muted);">
                        <span class="material-symbols-outlined" style="font-size:42px;display:block;margin-bottom:6px;">content_paste</span>
                        캡쳐 이미지를 이 영역에 붙여넣거나 파일을 선택하세요.
                    </div>`}
                </div>
                <input type="file" accept="image/*" class="form-input" style="margin-top:8px;" onchange="ProdEquipmentModule.handleTempProfileFile(this)">
            </div>
            <div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">측정자</label>
                        <input class="form-input" id="tpMeasurer" value="${_esc(r.measurer || '')}"></div>
                    <div class="form-group"><label class="form-label">확인자</label>
                        <input class="form-input" id="tpConfirmer" value="${_esc(r.confirmer || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">MAIN시간(sec)</label>
                        <input type="number" class="form-input" id="tpMainSec" value="${r.mainSec ?? 3000}"></div>
                    <div class="form-group"><label class="form-label">측정시간(min)</label>
                        <input type="number" step="0.1" class="form-input" id="tpMeasMinutes" value="${r.measMinutes ?? ''}"></div>
                </div>
                <div class="form-group"><label class="form-label">측정 평가</label>
                    <select class="form-select" id="tpResult">
                        ${['PASS','FAIL','조건부 PASS'].map(v=>`<option ${(r.result||'PASS')===v?'selected':''}>${v}</option>`).join('')}
                    </select></div>
            </div>
        </div>
        <div style="margin-top:12px;border:1px solid #111827;overflow:auto;">
            <table class="data-table" style="min-width:760px;table-layout:fixed;font-size:.78rem;">
                <thead><tr><th style="width:90px;border:1px dotted #111827;background:#eef2ff;">IR ZONE NO.</th>${zoneHeaders}</tr></thead>
                <tbody>
                    <tr><td style="border:1px dotted #111827;color:#dc2626;font-weight:800;">SET(℃)</td>${setCells}</tr>
                    <tr><td style="border:1px dotted #111827;color:#16a34a;font-weight:800;">READ(℃)</td>${readCells}</tr>
                </tbody>
            </table>
        </div>
        <div class="form-group" style="margin-top:12px;"><label class="form-label">측정결과 / 비고</label>
            <textarea class="form-textarea" id="tpResultNote" rows="3">${_esc(r.resultNote || r.note || '')}</textarea></div>`;
    }

    function _setTempProfileImage(dataUrl) {
        const hidden = document.getElementById('tpImageData');
        const box = document.getElementById('tpPasteBox');
        if (hidden) hidden.value = dataUrl || '';
        if (box) {
            box.innerHTML = dataUrl
                ? `<img id="tpImagePreview" src="${dataUrl}" style="max-width:100%;max-height:360px;display:block;">`
                : `<div id="tpImagePreview" style="text-align:center;color:var(--text-muted);">캡쳐 이미지를 붙여넣으세요.</div>`;
        }
    }

    function handleTempProfilePaste(event) {
        const items = event.clipboardData && event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
        const img = items.find(item => item.type && item.type.startsWith('image/'));
        if (!img) return;
        event.preventDefault();
        const file = img.getAsFile();
        const reader = new FileReader();
        reader.onload = e => _setTempProfileImage(e.target.result);
        reader.readAsDataURL(file);
    }

    function handleTempProfileFile(input) {
        const file = input && input.files ? input.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => _setTempProfileImage(e.target.result);
        reader.readAsDataURL(file);
    }

    async function saveTempProfile(id) {
        const g = id => document.getElementById(id)?.value || '';
        const n = id => {
            const v = g(id);
            return v === '' ? null : Number(v);
        };
        const date = g('tpDate');
        if (!date) { UIUtils.toast('측정일을 입력하세요.', 'warning'); return; }
        const line = g('tpLine') || 'A라인';
        const month = Number(g('tpMonth')) || Number(date.slice(5,7));
        const data = {
            _docKind: 'temperature_profile',
            lineCategory: 'temperature_profile',
            year: Number(g('tpYear')) || Number(date.slice(0,4)),
            month,
            date,
            line,
            purpose: g('tpPurpose'),
            equipment: g('tpEquipment'),
            lineSpeed: g('tpLineSpeed'),
            measurer: g('tpMeasurer').trim(),
            confirmer: g('tpConfirmer').trim(),
            mainSec: n('tpMainSec'),
            measMinutes: n('tpMeasMinutes'),
            result: g('tpResult'),
            resultNote: g('tpResultNote').trim(),
            note: g('tpResultNote').trim(),
            imageData: g('tpImageData'),
            setTemps: Array.from({length:8}, (_,i)=>n('tpSet'+i)),
            readTemps: Array.from({length:8}, (_,i)=>n('tpRead'+i))
        };
        if (id) await Storage.update(ST_SQ_LOG, id, data);
        else await Storage.add(ST_SQ_LOG, data);
        UIUtils.closeModal();
        UIUtils.toast('온도프로파일 기록이 저장되었습니다.', 'success');
        _renderTemperatureProfile();
    }

    function removeTempProfile(id) {
        UIUtils.confirm('온도프로파일 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_SQ_LOG, id);
            UIUtils.closeModal();
            _renderTemperatureProfile();
        });
    }

    function previewTempProfileImage(id) {
        const r = _tempProfileItem(id);
        if (!r || !r.imageData) return;
        UIUtils.showModal('측정지 캡쳐', `<img src="${r.imageData}" style="width:100%;display:block;border:1px solid var(--border-color);">`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    function exportTemperatureProfile() {
        const year = Number(document.getElementById('tempProfileYear')?.value) || new Date().getFullYear();
        const rows = _tempProfileLogs(year).map(r => [
            r.year, r.month, r.date, r.line, r.purpose || '', r.equipment || '', r.lineSpeed || '',
            r.mainSec ?? '', r.measMinutes ?? '', r.result || '', r.measurer || '', r.confirmer || '',
            (r.setTemps || []).join('/'), (r.readTemps || []).join('/'), r.resultNote || ''
        ]);
        Storage.exportToCSV(['년도','월','측정일','공정명','측정목적','측정장비','LINE SPEED','MAIN시간(sec)','측정시간(min)','판정','측정자','확인자','SET온도','READ온도','측정결과'], rows, `IR_건조로_온도측정_${year}`);
    }

    function _renderMaintenance() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('maintYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);">
                <div>
                    <h4 style="margin:0;font-size:1.05rem;display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">cleaning_services</span>
                        ${year}년 ${_maintLine === '도장A라인' ? 'A 라인' : 'B 라인'} 정비/청소 계획표
                    </h4>
                    <p style="margin:5px 0 0;color:var(--text-muted);font-size:.78rem;">범례: 계획(설정주기 기준 일정 수립)=○, 실행은 실제 일자를 별도 기록합니다.</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                    <input type="number" class="form-input" id="maintYear" value="${year}" min="2020" max="2100"
                        onchange="ProdEquipmentModule.renderMaintenance()" style="width:98px;">
                    ${LINES.map(line => `
                        <button class="btn ${line === _maintLine ? 'btn-primary' : 'btn-outline'}"
                            onclick="ProdEquipmentModule.switchMaintenanceLine('${line}')">
                            <span class="material-symbols-outlined">precision_manufacturing</span>${line.replace('도장','도장 ')}
                        </button>`).join('')}
                </div>
            </div>
            <div style="padding:12px 14px;">
                ${_maintenancePlanTable(_maintLine, year)}
                <div style="margin-top:12px;border:2px solid #111827;border-top:none;height:44px;display:flex;align-items:center;justify-content:center;font-weight:900;background:#f3f4f6;">
                    관리 감독자 확인
                </div>
            </div>
        </div>`;
    }

    function _maintenancePlanTable(line, year) {
        const rows = MAINTENANCE_PLAN_ROWS.map(r => ({ ...r, area: r.area === '라인' ? (line === '도장A라인' ? '라인' : 'AIR라인') : r.area }));
        const areaCounts = {};
        rows.forEach(r => { areaCounts[r.area] = (areaCounts[r.area] || 0) + 1; });
        const areaSeen = {};
        const months = Array.from({length:12}, (_,i) => i + 1);
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #111827;">
            <table class="data-table" style="min-width:1640px;font-size:.75rem;border-collapse:collapse;table-layout:fixed;">
                <thead>
                    <tr>
                        <th rowspan="2" style="width:64px;border:1px solid #111827;background:#fff;">구역</th>
                        <th rowspan="2" style="width:190px;border:1px solid #111827;background:#fff;">항목</th>
                        <th rowspan="2" style="width:150px;border:1px solid #111827;background:#fff;">방법</th>
                        <th rowspan="2" style="width:250px;border:1px solid #111827;background:#fff;">세부내용</th>
                        <th style="width:58px;border:1px solid #111827;background:#fff;">일정</th>
                        <th colspan="12" style="border:1px solid #111827;background:#fff;font-size:.86rem;">${year}년</th>
                        <th rowspan="2" style="width:70px;border:1px solid #111827;background:#fff;">비고</th>
                    </tr>
                    <tr>
                        <th style="border:1px solid #111827;background:#fff;">주기</th>
                        ${months.map(m => `<th style="width:72px;border:1px solid #111827;background:#fff;">${m}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => {
                        const firstArea = !areaSeen[r.area];
                        areaSeen[r.area] = true;
                        return `<tr>
                            ${firstArea ? `<td rowspan="${areaCounts[r.area]}" style="border:1px solid #111827;font-weight:900;text-align:center;white-space:pre-line;">${_esc(r.area)}</td>` : ''}
                            <td style="border:1px dotted #111827;text-align:center;font-weight:600;">${_esc(r.item)}</td>
                            <td style="border:1px dotted #111827;text-align:center;">${_esc(r.method)}</td>
                            <td style="border:1px dotted #111827;text-align:center;white-space:pre-line;">${_esc(r.detail)}</td>
                            <td style="border:1px solid #111827;text-align:center;font-weight:700;">${_esc(r.cycle)}</td>
                            ${months.map(m => `<td style="border:1px solid #111827;text-align:center;font-size:${r.weekly ? '.82rem' : '1rem'};letter-spacing:2px;">${_maintenanceMark(r, m)}</td>`).join('')}
                            <td style="border:1px solid #111827;"></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _maintenanceMark(row, month) {
        if (row.weekly) return '○ ○ ○ ○ ○';
        return (row.months || []).includes(month) ? '○' : '';
    }

    function switchMaintenanceLine(line) {
        _maintLine = line;
        _renderMaintenance();
    }

    function renderMaintenance() {
        _renderMaintenance();
    }

    function _renderFProof() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const ym = document.getElementById('fproofMonth')?.value || UIUtils.today().slice(0, 7);
        const records = _fproofRecords(ym);
        const doneKeys = new Set(records.map(r => `${r.itemKey}_${Number((r.date||'').slice(8,10))}`));
        const totalTarget = FPROOF_ROWS.length * _daysInMonth(ym);
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);">
                <div>
                    <h4 style="margin:0;font-size:1.05rem;display:flex;align-items:center;gap:7px;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:var(--accent-blue);">fact_check</span>
                        F/PROOF 일일 C/SHEET
                    </h4>
                    <p style="margin:5px 0 0;color:var(--text-muted);font-size:.78rem;">일별 칸을 클릭하면 점검 완료(○) 기록이 등록/해제됩니다.</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                    <input type="month" class="form-input" id="fproofMonth" value="${ym}" onchange="ProdEquipmentModule.renderFProof()" style="width:150px;">
                    <button class="btn btn-outline" onclick="ProdEquipmentModule.exportFProof()">
                        <span class="material-symbols-outlined">download</span>CSV
                    </button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                <div style="display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;margin-bottom:12px;">
                    ${[
                        ['대상', FPROOF_ROWS.length, '항목/일'],
                        ['이번 달 완료', records.length, '건'],
                        ['전체 진행률', `${Math.round(records.length / Math.max(totalTarget, 1) * 100)}%`, '월간'],
                        ['오늘 미점검', _fproofMissingToday().length, '건']
                    ].map(([label, val, sub]) => `
                        <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:#fff;">
                            <div style="font-size:.72rem;color:var(--text-muted);">${label}</div>
                            <div style="font-size:1.15rem;font-weight:900;color:${label==='오늘 미점검' && val ? 'var(--accent-red)' : 'var(--text-primary)'};">${val}</div>
                            <div style="font-size:.68rem;color:var(--text-muted);">${sub}</div>
                        </div>`).join('')}
                </div>
                ${_fproofSheetTable(ym, doneKeys)}
            </div>
        </div>`;
    }

    function _fproofSheetTable(ym, doneKeys) {
        const days = Array.from({length:_daysInMonth(ym)}, (_,i) => i + 1);
        const rowHtml = FPROOF_ROWS.map(r => `
            <tr>
                <td style="border:1px solid #111827;text-align:center;font-weight:800;">${r.no}</td>
                <td style="border:1px solid #111827;text-align:center;white-space:pre-line;font-weight:700;">${_esc(r.item)}</td>
                <td style="border:1px solid #111827;text-align:center;white-space:pre-line;">${_esc(r.standard)}</td>
                <td style="border:1px solid #111827;text-align:center;white-space:pre-line;font-weight:700;">${_esc(r.place)}</td>
                <td style="border:1px solid #111827;text-align:center;white-space:pre-line;">${_esc(r.method)}</td>
                ${days.map(d => {
                    const checked = doneKeys.has(`${r.key}_${d}`);
                    return `<td onclick="ProdEquipmentModule.toggleFProof('${r.key}', ${d})"
                        style="border:1px dotted #111827;text-align:center;cursor:pointer;font-size:.95rem;background:${checked ? '#f0fdf4' : '#fff'};color:${checked ? 'var(--accent-green)' : 'var(--text-muted)'};">
                        ${checked ? '○' : ''}
                    </td>`;
                }).join('')}
            </tr>`).join('');
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #1d4ed8;">
            <table class="data-table" style="min-width:${860 + days.length * 28}px;font-size:.75rem;border-collapse:collapse;table-layout:fixed;">
                <thead>
                    <tr>
                        <th style="width:38px;border:1px solid #111827;background:#e5e7eb;">순</th>
                        <th style="width:150px;border:1px solid #111827;background:#e5e7eb;">점검항목</th>
                        <th style="width:170px;border:1px solid #111827;background:#e5e7eb;">점검기준</th>
                        <th style="width:120px;border:1px solid #111827;background:#e5e7eb;">점검장소</th>
                        <th style="width:64px;border:1px solid #111827;background:#e5e7eb;">방법</th>
                        ${days.map(d => `<th style="width:28px;border:1px solid #111827;background:#e5e7eb;">${d}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>
        </div>`;
    }

    function _fproofRecords(ym) {
        return (Storage.getAll(ST_FPROOF) || []).filter(r => r.yearMonth === ym);
    }

    function _daysInMonth(ym) {
        const [y, m] = String(ym).split('-').map(Number);
        return new Date(y || new Date().getFullYear(), m || 1, 0).getDate();
    }

    function _fproofDate(ym, day) {
        return `${ym}-${String(day).padStart(2, '0')}`;
    }

    async function toggleFProof(itemKey, day) {
        const ym = document.getElementById('fproofMonth')?.value || UIUtils.today().slice(0, 7);
        const date = _fproofDate(ym, day);
        const existing = (Storage.getAll(ST_FPROOF) || []).find(r => r.itemKey === itemKey && r.date === date);
        if (existing) await Storage.remove(ST_FPROOF, existing.id);
        else {
            const item = FPROOF_ROWS.find(r => r.key === itemKey) || {};
            await Storage.add(ST_FPROOF, { date, yearMonth: ym, itemKey, itemName: item.item || '', place: item.place || '', method: item.method || '', result: 'OK', checkedAt: new Date().toISOString() });
        }
        _renderFProof();
    }

    function _fproofMissingToday() {
        const today = UIUtils.today();
        const checked = new Set((Storage.getAll(ST_FPROOF) || []).filter(r => r.date === today).map(r => r.itemKey));
        return FPROOF_ROWS.filter(r => !checked.has(r.key));
    }

    function exportFProof() {
        const ym = document.getElementById('fproofMonth')?.value || UIUtils.today().slice(0, 7);
        const records = _fproofRecords(ym);
        const rows = records.map(r => [r.date, r.itemKey, r.itemName, r.place, r.method, r.result, r.checkedAt || '']);
        Storage.exportToCSV(['일자','항목키','점검항목','점검장소','방법','결과','기록시간'], rows, `FPROOF_${ym}`);
    }

    function renderFProof() {
        _renderFProof();
    }

    function _renderAirFilter() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('airFilterYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:2px solid #1d4ed8;background:#fff;">
                <div>
                    <h4 style="margin:0;font-size:1.5rem;font-weight:900;letter-spacing:.04em;text-decoration:underline;text-underline-offset:4px;">
                        ${year}년도 AIR FILTER 교체계획/실적
                    </h4>
                    <p style="margin:6px 0 0;font-size:.78rem;color:var(--text-muted);">범례: 계획 ○, 실적 V 또는 날짜 기록</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" class="form-input" id="airFilterYear" value="${year}" min="2020" max="2100"
                        onchange="ProdEquipmentModule.renderAirFilter()" style="width:98px;">
                    <button class="btn btn-outline" onclick="ProdEquipmentModule.exportAirFilter()">
                        <span class="material-symbols-outlined">download</span>CSV
                    </button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                ${_airFilterTable(year)}
                <div style="padding:10px 14px;border:2px solid #1d4ed8;border-top:none;font-size:.82rem;background:#fff;">
                    <div style="font-weight:800;margin-bottom:8px;">※ 특이사항 : AIR 검출시 즉시 교체 계획 수립</div>
                    <div style="padding-left:92px;">즉시 교체시 주기 수립은 변경 필수 있다.</div>
                </div>
            </div>
        </div>`;
    }

    function _airFilterTable(year) {
        const logs = (Storage.getAll(ST_AIR_FILTER) || []).filter(r => Number(r.year) === Number(year));
        const byKey = {};
        logs.forEach(r => { byKey[`${r.filterKey}_${r.month}`] = r; });
        const months = Array.from({length:12}, (_,i)=>i+1);
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #1d4ed8;">
            <table class="data-table" style="min-width:1120px;border-collapse:collapse;table-layout:fixed;font-size:.76rem;">
                <thead>
                    <tr>
                        <th rowspan="2" style="width:92px;border:1px solid #111827;background:#d9d9d9;">AIR FILTER</th>
                        <th colspan="3" style="border:1px solid #111827;background:#d9d9d9;">구 분</th>
                        <th rowspan="2" style="width:68px;border:1px solid #111827;background:#d9d9d9;">교체<br>주기</th>
                        ${months.map(m=>`<th rowspan="2" style="width:58px;border:1px solid #111827;background:#d9d9d9;">${m}월</th>`).join('')}
                    </tr>
                    <tr>
                        <th style="width:120px;border:1px solid #111827;background:#d9d9d9;">위치</th>
                        <th style="width:92px;border:1px solid #111827;background:#d9d9d9;">필터 종류<br>size/여과능력</th>
                        <th style="width:78px;border:1px solid #111827;background:#d9d9d9;">개소</th>
                    </tr>
                </thead>
                <tbody>
                    ${AIR_FILTER_ROWS.map(r => `
                        <tr>
                            <td style="border:1px solid #111827;text-align:center;font-weight:700;">${_esc(r.step)}</td>
                            <td style="border:1px solid #111827;text-align:center;white-space:pre-line;">${_esc(r.location)}</td>
                            <td style="border:1px solid #111827;text-align:center;">${_esc(r.filter)}</td>
                            <td style="border:1px solid #111827;text-align:center;white-space:pre-line;">${_esc(r.count)}</td>
                            <td style="border:1px solid #111827;text-align:center;font-weight:700;">${_esc(r.cycle)}</td>
                            ${months.map(m => {
                                const rec = byKey[`${r.key}_${m}`];
                                const planned = r.planMonths.includes(m);
                                return `<td onclick="ProdEquipmentModule.openAirFilterModal('${r.key}', ${m})"
                                    style="border:1px solid #111827;text-align:center;cursor:pointer;min-height:38px;background:${rec ? '#f0fdf4' : planned ? '#fff' : '#fafafa'};">
                                    <div style="font-size:1rem;color:${rec ? 'var(--accent-green)' : '#111827'};">${rec ? 'V' : planned ? '○' : ''}</div>
                                    ${rec ? `<div style="font-size:.64rem;color:var(--text-muted);">${_esc((rec.date||'').slice(5))}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>`).join('')}
                    <tr>
                        <td colspan="4" style="border:1px solid #111827;text-align:center;height:38px;font-weight:800;">교체자 (생산)</td>
                        <td style="border:1px solid #111827;text-align:center;font-weight:800;">성명</td>
                        ${months.map(m => `<td style="border:1px solid #111827;text-align:center;font-size:.68rem;color:var(--text-muted);">
                            ${logs.filter(r=>Number(r.month)===m).map(r=>_esc(r.worker||'')).filter(Boolean).slice(0,1).join('')}
                        </td>`).join('')}
                    </tr>
                </tbody>
            </table>
        </div>`;
    }

    function _airFilterItem(key) {
        return AIR_FILTER_ROWS.find(r => r.key === key) || AIR_FILTER_ROWS[0];
    }

    function openAirFilterModal(filterKey, month) {
        const year = Number(document.getElementById('airFilterYear')?.value) || new Date().getFullYear();
        const item = _airFilterItem(filterKey);
        const existing = (Storage.getAll(ST_AIR_FILTER) || []).find(r => Number(r.year) === year && Number(r.month) === Number(month) && r.filterKey === filterKey);
        UIUtils.showModal('AIR FILTER 교체 실적', _airFilterForm(existing, item, year, month), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${existing ? `<button class="btn btn-danger" onclick="ProdEquipmentModule.removeAirFilter('${existing.id}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ProdEquipmentModule.saveAirFilter('${existing ? existing.id : ''}')">저장</button>
        `, 'md');
    }

    function _airFilterForm(r, item, year, month) {
        r = r || {};
        return `
        <input type="hidden" id="afFilterKey" value="${item.key}">
        <input type="hidden" id="afYear" value="${year}">
        <input type="hidden" id="afMonth" value="${month}">
        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);margin-bottom:12px;">
            <div style="font-weight:900;">${_esc(item.step)} / ${_esc(item.location).replace(/\n/g,' ')}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;">${_esc(item.filter)} · ${_esc(item.count)} · 주기 ${_esc(item.cycle)}</div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">교체일</label>
                <input type="date" class="form-input" id="afDate" value="${r.date || `${year}-${String(month).padStart(2,'0')}-01`}"></div>
            <div class="form-group"><label class="form-label">교체자</label>
                <input class="form-input" id="afWorker" value="${_esc(r.worker || '')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">결과</label>
                <select class="form-select" id="afResult">
                    ${['교체완료','점검완료','보류','이상'].map(v=>`<option ${(r.result||'교체완료')===v?'selected':''}>${v}</option>`).join('')}
                </select></div>
            <div class="form-group"><label class="form-label">차기 계획월</label>
                <input type="month" class="form-input" id="afNextMonth" value="${_esc(r.nextMonth || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label>
            <textarea class="form-textarea" id="afNote" rows="3">${_esc(r.note || '')}</textarea></div>`;
    }

    async function saveAirFilter(id) {
        const key = document.getElementById('afFilterKey').value;
        const item = _airFilterItem(key);
        const data = {
            year: Number(document.getElementById('afYear').value),
            month: Number(document.getElementById('afMonth').value),
            filterKey: key,
            step: item.step,
            location: item.location,
            filter: item.filter,
            count: item.count,
            cycle: item.cycle,
            date: document.getElementById('afDate').value,
            worker: document.getElementById('afWorker').value.trim(),
            result: document.getElementById('afResult').value,
            nextMonth: document.getElementById('afNextMonth').value,
            note: document.getElementById('afNote').value.trim()
        };
        if (id) await Storage.update(ST_AIR_FILTER, id, data);
        else await Storage.add(ST_AIR_FILTER, data);
        UIUtils.closeModal();
        UIUtils.toast('AIR FILTER 교체 실적이 저장되었습니다.', 'success');
        _renderAirFilter();
    }

    function removeAirFilter(id) {
        UIUtils.confirm('AIR FILTER 교체 실적을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_AIR_FILTER, id);
            UIUtils.closeModal();
            _renderAirFilter();
        });
    }

    function exportAirFilter() {
        const year = Number(document.getElementById('airFilterYear')?.value) || new Date().getFullYear();
        const rows = (Storage.getAll(ST_AIR_FILTER) || []).filter(r => Number(r.year) === year)
            .map(r => [r.year, r.month, r.step, r.location, r.filter, r.count, r.cycle, r.date, r.worker || '', r.result || '', r.nextMonth || '', r.note || '']);
        Storage.exportToCSV(['년도','월','차수','위치','필터','개소','주기','교체일','교체자','결과','차기계획월','비고'], rows, `AIR_FILTER_${year}`);
    }

    function renderAirFilter() {
        _renderAirFilter();
    }

    function _renderSupplyFilter() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('supplyFilterYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:2px solid #1d4ed8;background:#fff;">
                <div>
                    <h4 style="margin:0;font-size:1.55rem;font-weight:900;letter-spacing:.04em;text-decoration:underline;text-underline-offset:4px;">
                        ${year}년도 도장팀 급기 FILTER 교체계획/실적
                    </h4>
                    <p style="margin:6px 0 0;font-size:.78rem;color:var(--text-muted);">범례: 계획 ○, 실적 V, 날짜기록</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" class="form-input" id="supplyFilterYear" value="${year}" min="2020" max="2100"
                        onchange="ProdEquipmentModule.renderSupplyFilter()" style="width:98px;">
                    <button class="btn btn-outline" onclick="ProdEquipmentModule.exportSupplyFilter()">
                        <span class="material-symbols-outlined">download</span>CSV
                    </button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                ${_supplyFilterTable(year)}
                <div style="display:grid;grid-template-columns:160px 1fr;border:2px solid #1d4ed8;border-top:none;background:#fff;">
                    <div style="padding:14px;border-right:1px solid #111827;text-align:center;font-weight:900;">관리자 확인</div>
                    <div style="padding:14px;color:var(--text-muted);font-size:.82rem;">계획월에는 ○가 표시되며, 실적 입력 시 V와 교체일자가 함께 기록됩니다.</div>
                </div>
            </div>
        </div>`;
    }

    function _supplyFilterTable(year) {
        const logs = (Storage.getAll(ST_SUPPLY_FILTER) || []).filter(r => Number(r.year) === Number(year));
        const byKey = {};
        logs.forEach(r => { byKey[`${r.filterKey}_${r.month}`] = r; });
        const months = Array.from({length:12}, (_,i)=>i+1);
        const gradeCounts = {};
        const sectionCounts = {};
        SUPPLY_FILTER_ROWS.forEach(r => {
            gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1;
            const sk = `${r.grade}|${r.section}`;
            sectionCounts[sk] = (sectionCounts[sk] || 0) + 1;
        });
        const seenGrade = new Set();
        const seenSection = new Set();
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #1d4ed8;">
            <table class="data-table" style="min-width:1320px;border-collapse:collapse;table-layout:fixed;font-size:.75rem;">
                <thead>
                    <tr>
                        <th style="width:86px;border:1px solid #111827;background:#d9d9d9;">급기</th>
                        <th colspan="2" style="width:132px;border:1px solid #111827;background:#d9d9d9;">구 분</th>
                        <th style="width:78px;border:1px solid #111827;background:#d9d9d9;">교체<br>주기</th>
                        ${months.map(m=>`<th style="width:72px;border:1px solid #111827;background:#d9d9d9;">${m}월</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${SUPPLY_FILTER_ROWS.map(r => {
                        const gradeFirst = !seenGrade.has(r.grade);
                        const sectionKey = `${r.grade}|${r.section}`;
                        const sectionFirst = !seenSection.has(sectionKey);
                        seenGrade.add(r.grade);
                        seenSection.add(sectionKey);
                        return `
                        <tr>
                            ${gradeFirst ? `<td rowspan="${gradeCounts[r.grade]}" style="border:1px solid #111827;text-align:center;font-weight:800;white-space:pre-line;">${_esc(r.grade)}</td>` : ''}
                            ${sectionFirst ? `<td rowspan="${sectionCounts[sectionKey]}" style="border:1px solid #111827;text-align:center;white-space:pre-line;font-weight:700;">${_esc(r.section)}</td>` : ''}
                            <td style="border:1px solid #111827;text-align:center;">${_esc(r.position)}</td>
                            ${sectionFirst ? `<td rowspan="${sectionCounts[sectionKey]}" style="border:1px solid #111827;text-align:center;font-weight:800;">${_esc(r.cycle)}</td>` : ''}
                            ${months.map(m => {
                                const rec = byKey[`${r.key}_${m}`];
                                const planned = r.planMonths.includes(m);
                                return `<td onclick="ProdEquipmentModule.openSupplyFilterModal('${r.key}', ${m})"
                                    style="border:1px solid #111827;text-align:center;cursor:pointer;background:${rec ? '#f0fdf4' : '#fff'};height:26px;">
                                    <div style="font-size:1rem;line-height:1;color:${rec ? 'var(--accent-green)' : '#111827'};">${rec ? 'V' : planned ? '○' : ''}</div>
                                    ${rec ? `<div style="font-size:.62rem;color:var(--text-muted);line-height:1.15;margin-top:2px;">${_esc((rec.date||'').slice(5))}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _supplyFilterItem(key) {
        return SUPPLY_FILTER_ROWS.find(r => r.key === key) || SUPPLY_FILTER_ROWS[0];
    }

    function openSupplyFilterModal(filterKey, month) {
        const year = Number(document.getElementById('supplyFilterYear')?.value) || new Date().getFullYear();
        const item = _supplyFilterItem(filterKey);
        const existing = (Storage.getAll(ST_SUPPLY_FILTER) || []).find(r => Number(r.year) === year && Number(r.month) === Number(month) && r.filterKey === filterKey);
        UIUtils.showModal('급기 FILTER 교체 실적', _supplyFilterForm(existing, item, year, month), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${existing ? `<button class="btn btn-danger" onclick="ProdEquipmentModule.removeSupplyFilter('${existing.id}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ProdEquipmentModule.saveSupplyFilter('${existing ? existing.id : ''}')">저장</button>
        `, 'md');
    }

    function _supplyFilterForm(r, item, year, month) {
        r = r || {};
        return `
        <input type="hidden" id="sfFilterKey" value="${item.key}">
        <input type="hidden" id="sfYear" value="${year}">
        <input type="hidden" id="sfMonth" value="${month}">
        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);margin-bottom:12px;">
            <div style="font-weight:900;white-space:pre-line;">${_esc(item.grade)} / ${_esc(item.section).replace(/\n/g,' ')} ${_esc(item.position || '')}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;">교체주기 ${_esc(item.cycle)} · 계획월 ${item.planMonths.map(m=>`${m}월`).join(', ') || '-'}</div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">실시일</label>
                <input type="date" class="form-input" id="sfDate" value="${r.date || `${year}-${String(month).padStart(2,'0')}-01`}"></div>
            <div class="form-group"><label class="form-label">실시자</label>
                <input class="form-input" id="sfWorker" value="${_esc(r.worker || '')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">결과</label>
                <select class="form-select" id="sfResult">
                    ${['교체완료','청소완료','점검완료','보류','이상'].map(v=>`<option ${(r.result||'교체완료')===v?'selected':''}>${v}</option>`).join('')}
                </select></div>
            <div class="form-group"><label class="form-label">차기 계획월</label>
                <input type="month" class="form-input" id="sfNextMonth" value="${_esc(r.nextMonth || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label>
            <textarea class="form-textarea" id="sfNote" rows="3">${_esc(r.note || '')}</textarea></div>`;
    }

    async function saveSupplyFilter(id) {
        const key = document.getElementById('sfFilterKey').value;
        const item = _supplyFilterItem(key);
        const data = {
            year: Number(document.getElementById('sfYear').value),
            month: Number(document.getElementById('sfMonth').value),
            filterKey: key,
            grade: item.grade,
            section: item.section,
            position: item.position,
            cycle: item.cycle,
            date: document.getElementById('sfDate').value,
            worker: document.getElementById('sfWorker').value.trim(),
            result: document.getElementById('sfResult').value,
            nextMonth: document.getElementById('sfNextMonth').value,
            note: document.getElementById('sfNote').value.trim()
        };
        if (id) await Storage.update(ST_SUPPLY_FILTER, id, data);
        else await Storage.add(ST_SUPPLY_FILTER, data);
        UIUtils.closeModal();
        UIUtils.toast('급기 FILTER 교체 실적이 저장되었습니다.', 'success');
        _renderSupplyFilter();
    }

    function removeSupplyFilter(id) {
        UIUtils.confirm('급기 FILTER 교체 실적을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_SUPPLY_FILTER, id);
            UIUtils.closeModal();
            _renderSupplyFilter();
        });
    }

    function exportSupplyFilter() {
        const year = Number(document.getElementById('supplyFilterYear')?.value) || new Date().getFullYear();
        const rows = (Storage.getAll(ST_SUPPLY_FILTER) || []).filter(r => Number(r.year) === year)
            .map(r => [r.year, r.month, r.grade, r.section, r.position || '', r.cycle, r.date, r.worker || '', r.result || '', r.nextMonth || '', r.note || '']);
        Storage.exportToCSV(['년도','월','급기','구분','번호/위치','주기','실시일','실시자','결과','차기계획월','비고'], rows, `SUPPLY_FILTER_${year}`);
    }

    function renderSupplyFilter() {
        _renderSupplyFilter();
    }

    function _renderDryerClean() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        const year = Number(document.getElementById('dryerCleanYear')?.value) || new Date().getFullYear();
        el.innerHTML = `
        <div class="card" style="overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px;border-bottom:2px solid #111827;background:#fff;">
                <div>
                    <h4 style="margin:0;font-size:1.55rem;font-weight:900;letter-spacing:.04em;text-decoration:underline;text-underline-offset:4px;">
                        ${year}년도 도장팀 건조로 청소 계획/실적
                    </h4>
                    <p style="margin:6px 0 0;font-size:.78rem;color:var(--text-muted);">범례: 계획 ○, 실적 V, 날짜기록</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" class="form-input" id="dryerCleanYear" value="${year}" min="2020" max="2100"
                        onchange="ProdEquipmentModule.renderDryerClean()" style="width:98px;">
                    <button class="btn btn-outline" onclick="ProdEquipmentModule.exportDryerClean()">
                        <span class="material-symbols-outlined">download</span>CSV
                    </button>
                </div>
            </div>
            <div style="padding:12px 14px;">
                ${_dryerCleanTable(year)}
                <div style="display:grid;grid-template-columns:180px 1fr;border:2px solid #111827;border-top:none;background:#fff;">
                    <div style="padding:14px;border-right:1px solid #111827;text-align:center;font-weight:900;">관리자확인</div>
                    <div style="padding:14px;color:var(--text-muted);font-size:.82rem;">계획월에는 ○가 표시되며, 실적 입력 시 V와 청소일자가 함께 기록됩니다.</div>
                </div>
            </div>
        </div>`;
    }

    function _dryerCleanTable(year) {
        const logs = (Storage.getAll(ST_DRYER_CLEAN) || []).filter(r => Number(r.year) === Number(year));
        const byKey = {};
        logs.forEach(r => { byKey[`${r.cleanKey}_${r.month}`] = r; });
        const months = Array.from({length:12}, (_,i)=>i+1);
        const lineCounts = {};
        DRYER_CLEAN_ROWS.forEach(r => { lineCounts[r.line] = (lineCounts[r.line] || 0) + 1; });
        const seenLine = new Set();
        return `
        <div class="data-table-wrapper" style="overflow:auto;border:2px solid #111827;">
            <table class="data-table" style="min-width:1260px;border-collapse:collapse;table-layout:fixed;font-size:.78rem;">
                <thead>
                    <tr>
                        <th colspan="2" style="width:150px;border:1px solid #111827;background:#d9d9d9;">구 분</th>
                        <th style="width:64px;border:1px solid #111827;background:#d9d9d9;">청소<br>주기</th>
                        ${months.map(m=>`<th style="width:78px;border:1px solid #111827;background:#d9d9d9;">${m}월</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${DRYER_CLEAN_ROWS.map(r => {
                        const firstLine = !seenLine.has(r.line);
                        seenLine.add(r.line);
                        return `
                        <tr>
                            ${firstLine ? `<td rowspan="${lineCounts[r.line]}" style="border:1px solid #111827;text-align:center;font-weight:900;white-space:pre-line;">${_esc(r.line)}</td>` : ''}
                            <td style="border:1px solid #111827;text-align:center;white-space:pre-line;font-weight:700;">${_esc(r.section)}</td>
                            <td style="border:1px solid #111827;text-align:center;font-weight:800;">${_esc(r.cycle)}</td>
                            ${months.map(m => {
                                const rec = byKey[`${r.key}_${m}`];
                                const planned = r.planMonths.includes(m);
                                return `<td onclick="ProdEquipmentModule.openDryerCleanModal('${r.key}', ${m})"
                                    style="border:1px solid #111827;text-align:center;cursor:pointer;background:${rec ? '#f0fdf4' : '#fff'};height:48px;">
                                    <div style="font-size:1rem;line-height:1;color:${rec ? 'var(--accent-green)' : '#111827'};">${rec ? 'V' : planned ? '○' : ''}</div>
                                    ${rec ? `<div style="font-size:.62rem;color:var(--text-muted);line-height:1.15;margin-top:3px;">${_esc((rec.date||'').slice(5))}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function _dryerCleanItem(key) {
        return DRYER_CLEAN_ROWS.find(r => r.key === key) || DRYER_CLEAN_ROWS[0];
    }

    function openDryerCleanModal(cleanKey, month) {
        const year = Number(document.getElementById('dryerCleanYear')?.value) || new Date().getFullYear();
        const item = _dryerCleanItem(cleanKey);
        const existing = (Storage.getAll(ST_DRYER_CLEAN) || []).find(r => Number(r.year) === year && Number(r.month) === Number(month) && r.cleanKey === cleanKey);
        UIUtils.showModal('건조로 청소 실적', _dryerCleanForm(existing, item, year, month), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${existing ? `<button class="btn btn-danger" onclick="ProdEquipmentModule.removeDryerClean('${existing.id}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="ProdEquipmentModule.saveDryerClean('${existing ? existing.id : ''}')">저장</button>
        `, 'md');
    }

    function _dryerCleanForm(r, item, year, month) {
        r = r || {};
        return `
        <input type="hidden" id="dcCleanKey" value="${item.key}">
        <input type="hidden" id="dcYear" value="${year}">
        <input type="hidden" id="dcMonth" value="${month}">
        <div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);margin-bottom:12px;">
            <div style="font-weight:900;white-space:pre-line;">${_esc(item.line)} / ${_esc(item.section)}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px;">청소주기 ${_esc(item.cycle)} · 계획월 ${item.planMonths.map(m=>`${m}월`).join(', ') || '-'}</div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">청소일</label>
                <input type="date" class="form-input" id="dcDate" value="${r.date || `${year}-${String(month).padStart(2,'0')}-01`}"></div>
            <div class="form-group"><label class="form-label">작업자</label>
                <input class="form-input" id="dcWorker" value="${_esc(r.worker || '')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">결과</label>
                <select class="form-select" id="dcResult">
                    ${['청소완료','점검완료','보류','이상'].map(v=>`<option ${(r.result||'청소완료')===v?'selected':''}>${v}</option>`).join('')}
                </select></div>
            <div class="form-group"><label class="form-label">차기 계획월</label>
                <input type="month" class="form-input" id="dcNextMonth" value="${_esc(r.nextMonth || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label>
            <textarea class="form-textarea" id="dcNote" rows="3">${_esc(r.note || '')}</textarea></div>`;
    }

    async function saveDryerClean(id) {
        const key = document.getElementById('dcCleanKey').value;
        const item = _dryerCleanItem(key);
        const data = {
            year: Number(document.getElementById('dcYear').value),
            month: Number(document.getElementById('dcMonth').value),
            cleanKey: key,
            line: item.line,
            section: item.section,
            cycle: item.cycle,
            date: document.getElementById('dcDate').value,
            worker: document.getElementById('dcWorker').value.trim(),
            result: document.getElementById('dcResult').value,
            nextMonth: document.getElementById('dcNextMonth').value,
            note: document.getElementById('dcNote').value.trim()
        };
        if (id) await Storage.update(ST_DRYER_CLEAN, id, data);
        else await Storage.add(ST_DRYER_CLEAN, data);
        UIUtils.closeModal();
        UIUtils.toast('건조로 청소 실적이 저장되었습니다.', 'success');
        _renderDryerClean();
    }

    function removeDryerClean(id) {
        UIUtils.confirm('건조로 청소 실적을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_DRYER_CLEAN, id);
            UIUtils.closeModal();
            _renderDryerClean();
        });
    }

    function exportDryerClean() {
        const year = Number(document.getElementById('dryerCleanYear')?.value) || new Date().getFullYear();
        const rows = (Storage.getAll(ST_DRYER_CLEAN) || []).filter(r => Number(r.year) === year)
            .map(r => [r.year, r.month, r.line, r.section, r.cycle, r.date, r.worker || '', r.result || '', r.nextMonth || '', r.note || '']);
        Storage.exportToCSV(['년도','월','라인','구분','청소주기','청소일','작업자','결과','차기계획월','비고'], rows, `DRYER_CLEAN_${year}`);
    }

    function renderDryerClean() {
        _renderDryerClean();
    }

    // ════════════════════════════════════════════════════════════
    // SQ 점검관리 — 메인 렌더
    // ════════════════════════════════════════════════════════════
    function _renderSQ() {
        const el = document.getElementById('equipMainContent');
        if (!el) return;
        el.innerHTML = `
        <div>
            <!-- SQ 카테고리 탭 -->
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px;
                        background:var(--bg-secondary);padding:8px;border-radius:10px;">
                ${SQ_CATS.map(t => `
                <button id="sqCat_${t.k}" onclick="ProdEquipmentModule.switchSQTab('${t.k}')"
                    style="padding:7px 14px;border:none;border-radius:6px;cursor:pointer;font-size:0.82rem;
                           display:flex;align-items:center;gap:5px;transition:all .15s;
                           background:${_sqTab===t.k?'var(--accent-blue)':'transparent'};
                           color:${_sqTab===t.k?'#fff':'var(--text-secondary)'};
                           font-weight:${_sqTab===t.k?'600':'400'};">
                    <span class="material-symbols-outlined" style="font-size:15px;">${t.icon}</span>${t.label}
                </button>`).join('')}
            </div>
            <div id="sqContent"></div>
        </div>`;
        _renderSQContent();
    }

    function switchSQTab(tab) {
        _sqTab = tab;
        SQ_CATS.forEach(t => {
            const el = document.getElementById('sqCat_' + t.k);
            if (!el) return;
            const on = t.k === tab;
            el.style.background = on ? 'var(--accent-blue)' : 'transparent';
            el.style.color      = on ? '#fff' : 'var(--text-secondary)';
            el.style.fontWeight = on ? '600' : '400';
        });
        _renderSQContent();
    }

    function _renderSQContent() {
        const el = document.getElementById('sqContent');
        if (!el) return;
        if (_sqTab === 'daily' || _sqTab === 'booth' || _sqTab === 'boothenv' || _sqTab === 'jig' || _sqTab === 'conveyor' || _sqTab === 'ovenprofile') _sqTab = 'oven';
        switch (_sqTab) {
            case 'oven':        _renderSQOven(el);        break;
        }
    }

    // ── SQ 헬퍼: 관리기준 로드/저장 ─────────────────────────────
    function _sqStdKey() { return _line + ':' + _sqTab; }

    function _getSQStd() {
        const all = Storage.getAll(ST_SQ_STD) || [];
        return all.find(r => r.lineCategory === _sqStdKey()) || null;
    }

    function _getSQLogs() {
        const key = _sqStdKey();
        return (Storage.getAll(ST_SQ_LOG) || [])
            .filter(r => r.lineCategory === key)
            .sort((a,b) => b.date.localeCompare(a.date));
    }

    // ── SQ 공통 레이아웃 빌더 ────────────────────────────────────
    function _sqLayout(stdCard, logCard) {
        return `
        <div style="display:flex;flex-direction:column;gap:16px;">
            <!-- 관리기준 카드 -->
            <div class="card" style="overflow:hidden;">
                <div style="padding:11px 16px;background:linear-gradient(135deg,#1e40af,#3b82f6);
                            display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:0.9rem;color:#fff;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:18px;">rule</span>
                        관리기준 설정 <span style="font-size:0.75rem;font-weight:400;opacity:.85;">(${_line})</span>
                    </span>
                    <button class="btn" style="padding:4px 12px;font-size:0.8rem;background:#fff;color:var(--accent-blue);border:none;"
                        onclick="ProdEquipmentModule.openSQStdModal()">
                        <span class="material-symbols-outlined" style="font-size:14px;">edit</span> 기준 설정
                    </button>
                </div>
                <div style="padding:14px 16px;">${stdCard}</div>
            </div>
            <!-- 점검 기록 카드 -->
            <div class="card" style="overflow:hidden;">
                <div style="padding:11px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);
                            display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:18px;">history</span>
                        점검 기록 이력
                    </span>
                    <button class="btn btn-primary" style="padding:5px 12px;font-size:0.82rem;"
                        onclick="ProdEquipmentModule.openSQLogModal()">
                        <span class="material-symbols-outlined" style="font-size:15px;">add</span> 기록 등록
                    </button>
                </div>
                <div style="padding:14px 16px;">${logCard}</div>
            </div>
        </div>`;
    }

    function _stdRow(label, val, unit) {
        if (!val && val !== 0) return `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);">
            <span style="min-width:180px;font-size:0.82rem;color:var(--text-muted);">${label}</span>
            <span style="font-size:0.82rem;color:var(--text-muted);">미설정</span></div>`;
        return `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);">
            <span style="min-width:180px;font-size:0.82rem;color:var(--text-secondary);">${label}</span>
            <span style="font-size:0.88rem;font-weight:600;">${_esc(String(val))}${unit ? ' <span style="font-size:.78rem;color:var(--text-muted);">'+unit+'</span>' : ''}</span>
        </div>`;
    }

    // ════════════════════════════════════════════════════════════
    // SQ-1: 설비 일상점검
    // ════════════════════════════════════════════════════════════
    function _renderSQDaily(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('게이지류 상한 기준값', std.gaugeMax, '')}
            ${_stdRow('게이지류 하한 기준값', std.gaugeMin, '')}
            ${_stdRow('F/P 경고등/알람 기준', std.alarmStd, '')}
            ${_stdRow('시건장치/KEY-LOCK', std.keylock, '')}
            ${_stdRow('OK/NG 마스터 점검 방법', std.masterMethod, '')}
            ${_stdRow('캘리브레이션 주기', std.calibCycle, '일')}
        </div>
        ${std.note ? `<div style="margin-top:6px;font-size:.8rem;color:var(--text-muted);">비고: ${_esc(std.note)}</div>` : ''}`;

        const logHTML = _sqLogTable(logs, [
            {k:'equipName', label:'설비명', w:'14%'},
            {k:'checkItem', label:'점검항목', w:'16%'},
            {k:'measured',  label:'실측값',  w:'10%'},
            {k:'stdRange',  label:'기준범위', w:'12%'},
            {k:'alarmOk',   label:'경보작동', w:'8%', badge:true},
            {k:'calTeach',  label:'0점조정',  w:'8%', badge:true},
            {k:'result',    label:'판정',     w:'7%',  badge:true},
            {k:'checker',   label:'점검자',   w:'8%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-2: 도장부스 조건관리
    // ════════════════════════════════════════════════════════════
    function _renderSQBooth(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('온도 하한', std.tempMin, '℃')}
            ${_stdRow('온도 상한', std.tempMax, '℃')}
            ${_stdRow('습도 하한', std.humMin,  '%RH')}
            ${_stdRow('습도 상한', std.humMax,  '%RH')}
            ${_stdRow('Air Balance 기준', std.airBalance, 'Pa')}
            ${_stdRow('측정 주기', std.measCycle, '회/일')}
        </div>`;

        const logHTML = _sqLogTable(logs, [
            {k:'measTime', label:'측정시간', w:'10%'},
            {k:'temp',     label:'온도(℃)', w:'10%', num:true},
            {k:'hum',      label:'습도(%RH)',w:'10%', num:true},
            {k:'airBal',   label:'Air Balance', w:'11%', num:true},
            {k:'tempOk',   label:'온도판정', w:'8%',  badge:true},
            {k:'humOk',    label:'습도판정', w:'8%',  badge:true},
            {k:'result',   label:'종합판정', w:'8%',  badge:true},
            {k:'checker',  label:'측정자',  w:'8%'},
            {k:'action',   label:'조치내용', w:'17%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-3: Booth 환경관리
    // ════════════════════════════════════════════════════════════
    function _renderSQBoothEnv(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('청소 주기', std.cleanCycle, '일')}
            ${_stdRow('청소 방법', std.cleanMethod, '')}
            ${_stdRow('필터 교환 주기', std.filterCycle, '일')}
            ${_stdRow('필터 종류', std.filterType, '')}
            ${_stdRow('자체관리기준 수립', std.ownStd, '')}
        </div>
        ${std.note ? `<div style="margin-top:6px;font-size:.8rem;color:var(--text-muted);">비고: ${_esc(std.note)}</div>` : ''}`;

        const logHTML = _sqLogTable(logs, [
            {k:'workType',   label:'작업구분',  w:'13%', badge:true},
            {k:'filterPos',  label:'필터위치',  w:'13%'},
            {k:'nextDate',   label:'다음예정일', w:'12%'},
            {k:'worker',     label:'작업자',    w:'10%'},
            {k:'result',     label:'상태',      w:'9%', badge:true},
            {k:'action',     label:'특이사항',  w:'24%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-4: 건조오븐 조건관리
    // ════════════════════════════════════════════════════════════
    function _renderSQOven(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('피도물 재질', std.material, '')}
            ${_stdRow('관리 온도 하한', std.tempMin, '℃')}
            ${_stdRow('관리 온도 상한', std.tempMax, '℃')}
            ${_stdRow('건조 시간 기준', std.dryTime, 'min')}
            ${_stdRow('경보 설정값 (상한)', std.alarmTemp, '℃')}
            ${_stdRow('열풍필터 교환 주기', std.filterCycle, '일')}
            ${_stdRow('경보장치 설치 여부', std.alarmInstalled, '')}
        </div>`;

        const logHTML = _sqLogTable(logs, [
            {k:'measTime',   label:'점검시간',   w:'9%'},
            {k:'recTemp',    label:'타점기록(℃)', w:'12%', num:true},
            {k:'deviation',  label:'편차(±)',     w:'8%',  num:true},
            {k:'alarmTrig',  label:'경보작동',    w:'9%',  badge:true},
            {k:'filterChk',  label:'필터점검',    w:'9%',  badge:true},
            {k:'result',     label:'판정',        w:'7%',  badge:true},
            {k:'checker',    label:'점검자',      w:'9%'},
            {k:'action',     label:'조치내용',    w:'21%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-5: 건조오븐 온도 프로파일
    // ════════════════════════════════════════════════════════════
    function _renderSQOvenProfile(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('측정 주기', std.measCycle || '1회/분기', '')}
            ${_stdRow('측정 Zone 수', std.zoneCount, '개')}
            ${_stdRow('Zone별 기준 상한', std.zoneMax, '℃')}
            ${_stdRow('Zone별 기준 하한', std.zoneMin, '℃')}
        </div>
        <div style="margin-top:8px;padding:8px;background:#fff7ed;border-radius:6px;font-size:0.8rem;color:#7c4700;">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">info</span>
            온도 프로파일은 <strong>분기 1회 이상</strong> 측정 및 이력관리가 필요합니다.
        </div>`;

        // 프로파일은 Zone 온도 배열 포함 — 특수 렌더
        const logRows = logs.length === 0
            ? `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-muted);">측정 이력이 없습니다.</td></tr>`
            : logs.map((r, i) => {
                const zones = Array.isArray(r.zones) ? r.zones : [];
                const zoneCells = Array.from({length: Math.max(zones.length, 6)}, (_, zi) =>
                    `<td style="text-align:right;font-size:.8rem;">${zones[zi] != null ? zones[zi] + '℃' : '-'}</td>`
                ).join('');
                const rCol = r.result === 'OK' || r.result === '합격' ? 'badge-success' : r.result === 'NG' || r.result === '불합격' ? 'badge-danger' : 'badge-outline';
                return `<tr>
                    <td>${logs.length-i}</td><td>${r.date}</td><td>${_esc(r.checker||'-')}</td>
                    ${zoneCells}
                    <td><span class="badge ${rCol}" style="font-size:.72rem;">${r.result||'-'}</span></td>
                    <td style="font-size:.78rem;">${_esc(r.action||'-')}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openSQLogModal('${r.id}')">수정</button>
                        <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeSQLog('${r.id}')">삭제</button>
                    </td>
                </tr>`;
            }).join('');

        const zn = Number(std.zoneCount) || 6;
        const zoneThs = Array.from({length:zn}, (_,i) => `<th>Zone${i+1}(℃)</th>`).join('');
        el.innerHTML = _sqLayout(stdHTML, `
        <div class="data-table-wrapper">
            <table class="data-table">
                <thead><tr><th>No</th><th>측정일</th><th>측정자</th>${zoneThs}<th>판정</th><th>특이사항</th><th>작업</th></tr></thead>
                <tbody>${logRows}</tbody>
            </table>
        </div>`);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-6: Jig/행거 관리
    // ════════════════════════════════════════════════════════════
    function _renderSQJig(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('도료박리 주기', std.strippingCycle, '일')}
            ${_stdRow('박리 방법', std.strippingMethod, '')}
            ${_stdRow('로딩 표준 설정 여부', std.loadingStd, '')}
            ${_stdRow('OIL 받이 설치 여부', std.oilTray, '')}
            ${_stdRow('전용 Jig 설정 여부', std.dedicated, '')}
        </div>
        ${std.jigList ? `<div style="margin-top:8px;"><span style="font-size:.82rem;font-weight:600;">등록 Jig 목록:</span>
            <div style="font-size:.8rem;color:var(--text-secondary);margin-top:2px;">${_esc(std.jigList)}</div></div>` : ''}`;

        const logHTML = _sqLogTable(logs, [
            {k:'jigName',    label:'Jig명/번호',  w:'16%'},
            {k:'workType',   label:'작업구분',    w:'13%', badge:true},
            {k:'condition',  label:'상태',        w:'10%', badge:true},
            {k:'worker',     label:'작업자',      w:'9%'},
            {k:'nextStrip',  label:'다음박리예정', w:'12%'},
            {k:'result',     label:'판정',        w:'7%', badge:true},
            {k:'action',     label:'특이사항',    w:'20%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ════════════════════════════════════════════════════════════
    // SQ-7: 컨베어 관리
    // ════════════════════════════════════════════════════════════
    function _renderSQConveyor(el) {
        const std  = _getSQStd() || {};
        const logs = _getSQLogs();
        const stdHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">
            ${_stdRow('규정 속도(RPM)', std.stdRpm, 'RPM')}
            ${_stdRow('규정 속도(m/min)', std.stdMpm, 'm/min')}
            ${_stdRow('허용 공차', std.tolerance, '%')}
            ${_stdRow('시건장치(RPM 컨트롤)', std.keylock, '')}
            ${_stdRow('측정 주기', std.measCycle, '회/일')}
        </div>`;

        const logHTML = _sqLogTable(logs, [
            {k:'measTime',  label:'측정시간',  w:'9%'},
            {k:'measRpm',   label:'측정RPM',   w:'10%', num:true},
            {k:'stdRpm',    label:'규정RPM',   w:'10%', num:true},
            {k:'deviation', label:'편차(%)',   w:'9%',  num:true},
            {k:'keylockOk', label:'시건장치',  w:'9%',  badge:true},
            {k:'result',    label:'판정',      w:'7%',  badge:true},
            {k:'checker',   label:'점검자',    w:'8%'},
            {k:'action',    label:'조치내용',  w:'19%'}
        ]);
        el.innerHTML = _sqLayout(stdHTML, logHTML);
    }

    // ── SQ 공통 로그 테이블 빌더 ─────────────────────────────────
    function _sqLogTable(logs, cols) {
        const thRow = `<th>No</th><th>점검일</th>${cols.map(c=>`<th>${c.label}</th>`).join('')}<th>작업</th>`;
        const rows  = logs.length === 0
            ? `<tr><td colspan="${cols.length+3}" style="text-align:center;padding:24px;color:var(--text-muted);">기록이 없습니다.</td></tr>`
            : logs.map((r,i) => {
                const cells = cols.map(c => {
                    const v = r[c.k];
                    if (c.badge) {
                        const col = (v==='OK'||v==='정상'||v==='합격'||v==='완료'||v==='설치') ? 'badge-success'
                                  : (v==='NG'||v==='이상'||v==='불합격') ? 'badge-danger'
                                  : (v==='조치중'||v==='개방') ? 'badge-warning' : 'badge-outline';
                        return `<td><span class="badge ${col}" style="font-size:.72rem;">${v != null ? _esc(String(v)) : '-'}</span></td>`;
                    }
                    if (c.num) return `<td style="text-align:right;font-size:.82rem;">${v != null ? v : '-'}</td>`;
                    return `<td style="font-size:.82rem;">${v != null ? _esc(String(v)) : '-'}</td>`;
                }).join('');
                return `<tr><td>${logs.length-i}</td><td>${r.date}</td>${cells}
                    <td style="white-space:nowrap;">
                        <button class="btn btn-xs btn-outline" onclick="ProdEquipmentModule.openSQLogModal('${r.id}')">수정</button>
                        <button class="btn btn-xs btn-danger"  onclick="ProdEquipmentModule.removeSQLog('${r.id}')">삭제</button>
                    </td></tr>`;
            }).join('');
        return `<div class="data-table-wrapper">
            <table class="data-table"><thead><tr>${thRow}</tr></thead><tbody>${rows}</tbody></table>
        </div>`;
    }

    // ════════════════════════════════════════════════════════════
    // SQ 관리기준 모달
    // ════════════════════════════════════════════════════════════
    function openSQStdModal() {
        const std = _getSQStd() || {};
        const cat = _sqCatInfo();
        UIUtils.showModal(
            `관리기준 설정 — ${cat ? cat.label : ''} (${_line})`,
            _sqStdForm(std),
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="ProdEquipmentModule.saveSQStd()">저장</button>`, 'lg');
    }

    function _sqStdForm(std) {
        std = std || {};
        switch (_sqTab) {
            case 'daily': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">게이지류 상한 기준값</label>
                        <input class="form-input" id="sqsf_gaugeMax" value="${_esc(std.gaugeMax||'')}"></div>
                    <div class="form-group"><label class="form-label">게이지류 하한 기준값</label>
                        <input class="form-input" id="sqsf_gaugeMin" value="${_esc(std.gaugeMin||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">F/P 경고등/알람 판정 기준</label>
                        <input class="form-input" id="sqsf_alarmStd" value="${_esc(std.alarmStd||'')}"></div>
                    <div class="form-group"><label class="form-label">시건장치/KEY-LOCK 적용 여부</label>
                        <select class="form-select" id="sqsf_keylock">
                            ${['적용','미적용','일부적용'].map(v=>`<option ${(std.keylock||'')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">OK/NG 마스터 점검 방법</label>
                        <input class="form-input" id="sqsf_masterMethod" value="${_esc(std.masterMethod||'')}"></div>
                    <div class="form-group"><label class="form-label">캘리브레이션 주기 (일)</label>
                        <input type="number" class="form-input" id="sqsf_calibCycle" value="${std.calibCycle||''}"></div>
                </div>
                <div class="form-group"><label class="form-label">비고</label>
                    <textarea class="form-textarea" id="sqsf_note" rows="2">${_esc(std.note||'')}</textarea></div>`;

            case 'booth': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">온도 하한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_tempMin" value="${std.tempMin??''}"></div>
                    <div class="form-group"><label class="form-label">온도 상한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_tempMax" value="${std.tempMax??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">습도 하한 (%RH)</label>
                        <input type="number" class="form-input" id="sqsf_humMin" value="${std.humMin??''}"></div>
                    <div class="form-group"><label class="form-label">습도 상한 (%RH)</label>
                        <input type="number" class="form-input" id="sqsf_humMax" value="${std.humMax??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Air Balance 기준 (Pa)</label>
                        <input type="number" class="form-input" id="sqsf_airBalance" value="${std.airBalance??''}"></div>
                    <div class="form-group"><label class="form-label">측정 주기 (회/일)</label>
                        <input type="number" class="form-input" id="sqsf_measCycle" value="${std.measCycle||''}"></div>
                </div>`;

            case 'boothenv': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">청소 주기 (일)</label>
                        <input type="number" class="form-input" id="sqsf_cleanCycle" value="${std.cleanCycle||''}"></div>
                    <div class="form-group"><label class="form-label">청소 방법</label>
                        <input class="form-input" id="sqsf_cleanMethod" value="${_esc(std.cleanMethod||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">필터 교환 주기 (일)</label>
                        <input type="number" class="form-input" id="sqsf_filterCycle" value="${std.filterCycle||''}"></div>
                    <div class="form-group"><label class="form-label">필터 종류</label>
                        <input class="form-input" id="sqsf_filterType" value="${_esc(std.filterType||'')}"></div>
                </div>
                <div class="form-group"><label class="form-label">자체관리기준 수립 여부</label>
                    <select class="form-select" id="sqsf_ownStd">
                        ${['수립','미수립','검토중'].map(v=>`<option ${(std.ownStd||'')===v?'selected':''}>${v}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">비고</label>
                    <textarea class="form-textarea" id="sqsf_note" rows="2">${_esc(std.note||'')}</textarea></div>`;

            case 'oven': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">피도물 재질</label>
                        <input class="form-input" id="sqsf_material" value="${_esc(std.material||'')}"></div>
                    <div class="form-group"><label class="form-label">건조 시간 기준 (min)</label>
                        <input type="number" class="form-input" id="sqsf_dryTime" value="${std.dryTime||''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">관리 온도 하한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_tempMin" value="${std.tempMin??''}"></div>
                    <div class="form-group"><label class="form-label">관리 온도 상한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_tempMax" value="${std.tempMax??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">경보 설정값 상한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_alarmTemp" value="${std.alarmTemp||''}"></div>
                    <div class="form-group"><label class="form-label">열풍필터 교환 주기 (일)</label>
                        <input type="number" class="form-input" id="sqsf_filterCycle" value="${std.filterCycle||''}"></div>
                </div>
                <div class="form-group"><label class="form-label">경보장치 설치 여부</label>
                    <select class="form-select" id="sqsf_alarmInstalled">
                        ${['설치','미설치'].map(v=>`<option ${(std.alarmInstalled||'')===v?'selected':''}>${v}</option>`).join('')}
                    </select></div>`;

            case 'ovenprofile': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">측정 주기</label>
                        <input class="form-input" id="sqsf_measCycle" value="${_esc(std.measCycle||'1회/분기')}" placeholder="예: 1회/분기"></div>
                    <div class="form-group"><label class="form-label">측정 Zone 수</label>
                        <input type="number" class="form-input" id="sqsf_zoneCount" value="${std.zoneCount||6}" min="1" max="12"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Zone별 기준 하한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_zoneMin" value="${std.zoneMin??''}"></div>
                    <div class="form-group"><label class="form-label">Zone별 기준 상한 (℃)</label>
                        <input type="number" class="form-input" id="sqsf_zoneMax" value="${std.zoneMax??''}"></div>
                </div>`;

            case 'jig': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">도료박리 주기 (일)</label>
                        <input type="number" class="form-input" id="sqsf_strippingCycle" value="${std.strippingCycle||''}"></div>
                    <div class="form-group"><label class="form-label">박리 방법</label>
                        <input class="form-input" id="sqsf_strippingMethod" value="${_esc(std.strippingMethod||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">OIL 받이 설치 여부</label>
                        <select class="form-select" id="sqsf_oilTray">
                            ${['설치','미설치','해당없음'].map(v=>`<option ${(std.oilTray||'')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">전용 Jig 설정 여부</label>
                        <select class="form-select" id="sqsf_dedicated">
                            ${['전용설정','공용','미설정'].map(v=>`<option ${(std.dedicated||'')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-group"><label class="form-label">로딩 표준 수립 여부</label>
                    <select class="form-select" id="sqsf_loadingStd">
                        ${['수립','미수립'].map(v=>`<option ${(std.loadingStd||'')===v?'selected':''}>${v}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">Jig 목록 (쉼표로 구분)</label>
                    <textarea class="form-textarea" id="sqsf_jigList" rows="2">${_esc(std.jigList||'')}</textarea></div>`;

            case 'conveyor': return `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">규정 속도 (RPM)</label>
                        <input type="number" class="form-input" id="sqsf_stdRpm" value="${std.stdRpm||''}"></div>
                    <div class="form-group"><label class="form-label">규정 속도 (m/min)</label>
                        <input type="number" step="0.1" class="form-input" id="sqsf_stdMpm" value="${std.stdMpm||''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">허용 공차 (%)</label>
                        <input type="number" step="0.1" class="form-input" id="sqsf_tolerance" value="${std.tolerance||''}"></div>
                    <div class="form-group"><label class="form-label">측정 주기 (회/일)</label>
                        <input type="number" class="form-input" id="sqsf_measCycle" value="${std.measCycle||''}"></div>
                </div>
                <div class="form-group"><label class="form-label">RPM 제어 시건장치 설치 여부</label>
                    <select class="form-select" id="sqsf_keylock">
                        ${['설치','미설치'].map(v=>`<option ${(std.keylock||'')===v?'selected':''}>${v}</option>`).join('')}
                    </select></div>`;

            default: return '<p style="color:var(--text-muted)">기준 항목 없음</p>';
        }
    }

    function _collectSQStd() {
        function g(id) { const el = document.getElementById(id); return el ? el.value : undefined; }
        function n(id) { const v = g(id); return v !== undefined && v !== '' ? Number(v) : undefined; }
        switch (_sqTab) {
            case 'daily':       return { gaugeMax:g('sqsf_gaugeMax'), gaugeMin:g('sqsf_gaugeMin'), alarmStd:g('sqsf_alarmStd'), keylock:g('sqsf_keylock'), masterMethod:g('sqsf_masterMethod'), calibCycle:n('sqsf_calibCycle'), note:g('sqsf_note') };
            case 'booth':       return { tempMin:n('sqsf_tempMin'), tempMax:n('sqsf_tempMax'), humMin:n('sqsf_humMin'), humMax:n('sqsf_humMax'), airBalance:n('sqsf_airBalance'), measCycle:n('sqsf_measCycle') };
            case 'boothenv':    return { cleanCycle:n('sqsf_cleanCycle'), cleanMethod:g('sqsf_cleanMethod'), filterCycle:n('sqsf_filterCycle'), filterType:g('sqsf_filterType'), ownStd:g('sqsf_ownStd'), note:g('sqsf_note') };
            case 'oven':        return { material:g('sqsf_material'), dryTime:n('sqsf_dryTime'), tempMin:n('sqsf_tempMin'), tempMax:n('sqsf_tempMax'), alarmTemp:n('sqsf_alarmTemp'), filterCycle:n('sqsf_filterCycle'), alarmInstalled:g('sqsf_alarmInstalled') };
            case 'ovenprofile': return { measCycle:g('sqsf_measCycle'), zoneCount:n('sqsf_zoneCount'), zoneMin:n('sqsf_zoneMin'), zoneMax:n('sqsf_zoneMax') };
            case 'jig':         return { strippingCycle:n('sqsf_strippingCycle'), strippingMethod:g('sqsf_strippingMethod'), oilTray:g('sqsf_oilTray'), dedicated:g('sqsf_dedicated'), loadingStd:g('sqsf_loadingStd'), jigList:g('sqsf_jigList') };
            case 'conveyor':    return { stdRpm:n('sqsf_stdRpm'), stdMpm:n('sqsf_stdMpm'), tolerance:n('sqsf_tolerance'), measCycle:n('sqsf_measCycle'), keylock:g('sqsf_keylock') };
            default:            return {};
        }
    }

    async function saveSQStd() {
        const data = _collectSQStd();
        const key  = _sqStdKey();
        data.lineCategory = key;
        const existing = _getSQStd();
        if (existing) await Storage.update(ST_SQ_STD, existing.id, data);
        else          await Storage.add(ST_SQ_STD, data);
        UIUtils.closeModal();
        UIUtils.toast('관리기준이 저장되었습니다.', 'success');
        _renderSQContent();
    }

    // ════════════════════════════════════════════════════════════
    // SQ 점검 기록 모달
    // ════════════════════════════════════════════════════════════
    function openSQLogModal(id) {
        const r   = id ? Storage.getById(ST_SQ_LOG, id) : null;
        const std = _getSQStd() || {};
        const cat = _sqCatInfo();
        UIUtils.showModal(
            (id ? '기록 수정' : '기록 등록') + ` — ${cat ? cat.label : ''} (${_line})`,
            _sqLogForm(r, std),
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="ProdEquipmentModule.saveSQLog('${id||''}')">저장</button>`, 'lg');
    }

    function _sqCatInfo() {
        return SQ_CATS.find(c => c.k === _sqTab) ||
            (_sqTab === 'ovenprofile' ? { k:'ovenprofile', label:'온도 프로파일' } : null);
    }

    function _sqLogForm(r, std) {
        r = r || {};
        std = std || {};
        const dateInp = `<div class="form-row">
            <div class="form-group"><label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                <input type="date" class="form-input" id="sqlog_date" value="${r.date||UIUtils.today()}"></div>
            <div class="form-group"><label class="form-label">측정/점검 시간</label>
                <input type="time" class="form-input" id="sqlog_measTime" value="${r.measTime||''}"></div>
        </div>`;
        switch (_sqTab) {
            case 'daily': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">설비명</label>
                        <input class="form-input" id="sqlog_equipName" value="${_esc(r.equipName||'')}"></div>
                    <div class="form-group"><label class="form-label">점검 항목</label>
                        <input class="form-input" id="sqlog_checkItem" value="${_esc(r.checkItem||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">실측값</label>
                        <input class="form-input" id="sqlog_measured" value="${_esc(r.measured||'')}"></div>
                    <div class="form-group"><label class="form-label">기준범위</label>
                        <input class="form-input" id="sqlog_stdRange" value="${_esc(r.stdRange||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">경보/알람 정상작동</label>
                        <select class="form-select" id="sqlog_alarmOk">
                            ${['정상','이상','해당없음'].map(v=>`<option ${(r.alarmOk||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">0점조정(캘리브레이션)</label>
                        <select class="form-select" id="sqlog_calTeach">
                            ${['완료','생략','해당없음'].map(v=>`<option ${(r.calTeach||'완료')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['OK','NG','조치완료'].map(v=>`<option ${(r.result||'OK')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">점검자</label>
                        <input class="form-input" id="sqlog_checker" value="${_esc(r.checker||'')}"></div>
                </div>
                <div class="form-group"><label class="form-label">조치내용</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            case 'booth': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">온도 실측 (℃)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_temp" value="${r.temp??''}"></div>
                    <div class="form-group"><label class="form-label">습도 실측 (%RH)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_hum" value="${r.hum??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Air Balance (Pa)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_airBal" value="${r.airBal??''}"></div>
                    <div class="form-group"><label class="form-label">측정자</label>
                        <input class="form-input" id="sqlog_checker" value="${_esc(r.checker||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">온도 판정</label>
                        <select class="form-select" id="sqlog_tempOk">
                            ${['정상','이상'].map(v=>`<option ${(r.tempOk||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">습도 판정</label>
                        <select class="form-select" id="sqlog_humOk">
                            ${['정상','이상'].map(v=>`<option ${(r.humOk||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">종합 판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['OK','NG','조치완료'].map(v=>`<option ${(r.result||'OK')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-group"><label class="form-label">조치내용</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            case 'boothenv': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">작업구분</label>
                        <select class="form-select" id="sqlog_workType">
                            ${['청소','필터교환','청소+필터교환','기타'].map(v=>`<option ${(r.workType||'청소')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">필터 위치</label>
                        <input class="form-input" id="sqlog_filterPos" value="${_esc(r.filterPos||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">작업자</label>
                        <input class="form-input" id="sqlog_worker" value="${_esc(r.worker||'')}"></div>
                    <div class="form-group"><label class="form-label">다음 예정일</label>
                        <input type="date" class="form-input" id="sqlog_nextDate" value="${r.nextDate||''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="sqlog_result">
                            ${['완료','불완전','보류'].map(v=>`<option ${(r.result||'완료')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-group"><label class="form-label">특이사항</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            case 'oven': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">타점기록계 온도 (℃)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_recTemp" value="${r.recTemp??''}"></div>
                    <div class="form-group"><label class="form-label">편차 (±℃)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_deviation" value="${r.deviation??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">경보 작동 여부</label>
                        <select class="form-select" id="sqlog_alarmTrig">
                            ${['정상(미작동)','작동','해당없음'].map(v=>`<option ${(r.alarmTrig||'정상(미작동)')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">필터 점검</label>
                        <select class="form-select" id="sqlog_filterChk">
                            ${['정상','교환필요','교환완료'].map(v=>`<option ${(r.filterChk||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['OK','NG','조치완료'].map(v=>`<option ${(r.result||'OK')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">점검자</label>
                        <input class="form-input" id="sqlog_checker" value="${_esc(r.checker||'')}"></div>
                </div>
                <div class="form-group"><label class="form-label">조치내용</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            case 'ovenprofile': {
                const std2 = _getSQStd() || {};
                const zn   = Number(std2.zoneCount) || 6;
                const zones = Array.isArray(r.zones) ? r.zones : [];
                const zoneFields = Array.from({length:zn}, (_,i) => `
                    <div class="form-group">
                        <label class="form-label">Zone${i+1} (℃)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_zone_${i}" value="${zones[i]??''}">
                    </div>`).join('');
                return dateInp + `
                <div class="form-group"><label class="form-label">측정자</label>
                    <input class="form-input" id="sqlog_checker" value="${_esc(r.checker||'')}"></div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0;">${zoneFields}</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['합격','불합격','조건합격'].map(v=>`<option ${(r.result||'합격')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-group"><label class="form-label">특이사항</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;
            }

            case 'jig': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Jig명/번호</label>
                        <input class="form-input" id="sqlog_jigName" value="${_esc(r.jigName||'')}"></div>
                    <div class="form-group"><label class="form-label">작업구분</label>
                        <select class="form-select" id="sqlog_workType">
                            ${['도료박리','일상점검','수리','교체','기타'].map(v=>`<option ${(r.workType||'도료박리')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="sqlog_condition">
                            ${['정상','이상','교체필요'].map(v=>`<option ${(r.condition||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">작업자</label>
                        <input class="form-input" id="sqlog_worker" value="${_esc(r.worker||'')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">다음 박리 예정일</label>
                        <input type="date" class="form-input" id="sqlog_nextStrip" value="${r.nextStrip||''}"></div>
                    <div class="form-group"><label class="form-label">판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['정상','이상','조치완료'].map(v=>`<option ${(r.result||'정상')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-group"><label class="form-label">특이사항</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            case 'conveyor': return dateInp + `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">측정 RPM</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_measRpm" value="${r.measRpm??''}"></div>
                    <div class="form-group"><label class="form-label">규정 RPM</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_stdRpm" value="${r.stdRpm??std.stdRpm??''}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">편차 (%)</label>
                        <input type="number" step="0.1" class="form-input" id="sqlog_deviation" value="${r.deviation??''}"></div>
                    <div class="form-group"><label class="form-label">시건장치 상태</label>
                        <select class="form-select" id="sqlog_keylockOk">
                            ${['설치(정상)','미설치','이상'].map(v=>`<option ${(r.keylockOk||'설치(정상)')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">판정</label>
                        <select class="form-select" id="sqlog_result">
                            ${['OK','NG','조치완료'].map(v=>`<option ${(r.result||'OK')===v?'selected':''}>${v}</option>`).join('')}
                        </select></div>
                    <div class="form-group"><label class="form-label">점검자</label>
                        <input class="form-input" id="sqlog_checker" value="${_esc(r.checker||'')}"></div>
                </div>
                <div class="form-group"><label class="form-label">조치내용</label>
                    <textarea class="form-textarea" id="sqlog_action" rows="2">${_esc(r.action||'')}</textarea></div>`;

            default: return '<p>해당 카테고리 입력 양식 없음</p>';
        }
    }

    function _collectSQLog() {
        function g(id) { const el=document.getElementById(id); return el?el.value:undefined; }
        function n(id) { const v=g(id); return v!==undefined&&v!==''?Number(v):undefined; }
        const base = { lineCategory:_sqStdKey(), date:g('sqlog_date'), measTime:g('sqlog_measTime') };
        switch (_sqTab) {
            case 'daily':       return {...base, equipName:g('sqlog_equipName'), checkItem:g('sqlog_checkItem'), measured:g('sqlog_measured'), stdRange:g('sqlog_stdRange'), alarmOk:g('sqlog_alarmOk'), calTeach:g('sqlog_calTeach'), result:g('sqlog_result'), checker:g('sqlog_checker'), action:g('sqlog_action') };
            case 'booth':       return {...base, temp:n('sqlog_temp'), hum:n('sqlog_hum'), airBal:n('sqlog_airBal'), checker:g('sqlog_checker'), tempOk:g('sqlog_tempOk'), humOk:g('sqlog_humOk'), result:g('sqlog_result'), action:g('sqlog_action') };
            case 'boothenv':    return {...base, workType:g('sqlog_workType'), filterPos:g('sqlog_filterPos'), worker:g('sqlog_worker'), nextDate:g('sqlog_nextDate'), result:g('sqlog_result'), action:g('sqlog_action') };
            case 'oven':        return {...base, recTemp:n('sqlog_recTemp'), deviation:n('sqlog_deviation'), alarmTrig:g('sqlog_alarmTrig'), filterChk:g('sqlog_filterChk'), result:g('sqlog_result'), checker:g('sqlog_checker'), action:g('sqlog_action') };
            case 'ovenprofile': {
                const std2 = _getSQStd() || {};
                const zn = Number(std2.zoneCount) || 6;
                const zones = Array.from({length:zn}, (_,i) => { const v=n('sqlog_zone_'+i); return v!=null?v:null; });
                return {...base, checker:g('sqlog_checker'), zones, result:g('sqlog_result'), action:g('sqlog_action') };
            }
            case 'jig':         return {...base, jigName:g('sqlog_jigName'), workType:g('sqlog_workType'), condition:g('sqlog_condition'), worker:g('sqlog_worker'), nextStrip:g('sqlog_nextStrip'), result:g('sqlog_result'), action:g('sqlog_action') };
            case 'conveyor':    return {...base, measRpm:n('sqlog_measRpm'), stdRpm:n('sqlog_stdRpm'), deviation:n('sqlog_deviation'), keylockOk:g('sqlog_keylockOk'), result:g('sqlog_result'), checker:g('sqlog_checker'), action:g('sqlog_action') };
            default:            return base;
        }
    }

    async function saveSQLog(id) {
        const data = _collectSQLog();
        if (!data.date) { UIUtils.toast('점검일을 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(ST_SQ_LOG, id, data);
        else    await Storage.add(ST_SQ_LOG, data);
        UIUtils.closeModal();
        _renderSQContent();
    }

    function removeSQLog(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(ST_SQ_LOG, id);
            _renderSQContent();
        });
    }

    // ── 유틸 ─────────────────────────────────────────────────────
    function _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return {
        init,
        render,
        // 모드 전환
        switchMode,
        switchLine,
        focusProcess,
        renderIllumination,
        openIlluminationModal,
        saveIllumination,
        removeIllumination,
        exportIllumination,
        switchConveyorLine,
        recalcConveyor,
        saveConveyorStandard,
        exportConveyor,
        switchMaintenanceLine,
        renderMaintenance,
        toggleFProof,
        renderFProof,
        exportFProof,
        openAirFilterModal,
        saveAirFilter,
        removeAirFilter,
        exportAirFilter,
        renderAirFilter,
        openSupplyFilterModal,
        saveSupplyFilter,
        removeSupplyFilter,
        exportSupplyFilter,
        renderSupplyFilter,
        openDryerCleanModal,
        saveDryerClean,
        removeDryerClean,
        exportDryerClean,
        renderDryerClean,
        renderTemperatureProfile: _renderTemperatureProfile,
        openTempProfileModal,
        saveTempProfile,
        removeTempProfile,
        previewTempProfileImage,
        handleTempProfilePaste,
        handleTempProfileFile,
        exportTemperatureProfile,
        // 설비 일반관리
        selectEquip,
        switchSubTab,
        openEquipAddModal,
        editEquip,
        saveEquip,
        deleteEquip,
        openSpareModal,
        saveSpare,
        removeSpare,
        openCheckItemModal,
        saveCheckItem,
        removeCheckItem,
        openCheckRecModal,
        saveCheckRec,
        removeCheckRec,
        _onCheckSel,
        openIssueModal,
        saveIssue,
        removeIssue,
        openDowntimeModal,
        saveDowntime,
        removeDowntime,
        _calcDt,
        // 온도 프로파일
        switchSQTab,
        openSQStdModal,
        saveSQStd,
        openSQLogModal,
        saveSQLog,
        removeSQLog
    };
})();


/**
 * 6) 한도 견본 (LimitSamplesModule)
 *    마스터 대장 / 한도견본 대장, 차종별 목록 관리
 */
var LimitSamplesModule = (function() {
    const STORE = DB.STORES.PROD_LIMIT_SAMPLES;
    let _tab = 'master';
    let _car = '';

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="LimitSamplesModule.openModal()">
                        <span class="material-symbols-outlined">add</span>등록
                    </button>
                </div>
            </div>

            <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;width:fit-content;">
                ${[
                    ['master', 'verified', '마스터 대장'],
                    ['limit', 'rule', '한도견본 대장']
                ].map(([k, icon, label], idx) => `
                    <button id="limitTab_${k}" onclick="LimitSamplesModule.switchTab('${k}')"
                        style="padding:9px 20px;border:none;${idx ? 'border-left:1px solid var(--border-color);' : ''}cursor:pointer;font-size:.875rem;
                               display:flex;align-items:center;gap:6px;background:${_tab===k?'var(--accent-blue)':'var(--bg-secondary)'};
                               color:${_tab===k?'#fff':'var(--text-secondary)'};font-weight:${_tab===k?'700':'400'};">
                        <span class="material-symbols-outlined" style="font-size:16px;">${icon}</span>${label}
                    </button>`).join('')}
            </div>

            <div class="filter-bar" style="gap:10px;flex-wrap:wrap;">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="limitCarFilter" onchange="LimitSamplesModule.filter()" style="min-width:160px;">
                        <option value="">전체 차종</option>
                        ${_carOptions(_car)}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">상태</label>
                    <select class="form-select" id="limitStatusFilter" onchange="LimitSamplesModule.filter()" style="min-width:130px;">
                        <option value="">전체 상태</option>
                        ${['사용중','대기','교체필요','폐기','분실'].map(s => `<option>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="flex:1;min-width:220px;">
                    <label class="form-label">검색</label>
                    <input class="form-input" id="limitSearch" oninput="LimitSamplesModule.filter()" placeholder="품명, 견본번호, 불량유형, 보관위치">
                </div>
            </div>

            <div id="limitStats" class="stat-cards" style="margin-bottom:16px;"></div>
            <div id="limitList"></div>
        </div>`;
        filter();
    }

    function switchTab(tab) {
        _tab = tab;
        render(document.getElementById('contentArea'));
    }

    function filter() {
        _car = document.getElementById('limitCarFilter')?.value || _car || '';
        _renderStats();
        _renderList();
    }

    function _allRows() {
        return (Storage.getAll(STORE) || []).filter(r => (r.ledgerType || 'master') === _tab);
    }

    function _filteredRows() {
        const car = document.getElementById('limitCarFilter')?.value || '';
        const status = document.getElementById('limitStatusFilter')?.value || '';
        const q = (document.getElementById('limitSearch')?.value || '').trim().toLowerCase();
        return _allRows().filter(r => {
            if (car && r.carModel !== car) return false;
            if (status && r.status !== status) return false;
            if (q) {
                const hay = [r.carModel, r.partName, r.sampleNo, r.defectType, r.location, r.owner, r.note].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        }).sort((a,b) => (a.carModel||'').localeCompare(b.carModel||'', 'ko') || (a.partName||'').localeCompare(b.partName||'', 'ko') || (a.sampleNo||'').localeCompare(b.sampleNo||'', 'ko'));
    }

    function _renderStats() {
        const rows = _filteredRows();
        const cars = new Set(rows.map(r => r.carModel).filter(Boolean));
        const active = rows.filter(r => (r.status || '사용중') === '사용중').length;
        const replace = rows.filter(r => r.status === '교체필요').length;
        const expired = rows.filter(r => r.expireDate && r.expireDate < UIUtils.today()).length;
        const el = document.getElementById('limitStats');
        if (!el) return;
        el.innerHTML = [
            ['차종', cars.size, 'directions_car', 'blue'],
            ['등록 견본', rows.length, 'photo_library', 'green'],
            ['사용중', active, 'check_circle', 'cyan'],
            ['교체/만료', replace + expired, 'warning', 'orange']
        ].map(([label, val, icon, color]) => `
            <div class="stat-card ${color}">
                <div class="stat-card-icon ${color}"><span class="material-symbols-outlined">${icon}</span></div>
                <div class="stat-card-value">${val}</div>
                <div class="stat-card-label">${label}</div>
            </div>`).join('');
    }

    function _renderList() {
        const rows = _filteredRows();
        const el = document.getElementById('limitList');
        if (!el) return;
        if (!rows.length) {
            el.innerHTML = `<div class="card" style="padding:48px;text-align:center;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:42px;display:block;margin-bottom:8px;">inventory_2</span>
                등록된 ${_tab === 'master' ? '마스터' : '한도견본'}이 없습니다.
            </div>`;
            return;
        }
        const groups = {};
        rows.forEach(r => {
            const key = r.carModel || '차종 미지정';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        el.innerHTML = Object.keys(groups).map(car => `
            <div class="card" style="overflow:hidden;margin-bottom:14px;">
                <div style="padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);
                            display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">directions_car</span>
                        ${_esc(car)}
                    </h4>
                    <span class="badge badge-outline">${groups[car].length}건</span>
                </div>
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>No</th><th>품명</th><th>견본번호</th><th>${_tab === 'master' ? '마스터 구분' : '한도 기준'}</th>
                            <th>불량/관리항목</th><th>보관위치</th><th>등록일</th><th>유효기간</th><th>상태</th><th>담당</th><th>작업</th>
                        </tr></thead>
                        <tbody>
                            ${groups[car].map((r,i) => _rowHtml(r, i + 1)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`).join('');
    }

    function _rowHtml(r, no) {
        const expired = r.expireDate && r.expireDate < UIUtils.today();
        const st = expired ? '만료' : (r.status || '사용중');
        const badge = st === '사용중' ? 'badge-success' : st === '대기' ? 'badge-outline' : st === '만료' || st === '교체필요' ? 'badge-warning' : 'badge-danger';
        return `<tr>
            <td>${no}</td>
            <td style="font-weight:700;">${_esc(r.partName || '')}</td>
            <td style="font-family:monospace;">${_esc(r.sampleNo || '')}</td>
            <td>${_esc(r.sampleType || r.limitLevel || '')}</td>
            <td>${_esc(r.defectType || '')}</td>
            <td>${_esc(r.location || '')}</td>
            <td>${_esc(r.date || '')}</td>
            <td>${_esc(r.expireDate || '')}</td>
            <td><span class="badge ${badge}">${st}</span></td>
            <td>${_esc(r.owner || '')}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-xs btn-outline" onclick="LimitSamplesModule.openModal('${r.id}')">수정</button>
                <button class="btn btn-xs btn-danger" onclick="LimitSamplesModule.remove('${r.id}')">삭제</button>
            </td>
        </tr>`;
    }

    function openModal(id) {
        const r = id ? Storage.getById(STORE, id) : { ledgerType:_tab, status:'사용중', date:UIUtils.today() };
        UIUtils.showModal(id ? '한도 견본 수정' : '한도 견본 등록', _form(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="LimitSamplesModule.save('${id || ''}')">저장</button>
        `, 'lg');
    }

    function _form(r) {
        r = r || {};
        return `
        <div class="form-row">
            <div class="form-group"><label class="form-label">대장 구분</label>
                <select class="form-select" id="lsLedgerType">
                    <option value="master" ${(r.ledgerType||_tab)==='master'?'selected':''}>마스터 대장</option>
                    <option value="limit" ${(r.ledgerType||_tab)==='limit'?'selected':''}>한도견본 대장</option>
                </select></div>
            <div class="form-group"><label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                <input class="form-input" id="lsCarModel" value="${_esc(r.carModel || '')}" placeholder="예: GN7, SX2"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                <input class="form-input" id="lsPartName" value="${_esc(r.partName || '')}"></div>
            <div class="form-group"><label class="form-label">견본번호</label>
                <input class="form-input" id="lsSampleNo" value="${_esc(r.sampleNo || '')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">마스터/한도 구분</label>
                <input class="form-input" id="lsSampleType" value="${_esc(r.sampleType || r.limitLevel || '')}" placeholder="예: OK MASTER, 상한/하한, 외관 한도"></div>
            <div class="form-group"><label class="form-label">불량/관리항목</label>
                <input class="form-input" id="lsDefectType" value="${_esc(r.defectType || '')}" placeholder="예: 이색, 찍힘, 도막두께"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">등록일</label>
                <input type="date" class="form-input" id="lsDate" value="${r.date || UIUtils.today()}"></div>
            <div class="form-group"><label class="form-label">유효기간</label>
                <input type="date" class="form-input" id="lsExpireDate" value="${r.expireDate || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">보관위치</label>
                <input class="form-input" id="lsLocation" value="${_esc(r.location || '')}"></div>
            <div class="form-group"><label class="form-label">상태</label>
                <select class="form-select" id="lsStatus">
                    ${['사용중','대기','교체필요','폐기','분실'].map(s => `<option ${(r.status||'사용중')===s?'selected':''}>${s}</option>`).join('')}
                </select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">담당자</label>
                <input class="form-input" id="lsOwner" value="${_esc(r.owner || '')}"></div>
            <div class="form-group"><label class="form-label">승인자</label>
                <input class="form-input" id="lsApprover" value="${_esc(r.approver || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label>
            <textarea class="form-textarea" id="lsNote" rows="3">${_esc(r.note || '')}</textarea></div>`;
    }

    function _collect() {
        const g = id => document.getElementById(id)?.value.trim() || '';
        return {
            ledgerType: g('lsLedgerType') || _tab,
            carModel: g('lsCarModel'),
            partName: g('lsPartName'),
            sampleNo: g('lsSampleNo'),
            sampleType: g('lsSampleType'),
            limitLevel: g('lsSampleType'),
            defectType: g('lsDefectType'),
            date: g('lsDate') || UIUtils.today(),
            expireDate: g('lsExpireDate'),
            location: g('lsLocation'),
            status: g('lsStatus') || '사용중',
            owner: g('lsOwner'),
            approver: g('lsApprover'),
            note: g('lsNote')
        };
    }

    async function save(id) {
        const data = _collect();
        if (!data.carModel || !data.partName) {
            UIUtils.toast('차종과 품명을 입력하세요.', 'warning');
            return;
        }
        if (id) await Storage.update(STORE, id, data);
        else await Storage.add(STORE, data);
        _tab = data.ledgerType;
        _car = data.carModel;
        UIUtils.closeModal();
        UIUtils.toast('저장되었습니다.', 'success');
        render(document.getElementById('contentArea'));
    }

    function remove(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            filter();
        });
    }

    function _carOptions(selected) {
        const cars = new Set();
        (Storage.getAll(DB.STORES.PRODUCTS) || []).forEach(p => {
            [p.carModel, p.model, p.car, p.vehicle].forEach(v => { if (v) cars.add(v); });
        });
        (Storage.getAll(STORE) || []).forEach(r => { if (r.carModel) cars.add(r.carModel); });
        return [...cars].sort((a,b)=>a.localeCompare(b,'ko')).map(c => `<option value="${_esc(c)}" ${c===selected?'selected':''}>${_esc(c)}</option>`).join('');
    }

    function exportData() {
        const rows = _filteredRows().map(r => [
            r.ledgerType === 'master' ? '마스터 대장' : '한도견본 대장',
            r.carModel || '', r.partName || '', r.sampleNo || '', r.sampleType || r.limitLevel || '',
            r.defectType || '', r.location || '', r.date || '', r.expireDate || '', r.status || '', r.owner || '', r.approver || '', r.note || ''
        ]);
        Storage.exportToCSV(['대장구분','차종','품명','견본번호','구분','불량/관리항목','보관위치','등록일','유효기간','상태','담당자','승인자','비고'], rows, `한도견본_${_tab}`);
    }

    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return { render, switchTab, filter, openModal, save, remove, exportData };
})();


/**
 * 6) 품질 실적 (QualityPerformanceModule)
 *    전년도 실적 대비 목표, 월별 PPM, 워스트 원인분석/개선대책/유효성 평가
 */
var QualityPerformanceModule = (function() {
    const STORE = DB.STORES.PROD_QUALITY_PERFORMANCE;
    const CATS = [
        { k:'process', label:'공정불량', qtyLabel:'생산수량', hint:'재작업 수량 포함' },
        { k:'customer', label:'고객불량', qtyLabel:'납품수량', hint:'고객 클레임/출하 후 불량' },
        { k:'outsourcing', label:'외주불량', qtyLabel:'입고수량', hint:'외주 입고 검사 불량' }
    ];
    const AGGS = [
        { k:'overall', label:'전체' },
        { k:'category', label:'구분별' },
        { k:'process', label:'공정별' },
        { k:'partName', label:'품목별' },
        { k:'defectType', label:'불량 유형별' },
        { k:'line', label:'라인별' }
    ];
    let _agg = 'overall';

    function render(container) {
        const y = new Date().getFullYear();
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-outline" onclick="Router.navigate('painting-quality-performance')"><span class="material-symbols-outlined">lab_profile</span> 도장검사실적</button>
                    <button class="btn btn-secondary" onclick="QualityPerformanceModule.openTargetModal()"><span class="material-symbols-outlined">flag</span> 목표 설정</button>
                    <button class="btn btn-primary" onclick="QualityPerformanceModule.openRecordModal()"><span class="material-symbols-outlined">add</span> 실적 등록</button>
                </div>
            </div>
            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;">
                <div class="form-group"><label class="form-label">년도</label><select class="form-select" id="qperfYear" onchange="QualityPerformanceModule.search()">${Array.from({length:5},(_,i)=>y-2+i).map(v=>`<option value="${v}" ${v===y?'selected':''}>${v}년</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">월</label><select class="form-select" id="qperfMonth" onchange="QualityPerformanceModule.search()"><option value="">전체</option>${Array.from({length:12},(_,i)=>i+1).map(v=>`<option value="${v}">${v}월</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">실적구분</label><select class="form-select" id="qperfCategory" onchange="QualityPerformanceModule.search()"><option value="">전체</option>${CATS.map(c=>`<option value="${c.k}">${c.label}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">집계 기준</label><select class="form-select" id="qperfAgg" onchange="QualityPerformanceModule.switchAgg(this.value)">${AGGS.map(a=>`<option value="${a.k}" ${a.k===_agg?'selected':''}>${a.label}</option>`).join('')}</select></div>
                <div class="form-group" style="align-self:flex-end;"><button class="btn btn-outline" onclick="QualityPerformanceModule.search()"><span class="material-symbols-outlined">search</span> 조회</button></div>
            </div>
            <div id="qperfSummary"></div>
            <div id="qperfAggregate"></div>
            <div id="qperfWorst"></div>
            <div id="qperfRecords"></div>
        </div>`;
        search();
    }

    function _all() { return (Storage.getAll(STORE) || []).filter(r => !r._docKind); }
    function _targets(year) {
        const map = {};
        (Storage.getAll(STORE) || []).filter(r => r._docKind === 'target' && Number(r.year) === Number(year)).forEach(r => { map[r.category] = Number(r.targetPpm) || 0; });
        return map;
    }
    function _targetRows(year) { return (Storage.getAll(STORE) || []).filter(r => r._docKind === 'target' && Number(r.year) === Number(year)); }
    function _catLabel(k) { return (CATS.find(c => c.k === k) || {}).label || k || '-'; }
    function _ppm(defect, input) { return input > 0 ? Math.round((defect / input) * 1000000) : 0; }
    function _fmt(n) { return UIUtils.formatNumber(Math.round(Number(n) || 0)); }
    function _filtered() {
        const year = Number(document.getElementById('qperfYear')?.value) || new Date().getFullYear();
        const month = document.getElementById('qperfMonth')?.value || '';
        const cat = document.getElementById('qperfCategory')?.value || '';
        let data = _all().filter(r => Number(r.year) === year);
        if (month) data = data.filter(r => Number(r.month) === Number(month));
        if (cat) data = data.filter(r => r.category === cat);
        return data;
    }
    function search() { _renderSummary(); _renderAggregate(); _renderWorst(); _renderRecords(); }
    function switchAgg(v) { _agg = v || 'overall'; search(); }
    function _sum(data, category) {
        const rows = category ? data.filter(r => r.category === category) : data;
        const input = rows.reduce((s,r)=>s+(Number(r.inputQty)||0),0);
        const defect = rows.reduce((s,r)=>s+(Number(r.defectQty)||0)+(r.category === 'process' ? (Number(r.reworkQty)||0) : 0),0);
        return { input, defect, ppm:_ppm(defect, input) };
    }
    function _renderSummary() {
        const el = document.getElementById('qperfSummary'); if (!el) return;
        const year = Number(document.getElementById('qperfYear')?.value) || new Date().getFullYear();
        const data = _filtered(), targets = _targets(year);
        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;">
            ${CATS.map(c => {
                const s = _sum(data, c.k), target = targets[c.k] || 0, miss = target > 0 && s.ppm > target;
                return `<div class="card" style="padding:14px 16px;">
                    <div style="display:flex;justify-content:space-between;gap:8px;"><div><div style="font-size:.8rem;color:var(--text-muted);">${c.label}</div><div style="font-size:1.55rem;font-weight:900;">${_fmt(s.ppm)} PPM</div><div style="font-size:.74rem;color:var(--text-muted);">${c.qtyLabel} ${_fmt(s.input)} / 불량 ${_fmt(s.defect)}</div></div><span class="badge ${target ? (miss ? 'badge-danger' : 'badge-success') : 'badge-outline'}">${target ? (miss ? '목표미달' : '목표달성') : '목표없음'}</span></div>
                    <div style="margin-top:10px;font-size:.78rem;color:var(--text-secondary);">목표: ${target ? _fmt(target) + ' PPM 이하' : '미설정'} · ${c.hint}</div>
                </div>`;
            }).join('')}
        </div>`;
    }
    function _groupKey(r) { return _agg === 'overall' ? '전체' : _agg === 'category' ? _catLabel(r.category) : (r[_agg] || '미지정'); }
    function _groups() {
        const map = {};
        _filtered().forEach(r => {
            const key = _groupKey(r);
            if (!map[key]) map[key] = { key, input:0, defect:0, cats:new Set(), actions:0, rows:0 };
            map[key].input += Number(r.inputQty) || 0;
            map[key].defect += (Number(r.defectQty)||0) + (r.category === 'process' ? (Number(r.reworkQty)||0) : 0);
            map[key].cats.add(r.category);
            if (r.rootCause || r.correctiveAction || r.effectiveness) map[key].actions++;
            map[key].rows++;
        });
        return Object.values(map).map(g => ({...g, ppm:_ppm(g.defect,g.input)})).sort((a,b)=>b.ppm-a.ppm);
    }
    function _renderAggregate() {
        const el = document.getElementById('qperfAggregate'); if (!el) return;
        const targets = _targets(Number(document.getElementById('qperfYear')?.value) || new Date().getFullYear());
        const rows = _groups();
        el.innerHTML = `<div class="card" style="overflow:hidden;margin-bottom:16px;"><div style="padding:12px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;"><h4 style="margin:0;font-size:1rem;">${(AGGS.find(a=>a.k===_agg)||AGGS[0]).label} 집계</h4><span style="font-size:.76rem;color:var(--text-muted);">공정불량은 불량수 + 재작업 수량 기준</span></div><div class="data-table-wrapper"><table class="data-table"><thead><tr><th>집계항목</th><th>구분</th><th>대상수량</th><th>불량수</th><th>PPM</th><th>목표</th><th>상태</th><th>대책 기록</th></tr></thead><tbody>
        ${rows.length ? rows.map(g => {
            const one = g.cats.size === 1 ? Array.from(g.cats)[0] : '', target = one ? (targets[one] || 0) : 0, miss = target > 0 && g.ppm > target;
            return `<tr><td style="font-weight:800;">${_esc(g.key)}</td><td>${Array.from(g.cats).map(_catLabel).join(', ')}</td><td style="text-align:right;">${_fmt(g.input)}</td><td style="text-align:right;">${_fmt(g.defect)}</td><td style="text-align:right;font-weight:900;color:${miss?'var(--accent-red)':'var(--text-primary)'};">${_fmt(g.ppm)}</td><td style="text-align:right;">${target ? _fmt(target) : '-'}</td><td><span class="badge ${target ? (miss ? 'badge-danger':'badge-success') : 'badge-outline'}">${target ? (miss ? '목표미달':'목표달성') : '목표없음'}</span></td><td>${g.actions}/${g.rows}</td></tr>`;
        }).join('') : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted);">집계할 실적이 없습니다.</td></tr>`}
        </tbody></table></div></div>`;
    }
    function _renderWorst() {
        const el = document.getElementById('qperfWorst'); if (!el) return;
        const targets = _targets(Number(document.getElementById('qperfYear')?.value) || new Date().getFullYear());
        const worst = _filtered().map(r => {
            const defect = (Number(r.defectQty)||0) + (r.category === 'process' ? (Number(r.reworkQty)||0) : 0);
            return {...r, calcDefect:defect, ppm:_ppm(defect, Number(r.inputQty)||0), target:targets[r.category] || 0};
        }).filter(r => r.target > 0 && r.ppm > r.target).sort((a,b)=>b.ppm-a.ppm).slice(0,10);
        el.innerHTML = `<div class="card" style="overflow:hidden;margin-bottom:16px;"><div style="padding:12px 16px;border-bottom:1px solid var(--border-color);"><h4 style="margin:0;font-size:1rem;">목표 미달 워스트 및 개선대책</h4><p style="margin:4px 0 0;font-size:.76rem;color:var(--text-muted);">목표 미달 항목은 근본 원인분석, 개선대책, 유효성 평가 기록이 필요합니다.</p></div><div class="data-table-wrapper"><table class="data-table"><thead><tr><th>월</th><th>구분</th><th>공정/라인</th><th>품목</th><th>불량유형</th><th>PPM</th><th>원인분석</th><th>개선대책</th><th>유효성</th><th>작업</th></tr></thead><tbody>
        ${worst.length ? worst.map(r => `<tr><td>${r.month}월</td><td>${_catLabel(r.category)}</td><td>${_esc(r.process||'-')} / ${_esc(r.line||'-')}</td><td>${_esc(r.partName||'-')}</td><td style="font-weight:700;">${_esc(r.defectType||'-')}</td><td style="text-align:right;font-weight:900;color:var(--accent-red);">${_fmt(r.ppm)}</td><td>${r.rootCause ? _esc(r.rootCause) : '<span style="color:var(--accent-red);">미작성</span>'}</td><td>${r.correctiveAction ? _esc(r.correctiveAction) : '<span style="color:var(--accent-red);">미작성</span>'}</td><td>${r.effectiveness ? _esc(r.effectiveness) : '<span style="color:var(--text-muted);">대기</span>'}</td><td><button class="btn btn-xs btn-outline" onclick="QualityPerformanceModule.openActionModal('${_js(r.id)}')">대책</button></td></tr>`).join('') : `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">목표 미달 워스트 항목이 없습니다.</td></tr>`}
        </tbody></table></div></div>`;
    }
    function _renderRecords() {
        const el = document.getElementById('qperfRecords'); if (!el) return;
        const rows = _filtered().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
        el.innerHTML = `<div class="card" style="overflow:hidden;"><div style="padding:12px 16px;border-bottom:1px solid var(--border-color);"><h4 style="margin:0;font-size:1rem;">실적 원장</h4></div><div class="data-table-wrapper"><table class="data-table" style="font-size:.8rem;"><thead><tr><th>실적월</th><th>구분</th><th>공정</th><th>라인</th><th>품목</th><th>불량유형</th><th>대상수량</th><th>불량수</th><th>재작업</th><th>PPM</th><th>작업</th></tr></thead><tbody>
        ${rows.length ? rows.map(r => { const defect = (Number(r.defectQty)||0) + (r.category === 'process' ? (Number(r.reworkQty)||0) : 0); return `<tr><td>${r.year}-${String(r.month).padStart(2,'0')}</td><td>${_catLabel(r.category)}</td><td>${_esc(r.process||'-')}</td><td>${_esc(r.line||'-')}</td><td>${_esc(r.partName||'-')}</td><td>${_esc(r.defectType||'-')}</td><td style="text-align:right;">${_fmt(r.inputQty)}</td><td style="text-align:right;">${_fmt(r.defectQty)}</td><td style="text-align:right;">${r.category === 'process' ? _fmt(r.reworkQty) : '-'}</td><td style="text-align:right;font-weight:800;">${_fmt(_ppm(defect, Number(r.inputQty)||0))}</td><td style="white-space:nowrap;"><button class="btn btn-xs btn-outline" onclick="QualityPerformanceModule.edit('${_js(r.id)}')">수정</button><button class="btn btn-xs btn-danger" onclick="QualityPerformanceModule.remove('${_js(r.id)}')">삭제</button></td></tr>`; }).join('') : `<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--text-muted);">품질 실적 기록이 없습니다.</td></tr>`}
        </tbody></table></div></div>`;
    }
    function openTargetModal() {
        const year = Number(document.getElementById('qperfYear')?.value) || new Date().getFullYear(), targets = _targets(year);
        const prevRows = _all().filter(r => Number(r.year) === year - 1);
        UIUtils.showModal('품질 목표 설정', `<div style="padding:12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:12px;font-size:.82rem;color:var(--text-secondary);">전년도 품질 실적을 기준으로 당해년도 PPM 목표를 설정합니다.</div><div class="form-row"><div class="form-group"><label class="form-label">목표년도</label><input type="number" class="form-input" id="qptYear" value="${year}"></div><div class="form-group"></div></div>${CATS.map(c=>{ const prev = _sum(prevRows, c.k); return `<div class="form-row"><div class="form-group"><label class="form-label">${c.label} 전년도 실적</label><input class="form-input" value="${_fmt(prev.ppm)} PPM" readonly style="background:var(--bg-secondary);"></div><div class="form-group"><label class="form-label">${c.label} 목표 PPM 이하</label><input type="number" min="0" class="form-input qptTarget" data-cat="${c.k}" value="${targets[c.k]||''}"></div></div>`; }).join('')}`, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="QualityPerformanceModule.saveTargets()">저장</button>`, 'lg');
    }
    async function saveTargets() {
        const year = Number(document.getElementById('qptYear').value), existing = _targetRows(year);
        for (const input of document.querySelectorAll('.qptTarget')) {
            const category = input.getAttribute('data-cat'), targetPpm = Number(input.value) || 0, old = existing.find(r => r.category === category);
            const data = { _docKind:'target', date:`${year}-01-01`, year, category, targetPpm };
            if (old) await Storage.update(STORE, old.id, data); else await Storage.add(STORE, data);
        }
        UIUtils.closeModal(); UIUtils.toast('품질 목표가 저장되었습니다.', 'success'); search();
    }
    function _recordForm(d = {}) {
        const now = new Date(), year = d.year || Number(document.getElementById('qperfYear')?.value) || now.getFullYear(), month = d.month || Number(document.getElementById('qperfMonth')?.value) || (now.getMonth()+1), category = d.category || 'process';
        return `<div class="form-row"><div class="form-group"><label class="form-label">년도</label><input type="number" class="form-input" id="qprYear" value="${year}"></div><div class="form-group"><label class="form-label">월</label><select class="form-select" id="qprMonth">${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${m===month?'selected':''}>${m}월</option>`).join('')}</select></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">실적구분 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="qprCategory">${CATS.map(c=>`<option value="${c.k}" ${c.k===category?'selected':''}>${c.label}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">공정</label><input class="form-input" id="qprProcess" value="${_esc(d.process||'')}" placeholder="예: 도장, 레이저, 출하"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">라인</label><input class="form-input" id="qprLine" value="${_esc(d.line||'')}" placeholder="예: A-LINE, B-LINE"></div><div class="form-group"><label class="form-label">품목</label><input class="form-input" id="qprPartName" value="${_esc(d.partName||'')}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">불량 유형</label><input class="form-input" id="qprDefectType" value="${_esc(d.defectType||'')}" placeholder="예: 색차, 찍힘"></div><div class="form-group"><label class="form-label">고객/외주처</label><input class="form-input" id="qprPartner" value="${_esc(d.partner||'')}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">대상수량 <span style="color:var(--accent-red)">*</span></label><input type="number" min="0" class="form-input" id="qprInputQty" value="${d.inputQty ?? ''}"></div><div class="form-group"><label class="form-label">불량수 <span style="color:var(--accent-red)">*</span></label><input type="number" min="0" class="form-input" id="qprDefectQty" value="${d.defectQty ?? ''}"></div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">재작업 수량 (공정불량 포함)</label><input type="number" min="0" class="form-input" id="qprReworkQty" value="${d.reworkQty ?? 0}"></div><div class="form-group"><label class="form-label">담당자</label><input class="form-input" id="qprOwner" value="${_esc(d.owner||'')}"></div></div>
        <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="qprNote" rows="2">${_esc(d.note||'')}</textarea></div>`;
    }
    function _collectRecord() {
        const year = Number(document.getElementById('qprYear').value), month = Number(document.getElementById('qprMonth').value);
        return { date:`${year}-${String(month).padStart(2,'0')}-01`, year, month, category:document.getElementById('qprCategory').value, process:document.getElementById('qprProcess').value.trim(), line:document.getElementById('qprLine').value.trim(), partName:document.getElementById('qprPartName').value.trim(), defectType:document.getElementById('qprDefectType').value.trim(), partner:document.getElementById('qprPartner').value.trim(), inputQty:Number(document.getElementById('qprInputQty').value)||0, defectQty:Number(document.getElementById('qprDefectQty').value)||0, reworkQty:Number(document.getElementById('qprReworkQty').value)||0, owner:document.getElementById('qprOwner').value.trim(), note:document.getElementById('qprNote').value.trim() };
    }
    function openRecordModal() { UIUtils.showModal('품질 실적 등록', _recordForm(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="QualityPerformanceModule.saveNew()">등록</button>`, 'lg'); }
    async function saveNew() { const data = _collectRecord(); if (!data.inputQty && !data.defectQty) { UIUtils.toast('대상수량 또는 불량수를 입력하세요.', 'warning'); return; } await Storage.add(STORE, data); UIUtils.closeModal(); UIUtils.toast('품질 실적이 등록되었습니다.', 'success'); search(); }
    function edit(id) { const d = Storage.getById(STORE, id); if (!d) return; UIUtils.showModal('품질 실적 수정', _recordForm(d), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="QualityPerformanceModule.saveEdit('${_js(id)}')">저장</button>`, 'lg'); }
    async function saveEdit(id) { await Storage.update(STORE, id, _collectRecord()); UIUtils.closeModal(); UIUtils.toast('품질 실적이 수정되었습니다.', 'success'); search(); }
    function remove(id) { UIUtils.confirm('품질 실적 기록을 삭제하시겠습니까?', async () => { await Storage.remove(STORE, id); search(); }); }
    function openActionModal(id) {
        const d = Storage.getById(STORE, id); if (!d) return;
        UIUtils.showModal('워스트 항목 개선대책', `<div style="padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);margin-bottom:12px;font-size:.82rem;">${d.year}-${String(d.month).padStart(2,'0')} · ${_catLabel(d.category)} · ${_esc(d.partName||'-')} · ${_esc(d.defectType||'-')}</div><div class="form-group"><label class="form-label">근본 원인분석</label><textarea class="form-textarea" id="qpaRoot" rows="3">${_esc(d.rootCause||'')}</textarea></div><div class="form-group"><label class="form-label">개선대책</label><textarea class="form-textarea" id="qpaAction" rows="3">${_esc(d.correctiveAction||'')}</textarea></div><div class="form-row"><div class="form-group"><label class="form-label">담당자</label><input class="form-input" id="qpaOwner" value="${_esc(d.actionOwner||d.owner||'')}"></div><div class="form-group"><label class="form-label">완료 예정일</label><input type="date" class="form-input" id="qpaDue" value="${d.dueDate||''}"></div></div><div class="form-group"><label class="form-label">유효성 평가</label><textarea class="form-textarea" id="qpaEffect" rows="3">${_esc(d.effectiveness||'')}</textarea></div><div class="form-group"><label class="form-label">상태</label><select class="form-select" id="qpaStatus">${['대책수립','진행중','유효성 확인','완료'].map(s=>`<option ${((d.actionStatus||'대책수립')===s)?'selected':''}>${s}</option>`).join('')}</select></div>`, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="QualityPerformanceModule.saveAction('${_js(id)}')">저장</button>`, 'lg');
    }
    async function saveAction(id) { await Storage.update(STORE, id, { rootCause:document.getElementById('qpaRoot').value.trim(), correctiveAction:document.getElementById('qpaAction').value.trim(), actionOwner:document.getElementById('qpaOwner').value.trim(), dueDate:document.getElementById('qpaDue').value, effectiveness:document.getElementById('qpaEffect').value.trim(), actionStatus:document.getElementById('qpaStatus').value }); UIUtils.closeModal(); UIUtils.toast('개선대책이 저장되었습니다.', 'success'); search(); }
    function exportData() { const rows = _filtered().map(r => [r.year,r.month,_catLabel(r.category),r.process||'',r.line||'',r.partName||'',r.defectType||'',r.partner||'',r.inputQty||0,r.defectQty||0,r.reworkQty||0,r.rootCause||'',r.correctiveAction||'',r.effectiveness||'',r.actionStatus||'']); Storage.exportToCSV(['년도','월','구분','공정','라인','품목','불량유형','고객/외주처','대상수량','불량수','재작업수','근본원인','개선대책','유효성평가','상태'], rows, '품질실적'); }
    function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function _js(s) { return String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
    return { render, search, switchAgg, openTargetModal, saveTargets, openRecordModal, saveNew, edit, saveEdit, remove, openActionModal, saveAction, exportData };
})();

/**
 * 7) SPC 관리 (ProdSpcModule)
 *    초중종물 관리에 입력된 실측값을 자동으로 읽어 X-bar / R 관리도 작성
 */
var ProdSpcModule = (function() {
    // 데이터 소스: 초중종물 관리 레코드
    const Q_STORE = DB.STORES.PROD_QUALITY_CHECK;

    // SPC 대상 수치 항목 목록
    const SPC_ITEMS = [
        { key: 'film_under', label: '도막두께(하도)', unit: 'μm' },
        { key: 'film_top',   label: '도막두께(상도)', unit: 'μm' },
        { key: 'gloss',      label: '광택',           unit: 'GU' },
        { key: 'color_l',    label: '색차 △L',        unit: '△L' },
        { key: 'color_a',    label: '색차 △a',        unit: '△a' },
        { key: 'color_b',    label: '색차 △b',        unit: '△b' },
    ];

    // Shewhart 관리도 상수 (n = 서브그룹 크기)
    const CC = {
        2: { A2: 1.880, D3: 0,     D4: 3.267 },
        3: { A2: 1.023, D3: 0,     D4: 2.575 },
        4: { A2: 0.729, D3: 0,     D4: 2.282 },
        5: { A2: 0.577, D3: 0,     D4: 2.115 },
    };

    let _xbarChart = null;
    let _rChart    = null;

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _js  = s => String(s ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');

    // ── 헬퍼 ────────────────────────────────────────────────────
    function _carOptions(sel) {
        const cars = [...new Set((Storage.getAll(DB.STORES.PRODUCTS)||[]).map(p=>p.carModel).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
        return cars.map(c=>`<option value="${_esc(c)}" ${c===sel?'selected':''}>${_esc(c)}</option>`).join('');
    }
    function _partOptions(car, sel) {
        const products = Storage.getAll(DB.STORES.PRODUCTS)||[];
        const workParts = (Storage.getAll(DB.STORES.PAINTING_WORK)||[]).filter(w=>!car||w.carModel===car).map(w=>w.partName);
        const parts = [...new Set([...products.filter(p=>!car||p.carModel===car).map(p=>p.partName),...workParts].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
        return '<option value="">전체</option>'+parts.map(p=>`<option value="${_esc(p)}" ${p===sel?'selected':''}>${_esc(p)}</option>`).join('');
    }
    function _itemOptions(sel) {
        return SPC_ITEMS.map(i=>`<option value="${i.key}" ${i.key===sel?'selected':''}>${i.label}</option>`).join('');
    }
    function _30DaysAgo() {
        const d = new Date(); d.setDate(d.getDate()-30);
        return d.toISOString().slice(0,10);
    }

    // ── render ───────────────────────────────────────────────────
    function render(container) {
        const today = UIUtils.today();
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-outline" onclick="Router.navigate('prod-quality')">
                        <span class="material-symbols-outlined">edit_document</span> 초중종물 작성
                    </button>
                </div>
            </div>

            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">시작일</label>
                    <input type="date" class="form-input" id="spcStart" value="${_30DaysAgo()}">
                </div>
                <div class="form-group">
                    <label class="form-label">종료일</label>
                    <input type="date" class="form-input" id="spcEnd" value="${today}">
                </div>
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="spcCar" onchange="ProdSpcModule._onCarChange()">
                        <option value="">전체</option>${_carOptions('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품명</label>
                    <select class="form-select" id="spcPart">${_partOptions('','')}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">관리항목</label>
                    <select class="form-select" id="spcItem">${_itemOptions('film_under')}</select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-outline" onclick="ProdSpcModule.search()">
                        <span class="material-symbols-outlined">search</span> 조회
                    </button>
                </div>
            </div>

            <div id="spcStats" class="stat-cards" style="margin-bottom:16px;"></div>

            <div class="card" style="margin-bottom:16px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">show_chart</span> X̄ 관리도 (평균)</h4>
                </div>
                <div class="card-body" id="spcXbarWrap" style="min-height:220px;">
                    <canvas id="spcXbarCanvas"></canvas>
                </div>
            </div>

            <div class="card" style="margin-bottom:16px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">show_chart</span> R 관리도 (범위)</h4>
                </div>
                <div class="card-body" id="spcRWrap" style="min-height:220px;">
                    <canvas id="spcRCanvas"></canvas>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">table_chart</span> 측정 데이터 목록</h4>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>No</th><th>날짜</th><th>차종</th><th>품명</th><th>LOT</th><th>라인</th>
                                    <th>초물</th><th>중물</th><th>종물</th>
                                    <th>X̄(평균)</th><th>R(범위)</th><th>판정</th>
                                </tr>
                            </thead>
                            <tbody id="spcTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        search();
    }

    function _onCarChange() {
        const car = document.getElementById('spcCar')?.value || '';
        const sel = document.getElementById('spcPart');
        if (sel) sel.innerHTML = _partOptions(car, '');
    }

    // ── search / render charts ───────────────────────────────────
    function search() {
        const start   = document.getElementById('spcStart')?.value  || '';
        const end     = document.getElementById('spcEnd')?.value    || '';
        const car     = document.getElementById('spcCar')?.value    || '';
        const part    = document.getElementById('spcPart')?.value   || '';
        const itemKey = document.getElementById('spcItem')?.value   || 'film_under';
        const meta    = SPC_ITEMS.find(i=>i.key===itemKey) || SPC_ITEMS[0];

        // ── 초중종물 레코드에서 실측값 자동 수집 ──────────────────
        const allRecs = Storage.getAll(Q_STORE) || [];
        const filtered = allRecs.filter(r => {
            // 템플릿 제외, 실제 발행 레코드만
            if (r._docKind === 'quality_template') return false;
            if (start && r.date < start) return false;
            if (end   && r.date > end)   return false;
            if (car   && r.carModel !== car)  return false;
            if (part  && r.partName !== part) return false;
            // 해당 항목에 실측값이 있는 레코드만
            const hit = (r.items||[]).find(i => i.key === itemKey);
            return hit && hit.vals && Object.keys(hit.vals).length > 0;
        }).sort((a,b) => a.date.localeCompare(b.date) || (a.id > b.id ? 1 : -1));

        // 각 레코드의 서브그룹 통계 계산
        const points = filtered.map(r => {
            const hit   = (r.items||[]).find(i => i.key === itemKey);
            const types = r.types && r.types.length ? r.types : ['초물','중물','종물'];
            // types 순서대로 vals 배열 구성
            const vals  = types.map(t => hit.vals[t]).filter(v => v !== undefined && v !== null && !isNaN(Number(v))).map(Number);
            if (!vals.length) return null;
            const xbar  = vals.reduce((s,v)=>s+v,0)/vals.length;
            const rv    = vals.length > 1 ? Math.max(...vals)-Math.min(...vals) : 0;
            return {
                id:       r.id,
                date:     r.date,
                carModel: r.carModel||'',
                partName: r.partName||'',
                lot:      r.lotNo||'',
                line:     r.line||'',
                types,
                vals,
                xbar,
                rv
            };
        }).filter(Boolean);

        _renderStats(points, meta);
        _renderCharts(points, meta);
        _renderTable(points, meta);
    }

    function _calcLimits(points) {
        if (!points.length) return null;
        const n = Math.round(points.reduce((s,p)=>s+p.vals.length,0)/points.length);
        const cn = CC[Math.min(5,Math.max(2,n))] || CC[3];
        const xbars = points.map(p=>p.xbar);
        const rs    = points.map(p=>p.rv);
        const xGrand = xbars.reduce((s,v)=>s+v,0)/xbars.length;
        const rBar   = rs.reduce((s,v)=>s+v,0)/rs.length;
        return {
            n, cn,
            UCL_x: xGrand + cn.A2 * rBar,
            CL_x:  xGrand,
            LCL_x: xGrand - cn.A2 * rBar,
            UCL_r: cn.D4 * rBar,
            CL_r:  rBar,
            LCL_r: cn.D3 * rBar,
            xGrand, rBar
        };
    }

    function _renderStats(points, meta) {
        const el = document.getElementById('spcStats');
        if (!el) return;
        if (!points.length) {
            el.innerHTML = `<div class="empty-state" style="width:100%;padding:24px;">
                <span class="material-symbols-outlined" style="font-size:36px;color:var(--text-muted);">bar_chart_off</span>
                <p>조회 조건에 해당하는 데이터가 없습니다.</p></div>`;
            return;
        }
        const L = _calcLimits(points);
        const outX = points.filter(p=>p.xbar>L.UCL_x||p.xbar<L.LCL_x).length;
        const outR = points.filter(p=>p.rv>L.UCL_r).length;
        const oot  = outX + outR;

        // 표준편차(σ) 추정 = R̄ / d2  (d2는 subgroup 크기별)
        const d2 = { 2:1.128, 3:1.693, 4:2.059, 5:2.326 };
        const sigma = d2[Math.min(5,Math.max(2,L.n))] ? L.rBar / d2[Math.min(5,Math.max(2,L.n))] : null;

        el.innerHTML = `
            <div class="stat-card"><div class="stat-icon"><span class="material-symbols-outlined">data_usage</span></div>
                <div class="stat-info"><div class="stat-value">${points.length}</div><div class="stat-label">측정 포인트</div></div></div>
            <div class="stat-card"><div class="stat-icon"><span class="material-symbols-outlined">straighten</span></div>
                <div class="stat-info"><div class="stat-value">${L.xGrand.toFixed(2)}</div><div class="stat-label">전체 평균 X̄̄ (${meta.unit})</div></div></div>
            <div class="stat-card"><div class="stat-icon"><span class="material-symbols-outlined">swap_vert</span></div>
                <div class="stat-info"><div class="stat-value">${L.rBar.toFixed(2)}</div><div class="stat-label">평균 범위 R̄ (${meta.unit})</div></div></div>
            ${sigma!==null?`<div class="stat-card"><div class="stat-icon"><span class="material-symbols-outlined">sigma</span></div>
                <div class="stat-info"><div class="stat-value">${sigma.toFixed(3)}</div><div class="stat-label">추정 표준편차 σ̂</div></div></div>`:''}
            <div class="stat-card ${oot>0?'stat-card-danger':'stat-card-success'}">
                <div class="stat-icon"><span class="material-symbols-outlined">${oot>0?'warning':'check_circle'}</span></div>
                <div class="stat-info"><div class="stat-value">${oot}</div><div class="stat-label">관리 이탈 포인트</div></div></div>
            <div class="stat-card">
                <div class="stat-icon"><span class="material-symbols-outlined">rule</span></div>
                <div class="stat-info">
                    <div class="stat-value" style="font-size:0.9rem;">UCL: ${L.UCL_x.toFixed(2)}</div>
                    <div class="stat-label">X̄ 관리 한계 / LCL: ${L.LCL_x.toFixed(2)}</div>
                </div>
            </div>`;
    }

    function _renderCharts(points, meta) {
        if (_xbarChart) { _xbarChart.destroy(); _xbarChart = null; }
        if (_rChart)    { _rChart.destroy();    _rChart    = null; }

        const xbarWrap = document.getElementById('spcXbarWrap');
        const rWrap    = document.getElementById('spcRWrap');

        if (!points.length) {
            if (xbarWrap) xbarWrap.innerHTML = `<div class="empty-state" style="padding:40px;"><span class="material-symbols-outlined">bar_chart_off</span><p>데이터가 없습니다.</p></div>`;
            if (rWrap)    rWrap.innerHTML    = '';
            return;
        }

        // 캔버스 재생성 (destroy 후 dom 재삽입)
        if (xbarWrap) xbarWrap.innerHTML = '<canvas id="spcXbarCanvas" style="max-height:280px;"></canvas>';
        if (rWrap)    rWrap.innerHTML    = '<canvas id="spcRCanvas"    style="max-height:240px;"></canvas>';

        const xbarCanvas = document.getElementById('spcXbarCanvas');
        const rCanvas    = document.getElementById('spcRCanvas');
        if (!xbarCanvas || !rCanvas) return;

        const L      = _calcLimits(points);
        const labels = points.map((p,i)=>`${i+1}. ${(p.date||'').slice(5)}${p.lot?' ('+p.lot+')':''}`);
        const xbars  = points.map(p=> +p.xbar.toFixed(3));
        const rs     = points.map(p=> +p.rv.toFixed(3));

        const lineOpts = (color, dash=[]) => ({
            borderColor: color, borderDash: dash, borderWidth: 1.5,
            pointRadius: 0, fill: false
        });
        const chartOpts = {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 14 } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
                y: { ticks: { font: { size: 10 } } }
            }
        };

        _xbarChart = new Chart(xbarCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `X̄ (${meta.label}) [${meta.unit}]`,
                        data: xbars,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.07)',
                        pointRadius: 4,
                        pointBackgroundColor: xbars.map((v,i) =>
                            (points[i].xbar > L.UCL_x || points[i].xbar < L.LCL_x) ? '#ef4444' : '#3b82f6'),
                        tension: 0.15
                    },
                    { label: `UCL (${L.UCL_x.toFixed(3)})`, data: Array(labels.length).fill(+L.UCL_x.toFixed(3)), ...lineOpts('#ef4444',[6,3]) },
                    { label: `CL  (${L.CL_x.toFixed(3)})`,  data: Array(labels.length).fill(+L.CL_x.toFixed(3)),  ...lineOpts('#10b981',[4,4]) },
                    { label: `LCL (${L.LCL_x.toFixed(3)})`, data: Array(labels.length).fill(+L.LCL_x.toFixed(3)), ...lineOpts('#ef4444',[6,3]) }
                ]
            },
            options: { ...chartOpts }
        });

        const rDatasets = [
            {
                label: 'R (범위)',
                data: rs,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139,92,246,0.07)',
                pointRadius: 4,
                pointBackgroundColor: rs.map((v,i) => points[i].rv > L.UCL_r ? '#ef4444' : '#8b5cf6'),
                tension: 0.15
            },
            { label: `UCL (${L.UCL_r.toFixed(3)})`, data: Array(labels.length).fill(+L.UCL_r.toFixed(3)), ...lineOpts('#ef4444',[6,3]) },
            { label: `CL  (${L.CL_r.toFixed(3)})`,  data: Array(labels.length).fill(+L.CL_r.toFixed(3)),  ...lineOpts('#10b981',[4,4]) }
        ];
        if (L.LCL_r > 0) {
            rDatasets.push({ label: `LCL (${L.LCL_r.toFixed(3)})`, data: Array(labels.length).fill(+L.LCL_r.toFixed(3)), ...lineOpts('#ef4444',[6,3]) });
        }

        _rChart = new Chart(rCanvas, {
            type: 'line',
            data: { labels, datasets: rDatasets },
            options: { ...chartOpts }
        });
    }

    function _renderTable(points, meta) {
        const tbody = document.getElementById('spcTableBody');
        if (!tbody) return;
        if (!points.length) {
            tbody.innerHTML = `<tr><td colspan="12" class="empty-cell">
                초중종물 관리에서 수치 항목(도막두께·광택·색차)의 측정값을 입력하면 여기에 자동으로 표시됩니다.
            </td></tr>`;
            return;
        }
        const L = _calcLimits(points);
        tbody.innerHTML = points.map((p,i) => {
            const outX  = p.xbar > L.UCL_x || p.xbar < L.LCL_x;
            const outR  = p.rv   > L.UCL_r;
            const out   = outX || outR;
            const rowSt = out ? 'background:rgba(239,68,68,0.05);' : '';
            // 초물/중물/종물 셀 (최대 3개, 부족하면 '-')
            const vCells = [0,1,2].map(j => {
                const v = p.vals[j];
                return `<td style="text-align:right;">${v!==undefined ? v.toFixed(2) : '-'}</td>`;
            }).join('');
            return `<tr style="${rowSt}">
                <td>${points.length-i}</td>
                <td>${_esc(p.date||'')}</td>
                <td>${_esc(p.carModel||'')}</td>
                <td>${_esc(p.partName||'')}</td>
                <td style="font-family:monospace;font-size:0.8rem;">${_esc(p.lot||'-')}</td>
                <td>${_esc(p.line||'-')}</td>
                ${vCells}
                <td style="text-align:right;${outX?'color:#ef4444;font-weight:600;':''}">${p.xbar.toFixed(3)}</td>
                <td style="text-align:right;${outR?'color:#ef4444;font-weight:600;':''}">${p.rv.toFixed(3)}</td>
                <td><span class="badge ${out?'badge-danger':'badge-success'}">${out?'이탈':'정상'}</span></td>
            </tr>`;
        }).join('');
    }

    // ── 내보내기 ─────────────────────────────────────────────────
    function exportData() {
        const start   = document.getElementById('spcStart')?.value  || '';
        const end     = document.getElementById('spcEnd')?.value    || '';
        const car     = document.getElementById('spcCar')?.value    || '';
        const part    = document.getElementById('spcPart')?.value   || '';
        const itemKey = document.getElementById('spcItem')?.value   || 'film_under';
        const meta    = SPC_ITEMS.find(i=>i.key===itemKey) || SPC_ITEMS[0];

        const allRecs = Storage.getAll(Q_STORE) || [];
        const filtered = allRecs.filter(r => {
            if (r._docKind === 'quality_template') return false;
            if (start && r.date < start) return false;
            if (end   && r.date > end)   return false;
            if (car   && r.carModel !== car)  return false;
            if (part  && r.partName !== part) return false;
            const hit = (r.items||[]).find(i => i.key === itemKey);
            return hit && hit.vals && Object.keys(hit.vals).length > 0;
        }).sort((a,b) => a.date.localeCompare(b.date));

        const headers = ['날짜','관리항목','단위','차종','품명','LOT','라인','초물','중물','종물','X̄(평균)','R(범위)'];
        const rows = filtered.map(r => {
            const hit   = (r.items||[]).find(i => i.key === itemKey);
            const types = r.types && r.types.length ? r.types : ['초물','중물','종물'];
            const vals  = types.map(t => hit.vals[t] ?? '');
            const numVals = vals.map(v => v !== '' ? Number(v) : NaN).filter(v => !isNaN(v));
            const xbar  = numVals.length ? (numVals.reduce((s,v)=>s+v,0)/numVals.length).toFixed(3) : '';
            const rv    = numVals.length > 1 ? (Math.max(...numVals)-Math.min(...numVals)).toFixed(3) : '';
            return [r.date, meta.label, meta.unit, r.carModel||'', r.partName||'', r.lotNo||'', r.line||'',
                    vals[0]??'', vals[1]??'', vals[2]??'', xbar, rv];
        });
        Storage.exportToCSV(headers, rows, `SPC_${meta.label}`);
    }

    return {
        render,
        search,
        _onCarChange,
        exportData
    };
})();

/**
 * 폐수처리 계획 및 실적 (WastewaterModule)
 * 연 2~3회 계획 단위, 월별 계획일/폐수량 + 실적일/폐수량 관리
 */
var WastewaterModule = (function () {
    const ST_PLAN = DB.STORES.WASTEWATER_PLAN;
    const ST_LOG  = DB.STORES.WASTEWATER_LOG;

    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    let _year  = new Date().getFullYear();
    let _planId = null;

    // ── 진입점 ─────────────────────────────────────────────────────
    function render(container) {
        _year = new Date().getFullYear();
        _planId = null;
        _renderMain(container);
    }

    // 설비관리 탭 내부에서 호출될 때 사용
    function _renderInTab(el) {
        _year = _year || new Date().getFullYear();
        _renderMain(el);
    }

    function _renderMain(container) {
        const plans = _plansForYear(_year);
        const yearOpts = _yearRange().map(y =>
            `<option value="${y}" ${y===_year?'selected':''}>${y}년</option>`).join('');

        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header" style="margin-bottom:12px;">
                <div class="page-header-left">
                    <h3 style="margin:0;font-size:1.1rem;">폐수처리 계획 및 실적</h3>
                    <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-secondary);">연 2~3회 계획 단위로 월별 폐수처리 날짜 및 폐수량을 관리합니다.</p>
                </div>
                <div class="page-actions" style="display:flex;gap:8px;align-items:center;">
                    <select class="form-select" id="wwYear" style="width:100px;"
                        onchange="WastewaterModule._onYearChange(this.value)">${yearOpts}</select>
                    <button class="btn btn-primary" onclick="WastewaterModule.openPlanModal()">
                        <span class="material-symbols-outlined">add</span> 계획 등록
                    </button>
                </div>
            </div>

            <div id="wwPlanList"></div>
        </div>`;

        _renderPlanList(document.getElementById('wwPlanList'), plans);
    }

    function _renderPlanList(el, plans) {
        if (!plans.length) {
            el.innerHTML = `<div class="empty-state" style="padding:60px 0;">
                <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);">water_drop</span>
                <p style="color:var(--text-secondary);margin-top:12px;">${_year}년 폐수처리 계획이 없습니다.<br>상단 [계획 등록] 버튼으로 추가하세요.</p>
            </div>`;
            return;
        }

        el.innerHTML = plans.map(p => _renderPlanCard(p)).join('');
    }

    function _renderPlanCard(plan) {
        const logs  = _logsForPlan(plan.id);
        const round = plan.round;
        const colors = ['var(--accent-blue)','var(--accent-green)','var(--accent-orange,#f59e0b)'];
        const color = colors[(round - 1) % colors.length];

        const totalPlan   = logs.reduce((s,l) => s + (Number(l.planAmount)||0), 0);
        const totalActual = logs.reduce((s,l) => s + (Number(l.actualAmount)||0), 0);
        const doneCnt     = logs.filter(l => l.actualDate).length;

        const rowsHtml = MONTHS.map((mLabel, mi) => {
            const m   = mi + 1;
            const log = logs.find(l => l.month === m);
            const lid = log ? log.id : '';
            return `
            <tr>
                <td style="font-weight:500;width:52px;">${mLabel}</td>
                <td>
                    <input type="date" class="form-input" style="width:130px;font-size:0.82rem;"
                        value="${log?.planDate||''}"
                        onchange="WastewaterModule.saveLog('${plan.id}',${m},'planDate',this.value,'${lid}')">
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" class="form-input" style="width:90px;font-size:0.82rem;text-align:right;"
                            placeholder="0" min="0" value="${log?.planAmount||''}"
                            onchange="WastewaterModule.saveLog('${plan.id}',${m},'planAmount',this.value,'${lid}')">
                        <span style="font-size:0.78rem;color:var(--text-muted);">L</span>
                    </div>
                </td>
                <td>
                    <input type="date" class="form-input" style="width:130px;font-size:0.82rem;"
                        value="${log?.actualDate||''}"
                        onchange="WastewaterModule.saveLog('${plan.id}',${m},'actualDate',this.value,'${lid}')">
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" class="form-input" style="width:90px;font-size:0.82rem;text-align:right;"
                            placeholder="0" min="0" value="${log?.actualAmount||''}"
                            onchange="WastewaterModule.saveLog('${plan.id}',${m},'actualAmount',this.value,'${lid}')">
                        <span style="font-size:0.78rem;color:var(--text-muted);">L</span>
                    </div>
                </td>
                <td>
                    <input type="text" class="form-input" style="width:160px;font-size:0.82rem;"
                        placeholder="비고" value="${log?.note||''}"
                        onchange="WastewaterModule.saveLog('${plan.id}',${m},'note',this.value,'${lid}')">
                </td>
            </tr>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;
                         border-left:4px solid ${color};padding-left:16px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span class="material-symbols-outlined" style="color:${color};font-size:20px;">water_drop</span>
                    <div>
                        <h4 style="margin:0;font-size:0.95rem;font-weight:600;">${plan.year}년 ${plan.round}차 폐수처리</h4>
                        ${plan.manager ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">담당: ${plan.manager}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;margin-left:16px;">
                        <span class="badge badge-info" style="font-size:0.75rem;">계획 ${totalPlan.toLocaleString()} L</span>
                        <span class="badge ${totalActual>0?'badge-success':'badge-secondary'}" style="font-size:0.75rem;">실적 ${totalActual.toLocaleString()} L</span>
                        <span class="badge badge-warning" style="font-size:0.75rem;">완료 ${doneCnt}/12</span>
                    </div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-xs btn-outline" onclick="WastewaterModule.openPlanModal('${plan.id}')">수정</button>
                    <button class="btn btn-xs btn-danger"  onclick="WastewaterModule.deletePlan('${plan.id}')">삭제</button>
                </div>
            </div>
            <div class="card-body" style="padding:0;overflow-x:auto;">
                <table class="data-table" style="min-width:700px;">
                    <thead>
                        <tr>
                            <th style="width:52px;">월</th>
                            <th>계획일</th>
                            <th>계획 폐수량</th>
                            <th>실적일</th>
                            <th>실적 폐수량</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                    <tfoot>
                        <tr style="background:var(--bg-secondary);font-weight:600;">
                            <td>합계</td>
                            <td>-</td>
                            <td style="text-align:right;padding-right:12px;">${totalPlan.toLocaleString()} L</td>
                            <td>-</td>
                            <td style="text-align:right;padding-right:12px;">${totalActual.toLocaleString()} L</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            ${plan.note ? `<div style="padding:8px 16px;font-size:0.8rem;color:var(--text-muted);border-top:1px solid var(--border-color);">메모: ${plan.note}</div>` : ''}
        </div>`;
    }

    // ── 계획 모달 ──────────────────────────────────────────────────
    function openPlanModal(id) {
        const p = id ? Storage.getById(ST_PLAN, id) : null;
        const cy = new Date().getFullYear();
        const yearOpts = _yearRange().map(y =>
            `<option value="${y}" ${(p?.year||_year)===y?'selected':''}>${y}년</option>`).join('');
        const roundOpts = [1,2,3].map(r =>
            `<option value="${r}" ${(p?.round||1)===r?'selected':''}>${r}차</option>`).join('');

        const body = `
        <div style="display:flex;flex-direction:column;gap:14px;">
            <div class="form-group">
                <label class="form-label">연도</label>
                <select class="form-select" id="wwPYear">${yearOpts}</select>
            </div>
            <div class="form-group">
                <label class="form-label">회차</label>
                <select class="form-select" id="wwPRound">${roundOpts}</select>
            </div>
            <div class="form-group">
                <label class="form-label">담당자</label>
                <input type="text" class="form-input" id="wwPManager" value="${p?.manager||''}" placeholder="담당자명">
            </div>
            <div class="form-group">
                <label class="form-label">메모</label>
                <textarea class="form-input" id="wwPNote" rows="2" style="resize:vertical;"
                    placeholder="특이사항, 허가 번호 등">${p?.note||''}</textarea>
            </div>
        </div>`;

        UIUtils.showModal(id ? '계획 수정' : '폐수처리 계획 등록', body, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="WastewaterModule.savePlan('${id||''}')">저장</button>`, 'sm');
    }

    async function savePlan(id) {
        const year    = parseInt(document.getElementById('wwPYear')?.value)  || _year;
        const round   = parseInt(document.getElementById('wwPRound')?.value) || 1;
        const manager = (document.getElementById('wwPManager')?.value || '').trim();
        const note    = (document.getElementById('wwPNote')?.value    || '').trim();

        // 중복 체크
        const exists = (Storage.getAll(ST_PLAN)||[]).find(p =>
            p.year === year && p.round === round && p.id !== id);
        if (exists) {
            UIUtils.toast(`${year}년 ${round}차 계획이 이미 존재합니다.`, 'error'); return;
        }

        const data = { year, round, manager, note };
        if (id) {
            await Storage.update(ST_PLAN, { id, ...data });
            UIUtils.toast('계획이 수정되었습니다.', 'success');
        } else {
            await Storage.add(ST_PLAN, data);
            UIUtils.toast('계획이 등록되었습니다.', 'success');
        }
        UIUtils.closeModal();
        _year = year;
        const root = document.getElementById('equipMainContent') || document.getElementById('contentArea');
        _renderMain(root);
    }

    async function deletePlan(id) {
        if (!confirm('이 계획과 모든 월별 실적을 삭제하시겠습니까?')) return;
        await Storage.delete(ST_PLAN, id);
        const logs = (Storage.getAll(ST_LOG)||[]).filter(l => l.planId === id);
        for (const l of logs) await Storage.delete(ST_LOG, l.id);
        UIUtils.toast('삭제되었습니다.', 'success');
        const root = document.getElementById('equipMainContent') || document.getElementById('contentArea');
        _renderMain(root);
    }

    // ── 월별 로그 인라인 저장 ─────────────────────────────────────
    async function saveLog(planId, month, field, value, existingId) {
        month = parseInt(month);
        const allLogs = Storage.getAll(ST_LOG) || [];
        let log = allLogs.find(l => l.planId === planId && l.month === month);

        if (field === 'planAmount' || field === 'actualAmount') {
            value = value === '' ? null : Number(value);
        }

        if (log) {
            log[field] = value;
            await Storage.update(ST_LOG, log);
        } else {
            const newLog = { planId, month };
            newLog[field] = value;
            await Storage.add(ST_LOG, newLog);
        }
        _refreshSummary(planId);
    }

    function _refreshSummary(planId) {
        const plan  = Storage.getById(ST_PLAN, planId);
        if (!plan) return;
        const logs  = _logsForPlan(planId);
        const totalPlan   = logs.reduce((s,l) => s + (Number(l.planAmount)||0), 0);
        const totalActual = logs.reduce((s,l) => s + (Number(l.actualAmount)||0), 0);
        const doneCnt     = logs.filter(l => l.actualDate).length;

        // 배지 업데이트
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            const btn = card.querySelector(`button[onclick*="${planId}"]`);
            if (!btn) return;
            const badges = card.querySelectorAll('.badge');
            if (badges.length >= 3) {
                badges[0].textContent = `계획 ${totalPlan.toLocaleString()} L`;
                badges[1].textContent = `실적 ${totalActual.toLocaleString()} L`;
                badges[1].className   = `badge ${totalActual>0?'badge-success':'badge-secondary'}`;
                badges[2].textContent = `완료 ${doneCnt}/12`;
            }
            // tfoot 합계 업데이트
            const tfoot = card.querySelector('tfoot tr');
            if (tfoot) {
                const cells = tfoot.querySelectorAll('td');
                if (cells[2]) cells[2].textContent = totalPlan.toLocaleString() + ' L';
                if (cells[4]) cells[4].textContent = totalActual.toLocaleString() + ' L';
            }
        });
    }

    // ── 헬퍼 ───────────────────────────────────────────────────────
    function _plansForYear(year) {
        return (Storage.getAll(ST_PLAN)||[])
            .filter(p => p.year === year)
            .sort((a,b) => a.round - b.round);
    }

    function _logsForPlan(planId) {
        return (Storage.getAll(ST_LOG)||[]).filter(l => l.planId === planId);
    }

    function _yearRange() {
        const cy = new Date().getFullYear();
        return [cy-1, cy, cy+1];
    }

    function _onYearChange(val) {
        _year = parseInt(val);
        const plans = _plansForYear(_year);
        _renderPlanList(document.getElementById('wwPlanList'), plans);
    }

    return {
        render,
        _renderInTab,
        openPlanModal,
        savePlan,
        deletePlan,
        saveLog,
        _onYearChange
    };
})();












