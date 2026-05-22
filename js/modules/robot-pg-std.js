/**
 * 로봇 프로그램 기준서 (Robot Program Standard)
 * 페이지: robot-pg-std
 * DB 스토어: robot_pg_std_data
 * A라인(Robot 1~6) / B라인(Robot 1~4) 두 탭으로 구성
 */
var RobotPgStdModule = (function () {
    'use strict';

    const STORE = DB.STORES.ROBOT_PG_STD_DATA;
    const KEY   = 'ROBOT_PG_STD';

    // ── 상태 ────────────────────────────────────────────────────────────
    let _data      = null;   // 전체 데이터 객체
    let _line      = 'A';   // 현재 탭 ('A' | 'B')
    let _container = null;
    let _dirty     = false;

    // ── 기본 데이터 ─────────────────────────────────────────────────────
    function _defaultData() {
        return {
            id:       KEY,
            docNoA:   'KC-P-작업-A',
            docNoB:   'KC-P-작업-11',
            revA:     '2026.01',
            revB:     '2025.03.05',
            descA:    'A라인 도장 로봇, 컨트롤러번호 표준표',
            descB:    'B라인 도장 로봇, 컨트롤러번호 표준표',
            history: [
                { no:'1', date:'2019.11.01', content:'최초 제정' },
                { no:'2', date:'2025.03.05', content:'프로그램 추가 (RIVIAN, C223)' }
            ],
            lineA: { rows: _defaultRowsA() },
            lineB: { rows: _defaultRowsB() }
        };
    }

    // A라인 초기 데이터 (Excel PROGRAM_A 기준, Robot 1~6)
    function _r(id, car, part, r1p,r1c,r1s, r2p,r2c,r2s, r3p,r3c,r3s, r4p,r4c,r4s, r5p,r5c,r5s, r6p,r6c,r6s) {
        return { id, car:car||'', part:part||'',
            r1p:r1p||'', r1c:r1c||'', r1s:r1s||'',
            r2p:r2p||'', r2c:r2c||'', r2s:r2s||'',
            r3p:r3p||'', r3c:r3c||'', r3s:r3s||'',
            r4p:r4p||'', r4c:r4c||'', r4s:r4s||'',
            r5p:r5p||'', r5c:r5c||'', r5s:r5s||'',
            r6p:r6p||'', r6c:r6c||'', r6s:r6s||'' };
    }

    // B라인 초기 데이터 (Excel PROGRAM_B(11) 기준, Robot 1~4, Spindle+Driver)
    function _rb(id, car, part, r1p,r1c,r1s,r1d, r2p,r2c,r2s,r2d, r3p,r3c,r3s,r3d, r4p,r4c,r4s,r4d) {
        return { id, car:car||'', part:part||'',
            r1p:r1p||'', r1c:r1c||'', r1s:r1s||'', r1d:r1d||'',
            r2p:r2p||'', r2c:r2c||'', r2s:r2s||'', r2d:r2d||'',
            r3p:r3p||'', r3c:r3c||'', r3s:r3s||'', r3d:r3d||'',
            r4p:r4p||'', r4c:r4c||'', r4s:r4s||'', r4d:r4d||'' };
    }

    function _defaultRowsA() {
        return [
            _r('a01','GOLF-7','KNOB',           'GOLF','GOLF',1400,   'GOLF','GOLF',1400,   'GOLF','DYS',1400,    'GOLF','DYS',1400,    'GOLF','DYS',1400,    'GOLF','DYS',1400),
            _r('a02','','',                      '','','',             '','','',             '','WHI','',          '','WHI','',          '','WHI','',          '','WHI',''),
            _r('a03','A3','A3, Q2 KNOB',         'A3 High knob','A3 HIGH',1400, 'A3 High knob','A3 HIGH',1400, 'A3 High knob','A3HI-6PS',1400, 'A3 High knob','A3HI-6PS',1400, 'A3 High knob','A3HI-6PS',1400, 'A3 High knob','A3HI-6PS',1400),
            _r('a04','','',                      '','A3 BC','',        '','A3 BC','',        '','A3BC-6PS','',     '','A3BC-6PS','',     '','A3BC-6PS','',     '','A3BC-6PS',''),
            _r('a05','','',                      '','A3 LOW','',       '','A3 LOW','',       '','A3LO-6PS','',     '','A3LO-6PS','',     '','A3LO-6PS','',     '','A3LO-6PS',''),
            _r('a06','','',                      '','A3 HIGH','',      '','A3 HIGH','',      'A3 High knob','A3HI-GR','', 'A3 High knob','A3HI-GR','', 'A3 High knob','A3HI-GR','', 'A3 High knob','A3HI-GR',''),
            _r('a07','','',                      '','A3 BC','',        '','A3 BC','',        '','A3BC-GR','',      '','A3BC-GR','',      '','A3BC-GR','',      '','A3BC-GR',''),
            _r('a08','','',                      '','A3 LOW','',       '','A3 LOW','',       '','A3LO-GR','',      '','A3LO-GR','',      '','A3LO-GR','',      '','A3LO-GR',''),
            _r('a09','','PA KNOBS',              'A3 PA High knob','PA 6PS',1400, 'A3 PA High knob','PA 6PS',1400, 'A3 PA High knob','PA 6PS',1400, 'PA High knob','PA 6PS',1400, 'PA High knob','PA 6PS',1400, 'PA High knob','PA 6PS',1400),
            _r('a10','','',                      '','PA AZ3','',       '','PA AZ3','',       '','PA AZ3','',       '','PA AZ3','',       '','PA AZ3','',       '','PA AZ3',''),
            _r('a11','','PAO',                   'A3 - PAO','A3 PAO',1000, 'A3 - PAO','A3 PAO',1000, 'A3 - PAO','PAO 6PS',1000, 'A3 - PAO','PAO 6PS',1000, 'A3 - PAO','PAO 6PS',1000, 'A3 - PAO','PAO 6PS',1000),
            _r('a12','','',                      '','','',             '','','',             '','PAO AZ3','',      '','PAO AZ3','',      '','PAO AZ3','',      '','PAO AZ3',''),
            _r('a13','','',                      '','','',             '','','',             '','PAO BC5','',      '','PAO BC5','',      '','PAO BC5','',      '','PAO BC5',''),
            _r('a14','','',                      '','','',             '','','',             '','PAO ET1','',      '','PAO ET1','',      '','PAO ET1','',      '','PAO ET1',''),
            _r('a15','','ECALL',                 'PA ecall','PA ecall',500, 'PA ecall','PA ecall',500, 'PA ecall','PA ecall',500, 'PA ecall','PA ecall',500, 'PA ecall','PA ecall',500, 'PA ecall','PA ecall',500),
            _r('a16','XFD','1spot',              'XFD knob','1SPOT',1400, 'XFD knob','1SPOT',1400, 'XFD knob','1SPOT BK',1400, 'XFD knob','1SPOT BK',1400, 'XFD knob','1SPOT BK',1400, 'XFD knob','1SPOT BK',1400),
            _r('a17','','',                      '','','',             '','','',             '','1SPOT GR','',     '','1SPOT GR','',     '','1SPOT GR','',     '','1SPOT GR',''),
            _r('a18','','3spot',                 'XFD seesaw','3SPOT',1400, 'XFD seesaw','3SPOT',1400, 'XFD seesaw','3SPOT BK',1400, 'XFD seesaw','3SPOT BK',1400, 'XFD seesaw','3SPOT BK',1400, 'XFD seesaw','3SPOT BK',1400),
            _r('a19','','',                      '','','',             '','','',             '','3SPOT GR','',     '','3SPOT GR','',     '','3SPOT GR','',     '','3SPOT GR',''),
            _r('a20','T1XX','LENS',              'T1xx lens','T1XXLENS',1000, 'T1XX LENS','T1XXLENS',1000, 'T1xx lens','T1XXLENS',1000, 'T1xx lens','T1XXLENS',1000, '','','', '','',''),
            _r('a21','','P-BUTTON',              'T1xx park','PBUTTON',1400, 'T1XX PARK','PBUTTON',1400, 'T1xx park','PBUTTON',1400, 'T1xx park','PBUTTON',1400, '','','', '','',''),
            _r('a22','','UMBRELLA',              'T1xx-UMBRELLA','UMBRELLA',500, 'T1xx-UMBRELLA','UMBRELLA',500, 'T1xx-UMBRELLA','UMBRELLA',500, 'T1xx-UMBRELLA','UMBRELLA',500, '','','', '','',''),
            _r('a23','','KNOB LOWER',            'T1xx-LOWER','LOWER',500, 'T1xx-LOWER','LOWER',500, 'T1xx-LOWER','LOWER',500, 'T1xx-LOWER','LOWER',500, 'T1xx-LOWER','LOWER','', '','',''),
            _r('a24','','COVER SIDE',            'T1xx-SIDE COVER','SIDE COVER',500, 'T1xx-SIDE COVER','SIDE COVER',500, 'T1xx-SIDE COVER','SIDE COVER',500, 'T1xx-SIDE COVER','SIDE COVER',500, '','','', '','',''),
            _r('a25','GM','Emblem',              'Emblem','Emblem',500, 'Emblem','Emblem',500, 'Emblem','Emblem',500, 'Emblem','Emblem',500, 'Emblem','Emblem',500, 'Emblem','Emblem',500),
            _r('a26','RVIN','Side bezel',        'Side bezel','Side bezel',500, 'Side bezel','Side bezel',500, 'Side bezel','Side bezel',500, 'Side bezel','Side bezel',500, '','','', '','',''),
            _r('a27','J34A','KNOB',              'J34A','J34AKNOB',1400, 'J34A','J34AKNOB',1400, 'J34A','J34KN-BK',1400, 'J34A','J34KN-BK',1400, 'J34A','J34KN-BK',1400, 'J34A','J34KN-BK',1400),
            _r('a28','','',                      '','','',             '','','',             '','J34KN-GR','',     '','J34KN-GR','',     '','J34KN-GR','',     '','J34KN-GR',''),
            _r('a29','P702','LENS',              'P702-LENS','p702-lens',1000, 'P702-LENS','p702-lens',1000, 'P702-LENS','p702-lens',1000, 'P702-LENS','p702-lens',1000, 'P702-LENS','p702-lens',1000, 'P702-LENS','p702-lens',1000),
            _r('a30','','BUTTON',                'P702-BUTTON','p702-button',1400, 'P702-BUTTON','p702-button',1400, 'P702-BUTTON','p702-button',1400, 'P702-BUTTON','p702-button',1400, 'P702-BUTTON','p702-button',1400, 'P702-BUTTON','p702-button',1400)
        ];
    }

    function _defaultRowsB() {
        return [
            _rb('b01','A8','HOUSING',            'X','',null,null,    'X','',null,null,    'A8-housing','A8 HOU 1PH',350,350, 'A8-housing','A8 HOU 1PH',350,350),
            _rb('b02','','',                      '','',null,null,    '','',null,null,    '','A8 HOU 6PS',null,null, '','A8 HOU 6PS',null,null),
            _rb('b03','','UPPER',                 'X','',null,null,    'X','',null,null,    'A8 -upper','A8 UPPER 1PH',350,350, 'A8 -upper','A8 UPPER 1PH',350,350),
            _rb('b04','','',                      '','',null,null,    '','',null,null,    'A8 -upper(6PS)','A8 UPPER 6PS',null,null, 'A8 -upper(6PS)','A8 UPPER 6PS',null,null),
            _rb('b05','','LOWER',                 'X','',null,null,    'X','',null,null,    'A8- LOWER','A8 LOW IPH',350,350, 'A8- LOWER','A8 LOW IPH',350,350),
            _rb('b06','','',                      '','',null,null,    '','',null,null,    'A8 -LOWER(6PS)','A8 LOW 6PS',null,null, 'A8 -LOWER(6PS)','A8 LOW 6PS',null,null),
            _rb('b07','','Bezel',                 'X','',350,350,     'BEZEL','A8 BEZEL',350,350, 'X','',350,350, 'X','',350,350),
            _rb('b08','T1xx','lens',              'T1-LE-UV-27','T,LENS UV',350,350, 'T1-LE-UV-27','T,LENS UV',350,350, 'T1-LE-UV-27','T,LENS UV',350,350, 'X','',null,null),
            _rb('b09','','P',                     'T1-PB-27','T.P,UV',350,350, 'T1-PB-27','T.P,UV',350,350, 'T1-PB-27','T.P,UV',350,350, '','',null,null),
            _rb('b10','','IL',                    'T1 IL','T,IL UV',350,350, 'T1 IL','T,IL UV',350,350, 'T1 IL','T,IL UV',350,350, 'T1 IL','T,IL UV',350,350),
            _rb('b11','T1xx CROME','DECO 1',      'T1-DECO-1','DECO1',350,350, 'T1-DECO-1','DECO1',350,350, 'T1-DECO-1','DECO1',350,350, 'T1-DECO-1','DECO1',350,350),
            _rb('b12','','DECO 2',                'T1-DECO-2','DECO2',350,350, 'T1-DECO-2','DECO2',350,350, 'T1-DECO-2','DECO2',350,350, 'T1-DECO-2','DECO2',350,350),
            _rb('b13','','DECO 3',                'T1-DECO-3','DECO3',300,300, 'T1-DECO-3','DECO3',300,300, 'T1-DECO-3','DECO3',300,300, 'X','',null,null),
            _rb('b14','','LINER',                 'T1-LINER','LINER',300,300, 'T1-LINER','LINER',300,300, 'T1-LINER','LINER',300,300, 'X','',null,null),
            _rb('b15','BT1xx CROME','DECO 1',     'T1-DECO-1','BT1-DECO1',350,350, 'T1-DECO-1','BT1-DECO1',350,350, 'T1-DECO-1-G','BT1-DECO1',350,350, 'T1-DECO-1','BT1-DE1',350,350),
            _rb('b16','','DECO 2',                'T1-DECO-2','BT1-DECO2',350,350, 'T1-DECO-2','BT1-DECO2',350,350, 'T1-DECO-2-G','BT1-DECO2',350,350, 'T1-DECO-2','BT1-DE2',350,350),
            _rb('b17','','DECO 3',                'T1-DECO-3','BT1-DECO3',300,300, 'T1-DECO-3','BT1-DECO3',300,300, 'T1-DECO-3-G','BT1-DECO3',300,300, 'T1-DECO-3-G','BT1-DE3',300,300),
            _rb('b18','','LINER',                 'T1-LINER','BT1 LINE',300,300, 'T1-LINER','BT1 LINE',300,300, 'BT1-LINER-G','BT1-LINE',300,300, 'BT1-LINER-G','BT1-LIN',300,300),
            _rb('b19','T1XX','KNOB LOWER',        'T1xx-LOWER','LOWER',300,300, 'T1xx-LOWER','LOWER',300,300, 'T1xx-LOWER','LOWER',300,300, 'T1xx-LOWER','LOWER',300,300),
            _rb('b20','P702','LENS',              'P702-PRND','PRND',350,350, 'P702-PRND','PRND',350,350, 'P702-PRND','PRND',350,350, 'P702-PRND','PRND',350,350),
            _rb('b21','C223','DECO-KNOB',         'C223-DECO-KNOB','DECO KNOB',350,350, 'C223-DECO-KNOB','DECO KNOB',350,350, 'C223-DECO-KNOB','DECO KNOB',350,350, 'C223-DECO-KNOB','DECO KNOB',350,350),
            _rb('b22','','HOR',                   'C223-HOL','C223-HOL',300,300, 'C223-HOL','C223-HOL',300,300, 'C223-HOL','C223-HOL',300,300, 'C223-HOL','C223-HOL',300,300),
            _rb('b23','','X-VANE',                'C223-X','X VANE',350,350, 'C223-X','X VANE',350,350, 'C223-X','X VANE',350,350, 'C223-X','X VANE',350,350),
            _rb('b24','RIVIAN','TBU RR-FR BACK',  'RRFR 3P','RR-FR',450,450, 'F1-RRFR-3P','RR-FR',450,450, 'F1-RRFR-3P','RR-FR',450,450, 'F1-RRFR-3P','RR-FR',450,450),
            _rb('b25','','TBU FR BACK CAMP',      'FRCAMP 3P','CAMP',450,450, 'R1 RR-FR','CAMP',450,450, 'R1 RR-FR','R1 RR-FR',450,450, 'R1 RR-FR','R1 RR-FR',450,450),
            _rb('b26','','TBU 2ND BACK LH',       'BACK LH/RH','BACK LH',null,null, 'BACK LH/RH','BACK LH',null,null, 'BACK LH/RH','BACK LH',null,null, 'BACK LH/RH','BACK LH',null,null),
            _rb('b27','','TBU 2ND BACK RH',       'BACK LH/RH','BACK RH',null,null, 'BACK LH/RH','BACK RH',null,null, 'BACK LH/RH','BACK RH',null,null, 'BACK LH/RH','BACK RH',null,null),
            _rb('b28','','TBU 2ND LH',            '2ND LH/RH','2ND LH',null,null, '2ND LH/RH','2ND LH',null,null, '2ND LH/RH','2ND LH',null,null, '2ND LH/RH','2ND LH',null,null),
            _rb('b29','','TBU 2ND RH',            '2ND LH/RH','2ND RH',null,null, '2ND LH/RH','2ND RH',null,null, '2ND LH/RH','2ND RH',null,null, '2ND LH/RH','2ND RH',null,null),
            _rb('b30','','BEZEL A/REST(중)',       'A/REST-M','A/REST-M',350,350, 'A/REST-M','A/REST-M',350,350, 'A/REST-M','A/REST-M',350,350, 'A/REST-M','A/REST-M',350,350),
            _rb('b31','','BEZEL A/REST(대)',       'A/REST-L','A/REST-L',450,500, 'A/REST-L','A/REST-L',450,450, 'A/REST-L','A/REST-L',450,450, 'A/REST-L','A/REST-L',450,450)
        ];
    }

    // ── ID 생성 ─────────────────────────────────────────────────────────
    function _uid(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    // ── 로드 / 저장 ─────────────────────────────────────────────────────
    async function _load() {
        const all = Storage.getAll(STORE) || [];
        const found = all.find(r => r.id === KEY);
        _data = found ? found : _defaultData();
    }

    async function _save() {
        if (!_data) return;
        await Storage.put(STORE, _data);
        _dirty = false;
    }

    // ── 유틸 ────────────────────────────────────────────────────────────
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _rows() {
        return _line === 'A' ? _data.lineA.rows : _data.lineB.rows;
    }

    // ── 렌더 ────────────────────────────────────────────────────────────
    async function init() { await _load(); }

    function render(container) {
        _container = container;
        if (!_data) {
            _load().then(() => _renderAll()).catch(err => {
                console.error('[RobotPgStd] load error:', err);
                container.innerHTML = `<div class="empty-state"><p style="color:red;">${err.message}</p></div>`;
            });
        } else {
            _renderAll();
        }
    }

    function _renderAll() {
        if (!_container) return;

        const isA = _line === 'A';
        const docNo  = isA ? _data.docNoA  : _data.docNoB;
        const rev    = isA ? _data.revA    : _data.revB;
        const desc   = isA ? _data.descA   : _data.descB;
        const nRobot = isA ? 6 : 4;

        _container.innerHTML = `
        <div class="fade-in-up">

            <!-- 헤더 카드 -->
            <div class="card" style="margin-bottom:14px;padding:14px 18px;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                        <span class="material-symbols-outlined" style="font-size:28px;color:#7c3aed;">precision_manufacturing</span>
                        <div>
                            <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary);">
                                로봇 프로그램 기준서
                            </div>
                            <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">${_esc(desc)}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                        <div style="font-size:.78rem;color:var(--text-secondary);">
                            <span style="font-weight:700;">문서번호</span>
                            <span id="rpsDocNo" style="margin-left:6px;font-family:monospace;cursor:pointer;border-bottom:1px dashed #94a3b8;"
                                onclick="RobotPgStdModule.editDocInfo()">${_esc(docNo)}</span>
                        </div>
                        <div style="font-size:.78rem;color:var(--text-secondary);">
                            <span style="font-weight:700;">개정일</span>
                            <span id="rpsRev" style="margin-left:6px;font-family:monospace;cursor:pointer;border-bottom:1px dashed #94a3b8;"
                                onclick="RobotPgStdModule.editDocInfo()">${_esc(rev)}</span>
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="RobotPgStdModule.addRow()">
                            <span class="material-symbols-outlined">add</span> 행 추가
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="RobotPgStdModule.saveNow()" id="rpsSaveBtn"
                            style="${_dirty ? '' : 'opacity:.55;'}">
                            <span class="material-symbols-outlined">save</span> 저장
                        </button>
                    </div>
                </div>
            </div>

            <!-- 탭 -->
            <div style="display:flex;gap:0;margin-bottom:0;border-bottom:2px solid var(--border-color);">
                <button onclick="RobotPgStdModule.setLine('A')"
                    style="padding:9px 24px;font-size:.85rem;font-weight:700;border:none;cursor:pointer;
                           border-bottom:3px solid ${isA ? '#7c3aed' : 'transparent'};
                           color:${isA ? '#7c3aed' : 'var(--text-muted)'};background:transparent;">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">robot_2</span>
                    A라인 (Robot 1~6)
                </button>
                <button onclick="RobotPgStdModule.setLine('B')"
                    style="padding:9px 24px;font-size:.85rem;font-weight:700;border:none;cursor:pointer;
                           border-bottom:3px solid ${!isA ? '#7c3aed' : 'transparent'};
                           color:${!isA ? '#7c3aed' : 'var(--text-muted)'};background:transparent;">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">robot_2</span>
                    B라인 (Robot 1~4)
                </button>
            </div>

            <!-- 범례 -->
            <div style="display:flex;align-items:center;gap:14px;padding:8px 4px;font-size:.72rem;color:var(--text-muted);">
                <span><span style="display:inline-block;width:10px;height:10px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>차종 그룹 시작</span>
                <span style="color:#ef4444;font-weight:700;">X</span> = 해당없음 &nbsp;|&nbsp;
                <span>셀 클릭 → 직접 편집 &nbsp;|&nbsp; 행 끝 🗑 = 삭제</span>
                <span style="margin-left:auto;color:var(--accent-blue);font-weight:700;" id="rpsDirtyBadge"
                    style="display:${_dirty ? 'block' : 'none'};">
                    ${_dirty ? '● 저장되지 않은 변경사항' : ''}
                </span>
            </div>

            <!-- 테이블 래퍼 -->
            <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);">
                ${_renderTable(nRobot)}
            </div>

            <!-- 개정이력 -->
            ${_renderHistory()}
        </div>`;
    }

    // ── 테이블 렌더 ──────────────────────────────────────────────────────
    function _renderTable(nRobot) {
        const isA = nRobot === 6;
        const rows = _rows();

        // 차종 그룹 첫 행 판별 (car 값이 있는 행 = 그룹 시작)
        const isGroupHead = rows.map(r => !!r.car);

        // 헤더 HTML
        let th = `
        <table style="border-collapse:collapse;width:100%;min-width:${isA ? 1800 : 1400}px;font-size:.72rem;">
        <colgroup>
            <col style="width:72px;"><col style="width:90px;">
            ${Array.from({length:nRobot}, () =>
                isA ? '<col style="width:110px;"><col style="width:110px;"><col style="width:64px;">'
                    : '<col style="width:110px;"><col style="width:110px;"><col style="width:60px;"><col style="width:60px;">'
            ).join('')}
            <col style="width:36px;">
        </colgroup>
        <thead>
            <tr style="background:#3b0764;color:#fff;">
                <th rowspan="2" style="${_thSt()}border-right:2px solid #6d28d9;">차종</th>
                <th rowspan="2" style="${_thSt()}border-right:2px solid #6d28d9;">품명</th>
                ${Array.from({length:nRobot}, (_,i) => `
                <th colspan="${isA ? 3 : 4}" style="${_thSt()}font-size:.75rem;letter-spacing:.04em;
                    border-right:${i<nRobot-1?'2px':'1px'} solid ${i<nRobot-1?'#6d28d9':'#4c1d95'};">
                    Robot ${i+1}
                    <span style="font-size:.6rem;font-weight:400;opacity:.8;margin-left:4px;">기준 50</span>
                </th>`).join('')}
                <th rowspan="2" style="${_thSt()}background:#1e1b4b;"></th>
            </tr>
            <tr style="background:#4c1d95;color:#e9d5ff;font-size:.65rem;">
                ${Array.from({length:nRobot}, (_,i) => {
                    const br = `border-right:${i<nRobot-1?'2px':'1px'} solid ${i<nRobot-1?'#6d28d9':'#3b0764'};`;
                    return isA
                        ? `<th style="${_thSt(true)}">레이저 프로그램명</th>
                           <th style="${_thSt(true)}">컨트롤러번호</th>
                           <th style="${_thSt(true)}${br}">Spindle<br>4-1</th>`
                        : `<th style="${_thSt(true)}">레이저 프로그램명</th>
                           <th style="${_thSt(true)}">컨트롤러번호</th>
                           <th style="${_thSt(true)}">Spindle<br>4-1</th>
                           <th style="${_thSt(true)}${br}">Driver<br>4-3</th>`;
                }).join('')}
            </tr>
        </thead>
        <tbody>`;

        // 데이터 행
        rows.forEach((row, idx) => {
            const bg = isGroupHead[idx] ? '#faf5ff' : '#fff';
            const leftBdr = isGroupHead[idx] ? 'border-left:3px solid #7c3aed;' : 'border-left:3px solid transparent;';
            th += `<tr data-id="${row.id}" style="background:${bg};" onmouseover="this.style.background='#f3f0ff'" onmouseout="this.style.background='${bg}'">`;

            // 차종 / 품명
            th += _editableTd(row, 'car',  row.car,  `font-weight:700;color:#4c1d95;${leftBdr}`);
            th += _editableTd(row, 'part', row.part, 'border-right:2px solid #ddd6fe;');

            // 로봇별 컬럼
            const robots = isA
                ? ['r1','r2','r3','r4','r5','r6']
                : ['r1','r2','r3','r4'];

            robots.forEach((r, ri) => {
                const brR = ri < nRobot - 1 ? 'border-right:2px solid #ede9fe;' : '';
                if (isA) {
                    th += _editableTd(row, r+'p', row[r+'p'], 'background:#fafafa;');
                    th += _editableTd(row, r+'c', row[r+'c'], '');
                    th += _editableTd(row, r+'s', row[r+'s'], `text-align:center;color:#0891b2;font-weight:700;${brR}`);
                } else {
                    th += _editableTd(row, r+'p', row[r+'p'], 'background:#fafafa;');
                    th += _editableTd(row, r+'c', row[r+'c'], '');
                    th += _editableTd(row, r+'s', row[r+'s'], 'text-align:center;color:#0891b2;font-weight:700;');
                    th += _editableTd(row, r+'d', row[r+'d'], `text-align:center;color:#0891b2;font-weight:700;${brR}`);
                }
            });

            // 삭제 버튼
            th += `<td style="text-align:center;padding:2px;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
                <button title="행 삭제" onclick="RobotPgStdModule.deleteRow('${row.id}')"
                    style="background:none;border:none;cursor:pointer;padding:2px 4px;color:#ef4444;font-size:14px;"
                    onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">
                    <span class="material-symbols-outlined" style="font-size:15px;">delete</span>
                </button>
            </td>`;
            th += '</tr>';
        });

        th += '</tbody></table>';
        return th;
    }

    // 공통 th 스타일
    function _thSt(sub) {
        return `padding:${sub ? '4px 6px' : '7px 8px'};border-bottom:1px solid #6d28d9;text-align:center;font-weight:700;white-space:nowrap;`;
    }

    // 편집 가능 td
    function _editableTd(row, field, val, extraStyle) {
        const v = (val == null || val === '') ? '' : String(val);
        const display = v === '' ? '<span style="color:#cbd5e1;font-size:.68rem;">-</span>' : _esc(v);
        const xStyle  = v === 'X' ? 'color:#ef4444;font-weight:900;' : '';
        return `<td data-id="${row.id}" data-field="${field}"
                    style="padding:4px 6px;border-bottom:1px solid #f1f5f9;cursor:text;vertical-align:middle;
                           white-space:nowrap;${xStyle}${extraStyle||''}"
                    onclick="RobotPgStdModule.startEdit(this,'${row.id}','${field}')"
                    title="클릭하여 편집">${display}</td>`;
    }

    // ── 개정이력 ─────────────────────────────────────────────────────────
    function _renderHistory() {
        const hist = _data.history || [];
        return `
        <div class="card" style="margin-top:14px;padding:14px 18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;">
                    개정 이력
                </div>
                <button class="btn btn-secondary btn-sm" onclick="RobotPgStdModule.addHistory()">
                    <span class="material-symbols-outlined" style="font-size:14px;">add</span> 이력 추가
                </button>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:6px 10px;text-align:center;width:50px;border:1px solid var(--border-color);">No</th>
                        <th style="padding:6px 10px;text-align:center;width:130px;border:1px solid var(--border-color);">개정일</th>
                        <th style="padding:6px 10px;text-align:left;border:1px solid var(--border-color);">개정 내용</th>
                        <th style="padding:6px 10px;text-align:center;width:40px;border:1px solid var(--border-color);"></th>
                    </tr>
                </thead>
                <tbody>
                ${hist.length ? hist.map((h, i) => `
                    <tr>
                        <td style="padding:5px 10px;text-align:center;border:1px solid var(--border-color);">${_esc(h.no)}</td>
                        <td style="padding:5px 10px;text-align:center;border:1px solid var(--border-color);font-family:monospace;">${_esc(h.date)}</td>
                        <td style="padding:5px 10px;border:1px solid var(--border-color);">${_esc(h.content)}</td>
                        <td style="padding:5px 10px;text-align:center;border:1px solid var(--border-color);">
                            <button onclick="RobotPgStdModule.deleteHistory(${i})"
                                style="background:none;border:none;cursor:pointer;color:#ef4444;">
                                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                            </button>
                        </td>
                    </tr>`).join('')
                : '<tr><td colspan="4" style="padding:10px;text-align:center;color:var(--text-muted);border:1px solid var(--border-color);">이력이 없습니다.</td></tr>'}
                </tbody>
            </table>
        </div>`;
    }

    // ── 인라인 편집 ──────────────────────────────────────────────────────
    function startEdit(tdEl, rowId, field) {
        // 이미 input이 있으면 무시
        if (tdEl.querySelector('input')) return;

        const rows = _rows();
        const row  = rows.find(r => r.id === rowId);
        if (!row) return;

        const curVal = row[field] == null ? '' : String(row[field]);
        const isNum  = ['r1s','r1d','r2s','r2d','r3s','r3d','r4s','r4d','r5s','r5d','r6s','r6d'].includes(field);

        tdEl.innerHTML = `<input type="${isNum ? 'number' : 'text'}" value="${_esc(curVal)}"
            style="width:100%;border:none;outline:none;background:#fffbeb;font-size:.72rem;
                   padding:2px 4px;font-weight:${isNum ? '700' : '400'};
                   color:${isNum ? '#0891b2' : 'inherit'};box-shadow:0 0 0 2px #7c3aed inset;"
            onblur="RobotPgStdModule.commitEdit(this,'${rowId}','${field}')"
            onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();this.blur();}"
            onkeyup="if(event.key==='Escape'){RobotPgStdModule.cancelEdit(this,'${rowId}','${field}');}" />`;
        tdEl.querySelector('input').focus();
        tdEl.querySelector('input').select();
    }

    function commitEdit(inputEl, rowId, field) {
        const rows = _rows();
        const row  = rows.find(r => r.id === rowId);
        if (!row) return;

        const isNum = ['r1s','r1d','r2s','r2d','r3s','r3d','r4s','r4d','r5s','r5d','r6s','r6d'].includes(field);
        const raw   = inputEl.value.trim();
        const val   = raw === '' ? '' : (isNum ? (isNaN(Number(raw)) ? raw : Number(raw)) : raw);

        row[field] = val;
        _dirty = true;

        // 셀 다시 그리기
        const tdEl = inputEl.parentElement;
        const v = (val == null || val === '') ? '' : String(val);
        tdEl.innerHTML = v === ''
            ? '<span style="color:#cbd5e1;font-size:.68rem;">-</span>'
            : _esc(v);
        if (v === 'X') { tdEl.style.color = '#ef4444'; tdEl.style.fontWeight = '900'; }

        // 저장 버튼 하이라이트
        const btn = document.getElementById('rpsSaveBtn');
        if (btn) btn.style.opacity = '1';
        const badge = document.getElementById('rpsDirtyBadge');
        if (badge) badge.textContent = '● 저장되지 않은 변경사항';

        _save(); // 자동저장
    }

    function cancelEdit(inputEl, rowId, field) {
        const rows = _rows();
        const row  = rows.find(r => r.id === rowId);
        const tdEl = inputEl.parentElement;
        const v    = row ? (row[field] == null ? '' : String(row[field])) : '';
        tdEl.innerHTML = v === ''
            ? '<span style="color:#cbd5e1;font-size:.68rem;">-</span>'
            : _esc(v);
    }

    // ── 행 추가 / 삭제 ───────────────────────────────────────────────────
    function addRow() {
        const rows = _rows();
        const isA  = _line === 'A';
        let newRow;
        if (isA) {
            newRow = _r(_uid('a'),'','',  '','','',  '','','',  '','','',  '','','',  '','','',  '','','');
        } else {
            newRow = _rb(_uid('b'),'','',  '','','','',  '','','','',  '','','','',  '','','','');
        }
        rows.push(newRow);
        _dirty = true;
        _save();
        _renderAll();
        // 스크롤 맨 아래
        setTimeout(() => {
            const wrap = _container.querySelector('[style*="overflow-x"]');
            if (wrap) wrap.scrollTop = wrap.scrollHeight;
        }, 50);
    }

    function deleteRow(id) {
        if (!confirm('이 행을 삭제하시겠습니까?')) return;
        const lineData = _line === 'A' ? _data.lineA : _data.lineB;
        lineData.rows = lineData.rows.filter(r => r.id !== id);
        _dirty = true;
        _save();
        _renderAll();
    }

    // ── 탭 전환 ──────────────────────────────────────────────────────────
    function setLine(line) {
        if (_dirty) { _save(); }
        _line = line;
        _renderAll();
    }

    // ── 문서정보 편집 ────────────────────────────────────────────────────
    function editDocInfo() {
        const isA   = _line === 'A';
        const docNo = isA ? _data.docNoA : _data.docNoB;
        const rev   = isA ? _data.revA   : _data.revB;
        const desc  = isA ? _data.descA  : _data.descB;

        UIUtils.openModal({
            title: '문서 정보 수정',
            body: `
            <div class="form-group">
                <label class="form-label">문서번호</label>
                <input class="form-input" id="rpiDocNo" value="${_esc(docNo)}" placeholder="예: KC-P-작업-A" />
            </div>
            <div class="form-group">
                <label class="form-label">개정일</label>
                <input class="form-input" id="rpiRev" value="${_esc(rev)}" placeholder="예: 2025.03.05" />
            </div>
            <div class="form-group">
                <label class="form-label">설명</label>
                <input class="form-input" id="rpiDesc" value="${_esc(desc)}" placeholder="문서 설명" />
            </div>`,
            buttons: [
                { label:'저장', class:'btn-primary', onClick: () => {
                    const dn = document.getElementById('rpiDocNo').value.trim();
                    const rv = document.getElementById('rpiRev').value.trim();
                    const ds = document.getElementById('rpiDesc').value.trim();
                    if (isA) { _data.docNoA = dn; _data.revA = rv; _data.descA = ds; }
                    else     { _data.docNoB = dn; _data.revB = rv; _data.descB = ds; }
                    _dirty = true;
                    _save();
                    _renderAll();
                    UIUtils.closeModal();
                }},
                { label:'취소', class:'btn-secondary', onClick: () => UIUtils.closeModal() }
            ]
        });
    }

    // ── 개정이력 추가 / 삭제 ─────────────────────────────────────────────
    function addHistory() {
        UIUtils.openModal({
            title: '개정이력 추가',
            body: `
            <div class="form-group">
                <label class="form-label">No</label>
                <input class="form-input" id="rhNo" value="${(_data.history||[]).length + 1}" />
            </div>
            <div class="form-group">
                <label class="form-label">개정일</label>
                <input class="form-input" id="rhDate" value="${UIUtils.today()}" placeholder="예: 2025.03.05" />
            </div>
            <div class="form-group">
                <label class="form-label">개정 내용</label>
                <input class="form-input" id="rhContent" placeholder="변경 내용 입력" />
            </div>`,
            buttons: [
                { label:'추가', class:'btn-primary', onClick: () => {
                    if (!_data.history) _data.history = [];
                    _data.history.push({
                        no:      document.getElementById('rhNo').value.trim(),
                        date:    document.getElementById('rhDate').value.trim(),
                        content: document.getElementById('rhContent').value.trim()
                    });
                    _dirty = true;
                    _save();
                    _renderAll();
                    UIUtils.closeModal();
                }},
                { label:'취소', class:'btn-secondary', onClick: () => UIUtils.closeModal() }
            ]
        });
    }

    function deleteHistory(idx) {
        if (!confirm('이 이력을 삭제하시겠습니까?')) return;
        _data.history.splice(idx, 1);
        _dirty = true;
        _save();
        _renderAll();
    }

    // ── 수동 저장 ────────────────────────────────────────────────────────
    async function saveNow() {
        await _save();
        UIUtils.toast('저장되었습니다.', 'success');
        _renderAll();
    }

    // ── Public API ───────────────────────────────────────────────────────
    return {
        init,
        render,
        setLine,
        addRow,
        deleteRow,
        startEdit,
        commitEdit,
        cancelEdit,
        editDocInfo,
        addHistory,
        deleteHistory,
        saveNow
    };
})();
