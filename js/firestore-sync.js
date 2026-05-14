(function() {
  const FirestoreSync = (function() {
    const MIGRATION_KEY = 'firestore_migration_v1';
    const unsubscribers = []; // 실시간 리스너 정리용
    let isActive = false;

    /**
     * Firestore 마이그레이션 상태 확인 및 실행
     * Storage.init() 중에 호출됨
     */
    async function checkMigration() {
      if (!FirebaseConfig.isEnabled()) {
        console.log('[FirestoreSync] Firebase 비활성화 상태');
        return;
      }

      try {
        // localStorage에서 마이그레이션 상태 확인
        const migrationStatus = localStorage.getItem(MIGRATION_KEY);

        if (migrationStatus) {
          console.log('[FirestoreSync] 마이그레이션 이미 완료:', migrationStatus);
          return;
        }

        console.log('[FirestoreSync] 마이그레이션 시작...');
        await migrateIndexedDBToFirestore();

        // 마이그레이션 완료 기록 (localStorage)
        const timestamp = new Date().toISOString();
        localStorage.setItem(MIGRATION_KEY, timestamp);

        // IndexedDB에도 저장
        await DB.save(DB.STORES.CONFIG, {
          id: MIGRATION_KEY,
          completedAt: timestamp,
          version: 1
        });

        console.log('[FirestoreSync] 마이그레이션 완료');
      } catch (error) {
        console.error('[FirestoreSync] 마이그레이션 실패:', error);
        // 마이그레이션 실패 시 계속 진행 (IndexedDB만 사용)
      }
    }

    /**
     * IndexedDB → Firestore 배치 마이그레이션
     * 모든 스토어의 데이터를 Firestore로 업로드
     */
    async function migrateIndexedDBToFirestore() {
      const db = FirebaseConfig.getDb();
      const storeNames = Object.values(DB.STORES);
      let totalMigrated = 0;

      for (const storeName of storeNames) {
        try {
          const data = await DB.getAll(storeName);

          if (data.length === 0) {
            console.log(`[FirestoreSync] ${storeName}: 데이터 없음`);
            continue;
          }

          // Firestore에 배치 저장 (최대 500개씩)
          let batch = db.batch();
          let batchSize = 0;
          let batchCount = 0;

          for (const doc of data) {
            const docRef = db.collection(storeName).doc(doc.id);
            batch.set(docRef, {
              ...doc,
              syncedAt: new Date().toISOString()
            }, { merge: false });

            batchSize++;

            // 배치 크기 500 도달 시 커밋
            if (batchSize >= 500) {
              await batch.commit();
              console.log(`[FirestoreSync] ${storeName}: ${batchSize}개 저장`);
              batchCount++;
              batchSize = 0;
              // 새 배치 시작
              batch = db.batch();
            }
          }

          // 남은 데이터 커밋
          if (batchSize > 0) {
            await batch.commit();
            console.log(`[FirestoreSync] ${storeName}: 최종 ${batchSize}개 저장`);
            batchCount++;
          }

          totalMigrated += data.length;
          console.log(`[FirestoreSync] ${storeName}: 총 ${data.length}개 항목 마이그레이션 완료 (${batchCount}개 배치)`);
        } catch (error) {
          console.error(`[FirestoreSync] ${storeName} 마이그레이션 실패:`, error);
          // 개별 스토어 실패 시 다음 스토어로 계속 진행
        }
      }

      console.log(`[FirestoreSync] 전체 마이그레이션 완료: ${totalMigrated}개 항목`);
    }

    /**
     * 모든 컬렉션의 실시간 리스너 설정
     * Storage.init() 완료 후 호출됨
     */
    async function setupAllRealtimeListeners() {
      if (!FirebaseConfig.isEnabled()) {
        console.log('[FirestoreSync] 실시간 리스너: Firebase 비활성화');
        return;
      }

      try {
        const storeNames = Object.values(DB.STORES);

        for (const storeName of storeNames) {
          setupRealtimeListener(storeName);
        }

        isActive = true;
        console.log(`[FirestoreSync] 실시간 리스너 설정 완료: ${storeNames.length}개 컬렉션`);
      } catch (error) {
        console.error('[FirestoreSync] 실시간 리스너 설정 실패:', error);
        isActive = false;
      }
    }

    /**
     * 특정 컬렉션의 실시간 리스너 설정
     * 원격 변경 감지 시 로컬 캐시 업데이트
     */
    function setupRealtimeListener(storeName) {
      try {
        const db = FirebaseConfig.getDb();
        const collectionRef = db.collection(storeName);

        const unsubscribe = collectionRef.onSnapshot(
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              const doc = change.doc.data();
              doc.id = change.doc.id; // Firestore 문서 ID 추가

              if (change.type === 'added' || change.type === 'modified') {
                // 원격 변경: 로컬 캐시 업데이트
                syncFromFirestore(storeName, doc);
              } else if (change.type === 'removed') {
                // 원격 삭제: 로컬 캐시에서 제거
                removeFromCache(storeName, doc.id);
              }
            });
          },
          (error) => {
            console.error(`[FirestoreSync] ${storeName} 리스너 오류:`, error);
          }
        );

        unsubscribers.push(unsubscribe);
      } catch (error) {
        console.error(`[FirestoreSync] ${storeName} 리스너 설정 실패:`, error);
      }
    }

    /**
     * Firestore에서 수신한 원격 변경을 로컬 캐시에 반영
     * 충돌 해결: updatedAt 타임스탐프 기반
     */
    function syncFromFirestore(storeName, remoteData) {
      const items = Storage.getAll(storeName);
      const localIndex = items.findIndex(item => item.id === remoteData.id);

      if (localIndex === -1) {
        // 새 문서: 캐시에 추가
        items.push(remoteData);
        console.log(`[FirestoreSync] ${storeName}/${remoteData.id}: 새 항목 추가됨`);
      } else {
        // 기존 문서: 충돌 해결
        const local = items[localIndex];
        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        const remoteTime = new Date(remoteData.updatedAt || remoteData.createdAt).getTime();

        if (remoteTime > localTime) {
          // 원격이 더 최신: 업데이트
          items[localIndex] = remoteData;
          console.log(`[FirestoreSync] ${storeName}/${remoteData.id}: 원격 변경 적용 (${new Date(remoteData.updatedAt).toLocaleString()})`);
        } else if (remoteTime === localTime) {
          // 동일 시점: ID 기반 정렬 (결정론적)
          if (remoteData.id > local.id) {
            items[localIndex] = remoteData;
          }
        }
        // localTime > remoteTime: 로컬 우선 (로컬이 더 최신이면 유지)
      }

      // IndexedDB 백그라운드 저장 (비동기)
      DB.save(storeName, remoteData).catch(err => {
        console.error(`[FirestoreSync] ${storeName}/${remoteData.id} IndexedDB 저장 실패:`, err);
      });

      // UI 갱신 신호 (선택사항)
      notifyStorageChange(storeName);
    }

    /**
     * Firestore에서 수신한 삭제를 로컬 캐시에서 제거
     */
    function removeFromCache(storeName, id) {
      const items = Storage.getAll(storeName);
      const index = items.findIndex(item => item.id === id);

      if (index !== -1) {
        items.splice(index, 1);
        console.log(`[FirestoreSync] ${storeName}/${id}: 항목 삭제됨`);
      }

      // IndexedDB 백그라운드 삭제 (비동기)
      DB.remove(storeName, id).catch(err => {
        console.error(`[FirestoreSync] ${storeName}/${id} IndexedDB 삭제 실패:`, err);
      });

      // UI 갱신 신호 (선택사항)
      notifyStorageChange(storeName);
    }

    /**
     * 저장소 변경 알림 (모듈 자동 갱신용)
     * 나중에 옵저버 패턴 구현 시 사용
     */
    function notifyStorageChange(storeName) {
      // TODO: 옵저버 패턴으로 모듈 자동 갱신
      // 현재는 모듈이 수동으로 search() 호출해야 함
    }

    /**
     * 실시간 리스너 정리 (앱 종료 시)
     */
    function cleanup() {
      unsubscribers.forEach(unsub => unsub());
      unsubscribers.length = 0;
      isActive = false;
      console.log('[FirestoreSync] 리스너 정리 완료');
    }

    /**
     * Firestore에서 마스터 데이터 로드 (다중 컴퓨터 동기화용)
     * 로컬 IndexedDB가 비어있으면 Firestore에서 로드
     */
    async function loadMasterDataFromFirestore() {
      if (!FirebaseConfig.isEnabled()) {
        console.log('[FirestoreSync] 마스터 데이터: Firebase 비활성화');
        return;
      }

      const masterStores = [
        'products',
        'defect_types',
        'paint_materials',
        'injection_materials',
        'raw_materials',
        'operators',
        'inspectors'
      ];

      try {
        const db = FirebaseConfig.getDb();

        for (const storeName of masterStores) {
          // 로컬 데이터 확인 (스토어가 없으면 스킵)
          let localData = [];
          try {
            localData = await DB.getAll(storeName);
          } catch (e) {
            console.log(`[FirestoreSync] ${storeName}: IndexedDB 스토어 없음, 스킵`);
            continue;
          }

          if (localData.length > 0) {
            // 이미 로컬에 데이터 있음
            continue;
          }

          // Firestore에서 로드
          try {
            const snapshot = await db.collection(storeName).get();
            const docs = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

            if (docs.length > 0) {
              // IndexedDB에 저장
              for (const doc of docs) {
                await DB.save(storeName, doc);
              }
              console.log(`[FirestoreSync] ${storeName}: ${docs.length}개 항목 로드됨`);
            }
          } catch (error) {
            console.log(`[FirestoreSync] ${storeName}: Firestore 로드 안 됨 (정상)`, error.message);
          }
        }

        console.log('[FirestoreSync] 마스터 데이터 로드 완료');
      } catch (error) {
        // NotFoundError는 무시 (IndexedDB 스토어 미생성 시 정상)
        if (error && error.name === 'NotFoundError') {
          console.log('[FirestoreSync] 마스터 데이터: 일부 스토어 미생성 (무시)');
        } else {
          console.warn('[FirestoreSync] 마스터 데이터 로드 실패:', error.message);
        }
      }
    }

    /**
     * Firestore 활성화 여부
     */
    function getIsActive() {
      return isActive;
    }

    return {
      checkMigration,
      setupAllRealtimeListeners,
      loadMasterDataFromFirestore,
      cleanup,
      getIsActive,
      // 테스트용
      migrateIndexedDBToFirestore
    };
  })();

  // 전역 객체에 노출
  window.FirestoreSync = FirestoreSync;

  console.log('[FirestoreSync] sync 엔진 로드됨');
})();
