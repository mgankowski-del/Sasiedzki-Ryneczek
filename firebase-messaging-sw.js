importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Pełna konfiguracja zgodnie z sugestią z GitHub
const firebaseConfig = {
    apiKey: "AIzaSyD_cuGXokb55W6W4aB-QkV0c_jAqXkJQgk",
    authDomain: "sasiedzki-ryneczek.firebaseapp.com",
    projectId: "sasiedzki-ryneczek",
    storageBucket: "sasiedzki-ryneczek.firebasestorage.app",
    messagingSenderId: "885991041208",
    appId: "1:885991041208:web:3df60bebb747b563f86c4d"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Tło powiadomień
messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Wiadomość w tle:', payload);
    const notificationTitle = payload.notification.title || "Ryneczek: Nowa wiadomość";
    const notificationOptions = {
        body: payload.notification.body || "Sprawdź szczegóły w aplikacji.",
        icon: '/apple-touch-icon.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});