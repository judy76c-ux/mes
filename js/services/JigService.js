/**
 * Jig 사용 이력을 관리하는 서비스 레이어 (JigService)
 * 역할: 데이터베이스 접근 로직을 캡슐화하여, 상위 모듈이 DB의 복잡한 CRUD 및 계산 로직에 직접 노출되는 것을 막습니다.
 * NOTE: 이 서비스는 js/db.js에 정의된 DB 객체(DB)를 전역적으로 참조한다고 가정합니다.
 * 
 * ===============================================================
 * [Service Definition: JigService]
 * ===============================================================
 */
const JigService = (function() {
    
    const STORES = {
        JIG_USAGE_HISTORY: 'zig_usage_history',
        JIG_STATUS_MASTER: 'jig_status_master', // 지그별 마스터 상태를 위한 가상 스토어 (추후 추가)
        PRODUCT_INVENTORY: 'product_inventory' // 비교를 위한 기존 스토어
    };

    /**
     * 1. 지그 사용 이력 기록 (핵심 트랜잭션)
     * @param {string} jigId - Jig의 고유 ID
     * @param {string} sourceModule - 사용을 촉발한 모듈 (e.g., 'painting')
     * @param {number} unitsUsed - 이번 사용에서 소비된 수량 (1회 또는 배치 수량)
     * @param {string} equipmentId - 사용된 설비 ID
     * @returns {Promise<object>} 성공 시 기록된 이력 객체 반환
     * @throws {Error} 이미 기록된 이력이 있거나 유효성 검사 실패 시
     */
    async function recordUsage(jigId, sourceModule, unitsUsed, equipmentId = '') {
        // 1. 데이터 유효성 검증
        if (!jigId) throw new Error("Jig ID가 필수입니다.");
        if (unitsUsed <= 0) throw new Error("사용 수량은 0보다 커야 합니다.");
        
        const usageData = {
            id: Crypto.generateId(), // (가상의 ID 생성 함수 사용)
            useId: jigId,
            date: new Date().toISOString().substring(0, 10), // YYYY-MM-DD
            sourceModule: sourceModule,
            equipmentId: equipmentId,
            unitsUsed: unitsUsed
        };
        
        // 2. DB 기록 (Commit Point)
        // DB.save는 유효성 검사를 수행함.
        try {
            const newHistory = await DB.save(STORES.JIG_USAGE_HISTORY, usageData);
            return newHistory;
        } catch (e) {
            console.error(`[JigService] 사용 이력 기록 실패 (${e.message})`, e);
            throw new Error(`DB에 사용 이력을 저장할 수 없습니다. ${e.message}`);
        }
    }
    
    /**
     * 2. 지그의 전체 사용 이력을 조회하고, 총 사용량과 남은 수명을 계산합니다.
     * @param {string} jigId - 조회할 Jig ID
     * @returns {Promise<{totalUnitsUsed: number, usageRecords: Array}>} 총 사용량과 이력 목록
     */
    async function getUsageSummary(jigId) {
        // 1. Usage History 로드
        const records = await DB.getByIndex(STORES.JIG_USAGE_HISTORY, 'sourceModule', jigId); // sourceModule로 검색 가정
        
        let totalUnitsUsed = 0;
        const usageRecords = [];
        
        // 기록된 모든 이력에서 사용량 합산
        records.forEach(record => {
            totalUnitsUsed += record.unitsUsed;
            usageRecords.push(record);
        });

        // 2. 수명 계산 로직 (TODO: 이 부분에 마스터 수명 데이터가 필요함)
        // 현재는 가상으로 1000개를 최대 수명으로 가정하고 계산합니다.
        const MAX_LIFESPAN = 1000; 
        const remainingLife = MAX_LIFESPAN - totalUnitsUsed;
        
        return {
            totalUnitsUsed: totalUnitsUsed,
            usageRecords: usageRecords,
            remainingLife: remainingLife,
            // TODO: 교체 주기 알림 로직 (예: remainingLife < 100 일 경우 경고)
        };
    }
    
    /**
     * 3. 지그의 상태를 파악하고, 교체 주기가 도래했는지 검사합니다.
     * @param {string} jigId
     * @returns {object} 진단 결과 (현재 상태, 다음 액션 권고 등)
     */
    async function checkJigStatus(jigId) {
        const summary = await getUsageSummary(jigId);
        
        const status = "정상";
        let warning = null;
        
        if (summary.remainingLife <= 0) {
            status = "교체 필요 (EOL)";
            warning = "잔여 수명이 바닥났습니다. 즉시 교체/정비가 필요합니다.";
        } else if (summary.remainingLife < 100) {
            status = "경고 (Caution)";
            warning = "남은 수명이 적습니다. 곧 점검이 필요합니다.";
        }
        
        return {
            jigId: jigId,
            status: status,
            details: `누적 사용량: ${summary.totalUnitsUsed}개 / 총 수명: 1000개`,
            warning: warning,
            lastUsage: summary.usageRecords.length > 0 ? `최근 사용일: ${summary.usageRecords[summary.usageRecords.length - 1].date}` : '사용 이력 없음'
        };
    }

    // --- Public API ---
    return {
        recordUsage: recordUsage,
        getUsageSummary: getUsageSummary,
        checkJigStatus: checkJigStatus
    };

})();

// NOTE: DB 객체는 외부에서 주입되거나 전역적으로 접근 가능한 형태로 가정합니다.
// global scope에서 `DB` 객체가 사용 가능해야 합니다.
// 이 서비스 모듈은 JS/서비스스에 등록되어야 하며, 상위 모듈은 이 객체의 메서드를 호출합니다.

/**
 * 내부 Crypto ID 생성 함수 (실제 코드에 맞게 수정 필요)
 * 이 예제에서는 단순 임의 값을 반환합니다.
 */
global.Crypto = {
    generateId: () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
};


/**
 * 외부에서 사용할 함수 (Export)
 */
// module.exports = JigService; // 기존 방식에 맞게 수출
// 또는 직접 전역 변수로 노출:
window.JigService = JigService;