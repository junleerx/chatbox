// Optional Firebase config. Fill with your project values to enable cloud sync.
// If left as-is, the app works in local mode (no cloud).
//
// Steps:
// 1) Firebase 콘솔 → 프로젝트 생성
// 2) 실시간 데이터베이스(Realtime Database) 활성화 (테스트 규칙으로 시작)
// 3) 웹 앱 추가 → 아래 설정을 복사해 FIREBASE_CONFIG에 붙여넣기

// window.FIREBASE_CONFIG = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT.firebaseapp.com",
//   databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
//   projectId: "YOUR_PROJECT",
//   storageBucket: "YOUR_PROJECT.appspot.com",
//   messagingSenderId: "",
//   appId: ""
// };


// Optional Firebase config. Fill with your project values to enable cloud sync.
// If left as-is, the app works in local mode (no cloud).
//
// Steps:
// 1) Firebase 콘솔 → 프로젝트 생성
// 2) 실시간 데이터베이스(Realtime Database) 활성화 (테스트 규칙으로 시작)
// 3) 웹 앱 추가 → 아래 설정을 복사해 FIREBASE_CONFIG에 붙여넣기

window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyDn2HVQDkx11MCHJT80df7yiOxpTKHx7hU",
    authDomain: "chat-49d8d.firebaseapp.com",
    databaseURL: "https://chat-49d8d-default-rtdb.firebaseio.com",
    projectId: "chat-49d8d",
    storageBucket: "chat-49d8d.firebasestorage.app", // 참고: 이 앱에서는 storageBucket을 사용하지 않을 수 있지만, 일반적인 구성이므로 유지합니다.
    messagingSenderId: "846282870967", // messagingSenderId, appId도 모두 채워 넣습니다.
    appId: "1:846282870967:web:88fc68a0d1d0874415bd32"
};