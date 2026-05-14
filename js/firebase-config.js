(function() {
  // Firebase 설정 (Firebase 콘솔에서 복사)
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD9t8t43QJSKot-H7t-XVzGeL-TQdRGbOA",
    authDomain: "mes-production-37019.firebaseapp.com",
    projectId: "mes-production-37019",
    storageBucket: "mes-production-37019.firebasestorage.app",
    messagingSenderId: "717031202296",
    appId: "1:717031202296:web:97875472bbe33be5188a0d",
    measurementId: "G-JK21793F1E"
  };

  const FirebaseConfig = (function() {
    let db = null;
    let auth = null;
    let initialized = false;

    /**
     * Firebase SDK 로드 대기 (CDN 방식)
     */
    async function waitForFirebaseSDK() {
      const maxAttempts = 100;
      let attempts = 0;

      while (!window.firebase && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.firebase) {
        console.error('❌ Firebase SDK 로드 실패');
        console.error('window.firebase:', window.firebase);
        console.error('시도 횟수:', attempts);
        throw new Error('Firebase SDK가 로드되지 않았습니다. CDN 연결을 확인하세요.\n1. 인터넷 연결 확인\n2. 브라우저 개발자 도구 → Network 탭에서 firebase SDK 로드 상태 확인\n3. 방화벽/안티바이러스가 CDN을 차단하지 않는지 확인');
      }

      console.log('[Firebase] SDK 로드 완료 (시도 횟수:', attempts, ')');
    }

    /**
     * Firebase 초기화
     * Storage.init()에서 호출됨
     */
    async function init() {
      if (initialized) {
        console.log('[Firebase] 이미 초기화됨');
        return { db, auth };
      }

      try {
        // Firebase SDK 로드 대기
        await waitForFirebaseSDK();

        // Firebase 앱 초기화
        const app = firebase.initializeApp(FIREBASE_CONFIG);
        console.log('[Firebase] 앱 초기화 완료');

        // Firestore 참조
        // CDN에서 로드한 Firebase SDK는 firebase.firestore()로 접근
        db = firebase.firestore();

        // 옵션: 오프라인 지속성 활성화
        // await db.enablePersistence();
        // console.log('[Firebase] 오프라인 지속성 활성화');

        initialized = true;
        console.log('[Firebase] 초기화 완료:', FIREBASE_CONFIG.projectId);
        return { db, auth };
      } catch (error) {
        console.error('[Firebase] 초기화 실패:', error);
        throw new Error(`Firebase 초기화 실패: ${error.message}`);
      }
    }

    /**
     * Firestore 인스턴스 반환
     */
    function getDb() {
      if (!initialized) {
        throw new Error('Firebase가 아직 초기화되지 않았습니다. Storage.init()을 먼저 호출하세요.');
      }
      return db;
    }

    /**
     * Firebase 활성화 여부 확인
     */
    function isEnabled() {
      return initialized;
    }

    /**
     * 설정 정보 반환 (디버깅용)
     */
    function getConfig() {
      return {
        projectId: FIREBASE_CONFIG.projectId,
        initialized: initialized
      };
    }

    return {
      init,
      getDb,
      isEnabled,
      getConfig
    };
  })();

  // 전역 객체에 노출
  window.FirebaseConfig = FirebaseConfig;

  console.log('[Firebase] config 모듈 로드됨');
})();
