/**
 * 도장 공정 모듈 (Painting Module)
 * 모듈 ID: painting
 * 기능: 공정 입고, 작업 추적, 최종 검사 후 출고까지의 전 과정 관리
 */
(function() {
    // 반드시 IIFE 패턴을 따릅니다.
    
    const MODULE_NAME = 'painting';
    let currentPaintingJobId = null;
    
    /**
     * 🎨 공정 작업 완료 및 최종 데이터 확정화 (핵심 로직)
     * 이 함수는 공정 데이터가 최종적으로 '진행' 상태에서 '완료' 상태로 변경될 때 호출되어야 합니다.
     * @param {object} invoice - 공정별 진행 현황이 담긴 전체 인보이스 데이터 객체
     * @param {string} finalStatus - 최종 확정된 상태 ('합격', '불합격', '보류' 등)
     * @param {number} unitsTransacted - 해당 트랜잭션(Job)에서 처리된 제품의 최종 수량
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async function finalizePaintingWork(invoice, finalStatus, unitsTransacted) {
        // 1. 공정별 데이터 유효성/무결성 검사 (필수)
        if (!finalStatus) throw new Error("도장 공정 완료를 위해 최종 상태가 필수입니다.");
        if (typeof unitsTransacted !== 'number' || unitsTransacted < 0) throw new Error("처리된 수량(unitsTransacted)이 유효하지 않습니다.");
        // ... (생략: 기존의 공정 데이터 검증 로직) ...

        // 2. 공정 상태 변경 로직 (DB 저장)
        await Storage.updateStatus(invoice.jobId, finalStatus);
        console.log(`[Painting] 공정 상태가 ${finalStatus}으로 업데이트되었습니다. ID: ${invoice.jobId}`);


        // ===================================================
        // [JIG LOGIC INSERTION POINT: TODO 4 완료]
        // 공정이 성공적으로 확정(Finalize)되었으므로, Jig 사용량을 기록합니다.
        // ==========================================================
        try {
            // 1. Jig ID 추출 (도장 공정 Job 데이터에서 Jig ID를 얻는 로직이 필요함)
            // 여기서는 임시로 invoice의 'defaultJigId' 필드에서 가져옵니다.
            const jigId = invoice.defaultJigId || 'UNKNOWN-JIG'; 
            
            // 2. JigService 호출을 통한 사용 기록
            const result = await JigService.recordUsage(
                jigId,
                'painting', // 원천 모듈 지정: 도장 공정
                unitsTransacted,
                'PaintingLine' // 사용 설비 ID (하드코딩된 임시 값)
            );
            console.log(`[Painting] Jig 사용 기록 성공: ID=${result.id}, 사용량=${unitsTransacted}개`);

        } catch (e) {
            // 시스템 에러(DB write 실패, IDService 실패 등)는 로깅으로 처리하고, 공정 흐름을 막지 않도록 경고만 합니다.
            console.warn(`[Painting] Jig 사용 기록에 실패했음 (WARN): ${e.message}`);
        }
        
        return { success: true, message: '작업 완료 및 지그 사용량 기록 완료' };
    }

    // ... (나머지 init, render, event handlers) ...

    function init() {
        console.log("[Painting] 도장 모듈 초기화 완료.");
    }
    
    return {
        init: init,
        finalizePaintingWork: finalizePaintingWork
    };
})();

// 이 모듈은 라우터 등록에 사용될 객체를 반환합니다.
window.PaintingModule = {
    init: function() {
        // 실제 초기화 로직 호출
        PaintingModule.init(); 
    },
    // 라우터가 페이지 정보를 가져야 할 때 사용
    status: function() {
        return {
            title: '도장 공정 작업 관리',
            pageId: 'painting-process'
        }
};